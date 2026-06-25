import "./support/testInfraEnv";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import process from "node:process";
import supertest from "supertest";
import { prismaGlobal } from "@repo/db";

let request: ReturnType<typeof supertest>;
let closeRunEventStream: () => Promise<unknown>;
let closeRunEventsTransport: () => Promise<unknown>;
let closeRunQueueConnections: () => Promise<unknown>;
let closeMemoryResources: () => Promise<unknown>;
let closeRedisPublisher: () => Promise<unknown>;
let closeRunEventPublisherResources: () => Promise<unknown>;
let closeTenantPolicyStoreResources: () => Promise<unknown>;
let closeCriticalMetricsRedis: () => Promise<unknown>;
let closeCriticalKillSwitchRedis: () => Promise<unknown>;

const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const tenantId = `tenant-imob-chat-${suffix}`;
const workspaceId = `workspace-imob-chat-${suffix}`;
const userId = `user-imob-chat-${suffix}`;
const apiToken = `tok-imob-chat-${suffix}`;

before(async () => {
  process.env.NODE_ENV = "test";
  ({ closeRunEventStream } = await import("../services/runEventStream"));
  ({ closeRunEventsTransport } = await import("../services/runEvents"));
  ({ closeRunQueueConnections } = await import("@eiah/core/queue/runQueue"));
  ({ closeMemoryResources } = await import("../services/memory"));
  ({ closeRedisPublisher } = await import("@eiah/core/events/redisPublisher"));
  ({ closeRunEventPublisherResources } = await import("../../../../packages/core/src/events/runEventPublisher.js"));
  ({ closeTenantPolicyStoreResources } = await import("@eiah/core/policy/TenantPolicyStore"));
  ({ closeCriticalMetricsRedis } = await import("../../../../packages/core/src/metrics/criticalMetrics.js"));
  ({ closeCriticalKillSwitchRedis } = await import("../../../../packages/core/src/security/killSwitch.js"));
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
  await closeMemoryResources();
  await closeRedisPublisher();
  await closeRunEventPublisherResources();
  await closeTenantPolicyStoreResources();
  await closeCriticalMetricsRedis();
  await closeCriticalKillSwitchRedis();
  await closeRunEventStream();
  await closeRunEventsTransport();
  await closeRunQueueConnections();
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

test("IMOB chat persistence enforces run correlation and derives completion proof metadata", async () => {
  const conversation = await request
    .post("/api/imob/chat/conversations")
    .set("Authorization", `Bearer ${apiToken}`)
    .send({ title: "Captação com run" });

  assert.equal(conversation.status, 201);
  const conversationId = conversation.body?.conversation?.conversationId as string;
  assert.ok(conversationId);

  const scopedRun = await prismaGlobal.run.create({
    data: {
      tenantId,
      workspaceId,
      userId,
      agent: "EIAH",
      status: "success",
      request: {
        prompt: "Cadastrar imóvel",
        metadata: {
          conversationId,
          threadId: "thread_capture_run",
          txIdRequired: true,
        },
      } as any,
      response: { ok: true } as any,
      txId: "tx-imob-chat-proof-1",
      criticalHash: "critical-imob-chat-proof-1",
    },
  });

  const linkedMessage = await request
    .post(`/api/imob/chat/conversations/${conversationId}/messages`)
    .set("Authorization", `Bearer ${apiToken}`)
    .send({
      role: "assistant",
      content: "Cadastro do imóvel processado com sucesso.",
      runId: scopedRun.id,
      threadStatus: "done",
    });

  assert.equal(linkedMessage.status, 201);
  assert.equal(linkedMessage.body?.message?.txId, "tx-imob-chat-proof-1");
  assert.equal(linkedMessage.body?.message?.bundlePath, `/api/runs/${scopedRun.id}/bundle`);
  assert.equal(linkedMessage.body?.message?.receiptPath, "/api/ledger/tx-imob-chat-proof-1");
  assert.equal(linkedMessage.body?.message?.proof?.required, true);
  assert.equal(linkedMessage.body?.message?.proof?.ready, true);
  assert.equal(linkedMessage.body?.message?.proof?.state, "ready");
  assert.equal(linkedMessage.body?.message?.proof?.runId, scopedRun.id);
  assert.equal(linkedMessage.body?.message?.metadata?.completionState, "success_full");
  assert.equal(linkedMessage.body?.message?.threadId, "thread_capture_run");

  const mismatch = await request
    .post(`/api/imob/chat/conversations/${conversationId}/messages`)
    .set("Authorization", `Bearer ${apiToken}`)
    .send({
      role: "assistant",
      content: "Mensagem inválida por mismatch",
      runId: scopedRun.id,
      threadId: "thread_outro",
    });

  assert.equal(mismatch.status, 409);
  assert.equal(mismatch.body?.error?.code, "RUN_THREAD_MISMATCH");

  const snapshot = await request
    .get(`/api/imob/chat/conversations/${conversationId}/snapshot`)
    .set("Authorization", `Bearer ${apiToken}`);

  assert.equal(snapshot.status, 200);
  assert.equal(snapshot.body?.ok, true);
  assert.equal(snapshot.body?.snapshot?.business?.linkedRuns >= 1, true);
  assert.equal(snapshot.body?.snapshot?.business?.linkedReceipts >= 1, true);
  assert.equal(snapshot.body?.snapshot?.business?.linkedBundles >= 1, true);

  const exported = await request
    .get(`/api/imob/chat/conversations/${conversationId}/export?format=json`)
    .set("Authorization", `Bearer ${apiToken}`);

  assert.equal(exported.status, 200);
  assert.equal(exported.body?.ok, true);
  const messageWithProof = (exported.body?.exported?.messages ?? []).find(
    (item: any) => item.runId === scopedRun.id
  );
  assert.ok(messageWithProof);
  assert.equal(messageWithProof.txId, "tx-imob-chat-proof-1");
  assert.equal(messageWithProof.bundlePath, `/api/runs/${scopedRun.id}/bundle`);
  assert.equal(messageWithProof.receiptPath, "/api/ledger/tx-imob-chat-proof-1");
  assert.equal(messageWithProof.proof?.required, true);
  assert.equal(messageWithProof.proof?.ready, true);
  assert.equal(messageWithProof.proof?.state, "ready");
});

test("IMOB chat persistence keeps proof-required completions waiting until receipt and bundle exist", async () => {
  const conversation = await request
    .post("/api/imob/chat/conversations")
    .set("Authorization", `Bearer ${apiToken}`)
    .send({ title: "Captação aguardando prova" });

  assert.equal(conversation.status, 201);
  const conversationId = conversation.body?.conversation?.conversationId as string;
  assert.ok(conversationId);

  const scopedRun = await prismaGlobal.run.create({
    data: {
      tenantId,
      workspaceId,
      userId,
      agent: "EIAH",
      status: "success",
      request: {
        prompt: "Cadastrar imóvel sem prova final",
        metadata: {
          conversationId,
          threadId: "thread_capture_pending_proof",
          txIdRequired: true,
        },
      } as any,
      response: { ok: true } as any,
      txId: null,
      criticalHash: null,
    },
  });

  const linkedMessage = await request
    .post(`/api/imob/chat/conversations/${conversationId}/messages`)
    .set("Authorization", `Bearer ${apiToken}`)
    .send({
      role: "assistant",
      content: "Processamento concluído, aguardando prova final.",
      runId: scopedRun.id,
      threadStatus: "done",
      completionState: "success_full",
    });

  assert.equal(linkedMessage.status, 201);
  assert.equal(linkedMessage.body?.message?.metadata?.completionState, "success_partial");
  assert.equal(linkedMessage.body?.message?.metadata?.proofRequired, true);
  assert.equal(linkedMessage.body?.message?.metadata?.proofReady, false);
  assert.equal(linkedMessage.body?.message?.metadata?.proofState, "proof_pending");
  assert.equal(linkedMessage.body?.message?.proof?.required, true);
  assert.equal(linkedMessage.body?.message?.proof?.ready, false);
  assert.equal(linkedMessage.body?.message?.proof?.state, "pending");
  assert.equal(linkedMessage.body?.message?.threadStatus, "waiting");
  assert.equal(linkedMessage.body?.message?.txId, null);
  assert.equal(linkedMessage.body?.message?.bundlePath, null);
  assert.equal(linkedMessage.body?.message?.receiptPath, null);
});

test("IMOB chat persistence preserves contract_intake_result widget metadata", async () => {
  const conversation = await request
    .post("/api/imob/chat/conversations")
    .set("Authorization", `Bearer ${apiToken}`)
    .send({ title: "Contrato com widget persistido" });

  assert.equal(conversation.status, 201);
  const conversationId = conversation.body?.conversation?.conversationId as string;
  assert.ok(conversationId);

  const scopedRun = await prismaGlobal.run.create({
    data: {
      tenantId,
      workspaceId,
      userId,
      agent: "EIAH",
      status: "success",
      request: {
        prompt: "Gerar contrato",
        metadata: {
          conversationId,
          threadId: "thread_contract_widget",
          txIdRequired: false,
        },
      } as any,
      response: { ok: true } as any,
      txId: null,
      criticalHash: null,
    },
  });

  const created = await request
    .post(`/api/imob/chat/conversations/${conversationId}/messages`)
    .set("Authorization", `Bearer ${apiToken}`)
    .send({
      role: "assistant",
      content: "Contrato gerado com sucesso.",
      runId: scopedRun.id,
      threadId: "thread_contract_widget",
      threadLabel: "Contrato",
      threadStatus: "done",
      metadata: {
        widget: {
          kind: "contract_intake_result",
          runId: scopedRun.id,
          stage: "contract_generated",
          status: "done",
          nextStep: "Exporte o contrato gerado.",
          pendingItems: [],
          riskFlags: [],
          documentHash: "hash-contract-widget-001",
        },
      },
    });

  assert.equal(created.status, 201);
  assert.equal(created.body?.ok, true);
  assert.equal(created.body?.message?.metadata?.widget?.kind, "contract_intake_result");
  assert.equal(created.body?.message?.metadata?.widget?.runId, scopedRun.id);

  const listed = await request
    .get(`/api/imob/chat/conversations/${conversationId}/messages`)
    .set("Authorization", `Bearer ${apiToken}`);

  assert.equal(listed.status, 200);
  const widgetMessage = (listed.body?.items ?? []).find((item: any) => item.content === "Contrato gerado com sucesso.");
  assert.ok(widgetMessage);
  assert.equal(widgetMessage.metadata?.widget?.kind, "contract_intake_result");
  assert.equal(widgetMessage.metadata?.widget?.stage, "contract_generated");
  assert.equal(widgetMessage.metadata?.widget?.runId, scopedRun.id);
});
