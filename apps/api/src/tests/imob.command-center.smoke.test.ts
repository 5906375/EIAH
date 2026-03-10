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
});

after(async () => {
  await prismaGlobal.$disconnect();
});

test("IMOB Command Center returns workspace-scoped funnel and blocked list", async () => {
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
});

