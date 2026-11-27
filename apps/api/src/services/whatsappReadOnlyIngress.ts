import { resolveChannelBinding } from "./channelBinding";
import { evaluateReplayGuard, type ReplayGuardStore } from "./replayGuard";
import { buildWhatsappBundleExport, type WhatsappBundleExport } from "./whatsappBundleExport";
import { buildWhatsappEvidenceBundle, type WhatsappEvidenceBundle } from "./whatsappEvidenceBundle";

export const WHATSAPP_PROVIDER = "whatsapp";
export const WHATSAPP_EVENT_VERSION = "whatsapp.adapter.event.v1";
export const WHATSAPP_READ_ONLY_SCOPE = "whatsapp:inbound:read_only";
export const WHATSAPP_READ_ONLY_ENTITLEMENT = "channel.whatsapp.inbound.read_only";
export type WhatsappIngressResult = {
  status: number;
  body: {
    ok: boolean;
    reasonCode?: string;
    error?: { code: string; message: string };
    evidenceBundle: WhatsappEvidenceBundle;
    bundleExport: WhatsappBundleExport;
    data?: Record<string, unknown>;
  };
};

export function parseNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseIsoDate(value: unknown): string | null {
  const parsed = parseNonEmptyString(value);
  if (!parsed) return null;
  const asMs = Date.parse(parsed);
  return Number.isFinite(asMs) ? new Date(asMs).toISOString() : null;
}

function maskPhoneMasked(value: string) {
  const trimmed = value.trim();
  if (trimmed.length <= 4) return "[redacted]";
  return `${trimmed.slice(0, 2)}***${trimmed.slice(-2)}`;
}

export function buildWhatsappFailure(
  status: number,
  code: string,
  message: string,
  context: {
    eventId?: unknown;
    provider?: unknown;
    messageType?: unknown;
    tenantId?: unknown;
    workspaceId?: unknown;
    scope?: unknown;
    receivedAt?: unknown;
    providerTimestamp?: unknown;
  } = {}
): WhatsappIngressResult {
  const evidenceBundle = buildWhatsappEvidenceBundle({
    reasonCode: code,
    httpStatus: status,
    eventId: context.eventId,
    provider: context.provider,
    messageType: context.messageType,
    tenantId: context.tenantId,
    workspaceId: context.workspaceId,
    scope: context.scope,
    decisionClass: "blocked",
  });
  return { status, body: {
    ok: false,
    error: {
      code,
      message,
    },
    evidenceBundle,
    bundleExport: buildWhatsappBundleExport({
      evidenceBundle,
      receivedAt: context.receivedAt,
      providerTimestamp: context.providerTimestamp,
    }),
  } };
}

export function classifyRequestedAction(body: Record<string, unknown>) {
  const rawAction = parseNonEmptyString(body.action)
    ?? parseNonEmptyString(body.requestedAction)
    ?? parseNonEmptyString(body.intent)
    ?? parseNonEmptyString(body.operation);
  if (!rawAction) return null;

  const normalized = rawAction.toLowerCase();
  const criticalActions = [
    "lead.create",
    "lead.discard",
    "create",
    "update",
    "delete",
    "publish",
    "settle",
    "approve",
    "mutate",
  ];
  if (criticalActions.some((token) => normalized.includes(token))) {
    return "CRITICAL_ACTION_BLOCKED";
  }
  return "READ_ONLY_MODE";
}

export function validatePayload(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false as const, code: "WHATSAPP_PAYLOAD_INVALID", message: "Payload must be an object" };
  }

  const record = body as Record<string, unknown>;
  const eventId = parseNonEmptyString(record.eventId);
  if (!eventId) {
    return { ok: false as const, code: "WHATSAPP_EVENT_ID_MISSING", message: "eventId is required" };
  }

  if (parseNonEmptyString(record.version) !== WHATSAPP_EVENT_VERSION) {
    return { ok: false as const, code: "WHATSAPP_PAYLOAD_INVALID", message: "Unsupported event version" };
  }
  if (parseNonEmptyString(record.provider) !== WHATSAPP_PROVIDER) {
    return { ok: false as const, code: "WHATSAPP_PROVIDER_UNSUPPORTED", message: "Unsupported provider" };
  }

  if (!parseIsoDate(record.receivedAt) || !parseIsoDate(record.providerTimestamp)) {
    return { ok: false as const, code: "WHATSAPP_PAYLOAD_INVALID", message: "Invalid timestamp fields" };
  }

  const fromPhoneHash = parseNonEmptyString(record.fromPhoneHash);
  const fromPhoneMasked = parseNonEmptyString(record.fromPhoneMasked);
  const rawPayloadRef = parseNonEmptyString(record.rawPayloadRef);
  if (!fromPhoneHash || !fromPhoneMasked || !rawPayloadRef) {
    return { ok: false as const, code: "WHATSAPP_PAYLOAD_INVALID", message: "Safe phone identity and rawPayloadRef are required" };
  }

  const messageType = parseNonEmptyString(record.messageType);
  if (!messageType || !["text", "interactive", "unknown"].includes(messageType)) {
    return { ok: false as const, code: "WHATSAPP_MESSAGE_TYPE_UNSUPPORTED", message: "Unsupported message type" };
  }
  if (messageType === "text" && !parseNonEmptyString(record.text)) {
    return { ok: false as const, code: "WHATSAPP_PAYLOAD_INVALID", message: "text is required for text messages" };
  }

  if (record.readOnly !== true) {
    return { ok: false as const, code: "READ_ONLY_MODE", message: "Inbound WhatsApp handler only accepts read-only events" };
  }

  return { ok: true as const, record };
}

// Internal domain-free processor: transports authenticate before calling it.
// It is not a router and does not read environment, open sockets or load infrastructure.
export function evaluateWhatsappReadOnlyIngress(params: {
  body: Record<string, unknown>;
  eventId: string;
  provider: string;
  bindingsJson: string | null | undefined;
  nowMs: number;
  replay?: { store: ReplayGuardStore; eventKey: string; replayKey: string; payloadDigest: string; maxAgeMs: number };
}): WhatsappIngressResult {
  const { body, eventId: eventIdHeader, provider: providerHeader } = params;
  const bindingDecision = resolveChannelBinding({
    fromPhoneHash: body.fromPhoneHash,
    bindingsJson: params.bindingsJson,
    nowMs: params.nowMs,
    requiredScope: WHATSAPP_READ_ONLY_SCOPE,
    requiredEntitlement: WHATSAPP_READ_ONLY_ENTITLEMENT,
  });
  if (!bindingDecision.allowed) {
    return buildWhatsappFailure( 403, bindingDecision.reasonCode!, "WhatsApp binding or entitlement resolution failed", {
      eventId: eventIdHeader,
      provider: providerHeader,
      messageType: body.messageType,
      tenantId: bindingDecision.tenantId,
      workspaceId: bindingDecision.workspaceId,
      scope: bindingDecision.scope,
      receivedAt: body.receivedAt,
      providerTimestamp: body.providerTimestamp,
    });
  }

  if (body.tenantId != null && body.tenantId !== bindingDecision.tenantId) {
    return buildWhatsappFailure( 400, "WHATSAPP_PAYLOAD_INVALID", "tenantId does not match the bound scope", {
      eventId: eventIdHeader,
      provider: providerHeader,
      messageType: body.messageType,
      tenantId: bindingDecision.tenantId,
      workspaceId: bindingDecision.workspaceId,
      scope: bindingDecision.scope,
      receivedAt: body.receivedAt,
      providerTimestamp: body.providerTimestamp,
    });
  }
  if (body.workspaceId != null && body.workspaceId !== bindingDecision.workspaceId) {
    return buildWhatsappFailure( 400, "WHATSAPP_PAYLOAD_INVALID", "workspaceId does not match the bound scope", {
      eventId: eventIdHeader,
      provider: providerHeader,
      messageType: body.messageType,
      tenantId: bindingDecision.tenantId,
      workspaceId: bindingDecision.workspaceId,
      scope: bindingDecision.scope,
      receivedAt: body.receivedAt,
      providerTimestamp: body.providerTimestamp,
    });
  }
  if (body.scope != null && body.scope !== bindingDecision.scope) {
    return buildWhatsappFailure( 400, "WHATSAPP_PAYLOAD_INVALID", "scope does not match the bound scope", {
      eventId: eventIdHeader,
      provider: providerHeader,
      messageType: body.messageType,
      tenantId: bindingDecision.tenantId,
      workspaceId: bindingDecision.workspaceId,
      scope: bindingDecision.scope,
    });
  }

  if (params.replay) {
    const replayDecision = evaluateReplayGuard({ ...params.replay, nowMs: params.nowMs });
    if (!replayDecision.accepted) {
      return buildWhatsappFailure(409, replayDecision.reasonCode!,
        replayDecision.replay ? "Replay detected for WhatsApp inbound event" : "Duplicate WhatsApp event detected",
        { eventId: eventIdHeader, provider: providerHeader, messageType: body.messageType,
          tenantId: bindingDecision.tenantId, workspaceId: bindingDecision.workspaceId,
          scope: bindingDecision.scope, receivedAt: body.receivedAt, providerTimestamp: body.providerTimestamp });
    }
  }

  const evidenceBundle = buildWhatsappEvidenceBundle({
    reasonCode: "ACCEPTED_READ_ONLY",
    httpStatus: 202,
    eventId: eventIdHeader,
    provider: WHATSAPP_PROVIDER,
    messageType: body.messageType,
    tenantId: bindingDecision.tenantId,
    workspaceId: bindingDecision.workspaceId,
    scope: bindingDecision.scope,
    decisionClass: "accepted_read_only",
  });
  return { status: 202, body: {
    ok: true,
    reasonCode: "ACCEPTED_READ_ONLY",
    evidenceBundle,
    bundleExport: buildWhatsappBundleExport({
      evidenceBundle,
      receivedAt: body.receivedAt,
      providerTimestamp: body.providerTimestamp,
    }),
    data: {
      eventId: eventIdHeader,
      provider: WHATSAPP_PROVIDER,
      readOnly: true,
      messageType: body.messageType,
      fromPhoneMasked: maskPhoneMasked(String(body.fromPhoneMasked)),
      tenantId: bindingDecision.tenantId,
      workspaceId: bindingDecision.workspaceId,
      scope: bindingDecision.scope,
      fallbackUsed: false,
    },
  } };
}
