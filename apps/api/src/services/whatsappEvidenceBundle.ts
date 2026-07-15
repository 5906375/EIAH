type EvidenceBundleField = string | null;

export type WhatsappEvidenceBundle = {
  reasonCode: string;
  httpStatus: number;
  eventId: EvidenceBundleField;
  provider: EvidenceBundleField;
  messageType: EvidenceBundleField;
  tenantId: EvidenceBundleField;
  workspaceId: EvidenceBundleField;
  scope: EvidenceBundleField;
  decisionClass: "accepted_read_only" | "blocked";
  sideEffects: 0;
};

function parseNonEmptyString(value: unknown): EvidenceBundleField {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function buildWhatsappEvidenceBundle(params: {
  reasonCode: string;
  httpStatus: number;
  eventId?: unknown;
  provider?: unknown;
  messageType?: unknown;
  tenantId?: unknown;
  workspaceId?: unknown;
  scope?: unknown;
  decisionClass: "accepted_read_only" | "blocked";
}): WhatsappEvidenceBundle {
  return {
    reasonCode: params.reasonCode,
    httpStatus: params.httpStatus,
    eventId: parseNonEmptyString(params.eventId),
    provider: parseNonEmptyString(params.provider),
    messageType: parseNonEmptyString(params.messageType),
    tenantId: parseNonEmptyString(params.tenantId),
    workspaceId: parseNonEmptyString(params.workspaceId),
    scope: parseNonEmptyString(params.scope),
    decisionClass: params.decisionClass,
    sideEffects: 0,
  };
}
