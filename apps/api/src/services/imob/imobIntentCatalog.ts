import {
  IMOB_ACTION_CATALOG,
  type ImobActionKey,
  type ImobEntityKey,
} from "./imobActionCatalog";

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
  const regex = new RegExp(`(^|\\s)${escaped}(\\s|$)`, "i");
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
