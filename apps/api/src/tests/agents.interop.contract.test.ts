import "./support/testInfraEnv";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import supertest from "supertest";
import { prismaGlobal } from "@repo/db";
import { closeRunQueueConnections } from "@eiah/core";

let request: ReturnType<typeof supertest>;

const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const tenantId = `tenant-interop-${suffix}`;
const workspaceId = `workspace-interop-${suffix}`;
const userId = `user-interop-${suffix}`;
const apiToken = `tok-interop-${suffix}`;
const tenantNoPolicyId = `tenant-interop-nopolicy-${suffix}`;
const workspaceNoPolicyId = `workspace-interop-nopolicy-${suffix}`;
const userNoPolicyId = `user-interop-nopolicy-${suffix}`;
const apiTokenNoPolicy = `tok-interop-nopolicy-${suffix}`;
const actionName = "realestate.apply_adjustment";

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
      displayName: "Interop Tester",
    },
  });
  await prismaGlobal.apiToken.create({
    data: {
      token: apiToken,
      tenantId,
      workspaceId,
      userId,
      description: "interop-contract-test",
      revoked: false,
    },
  });
  await prismaGlobal.tenant.create({
    data: { id: tenantNoPolicyId, name: tenantNoPolicyId },
  });
  await prismaGlobal.workspace.create({
    data: { id: workspaceNoPolicyId, tenantId: tenantNoPolicyId, name: workspaceNoPolicyId },
  });
  await prismaGlobal.user.create({
    data: {
      id: userNoPolicyId,
      tenantId: tenantNoPolicyId,
      email: `${userNoPolicyId}@example.com`,
      displayName: "Interop No Policy Tester",
    },
  });
  await prismaGlobal.apiToken.create({
    data: {
      token: apiTokenNoPolicy,
      tenantId: tenantNoPolicyId,
      workspaceId: workspaceNoPolicyId,
      userId: userNoPolicyId,
      description: "interop-contract-test-no-policy",
      revoked: false,
    },
  });
  await prismaGlobal.tenantActionPolicy.create({
    data: {
      tenantId,
      workspaceId,
      actionName,
      allowed: true,
      maxVersion: 1,
    },
  });
});

after(async () => {
  // guardrail_ledger is append-only by design; keep tenant-scoped records for audit trail.
  await prismaGlobal.sclLedger.deleteMany({ where: { tenantId } });
  await prismaGlobal.runEvent.deleteMany({ where: { tenantId } });
  await prismaGlobal.run.deleteMany({ where: { tenantId } });
  await prismaGlobal.tenantActionPolicy.deleteMany({ where: { tenantId } });
  await prismaGlobal.apiToken.deleteMany({ where: { tenantId: tenantNoPolicyId } });
  await prismaGlobal.user.deleteMany({ where: { tenantId: tenantNoPolicyId } });
  await prismaGlobal.workspace.deleteMany({ where: { tenantId: tenantNoPolicyId } });
  await prismaGlobal.tenant.deleteMany({ where: { id: tenantNoPolicyId } });
  await prismaGlobal.apiToken.deleteMany({ where: { tenantId } });
  await prismaGlobal.user.deleteMany({ where: { tenantId } });
  await prismaGlobal.workspace.deleteMany({ where: { tenantId } });
  await prismaGlobal.tenant.deleteMany({ where: { id: tenantId } });
  await closeRunQueueConnections();
  await prismaGlobal.$disconnect();
});

test("POST /api/agents/discovery retorna ações disponíveis por tenant", async () => {
  const res = await request
    .post("/api/agents/discovery")
    .set("Authorization", `Bearer ${apiToken}`)
    .send({ domain: "imob", actions: [actionName] });

  assert.equal(res.status, 200);
  assert.equal(res.body?.ok, true);
  assert.equal(res.body?.data?.protocolVersion, "agent-protocol.v1");
  assert.ok(Array.isArray(res.body?.data?.actions));
  assert.equal(res.body?.data?.actions?.[0]?.action, actionName);
});

test("POST /api/agents/discovery falha fechado sem policy explícita", async () => {
  const res = await request
    .post("/api/agents/discovery")
    .set("Authorization", `Bearer ${apiTokenNoPolicy}`)
    .send({ domain: "imob", actions: [actionName] });

  assert.equal(res.status, 403);
  assert.equal(res.body?.ok, false);
  assert.equal(res.body?.error?.code, "POLICY_NOT_FOUND");
  assert.equal(res.body?.error?.reasonCode, "POLICY_NOT_FOUND");
});

test("POST /api/agents/negotiate negocia versão e contrato", async () => {
  const res = await request
    .post("/api/agents/negotiate")
    .set("Authorization", `Bearer ${apiToken}`)
    .send({ domain: "imob", action: actionName, version: "1.2.0" });

  assert.equal(res.status, 200);
  assert.equal(res.body?.ok, true);
  assert.equal(res.body?.data?.contract?.action, actionName);
  assert.equal(res.body?.data?.contract?.version, "1.2.0");
  assert.equal(res.body?.data?.contract?.receiptSchema?.specVersion, "receipt.canon.v1");
});

test("POST /api/agents/execute enfileira run e permite verificação via ledger após reconciliação", async () => {
  const executeRes = await request
    .post("/api/agents/execute")
    .set("Authorization", `Bearer ${apiToken}`)
    .send({
      domain: "imob",
      action: actionName,
      version: "1.2.0",
      input: {
        propertyId: "prop-001",
        adjustmentType: "discount",
        amountCents: 5000,
        reason: "pilot incentive",
      },
    });

  assert.equal(executeRes.status, 202);
  assert.equal(executeRes.body?.ok, true);
  const runId = executeRes.body?.data?.runId as string;
  assert.ok(runId);

  const txId = `tx-interop-${suffix}-0001`;
  const criticalHash = `critical-interop-${suffix}`;

  await prismaGlobal.run.update({
    where: { id: runId },
    data: {
      status: "success",
      txId,
      sclTxId: txId,
      criticalHash,
      response: {
        ok: true,
        source: "interop-contract-test",
      },
    },
  });

  await prismaGlobal.sclLedger.create({
    data: {
      tenantId,
      workspaceId,
      runId,
      txId,
      criticalHash,
      signature: "sig-interop-contract-test",
      payload: { source: "interop-contract-test" },
    },
  });

  const ledgerRes = await request.get(`/api/ledger/${txId}`).set("Authorization", `Bearer ${apiToken}`);

  assert.equal(ledgerRes.status, 200);
  assert.equal(ledgerRes.body?.ok, true);
  assert.equal(ledgerRes.body?.txId, txId);
  assert.equal(ledgerRes.body?.run?.id, runId);
  assert.equal(ledgerRes.body?.invariant?.status, "ok");
  assert.equal(ledgerRes.body?.receiptCanon?.specVersion, "receipt.canon.v1");
});
