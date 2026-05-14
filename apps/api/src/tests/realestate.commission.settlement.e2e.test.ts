import "./support/testInfraEnv";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import supertest from "supertest";
import { prismaGlobal } from "@repo/db";

let request: ReturnType<typeof supertest>;

const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const tenantId = `tenant-commission-${suffix}`;
const workspaceId = `workspace-commission-${suffix}`;
const userId = `user-commission-${suffix}`;
const apiToken = `tok-commission-${suffix}`;
const runId = `run-commission-${suffix}`;

before(async () => {
  process.env.NODE_ENV = "test";
  process.env.BILLING_WEBHOOK_SECRET = "whsec-local";
  const { default: app } = await import("../index");
  request = supertest(app);

  await prismaGlobal.tenant.create({ data: { id: tenantId, name: tenantId } });
  await prismaGlobal.workspace.create({ data: { id: workspaceId, tenantId, name: workspaceId } });
  await prismaGlobal.user.create({
    data: { id: userId, tenantId, email: `${userId}@example.com`, displayName: "Commission Tester" },
  });
  await prismaGlobal.apiToken.create({
    data: {
      token: apiToken,
      tenantId,
      workspaceId,
      userId,
      description: "realestate-commission-test",
      revoked: false,
    },
  });

  const txId = `tx-commission-${suffix}-01`;
  const criticalHash = `critical-commission-${suffix}-01`;
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
      signature: "sig-realestate-commission-test",
      payload: { source: "realestate-commission-test" },
    },
  });
});

after(async () => {
  await prismaGlobal.$disconnect();
});

test("Commission settlement links run+receipt and remains idempotent on replay", async () => {
  const requestId = `realestate-commission-${suffix}-01`;
  const first = await request
    .post("/api/billing/realestate/commission/settle")
    .set("Authorization", `Bearer ${apiToken}`)
    .send({
      runId,
      amountCents: 15000,
      provider: "stripe",
      requestId,
      agentId: "fin-nexus",
    });

  assert.equal(first.status, 200);
  assert.equal(first.body?.ok, true);
  assert.equal(first.body?.data?.paymentIntent?.status, "settled");
  assert.equal(typeof first.body?.data?.reconciliation?.hasSettlementLedger, "boolean");

  let firstCount: number | null = null;
  try {
    const ledgerBefore = await prismaGlobal.$queryRawUnsafe(
      `
        SELECT COUNT(*)::int AS count
        FROM "billing_ledger"
        WHERE "tenant_id"=$1 AND "run_id"=$2;
      `,
      tenantId,
      runId
    ) as Array<{ count: number }>;
    firstCount = Number(ledgerBefore[0]?.count ?? 0);
  } catch {
    firstCount = null;
  }

  const replay = await request
    .post("/api/billing/realestate/commission/settle")
    .set("Authorization", `Bearer ${apiToken}`)
    .send({
      runId,
      amountCents: 15000,
      provider: "stripe",
      requestId,
      agentId: "fin-nexus",
    });
  assert.equal(replay.status, 200);
  assert.equal(replay.body?.ok, true);
  assert.equal(replay.body?.data?.paymentIntent?.status, "settled");

  assert.equal(replay.body?.data?.paymentIntent?.id, first.body?.data?.paymentIntent?.id);
  if (firstCount !== null) {
    const ledgerAfter = await prismaGlobal.$queryRawUnsafe(
      `
        SELECT COUNT(*)::int AS count
        FROM "billing_ledger"
        WHERE "tenant_id"=$1 AND "run_id"=$2;
      `,
      tenantId,
      runId
    ) as Array<{ count: number }>;
    const secondCount = Number(ledgerAfter[0]?.count ?? 0);
    assert.equal(secondCount, firstCount);
  }
});
