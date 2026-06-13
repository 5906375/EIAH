import "./support/testInfraEnv";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import supertest from "supertest";
import { closePrismaResources, prismaGlobal } from "@repo/db";
import { closeRunQueueConnections } from "@eiah/core/queue/runQueue";
import { closeRunEventsTransport } from "../services/runEvents";
import { closeRunEventStream } from "../services/runEventStream";
import { closeRunEventPublisherResources } from "../../../../packages/core/src/events/runEventPublisher.js";
import { finalizeHttpContractCleanup } from "./support/httpContractCleanup";

let request: ReturnType<typeof supertest>;

const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const tenantId = `tenant-shadow-${suffix}`;
const workspaceId = `workspace-shadow-${suffix}`;
const userId = `user-shadow-${suffix}`;
const apiToken = `tok-shadow-${suffix}`;

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
      displayName: "Shadow Preview Tester",
    },
  });
  await prismaGlobal.apiToken.create({
    data: {
      token: apiToken,
      tenantId,
      workspaceId,
      userId,
      description: "shadow-preview-contract-test",
      revoked: false,
    },
  });
});

after(async () => {
  await prismaGlobal.guardrailAuditLedger.deleteMany({
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
  await closeRunEventPublisherResources();
  await closeRunEventStream();
  await closeRunEventsTransport();
  await closeRunQueueConnections();
  await closePrismaResources();
  finalizeHttpContractCleanup();
});

test("POST /api/shadow-executions/preview rejects invalid IMOB action before persisting preview", async () => {
  const response = await request
    .post("/api/shadow-executions/preview")
    .set("Authorization", `Bearer ${apiToken}`)
    .send({
      agent: "EIAH",
      prompt: "registrar imovel no fluxo assistido",
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

  const audits = await prismaGlobal.guardrailAuditLedger.findMany({
    where: { tenantId, workspaceId },
  });
  assert.equal(audits.length, 0);
});
