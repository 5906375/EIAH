import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import process from "node:process";
import supertest from "supertest";
import { prismaGlobal } from "@repo/db";

let request: ReturnType<typeof supertest>;

const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const tenantId = `tenant-imob-chat-${suffix}`;
const workspaceId = `workspace-imob-chat-${suffix}`;
const userId = `user-imob-chat-${suffix}`;
const apiToken = `tok-imob-chat-${suffix}`;

before(async () => {
  process.env.NODE_ENV = "test";
  const { default: app } = await import("../index");
  request = supertest(app);

  await prismaGlobal.tenant.create({ data: { id: tenantId, name: tenantId } });
  await prismaGlobal.workspace.create({ data: { id: workspaceId, tenantId, name: workspaceId } });
  await prismaGlobal.user.create({
    data: { id: userId, tenantId, email: `${userId}@example.com`, displayName: "IMOB Chat Tester" },
  });
  await prismaGlobal.apiToken.create({
    data: {
      token: apiToken,
      tenantId,
      workspaceId,
      userId,
      description: "imob-chat-persistence-test",
      revoked: false,
    },
  });
});

after(async () => {
  await prismaGlobal.runEvent.deleteMany({ where: { tenantId, workspaceId } });
  await prismaGlobal.run.deleteMany({ where: { tenantId, workspaceId } });
  await prismaGlobal.$executeRaw`
    DELETE FROM memory_events
    WHERE tenant_id = ${tenantId}
      AND workspace_id = ${workspaceId}
      AND agent_id = 'imob-chat'
  `;
  await prismaGlobal.$disconnect();
});

test("IMOB chat persistence: create conversation, append messages and list history", async () => {
  const createdConversation = await request
    .post("/api/imob/chat/conversations")
    .set("Authorization", `Bearer ${apiToken}`)
    .send({ title: "Captação BC" });

  assert.equal(createdConversation.status, 201);
  assert.equal(createdConversation.body?.ok, true);
  assert.equal(createdConversation.body?.conversation?.title, "Captação BC");
  assert.equal(typeof createdConversation.body?.conversation?.auditRunId, "string");

  const conversationId = createdConversation.body?.conversation?.conversationId as string;
  const auditRunId = createdConversation.body?.conversation?.auditRunId as string;
  assert.ok(conversationId);
  assert.ok(auditRunId);

  const addUserMessage = await request
    .post(`/api/imob/chat/conversations/${conversationId}/messages`)
    .set("Authorization", `Bearer ${apiToken}`)
    .send({
      role: "user",
      content: "Tenho proprietário com apto em Itapema",
      intent: "capture",
      action: "realestate.register_property",
      threadId: "thread_capture_itapema",
      threadLabel: "Captação",
      threadStatus: "active",
    });

  assert.equal(addUserMessage.status, 201);
  assert.equal(addUserMessage.body?.ok, true);
  assert.equal(addUserMessage.body?.message?.auditRunId, auditRunId);
  assert.equal(typeof addUserMessage.body?.message?.transcriptProof?.entryHash, "string");
  assert.equal(addUserMessage.body?.message?.transcriptProof?.sequence, 1);

  const addAssistantMessage = await request
    .post(`/api/imob/chat/conversations/${conversationId}/messages`)
    .set("Authorization", `Bearer ${apiToken}`)
    .send({
      role: "assistant",
      content: "Plano pronto. Confirme para executar.",
      intent: "capture",
      action: "realestate.register_property",
      threadId: "thread_capture_itapema",
      threadLabel: "Captação",
      threadStatus: "active",
    });

  assert.equal(addAssistantMessage.status, 201);
  assert.equal(addAssistantMessage.body?.ok, true);
  assert.equal(addAssistantMessage.body?.message?.auditRunId, auditRunId);
  assert.equal(typeof addAssistantMessage.body?.message?.transcriptProof?.entryHash, "string");
  assert.equal(addAssistantMessage.body?.message?.transcriptProof?.sequence, 2);

  const listConversations = await request
    .get("/api/imob/chat/conversations?limit=10")
    .set("Authorization", `Bearer ${apiToken}`);

  assert.equal(listConversations.status, 200);
  assert.equal(listConversations.body?.ok, true);
  const foundConversation = (listConversations.body?.items ?? []).find((row: any) => row.conversationId === conversationId);
  assert.ok(foundConversation);
  assert.equal(foundConversation.title, "Captação BC");
  assert.equal(foundConversation.auditRunId, auditRunId);

  const listMessages = await request
    .get(`/api/imob/chat/conversations/${conversationId}/messages`)
    .set("Authorization", `Bearer ${apiToken}`);

  assert.equal(listMessages.status, 200);
  assert.equal(listMessages.body?.ok, true);
  assert.equal(Array.isArray(listMessages.body?.items), true);
  assert.equal(listMessages.body.items.length >= 2, true);
  assert.equal(listMessages.body.items[0].role, "user");
  assert.equal(listMessages.body.items[1].role, "assistant");
  assert.equal(listMessages.body.items[0].threadId, "thread_capture_itapema");
  assert.equal(listMessages.body.items[1].threadLabel, "Captação");
  assert.equal(listMessages.body.items[0].auditRunId, auditRunId);
  assert.equal(listMessages.body.items[1].auditRunId, auditRunId);
  assert.equal(typeof listMessages.body.items[0].transcriptProof?.entryHash, "string");
  assert.equal(typeof listMessages.body.items[1].transcriptProof?.entryHash, "string");

  const listThreads = await request
    .get(`/api/imob/chat/conversations/${conversationId}/threads`)
    .set("Authorization", `Bearer ${apiToken}`);

  assert.equal(listThreads.status, 200);
  assert.equal(listThreads.body?.ok, true);
  assert.equal(Array.isArray(listThreads.body?.items), true);
  assert.equal(listThreads.body.items.length >= 1, true);
  assert.equal(listThreads.body.items[0].threadId, "thread_capture_itapema");
});
