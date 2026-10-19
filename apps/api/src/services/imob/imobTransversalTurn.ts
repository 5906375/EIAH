// Interpretação ESTRUTURADA do turno quanto a capacidades transversais (P10).
//
// Problema que resolve: frases sobre divulgar um imóvel, contratar o Marketing ou convidar alguém eram roteadas por
// alias de entidade ("imóvel" => cadastro, "contrato" => contrato imobiliário), sem considerar o contexto do caso.
//
// O que faz: decompõe o turno em PAPÉIS (agente nomeado, necessidade declarada, verbo de contratação, verbo de convite,
// substantivo de contrato, referência a imóvel, referência explícita a membro do workspace...) e decide a OPERAÇÃO
// combinando papéis com o contexto (há caso vinculado?). Quando os papéis não bastam para distinguir operações (ex.:
// "convidar alguém"), devolve um pedido de esclarecimento em vez de acionar um formulário.
//
// Não é compreensão semântica geral: é um léxico fechado, sem acento e sem LLM. O vocabulário dos AGENTES vem do registro
// de capacidades declaradas (`agents.ts`), então um novo agente governado passa a ser reconhecido ao declarar seus
// termos, sem tocar neste arquivo. Frases fora desse léxico NÃO são interceptadas: seguem o roteamento existente.
// Nada aqui lê banco, habilita agente ou decide autoridade: só interpreta o turno.

import { listCapabilityTurnVocabulary } from "../agentCapabilityVocabulary";

export type TransversalTurnOperation =
  /** Pedir ajuda/divulgação de um imóvel: o resolvedor de capacidades mostra quem pode atender. */
  | "request_capability"
  /** Falar da contratação de um agente especializado (estado ou pedido). */
  | "agent_engagement"
  /** Convite explícito de pessoa ao workspace (orientação; o chat não envia convites). */
  | "invite_person"
  /** "Convidar" sem referente claro: perguntar ao usuário o que ele quer. */
  | "clarify_invite_referent";

export type TransversalTurnNeedRef = Readonly<{ domain: string; capability: string; label: string }>;

export type TransversalTurn = Readonly<{
  operation: TransversalTurnOperation;
  /** Para `agent_engagement`: consulta de estado ("já contratou?") ou pedido ("quero contratar"). */
  engagement?: "status" | "request";
  needs: readonly TransversalTurnNeedRef[];
  /** Agentes (ids canônicos) citados pelo nome ou inferidos pela necessidade declarada. */
  agents: readonly string[];
  /** O usuário citou o agente pelo nome. */
  explicitAgent: boolean;
  /** Papéis reconhecidos, para diagnóstico e testes (nunca exibido ao usuário). */
  roles: readonly string[];
}>;

const tokensOf = (message: string) =>
  message
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

const set = (...values: string[]) => new Set(values);

// Léxico fechado por papel (flexões listadas; sem radicais, para "contrato" não colidir com "contratar").
const ENGAGEMENT_STATUS_TOKENS = set("contratou", "contratado", "contratada", "contratados", "contratei", "ativo", "ativa", "ativado", "ativada", "habilitado", "habilitada", "habilitou", "assinou", "assinado", "ja");
const ENGAGEMENT_REQUEST_TOKENS = set("contratar", "contrate", "contrata", "contratem", "contratarmos", "contratacao", "assinar", "assine", "habilitar", "habilite", "ativar", "ative");
const STATUS_NOUN_TOKENS = set("status", "andamento", "situacao", "estado");
const INVITE_TOKENS = set("convidar", "convide", "convidei", "convidamos", "convite", "convites", "convidado", "convidou");
const EXPLICIT_MEMBER_TOKENS = set("workspace", "usuario", "usuarios", "membro", "membros");
const CONTRACT_NOUN_TOKENS = set("contrato", "contratos", "minuta", "minutas", "aditivo");
const REGISTER_TOKENS = set("cadastrar", "cadastre", "cadastro", "registrar", "registre", "adicionar", "adicione", "incluir", "inclua", "novo", "nova");
const PROPERTY_TOKENS = set("imovel", "imoveis", "apartamento", "apartamentos", "apto", "casa", "casas", "unidade", "unidades", "terreno", "cobertura", "kitnet", "flat", "sala", "loja", "galpao", "lote");

function containsPhrase(tokens: string[], phrase: string) {
  const parts = tokensOf(phrase);
  if (parts.length === 0) return false;
  for (let index = 0; index + parts.length <= tokens.length; index += 1) {
    if (parts.every((part, offset) => tokens[index + offset] === part)) return true;
  }
  return false;
}

export function interpretTransversalTurn(
  input: { message: string; caseBound: boolean },
  vocabulary: ReturnType<typeof listCapabilityTurnVocabulary> = listCapabilityTurnVocabulary(),
): TransversalTurn | null {
  if (typeof input?.message !== "string" || input.message.trim() === "") return null;
  const tokens = tokensOf(input.message);
  if (tokens.length === 0) return null;
  const has = (lexicon: Set<string>) => tokens.some((token) => lexicon.has(token));

  const roles: string[] = [];
  const mentionedAgents = vocabulary.filter((entry) => entry.agentTerms.some((term) => containsPhrase(tokens, term)));
  const declaredNeeds = vocabulary.filter((entry) => entry.needTerms.some((term) => containsPhrase(tokens, term)));
  const engagementStatus = has(ENGAGEMENT_STATUS_TOKENS);
  const engagementRequest = has(ENGAGEMENT_REQUEST_TOKENS);
  const invite = has(INVITE_TOKENS);
  const explicitMember = has(EXPLICIT_MEMBER_TOKENS);
  const contractNoun = has(CONTRACT_NOUN_TOKENS);
  const register = has(REGISTER_TOKENS);
  const property = has(PROPERTY_TOKENS);
  if (mentionedAgents.length > 0) roles.push("agent");
  if (declaredNeeds.length > 0) roles.push("declared_need");
  if (engagementStatus) roles.push("engagement_status");
  if (engagementRequest) roles.push("engagement_request");
  if (invite) roles.push("invite");
  if (explicitMember) roles.push("explicit_workspace_member");
  if (contractNoun) roles.push("contract_noun");
  if (register) roles.push("register");
  if (property) roles.push("property");

  const agentIds = (entries: typeof vocabulary) => Array.from(new Set(entries.map((entry) => entry.agentId)));
  const needRefs = (entries: typeof vocabulary): TransversalTurnNeedRef[] =>
    entries.map((entry) => ({ domain: entry.domain, capability: entry.capability, label: entry.label }));
  const explicitAgent = mentionedAgents.length > 0;

  // 1) Falar da contratação de um agente (nomeado) ou de uma necessidade declarada com verbo de contratação.
  // "Convidar o Marketing" não é convite de pessoa: é pedido de engajar o agente.
  const inviteOfAgent = invite && explicitAgent;
  if ((explicitAgent || (declaredNeeds.length > 0 && !contractNoun)) && (engagementStatus || engagementRequest || inviteOfAgent || has(STATUS_NOUN_TOKENS))) {
    const entries = explicitAgent ? mentionedAgents : declaredNeeds;
    // "status / já contratou / está ativo" = consulta de estado; "contratar / assinar / habilitar" = pedido.
    // O substantivo de estado vence o substantivo "contratação" ("status da contratação" é consulta).
    const status = has(STATUS_NOUN_TOKENS) || (engagementStatus && !engagementRequest && !inviteOfAgent);
    return { operation: "agent_engagement", engagement: status ? "status" : "request", needs: needRefs(entries), agents: agentIds(entries), explicitAgent, roles };
  }

  // 2) Convite: com agente ou contrato na frase não é convite de pessoa. Sem referente explícito, pergunta.
  if (invite && !explicitAgent && !contractNoun) {
    if (explicitMember) return { operation: "invite_person", needs: [], agents: [], explicitAgent: false, roles };
    return { operation: "clarify_invite_referent", needs: [], agents: [], explicitAgent: false, roles };
  }

  // 3) Necessidade declarada (divulgar, campanha...) sobre um imóvel/caso, ou pedido de ajuda a um agente nomeado.
  // "Cadastrar imóvel" e "contrato de divulgação" ficam com os fluxos existentes (cadastro e contrato imobiliário).
  const wantsCapability = declaredNeeds.length > 0 || explicitAgent;
  if (wantsCapability && !(register && !explicitAgent) && !(contractNoun && !explicitAgent)) {
    if (property || input.caseBound || explicitAgent) {
      const entries = explicitAgent ? Array.from(new Set([...mentionedAgents, ...declaredNeeds])) : declaredNeeds;
      return { operation: "request_capability", needs: needRefs(entries), agents: agentIds(entries), explicitAgent, roles };
    }
  }
  return null;
}
