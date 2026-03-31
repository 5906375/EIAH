import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import supertest from "supertest";
import { closePrismaResources, prismaGlobal } from "@repo/db";
import {
  buildWebhookSignatureBase,
  computeWebhookSignature,
} from "../services/paymentIntents";
import { closeRunEventsTransport } from "../services/runEvents";
import { closeRunEventStream } from "../services/runEventStream";
import { billingRouter } from "../routes/billing";

let request: ReturnType<typeof supertest>;

const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const tenantId = `tenant-economy-${suffix}`;
const workspaceId = `workspace-economy-${suffix}`;
const userId = `user-economy-${suffix}`;
const apiToken = `tok-economy-${suffix}`;
const runId = `run-economy-${suffix}`;
const webhookSecret = "whsec-eiah-local";

function resolveCurrentCycle() {
  const now = new Date();
  const cycleStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  const cycleEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));
  return { cycleStart, cycleEnd };
}

before(async () => {
  process.env.NODE_ENV = "test";
  process.env.BILLING_WEBHOOK_SECRET = webhookSecret;
  process.env.BILLING_WEBHOOK_REPLAY_WINDOW_SECONDS = "600";
  process.env.BILLING_WEBHOOK_CLOCK_SKEW_SECONDS = "30";
  const app = express();
  app.use(express.json({ limit: "10mb" }));
  app.use("/api", billingRouter);
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
  await prismaGlobal.workspaceAgentAssignment.create({
    data: {
      tenantId,
      workspaceId,
      agentKey: "fin-nexus",
      agentVersion: "1.0.0",
      enabled: true,
      signedByUserId: userId,
      signedAt: new Date(),
      signatureRef: "sig-economy-assignment",
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

  const { cycleStart, cycleEnd } = resolveCurrentCycle();
  await prismaGlobal.runUsageBreakdown.create({
    data: {
      runId,
      tenantId,
      workspaceId,
      agent: "fin-nexus",
      agentVersion: "1.0.0",
      provider: "openai",
      model: "gpt-4o-mini",
      pricingVersion: "provider-usage.v1",
      requestId: `req-breakdown-${suffix}`,
      traceId: `trace-${suffix}`,
      meterType: "llm_completion",
      requestClass: "chat_response",
      promptTokens: 120,
      completionTokens: 80,
      cachedTokens: 10,
      totalTokens: 210,
      amountCents: 123,
      currency: "BRL",
      estimated: true,
    },
  });
  await prismaGlobal.billingLedger.create({
    data: {
      tenantId,
      workspaceId,
      runId,
      entryType: "debit",
      amountCents: 123,
      currency: "BRL",
      description: "billing-economy-contract-test",
      requestId: `req-breakdown-${suffix}`,
      provider: "openai",
      model: "gpt-4o-mini",
    },
  });
  await prismaGlobal.tenantQuotaUsage.create({
    data: {
      tenantId,
      cycleStart,
      cycleEnd,
      runs: 1,
      costCents: 123,
      tokens: 210,
      storageMb: 0,
    },
  });
  await prismaGlobal.workspaceQuotaUsage.create({
    data: {
      tenantId,
      workspaceId,
      cycleStart,
      cycleEnd,
      runs: 1,
      costCents: 123,
      tokens: 210,
      storageMb: 0,
    },
  });
});

after(async () => {
  const cleanupClient = prismaGlobal as any;
  await cleanupClient.webhookEvent?.deleteMany?.({ where: { tenantId } }).catch(() => undefined);
  await cleanupClient.billingDispute?.deleteMany?.({ where: { tenantId } }).catch(() => undefined);
  await cleanupClient.paymentIntent?.deleteMany?.({ where: { tenantId } }).catch(() => undefined);
  await prismaGlobal.workspaceQuotaUsage.deleteMany({ where: { tenantId } });
  await prismaGlobal.tenantQuotaUsage.deleteMany({ where: { tenantId } });
  await prismaGlobal.runUsageBreakdown.deleteMany({ where: { tenantId } });
  await closeRunEventsTransport();
  await closeRunEventStream();
  await closePrismaResources();
});

test("Billing summaries and run cost breakdown expose the baseline P1 contract", async () => {
  const tenantSummaryRes = await request
    .get("/api/billing/tenant/summary")
    .set("Authorization", `Bearer ${apiToken}`);
  assert.equal(tenantSummaryRes.status, 200);
  assert.equal(tenantSummaryRes.body?.ok, true);
  assert.equal(tenantSummaryRes.body?.data?.tenantId, tenantId);
  assert.ok(Array.isArray(tenantSummaryRes.body?.data?.byAgent));
  assert.ok(Array.isArray(tenantSummaryRes.body?.data?.byModel));

  const workspaceSummaryRes = await request
    .get(`/api/billing/workspaces/${workspaceId}/summary`)
    .set("Authorization", `Bearer ${apiToken}`);
  assert.equal(workspaceSummaryRes.status, 200);
  assert.equal(workspaceSummaryRes.body?.ok, true);
  assert.equal(workspaceSummaryRes.body?.data?.workspaceId, workspaceId);
  assert.equal(workspaceSummaryRes.body?.data?.costCents, 123);
  assert.equal(workspaceSummaryRes.body?.data?.tokens, 210);
  assert.equal(workspaceSummaryRes.body?.data?.byAgent?.[0]?.agent, "fin-nexus");
  assert.equal(workspaceSummaryRes.body?.data?.byModel?.[0]?.provider, "openai");

  const agentSummaryRes = await request
    .get("/api/billing/agents/summary")
    .set("Authorization", `Bearer ${apiToken}`);
  assert.equal(agentSummaryRes.status, 200);
  assert.equal(agentSummaryRes.body?.ok, true);
  assert.equal(agentSummaryRes.body?.data?.items?.[0]?.agent, "fin-nexus");
  assert.equal(agentSummaryRes.body?.data?.items?.[0]?.costCents, 123);

  const assignmentsRes = await request
    .get(`/api/workspaces/${workspaceId}/agents`)
    .set("Authorization", `Bearer ${apiToken}`);
  assert.equal(assignmentsRes.status, 200);
  assert.equal(assignmentsRes.body?.ok, true);
  assert.equal(assignmentsRes.body?.data?.items?.[0]?.agentKey, "fin-nexus");
  assert.equal(assignmentsRes.body?.data?.items?.[0]?.agentVersion, "1.0.0");

  const breakdownRes = await request
    .get(`/api/runs/${runId}/cost-breakdown`)
    .set("Authorization", `Bearer ${apiToken}`);
  assert.equal(breakdownRes.status, 200);
  assert.equal(breakdownRes.body?.ok, true);
  assert.equal(breakdownRes.body?.data?.run?.id, runId);
  assert.equal(breakdownRes.body?.data?.totals?.amountCents, 123);
  assert.equal(breakdownRes.body?.data?.totals?.tokens, 210);
  assert.equal(breakdownRes.body?.data?.items?.[0]?.provider, "openai");
  assert.equal(breakdownRes.body?.data?.items?.[0]?.model, "gpt-4o-mini");
  assert.equal(breakdownRes.body?.data?.items?.[0]?.meterType, "llm_completion");
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
