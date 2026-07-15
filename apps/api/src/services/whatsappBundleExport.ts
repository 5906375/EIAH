import type { WhatsappEvidenceBundle } from "./whatsappEvidenceBundle";

export const WHATSAPP_BUNDLE_EXPORT_VERSION = "whatsapp.read_only.bundle_export.v1";

type SafeTimestampField = string | null;

export type WhatsappBundleExport = {
  version: typeof WHATSAPP_BUNDLE_EXPORT_VERSION;
  decision: WhatsappEvidenceBundle["decisionClass"];
  reasonCode: string;
  status: number;
  eventId: string | null;
  provider: string | null;
  messageType: string | null;
  tenantId: string | null;
  workspaceId: string | null;
  scope: string | null;
  sideEffects: 0;
  piiMasked: true;
  receivedAt: SafeTimestampField;
  providerTimestamp: SafeTimestampField;
  exportedAt: string;
};

function parseIsoDate(value: unknown): SafeTimestampField {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

export function buildWhatsappBundleExport(params: {
  evidenceBundle: WhatsappEvidenceBundle;
  receivedAt?: unknown;
  providerTimestamp?: unknown;
  exportedAt?: number;
}): WhatsappBundleExport {
  return {
    version: WHATSAPP_BUNDLE_EXPORT_VERSION,
    decision: params.evidenceBundle.decisionClass,
    reasonCode: params.evidenceBundle.reasonCode,
    status: params.evidenceBundle.httpStatus,
    eventId: params.evidenceBundle.eventId,
    provider: params.evidenceBundle.provider,
    messageType: params.evidenceBundle.messageType,
    tenantId: params.evidenceBundle.tenantId,
    workspaceId: params.evidenceBundle.workspaceId,
    scope: params.evidenceBundle.scope,
    sideEffects: 0,
    piiMasked: true,
    receivedAt: parseIsoDate(params.receivedAt),
    providerTimestamp: parseIsoDate(params.providerTimestamp),
    exportedAt: new Date(params.exportedAt ?? Date.now()).toISOString(),
  };
}
