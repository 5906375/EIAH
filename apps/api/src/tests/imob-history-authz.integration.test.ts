import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import express from "express";
import supertest from "supertest";
import { prismaGlobal } from "@repo/db";

import { imobRouter } from "../routes/imob";
import { marketplaceRouter } from "../routes/marketplace";
import { verticalAccessRouter } from "../routes/verticalAccess";
import { ensureVerticalAccessStore } from "../services/products/verticalAccessApproval";
import { ensureWorkspaceMembershipForUser } from "../services/workspaceResponsibility";

// FD-IMOB-HISTORY-AUTHZ-001 — autorização do histórico persistido do chat IMOB, por HTTP (PostgreSQL descartável, dados sintéticos).
// Fontes: vínculo ATIVO (leitura, sem bootstrap) + titularidade da conversa (execução de auditoria criada pelo servidor com o userId do criador).
function assertDedicatedLocalDatabase() {
  let url: URL;
  try { url = new URL(process.env.DATABASE_URL ?? "postgresql://unused/unused"); }
  catch { throw new Error("Dedicated local database required"); }
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || !url.pathname.startsWith("/eiah_logistica_core_")) {
    throw new Error("Dedicated local eiah_logistica_core_ database required");
  }
}
assertDedicatedLocalDatabase();

const id = randomUUID();
const tenantId = `hist-t-${id}`, foreignTenant = `hist-x-${id}`;
const wsA = `hist-a-${id}`, wsB = `hist-b-${id}`, wsX = `hist-xa-${id}`;
const users = { owner: `h-owner-${id}`, peer: `h-peer-${id}`, unlinked: `h-unl-${id}`, revoked: `h-rev-${id}`, admin: `h-adm-${id}`, ownerB: `h-ownb-${id}`, ownerX: `h-ownx-${id}`, service: "" };
const tokens = Object.fromEntries(Object.keys(users).map((key) => [key, `syn-hist-${key}-${id}`])) as Record<keyof typeof users, string>;
const auth = (token: string) => `Bearer ${token}`;
const previousAdmins = process.env.EIAH_PLATFORM_ADMIN_EMAILS;
const app = express();
app.use(express.json());
app.use("/api", verticalAccessRouter, marketplaceRouter);
app.use("/api/imob", imobRouter);
const request = supertest(app);
const get = (token: string, path: string) => request.get(`/api/imob${path}`).set("Authorization", auth(token));
const post = (token: string, path: string, body: unknown) => request.post(`/api/imob${path}`).set("Authorization", auth(token)).send(body as object);
const put = (token: string, path: string, body: unknown) => request.put(`/api/imob${path}`).set("Authorization", auth(token)).send(body as object);
const membershipCount = async () =>
  Number((await prismaGlobal.$queryRawUnsafe<Array<{ n: bigint }>>(`SELECT count(*)::bigint AS n FROM eiah_workspace_memberships WHERE tenant_id IN ('${tenantId}','${foreignTenant}')`))[0]!.n);
const interviewState = { contractType: "locacao", currentStep: 1, answers: { landlordName: "Sintética" }, status: "collecting", updatedAt: new Date().toISOString() };
let convOwner = "", convPeer = "", convB = "";

async function enableImob(workspaceId: string, workspaceName: string, token: string) {
  assert.equal((await request.post("/api/vertical-access/request").set("Authorization", auth(token)).send({ vertical: "IMOB", channel: "marketplace" })).status, 201);
  const rows = await prismaGlobal.$queryRaw<Array<{ id: string }>>`SELECT id FROM vertical_access_approvals WHERE tenant_id=${tenantId} AND workspace_id=${workspaceId} AND vertical='IMOB'`;
  assert.equal((await request.post(`/api/admin/vertical-approvals/${rows[0]!.id}/decision`).set("Authorization", auth(tokens.admin)).send({ decision: "aprovar", note: `Synthetic ${workspaceName}` })).status, 200);
  assert.equal((await request.post("/api/marketplace/installations/activate").set("Authorization", auth(token)).send({ product: "IMOB" })).status, 200);
}

before(async () => {
  process.env.EIAH_PLATFORM_ADMIN_EMAILS = `h-adm-${id}@example.com`;
  await prismaGlobal.tenant.createMany({ data: [{ id: tenantId, name: "Synthetic history" }, { id: foreignTenant, name: "Synthetic history foreign" }] });
  await prismaGlobal.workspace.createMany({ data: [{ id: wsA, tenantId, name: "Workspace A" }, { id: wsB, tenantId, name: "Workspace B" }, { id: wsX, tenantId: foreignTenant, name: "Workspace X" }] });
  const ids = [users.owner, users.peer, users.unlinked, users.revoked, users.admin, users.ownerB, users.ownerX];
  await prismaGlobal.user.createMany({ data: ids.map((userId) => ({ id: userId, tenantId: userId === users.ownerX ? foreignTenant : tenantId, email: userId === users.admin ? `h-adm-${id}@example.com` : `${userId}@example.com` })) });
  for (const [userId, roleKey, workspaceId, tenant] of [[users.owner, "founder", wsA, tenantId], [users.peer, "corretor", wsA, tenantId], [users.revoked, "corretor", wsA, tenantId], [users.admin, "corretor", wsA, tenantId], [users.ownerB, "founder", wsB, tenantId], [users.ownerX, "founder", wsX, foreignTenant]] as const) {
    await ensureWorkspaceMembershipForUser({ tenantId: tenant, workspaceId, userId, roleKey });
  }
  await prismaGlobal.apiToken.createMany({ data: [
    { token: tokens.owner, tenantId, workspaceId: wsA, userId: users.owner }, { token: tokens.peer, tenantId, workspaceId: wsA, userId: users.peer },
    { token: tokens.unlinked, tenantId, workspaceId: wsA, userId: users.unlinked }, { token: tokens.revoked, tenantId, workspaceId: wsA, userId: users.revoked },
    { token: tokens.admin, tenantId, workspaceId: wsA, userId: users.admin }, { token: tokens.ownerB, tenantId, workspaceId: wsB, userId: users.ownerB },
    { token: tokens.ownerX, tenantId: foreignTenant, workspaceId: wsX, userId: users.ownerX },
    { token: tokens.service, tenantId, workspaceId: wsA }, // token de serviço: sem usuário
  ] });
  await ensureVerticalAccessStore(prismaGlobal);
  await enableImob(wsA, "A", tokens.owner);
  await enableImob(wsB, "B", tokens.ownerB);
  // histórico legítimo pelo próprio titular (API existente)
  const created = await post(tokens.owner, "/chat/conversations", { title: "Conversa do titular" });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  convOwner = created.body.conversation.conversationId;
  assert.equal((await post(tokens.owner, `/chat/conversations/${convOwner}/messages`, { role: "user", content: "Mensagem sigilosa do titular", threadId: "thr_hist", threadLabel: "Captação", threadStatus: "waiting" })).status, 201);
  assert.equal((await put(tokens.owner, `/chat/conversations/${convOwner}/interview-state`, { state: interviewState })).status, 201);
  convPeer = (await post(tokens.peer, "/chat/conversations", { title: "Conversa do peer" })).body.conversation.conversationId;
  assert.equal((await post(tokens.peer, `/chat/conversations/${convPeer}/messages`, { role: "user", content: "Mensagem do peer" })).status, 201);
  convB = (await post(tokens.ownerB, "/chat/conversations", { title: "Conversa de WS-B" })).body.conversation.conversationId;
  assert.equal((await post(tokens.ownerB, `/chat/conversations/${convB}/messages`, { role: "user", content: "Mensagem sigilosa de WS-B" })).status, 201);
});

after(async () => {
  if (previousAdmins === undefined) delete process.env.EIAH_PLATFORM_ADMIN_EMAILS;
  else process.env.EIAH_PLATFORM_ADMIN_EMAILS = previousAdmins;
  await prismaGlobal.$disconnect();
});

const historyReads = (conv: string) => [`/chat/conversations/${conv}/messages`, `/chat/conversations/${conv}/threads`, `/chat/conversations/${conv}/interview-state`, `/chat/conversations/${conv}/snapshot`, `/chat/conversations/${conv}/export`];

test("1. titular autorizado recupera o próprio histórico (lista, mensagens, threads, entrevista, snapshot, export) e telemetria por conversa", async () => {
  const list = await get(tokens.owner, "/chat/conversations");
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.items.map((item: { conversationId: string }) => item.conversationId), [convOwner]);
  const messages = await get(tokens.owner, `/chat/conversations/${convOwner}/messages`);
  assert.equal(messages.status, 200);
  assert.equal(messages.body.items[0].content, "Mensagem sigilosa do titular");
  const threads = await get(tokens.owner, `/chat/conversations/${convOwner}/threads`);
  assert.equal(threads.body.items[0].threadId, "thr_hist");
  assert.equal((await get(tokens.owner, `/chat/conversations/${convOwner}/interview-state`)).body.state.status, "collecting");
  for (const path of [`/chat/conversations/${convOwner}/snapshot`, `/chat/conversations/${convOwner}/export`]) assert.equal((await get(tokens.owner, path)).status, 200, path);
  assert.equal((await post(tokens.owner, "/chat/telemetry", { conversationId: convOwner, event: "ux_interaction", value: 1 })).status, 201);
  assert.equal((await get(tokens.owner, `/chat/telemetry/summary?conversationId=${convOwner}`)).status, 200);
});

test("2. usuário SEM vínculo (token do workspace, sem membership) recebe 403 em tudo e nada é exibido nem gravado", async () => {
  const before = await membershipCount();
  for (const path of ["/chat/conversations", ...historyReads(convOwner), "/chat/telemetry/summary", `/chat/telemetry/summary?conversationId=${convOwner}`]) {
    const res = await get(tokens.unlinked, path);
    assert.equal(res.status, 403, path);
    assert.equal(res.body.error.code, "IMOB_HISTORY_MEMBERSHIP_REQUIRED", path);
    assert.doesNotMatch(JSON.stringify(res.body), /sigilosa|Conversa do titular/);
  }
  assert.equal((await post(tokens.unlinked, "/chat/conversations", { title: "tentativa" })).status, 403);
  assert.equal((await post(tokens.unlinked, `/chat/conversations/${convOwner}/messages`, { role: "user", content: "intrusão" })).status, 403);
  assert.equal((await put(tokens.unlinked, `/chat/conversations/${convOwner}/interview-state`, { state: interviewState })).status, 403);
  assert.equal((await post(tokens.unlinked, "/chat/telemetry", { conversationId: convOwner, event: "ux_interaction", value: 1 })).status, 403);
  assert.equal(await membershipCount(), before, "nenhum vínculo criado pelas tentativas");
});

test("3. vínculo REVOGADO não autoriza nem a própria conversa; a restauração do vínculo restaura o acesso", async () => {
  const convRevoked = (await post(tokens.revoked, "/chat/conversations", { title: "Conversa do revogado" })).body.conversation.conversationId;
  assert.equal((await get(tokens.revoked, `/chat/conversations/${convRevoked}/messages`)).status, 200);
  await prismaGlobal.$executeRaw`UPDATE eiah_workspace_memberships SET status='revoked' WHERE tenant_id=${tenantId} AND workspace_id=${wsA} AND user_id=${users.revoked}`;
  for (const path of ["/chat/conversations", ...historyReads(convRevoked)]) assert.equal((await get(tokens.revoked, path)).status, 403, path);
  assert.equal((await post(tokens.revoked, `/chat/conversations/${convRevoked}/messages`, { role: "user", content: "x" })).status, 403);
  await prismaGlobal.$executeRaw`UPDATE eiah_workspace_memberships SET status='active' WHERE tenant_id=${tenantId} AND workspace_id=${wsA} AND user_id=${users.revoked}`;
  assert.equal((await get(tokens.revoked, `/chat/conversations/${convRevoked}/messages`)).status, 200);
});

test("4–5. outro tenant e outro workspace não acessam (leitura e escrita); o próprio histórico segue acessível", async () => {
  // AUTHZ-IMOB-INSTALLATION-001: o tenant estrangeiro não tem o IMOB instalado ⇒ 403 pela porta de instalação; o outro workspace (instalado) segue 404 por titularidade.
  for (const [who, label] of [["ownerB", "outro workspace do mesmo tenant"], ["ownerX", "outro tenant"]] as const) {
    for (const path of historyReads(convOwner)) assert.equal((await get(tokens[who], path)).status, who === "ownerX" ? 403 : 404, `${label} ${path}`);
    assert.equal((await post(tokens[who], `/chat/conversations/${convOwner}/messages`, { role: "user", content: "intrusão" })).status, who === "ownerX" ? 403 : 404, label);
    assert.equal((await put(tokens[who], `/chat/conversations/${convOwner}/interview-state`, { state: interviewState })).status, who === "ownerX" ? 403 : 404, label);
    assert.doesNotMatch(JSON.stringify((await get(tokens[who], "/chat/conversations")).body), /Conversa do titular|sigilosa do titular/);
  }
  assert.deepEqual((await get(tokens.ownerB, "/chat/conversations")).body.items.map((item: { conversationId: string }) => item.conversationId), [convB]);
  assert.equal((await get(tokens.owner, `/chat/conversations/${convB}/messages`)).status, 404, "WS-A não lê WS-B");
});

test("6. outro usuário do MESMO workspace, com vínculo ativo, não acessa conversa alheia (sem compartilhamento no modelo)", async () => {
  for (const path of historyReads(convOwner)) {
    const res = await get(tokens.peer, path);
    assert.equal(res.status, 404, path);
    assert.equal(res.body.error.code, "CONVERSATION_NOT_FOUND");
  }
  assert.equal((await post(tokens.peer, `/chat/conversations/${convOwner}/messages`, { role: "user", content: "intrusão" })).status, 404);
  assert.equal((await put(tokens.peer, `/chat/conversations/${convOwner}/interview-state`, { state: interviewState })).status, 404);
  assert.equal((await post(tokens.peer, "/chat/telemetry", { conversationId: convOwner, event: "ux_interaction", value: 1 })).status, 404);
  assert.equal((await get(tokens.peer, `/chat/telemetry/summary?conversationId=${convOwner}`)).status, 404);
  assert.deepEqual((await get(tokens.peer, "/chat/conversations")).body.items.map((item: { conversationId: string }) => item.conversationId), [convPeer], "o peer só vê a dele");
  assert.equal((await get(tokens.peer, `/chat/conversations/${convPeer}/messages`)).body.items[0].content, "Mensagem do peer");
  // o titular também não é afetado pelas tentativas do peer
  assert.equal((await get(tokens.owner, `/chat/conversations/${convOwner}/messages`)).body.items.length, 1);
});

test("7. leituras e tentativas negadas não modificam memberships; identificador inexistente é indistinguível de conversa alheia", async () => {
  const before = await membershipCount();
  const alheia = await get(tokens.peer, `/chat/conversations/${convOwner}/messages`);
  const inexistente = await get(tokens.peer, "/chat/conversations/conv_nao_existe/messages");
  assert.equal(alheia.status, 404); assert.equal(inexistente.status, 404);
  assert.deepEqual(alheia.body, inexistente.body, "sem oráculo de existência");
  await get(tokens.unlinked, "/chat/conversations");
  await get(tokens.ownerX, "/chat/conversations");
  assert.equal(await membershipCount(), before);
});

test("8. listagem e recuperação aplicam as mesmas regras; token de serviço (sem usuário) é negado; a agregação de telemetria exige vínculo", async () => {
  const listed = (await get(tokens.owner, "/chat/conversations")).body.items.map((item: { conversationId: string }) => item.conversationId);
  for (const [who, conv] of [["owner", convOwner], ["peer", convOwner], ["peer", convPeer], ["ownerB", convOwner], ["owner", convB]] as const) {
    const visibleInList = (await get(tokens[who], "/chat/conversations")).body.items.some((item: { conversationId: string }) => item.conversationId === conv);
    const retrievable = (await get(tokens[who], `/chat/conversations/${conv}/messages`)).status === 200;
    assert.equal(visibleInList, retrievable, `${who} × ${conv}`);
  }
  assert.ok(listed.includes(convOwner) && !listed.includes(convPeer));
  const svc = await get(tokens.service, "/chat/conversations");
  assert.equal(svc.status, 403);
  assert.equal(svc.body.error.code, "IMOB_HISTORY_IDENTITY_REQUIRED");
  assert.equal((await get(tokens.owner, "/chat/telemetry/summary")).status, 200);
  assert.equal((await get(tokens.unlinked, "/chat/telemetry/summary")).status, 403);
});
