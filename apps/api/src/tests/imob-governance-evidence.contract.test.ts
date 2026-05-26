import "./support/testInfraEnv";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import supertest from "supertest";
import { prismaGlobal } from "@repo/db";

let request: ReturnType<typeof supertest>;

const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const tenantId = `tenant-imob-guard-${suffix}`;
const workspaceId = `workspace-imob-guard-${suffix}`;
const userId = `user-imob-guard-${suffix}`;
const apiToken = `tok-imob-guard-${suffix}`;
const caseId = `case-imob-guard-${suffix}`;
const runId = `run-imob-guard-${suffix}`;
const txId = `tx-imob-guard-${suffix}`;

before(async () => {
  process.env.NODE_ENV = "test";
  const { default: app } = await import("../index");
  request = supertest(app);

  await prismaGlobal.tenant.create({ data: { id: tenantId, name: tenantId } });
  await prismaGlobal.workspace.create({ data: { id: workspaceId, tenantId, name: workspaceId } });
  await prismaGlobal.user.create({
    data: { id: userId, tenantId, email: `${userId}@example.com`, displayName: "Guardian Evidence Tester" },
  });
  await prismaGlobal.apiToken.create({
    data: {
      token: apiToken,
      tenantId,
      workspaceId,
      userId,
      description: "imob-governance-evidence-contract-test",
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
      status: "success",
      txId,
      sclTxId: txId,
      criticalHash: `critical-imob-guard-${suffix}`,
      request: { metadata: { domain: "imob", action: "commission.settle" } },
      response: { ok: true },
    },
  });

  await prismaGlobal.imobCase.create({
    data: {
      id: caseId,
      tenantId,
      workspaceId,
      flow: "commission.settle",
      stage: "settled",
      status: "success",
      ownerResponsible: "Corretor",
      nextStep: "consultar recibo da comissão",
      blockers: [],
      pendingItems: [],
      metadata: {
        proof: {
          required: true,
          ready: true,
          state: "ready",
          runId,
          txId,
          receiptPath: `/api/ledger/${txId}`,
          bundlePath: `/api/runs/${runId}/bundle`,
          verifyUrl: `/api/ledger/${txId}`,
        },
      },
    },
  });

  await prismaGlobal.imobCaseEvent.create({
    data: {
      caseId,
      tenantId,
      workspaceId,
      runId,
      type: "commission.settlement.completed",
      actorType: "agent",
      actorRef: "Guardian_EvidenceAgent",
      summary: "Commission proof recorded",
      evidenceRef: `ledger://${txId}`,
    },
  });
});

after(async () => {
  await prismaGlobal.$disconnect();
});

test("GET /api/governance/imob/cases/:caseId/evidence returns auditable evidence export by mission", async () => {
  const res = await request
    .get(`/api/governance/imob/cases/${caseId}/evidence`)
    .set("Authorization", `Bearer ${apiToken}`);

  assert.equal(res.status, 200);
  assert.equal(res.body?.ok, true);
  assert.equal(res.body?.data?.caseId, caseId);
  assert.equal(res.body?.data?.flow, "commission.settle");
  assert.equal(res.body?.data?.mission, "settle_commission");
  assert.equal(res.body?.data?.evidence?.status, "satisfied");
  assert.equal(res.body?.data?.evidence?.required, true);
  assert.equal(res.body?.data?.export?.runId, runId);
  assert.equal(res.body?.data?.export?.txId, txId);
  assert.equal(res.body?.data?.export?.receiptPath, `/api/ledger/${txId}`);
  assert.equal(res.body?.data?.export?.bundlePath, `/api/runs/${runId}/bundle`);
  assert.equal(res.body?.data?.export?.bundleEndpointTemplate, "/api/runs/:runId/bundle");
  assert.equal(res.body?.data?.export?.ledgerEndpointTemplate, "/api/ledger/:txId");
  assert.equal(Array.isArray(res.body?.data?.audit?.eventRefs), true);
  assert.equal(res.body?.data?.audit?.eventRefs?.[0]?.evidenceRef, `ledger://${txId}`);
});
