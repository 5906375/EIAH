import type {
  ImobCaseJourneyType,
  ImobOperationalFlow,
  ImobPendingAction,
  ImobPendingActionEntityType,
  ImobPendingActionSource,
} from "../imobConversationContract";
import type { ImobReasonCode } from "../control/imobReasonCodeCatalog";

type ActionExecutionSpec = {
  intent: string;
  operation: ImobOperationalFlow;
  action: string;
  threadLabel: string;
  entityType: ImobPendingActionEntityType;
  journey: ImobCaseJourneyType;
};

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
  "owner.register": {
    intent: "capture",
    operation: "owner.create",
    action: "realestate.register_property",
    threadLabel: "Proprietário",
    entityType: "owner",
    journey: "property_capture",
  },
  "property.create": {
    intent: "capture",
    operation: "property.create",
    action: "realestate.register_property",
    threadLabel: "Captação",
    entityType: "property",
    journey: "property_capture",
  },
  "listing.activate": {
    intent: "listing",
    operation: "listing.activate",
    action: "realestate.activate_listing",
    threadLabel: "Anúncio",
    entityType: "listing",
    journey: "operations",
  },
  "lead.qualify": {
    intent: "lead",
    operation: "lead.qualify",
    action: "realestate.qualify_lead",
    threadLabel: "Qualificação",
    entityType: "lead",
    journey: "lead_qualification",
  },
  "visit.schedule": {
    intent: "visit",
    operation: "visit.schedule",
    action: "realestate.schedule_visit",
    threadLabel: "Visita",
    entityType: "visit",
    journey: "visit_follow_up",
  },
  "documents.review": {
    intent: "documents",
    operation: "documents.collect",
    action: "realestate.collect_documents",
    threadLabel: "Documentação",
    entityType: "documents",
    journey: "documentation",
  },
  "documents.collect": {
    intent: "documents",
    operation: "documents.collect",
    action: "realestate.collect_documents",
    threadLabel: "Documentação",
    entityType: "documents",
    journey: "documentation",
  },
  "proposal.create": {
    intent: "proposal",
    operation: "proposal.create",
    action: "realestate.create_contract",
    threadLabel: "Proposta",
    entityType: "proposal",
    journey: "proposal",
  },
  "deal.review": {
    intent: "deal",
    operation: "deal.review",
    action: "realestate.review_deal",
    threadLabel: "Negociação",
    entityType: "deal",
    journey: "negotiation",
  },
  "contract.prepare": {
    intent: "contract",
    operation: "contract.prepare",
    action: "realestate.create_contract",
    threadLabel: "Contrato",
    entityType: "contract",
    journey: "contract",
  },
  "commission.settle": {
    intent: "commission",
    operation: "commission.settle",
    action: "realestate.release_commission",
    threadLabel: "Comissão",
    entityType: "commission",
    journey: "commission",
  },
};

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function getImobPendingActionSpec(actionId: string) {
  return ACTION_EXECUTION_MAP[actionId] ?? null;
}

export function buildImobPendingAction(params: {
  actionId: string;
  sourceActionId?: string | null;
  caseId: string;
  threadId: string;
  reasonCode?: ImobReasonCode | null;
  createdAt: string;
  expiresAt?: string | null;
  source: ImobPendingActionSource;
  status?: ImobPendingAction["status"];
}) {
  const spec = getImobPendingActionSpec(params.actionId);
  if (!spec) return null;
  return {
    actionId: params.actionId,
    sourceActionId: params.sourceActionId ?? params.actionId,
    caseId: params.caseId,
    threadId: params.threadId,
    reasonCode: params.reasonCode ?? null,
    status: params.status ?? "awaiting_confirmation",
    createdAt: params.createdAt,
    expiresAt: params.expiresAt ?? null,
    entityType: spec.entityType,
    journey: spec.journey,
    source: params.source,
  } satisfies ImobPendingAction;
}

export function parseImobPendingAction(value: unknown): ImobPendingAction | null {
  const obj = asObject(value);
  if (!obj) return null;
  const actionId = asString(obj.actionId);
  const sourceActionId = asString(obj.sourceActionId);
  const caseId = asString(obj.caseId);
  const threadId = asString(obj.threadId);
  const createdAt = asString(obj.createdAt);
  const entityType = asString(obj.entityType);
  const journey = asString(obj.journey);
  const source = asString(obj.source);
  const status = asString(obj.status);
  if (
    !actionId ||
    !sourceActionId ||
    !caseId ||
    !threadId ||
    !createdAt ||
    !entityType ||
    !journey ||
    !source ||
    !status
  ) {
    return null;
  }
  const spec = getImobPendingActionSpec(actionId);
  if (!spec) return null;
  return {
    actionId,
    sourceActionId,
    caseId,
    threadId,
    reasonCode: asString(obj.reasonCode) as ImobReasonCode | null,
    status: status as ImobPendingAction["status"],
    createdAt,
    expiresAt: asString(obj.expiresAt),
    entityType: entityType as ImobPendingActionEntityType,
    journey: journey as ImobCaseJourneyType,
    source: source as ImobPendingActionSource,
  };
}

export function isImobPendingActionConfirmationMessage(message: string) {
  const normalized = message
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
  return [
    "confirmo",
    "confirmar",
    "sim",
    "ok",
    "pode executar",
    "pode seguir",
    "seguir",
  ].some((value) => normalized === value);
}

export function withImobPendingActionStatus(
  pendingAction: ImobPendingAction,
  status: ImobPendingAction["status"],
) {
  return {
    ...pendingAction,
    status,
  } satisfies ImobPendingAction;
}

export function buildImobBlockedPendingActionResolution(params: {
  detail: string;
  reasonCode: ImobReasonCode;
  pendingAction?: ImobPendingAction | null;
}) {
  const spec = params.pendingAction ? getImobPendingActionSpec(params.pendingAction.actionId) : null;
  return {
    mode: "blocked",
    action: "crm.action.pending_confirmation_blocked",
    threadLabel: spec?.threadLabel ?? "IMOB CRM",
    conversationState: {
      mode: "blocked",
      pendingSlot: "none",
      resultOffset: 0,
      slots: {},
      operational: params.pendingAction && spec
        ? {
            flow: spec.operation,
            status: "ready_for_review",
            pendingFields: [],
            pendingAction: params.pendingAction,
          }
        : null,
    },
    presentation: {
      text: params.detail,
      metadata: {
        workflowReasonCode: params.reasonCode,
        reasonCode: params.reasonCode,
      },
    },
    caseContext: params.pendingAction
      ? {
          caseId: params.pendingAction.caseId,
          threadId: params.pendingAction.threadId,
        }
      : undefined,
  };
}

export function buildImobExecuteResolutionFromPendingAction(params: {
  pendingAction: ImobPendingAction;
  label?: string | null;
}) {
  const spec = getImobPendingActionSpec(params.pendingAction.actionId);
  if (!spec) return null;
  const label = params.label?.trim() || params.pendingAction.sourceActionId || params.pendingAction.actionId;
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
        pendingAction: params.pendingAction,
      },
    },
    presentation: {
      text: `Iniciando: ${label}.`,
      metadata: {
        actionId: params.pendingAction.actionId,
        sourceActionId: params.pendingAction.sourceActionId,
        caseId: params.pendingAction.caseId,
        threadId: params.pendingAction.threadId,
        reasonCode: params.pendingAction.reasonCode ?? null,
        pendingActionStatus: params.pendingAction.status,
        dispatchSource: params.pendingAction.source,
      },
    },
    executionRequest: {
      intent: spec.intent,
      operation: spec.operation,
      action: spec.action,
      prompt: `${label}. Caso: ${params.pendingAction.caseId}. Solicitado em ${params.pendingAction.createdAt}.`,
      input: {
        caseId: params.pendingAction.caseId,
        actionId: params.pendingAction.actionId,
        sourceActionId: params.pendingAction.sourceActionId,
        threadId: params.pendingAction.threadId,
        reasonCode: params.pendingAction.reasonCode ?? null,
        requestedAt: params.pendingAction.createdAt,
        pendingActionStatus: params.pendingAction.status,
      },
    },
    caseContext: {
      caseId: params.pendingAction.caseId,
      threadId: params.pendingAction.threadId,
    },
  };
}
