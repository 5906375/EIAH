import crypto from "node:crypto";
import { createGovernedRouter } from "../middlewares/asyncHandler";
import { resolveChannelBinding } from "../services/channelBinding";
import {
  createReplayGuardStore,
  evaluateReplayGuard,
  resetReplayGuardStore,
} from "../services/replayGuard";
import { buildWhatsappEvidenceBundle } from "../services/whatsappEvidenceBundle";

export const whatsappRouter = createGovernedRouter();

const WHATSAPP_PROVIDER = "whatsapp";
const WHATSAPP_EVENT_VERSION = "whatsapp.adapter.event.v1";
const WHATSAPP_SIGNATURE_VERSION = "v1";
const REQUIRED_SCOPE = "whatsapp:inbound:read_only";
const REQUIRED_ENTITLEMENT = "channel.whatsapp.inbound.read_only";

const whatsappReplayGuardStore = createReplayGuardStore();

function parseNonEmptyString(value: unknown): string | null {
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

function parseTimestampToMs(value: string | null) {
  if (!value) return Number.NaN;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return numeric > 1e12 ? numeric : numeric * 1000;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function parsePositiveIntEnv(name: string, fallback: number) {
  const raw = Number(process.env[name] ?? String(fallback));
  return Number.isFinite(raw) && raw > 0 ? Math.trunc(raw) : fallback;
}

function getPayloadByteLength(body: unknown) {
  return Buffer.byteLength(JSON.stringify(body ?? {}), "utf8");
}

function getMaxPayloadBytes() {
  return parsePositiveIntEnv("WHATSAPP_WEBHOOK_MAX_PAYLOAD_BYTES", 16 * 1024);
}

function getReplayWindowSeconds() {
  return parsePositiveIntEnv("WHATSAPP_WEBHOOK_REPLAY_WINDOW_SECONDS", 300);
}

function getClockSkewSeconds() {
  return parsePositiveIntEnv("WHATSAPP_WEBHOOK_CLOCK_SKEW_SECONDS", 30);
}

function getSignatureSecret() {
  return process.env.WHATSAPP_WEBHOOK_STUB_SECRET?.trim() || "whatsapp-read-only-stub-secret";
}

function maskPhoneMasked(value: string) {
  const trimmed = value.trim();
  if (trimmed.length <= 4) return "[redacted]";
  return `${trimmed.slice(0, 2)}***${trimmed.slice(-2)}`;
}

function failResponse(
  res: { status: (code: number) => { json: (body: unknown) => unknown } },
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
  } = {}
) {
  return res.status(status).json({
    ok: false,
    error: {
      code,
      message,
    },
    evidenceBundle: buildWhatsappEvidenceBundle({
      reasonCode: code,
      httpStatus: status,
      eventId: context.eventId,
      provider: context.provider,
      messageType: context.messageType,
      tenantId: context.tenantId,
      workspaceId: context.workspaceId,
      scope: context.scope,
      decisionClass: "blocked",
    }),
  });
}

function buildPayloadDigest(body: Record<string, unknown>) {
  const canonical = JSON.stringify({
    version: body.version ?? null,
    eventId: body.eventId ?? null,
    provider: body.provider ?? null,
    receivedAt: body.receivedAt ?? null,
    providerTimestamp: body.providerTimestamp ?? null,
    fromPhoneHash: body.fromPhoneHash ?? null,
    fromPhoneMasked: body.fromPhoneMasked ?? null,
    messageType: body.messageType ?? null,
    text: body.text ?? null,
    rawPayloadRef: body.rawPayloadRef ?? null,
    tenantId: body.tenantId ?? null,
    workspaceId: body.workspaceId ?? null,
    scope: body.scope ?? null,
    readOnly: body.readOnly ?? null,
  });
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

export function buildWhatsappCanonicalString(params: {
  provider: string;
  eventId: string;
  timestamp: string;
  version: string;
  providerTimestamp: string;
  messageType: string;
  payloadDigest: string;
}) {
  return [
    params.provider,
    params.eventId,
    params.timestamp,
    params.version,
    params.providerTimestamp,
    params.messageType,
    params.payloadDigest,
  ].join("\n");
}

export function computeWhatsappStubSignature(secret: string, canonical: string) {
  return crypto.createHmac("sha256", secret).update(canonical).digest("hex");
}

function normalizeSignatureHeader(signatureHeader: string) {
  const trimmed = signatureHeader.trim();
  const normalized = trimmed.includes("=") ? trimmed.split("=").pop() ?? "" : trimmed;
  return normalized.trim();
}

function isHex(value: string) {
  return value.length > 0 && value.length % 2 === 0 && /^[0-9a-f]+$/i.test(value);
}

export function verifyWhatsappSignature(params: {
  provided: string;
  expected: string;
}) {
  const normalized = normalizeSignatureHeader(params.provided);
  if (!isHex(normalized) || !isHex(params.expected)) {
    return { normalized, matches: false };
  }

  const providedBuffer = Buffer.from(normalized, "hex");
  const expectedBuffer = Buffer.from(params.expected, "hex");
  if (providedBuffer.length !== expectedBuffer.length) {
    return { normalized, matches: false };
  }

  return {
    normalized,
    matches: crypto.timingSafeEqual(providedBuffer, expectedBuffer),
  };
}

function classifyRequestedAction(body: Record<string, unknown>) {
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

function validatePayload(body: unknown) {
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

export function resetWhatsappWebhookGuards() {
  resetReplayGuardStore(whatsappReplayGuardStore);
}

export async function handleWhatsappInboundWebhook(
  req: {
    body?: unknown;
    header: (name: string) => string | undefined;
  },
  res: {
    status: (code: number) => { json: (body: unknown) => unknown };
  }
) {
  const payloadBytes = getPayloadByteLength(req.body);
  if (payloadBytes > getMaxPayloadBytes()) {
    return failResponse(res, 413, "WHATSAPP_PAYLOAD_TOO_LARGE", "Payload exceeds the read-only WhatsApp limit");
  }

  const providerHeader = parseNonEmptyString(req.header("x-eiah-provider"));
  if (providerHeader !== WHATSAPP_PROVIDER) {
    return failResponse(res, 400, "WHATSAPP_PROVIDER_UNSUPPORTED", "Unsupported WhatsApp provider");
  }

  const eventIdHeader = parseNonEmptyString(req.header("x-eiah-event-id"));
  if (!eventIdHeader) {
    return failResponse(res, 400, "WHATSAPP_EVENT_ID_MISSING", "Missing X-EIAH-Event-Id header");
  }

  const timestampHeader = parseNonEmptyString(req.header("x-eiah-timestamp"));
  if (!timestampHeader) {
    return failResponse(res, 401, "WHATSAPP_TIMESTAMP_MISSING", "Missing X-EIAH-Timestamp header");
  }

  const signatureHeader = parseNonEmptyString(req.header("x-eiah-signature"));
  if (!signatureHeader) {
    return failResponse(res, 401, "WHATSAPP_SIGNATURE_MISSING", "Missing X-EIAH-Signature header");
  }

  const signatureVersion = parseNonEmptyString(req.header("x-eiah-signature-version"));
  if (signatureVersion !== WHATSAPP_SIGNATURE_VERSION) {
    return failResponse(res, 401, "WHATSAPP_SIGNATURE_VERSION_UNSUPPORTED", "Unsupported signature version");
  }

  const timestampMs = parseTimestampToMs(timestampHeader);
  const maxAgeMs = (getReplayWindowSeconds() + getClockSkewSeconds()) * 1000;
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > maxAgeMs) {
    return failResponse(res, 401, "WHATSAPP_TIMESTAMP_OUT_OF_WINDOW", "Webhook timestamp outside replay window");
  }

  const payloadValidation = validatePayload(req.body);
  if (!payloadValidation.ok) {
    const status = payloadValidation.code === "READ_ONLY_MODE"
      ? 403
      : payloadValidation.code === "WHATSAPP_MESSAGE_TYPE_UNSUPPORTED"
        ? 400
        : payloadValidation.code === "WHATSAPP_PROVIDER_UNSUPPORTED"
          ? 400
          : payloadValidation.code === "WHATSAPP_EVENT_ID_MISSING"
            ? 400
            : 400;
    return failResponse(res, status, payloadValidation.code, payloadValidation.message, {
      eventId: eventIdHeader,
      provider: providerHeader,
      messageType: req.body && typeof req.body === "object" && !Array.isArray(req.body)
        ? (req.body as Record<string, unknown>).messageType
        : null,
      tenantId: req.body && typeof req.body === "object" && !Array.isArray(req.body)
        ? (req.body as Record<string, unknown>).tenantId
        : null,
      workspaceId: req.body && typeof req.body === "object" && !Array.isArray(req.body)
        ? (req.body as Record<string, unknown>).workspaceId
        : null,
      scope: req.body && typeof req.body === "object" && !Array.isArray(req.body)
        ? (req.body as Record<string, unknown>).scope
        : null,
    });
  }

  const body = payloadValidation.record;
  if (body.eventId !== eventIdHeader) {
    return failResponse(res, 400, "WHATSAPP_PAYLOAD_INVALID", "Header eventId and body eventId must match", {
      eventId: eventIdHeader,
      provider: providerHeader,
      messageType: body.messageType,
      tenantId: body.tenantId,
      workspaceId: body.workspaceId,
      scope: body.scope,
    });
  }

  const resolvedAction = classifyRequestedAction(body);
  if (resolvedAction) {
    return failResponse(
      res,
      403,
      resolvedAction,
      resolvedAction === "CRITICAL_ACTION_BLOCKED"
        ? "Critical WhatsApp actions are blocked in read-only mode"
        : "WhatsApp inbound handler is read-only",
      {
        eventId: eventIdHeader,
        provider: providerHeader,
        messageType: body.messageType,
        tenantId: body.tenantId,
        workspaceId: body.workspaceId,
        scope: body.scope,
      }
    );
  }

  const payloadDigest = buildPayloadDigest(body);
  const canonical = buildWhatsappCanonicalString({
    provider: providerHeader,
    eventId: eventIdHeader,
    timestamp: timestampHeader,
    version: String(body.version),
    providerTimestamp: String(body.providerTimestamp),
    messageType: String(body.messageType),
    payloadDigest,
  });
  const expectedSignature = computeWhatsappStubSignature(getSignatureSecret(), canonical);
  const signatureCheck = verifyWhatsappSignature({
    provided: signatureHeader,
    expected: expectedSignature,
  });
  if (!signatureCheck.matches) {
    return failResponse(res, 401, "WHATSAPP_SIGNATURE_INVALID", "Invalid WhatsApp signature", {
      eventId: eventIdHeader,
      provider: providerHeader,
      messageType: body.messageType,
      tenantId: body.tenantId,
      workspaceId: body.workspaceId,
      scope: body.scope,
    });
  }

  const bindingDecision = resolveChannelBinding({
    fromPhoneHash: body.fromPhoneHash,
    bindingsJson: process.env.WHATSAPP_READ_ONLY_BINDINGS_JSON,
    nowMs: Date.now(),
    requiredScope: REQUIRED_SCOPE,
    requiredEntitlement: REQUIRED_ENTITLEMENT,
  });
  if (!bindingDecision.allowed) {
    return failResponse(res, 403, bindingDecision.reasonCode!, "WhatsApp binding or entitlement resolution failed", {
      eventId: eventIdHeader,
      provider: providerHeader,
      messageType: body.messageType,
      tenantId: bindingDecision.tenantId,
      workspaceId: bindingDecision.workspaceId,
      scope: bindingDecision.scope,
    });
  }

  if (body.tenantId != null && body.tenantId !== bindingDecision.tenantId) {
    return failResponse(res, 400, "WHATSAPP_PAYLOAD_INVALID", "tenantId does not match the bound scope", {
      eventId: eventIdHeader,
      provider: providerHeader,
      messageType: body.messageType,
      tenantId: bindingDecision.tenantId,
      workspaceId: bindingDecision.workspaceId,
      scope: bindingDecision.scope,
    });
  }
  if (body.workspaceId != null && body.workspaceId !== bindingDecision.workspaceId) {
    return failResponse(res, 400, "WHATSAPP_PAYLOAD_INVALID", "workspaceId does not match the bound scope", {
      eventId: eventIdHeader,
      provider: providerHeader,
      messageType: body.messageType,
      tenantId: bindingDecision.tenantId,
      workspaceId: bindingDecision.workspaceId,
      scope: bindingDecision.scope,
    });
  }
  if (body.scope != null && body.scope !== bindingDecision.scope) {
    return failResponse(res, 400, "WHATSAPP_PAYLOAD_INVALID", "scope does not match the bound scope", {
      eventId: eventIdHeader,
      provider: providerHeader,
      messageType: body.messageType,
      tenantId: bindingDecision.tenantId,
      workspaceId: bindingDecision.workspaceId,
      scope: bindingDecision.scope,
    });
  }

  const nowMs = Date.now();
  const eventKey = `${providerHeader}:${eventIdHeader}`;
  const replayKey = `${eventKey}:${timestampHeader}:${signatureCheck.normalized}`;
  const replayDecision = evaluateReplayGuard({
    store: whatsappReplayGuardStore,
    eventKey,
    replayKey,
    payloadDigest,
    nowMs,
    maxAgeMs,
  });
  if (!replayDecision.accepted) {
    return failResponse(
      res,
      409,
      replayDecision.reasonCode!,
      replayDecision.replay
        ? "Replay detected for WhatsApp inbound event"
        : "Duplicate WhatsApp event detected",
      {
        eventId: eventIdHeader,
        provider: providerHeader,
        messageType: body.messageType,
        tenantId: bindingDecision.tenantId,
        workspaceId: bindingDecision.workspaceId,
        scope: bindingDecision.scope,
      }
    );
  }

  return res.status(202).json({
    ok: true,
    reasonCode: "ACCEPTED_READ_ONLY",
    evidenceBundle: buildWhatsappEvidenceBundle({
      reasonCode: "ACCEPTED_READ_ONLY",
      httpStatus: 202,
      eventId: eventIdHeader,
      provider: WHATSAPP_PROVIDER,
      messageType: body.messageType,
      tenantId: bindingDecision.tenantId,
      workspaceId: bindingDecision.workspaceId,
      scope: bindingDecision.scope,
      decisionClass: "accepted_read_only",
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
  });
}

whatsappRouter.post("/webhooks/whatsapp/inbound", handleWhatsappInboundWebhook);
