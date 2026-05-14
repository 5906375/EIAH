export type ImobCrmWorkflowState =
  | "property.create"
  | "property.market_scan"
  | "property.market_scan.selection"
  | "owner.create"
  | "owner.dedupe_review"
  | "owner.update"
  | "lead.qualify"
  | "case.review"
  | "visit.schedule"
  | "pilot.status"
  | "documents.review";

export type ImobCrmWorkflowTransition =
  | "submit_fields"
  | "start_market_scan"
  | "select_market_scan_item"
  | "confirm_market_scan_selection"
  | "choose_update_existing"
  | "choose_create_new"
  | "show_records"
  | "continue"
  | "read_only_query"
  | "cancel";

export type ImobCrmWorkflowReasonCode =
  | "property_multiple_candidates_offer_market_scan"
  | "market_scan_selection_missing_item"
  | "owner_dedupe_missing_match"
  | "owner_dedupe_missing_matches"
  | "visit_missing_property"
  | "visit_missing_lead_qualification"
  | "pilot_read_only"
  | "lead_already_qualified"
  | "documents_ownership_must_remain_imob"
  | "transition_not_allowed";

export type ImobCrmWorkflowContext = {
  selectedSourceId?: string | null;
  matchedEntityId?: string | null;
  matchedEntityLabel?: string | null;
  matches?: Array<{ id: string; label?: string | null }>;
  pendingFields?: string[];
  leadQualified?: boolean;
  propertyLinked?: boolean;
  readOnly?: boolean;
  ownershipAgentId?: string | null;
  specialistAgentId?: string | null;
};

export type ImobCrmWorkflowDecision = {
  allowed: boolean;
  nextState: ImobCrmWorkflowState;
  reasonCode?: ImobCrmWorkflowReasonCode;
  preserveContext?: boolean;
  sideEffect?: "list_records";
  ownershipAgentId?: string | null;
  specialistAgentId?: string | null;
};

export type ImobCrmWorkflowCta = {
  id: string;
  label: string;
  kind: "primary" | "secondary" | "neutral";
  action: "send_suggested_message";
  nextMessage: string;
};

const ALLOWED_TRANSITIONS: Record<ImobCrmWorkflowState, readonly ImobCrmWorkflowTransition[]> = {
  "property.create": ["submit_fields", "start_market_scan", "continue", "cancel"],
  "property.market_scan": ["start_market_scan", "select_market_scan_item", "read_only_query", "continue", "cancel"],
  "property.market_scan.selection": ["select_market_scan_item", "confirm_market_scan_selection", "read_only_query", "continue", "cancel"],
  "owner.create": ["submit_fields", "continue", "cancel"],
  "owner.dedupe_review": ["choose_update_existing", "choose_create_new", "show_records", "cancel"],
  "owner.update": ["submit_fields", "continue", "cancel"],
  "lead.qualify": ["submit_fields", "continue", "cancel"],
  "case.review": ["continue", "read_only_query", "cancel"],
  "visit.schedule": ["submit_fields", "continue", "cancel", "read_only_query"],
  "pilot.status": ["read_only_query", "cancel"],
  "documents.review": ["continue", "read_only_query", "cancel"],
};

export function getAllowedTransitions(
  state: ImobCrmWorkflowState,
  _context: ImobCrmWorkflowContext = {},
): readonly ImobCrmWorkflowTransition[] {
  return ALLOWED_TRANSITIONS[state];
}

function hasPendingFields(context: ImobCrmWorkflowContext) {
  return Array.isArray(context.pendingFields) && context.pendingFields.length > 0;
}

function getDefaultBlockedDecision(
  state: ImobCrmWorkflowState,
  reasonCode: ImobCrmWorkflowReasonCode,
): ImobCrmWorkflowDecision {
  return {
    allowed: false,
    nextState: state,
    reasonCode,
  };
}

export function resolveTransition(
  state: ImobCrmWorkflowState,
  transition: ImobCrmWorkflowTransition,
  context: ImobCrmWorkflowContext = {},
): ImobCrmWorkflowDecision {
  if (state === "pilot.status" && transition !== "read_only_query" && transition !== "cancel") {
    return getDefaultBlockedDecision(state, "pilot_read_only");
  }

  if (!ALLOWED_TRANSITIONS[state].includes(transition)) {
    return getDefaultBlockedDecision(state, "transition_not_allowed");
  }

  if (state === "owner.dedupe_review") {
    if (transition === "choose_update_existing") {
      if (!context.matchedEntityId) return getDefaultBlockedDecision(state, "owner_dedupe_missing_match");
      return {
        allowed: true,
        nextState: "owner.update",
        preserveContext: true,
      };
    }
    if (transition === "choose_create_new") {
      return {
        allowed: true,
        nextState: "owner.create",
        preserveContext: true,
      };
    }
    if (transition === "show_records") {
      if ((context.matches?.length ?? 0) === 0 && !context.matchedEntityLabel) {
        return getDefaultBlockedDecision(state, "owner_dedupe_missing_matches");
      }
      return {
        allowed: true,
        nextState: "owner.dedupe_review",
        preserveContext: true,
        sideEffect: "list_records",
      };
    }
  }

  if (state === "property.create" && transition === "start_market_scan") {
    return {
      allowed: true,
      nextState: "property.market_scan",
      preserveContext: true,
      reasonCode: "property_multiple_candidates_offer_market_scan",
    };
  }

  if (state === "property.market_scan") {
    if (transition === "select_market_scan_item") {
      if (!context.selectedSourceId) return getDefaultBlockedDecision(state, "market_scan_selection_missing_item");
      return {
        allowed: true,
        nextState: "property.market_scan.selection",
        preserveContext: true,
      };
    }
    return {
      allowed: true,
      nextState: "property.market_scan",
      preserveContext: true,
    };
  }

  if (state === "property.market_scan.selection") {
    if (transition === "confirm_market_scan_selection") {
      if (!context.selectedSourceId) return getDefaultBlockedDecision(state, "market_scan_selection_missing_item");
      return {
        allowed: true,
        nextState: "property.create",
        preserveContext: true,
      };
    }
    if (transition === "select_market_scan_item") {
      if (!context.selectedSourceId) return getDefaultBlockedDecision(state, "market_scan_selection_missing_item");
      return {
        allowed: true,
        nextState: "property.market_scan.selection",
        preserveContext: true,
      };
    }
    return {
      allowed: true,
      nextState: "property.market_scan.selection",
      preserveContext: true,
    };
  }

  if (state === "visit.schedule" && (transition === "submit_fields" || transition === "continue")) {
    if (!context.leadQualified) return getDefaultBlockedDecision(state, "visit_missing_lead_qualification");
    if (!context.propertyLinked) return getDefaultBlockedDecision(state, "visit_missing_property");
  }
  if (state === "lead.qualify" && transition === "continue" && !hasPendingFields(context)) {
    return getDefaultBlockedDecision(state, "lead_already_qualified");
  }

  if (state === "documents.review") {
    const ownershipAgentId = context.ownershipAgentId ?? "IMOB";
    if (ownershipAgentId !== "IMOB") {
      return getDefaultBlockedDecision(state, "documents_ownership_must_remain_imob");
    }
    return {
      allowed: true,
      nextState: "documents.review",
      ownershipAgentId,
      specialistAgentId: context.specialistAgentId ?? null,
    };
  }

  return {
    allowed: true,
    nextState: state,
    ownershipAgentId: context.ownershipAgentId ?? null,
    specialistAgentId: context.specialistAgentId ?? null,
  };
}

export function canTransition(
  state: ImobCrmWorkflowState,
  transition: ImobCrmWorkflowTransition,
  context: ImobCrmWorkflowContext = {},
) {
  return resolveTransition(state, transition, context).allowed;
}

export function getBlockerReason(
  state: ImobCrmWorkflowState,
  transition: ImobCrmWorkflowTransition,
  context: ImobCrmWorkflowContext = {},
) {
  return resolveTransition(state, transition, context).reasonCode ?? null;
}

export function classifyImobCrmWorkflowTransitionFromMessage(
  message: string,
  normalize: (value: string) => string,
): ImobCrmWorkflowTransition | null {
  const normalized = normalize(message);
  if (!normalized) return null;
  if (
    normalized.includes("atualizar existente")
    || normalized.includes("usar existente")
    || normalized.includes("editar existente")
  ) {
    return "choose_update_existing";
  }
  if (
    normalized === "cadastros"
    || normalized === "ver cadastros"
    || normalized.includes("listar cadastros")
  ) {
    return "show_records";
  }
  if (normalized.includes("criar novo") || normalized.includes("criar um novo") || normalized.includes("novo cadastro")) {
    return "choose_create_new";
  }
  if (
    normalized.includes("consultar")
    || normalized.includes("status")
    || normalized.includes("resumo")
    || normalized.includes("mostrar bloqueios")
    || normalized.includes("quais sao as pendencias")
    || normalized.includes("quais são as pendências")
    || normalized.includes("como destravar")
    || normalized.includes("ver cadastros")
    || normalized.includes("listar")
  ) {
    return "read_only_query";
  }
  if (
    normalized.includes("continuar")
    || normalized.includes("retomar")
    || normalized.includes("seguir")
    || normalized.includes("avancar")
    || normalized.includes("avançar")
    || normalized.includes("prosseguir")
    || normalized.includes("agendar")
    || normalized.includes("iniciar visita")
  ) {
    return "continue";
  }
  if (
    normalized.includes("confirmar seleção do scan")
    || normalized.includes("confirmar selecao do scan")
    || normalized.includes("confirmar imóvel do scan")
    || normalized.includes("confirmar imovel do scan")
    || normalized.includes("confirmar captação do scan")
    || normalized.includes("confirmar captacao do scan")
  ) {
    return "confirm_market_scan_selection";
  }
  if (
    normalized.includes("selecionar imóvel")
    || normalized.includes("selecionar imovel")
    || normalized.includes("selecionar item")
    || normalized.includes("usar imóvel do scan")
    || normalized.includes("usar imovel do scan")
    || normalized.includes("salvar imóvel do scan")
    || normalized.includes("salvar imovel do scan")
  ) {
    return "select_market_scan_item";
  }
  if (
    normalized.includes("varredura de mercado")
    || normalized.includes("fazer varredura")
    || normalized.includes("market scan")
    || normalized.includes("scan de mercado")
  ) {
    return "start_market_scan";
  }
  if (normalized.includes("cancelar")) return "cancel";
  return "continue";
}

export function isImobCrmWorkflowNextMessageValid(params: {
  state: ImobCrmWorkflowState;
  context?: ImobCrmWorkflowContext;
  message: string;
  normalize: (value: string) => string;
}) {
  const transition = classifyImobCrmWorkflowTransitionFromMessage(params.message, params.normalize);
  if (!transition) return false;
  return getAllowedTransitions(params.state, params.context ?? {}).includes(transition);
}

export function filterImobCrmWorkflowCtas(params: {
  state: ImobCrmWorkflowState;
  context?: ImobCrmWorkflowContext;
  ctas: ImobCrmWorkflowCta[];
  normalize: (value: string) => string;
}) {
  return params.ctas.filter((cta) => isImobCrmWorkflowNextMessageValid({
    state: params.state,
    context: params.context,
    message: cta.nextMessage,
    normalize: params.normalize,
  }));
}

export function buildImobCrmWorkflowReasonCodes(params: {
  state: ImobCrmWorkflowState;
  context?: ImobCrmWorkflowContext;
  includePilotReadOnly?: boolean;
  includeDocumentsOwnership?: boolean;
  includeVisitGuard?: boolean;
}) {
  const codes = new Set<string>();
  codes.add(params.state.replace(/\./g, "_"));
  if (params.includePilotReadOnly) codes.add("pilot_read_only");
  if (params.includeDocumentsOwnership) codes.add("documents_owned_by_imob");

  const continueReason = getBlockerReason(params.state, "continue", params.context ?? {});
  if (continueReason) codes.add(continueReason);
  if (params.state === "property.market_scan") codes.add("property_multiple_candidates_offer_market_scan");
  if (params.state === "property.market_scan.selection") codes.add("market_scan_selection_pending_confirmation");

  if (params.state === "visit.schedule" || params.includeVisitGuard) {
    const visitReason = getBlockerReason("visit.schedule", "continue", params.context ?? {});
    if (visitReason) codes.add(visitReason);
  }
  return [...codes];
}

export function deriveImobCrmWorkflowState(params: {
  operationalFlow?: string | null;
  operationalStatus?: string | null;
  readOnlyPilot?: boolean;
  marketScanSelectionStatus?: string | null;
}) {
  if (params.readOnlyPilot) return "pilot.status" as const;
  if (params.operationalFlow === "property.market_scan" && params.marketScanSelectionStatus === "pending_confirmation") {
    return "property.market_scan.selection" as const;
  }
  if (params.operationalFlow === "property.market_scan") return "property.market_scan" as const;
  if (params.operationalFlow === "owner.create" && params.operationalStatus === "awaiting_dedupe_decision") {
    return "owner.dedupe_review" as const;
  }
  if (params.operationalFlow === "documents.collect") return "documents.review" as const;
  if (
    params.operationalFlow === "property.create"
    || params.operationalFlow === "owner.create"
    || params.operationalFlow === "lead.qualify"
    || params.operationalFlow === "visit.schedule"
  ) {
    return params.operationalFlow;
  }
  return null;
}

export function deriveImobCrmReviewState(params: {
  flow?: string | null;
  readOnlyPilot?: boolean;
}): "case.review" | "pilot.status" | "documents.review" {
  if (params.readOnlyPilot) return "pilot.status";
  if (params.flow === "documents.collect" || params.flow === "contract.prepare") return "documents.review";
  return "case.review";
}
