import "./support/testInfraEnv.js";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import supertest, { type Response as SupertestResponse } from "supertest";
import { closePrismaResources, prismaGlobal } from "@repo/db";
import { runAtivoUniversalDLQ, runAtivoUniversalQueue } from "@eiah/core";

import { imobRunCompletedQueue } from "../queues/imobRunCompletedQueue.js";
import { finalizeHttpContractCleanup } from "./support/httpContractCleanup.js";

const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const tenantId = `tenant-imob-assignment-${suffix}`;
const workspaceId = `workspace-imob-assignment-${suffix}`;
const userId = `user-imob-assignment-${suffix}`;
const apiToken = `tok-imob-assignment-${suffix}`;
const auditAgent = "imob-chat-audit";

let request: ReturnType<typeof supertest>;
let createdAgentMetadata = false;
let auditAgentVersion = "1.0.0";

async function assignmentSnapshot() {
  return prismaGlobal.workspaceAgentAssignment.findMany({
    where: { tenantId, workspaceId },
    orderBy: { id: "asc" },
    select: { id: true, enabled: true, updatedAt: true },
  });
}

async function operationalSnapshot() {
  const [memoryEvents, runs, assignments, queue] = await Promise.all([
    prismaGlobal.memoryEvent.count({ where: { tenantId, workspaceId } }),
    prismaGlobal.run.count({ where: { tenantId, workspaceId } }),
    assignmentSnapshot(),
    imobRunCompletedQueue.getJobCounts(
      "waiting",
      "active",
      "delayed",
      "completed",
      "failed",
      "paused",
      "prioritized",
    ),
  ]);
  return { memoryEvents, runs, assignments, queue };
}

function assertSanitizedAssignmentDenial(response: SupertestResponse) {
  assert.equal(response.status, 403, JSON.stringify(response.body));
  assert.equal(response.body?.ok, false);
  assert.equal(response.body?.error?.code, "AGENT_ASSIGNMENT_REQUIRED");
  assert.equal(response.body?.error?.reasonCode, "AGENT_ASSIGNMENT_REQUIRED");
  assert.equal(
    response.body?.error?.message,
    "Agent execution requires an exact enabled workspace assignment.",
  );
  assert.equal(response.body?.error?.context, undefined);
  assert.doesNotMatch(
    JSON.stringify(response.body),
    /assignmentId|tenantId|workspaceId|requestedAgentVersion|candidateIds|ambiguous/i,
  );
}

before(async () => {
  process.env.NODE_ENV = "test";
  const { default: app } = await import("../index");
  request = supertest(app);

  await prismaGlobal.tenant.create({ data: { id: tenantId, name: tenantId } });
  await prismaGlobal.workspace.create({ data: { id: workspaceId, tenantId, name: workspaceId } });
  await prismaGlobal.user.create({
    data: {
      id: userId,
      tenantId,
      email: `${userId}@example-test.internal`,
      displayName: "IMOB Assignment Gate Tester",
    },
  });
  await prismaGlobal.apiToken.create({
    data: {
      token: apiToken,
      tenantId,
      workspaceId,
      userId,
      description: "imob-assignment-gate-test",
      revoked: false,
    },
  });

  const existingMetadata = await prismaGlobal.agentMetadata.findUnique({
    where: { agent: auditAgent },
    select: { version: true },
  });
  if (existingMetadata) {
    auditAgentVersion = existingMetadata.version;
  } else {
    const metadata = await prismaGlobal.agentMetadata.create({
      data: {
        agent: auditAgent,
        displayName: "IMOB Chat Audit",
        description: "Test metadata for the IMOB chat audit agent",
        category: "audit",
        version: auditAgentVersion,
      },
    });
    auditAgentVersion = metadata.version;
    createdAgentMetadata = true;
  }
});

after(async () => {
  await prismaGlobal.runEvent.deleteMany({ where: { tenantId, workspaceId } });
  await prismaGlobal.memoryEvent.deleteMany({ where: { tenantId, workspaceId } });
  await prismaGlobal.guardrailAuditLedger.deleteMany({ where: { tenantId, workspaceId } });
  await prismaGlobal.run.deleteMany({ where: { tenantId, workspaceId } });
  await prismaGlobal.workspaceAgentAssignment.deleteMany({ where: { tenantId, workspaceId } });
  await prismaGlobal.apiToken.deleteMany({ where: { tenantId } });
  await prismaGlobal.user.deleteMany({ where: { tenantId } });
  await prismaGlobal.workspace.deleteMany({ where: { tenantId } });
  await prismaGlobal.tenant.deleteMany({ where: { id: tenantId } });
  if (createdAgentMetadata) {
    await prismaGlobal.agentMetadata.deleteMany({ where: { agent: auditAgent } });
  }
  await closePrismaResources();
  finalizeHttpContractCleanup();
  await imobRunCompletedQueue.close();
  await runAtivoUniversalQueue.close();
  await runAtivoUniversalDLQ.close();
});

test("IMOB conversation and message writes are assignment-gated fail-closed", async () => {
  const beforeConversation = await operationalSnapshot();
  const deniedConversation = await request
    .post("/api/imob/chat/conversations")
    .set("Authorization", `Bearer ${apiToken}`)
    .send({ title: "Blocked conversation" });

  assertSanitizedAssignmentDenial(deniedConversation);
  assert.deepEqual(await operationalSnapshot(), beforeConversation);

  const auditAfterConversation = await prismaGlobal.guardrailAuditLedger.findMany({
    where: { tenantId, workspaceId, eventType: "agent.assignment.required" },
  });
  assert.equal(auditAfterConversation.length, 1, "assignment refusal must be audited");

  const auditBeforeUnknownConversation = await prismaGlobal.guardrailAuditLedger.count({
    where: { tenantId, workspaceId, eventType: "agent.assignment.required" },
  });
  const unknownConversation = await request
    .post("/api/imob/chat/conversations/not-in-this-workspace/messages")
    .set("Authorization", `Bearer ${apiToken}`)
    .send({ role: "user", content: "Must not enumerate another conversation" });
  assert.equal(unknownConversation.status, 404);
  assert.equal(unknownConversation.body?.error?.code, "CONVERSATION_NOT_FOUND");
  assert.equal(
    await prismaGlobal.guardrailAuditLedger.count({
      where: { tenantId, workspaceId, eventType: "agent.assignment.required" },
    }),
    auditBeforeUnknownConversation,
    "ownership validation must precede the assignment gate",
  );

  const conversationId = `conversation-owned-${suffix}`;
  await prismaGlobal.memoryEvent.create({
    data: {
      tenantId,
      workspaceId,
      agentId: "imob-chat",
      runId: null,
      key: "conversation.created",
      content: "Owned fixture conversation",
      metadata: { conversationId, title: "Owned fixture conversation", status: "active" },
    },
  });

  const beforeMessage = await operationalSnapshot();
  const deniedMessage = await request
    .post(`/api/imob/chat/conversations/${conversationId}/messages`)
    .set("Authorization", `Bearer ${apiToken}`)
    .send({ role: "user", content: "Blocked message" });

  assertSanitizedAssignmentDenial(deniedMessage);
  assert.deepEqual(await operationalSnapshot(), beforeMessage);
  assert.equal(
    await prismaGlobal.memoryEvent.count({
      where: { tenantId, workspaceId, key: "conversation.message" },
    }),
    0,
  );

  const explicitAssignment = await prismaGlobal.workspaceAgentAssignment.create({
    data: {
      tenantId,
      workspaceId,
      agentKey: auditAgent,
      agentVersion: auditAgentVersion,
      enabled: true,
    },
  });
  assert.equal(explicitAssignment.signedByUserId, null);
  assert.equal(explicitAssignment.signedAt, null);
  assert.equal(explicitAssignment.signatureRef, null);

  const assignmentBeforeSuccess = await assignmentSnapshot();
  const createdConversation = await request
    .post("/api/imob/chat/conversations")
    .set("Authorization", `Bearer ${apiToken}`)
    .send({ title: "Allowed conversation" });
  assert.equal(createdConversation.status, 201, JSON.stringify(createdConversation.body));
  const allowedConversationId = createdConversation.body?.conversation?.conversationId;
  assert.equal(typeof allowedConversationId, "string");

  const createdMessage = await request
    .post(`/api/imob/chat/conversations/${allowedConversationId}/messages`)
    .set("Authorization", `Bearer ${apiToken}`)
    .send({ role: "user", content: "Allowed message" });
  assert.equal(createdMessage.status, 201, JSON.stringify(createdMessage.body));
  assert.equal(createdMessage.body?.message?.content, "Allowed message");
  assert.deepEqual(await assignmentSnapshot(), assignmentBeforeSuccess);
});
