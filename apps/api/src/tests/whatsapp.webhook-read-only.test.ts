import "./support/testInfraEnv";
import { before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  buildWhatsappCanonicalString,
  computeWhatsappStubSignature,
  handleWhatsappInboundWebhook,
  resetWhatsappWebhookGuards,
} from "../routes/whatsapp";

const stubSecret = "whatsapp-read-only-stub-secret-test";
const phoneHash = "4a354f4d31fe66a17265a1e72fbf40d4d9c6a445f0d3b35f0f79d8d8a34b5265";
const baseTimestamp = new Date("2026-07-15T12:00:00.000Z").toISOString();

before(() => {
  process.env.NODE_ENV = "test";
  process.env.WHATSAPP_WEBHOOK_STUB_SECRET = stubSecret;
  process.env.WHATSAPP_WEBHOOK_REPLAY_WINDOW_SECONDS = "300";
  process.env.WHATSAPP_WEBHOOK_CLOCK_SKEW_SECONDS = "30";
  process.env.WHATSAPP_WEBHOOK_MAX_PAYLOAD_BYTES = "1024";
  process.env.WHATSAPP_READ_ONLY_BINDINGS_JSON = JSON.stringify({
    [phoneHash]: {
      tenantId: "tenant-imob-read-only",
      workspaceId: "workspace-imob-read-only",
      scope: "whatsapp:inbound:read_only",
      allowedScopes: ["whatsapp:inbound:read_only"],
      entitlements: ["channel.whatsapp.inbound.read_only"],
      sessionExpiresAt: "2099-07-15T12:00:00.000Z",
    },
  });
});

beforeEach(() => {
  resetWhatsappWebhookGuards();
});

function buildBody(eventId: string, overrides: Record<string, unknown> = {}) {
  return {
    version: "whatsapp.adapter.event.v1",
    eventId,
    provider: "whatsapp",
    receivedAt: baseTimestamp,
    providerTimestamp: baseTimestamp,
    fromPhoneHash: phoneHash,
    fromPhoneMasked: "+55********67",
    messageType: "text",
    text: "Quero entender o status do meu atendimento",
    rawPayloadRef: "redacted://payload/ref",
    tenantId: "tenant-imob-read-only",
    workspaceId: "workspace-imob-read-only",
    scope: "whatsapp:inbound:read_only",
    readOnly: true,
    ...overrides,
  };
}

function buildHeaders(body: Record<string, unknown>, overrides: Record<string, string> = {}) {
  const timestamp = overrides["x-eiah-timestamp"] ?? Math.floor(Date.now() / 1000).toString();
  const eventId = overrides["x-eiah-event-id"] ?? String(body.eventId);
  const provider = overrides["x-eiah-provider"] ?? "whatsapp";
  const signatureVersion = overrides["x-eiah-signature-version"] ?? "v1";
  const canonical = buildWhatsappCanonicalString({
    provider,
    eventId,
    timestamp,
    version: String(body.version),
    providerTimestamp: String(body.providerTimestamp),
    messageType: String(body.messageType),
    payloadDigest: crypto.createHash("sha256").update(JSON.stringify({
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
    })).digest("hex"),
  });
  const signature = computeWhatsappStubSignature(stubSecret, canonical);
  return {
    "x-eiah-provider": provider,
    "x-eiah-event-id": eventId,
    "x-eiah-timestamp": timestamp,
    "x-eiah-signature-version": signatureVersion,
    "x-eiah-signature": signature,
    ...overrides,
  };
}

async function invokeHandler(body: Record<string, unknown>, headers: Record<string, string>) {
  let statusCode = 200;
  let jsonBody: unknown = null;

  await handleWhatsappInboundWebhook(
    {
      body,
      header(name: string) {
        return headers[name.toLowerCase()] ?? headers[name] ?? undefined;
      },
    },
    {
      status(code: number) {
        statusCode = code;
        return {
          json(payload: unknown) {
            jsonBody = payload;
            return payload;
          },
        };
      },
    }
  );

  return { status: statusCode, body: jsonBody as Record<string, unknown> | null };
}

test("WhatsApp webhook read-only: evento valido retorna 202 ACCEPTED_READ_ONLY", async () => {
  const body = buildBody("evt-whatsapp-valid");
  const response = await invokeHandler(body, buildHeaders(body));

  assert.equal(response.status, 202);
  assert.equal(response.body?.reasonCode, "ACCEPTED_READ_ONLY");
  assert.equal(response.body?.data?.readOnly, true);
  assert.equal(response.body?.data?.fallbackUsed, false);
  assert.equal(response.body?.data?.fromPhoneMasked, "+5***67");
});

test("WhatsApp webhook read-only: assinatura ausente falha fechado", async () => {
  const body = buildBody("evt-whatsapp-missing-signature");
  const headers = buildHeaders(body);
  delete headers["x-eiah-signature"];

  const response = await invokeHandler(body, headers);

  assert.equal(response.status, 401);
  assert.equal(response.body?.error?.code, "WHATSAPP_SIGNATURE_MISSING");
});

test("WhatsApp webhook read-only: assinatura invalida falha fechado", async () => {
  const body = buildBody("evt-whatsapp-invalid-signature");
  const response = await invokeHandler(body, buildHeaders(body, { "x-eiah-signature": "00".repeat(32) }));

  assert.equal(response.status, 401);
  assert.equal(response.body?.error?.code, "WHATSAPP_SIGNATURE_INVALID");
});

test("WhatsApp webhook read-only: timestamp ausente falha fechado", async () => {
  const body = buildBody("evt-whatsapp-missing-timestamp");
  const headers = buildHeaders(body);
  delete headers["x-eiah-timestamp"];

  const response = await invokeHandler(body, headers);

  assert.equal(response.status, 401);
  assert.equal(response.body?.error?.code, "WHATSAPP_TIMESTAMP_MISSING");
});

test("WhatsApp webhook read-only: eventId ausente falha fechado", async () => {
  const body = buildBody("evt-whatsapp-missing-event-id", { eventId: "" });
  const response = await invokeHandler(body, buildHeaders({ ...body, eventId: "evt-whatsapp-header-event-id" }));

  assert.equal(response.status, 400);
  assert.equal(response.body?.error?.code, "WHATSAPP_EVENT_ID_MISSING");
});

test("WhatsApp webhook read-only: phone sem binding falha fechado", async () => {
  const body = buildBody("evt-whatsapp-no-binding", {
    fromPhoneHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  });
  const response = await invokeHandler(body, buildHeaders(body));

  assert.equal(response.status, 403);
  assert.equal(response.body?.error?.code, "WHATSAPP_PHONE_NOT_BOUND");
});

test("WhatsApp webhook read-only: tentativa de acao critica e bloqueada", async () => {
  const body = buildBody("evt-whatsapp-critical-action", {
    action: "lead.create",
  });
  const response = await invokeHandler(body, buildHeaders(body));

  assert.equal(response.status, 403);
  assert.equal(response.body?.error?.code, "CRITICAL_ACTION_BLOCKED");
});

test("WhatsApp webhook read-only: replay e duplicidade retornam 409 sem side effect", async () => {
  const body = buildBody("evt-whatsapp-replay");
  const headers = buildHeaders(body);

  const first = await invokeHandler(body, headers);
  assert.equal(first.status, 202);

  const replay = await invokeHandler(body, headers);
  assert.equal(replay.status, 409);
  assert.equal(replay.body?.error?.code, "WHATSAPP_REPLAY_DETECTED");

  resetWhatsappWebhookGuards();

  const accepted = await invokeHandler(body, headers);
  assert.equal(accepted.status, 202);

  const duplicate = await invokeHandler(
    body,
    buildHeaders(body, { "x-eiah-timestamp": String(Number(headers["x-eiah-timestamp"]) + 1) })
  );
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body?.error?.code, "WHATSAPP_EVENT_DUPLICATE");
});

test("WhatsApp webhook read-only: payload acima do limite retorna 413", async () => {
  const body = buildBody("evt-whatsapp-too-large", {
    text: "x".repeat(5000),
  });
  const response = await invokeHandler(body, buildHeaders(body));

  assert.equal(response.status, 413);
  assert.equal(response.body?.error?.code, "WHATSAPP_PAYLOAD_TOO_LARGE");
});
