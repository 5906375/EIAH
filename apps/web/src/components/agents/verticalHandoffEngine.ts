import { apiGetChatVerticalRegistry, apiRequestChatVerticalHandoff, type ChatVerticalHandoffResult } from "@/lib/api";
import { syncSessionContext } from "@/state/sessionContextSync";
import { getSession } from "@/state/sessionStore";
import { isValidLogisticaCaseRef, LOGISTICA_ACCESS_MESSAGES, resolveLogisticaCaseToResume } from "./logisticaCaseContextEngine";
import { fetchLogisticaAccess } from "@/features/logistica/logisticaAccess";
import { ACTIVATION_REQUEST_REPLY, verticalActivationCopy, type VerticalActivationSnapshot } from "./verticalActivationEngine";
import { getPublicProductTaxonomyEntryByAnyName } from "@eiah/core/taxonomy/publicProductTaxonomy";

/**
 * Engine do front door (`/app/chat`) para handoff a uma vertical na mesma
 * conversa (ADR-010, etapa C). Decide quando o pedido é operacional do IMOB,
 * pede ao servidor a avaliação governada (`chat.vertical_handoff.v2`,
 * fail-closed) e devolve o texto, o card e os próximos passos já resolvidos.
 * O launcher só renderiza.
 */

export const IMOB_CRM_HANDOFF_REQUEST = {
  verticalId: "imob",
  capabilityId: "crm.forms",
  mode: "requires_write",
} as const;

export type VerticalHandoffRequest = {
  verticalId: string;
  /** Explicit transfers discover a read-only capability from the existing server registry. */
  capabilityId?: string;
  mode: "read_only" | "requires_write" | "critical_action";
};

const normalize = (value: string) =>
  value.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/\s+/g, " ").trim();

/** Nome que o usuário usa → identidade canônica do registry (`vertical.id`); nomes sem alias valem como estão. */
const VERTICAL_ID_ALIASES: Readonly<Record<string, string>> = { logistica: "log" };
export const canonicalVerticalId = (name: string) => VERTICAL_ID_ALIASES[name.trim().toLowerCase()] ?? name.trim().toLowerCase();

/** EIAH transfer intent: a complete command and named target, never an isolated domain word. */
export function resolveExplicitVerticalHandoffRequest(input: string): VerticalHandoffRequest | null {
  const match = /^(?:(?:quero|preciso|vamos) )?(?:mudar|trocar|ir|seguir|voltar) para (?:a |o |vertical )?([a-z][a-z0-9_-]{1,39})[.!]?$/.exec(normalize(input));
  if (!match || match[1] === "core") return null;
  const namedProduct = getPublicProductTaxonomyEntryByAnyName(match[1]);
  if (namedProduct && namedProduct.taxonomyClass !== "vertical") return null;
  return { verticalId: canonicalVerticalId(match[1]), mode: "read_only" };
}

/**
 * Vocabulário declarado da Logística & Comex para ENTRAR na vertical pela conversa (dados, sem regra de roteamento):
 * como a vertical é chamada, como o usuário pede para trabalhar nela e o único caso de uso implementado (devolução de
 * contêiner vazio). Termos sem acento, em minúsculas. Reconhecer NÃO concede instalação, permissão nem acesso: o engine só
 * pede o handoff de leitura, que o servidor avalia (fail-closed).
 */
export const LOGISTICA_ENTRY_VOCABULARY = {
  verticalNames: ["logistica", "logistica e comex", "logistica & comex", "logistica comex"],
  entryVerbs: ["trabalhar", "usar", "utilizar", "acessar", "abrir", "entrar", "ir", "seguir", "comecar", "iniciar"],
  returnCase: {
    requestVerbs: ["consultar", "ver", "acompanhar", "preparar", "organizar", "registrar", "abrir", "iniciar"],
    returnTerms: ["devolucao", "devolver", "devolvo", "retorno"],
    // "Preciso devolver um contêiner vazio": o próprio verbo é o pedido (sem verbo de apoio). Só movimentos de contêiner vazio.
    directVerbs: ["devolver", "retornar"],
    objectTerms: ["conteiner", "container"],
  },
} as const;

const alternation = (terms: readonly string[]) => terms.map((term) => term.replace(/[.*+?^${}()|[\]\\&]/g, "\\$&")).join("|");
const LOGISTICA_NAME = `(?:${alternation(LOGISTICA_ENTRY_VOCABULARY.verticalNames)})`;
const LOGISTICA_ENTRY_PATTERN = new RegExp(
  `^(?:(?:quero|preciso|gostaria de|vamos) )?(?:${alternation(LOGISTICA_ENTRY_VOCABULARY.entryVerbs)}) (?:(?:com|na|no|em|para|a|o) )?(?:(?:a|o) )?(?:(?:vertical|modulo|area) )?(?:de )?${LOGISTICA_NAME}$`,
);
const LOGISTICA_RETURN_PATTERN = new RegExp(
  `^(?:quero|preciso|gostaria de|vamos) (?:${alternation(LOGISTICA_ENTRY_VOCABULARY.returnCase.requestVerbs)}) (?:(?:a|uma|um|o|meu|minha) )?(?:${alternation(LOGISTICA_ENTRY_VOCABULARY.returnCase.returnTerms)})(?: (?:de|do|dos|da))? (?:(?:um|o|meu|minha|a) )?(?:${alternation(LOGISTICA_ENTRY_VOCABULARY.returnCase.objectTerms)})(?:es)?(?: vazios?)?$`,
);

const LOGISTICA_DIRECT_RETURN_PATTERN = new RegExp(
  `^(?:quero|preciso|gostaria de|vamos) (?:${alternation(LOGISTICA_ENTRY_VOCABULARY.returnCase.directVerbs)}) (?:(?:um|o|meu|minha|a) )?(?:${alternation(LOGISTICA_ENTRY_VOCABULARY.returnCase.objectTerms)})(?:es)?(?: vazios?)?$`,
);

/**
 * Pedido CLARO de trabalhar na Logística & Comex. Só frases completas (verbo de intenção + objeto): menção solta,
 * pergunta ("como funciona…?") e frase que também cita o IMOB são ambíguas e não são reconhecidas (estado seguro: o
 * turno segue o fluxo habitual). O resultado é só um pedido de handoff de leitura; nada é instalado nem concedido.
 */
export function resolveLogisticaEntryRequest(input: string): VerticalHandoffRequest | null {
  const text = normalize(input).replace(/[.!]+$/, "").trim();
  if (!text || text.endsWith("?") || /\bimob\b/.test(text)) return null;
  if (LOGISTICA_ENTRY_PATTERN.test(text) || LOGISTICA_RETURN_PATTERN.test(text) || LOGISTICA_DIRECT_RETURN_PATTERN.test(text)) return { verticalId: "log", mode: "read_only" };
  return null;
}

const IMOB_OPERATIONAL_ACTION =
  /\b(cadastr\w*|registr\w*|inclu\w*|adicion\w*|edit\w*|corrig\w*|atualiz\w*|arquiv\w*|encerr\w*|anex\w*|ger\w*|fazer|faca|criar|crie|lancar|lance)\b/;
const IMOB_OPERATIONAL_OBJECT =
  /\b(imove(l|is)|apartamentos?|aptos?|casas?|kitnets?|salas? comercia(l|is)|terrenos?|proprietari[oa]s?|locador(es|a)?|locac(ao|oes)|alugue(l|is)|locatari[oa]s?|inquilin[oa]s?|contratos? de (locacao|venda|compra e venda|aluguel)|minutas?|vistorias?|matriculas?)\b/;

/** Pedido operacional de IMOB (cadastrar, editar, encerrar, anexar, gerar contrato…), não uma pergunta sobre o produto. */
export function isImobOperationalRequest(input: string) {
  const text = normalize(input);
  if (!text || (text.endsWith("?") && /\b(como|o que|quanto|qual|quais|funciona|serve)\b/.test(text))) return false;
  return IMOB_OPERATIONAL_ACTION.test(text) && IMOB_OPERATIONAL_OBJECT.test(text);
}

export const VERTICAL_HANDOFF_CAPABILITY_LABELS: Record<string, string> = {
  "crm.forms": "Cadastros, locações, documentos e contratos",
  "knowledge.search": "Busca na base do IMOB",
  "inventory.preview": "Consulta de imóveis",
  "oraculo.context": "Consulta de contexto de Logística & Comex",
};

/** Nome de apresentação por identidade de vertical (o rótulo vem do registry quando o handoff é permitido). */
export const VERTICAL_DISPLAY_NAMES: Record<string, string> = { imob: "IMOB", log: "Logística & Comex" };
export const verticalDisplayName = (verticalId: string | undefined) => (verticalId ? VERTICAL_DISPLAY_NAMES[verticalId] ?? verticalId.toUpperCase() : "Vertical");

/** Rótulo legível do bloqueio, para o card (o código técnico fica só no snapshot). */
export function verticalHandoffBlockLabel(reasonCode: string) {
  switch (reasonCode) {
    case "VERTICAL_NOT_REGISTERED":
      return "não ativo neste workspace";
    case "VERTICAL_DISABLED":
    case "VERTICAL_ENTITLEMENT_REQUIRED":
      return "ativação pendente";
    case "VERTICAL_SCOPE_DENIED":
      return "sem permissão para a sua função";
    case "VERTICAL_HITL_REQUIRED":
      return "precisa de aprovação humana";
    default:
      return "acesso não confirmado";
  }
}

export type VerticalHandoffPresentation = {
  content: string;
  quickReplies: string[];
  handoff: ChatVerticalHandoffResult;
};

/** Texto e próximos passos por resultado da avaliação (permitido ou cada motivo de bloqueio). */
export function describeVerticalHandoffResult(result: ChatVerticalHandoffResult, verticalId = "imob"): VerticalHandoffPresentation {
  if (result.ok) {
    const label = result.handoff.vertical.label ?? result.handoff.vertical.id.toUpperCase();
    // Os formulários do IMOB entram nesta conversa na etapa D da ADR-010; para a Logística, a preparação (contexto, documentos e
    // conferência humana) abre NESTA conversa pelo cartão da jornada (M4), com o acesso de gravação decidido pelo servidor.
    const content = result.handoff.vertical.id === "imob"
      ? `Sigo com o ${label} nesta conversa. Gestão, cadastros, locações, documentos e contratos ficam aqui mesmo, na barra Gestão, Proprietários, Imóveis, Locações e Negócios.`
      : result.handoff.vertical.id === "log"
        ? `Sigo com ${label} nesta conversa: o acesso ao contexto foi confirmado neste workspace. A preparação da devolução, os documentos e a conferência humana aparecem aqui na conversa; o que exigir permissão específica fica bloqueado com aviso. Nada foi executado.`
        : `Sigo com o ${label} nesta conversa: o acesso foi confirmado neste workspace.`;
    return { content, quickReplies: [], handoff: result };
  }
  if (verticalId === "log") return describeLogisticaHandoffBlock(result);
  if (verticalId !== "imob") return {
    content: `Não consegui confirmar uma capacidade de conversa disponível em ${verticalDisplayName(verticalId)} neste workspace. Nenhuma ação foi executada.`,
    quickReplies: [], handoff: result,
  };
  switch (result.reasonCode) {
    case "VERTICAL_NOT_REGISTERED":
      return {
        content: "O IMOB ainda não está ativo neste workspace. Posso ativá-lo por aqui mesmo, com a sua confirmação.",
        quickReplies: [ACTIVATION_REQUEST_REPLY, "Ver opções no Marketplace"],
        handoff: result,
      };
    case "VERTICAL_DISABLED":
    case "VERTICAL_ENTITLEMENT_REQUIRED":
      return {
        content: "O IMOB está instalado, mas não está pronto para uso neste workspace (instalação, plano ou agentes pendentes). Posso refazer a ativação por aqui, com a sua confirmação.",
        quickReplies: [ACTIVATION_REQUEST_REPLY, "Ver opções no Marketplace"],
        handoff: result,
      };
    case "VERTICAL_SCOPE_DENIED":
      return {
        content: "Sua função neste workspace não tem acesso ao IMOB. Peça ao administrador a permissão de uso do IMOB (Perfil → Gerir funções).",
        quickReplies: [],
        handoff: result,
      };
    case "VERTICAL_HITL_REQUIRED":
      return {
        content: "Esta ação precisa de aprovação humana antes de seguir. Nada foi executado.",
        quickReplies: [],
        handoff: result,
      };
    default:
      return {
        content: "Não consegui confirmar o acesso ao IMOB agora. Nada foi executado; tente de novo em instantes.",
        quickReplies: [],
        handoff: { ok: false, reasonCode: result.reasonCode || "VERTICAL_GOVERNANCE_NOT_EVALUATED" },
      };
  }
}

/** Bloqueios da Logística & Comex: o acesso depende de instalação, liberação da EIAH, vínculo ativo e política específica (não de papel). */
function describeLogisticaHandoffBlock(result: Extract<ChatVerticalHandoffResult, { ok: false }>): VerticalHandoffPresentation {
  const activate = verticalActivationCopy("log").activateReply;
  switch (result.reasonCode) {
    case "VERTICAL_NOT_REGISTERED":
      return {
        content: "Logística & Comex ainda não está ativa neste workspace. Posso ativá-la por aqui mesmo, com a sua confirmação.",
        quickReplies: [activate, "Ver opções no Marketplace"],
        handoff: result,
      };
    case "VERTICAL_DISABLED":
    case "VERTICAL_ENTITLEMENT_REQUIRED":
      return {
        content: "Logística & Comex ainda não está disponível para uso neste workspace (instalação, liberação da EIAH, vínculo ativo ou política específica pendente). Nenhuma ação foi concedida ou executada.",
        quickReplies: [],
        handoff: result,
      };
    case "VERTICAL_SCOPE_DENIED":
    case "VERTICAL_POLICY_DENIED":
      return {
        content: "O acesso ao contexto de Logística & Comex não está autorizado neste workspace. Nenhuma ação foi executada.",
        quickReplies: [],
        handoff: result,
      };
    case "VERTICAL_HITL_REQUIRED":
      return {
        content: "Esta ação precisa de aprovação humana antes de seguir. Nada foi executado.",
        quickReplies: [],
        handoff: result,
      };
    default:
      return {
        content: "Não consegui confirmar o acesso a Logística & Comex agora. Nada foi executado; tente de novo em instantes.",
        quickReplies: [],
        handoff: { ok: false, reasonCode: result.reasonCode || "VERTICAL_GOVERNANCE_NOT_EVALUATED" },
      };
  }
}

/** Referência de caso que a conversa tem agora (URL `?case=` ou memória da sessão); só uma dica para o servidor validar. */
function currentLogisticaCaseRef(): string | null {
  if (typeof window === "undefined") return null;
  const session = getSession();
  let store: Storage | null = null;
  try { store = window.sessionStorage; } catch { store = null; }
  return resolveLogisticaCaseToResume(window.location.search, store, { tenantId: session.tenantId, workspaceId: session.workspaceId, userId: session.userId });
}

/** Avaliação no servidor; qualquer falha bloqueia (fail-closed). */
export async function requestVerticalHandoff(
  request: VerticalHandoffRequest,
  refs?: { conversationId?: string | null; threadId?: string | null; caseRef?: string | null },
): Promise<ChatVerticalHandoffResult> {
  try {
    // Só o handoff da Logística leva a referência do caso; ausente ou fora do formato = não envia (comportamento anterior).
    const requestedCaseRef = request.verticalId === "log"
      ? (refs?.caseRef !== undefined ? refs.caseRef : currentLogisticaCaseRef())
      : null;
    const caseRef = isValidLogisticaCaseRef(requestedCaseRef) ? requestedCaseRef : null;
    let capabilityId = request.capabilityId;
    if (!capabilityId) {
      const registry = (await apiGetChatVerticalRegistry())?.data;
      if (registry?.version !== "vertical.registry.v1") return { ok: false, reasonCode: "VERTICAL_GOVERNANCE_NOT_EVALUATED" };
      const vertical = registry.verticals.find((entry) => entry.id === request.verticalId);
      if (!vertical) return { ok: false, reasonCode: "VERTICAL_NOT_REGISTERED" };
      if (vertical.status !== "enabled") return { ok: false, reasonCode: "VERTICAL_DISABLED" };
      capabilityId = vertical.capabilities.find((entry) => entry.allowedModes.includes("read_only"))?.id;
      if (!capabilityId) return { ok: false, reasonCode: "VERTICAL_GOVERNANCE_NOT_EVALUATED" };
    }
    const response = await apiRequestChatVerticalHandoff({
      ...request,
      capabilityId,
      ...(refs?.conversationId || refs?.threadId || caseRef
        ? {
            refs: {
              ...(refs?.conversationId ? { conversationId: refs.conversationId } : {}),
              ...(refs?.threadId ? { threadId: refs.threadId } : {}),
              ...(caseRef ? { caseRef } : {}),
            },
          }
        : {}),
    });
    const data = response?.data;
    if (data && data.ok === true && data.handoff?.version === "chat.vertical_handoff.v2" && data.handoff.outcome === "allowed"
      && data.handoff.vertical.id === request.verticalId && data.handoff.capability.id === capabilityId
      && data.handoff.capability.mode === request.mode) {
      // O veredito do servidor sobre a referência só vale se pedimos uma; `resolved` tem de repetir exatamente a que enviamos.
      const verdict = (data as { caseContext?: { status?: unknown; caseRef?: unknown } }).caseContext;
      const { caseContext: _unverified, ...base } = data;
      if (!caseRef || !verdict) return base;
      if (verdict.status === "resolved" && verdict.caseRef === caseRef) return { ...base, caseContext: { status: "resolved", caseRef } };
      return { ...base, caseContext: { status: "unavailable", caseRef } };
    }
    if (data && data.ok === false && typeof data.reasonCode === "string") return data;
    return { ok: false, reasonCode: "VERTICAL_GOVERNANCE_NOT_EVALUATED" };
  } catch {
    return { ok: false, reasonCode: "VERTICAL_GOVERNANCE_NOT_EVALUATED" };
  }
}

type DecisionWithHandoff = {
  content?: string;
  resolvedQuickReplies?: string[];
  verticalHandoffRequest?: VerticalHandoffRequest;
  verticalHandoff?: ChatVerticalHandoffResult;
  verticalActivation?: VerticalActivationSnapshot;
  /** Pedido original a seguir para a vertical depois do handoff permitido (ex.: abre o formulário pedido). */
  verticalHandoffForwardInput?: string;
  verticalHandoffSessionSync?: "synced" | "failed";
};

/** Etapa assíncrona do engine: avalia o handoff no servidor e resolve texto e próximos passos. */
export async function enrichLauncherDecisionWithVerticalHandoff<D extends DecisionWithHandoff>(
  decision: D | null,
  refs?: { conversationId?: string | null; threadId?: string | null },
  request: (req: VerticalHandoffRequest, r?: typeof refs) => Promise<ChatVerticalHandoffResult> = requestVerticalHandoff,
  syncSession: (domain: "imob" | "logistica") => Promise<unknown> = syncSessionContext,
  isCurrent: () => boolean = () => true,
  accessOf: typeof fetchLogisticaAccess = fetchLogisticaAccess,
): Promise<(D & DecisionWithHandoff) | null> {
  if (!isCurrent()) return null;
  if (!decision?.verticalHandoffRequest) return decision;
  const initialSession = getSession();
  const result = await request(decision.verticalHandoffRequest, refs);
  if (!isCurrent()) return null;
  const presentation = describeVerticalHandoffResult(result, decision.verticalHandoffRequest.verticalId);
  // O bloqueio de outra vertical guarda a vertical pedida (só no cliente) para o cartão nomeá-la; ausência = IMOB (comportamento anterior).
  if (!result.ok && decision.verticalHandoffRequest.verticalId !== "imob") presentation.handoff = { ...result, verticalId: decision.verticalHandoffRequest.verticalId };
  // FD-CHAT-ONLY-001: o motivo específico do bloqueio da Logística (consulta do próprio usuário ao servidor) é explicado NA conversa,
  // no lugar do antigo painel de contexto externo. Falha ao consultar ⇒ só o texto genérico.
  if (!result.ok && decision.verticalHandoffRequest.verticalId === "log") {
    const access = await accessOf().catch(() => null);
    if (!isCurrent()) return null;
    if (access && !access.allowed && access.reason !== "available") presentation.content = `${presentation.content}\n\nMotivo informado pelo servidor: ${LOGISTICA_ACCESS_MESSAGES[access.reason]}`;
  }
  let sessionSync: DecisionWithHandoff["verticalHandoffSessionSync"];
  const syncDomain = result.ok ? (result.handoff.vertical.id === "imob" ? "imob" : result.handoff.vertical.id === "log" ? "logistica" : null) : null;
  if (result.ok && syncDomain) {
    try {
      await syncSession(syncDomain);
      const currentSession = getSession();
      if (currentSession.token !== initialSession.token || currentSession.tenantId !== initialSession.tenantId
          || currentSession.workspaceId !== initialSession.workspaceId) throw new Error("Handoff fora da sessão atual.");
      sessionSync = "synced";
    } catch {
      sessionSync = "failed";
      // Não fabrica disponibilidade nem desfaz a decisão de handoff do servidor.
      presentation.content = `O acesso ${result.handoff.vertical.id === "log" ? "a Logística & Comex" : "ao IMOB"} foi confirmado, mas não consegui atualizar o contexto local da sessão. Atualize a página para sincronizar a conversa.`;
    }
  }
  if (!isCurrent()) return null;
  return {
    ...decision,
    content: presentation.content,
    resolvedQuickReplies: presentation.quickReplies,
    verticalHandoff: presentation.handoff,
    ...(sessionSync ? { verticalHandoffSessionSync: sessionSync } : {}),
    // Confirmação do handoff não substitui a validação do contexto para encaminhar.
    verticalHandoffForwardInput: result.ok && sessionSync !== "failed" ? decision.verticalHandoffForwardInput : undefined,
  };
}

/** Contexto de vertical que a conversa assume quando o handoff é permitido pelo servidor. */
const CONTEXT_BY_VERTICAL = { imob: "IMOB", log: "LOGISTICA" } as const;

/** Congela o handoff no snapshot da mensagem; com handoff permitido, a conversa passa a ter contexto da vertical. */
export function attachVerticalHandoffToSnapshot<S extends {
  verticalContext?: "IMOB" | "LEGAL" | "LOGISTICA" | null;
  verticalHandoff?: ChatVerticalHandoffResult | null;
  verticalActivation?: VerticalActivationSnapshot | null;
}>(
  snapshot: S,
  decision: DecisionWithHandoff | null,
): S {
  if (decision?.verticalActivation) {
    // Ativar a instalação só dá contexto de conversa ao IMOB; a Logística exige handoff autorizado (acesso ao contexto).
    const activatedImob = decision.verticalActivation.verticalId === "imob"
      && (decision.verticalActivation.status === "activated" || decision.verticalActivation.status === "already_active");
    snapshot = { ...snapshot, verticalActivation: decision.verticalActivation, ...(activatedImob ? { verticalContext: "IMOB" as const } : {}) };
  }
  if (!decision?.verticalHandoff) return snapshot;
  const allowedId = decision.verticalHandoff.ok ? decision.verticalHandoff.handoff.vertical.id : null;
  const context = allowedId === "imob" || allowedId === "log" ? CONTEXT_BY_VERTICAL[allowedId] : null;
  return {
    ...snapshot,
    verticalHandoff: decision.verticalHandoff,
    ...(context ? { verticalContext: context } : {}),
    // Handoff de Logística permitido pelo servidor: a jornada de preparação passa a ser apresentada NA conversa (M4). Só um sinal de
    // apresentação: o acesso de leitura/gravação continua decidido pelo servidor a cada consulta do cartão.
    ...(allowedId === "log" ? { logisticaJourney: true } : {}),
    // Veredito do servidor sobre a referência de caso enviada (resolvida ou recusada); sem dados do caso. Só presentation.
    ...(allowedId === "log" && decision.verticalHandoff.ok && decision.verticalHandoff.caseContext ? { logisticaCase: decision.verticalHandoff.caseContext } : {}),
  };
}

type VerticalTransitionSnapshot = { verticalHandoff?: ChatVerticalHandoffResult | null; verticalActivation?: VerticalActivationSnapshot | null } | null | undefined;

/**
 * Vertical em que a conversa está: a da última decisão registrada (handoff permitido ou, só para o IMOB, ativação
 * confirmada). Reconstrói apenas o histórico de transições; a superfície atual é derivada da sessão.
 */
export function activeVerticalInConversation(snapshots: VerticalTransitionSnapshot[]): "imob" | "log" | null {
  for (let index = snapshots.length - 1; index >= 0; index -= 1) {
    const snapshot = snapshots[index];
    if (!snapshot) continue;
    if (snapshot.verticalHandoff) {
      if (!snapshot.verticalHandoff.ok) return null;
      const id = snapshot.verticalHandoff.handoff.vertical.id;
      return id === "imob" || id === "log" ? id : null;
    }
    if (snapshot.verticalActivation && snapshot.verticalActivation.verticalId === "imob"
      && snapshot.verticalActivation.status !== "proposed" && snapshot.verticalActivation.status !== "cancelled") {
      return snapshot.verticalActivation.status === "activated" || snapshot.verticalActivation.status === "already_active" ? "imob" : null;
    }
  }
  return null;
}

/** A conversa está no IMOB quando a última decisão de vertical registrada foi handoff permitido ou ativação confirmada do IMOB. */
export function isImobActiveInConversation(snapshots: VerticalTransitionSnapshot[]) {
  return activeVerticalInConversation(snapshots) === "imob";
}
