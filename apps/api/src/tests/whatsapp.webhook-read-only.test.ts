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
import {
  buildWhatsappBundleExport,
  WHATSAPP_BUNDLE_EXPORT_VERSION,
} from "../services/whatsappBundleExport";
import { buildWhatsappEvidenceBundle } from "../services/whatsappEvidenceBundle";

const stubSecret = "whatsapp-read-only-stub-secret-test";
const phoneHash = "4a354f4d31fe66a17265a1e72fbf40d4d9c6a445f0d3b35f0f79d8d8a34b5265";
const baseTimestamp = new Date("2026-07-15T12:00:00.000Z").toISOString();
const readOnlyScope = "whatsapp:inbound:read_only";
const readOnlyEntitlement = "channel.whatsapp.inbound.read_only";
const bundleExportAllowedKeys = [
  "decision",
  "eventId",
  "exportedAt",
  "messageType",
  "piiMasked",
  "provider",
  "providerTimestamp",
  "reasonCode",
  "receivedAt",
  "scope",
  "sideEffects",
  "status",
  "tenantId",
  "version",
  "workspaceId",
].sort();
const protectedReasonCodes = [
  "ACCEPTED_READ_ONLY",
  "WHATSAPP_SIGNATURE_INVALID",
  "WHATSAPP_PHONE_NOT_BOUND",
  "TENANT_NOT_RESOLVED",
  "WORKSPACE_NOT_RESOLVED",
  "ENTITLEMENT_REQUIRED",
  "SESSION_EXPIRED",
  "WHATSAPP_REPLAY_DETECTED",
  "WHATSAPP_EVENT_DUPLICATE",
  "CRITICAL_ACTION_BLOCKED",
  "READ_ONLY_MODE",
];

before(() => {
  process.env.NODE_ENV = "test";
  process.env.WHATSAPP_WEBHOOK_STUB_SECRET = stubSecret;
  process.env.WHATSAPP_WEBHOOK_REPLAY_WINDOW_SECONDS = "300";
  process.env.WHATSAPP_WEBHOOK_CLOCK_SKEW_SECONDS = "30";
  process.env.WHATSAPP_WEBHOOK_MAX_PAYLOAD_BYTES = "1024";
  process.env.WHATSAPP_READ_ONLY_BINDINGS_JSON = JSON.stringify(buildBindings());
});

beforeEach(() => {
  resetWhatsappWebhookGuards();
  process.env.WHATSAPP_READ_ONLY_BINDINGS_JSON = JSON.stringify(buildBindings());
});

function buildBindings(overrides: Record<string, unknown> = {}) {
  return {
    [phoneHash]: {
      tenantId: "tenant-imob-read-only",
      workspaceId: "workspace-imob-read-only",
      scope: readOnlyScope,
      allowedScopes: [readOnlyScope],
      entitlements: [readOnlyEntitlement],
      sessionExpiresAt: "2099-07-15T12:00:00.000Z",
      ...overrides,
    },
  };
}

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
  assert.deepEqual(response.body?.evidenceBundle, {
    reasonCode: "ACCEPTED_READ_ONLY",
    httpStatus: 202,
    eventId: "evt-whatsapp-valid",
    provider: "whatsapp",
    messageType: "text",
    tenantId: "tenant-imob-read-only",
    workspaceId: "workspace-imob-read-only",
    scope: readOnlyScope,
    decisionClass: "accepted_read_only",
    sideEffects: 0,
  });
  assert.equal(response.body?.data?.readOnly, true);
  assert.equal(response.body?.data?.fallbackUsed, false);
  assert.equal(response.body?.data?.fromPhoneMasked, "+5***67");
  assert.equal(response.body?.bundleExport?.version, "whatsapp.read_only.bundle_export.v1");
  assert.equal(response.body?.bundleExport?.decision, "accepted_read_only");
  assert.equal(response.body?.bundleExport?.status, 202);
  assert.equal(response.body?.bundleExport?.piiMasked, true);
  assert.equal(response.body?.bundleExport?.sideEffects, 0);
  assert.equal(response.body?.bundleExport?.receivedAt, baseTimestamp);
  assert.equal(response.body?.bundleExport?.providerTimestamp, baseTimestamp);
  assert.equal(typeof response.body?.bundleExport?.exportedAt, "string");
});

test("WhatsApp webhook read-only: bundle export v1 permanece congelado e sem campos extras", () => {
  const exportBundle = buildWhatsappBundleExport({
    evidenceBundle: buildWhatsappEvidenceBundle({
      reasonCode: "ACCEPTED_READ_ONLY",
      httpStatus: 202,
      eventId: "evt-whatsapp-contract-freeze",
      provider: "whatsapp",
      messageType: "text",
      tenantId: "tenant-imob-read-only",
      workspaceId: "workspace-imob-read-only",
      scope: readOnlyScope,
      decisionClass: "accepted_read_only",
    }),
    receivedAt: baseTimestamp,
    providerTimestamp: baseTimestamp,
    exportedAt: Date.parse("2026-07-15T12:05:00.000Z"),
  });

  assert.equal(exportBundle.version, WHATSAPP_BUNDLE_EXPORT_VERSION);
  assert.deepEqual(Object.keys(exportBundle).sort(), bundleExportAllowedKeys);
  assert.equal(exportBundle.sideEffects, 0);
  assert.equal(exportBundle.piiMasked, true);
  assert.equal(exportBundle.status, 202);
  assert.equal(exportBundle.decision, "accepted_read_only");
  assert.equal(exportBundle.receivedAt, baseTimestamp);
  assert.equal(exportBundle.providerTimestamp, baseTimestamp);
  assert.equal(exportBundle.exportedAt, "2026-07-15T12:05:00.000Z");
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
  assert.deepEqual(response.body?.evidenceBundle, {
    reasonCode: "WHATSAPP_SIGNATURE_INVALID",
    httpStatus: 401,
    eventId: "evt-whatsapp-invalid-signature",
    provider: "whatsapp",
    messageType: "text",
    tenantId: "tenant-imob-read-only",
    workspaceId: "workspace-imob-read-only",
    scope: readOnlyScope,
    decisionClass: "blocked",
    sideEffects: 0,
  });
  assert.equal(response.body?.bundleExport?.version, "whatsapp.read_only.bundle_export.v1");
  assert.equal(response.body?.bundleExport?.decision, "blocked");
  assert.equal(response.body?.bundleExport?.reasonCode, "WHATSAPP_SIGNATURE_INVALID");
  assert.equal(response.body?.bundleExport?.status, 401);
  assert.equal(response.body?.bundleExport?.piiMasked, true);
  assert.equal(response.body?.bundleExport?.receivedAt, baseTimestamp);
  assert.equal(response.body?.bundleExport?.providerTimestamp, baseTimestamp);
});

test("WhatsApp webhook read-only: versao de assinatura nao suportada falha fechado", async () => {
  const body = buildBody("evt-whatsapp-signature-version");
  const response = await invokeHandler(body, buildHeaders(body, { "x-eiah-signature-version": "v2" }));

  assert.equal(response.status, 401);
  assert.equal(response.body?.error?.code, "WHATSAPP_SIGNATURE_VERSION_UNSUPPORTED");
});

test("WhatsApp webhook read-only: timestamp ausente falha fechado", async () => {
  const body = buildBody("evt-whatsapp-missing-timestamp");
  const headers = buildHeaders(body);
  delete headers["x-eiah-timestamp"];

  const response = await invokeHandler(body, headers);

  assert.equal(response.status, 401);
  assert.equal(response.body?.error?.code, "WHATSAPP_TIMESTAMP_MISSING");
});

test("WhatsApp webhook read-only: timestamp fora da janela falha fechado sem consumir estado", async () => {
  const body = buildBody("evt-whatsapp-out-of-window");
  const staleTimestamp = String(Math.floor(Date.parse("2026-07-15T11:40:00.000Z") / 1000));
  const rejected = await invokeHandler(body, buildHeaders(body, { "x-eiah-timestamp": staleTimestamp }));

  assert.equal(rejected.status, 401);
  assert.equal(rejected.body?.error?.code, "WHATSAPP_TIMESTAMP_OUT_OF_WINDOW");

  const accepted = await invokeHandler(body, buildHeaders(body));
  assert.equal(accepted.status, 202);
  assert.equal(accepted.body?.reasonCode, "ACCEPTED_READ_ONLY");
});

test("WhatsApp webhook read-only: eventId ausente falha fechado", async () => {
  const body = buildBody("evt-whatsapp-missing-event-id", { eventId: "" });
  const response = await invokeHandler(body, buildHeaders({ ...body, eventId: "evt-whatsapp-header-event-id" }));

  assert.equal(response.status, 400);
  assert.equal(response.body?.error?.code, "WHATSAPP_EVENT_ID_MISSING");
});

test("WhatsApp webhook read-only: provider nao suportado falha fechado", async () => {
  const body = buildBody("evt-whatsapp-provider-unsupported", { provider: "telegram" });
  const response = await invokeHandler(body, buildHeaders(body, { "x-eiah-provider": "telegram" }));

  assert.equal(response.status, 400);
  assert.equal(response.body?.error?.code, "WHATSAPP_PROVIDER_UNSUPPORTED");
});

test("WhatsApp webhook read-only: messageType nao suportado falha fechado", async () => {
  const body = buildBody("evt-whatsapp-message-type-unsupported", { messageType: "image" });
  const response = await invokeHandler(body, buildHeaders(body));

  assert.equal(response.status, 400);
  assert.equal(response.body?.error?.code, "WHATSAPP_MESSAGE_TYPE_UNSUPPORTED");
});

test("WhatsApp webhook read-only: payload invalido falha fechado", async () => {
  const response = await invokeHandler("not-an-object" as unknown as Record<string, unknown>, {
    "x-eiah-provider": "whatsapp",
    "x-eiah-event-id": "evt-whatsapp-invalid-payload",
    "x-eiah-timestamp": String(Math.floor(Date.now() / 1000)),
    "x-eiah-signature-version": "v1",
    "x-eiah-signature": "00".repeat(32),
  });

  assert.equal(response.status, 400);
  assert.equal(response.body?.error?.code, "WHATSAPP_PAYLOAD_INVALID");
});

test("WhatsApp webhook read-only: phone sem binding falha fechado", async () => {
  const body = buildBody("evt-whatsapp-no-binding", {
    fromPhoneHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  });
  const response = await invokeHandler(body, buildHeaders(body));

  assert.equal(response.status, 403);
  assert.equal(response.body?.error?.code, "WHATSAPP_PHONE_NOT_BOUND");
});

test("WhatsApp webhook read-only: tenant ausente falha fechado", async () => {
  process.env.WHATSAPP_READ_ONLY_BINDINGS_JSON = JSON.stringify(buildBindings({ tenantId: null }));
  const body = buildBody("evt-whatsapp-missing-tenant");
  const response = await invokeHandler(body, buildHeaders(body));

  assert.equal(response.status, 403);
  assert.equal(response.body?.error?.code, "TENANT_NOT_RESOLVED");
  assert.deepEqual(response.body?.evidenceBundle, {
    reasonCode: "TENANT_NOT_RESOLVED",
    httpStatus: 403,
    eventId: "evt-whatsapp-missing-tenant",
    provider: "whatsapp",
    messageType: "text",
    tenantId: null,
    workspaceId: "workspace-imob-read-only",
    scope: readOnlyScope,
    decisionClass: "blocked",
    sideEffects: 0,
  });
});

test("WhatsApp webhook read-only: workspace ausente falha fechado", async () => {
  process.env.WHATSAPP_READ_ONLY_BINDINGS_JSON = JSON.stringify(buildBindings({ workspaceId: null }));
  const body = buildBody("evt-whatsapp-missing-workspace");
  const response = await invokeHandler(body, buildHeaders(body));

  assert.equal(response.status, 403);
  assert.equal(response.body?.error?.code, "WORKSPACE_NOT_RESOLVED");
});

test("WhatsApp webhook read-only: entitlement ausente falha fechado", async () => {
  process.env.WHATSAPP_READ_ONLY_BINDINGS_JSON = JSON.stringify(buildBindings({ entitlements: [] }));
  const body = buildBody("evt-whatsapp-missing-entitlement");
  const response = await invokeHandler(body, buildHeaders(body));

  assert.equal(response.status, 403);
  assert.equal(response.body?.error?.code, "ENTITLEMENT_REQUIRED");
});

test("WhatsApp webhook read-only: sessao expirada falha fechado", async () => {
  process.env.WHATSAPP_READ_ONLY_BINDINGS_JSON = JSON.stringify(buildBindings({
    sessionExpiresAt: "2026-07-14T12:00:00.000Z",
  }));
  const body = buildBody("evt-whatsapp-session-expired");
  const response = await invokeHandler(body, buildHeaders(body));

  assert.equal(response.status, 403);
  assert.equal(response.body?.error?.code, "SESSION_EXPIRED");
});

test("WhatsApp webhook read-only: tentativa de acao critica e bloqueada", async () => {
  const body = buildBody("evt-whatsapp-critical-action", {
    action: "lead.create",
  });
  const response = await invokeHandler(body, buildHeaders(body));

  assert.equal(response.status, 403);
  assert.equal(response.body?.error?.code, "CRITICAL_ACTION_BLOCKED");
});

test("WhatsApp webhook read-only: tentativa de mutacao implicita falha fechado", async () => {
  const body = buildBody("evt-whatsapp-implicit-mutation", {
    requestedAction: "update_owner_record",
  });
  const response = await invokeHandler(body, buildHeaders(body));

  assert.equal(response.status, 403);
  assert.equal(response.body?.error?.code, "CRITICAL_ACTION_BLOCKED");
});

test("WhatsApp webhook read-only: readOnly falso bloqueia mutacao implicita", async () => {
  const body = buildBody("evt-whatsapp-not-read-only", {
    readOnly: false,
  });
  const response = await invokeHandler(body, buildHeaders(body));

  assert.equal(response.status, 403);
  assert.equal(response.body?.error?.code, "READ_ONLY_MODE");
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

test("WhatsApp webhook read-only: masking de PII preserva ausencia de telefone bruto", async () => {
  const body = buildBody("evt-whatsapp-pii-masking", {
    fromPhoneMasked: "+5511999998767",
  });
  const response = await invokeHandler(body, buildHeaders(body));

  assert.equal(response.status, 202);
  assert.equal(response.body?.data?.fromPhoneMasked, "+5***67");
  const serialized = JSON.stringify(response.body);
  assert.equal(serialized.includes("999998767"), false);
  assert.equal(serialized.includes(phoneHash), false);
  assert.equal(serialized.includes("whatsapp-read-only-stub-secret-test"), false);
  assert.equal(serialized.includes("x-eiah-signature"), false);
  assert.equal(serialized.includes("\"fromPhoneHash\""), false);
  assert.equal(serialized.includes("\"fromPhoneMasked\":\"+5511999998767\""), false);
  assert.equal(serialized.includes("redacted://payload/ref"), false);
  assert.equal(serialized.includes("Quero entender o status do meu atendimento"), false);
  assert.equal(serialized.includes("Authorization"), false);
});

test("WhatsApp webhook read-only: gate de compatibilidade protege reasonCodes criticos do export", async () => {
  const accepted = await invokeHandler(buildBody("evt-whatsapp-protected-accepted"), buildHeaders(buildBody("evt-whatsapp-protected-accepted")));
  assert.ok(protectedReasonCodes.includes(String(accepted.body?.bundleExport?.reasonCode)));

  const invalidSignatureBody = buildBody("evt-whatsapp-protected-invalid-signature");
  const invalidSignature = await invokeHandler(
    invalidSignatureBody,
    buildHeaders(invalidSignatureBody, { "x-eiah-signature": "00".repeat(32) }),
  );
  assert.ok(protectedReasonCodes.includes(String(invalidSignature.body?.bundleExport?.reasonCode)));

  process.env.WHATSAPP_READ_ONLY_BINDINGS_JSON = JSON.stringify(buildBindings({ tenantId: null }));
  const missingTenantBody = buildBody("evt-whatsapp-protected-missing-tenant");
  const missingTenant = await invokeHandler(missingTenantBody, buildHeaders(missingTenantBody));
  assert.ok(protectedReasonCodes.includes(String(missingTenant.body?.bundleExport?.reasonCode)));
});
