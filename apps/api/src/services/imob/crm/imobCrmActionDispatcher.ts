// Maps canonical ImobCaseRecommendedAction.id values to executionRequest fields.
// Only "operational" and "governed" actionTypes reach execute; "consultive" falls
// through to the engine which handles them as mode=consult naturally.
type ActionExecutionSpec = {
  intent: string;
  operation: string;
  action: string;
  threadLabel: string;
};

// Canonical list of IMOB operational actionIds.
// Used by runWorker to detect IMOB runs eligible for post-run mutation.
// imob.contract.intake: document intake via Chat IMOB (Phase 1B)
export const IMOB_DISPATCHER_ACTION_IDS = [
  "owner.register",
  "property.create",
  "listing.activate",
  "lead.qualify",
  "visit.schedule",
  "documents.review",
  "documents.collect",
  "proposal.create",
  "deal.review",
  "contract.prepare",
  "commission.settle",
  "imob.contract.intake",
] as const;

export type ImobDispatcherActionId = (typeof IMOB_DISPATCHER_ACTION_IDS)[number];

const ACTION_EXECUTION_MAP: Record<string, ActionExecutionSpec> = {
  "owner.register": { intent: "capture", operation: "owner.create", action: "realestate.register_property", threadLabel: "Proprietário" },
  "property.create": { intent: "capture", operation: "property.create", action: "realestate.register_property", threadLabel: "Captação" },
  "listing.activate": { intent: "listing", operation: "listing.activate", action: "realestate.activate_listing", threadLabel: "Anúncio" },
  "lead.qualify": { intent: "lead", operation: "lead.qualify", action: "realestate.qualify_lead", threadLabel: "Qualificação" },
  "visit.schedule": { intent: "visit", operation: "visit.schedule", action: "realestate.schedule_visit", threadLabel: "Visita" },
  "documents.review": { intent: "documents", operation: "documents.collect", action: "realestate.collect_documents", threadLabel: "Documentação" },
  "documents.collect": { intent: "documents", operation: "documents.collect", action: "realestate.collect_documents", threadLabel: "Documentação" },
  "proposal.create": { intent: "proposal", operation: "proposal.create", action: "realestate.create_contract", threadLabel: "Proposta" },
  "deal.review": { intent: "deal", operation: "deal.review", action: "realestate.review_deal", threadLabel: "Negociação" },
  "contract.prepare": { intent: "contract", operation: "contract.prepare", action: "realestate.create_contract", threadLabel: "Contrato" },
  "commission.settle": { intent: "commission", operation: "commission.settle", action: "realestate.release_commission", threadLabel: "Comissão" },
};

export type ImobCrmActionDispatchInput = {
  actionId: string;
  caseId: string;
  canonical: Record<string, unknown> | null | undefined;
  message: string;
  timestamp: string;
};

type ImobCrmActionDispatchResult = Record<string, unknown>;

function asStr(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function buildBlockedResponse(detail: string): ImobCrmActionDispatchResult {
  return {
    mode: "blocked",
    action: "crm.action.blocked",
    threadLabel: "IMOB CRM",
    conversationState: {
      mode: "consult",
      pendingSlot: "none",
      resultOffset: 0,
      slots: {},
      operational: null,
    },
    presentation: {
      text: detail,
      metadata: { workflowReasonCode: "ACTION_NOT_ALLOWED_FOR_CASE" },
    },
  };
}

/**
 * Validates actionId against case.canonical.recommendedActions and returns an
 * OperationalResolution or null.
 *
 * Returns null in two cases:
 *   - actionType === "consultive": fall through so the engine handles it as consult
 *   - actionId is operational/governed but not in ACTION_EXECUTION_MAP: fall through
 *
 * Returns a blocked response when actionId is not found in recommendedActions.
 * Returns mode="execute" + executionRequest when actionId is valid and mapped.
 *
 * No DB access — caller is responsible for loading canonical from the case.
 */
export function resolveImobCrmActionDispatch(
  params: ImobCrmActionDispatchInput,
): ImobCrmActionDispatchResult | null {
  const { actionId, caseId, canonical, timestamp } = params;

  const recommendedActions = Array.isArray(
    (canonical as Record<string, unknown> | null | undefined)?.recommendedActions,
  )
    ? ((canonical as Record<string, unknown>).recommendedActions as Record<string, unknown>[])
    : [];

  const matched = recommendedActions.find((a) => asStr(a.id) === actionId);

  if (!matched) {
    return buildBlockedResponse(
      `Ação '${actionId}' não está entre as ações recomendadas para este caso.`,
    );
  }

  const actionType = asStr(matched.actionType) ?? "consultive";

  // Consultive actions produce mode=consult via the normal engine — do not intercept
  if (actionType === "consultive") {
    return null;
  }

  const spec = ACTION_EXECUTION_MAP[actionId];
  if (!spec) {
    // Operational/governed but no static execution mapping — fall through to engine
    return null;
  }

  const label = asStr(matched.label) ?? actionId;
  const reasonCode = asStr(matched.reasonCode);

  return {
    mode: "execute",
    action: spec.action,
    threadLabel: spec.threadLabel,
    conversationState: {
      mode: "execute",
      pendingSlot: "none",
      resultOffset: 0,
      slots: {},
      operational: {
        flow: spec.operation,
        status: "ready_for_review",
        pendingFields: [],
      },
    },
    presentation: {
      text: `Iniciando: ${label}.`,
      metadata: {
        actionId,
        caseId,
        reasonCode: reasonCode ?? null,
        dispatchSource: "action-dispatcher",
      },
    },
    executionRequest: {
      intent: spec.intent,
      operation: spec.operation,
      action: spec.action,
      prompt: `${label}. Caso: ${caseId}. Solicitado em ${timestamp}.`,
      input: {
        caseId,
        actionId,
        reasonCode: reasonCode ?? null,
        requestedAt: timestamp,
      },
    },
    caseContext: { caseId },
  };
}
