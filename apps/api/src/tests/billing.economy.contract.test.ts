import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import supertest from "supertest";
import { prismaGlobal } from "@repo/db";
import {
  buildWebhookSignatureBase,
  computeWebhookSignature,
} from "../services/paymentIntents";

let request: ReturnType<typeof supertest>;

const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const tenantId = `tenant-economy-${suffix}`;
const workspaceId = `workspace-economy-${suffix}`;
const userId = `user-economy-${suffix}`;
const apiToken = `tok-economy-${suffix}`;
const runId = `run-economy-${suffix}`;
const webhookSecret = "whsec-eiah-local";

before(async () => {
  process.env.NODE_ENV = "test";
  process.env.BILLING_WEBHOOK_SECRET = webhookSecret;
  process.env.BILLING_WEBHOOK_REPLAY_WINDOW_SECONDS = "600";
  process.env.BILLING_WEBHOOK_CLOCK_SKEW_SECONDS = "30";
  const { default: app } = await import("../index");
  request = supertest(app);

  await prismaGlobal.tenant.create({
    data: { id: tenantId, name: tenantId },
  });
  await prismaGlobal.workspace.create({
    data: { id: workspaceId, tenantId, name: workspaceId },
  });
  await prismaGlobal.user.create({
    data: {
      id: userId,
      tenantId,
      email: `${userId}@example.com`,
      displayName: "Economy Tester",
    },
  });
  await prismaGlobal.apiToken.create({
    data: {
      token: apiToken,
      tenantId,
      workspaceId,
      userId,
      description: "billing-economy-test",
      revoked: false,
    },
  });

  await prismaGlobal.run.create({
    data: {
      id: runId,
      tenantId,
      workspaceId,
      userId,
      agent: "fin-nexus",
      status: "pending",
      request: { action: "realestate.release_commission" },
      response: null,
    },
  });
});

after(async () => {
  await prismaGlobal.$disconnect();
});

test("PaymentIntent: create -> blocked sem PoU -> released com PoU/SCL -> settled", async () => {
  const createRes = await request
    .post("/api/billing/payment-intents")
    .set("Authorization", `Bearer ${apiToken}`)
    .send({
      runId,
      amountCents: 35000,
      currency: "BRL",
      provider: "stripe",
      requestId: `req-${suffix}-01`,
    });

  assert.equal(createRes.status, 201);
  assert.equal(createRes.body?.ok, true);
  const paymentIntentId = createRes.body?.data?.id as string;
  assert.ok(paymentIntentId);

  const blockedRes = await request
    .post(`/api/billing/payment-intents/${paymentIntentId}/release`)
    .set("Authorization", `Bearer ${apiToken}`)
    .send({});
  assert.equal(blockedRes.status, 409);
  assert.equal(blockedRes.body?.error?.code, "POU_REQUIRED_FOR_PAYMENT");
  assert.equal(blockedRes.body?.data?.paymentIntent?.status, "blocked");

  const txId = `tx-economy-${suffix}-01`;
  const criticalHash = `critical-economy-${suffix}-01`;
  await prismaGlobal.run.update({
    where: { id: runId },
    data: {
      status: "success",
      txId,
      sclTxId: txId,
      criticalHash,
      response: { ok: true, source: "billing-economy-test" },
    },
  });
  await prismaGlobal.sclLedger.create({
    data: {
      tenantId,
      workspaceId,
      runId,
      txId,
      criticalHash,
      signature: "sig-billing-economy-test",
      payload: { source: "billing-economy-test" },
    },
  });

  const releaseRes = await request
    .post(`/api/billing/payment-intents/${paymentIntentId}/release`)
    .set("Authorization", `Bearer ${apiToken}`)
    .send({});
  assert.equal(releaseRes.status, 200);
  assert.equal(releaseRes.body?.ok, true);
  assert.equal(releaseRes.body?.data?.paymentIntent?.status, "released");

  const providersRes = await request
    .get("/api/payments/providers")
    .set("Authorization", `Bearer ${apiToken}`);
  assert.equal(providersRes.status, 200);
  assert.equal(providersRes.body?.ok, true);
  assert.ok(Array.isArray(providersRes.body?.data?.providers));
  const providerIds = (providersRes.body?.data?.providers ?? []).map((item: any) => item.id);
  assert.deepEqual(providerIds.sort(), ["bank", "crypto", "stripe"]);

  const settleRes = await request
    .post("/api/payments/providers/stripe/settle")
    .set("Authorization", `Bearer ${apiToken}`)
    .send({ paymentIntentId });
  assert.equal(settleRes.status, 200);
  assert.equal(settleRes.body?.ok, true);
  assert.equal(settleRes.body?.data?.paymentIntent?.status, "settled");
});

test("Webhook billing: assinatura válida + replay idempotente sem side effect", async () => {
  const run2 = `run-economy-2-${suffix}`;
  await prismaGlobal.run.create({
    data: {
      id: run2,
      tenantId,
      workspaceId,
      userId,
      agent: "fin-nexus",
      status: "success",
      request: { action: "realestate.release_commission" },
      response: { ok: true },
      txId: `tx-economy-${suffix}-02`,
      sclTxId: `tx-economy-${suffix}-02`,
      criticalHash: `critical-economy-${suffix}-02`,
    },
  });
  await prismaGlobal.sclLedger.create({
    data: {
      tenantId,
      workspaceId,
      runId: run2,
      txId: `tx-economy-${suffix}-02`,
      criticalHash: `critical-economy-${suffix}-02`,
      signature: "sig-economy-webhook-test",
      payload: { source: "billing-economy-webhook-test" },
    },
  });

  const createRes = await request
    .post("/api/billing/payment-intents")
    .set("Authorization", `Bearer ${apiToken}`)
    .send({
      runId: run2,
      amountCents: 9900,
      currency: "BRL",
      provider: "stripe",
      requestId: `req-${suffix}-02`,
    });
  assert.equal(createRes.status, 201);
  const paymentIntentId = createRes.body?.data?.id as string;
  assert.ok(paymentIntentId);

  const releaseRes = await request
    .post(`/api/billing/payment-intents/${paymentIntentId}/release`)
    .set("Authorization", `Bearer ${apiToken}`)
    .send({});
  assert.equal(releaseRes.status, 200);

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const eventId = `evt-${suffix}-01`;
  const status = "succeeded";
  const amountCents = 9900;
  const base = buildWebhookSignatureBase({
    provider: "stripe",
    timestamp,
    eventId,
    paymentIntentId,
    status,
    amountCents,
  });
  const signature = computeWebhookSignature(webhookSecret, base);

  const payload = {
    eventId,
    tenantId,
    paymentIntentId,
    status,
    amountCents,
  };

  const first = await request
    .post("/api/webhooks/billing/stripe")
    .set("x-billing-signature", signature)
    .set("x-billing-timestamp", timestamp)
    .send(payload);
  assert.equal(first.status, 200);
  assert.equal(first.body?.ok, true);

  const replay = await request
    .post("/api/webhooks/billing/stripe")
    .set("x-billing-signature", signature)
    .set("x-billing-timestamp", timestamp)
    .send(payload);
  assert.equal(replay.status, 200);
  assert.equal(replay.body?.ok, true);
  assert.equal(replay.body?.idempotent, true);
  assert.equal(replay.body?.replayRejected, true);
  assert.equal(replay.body?.duplicateSideEffects, 0);
});

