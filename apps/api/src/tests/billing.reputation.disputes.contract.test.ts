import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import supertest from "supertest";
import { prismaGlobal } from "@repo/db";

let request: ReturnType<typeof supertest>;

const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const tenantId = `tenant-rep-${suffix}`;
const workspaceId = `workspace-rep-${suffix}`;
const userId = `user-rep-${suffix}`;
const apiToken = `tok-rep-${suffix}`;
const runId = `run-rep-${suffix}`;
const agentId = "contract_agent";

before(async () => {
  process.env.NODE_ENV = "test";
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
      displayName: "Reputation Tester",
    },
  });
  await prismaGlobal.apiToken.create({
    data: {
      token: apiToken,
      tenantId,
      workspaceId,
      userId,
      description: "billing-reputation-test",
      revoked: false,
    },
  });

  const txId = `tx-rep-${suffix}-01`;
  const criticalHash = `critical-rep-${suffix}-01`;
  await prismaGlobal.run.create({
    data: {
      id: runId,
      tenantId,
      workspaceId,
      userId,
      agent: "fin-nexus",
      status: "success",
      request: { action: "realestate.release_commission" },
      response: { ok: true },
      txId,
      sclTxId: txId,
      criticalHash,
    },
  });
  await prismaGlobal.sclLedger.create({
    data: {
      tenantId,
      workspaceId,
      runId,
      txId,
      criticalHash,
      signature: "sig-reputation-contract-test",
      payload: { source: "reputation-contract-test" },
    },
  });
});

after(async () => {
  await prismaGlobal.$disconnect();
});

test("Reputação e disputa: receipt.finalized atualiza snapshot e dispute.closed atualiza taxa", async () => {
  const createIntent = await request
    .post("/api/billing/payment-intents")
    .set("Authorization", `Bearer ${apiToken}`)
    .send({
      runId,
      amountCents: 12000,
      currency: "BRL",
      provider: "stripe",
      requestId: `req-rep-${suffix}-01`,
      metadata: { agentId },
    });
  assert.equal(createIntent.status, 201);
  const paymentIntentId = createIntent.body?.data?.id as string;
  assert.ok(paymentIntentId);

  const release = await request
    .post(`/api/billing/payment-intents/${paymentIntentId}/release`)
    .set("Authorization", `Bearer ${apiToken}`)
    .send({});
  assert.equal(release.status, 200);

  const settle = await request
    .post("/api/payments/providers/stripe/settle")
    .set("Authorization", `Bearer ${apiToken}`)
    .send({ paymentIntentId });
  assert.equal(settle.status, 200);

  const repAfterSettle = await request
    .get(`/api/billing/reputation?agentId=${agentId}`)
    .set("Authorization", `Bearer ${apiToken}`);
  assert.equal(repAfterSettle.status, 200);
  assert.equal(repAfterSettle.body?.ok, true);
  assert.equal(repAfterSettle.body?.data?.agentId, agentId);
  assert.ok(Number(repAfterSettle.body?.data?.completedRuns ?? 0) >= 1);
  assert.ok(Number(repAfterSettle.body?.data?.verifiedReceipts ?? 0) >= 1);

  const openDispute = await request
    .post("/api/billing/disputes")
    .set("Authorization", `Bearer ${apiToken}`)
    .send({
      paymentIntentId,
      runId,
      agentId,
      reason: "commission mismatch",
    });
  assert.equal(openDispute.status, 201);
  const disputeId = openDispute.body?.data?.id as string;
  assert.ok(disputeId);
  assert.equal(openDispute.body?.data?.status, "open");

  const underReview = await request
    .post(`/api/billing/disputes/${disputeId}/transition`)
    .set("Authorization", `Bearer ${apiToken}`)
    .send({ toStatus: "under_review" });
  assert.equal(underReview.status, 200);
  assert.equal(underReview.body?.data?.status, "under_review");

  const resolved = await request
    .post(`/api/billing/disputes/${disputeId}/transition`)
    .set("Authorization", `Bearer ${apiToken}`)
    .send({ toStatus: "resolved", resolution: "verified with docs" });
  assert.equal(resolved.status, 200);
  assert.equal(resolved.body?.data?.status, "resolved");

  const repAfterDispute = await request
    .get(`/api/billing/reputation?agentId=${agentId}`)
    .set("Authorization", `Bearer ${apiToken}`);
  assert.equal(repAfterDispute.status, 200);
  assert.ok(Number(repAfterDispute.body?.data?.disputesTotal ?? 0) >= 1);
  assert.ok(Number(repAfterDispute.body?.data?.disputeRate ?? 0) > 0);

  const invalidReplay = await request
    .post(`/api/billing/disputes/${disputeId}/transition`)
    .set("Authorization", `Bearer ${apiToken}`)
    .send({ toStatus: "resolved" });
  assert.equal(invalidReplay.status, 409);
  assert.equal(invalidReplay.body?.error?.code, "INVALID_DISPUTE_TRANSITION");
});

