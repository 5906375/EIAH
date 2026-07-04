import "./support/testInfraEnv";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import supertest from "supertest";
import { prismaGlobal } from "@repo/db";

let request: ReturnType<typeof supertest>;

const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const tenantId = `tenant-imob-cc-${suffix}`;
const workspaceId = `workspace-imob-cc-${suffix}`;
const userId = `user-imob-cc-${suffix}`;
const apiToken = `tok-imob-cc-${suffix}`;
const blockedRunId = `run-imob-blocked-${suffix}`;
const blockedCaseThreadId = `thread-imob-cc-${suffix}`;

before(async () => {
  process.env.NODE_ENV = "test";
  const { default: app } = await import("../index");
  request = supertest(app);

  await prismaGlobal.tenant.create({ data: { id: tenantId, name: tenantId } });
  await prismaGlobal.workspace.create({ data: { id: workspaceId, tenantId, name: workspaceId } });
  await prismaGlobal.user.create({
    data: { id: userId, tenantId, email: `${userId}@example.com`, displayName: "IMOB Command Center Tester" },
  });
  await prismaGlobal.apiToken.create({
    data: {
      token: apiToken,
      tenantId,
      workspaceId,
      userId,
      description: "imob-command-center-test",
      revoked: false,
    },
  });

  await prismaGlobal.run.create({
    data: {
      id: blockedRunId,
      tenantId,
      workspaceId,
      userId,
      agent: "fin-nexus",
      status: "blocked",
      txId: `tx-imob-cc-${suffix}`,
      criticalHash: `critical-imob-cc-${suffix}`,
      request: { metadata: { domain: "imob", action: "realestate.apply_adjustment" } },
      response: { ok: false },
    },
  });
  await prismaGlobal.runEvent.create({
    data: {
      runId: blockedRunId,
      tenantId,
      workspaceId,
      userId,
      type: "run.blocked.guardrails",
      payload: { reasonCodes: ["RISK_THRESHOLD_EXCEEDED"] },
    },
  });

  await prismaGlobal.imobCase.create({
    data: {
      tenantId,
      workspaceId,
      threadId: blockedCaseThreadId,
      flow: "commission.settlement",
      stage: "guardrails_review",
      status: "blocked",
      nextStep: "Revisar risco antes de seguir com o ajuste",
      blockers: ["RISK_THRESHOLD_EXCEEDED"],
      pendingItems: ["manualApproval"],
      metadata: { commandCenter: { seededBy: "imob.command-center.smoke.test" } },
    },
  });
});

after(async () => {
  await prismaGlobal.$disconnect();
});

test("IMOB Command Center returns workspace-scoped funnel and blocked list", async () => {
  const cases = await request
    .get(`/api/imob/cases?workspaceId=${workspaceId}`)
    .set("Authorization", `Bearer ${apiToken}`);

  assert.equal(cases.status, 200);
  assert.equal(cases.body?.ok, true);
  const seededCase = (cases.body?.data?.items ?? []).find((item: any) => item.threadId === blockedCaseThreadId);
  assert.ok(seededCase);
  assert.equal(seededCase?.artifactCapabilities?.canOpenChat?.allowed, true);
  assert.equal(seededCase?.artifactCapabilities?.canViewCaseDossier?.allowed, true);
  assert.equal(seededCase?.artifactCapabilities?.canViewCaseReceipt?.allowed, true);

  const health = await request
    .get(`/api/imob/command-center/funnel-health?workspaceId=${workspaceId}&window=7d`)
    .set("Authorization", `Bearer ${apiToken}`);

  assert.equal(health.status, 200);
  assert.equal(health.body?.ok, true);
  assert.equal(health.body?.data?.workspaceId, workspaceId);
  assert.ok(Number(health.body?.data?.summary?.blockedTotal ?? 0) >= 1);
  const reasonCodes = (health.body?.data?.byReasonCode ?? []).map((item: any) => item.reasonCode);
  assert.ok(reasonCodes.includes("RISK_THRESHOLD_EXCEEDED"));

  const blocked = await request
    .get(`/api/imob/command-center/blocked-runs?workspaceId=${workspaceId}&status=blocked&reasonCode=RISK_THRESHOLD_EXCEEDED`)
    .set("Authorization", `Bearer ${apiToken}`);

  assert.equal(blocked.status, 200);
  assert.equal(blocked.body?.ok, true);
  const runIds = (blocked.body?.data?.items ?? []).map((item: any) => item.runId);
  assert.ok(runIds.includes(blockedRunId));
  const blockedItem = (blocked.body?.data?.items ?? []).find((item: any) => item.runId === blockedRunId);
  assert.equal(blocked.body?.data?.meta?.proofExport?.bundleEndpointTemplate, "/api/runs/:runId/bundle");
  assert.equal(blocked.body?.data?.meta?.proofExport?.ledgerEndpointTemplate, "/api/ledger/:txId");
  assert.equal(blockedItem?.proof?.receiptPath, `/api/ledger/${encodeURIComponent(`tx-imob-cc-${suffix}`)}`);
  assert.equal(blockedItem?.proof?.bundlePath, `/api/runs/${encodeURIComponent(blockedRunId)}/bundle`);
  assert.equal(blockedItem?.proof?.artifactCapabilities?.canViewRunBundle?.allowed, false);
  assert.equal(typeof blockedItem?.proof?.artifactCapabilities?.canViewRunBundle?.reasonCode, "string");
});
