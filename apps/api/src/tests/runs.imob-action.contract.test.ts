import "./support/testInfraEnv";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import supertest from "supertest";
import { closePrismaResources, prismaGlobal } from "@repo/db";
import { closeRunQueueConnections } from "@eiah/core/queue/runQueue";
import { finalizeHttpContractCleanup } from "./support/httpContractCleanup";

let request: ReturnType<typeof supertest>;

const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const tenantId = `tenant-runs-imob-action-${suffix}`;
const workspaceId = `workspace-runs-imob-action-${suffix}`;
const userId = `user-runs-imob-action-${suffix}`;
const apiToken = `tok-runs-imob-action-${suffix}`;

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
  await prismaGlobal.runEvent.deleteMany({
    where: { tenantId },
  });
  await prismaGlobal.run.deleteMany({
    where: { tenantId },
  });
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
