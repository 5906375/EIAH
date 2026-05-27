import "./support/testInfraEnv";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import supertest from "supertest";
import { prismaGlobal } from "@repo/db";

let request: ReturnType<typeof supertest>;

const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const tenantId = `tenant-imob-coherence-${suffix}`;
const workspaceId = `workspace-imob-coherence-${suffix}`;
const userId = `user-imob-coherence-${suffix}`;
const apiToken = `tok-imob-coherence-${suffix}`;

before(async () => {
  process.env.NODE_ENV = "test";
  const { default: app } = await import("../index");
  request = supertest(app);

  await prismaGlobal.tenant.create({ data: { id: tenantId, name: tenantId } });
  await prismaGlobal.workspace.create({ data: { id: workspaceId, tenantId, name: workspaceId } });
  await prismaGlobal.user.create({
    data: { id: userId, tenantId, email: `${userId}@example.com`, displayName: "IMOB Coherence Tester" },
  });
  await prismaGlobal.apiToken.create({
    data: {
      token: apiToken,
      tenantId,
      workspaceId,
      userId,
      description: "imob-continuity-coherence-test",
      revoked: false,
    },
  });
});

after(async () => {
  await prismaGlobal.apiToken.deleteMany({ where: { tenantId } });
  await prismaGlobal.user.deleteMany({ where: { tenantId } });
  await prismaGlobal.workspace.deleteMany({ where: { tenantId } });
  await prismaGlobal.tenant.deleteMany({ where: { id: tenantId } });
  await prismaGlobal.$disconnect();
});

test("IMOB continuity coherence route exposes gates, constraints and reference baseline without touching UI surface", async () => {
  const res = await request
    .get(`/api/imob/command-center/continuity-coherence?workspaceId=${workspaceId}`)
    .set("Authorization", `Bearer ${apiToken}`);

  assert.equal(res.status, 200);
  assert.equal(res.body?.ok, true);
  assert.equal(res.body?.data?.workspaceId, workspaceId);
  assert.equal(res.body?.data?.phase, "imob_crm_continuity_hardening_phase_1");
  assert.equal(res.body?.data?.rolloutConstraints?.preserveExistingFlows, true);
  assert.equal(res.body?.data?.rolloutConstraints?.preserveVisualLayout, true);
  assert.equal(res.body?.data?.rolloutConstraints?.preserveResponsiveness, true);
  assert.equal(res.body?.data?.rolloutConstraints?.launcherRulesChanged, false);
  assert.equal(res.body?.data?.thresholds?.invalidSuggestedActionRateMax, 0.05);
  assert.equal(res.body?.data?.thresholds?.businessContinuationSuccessRateMin, 0.7);
  assert.equal(res.body?.data?.metrics?.score70Gate, true);
  assert.equal(res.body?.data?.metrics?.gates?.nextStepDominanceRate, true);
  assert.equal(Array.isArray(res.body?.data?.scenarios), true);
  assert.ok((res.body?.data?.scenarios ?? []).some((item: any) => item.scenarioId === "market-scan-confirmation"));
});
