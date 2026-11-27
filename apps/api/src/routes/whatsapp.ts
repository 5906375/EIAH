import crypto from "node:crypto";
import { createGovernedRouter } from "../middlewares/asyncHandler";
import {
  createReplayGuardStore,
  resetReplayGuardStore,
} from "../services/replayGuard";
import {
  buildWhatsappFailure, classifyRequestedAction, evaluateWhatsappReadOnlyIngress,
  parseNonEmptyString, validatePayload,
} from "../services/whatsappReadOnlyIngress";

export const whatsappRouter = createGovernedRouter();

const WHATSAPP_PROVIDER = "whatsapp";
const WHATSAPP_SIGNATURE_VERSION = "v1";

const whatsappReplayGuardStore = createReplayGuardStore();

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

function failResponse(
  res: { status: (code: number) => { json: (body: unknown) => unknown } },
  ...args: Parameters<typeof buildWhatsappFailure>
) {
  const result = buildWhatsappFailure(...args);
  return res.status(result.status).json(result.body);
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
      receivedAt: req.body && typeof req.body === "object" && !Array.isArray(req.body)
        ? (req.body as Record<string, unknown>).receivedAt
        : null,
      providerTimestamp: req.body && typeof req.body === "object" && !Array.isArray(req.body)
        ? (req.body as Record<string, unknown>).providerTimestamp
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
      receivedAt: body.receivedAt,
      providerTimestamp: body.providerTimestamp,
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
        receivedAt: body.receivedAt,
        providerTimestamp: body.providerTimestamp,
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
      receivedAt: body.receivedAt,
      providerTimestamp: body.providerTimestamp,
    });
  }

  const eventKey = `${providerHeader}:${eventIdHeader}`;
  const result = evaluateWhatsappReadOnlyIngress({
    body, eventId: eventIdHeader, provider: providerHeader,
    bindingsJson: process.env.WHATSAPP_READ_ONLY_BINDINGS_JSON,
    nowMs: Date.now(),
    replay: {
      store: whatsappReplayGuardStore, eventKey,
      replayKey: `${eventKey}:${timestampHeader}:${signatureCheck.normalized}`,
      payloadDigest, maxAgeMs,
    },
  });
  return res.status(result.status).json(result.body);
}

whatsappRouter.post("/webhooks/whatsapp/inbound", handleWhatsappInboundWebhook);
