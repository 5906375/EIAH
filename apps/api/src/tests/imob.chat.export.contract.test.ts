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
let closeTenantPolicyStoreResources: () => Promise<unknown>;
let closeCriticalMetricsRedis: () => Promise<unknown>;
let closeCriticalKillSwitchRedis: () => Promise<unknown>;

const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const tenantId = `tenant-imob-export-${suffix}`;
const workspaceId = `workspace-imob-export-${suffix}`;
const userId = `user-imob-export-${suffix}`;
const apiToken = `tok-imob-export-${suffix}`;

before(async () => {
  process.env.NODE_ENV = "test";
  ({ closeRunEventStream } = await import("../services/runEventStream"));
  ({ closeRunEventsTransport } = await import("../services/runEvents"));
  ({ closeRunQueueConnections } = await import("@eiah/core/queue/runQueue"));
  ({ closeMemoryResources } = await import("../services/memory"));
  ({ closeRedisPublisher } = await import("@eiah/core/events/redisPublisher"));
  ({ closeTenantPolicyStoreResources } = await import("@eiah/core/policy/TenantPolicyStore"));
  ({ closeCriticalMetricsRedis } = await import("../../../../packages/core/src/metrics/criticalMetrics.js"));
  ({ closeCriticalKillSwitchRedis } = await import("../../../../packages/core/src/security/killSwitch.js"));
  const { default: app } = await import("../index");
  request = supertest(app);

  await prismaGlobal.tenant.create({ data: { id: tenantId, name: tenantId } });
  await prismaGlobal.workspace.create({ data: { id: workspaceId, tenantId, name: workspaceId } });
  await prismaGlobal.user.create({
    data: { id: userId, tenantId, email: `${userId}@example.com`, displayName: "IMOB Export Tester" },
  });
  await prismaGlobal.apiToken.create({
    data: { token: apiToken, tenantId, workspaceId, userId, description: "imob-chat-export-test", revoked: false },
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
  await prismaGlobal.apiToken.deleteMany({ where: { tenantId } });
  await prismaGlobal.user.deleteMany({ where: { tenantId } });
  await prismaGlobal.workspace.deleteMany({ where: { tenantId } });
  await prismaGlobal.tenant.deleteMany({ where: { id: tenantId } });
  await closeMemoryResources();
  await closeRedisPublisher();
  await closeTenantPolicyStoreResources();
  await closeCriticalMetricsRedis();
  await closeCriticalKillSwitchRedis();
  await closeRunEventStream();
  await closeRunEventsTransport();
  await closeRunQueueConnections();
});

test("IMOB chat export: verifyUrl equals receiptPath and resolves to /api/ledger/{txId} when txId present", async () => {
  const conversation = await request
    .post("/api/imob/chat/conversations")
    .set("Authorization", `Bearer ${apiToken}`)
    .send({ title: "Export verifyUrl Contract" });

  assert.equal(conversation.status, 201);
  const conversationId = conversation.body?.conversation?.conversationId as string;
  assert.ok(conversationId);

  const txId = `tx-export-verify-${suffix}`;
  const runWithProof = await prismaGlobal.run.create({
    data: {
      tenantId,
      workspaceId,
      userId,
      agent: "EIAH",
      status: "success",
      request: {
        prompt: "Registrar imóvel com prova",
        metadata: { conversationId, threadId: "thread-export-verify", txIdRequired: true },
      } as any,
      response: { ok: true } as any,
      txId,
      criticalHash: `hash-export-verify-${suffix}`,
    },
  });

  const proofMsg = await request
    .post(`/api/imob/chat/conversations/${conversationId}/messages`)
    .set("Authorization", `Bearer ${apiToken}`)
    .send({ role: "assistant", content: "Imóvel registrado.", runId: runWithProof.id, threadStatus: "done" });

  assert.equal(proofMsg.status, 201);

  const plainMsg = await request
    .post(`/api/imob/chat/conversations/${conversationId}/messages`)
    .set("Authorization", `Bearer ${apiToken}`)
    .send({ role: "user", content: "Confirmar.", threadId: "thread-export-verify" });

  assert.equal(plainMsg.status, 201);

  const exported = await request
    .get(`/api/imob/chat/conversations/${conversationId}/export`)
    .set("Authorization", `Bearer ${apiToken}`);

  assert.equal(exported.status, 200);
  assert.equal(exported.body?.ok, true);

  const messages: any[] = exported.body?.export?.messages ?? exported.body?.exported?.messages ?? [];
  assert.ok(messages.length >= 2, "export must include both messages");

  const msgWithProof = messages.find((m: any) => m.txId === txId);
  assert.ok(msgWithProof, "message with txId must appear in export");

  const expectedPath = `/api/ledger/${encodeURIComponent(txId)}`;
  assert.equal(msgWithProof.receiptPath, expectedPath, "receiptPath must be /api/ledger/{txId}");
  assert.equal(msgWithProof.proof?.verifyUrl, expectedPath, "verifyUrl must equal /api/ledger/{txId}");
  assert.equal(
    msgWithProof.proof?.verifyUrl,
    msgWithProof.receiptPath,
    "verifyUrl must equal receiptPath (derived from same txId)",
  );

  const msgNoProof = messages.find((m: any) => m.txId == null && m.runId == null);
  if (msgNoProof?.proof) {
    assert.equal(msgNoProof.proof.verifyUrl, null, "verifyUrl must be null when txId is absent");
  }
});

test("IMOB chat export: audit object always carries a sha256 hex digest", async () => {
  const conversation = await request
    .post("/api/imob/chat/conversations")
    .set("Authorization", `Bearer ${apiToken}`)
    .send({ title: "Export Audit Hash Contract" });

  assert.equal(conversation.status, 201);
  const conversationId = conversation.body?.conversation?.conversationId as string;
  assert.ok(conversationId);

  await request
    .post(`/api/imob/chat/conversations/${conversationId}/messages`)
    .set("Authorization", `Bearer ${apiToken}`)
    .send({ role: "user", content: "Quero exportar.", threadId: "thread-audit-hash" });

  const exported = await request
    .get(`/api/imob/chat/conversations/${conversationId}/export`)
    .set("Authorization", `Bearer ${apiToken}`);

  assert.equal(exported.status, 200);
  assert.equal(exported.body?.ok, true);

  // Both keys present: 'export' (canonical) and 'exported' (backwards compat)
  assert.ok(exported.body?.export, "'export' key must be present in response");
  assert.ok(exported.body?.exported, "'exported' key must be present in response");

  const payload = exported.body?.export;
  assert.ok(
    typeof payload?.audit?.hash === "string" && /^[0-9a-f]{64}$/.test(payload.audit.hash),
    "audit.hash must be a 64-character lowercase sha256 hex digest",
  );
  assert.equal(payload?.audit?.hashAlgo, "sha256", "audit.hashAlgo must be 'sha256'");
});

test("IMOB chat export: proof and receipt fields are structurally stable across consecutive calls", async () => {
  const conversation = await request
    .post("/api/imob/chat/conversations")
    .set("Authorization", `Bearer ${apiToken}`)
    .send({ title: "Export Stability Contract" });

  assert.equal(conversation.status, 201);
  const conversationId = conversation.body?.conversation?.conversationId as string;
  assert.ok(conversationId);

  const txId = `tx-export-stable-${suffix}`;
  const stableRun = await prismaGlobal.run.create({
    data: {
      tenantId,
      workspaceId,
      userId,
      agent: "EIAH",
      status: "success",
      request: {
        prompt: "Captação estável",
        metadata: { conversationId, threadId: "thread-stable", txIdRequired: true },
      } as any,
      response: { ok: true } as any,
      txId,
      criticalHash: `hash-stable-${suffix}`,
    },
  });

  await request
    .post(`/api/imob/chat/conversations/${conversationId}/messages`)
    .set("Authorization", `Bearer ${apiToken}`)
    .send({ role: "assistant", content: "Captação registrada.", runId: stableRun.id, threadStatus: "done" });

  await request
    .post(`/api/imob/chat/conversations/${conversationId}/messages`)
    .set("Authorization", `Bearer ${apiToken}`)
    .send({ role: "user", content: "Entendido.", threadId: "thread-stable" });

  const call1 = await request
    .get(`/api/imob/chat/conversations/${conversationId}/export`)
    .set("Authorization", `Bearer ${apiToken}`);

  const call2 = await request
    .get(`/api/imob/chat/conversations/${conversationId}/export`)
    .set("Authorization", `Bearer ${apiToken}`);

  assert.equal(call1.status, 200);
  assert.equal(call2.status, 200);

  const msgs1: any[] = call1.body?.export?.messages ?? call1.body?.exported?.messages ?? [];
  const msgs2: any[] = call2.body?.export?.messages ?? call2.body?.exported?.messages ?? [];

  assert.equal(msgs1.length, msgs2.length, "message count must be identical across calls");

  for (let i = 0; i < msgs1.length; i++) {
    const m1 = msgs1[i];
    const m2 = msgs2[i];
    assert.equal(m1.txId, m2.txId, `messages[${i}].txId must be stable`);
    assert.equal(m1.receiptPath, m2.receiptPath, `messages[${i}].receiptPath must be stable`);
    assert.equal(m1.bundlePath, m2.bundlePath, `messages[${i}].bundlePath must be stable`);
    assert.equal(m1.proof?.verifyUrl, m2.proof?.verifyUrl, `messages[${i}].proof.verifyUrl must be stable`);
    assert.equal(m1.proof?.state, m2.proof?.state, `messages[${i}].proof.state must be stable`);
    assert.equal(m1.proof?.ready, m2.proof?.ready, `messages[${i}].proof.ready must be stable`);
  }

  const conv1 = call1.body?.export?.conversation;
  const conv2 = call2.body?.export?.conversation;
  assert.equal(conv1?.conversationId, conv2?.conversationId, "conversationId must be stable");
  assert.equal(conv1?.messageCount, conv2?.messageCount, "messageCount must be stable");
});
