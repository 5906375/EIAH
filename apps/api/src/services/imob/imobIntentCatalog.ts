import {
  IMOB_ACTION_CATALOG,
  type ImobActionKey,
  type ImobEntityKey,
} from "./imobActionCatalog";
import type { ImobCaseJourneyType, ImobIntent } from "./imobConversationContract";

export type ParsedImobIntent = {
  entity: ImobEntityKey | null;
  action: ImobActionKey | null;
  matchedEntityAlias: string | null;
  matchedActionAlias: string | null;
  entityScore: number;
  actionScore: number;
  pluralityHint: "singular" | "plural" | null;
  canonicalLabel: string | null;
};

export type IntentCandidate<T extends string> = {
  key: T;
  alias: string;
  score: number;
  priority: number;
};

export type ImobIntentChoice = {
  entity: ImobEntityKey;
  action: ImobActionKey;
  label: string;
  nextMessage: string;
};

export type ImobConversationalResponseSection =
  | "priority"
  | "case_summary"
  | "commercial_read"
  | "next_action"
  | "immediate_action"
  | "shortlist"
  | "document_blockers"
  | "visit_context"
  | "proposal_status";

export type ImobConversationalResponseFormat = {
  style:
    | "priority_list"
    | "case_drilldown"
    | "message_assist"
    | "inventory_shortlist"
    | "visit_follow_up"
    | "proposal_follow_up"
    | "documentation_follow_up"
    | "pipeline_status"
    | "blocker_resolution"
    | "next_best_action";
  maxItems?: number;
  sections: ImobConversationalResponseSection[];
};

export type ImobConversationalIntentDefinition = {
  intentId: string;
  coreIntent: ImobIntent;
  primaryJourney: ImobCaseJourneyType;
  relatedJourneys?: ImobCaseJourneyType[];
  businessGoal: string;
  description: string;
  triggerPhrases: string[];
  responseFormat: ImobConversationalResponseFormat;
  nextActionPolicy:
    | "prioritize_daily_queue"
    | "open_case"
    | "prepare_message"
    | "show_shortlist"
    | "advance_visit"
    | "advance_proposal"
    | "unblock_documentation"
    | "read_pipeline_status"
    | "resolve_blocked_run"
    | "recommend_next_best_action";
  quickReplies: string[];
};

export const INTENT_PREFIXES = [
  "",
  "quero",
  "como",
  "preciso",
  "pode",
  "gostaria de",
] as const;

export const ENTITY_ALIASES: Record<ImobEntityKey, readonly string[]> = {
  proprietario: ["proprietario", "proprietário", "proprietarios", "proprietários", "dono", "donos"],
  imovel: ["imovel", "imóvel", "imoveis", "imóveis", "propriedade", "propriedades"],
  comprador: ["comprador", "compradores", "cliente comprador", "clientes compradores"],
  vendedor: ["vendedor", "vendedora"],
  locador: ["locador", "locadora"],
  locatario: ["locatario", "locatário", "locatarios", "locatários", "inquilino", "inquilinos"],
  corretor: ["corretor", "corretores", "broker", "brokers"],
  lead: ["lead", "leads", "contato", "contatos"],
  proposta: ["proposta", "propostas", "oferta", "ofertas"],
  contrato: ["contrato", "contratos"],
  visita: ["visita", "visitas"],
  agenda: ["agenda", "agendas", "compromisso", "compromissos"],
  documento: ["documento", "documentos", "arquivo", "arquivos"],
  anuncio: ["anuncio", "anúncio", "anuncios", "anúncios"],
  pagamento: ["pagamento", "pagamentos"],
  dashboard: ["dashboard", "dashboards", "painel", "paineis", "painéis"],
};

export const ENTITY_INFLECTIONS: Record<
  ImobEntityKey,
  { singular: readonly string[]; plural: readonly string[] }
> = {
  proprietario: {
    singular: ["proprietario", "proprietário", "dono"],
    plural: ["proprietarios", "proprietários", "donos"],
  },
  imovel: {
    singular: ["imovel", "imóvel", "propriedade"],
    plural: ["imoveis", "imóveis", "propriedades"],
  },
  comprador: {
    singular: ["comprador"],
    plural: ["compradores"],
  },
  vendedor: {
    singular: ["vendedor", "vendedora"],
    plural: ["vendedores", "vendedoras"],
  },
  locador: {
    singular: ["locador", "locadora"],
    plural: ["locadores", "locadoras"],
  },
  locatario: {
    singular: ["locatario", "locatário", "inquilino"],
    plural: ["locatarios", "locatários", "inquilinos"],
  },
  corretor: {
    singular: ["corretor", "broker"],
    plural: ["corretores", "brokers"],
  },
  lead: {
    singular: ["lead", "contato"],
    plural: ["leads", "contatos"],
  },
  proposta: {
    singular: ["proposta", "oferta"],
    plural: ["propostas", "ofertas"],
  },
  contrato: {
    singular: ["contrato"],
    plural: ["contratos"],
  },
  visita: {
    singular: ["visita"],
    plural: ["visitas"],
  },
  agenda: {
    singular: ["agenda", "compromisso"],
    plural: ["agendas", "compromissos"],
  },
  documento: {
    singular: ["documento", "arquivo"],
    plural: ["documentos", "arquivos"],
  },
  anuncio: {
    singular: ["anuncio", "anúncio"],
    plural: ["anuncios", "anúncios"],
  },
  pagamento: {
    singular: ["pagamento"],
    plural: ["pagamentos"],
  },
  dashboard: {
    singular: ["dashboard", "painel"],
    plural: ["dashboards", "paineis", "painéis"],
  },
};

export const ACTION_ALIASES: Partial<Record<ImobActionKey, readonly string[]>> = {
  create: ["cadastrar", "cadastro", "novo cadastro", "iniciar cadastro", "começar cadastro", "abrir cadastro", "fazer cadastro", "incluir", "criar", "adicionar", "registrar"],
  edit: ["editar", "edicao", "edição", "editar cadastro", "alterar", "alteracao", "alteração"],
  delete: ["excluir", "exclusao", "exclusão", "deletar", "remover", "remocao", "remoção", "apagar"],
  list: ["listar", "listagem", "listar cadastros", "mostrar", "mostrar lista", "ver lista", "exibir"],
  get: ["consultar", "consulta", "fazer consulta", "buscar", "abrir", "ver detalhes de", "detalhes de"],
  update: ["atualizar", "atualizacao", "atualização", "alterar dados de", "editar dados de"],
  configure: ["configurar", "configurar regras", "definir regras", "regras de hospedagem", "check-in", "checkin", "check-out", "checkout"],
  status: ["atualizar status de", "status", "mudar status de", "alterar status de"],
  sendDocuments: ["enviar documentos de", "anexar documentos de"],
  history: ["ver histórico de", "historico de", "histórico de", "mostrar histórico de", "ver historico de"],
  publish: ["publicar", "anunciar"],
  unpublish: ["retirar de publicação", "despublicar"],
  convert: ["converter", "transformar"],
  assign: ["distribuir", "atribuir"],
  approve: ["aprovar", "confirmar aprovação de"],
  reject: ["reprovar", "rejeitar", "recusar"],
  send: ["enviar", "compartilhar"],
  sendForSignature: ["enviar para assinatura", "mandar para assinatura"],
  confirm: ["confirmar"],
  reschedule: ["reagendar", "remarcar"],
  validate: ["validar", "conferir"],
  pause: ["pausar", "suspender"],
  sendReceipt: ["enviar comprovante de", "anexar comprovante de"],
  view: ["ver", "abrir", "mostrar"],
  indicators: ["ver indicadores", "mostrar indicadores"],
  reports: ["ver relatórios", "mostrar relatórios"],
  export: ["exportar", "baixar"],
};

export const ACTION_PRIORITY: Partial<Record<ImobActionKey, number>> = {
  get: 100,
  list: 90,
  view: 80,
  history: 75,
  indicators: 75,
  reports: 75,
  status: 70,
  update: 70,
  configure: 70,
  create: 65,
  edit: 65,
  delete: 65,
  approve: 65,
  reject: 65,
  send: 60,
  sendDocuments: 60,
  sendForSignature: 60,
  sendReceipt: 60,
  publish: 60,
  unpublish: 60,
  confirm: 60,
  reschedule: 60,
  validate: 60,
  pause: 60,
  convert: 60,
  assign: 60,
  export: 60,
};

export const IMOB_CONVERSATIONAL_INTENT_CATALOG: readonly ImobConversationalIntentDefinition[] = [
  {
    intentId: "daily.leads_today",
    coreIntent: "lead",
    primaryJourney: "lead_qualification",
    relatedJourneys: ["visit_follow_up", "proposal", "documentation"],
    businessGoal: "abrir o dia com prioridades comerciais reais",
    description: "Resumo curto das oportunidades do dia com foco em quem atacar primeiro.",
    triggerPhrases: ["lead de hoje", "lead do dia", "quem eu ataco agora", "o que eu ataco agora", "como esta meu dia", "como está meu dia", "o que esta quente hoje", "o que está quente hoje"],
    responseFormat: {
      style: "priority_list",
      maxItems: 5,
      sections: ["priority", "commercial_read", "next_action", "immediate_action"],
    },
    nextActionPolicy: "prioritize_daily_queue",
    quickReplies: ["Abrir lead", "Montar mensagem", "Ver imóveis", "Próximo lead"],
  },
  {
    intentId: "lead.resume_case",
    coreIntent: "lead",
    primaryJourney: "lead_qualification",
    relatedJourneys: ["visit_follow_up"],
    businessGoal: "entender rapidamente um lead antes de atender",
    description: "Resumo do caso do lead com contexto, etapa e próximo passo.",
    triggerPhrases: ["resume este lead", "resuma este lead", "abrir lead", "esse lead esta quente", "esse lead está quente", "me explica esse lead"],
    responseFormat: {
      style: "case_drilldown",
      sections: ["case_summary", "commercial_read", "next_action", "immediate_action"],
    },
    nextActionPolicy: "open_case",
    quickReplies: ["Montar mensagem", "Ver imóveis", "Qualificar melhor", "Agendar visita"],
  },
  {
    intentId: "lead.prepare_message",
    coreIntent: "lead",
    primaryJourney: "lead_qualification",
    relatedJourneys: ["visit_follow_up"],
    businessGoal: "reduzir o tempo entre decisão e contato com o cliente",
    description: "Preparar mensagem pronta e contextual para retomada ou primeiro contato.",
    triggerPhrases: ["o que mando para ele", "monta mensagem", "prepara mensagem", "mensagem para lead", "mensagem para contato", "mensagem para cliente"],
    responseFormat: {
      style: "message_assist",
      sections: ["case_summary", "next_action", "immediate_action"],
    },
    nextActionPolicy: "prepare_message",
    quickReplies: ["Ajustar tom", "Mensagem curta", "Incluir imóveis", "Fazer os dois"],
  },
  {
    intentId: "match.suggest_properties",
    coreIntent: "match",
    primaryJourney: "lead_qualification",
    relatedJourneys: ["visit_follow_up"],
    businessGoal: "transformar lead em shortlist e visita",
    description: "Mostrar imóveis aderentes ao perfil comercial do caso.",
    triggerPhrases: ["quais imoveis combinam", "quais imóveis combinam", "me sugira 3 opcoes", "me sugira 3 opções", "tem similar mais facil de fechar", "tem similar mais fácil de fechar", "sugira imoveis", "sugira imóveis"],
    responseFormat: {
      style: "inventory_shortlist",
      maxItems: 3,
      sections: ["case_summary", "shortlist", "next_action", "immediate_action"],
    },
    nextActionPolicy: "show_shortlist",
    quickReplies: ["Ver opções", "Mais aderente", "Mais fácil fechar", "Agendar visita"],
  },
  {
    intentId: "visit.follow_up",
    coreIntent: "visit",
    primaryJourney: "visit_follow_up",
    relatedJourneys: ["proposal"],
    businessGoal: "evitar esquecimento e converter visitas em avanço",
    description: "Confirmar visita, retomar follow-up e preparar próximo movimento comercial.",
    triggerPhrases: ["tenho visita hoje", "confirmar visita", "confirma essa visita", "monta mensagem pos visita", "monta mensagem pós visita", "visita pendente"],
    responseFormat: {
      style: "visit_follow_up",
      maxItems: 3,
      sections: ["priority", "visit_context", "next_action", "immediate_action"],
    },
    nextActionPolicy: "advance_visit",
    quickReplies: ["Confirmar visita", "Mandar mensagem", "Reagendar", "Abrir caso"],
  },
  {
    intentId: "proposal.advance",
    coreIntent: "proposal",
    primaryJourney: "proposal",
    relatedJourneys: ["negotiation", "closing"],
    businessGoal: "tirar proposta da inércia e acelerar fechamento",
    description: "Gerar proposta, cobrar retorno ou registrar contraproposta com contexto.",
    triggerPhrases: ["gerar proposta", "essa proposta esta parada", "essa proposta está parada", "registrar contraproposta", "reabrir negociacao", "reabrir negociação", "proposta sem resposta"],
    responseFormat: {
      style: "proposal_follow_up",
      sections: ["case_summary", "proposal_status", "next_action", "immediate_action"],
    },
    nextActionPolicy: "advance_proposal",
    quickReplies: ["Cobrar retorno", "Reabrir negociação", "Ver histórico", "Abrir caso"],
  },
  {
    intentId: "documents.unblock_case",
    coreIntent: "documents",
    primaryJourney: "documentation",
    relatedJourneys: ["contract", "closing", "visit_follow_up"],
    businessGoal: "destravar negócio parado por pendência documental",
    description: "Expor rapidamente o que falta, com quem está e qual ação libera o avanço.",
    triggerPhrases: ["o que falta aqui", "quem esta pendente", "quem está pendente", "cobrar documentacao", "cobrar documentação", "documentacao travada", "documentação travada", "qual documento falta"],
    responseFormat: {
      style: "documentation_follow_up",
      sections: ["case_summary", "document_blockers", "next_action", "immediate_action"],
    },
    nextActionPolicy: "unblock_documentation",
    quickReplies: ["Cobrar documento", "Ver checklist", "Abrir caso", "Registrar recebimento"],
  },
  {
    intentId: "pipeline_status",
    coreIntent: "deal",
    primaryJourney: "negotiation",
    relatedJourneys: ["property_capture", "lead_qualification", "documentation", "contract", "closing", "temporada_rules"],
    businessGoal: "ler o estado do negócio e apontar o próximo passo comercial",
    description: "Resumo de pipeline do caso com etapa, pendência principal e próximo movimento.",
    triggerPhrases: [
      "onde esta esse caso",
      "onde está esse caso",
      "qual status desse caso",
      "qual status deste caso",
      "qual status do caso",
      "qual status do negocio",
      "qual status do negócio",
      "em que etapa esta",
      "em que etapa está",
      "status dessa locacao",
      "status dessa locação",
      "status do pipeline",
    ],
    responseFormat: {
      style: "pipeline_status",
      sections: ["case_summary", "commercial_read", "next_action", "immediate_action"],
    },
    nextActionPolicy: "read_pipeline_status",
    quickReplies: ["Ver pendências", "Próximo passo", "Abrir caso", "Ver bloqueios"],
  },
  {
    intentId: "blocked_run_resolution",
    coreIntent: "deal",
    primaryJourney: "negotiation",
    relatedJourneys: ["documentation", "contract", "closing", "temporada_rules"],
    businessGoal: "explicar por que o caso travou e qual ação destrava",
    description: "Leitura dos bloqueios, pendências e reasonCodes do caso antes de tentar executar nova ação.",
    triggerPhrases: ["por que travou", "porque travou", "o que falta para liberar", "como destravar esse caso", "qual bloqueio impede", "mostrar bloqueios", "resolver bloqueio", "destravar negocio", "destravar negócio"],
    responseFormat: {
      style: "blocker_resolution",
      sections: ["case_summary", "document_blockers", "next_action", "immediate_action"],
    },
    nextActionPolicy: "resolve_blocked_run",
    quickReplies: ["Ver bloqueio", "Ver pendências", "Acionar especialista", "Abrir caso"],
  },
  {
    intentId: "next_best_action",
    coreIntent: "deal",
    primaryJourney: "negotiation",
    relatedJourneys: ["property_capture", "lead_qualification", "proposal", "visit_follow_up", "documentation", "contract", "closing", "commission", "temporada_rules"],
    businessGoal: "escolher a próxima ação única mais útil para avançar o caso",
    description: "Recomendação comercial baseada em pendências, bloqueios, jornada canonical e ações recomendadas do caso.",
    triggerPhrases: [
      "proximo passo",
      "próximo passo",
      "qual proximo passo",
      "qual próximo passo",
      "vamos seguir",
      "seguir com proximo passo",
      "seguir com próximo passo",
      "o que faco agora",
      "o que faço agora",
      "proxima melhor acao",
      "próxima melhor ação",
      "next best action",
      "qual acao agora",
      "qual ação agora",
      "proximo movimento",
      "próximo movimento",
    ],
    responseFormat: {
      style: "next_best_action",
      sections: ["case_summary", "commercial_read", "next_action", "immediate_action"],
    },
    nextActionPolicy: "recommend_next_best_action",
    quickReplies: ["Executar próximo passo", "Ver pendências", "Ver bloqueios", "Abrir caso"],
  },
] as const;

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function containsWholePhrase(text: string, phrase: string): boolean {
  const normalizedText = normalizeText(text);
  const normalizedPhrase = normalizeText(phrase);
  const escaped = normalizedPhrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(^|\\s)${escaped}(?=\\s|$|[?.!,;:])`, "i");
  return regex.test(normalizedText);
}

export function scoreAliasMatch(text: string, alias: string): number {
  const normalizedText = normalizeText(text);
  const normalizedAlias = normalizeText(alias);

  if (normalizedText === normalizedAlias) {
    return 120;
  }

  if (containsWholePhrase(normalizedText, normalizedAlias)) {
    return 100 + normalizedAlias.length;
  }

  if (normalizedText.includes(normalizedAlias)) {
    return 70 + normalizedAlias.length;
  }

  return 0;
}

export function humanizeEntity(entity: ImobEntityKey): string {
  return IMOB_ACTION_CATALOG[entity].createChoiceLabel ?? ENTITY_ALIASES[entity][0];
}

export function getEntityAliases(entity: ImobEntityKey): readonly string[] {
  const catalogAliases = IMOB_ACTION_CATALOG[entity].aliases ?? [];
  return Array.from(new Set([...ENTITY_ALIASES[entity], ...catalogAliases]));
}

export function getActionAliases(action: ImobActionKey): readonly string[] {
  return ACTION_ALIASES[action] ?? [];
}

export function getSupportedActions(entity: ImobEntityKey): ImobActionKey[] {
  return Object.keys(IMOB_ACTION_CATALOG[entity].actions) as ImobActionKey[];
}

export function detectEntityPlurality(
  input: string,
  entity: ImobEntityKey,
): "singular" | "plural" | null {
  const text = normalizeText(input);
  const inflections = ENTITY_INFLECTIONS[entity];

  const singularMatch = inflections.singular.some((alias) => containsWholePhrase(text, alias));
  const pluralMatch = inflections.plural.some((alias) => containsWholePhrase(text, alias));

  if (pluralMatch && !singularMatch) return "plural";
  if (singularMatch && !pluralMatch) return "singular";
  return null;
}

export function applyPluralityActionBias(
  action: ImobActionKey,
  score: number,
  plurality: "singular" | "plural" | null,
): number {
  if (!plurality) return score;

  if (plurality === "plural") {
    if (action === "list") return score + 25;
    if (action === "get") return score - 20;
    if (action === "view") return score - 10;
  }

  if (plurality === "singular") {
    if (action === "get") return score + 25;
    if (action === "list") return score - 20;
    if (action === "view") return score - 10;
  }

  return score;
}

export function buildImobCanonicalMessage(entity: ImobEntityKey, action: ImobActionKey): string {
  const catalogEntity = IMOB_ACTION_CATALOG[entity];
  if (action === "create" && catalogEntity.createPrompt) {
    return catalogEntity.createPrompt;
  }
  const actionAlias = getActionAliases(action)[0] ?? IMOB_ACTION_CATALOG[entity].actions[action]?.label ?? action;
  return `${actionAlias} ${humanizeEntity(entity).toLowerCase()}`.trim();
}

export function listImobIntentChoicesForAction(action: ImobActionKey): ImobIntentChoice[] {
  const entities = Object.keys(IMOB_ACTION_CATALOG) as ImobEntityKey[];
  return entities.flatMap((entity) => {
    const entityConfig = IMOB_ACTION_CATALOG[entity];
    const meta = entityConfig.actions[action];
    if (!meta) {
      return [];
    }
    if (action === "create" && (!entityConfig.createPrompt || !entityConfig.createChoiceLabel)) {
      return [];
    }
    return [{
      entity,
      action,
      label: meta.label,
      nextMessage: buildImobCanonicalMessage(entity, action),
    }];
  });
}

export function generateUtterances(entity: ImobEntityKey, action: ImobActionKey): string[] {
  const entityName = humanizeEntity(entity);
  const actionAliases = getActionAliases(action);
  const phrases = new Set<string>();

  for (const alias of actionAliases) {
    for (const prefix of INTENT_PREFIXES) {
      const base = `${alias} ${entityName}`.trim();
      phrases.add(prefix ? `${prefix} ${base}` : base);
    }
  }

  return Array.from(phrases);
}

export function generateEntityUtterances(entity: ImobEntityKey): Partial<Record<ImobActionKey, string[]>> {
  const result: Partial<Record<ImobActionKey, string[]>> = {};

  for (const action of getSupportedActions(entity)) {
    result[action] = generateUtterances(entity, action);
  }

  return result;
}

export function generateCatalogUtterances(): Record<ImobEntityKey, Partial<Record<ImobActionKey, string[]>>> {
  const result = {} as Record<ImobEntityKey, Partial<Record<ImobActionKey, string[]>>>;

  for (const entity of Object.keys(IMOB_ACTION_CATALOG) as ImobEntityKey[]) {
    result[entity] = generateEntityUtterances(entity);
  }

  return result;
}

export function getEntityCandidates(input: string): IntentCandidate<ImobEntityKey>[] {
  const candidates: IntentCandidate<ImobEntityKey>[] = [];

  for (const entity of Object.keys(IMOB_ACTION_CATALOG) as ImobEntityKey[]) {
    for (const alias of getEntityAliases(entity)) {
      const score = scoreAliasMatch(input, alias);
      if (score > 0) {
        candidates.push({
          key: entity,
          alias,
          score,
          priority: 50,
        });
      }
    }
  }

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.alias.length - a.alias.length;
  });

  return candidates;
}

export function getActionCandidates(
  input: string,
  entity: ImobEntityKey | null,
): IntentCandidate<ImobActionKey>[] {
  const candidates: IntentCandidate<ImobActionKey>[] = [];
  const plurality = entity ? detectEntityPlurality(input, entity) : null;
  const allowedActions = entity ? new Set(getSupportedActions(entity)) : null;

  for (const [action, aliases] of Object.entries(ACTION_ALIASES) as Array<
    [ImobActionKey, readonly string[]]
  >) {
    if (allowedActions && !allowedActions.has(action)) {
      continue;
    }

    for (const alias of aliases) {
      const baseScore = scoreAliasMatch(input, alias);
      if (baseScore > 0) {
        const score = applyPluralityActionBias(action, baseScore, plurality);
        candidates.push({
          key: action,
          alias,
          score,
          priority: ACTION_PRIORITY[action] ?? 50,
        });
      }
    }
  }

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.priority !== a.priority) return b.priority - a.priority;
    return b.alias.length - a.alias.length;
  });

  return candidates;
}

export function getCanonicalLabel(entity: ImobEntityKey, action: ImobActionKey): string | null {
  return IMOB_ACTION_CATALOG[entity].actions[action]?.label ?? null;
}

export function parseImobIntent(input: string): ParsedImobIntent {
  const entityCandidates = getEntityCandidates(input);
  const bestEntity = entityCandidates[0]?.key ?? null;

  const actionCandidates = getActionCandidates(input, bestEntity);
  const bestAction = actionCandidates[0]?.key ?? null;

  const pluralityHint = bestEntity ? detectEntityPlurality(input, bestEntity) : null;
  const canonicalLabel = bestEntity && bestAction ? getCanonicalLabel(bestEntity, bestAction) : null;

  return {
    entity: bestEntity,
    action: bestAction,
    matchedEntityAlias: entityCandidates[0]?.alias ?? null,
    matchedActionAlias: actionCandidates[0]?.alias ?? null,
    entityScore: entityCandidates[0]?.score ?? 0,
    actionScore: actionCandidates[0]?.score ?? 0,
    pluralityHint,
    canonicalLabel,
  };
}

export function resolveCanonicalLabel(input: string): string | null {
  return parseImobIntent(input).canonicalLabel;
}

export function listSupportedIntentPairs(): Array<{
  entity: ImobEntityKey;
  action: ImobActionKey;
  label: string;
}> {
  const pairs: Array<{
    entity: ImobEntityKey;
    action: ImobActionKey;
    label: string;
  }> = [];

  for (const entity of Object.keys(IMOB_ACTION_CATALOG) as ImobEntityKey[]) {
    for (const action of getSupportedActions(entity)) {
      const label = getCanonicalLabel(entity, action);
      if (label) {
        pairs.push({ entity, action, label });
      }
    }
  }

  return pairs;
}

export function listImobConversationalIntents(): ImobConversationalIntentDefinition[] {
  return [...IMOB_CONVERSATIONAL_INTENT_CATALOG];
}

export function findImobConversationalIntentById(intentId: string): ImobConversationalIntentDefinition | null {
  return IMOB_CONVERSATIONAL_INTENT_CATALOG.find((item) => item.intentId === intentId) ?? null;
}

export function matchImobConversationalIntents(input: string): ImobConversationalIntentDefinition[] {
  const normalized = normalizeText(input);
  const matches = IMOB_CONVERSATIONAL_INTENT_CATALOG.filter((intent) =>
    intent.triggerPhrases.some((phrase) => containsWholePhrase(normalized, phrase)),
  );
  return matches.length > 0 ? matches : [];
}

export function debugParseImobIntent(input: string) {
  const entityCandidates = getEntityCandidates(input);
  const bestEntity = entityCandidates[0]?.key ?? null;

  return {
    input,
    normalized: normalizeText(input),
    entityCandidates,
    actionCandidates: getActionCandidates(input, bestEntity),
    parsed: parseImobIntent(input),
  };
}
