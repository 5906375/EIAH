import "./support/testInfraEnv";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import supertest from "supertest";
import { closePrismaResources, prismaGlobal } from "@repo/db";
import { closeRunQueueConnections } from "@eiah/core/queue/runQueue";
import { closeRunEventPublisherResources } from "../../../../packages/core/src/events/runEventPublisher.js";
import { finalizeHttpContractCleanup } from "./support/httpContractCleanup";
import { hasCoreAgentProfile, resolveAgentId } from "../services/agents";
import { closeRunEventsTransport } from "../services/runEvents";
import { closeRunEventStream } from "../services/runEventStream";

let request: ReturnType<typeof supertest>;

async function resolveCanonicalEiahAssignmentIdentity() {
  const agentKey = resolveAgentId("EIAH");
  const metadata = await prismaGlobal.agentMetadata.findUnique({
    where: { agent: agentKey },
    select: { version: true },
  });
  const agentVersion = metadata?.version?.trim() || (hasCoreAgentProfile(agentKey) ? "1.0.0" : null);
  assert.ok(agentVersion, "EIAH must resolve to a persisted or core assignment version");
  return { agentKey, agentVersion };
}

const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const tenantId = `tenant-runs-imob-action-${suffix}`;
const workspaceId = `workspace-runs-imob-action-${suffix}`;
const userId = `user-runs-imob-action-${suffix}`;
const apiToken = `tok-runs-imob-action-${suffix}`;

before(async () => {
  process.env.NODE_ENV = "test";
  process.env.TENANT_BILLING_V2_GUARD_MODE = "hard";
  const { default: app } = await import("../index");
  request = supertest(app);

  await prismaGlobal.tenant.create({
    data: { id: tenantId, name: tenantId },
  });
  await prismaGlobal.workspace.create({
    data: { id: workspaceId, tenantId, name: workspaceId },
  });
  await prismaGlobal.workspaceQuotaGrant.create({
    data: { tenantId, workspaceId, enabled: false },
  });
  await prismaGlobal.workspaceAgentAssignment.create({
    data: { tenantId, workspaceId, ...(await resolveCanonicalEiahAssignmentIdentity()), enabled: true },
  });
  await prismaGlobal.user.create({
    data: {
      id: userId,
      tenantId,
      email: `${userId}@example.com`,
      displayName: "Runs IMOB Action Tester",
    },
  });
  await prismaGlobal.apiToken.create({
    data: {
      token: apiToken,
      tenantId,
      workspaceId,
      userId,
      description: "runs-imob-action-contract-test",
      revoked: false,
    },
  });
});

after(async () => {
  await prismaGlobal.guardrailAuditLedger.deleteMany({
    where: { tenantId },
  });
  await prismaGlobal.runEvent.deleteMany({
    where: { tenantId },
  });
  await prismaGlobal.run.deleteMany({
    where: { tenantId },
  });
  await prismaGlobal.workspaceAgentAssignment.deleteMany({ where: { tenantId } });
  await prismaGlobal.workspaceQuotaUsage.deleteMany({ where: { tenantId } });
  await prismaGlobal.tenantQuotaUsage.deleteMany({ where: { tenantId } });
  await prismaGlobal.workspaceQuotaGrant.deleteMany({ where: { tenantId } });
  await prismaGlobal.tenantQuotaPolicy.deleteMany({ where: { tenantId } });
  await prismaGlobal.apiToken.deleteMany({
    where: { tenantId },
  });
  await prismaGlobal.user.deleteMany({
    where: { tenantId },
  });
  await prismaGlobal.workspace.deleteMany({
    where: { tenantId },
  });
  await prismaGlobal.tenant.deleteMany({
    where: { id: tenantId },
  });
  await closeRunEventPublisherResources();
  await closeRunEventStream();
  await closeRunEventsTransport();
  await closeRunQueueConnections();
  await closePrismaResources();
  finalizeHttpContractCleanup();
});

test("POST /api/runs rejects invalid IMOB metadata.action when domain is imob", async () => {
  const response = await request
    .post("/api/runs")
    .set("Authorization", `Bearer ${apiToken}`)
    .send({
      agent: "EIAH",
      prompt: "registrar imovel no CRM",
      metadata: {
        domain: "imob",
        action: "realestate.unknown_action",
      },
    });

  assert.equal(response.status, 400);
  assert.equal(response.body?.ok, false);
  assert.equal(response.body?.error?.code, "INVALID_ACTION_TYPE");
  assert.equal(response.body?.error?.reasonCode, "INVALID_ACTION_TYPE");
  assert.equal(response.body?.error?.context?.attemptedAction, "realestate.unknown_action");

  const runs = await prismaGlobal.run.findMany({
    where: { tenantId, workspaceId },
  });
  assert.equal(runs.length, 0);
});

test("POST /api/runs rejects non-audit IMOB input without action", async () => {
  const response = await request
    .post("/api/runs")
    .set("Authorization", `Bearer ${apiToken}`)
    .send({
      agent: "EIAH",
      prompt: "conversa operacional IMOB sem ação",
      metadata: {
        domain: "imob",
        kind: "conversation",
      },
    });

  assert.equal(response.status, 400);
  assert.equal(response.body?.error?.reasonCode, "INVALID_ACTION_TYPE");
  assert.equal(response.body?.error?.context?.attemptedAction, null);
  const runs = await prismaGlobal.run.findMany({ where: { tenantId, workspaceId } });
  assert.equal(runs.length, 0);
});

test("POST /api/runs keeps IMOB conversation_audit without action applicable", async () => {
  const response = await request
    .post("/api/runs")
    .set("Authorization", `Bearer ${apiToken}`)
    .send({
      agent: "EIAH",
      prompt: "auditar conversa IMOB",
      metadata: {
        domain: "imob",
        kind: "conversation_audit",
      },
    });

  assert.equal(response.status, 403);
  assert.equal(response.body?.error?.code, "BILLING_GUARD_BLOCKED");
  assert.notEqual(response.body?.error?.reasonCode, "INVALID_ACTION_TYPE");
  const runId = response.body?.data?.id as string;
  assert.ok(runId);
  const run = await prismaGlobal.run.findUniqueOrThrow({ where: { id: runId } });
  assert.equal((run.request as any)?.metadata?.kind, "conversation_audit");
  assert.equal((run.request as any)?.action, undefined);
});

test("POST /api/runs persists only the server-side not_evaluated governance projection", async () => {
  const response = await request
    .post("/api/runs")
    .set("Authorization", `Bearer ${apiToken}`)
    .send({
      agent: "EIAH",
      prompt: "executar tarefa core de teste",
      metadata: {
        domain: "core",
        rbacEvaluated: true,
        entitlementEvaluated: true,
        governanceContext: {
          rbacEvaluated: true,
          entitlementEvaluated: true,
          policyDecision: "allowed",
        },
      },
    });

  assert.equal(response.status, 403);
  assert.equal(response.body?.error?.code, "BILLING_GUARD_BLOCKED");
  const runId = response.body?.data?.id as string;
  assert.ok(runId);
  const run = await prismaGlobal.run.findUniqueOrThrow({ where: { id: runId }, select: { request: true } });
  const metadata = (run.request as any)?.metadata ?? {};
  assert.equal(metadata.rbacEvaluated, undefined);
  assert.equal(metadata.entitlementEvaluated, undefined);
  assert.equal(metadata.governanceContext?.rbacEvaluated, false);
  assert.equal(metadata.governanceContext?.entitlementEvaluated, false);
  assert.equal(metadata.governanceContext?.policyDecision, "not_evaluated");
  assert.equal(metadata.governanceContext?.reasonCode, "VERTICAL_GOVERNANCE_NOT_EVALUATED");
});

test("POST /api/runs/:id/replay rejects historical operational IMOB without action before publish or pending", async () => {
  const historicRun = await prismaGlobal.run.create({
    data: {
      id: `run-replay-no-action-${suffix}`,
      tenantId,
      workspaceId,
      agent: "EIAH",
      status: "success",
      request: {
        prompt: "historical operational IMOB run",
        metadata: {
          domain: "imob",
          kind: "conversation",
        },
      },
    },
  });
  const eventsBefore = await prismaGlobal.runEvent.count({ where: { runId: historicRun.id } });

  const response = await request
    .post(`/api/runs/${historicRun.id}/replay`)
    .set("Authorization", `Bearer ${apiToken}`)
    .send({});

  assert.equal(response.status, 400);
  assert.equal(response.body?.ok, false);
  assert.equal(response.body?.error?.reasonCode, "INVALID_ACTION_TYPE");
  const persisted = await prismaGlobal.run.findUniqueOrThrow({
    where: { id: historicRun.id },
    select: { status: true },
  });
  assert.equal(persisted.status, "success");
  const eventsAfter = await prismaGlobal.runEvent.count({ where: { runId: historicRun.id } });
  assert.equal(eventsAfter, eventsBefore);
});
