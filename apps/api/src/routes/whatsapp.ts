import crypto from "node:crypto";
import { createGovernedRouter } from "../middlewares/asyncHandler";

export const whatsappRouter = createGovernedRouter();

const WHATSAPP_PROVIDER = "whatsapp";
const WHATSAPP_EVENT_VERSION = "whatsapp.adapter.event.v1";
const WHATSAPP_SIGNATURE_VERSION = "v1";
const REQUIRED_SCOPE = "whatsapp:inbound:read_only";
const REQUIRED_ENTITLEMENT = "channel.whatsapp.inbound.read_only";

type WhatsappBindingRecord = {
  tenantId: string | null;
  workspaceId: string | null;
  scope: string | null;
  entitlements: string[];
  allowedScopes: string[];
  sessionExpiresAt: string | null;
};

type ReplayRecord = {
  payloadDigest: string;
  firstSeenAtMs: number;
};

const replayGuard = new Map<string, ReplayRecord>();
const eventGuard = new Map<string, ReplayRecord>();

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

function failResponse(res: { status: (code: number) => { json: (body: unknown) => unknown } }, status: number, code: string, message: string) {
  return res.status(status).json({
    ok: false,
    error: {
      code,
      message,
    },
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

function parseBindingsConfig() {
  const raw = process.env.WHATSAPP_READ_ONLY_BINDINGS_JSON?.trim();
  if (!raw) return new Map<string, WhatsappBindingRecord>();

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return new Map<string, WhatsappBindingRecord>();
    }

    const entries = Object.entries(parsed as Record<string, unknown>).flatMap(([phoneHash, value]) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return [];
      const binding = value as Record<string, unknown>;
      return [[phoneHash, {
        tenantId: parseNonEmptyString(binding.tenantId),
        workspaceId: parseNonEmptyString(binding.workspaceId),
        scope: parseNonEmptyString(binding.scope),
        entitlements: Array.isArray(binding.entitlements)
          ? binding.entitlements.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
          : [],
        allowedScopes: Array.isArray(binding.allowedScopes)
          ? binding.allowedScopes.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
          : [],
        sessionExpiresAt: parseIsoDate(binding.sessionExpiresAt),
      } satisfies WhatsappBindingRecord] as const];
    });

    return new Map<string, WhatsappBindingRecord>(entries);
  } catch {
    return new Map<string, WhatsappBindingRecord>();
  }
}

function pruneGuard(store: Map<string, ReplayRecord>, cutoffMs: number) {
  for (const [key, record] of store.entries()) {
    if (record.firstSeenAtMs < cutoffMs) {
      store.delete(key);
    }
  }
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

function resolveBinding(body: Record<string, unknown>) {
  const fromPhoneHash = parseNonEmptyString(body.fromPhoneHash);
  if (!fromPhoneHash) {
    return { code: "WHATSAPP_PHONE_NOT_BOUND", binding: null as WhatsappBindingRecord | null };
  }

  const bindings = parseBindingsConfig();
  const binding = bindings.get(fromPhoneHash) ?? null;
  if (!binding) {
    return { code: "WHATSAPP_PHONE_NOT_BOUND", binding: null };
  }

  if (!binding.tenantId) return { code: "TENANT_NOT_RESOLVED", binding };
  if (!binding.workspaceId) return { code: "WORKSPACE_NOT_RESOLVED", binding };

  if (binding.sessionExpiresAt) {
    const expiresAtMs = Date.parse(binding.sessionExpiresAt);
    if (Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now()) {
      return { code: "SESSION_EXPIRED", binding };
    }
  }

  if (!binding.scope || !binding.allowedScopes.includes(binding.scope) || !binding.allowedScopes.includes(REQUIRED_SCOPE)) {
    return { code: "ENTITLEMENT_REQUIRED", binding };
  }
  if (!binding.entitlements.includes(REQUIRED_ENTITLEMENT)) {
    return { code: "ENTITLEMENT_REQUIRED", binding };
  }

  return { code: null, binding };
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
  replayGuard.clear();
  eventGuard.clear();
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
    return failResponse(res, status, payloadValidation.code, payloadValidation.message);
  }

  const body = payloadValidation.record;
  if (body.eventId !== eventIdHeader) {
    return failResponse(res, 400, "WHATSAPP_PAYLOAD_INVALID", "Header eventId and body eventId must match");
  }

  const resolvedAction = classifyRequestedAction(body);
  if (resolvedAction) {
    return failResponse(
      res,
      403,
      resolvedAction,
      resolvedAction === "CRITICAL_ACTION_BLOCKED"
        ? "Critical WhatsApp actions are blocked in read-only mode"
        : "WhatsApp inbound handler is read-only"
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
    return failResponse(res, 401, "WHATSAPP_SIGNATURE_INVALID", "Invalid WhatsApp signature");
  }

  const bindingResolution = resolveBinding(body);
  if (bindingResolution.code) {
    return failResponse(res, 403, bindingResolution.code, "WhatsApp binding or entitlement resolution failed");
  }
  const binding = bindingResolution.binding!;

  if (body.tenantId != null && body.tenantId !== binding.tenantId) {
    return failResponse(res, 400, "WHATSAPP_PAYLOAD_INVALID", "tenantId does not match the bound scope");
  }
  if (body.workspaceId != null && body.workspaceId !== binding.workspaceId) {
    return failResponse(res, 400, "WHATSAPP_PAYLOAD_INVALID", "workspaceId does not match the bound scope");
  }
  if (body.scope != null && body.scope !== binding.scope) {
    return failResponse(res, 400, "WHATSAPP_PAYLOAD_INVALID", "scope does not match the bound scope");
  }

  const cutoffMs = Date.now() - maxAgeMs;
  pruneGuard(replayGuard, cutoffMs);
  pruneGuard(eventGuard, cutoffMs);

  const eventKey = `${providerHeader}:${eventIdHeader}`;
  const replayKey = `${eventKey}:${timestampHeader}:${signatureCheck.normalized}`;
  if (replayGuard.has(replayKey)) {
    return failResponse(res, 409, "WHATSAPP_REPLAY_DETECTED", "Replay detected for WhatsApp inbound event");
  }
  if (eventGuard.has(eventKey)) {
    return failResponse(res, 409, "WHATSAPP_EVENT_DUPLICATE", "Duplicate WhatsApp event detected");
  }

  const record = { payloadDigest, firstSeenAtMs: Date.now() };
  replayGuard.set(replayKey, record);
  eventGuard.set(eventKey, record);

  return res.status(202).json({
    ok: true,
    reasonCode: "ACCEPTED_READ_ONLY",
    data: {
      eventId: eventIdHeader,
      provider: WHATSAPP_PROVIDER,
      readOnly: true,
      messageType: body.messageType,
      fromPhoneMasked: maskPhoneMasked(String(body.fromPhoneMasked)),
      tenantId: binding.tenantId,
      workspaceId: binding.workspaceId,
      scope: binding.scope,
      fallbackUsed: false,
    },
  });
}

whatsappRouter.post("/webhooks/whatsapp/inbound", handleWhatsappInboundWebhook);
