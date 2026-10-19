import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import express from "express";
import supertest from "supertest";
import { LOGISTICA_CONTEXT_SCOPE } from "@eiah/contracts";
import { prismaGlobal } from "@repo/db";

import { chatVerticalsRouter } from "../routes/chatVerticals";
import { marketplaceRouter } from "../routes/marketplace";
import { sessionRouter } from "../routes/session";
import { verticalAccessRouter } from "../routes/verticalAccess";
import { ensureVerticalAccessStore } from "../services/products/verticalAccessApproval";
import { ensureWorkspaceMembershipForUser } from "../services/workspaceResponsibility";

// Teste HTTP INTEGRADO (PostgreSQL real, dados sintéticos): jornada governada da LOGISTICA pelos canais existentes
// (pedido -> decisão humana da plataforma -> ativação por Marketplace ou chat -> sessão). Exige banco dedicado local.
function assertDedicatedLocalDatabase() {
  let url: URL;
  try { url = new URL(process.env.DATABASE_URL ?? "postgresql://unused/unused"); }
  catch { throw new Error("Dedicated local logistics database required"); }
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || !url.pathname.startsWith("/eiah_logistica_core_")) {
    throw new Error("Dedicated local eiah_logistica_core_ database required");
  }
}
assertDedicatedLocalDatabase();

const id = randomUUID();
const tenantId = `log-chan-${id}`;
const wsChat = `log-chat-${id}`;
const wsMarket = `log-market-${id}`;
const owner = `owner-${id}`, member = `member-${id}`, admin = `admin-${id}`;
const tokens = {
  owner: `syn-owner-${id}`, member: `syn-member-${id}`, admin: `syn-admin-${id}`,
  ownerMarket: `syn-owner-market-${id}`, adminMarket: `syn-admin-market-${id}`,
};
const auth = (token: string) => `Bearer ${token}`;
const previousAdmins = process.env.EIAH_PLATFORM_ADMIN_EMAILS;
const app = express();
app.use(express.json());
app.use("/api", verticalAccessRouter, marketplaceRouter, chatVerticalsRouter, sessionRouter);
const request = supertest(app);

before(async () => {
  process.env.EIAH_PLATFORM_ADMIN_EMAILS = `log-admin-${id}@example.com`;
  await prismaGlobal.tenant.create({ data: { id: tenantId, name: "Synthetic logistics channels" } });
  await prismaGlobal.workspace.createMany({ data: [
    { id: wsChat, tenantId, name: "Chat channel" },
    { id: wsMarket, tenantId, name: "Marketplace channel" },
  ] });
  await prismaGlobal.user.createMany({ data: [
    { id: owner, tenantId, email: `log-owner-${id}@example.com` },
    { id: member, tenantId, email: `log-member-${id}@example.com` },
    { id: admin, tenantId, email: `log-admin-${id}@example.com` },
  ] });
  for (const [userId, roleKey, workspaceId] of [
    [owner, "founder", wsChat], [member, "corretor", wsChat], [admin, "corretor", wsChat],
    [owner, "founder", wsMarket], [admin, "corretor", wsMarket],
  ] as const) await ensureWorkspaceMembershipForUser({ tenantId, workspaceId, userId, roleKey });
  await prismaGlobal.apiToken.createMany({ data: [
    { token: tokens.owner, tenantId, workspaceId: wsChat, userId: owner },
    { token: tokens.member, tenantId, workspaceId: wsChat, userId: member },
    { token: tokens.admin, tenantId, workspaceId: wsChat, userId: admin },
    { token: tokens.ownerMarket, tenantId, workspaceId: wsMarket, userId: owner },
    { token: tokens.adminMarket, tenantId, workspaceId: wsMarket, userId: admin },
  ] });
  await ensureVerticalAccessStore(prismaGlobal);
});

after(async () => {
  if (previousAdmins === undefined) delete process.env.EIAH_PLATFORM_ADMIN_EMAILS;
  else process.env.EIAH_PLATFORM_ADMIN_EMAILS = previousAdmins;
  await prismaGlobal.$disconnect();
});

async function requestAndApprove(ownerToken: string, adminToken: string, workspaceId: string) {
  const created = await request.post("/api/vertical-access/request").set("Authorization", auth(ownerToken)).send({ vertical: "LOGISTICA", channel: "chat" });
  assert.equal(created.status, 201);
  const rows = await prismaGlobal.$queryRaw<Array<{ id: string }>>`SELECT id FROM vertical_access_approvals WHERE tenant_id=${tenantId} AND workspace_id=${workspaceId} AND vertical='LOGISTICA'`;
  const approvalId = rows[0].id;
  assert.equal((await request.post(`/api/admin/vertical-approvals/${approvalId}/decision`).set("Authorization", auth(ownerToken)).send({ decision: "aprovar", note: "Synthetic" })).status, 404, "dono do tenant não é administrador da plataforma");
  assert.equal((await request.post(`/api/admin/vertical-approvals/${approvalId}/decision`).set("Authorization", auth(adminToken)).send({ decision: "aprovar", note: "Synthetic isolated validation" })).status, 200);
  return approvalId;
}

async function sideEffects(workspaceId: string) {
  const policies = await prismaGlobal.tenantActionPolicy.findMany({ where: { tenantId, workspaceId } });
  const assignments = await prismaGlobal.workspaceAgentAssignment.findMany({ where: { tenantId, workspaceId } });
  const installs = await prismaGlobal.$queryRaw<Array<{ product: string; status: string }>>`SELECT product, status FROM tenant_product_installations WHERE tenant_id=${tenantId} AND workspace_id=${workspaceId}`;
  return { policies, agents: assignments.map((a) => a.agentKey).sort(), installs };
}

test("LOGISTICA: jornada governada pelo canal de chat", async (t) => {
  let approvalId = "";
  await t.test("sem autenticação ou sem papel, não pede nem ativa", async () => {
    assert.equal((await request.post("/api/vertical-access/request").send({ vertical: "LOGISTICA" })).status, 401);
    assert.equal((await request.post("/api/vertical-access/request").set("Authorization", auth(tokens.member)).send({ vertical: "LOGISTICA" })).status, 403);
    const preview = await request.post("/api/chat/vertical-activation/preview").set("Authorization", auth(tokens.owner)).send({ verticalId: "log" });
    assert.equal(preview.status, 200);
    assert.equal(preview.body.data.status, "approval_required", "sem liberação EIAH nada é oferecido");
    const registry = await request.get("/api/chat/vertical-registry").set("Authorization", auth(tokens.owner));
    assert.equal(registry.status, 200);
    assert.equal((await request.post("/api/chat/vertical-activation/confirm").set("Authorization", auth(tokens.owner)).send({ verticalId: "log", registryVersion: registry.body.data.registryVersion, confirmed: true })).status, 403, "confirmar sem liberação EIAH é negado pela barreira");
    assert.deepEqual((await sideEffects(wsChat)).installs, []);
  });
  await t.test("liberação exige decisão humana da plataforma; quem não pode ativar não ativa", async () => {
    approvalId = await requestAndApprove(tokens.owner, tokens.admin, wsChat);
    const memberPreview = await request.post("/api/chat/vertical-activation/preview").set("Authorization", auth(tokens.member)).send({ verticalId: "log" });
    assert.equal(memberPreview.body.data.status, "not_permitted");
    assert.deepEqual((await sideEffects(wsChat)).installs, []);
  });
  await t.test("prévia é somente leitura; confirmação exige confirmed:true; instala só EIAH e nenhuma política", async () => {
    const preview = await request.post("/api/chat/vertical-activation/preview").set("Authorization", auth(tokens.owner)).send({ verticalId: "log" });
    assert.equal(preview.status, 200);
    assert.equal(preview.body.data.status, "available");
    assert.equal(preview.body.data.product, "LOGISTICA");
    assert.deepEqual((await sideEffects(wsChat)).installs, [], "a prévia não instala");
    assert.equal((await request.post("/api/chat/vertical-activation/confirm").set("Authorization", auth(tokens.owner)).send({ verticalId: "log", registryVersion: preview.body.data.registryVersion })).status, 400);
    assert.equal((await request.post("/api/chat/vertical-activation/confirm").set("Authorization", auth(tokens.owner)).send({ verticalId: "log", registryVersion: "versao-velha", confirmed: true })).status, 409);
    const confirm = await request.post("/api/chat/vertical-activation/confirm").set("Authorization", auth(tokens.owner)).send({ verticalId: "log", registryVersion: preview.body.data.registryVersion, confirmed: true });
    assert.equal(confirm.status, 200);
    assert.equal(confirm.body.data.status, "activated");
    assert.deepEqual(confirm.body.data.releasedRoutes, ["/app/chat?domain=logistica"]);
    const effects = await sideEffects(wsChat);
    assert.deepEqual(effects.installs, [{ product: "LOGISTICA", status: "active" }], "somente LOGISTICA; IMOB intacto");
    assert.deepEqual(effects.agents, ["EIAH"], "nenhum agente operacional");
    assert.equal(effects.policies.length, 0, "instalação não concede política de ação");
    const again = await request.post("/api/chat/vertical-activation/preview").set("Authorization", auth(tokens.owner)).send({ verticalId: "log" });
    assert.equal(again.body.data.status, "already_active");
  });
  await t.test("instalada e aprovada, sem política de contexto a sessão ainda é negada (instalação ≠ autorização)", async () => {
    const denied = await request.get("/api/session/context?domain=logistica").set("Authorization", auth(tokens.owner));
    assert.equal(denied.status, 403);
    assert.equal(denied.body.error.capability.reason, "policy_denied");
    const core = await request.get("/api/session/context").set("Authorization", auth(tokens.owner));
    assert.equal(core.status, 200);
    assert.equal(core.body.data.availableDomains.includes("logistica"), false);
  });
  await t.test("política exata do workspace libera apenas o contexto autenticado", async () => {
    await prismaGlobal.tenantActionPolicy.create({ data: { tenantId, workspaceId: wsChat, actionName: LOGISTICA_CONTEXT_SCOPE, allowed: true } });
    const ok = await request.get("/api/session/context?domain=logistica").set("Authorization", auth(tokens.owner));
    assert.equal(ok.status, 200);
    assert.equal(ok.body.data.activeDomain, "logistica");
    assert.equal(ok.body.data.capabilities.logisticaContext.executionAllowed, false);
    assert.equal(ok.body.data.capabilities.logisticaContext.externalTransmissionAllowed, false);
    assert.equal(ok.body.data.capabilities.logisticaContext.mode, "context_only");
    assert.equal(ok.body.data.verticals.find((v: { verticalId: string }) => v.verticalId === "LOGISTICA").enabled, true);
    assert.equal((await request.get("/api/session/context?domain=logistica").set("Authorization", auth(tokens.ownerMarket))).status, 403, "outro workspace (sem instalação) não herda");
    // membro sem permissão de ativar, mas com vínculo ativo, enxerga o contexto autorizado por política? só se tiver vínculo ativo
    await prismaGlobal.$executeRaw`UPDATE eiah_workspace_memberships SET status='inactive' WHERE tenant_id=${tenantId} AND workspace_id=${wsChat} AND user_id=${owner}`;
    assert.equal((await request.get("/api/session/context?domain=logistica").set("Authorization", auth(tokens.owner))).status, 403, "vínculo inativo nega");
    await prismaGlobal.$executeRaw`UPDATE eiah_workspace_memberships SET status='active' WHERE tenant_id=${tenantId} AND workspace_id=${wsChat} AND user_id=${owner}`;
    await prismaGlobal.tenantActionPolicy.updateMany({ where: { tenantId, workspaceId: wsChat, actionName: LOGISTICA_CONTEXT_SCOPE }, data: { allowed: false } });
    assert.equal((await request.get("/api/session/context?domain=logistica").set("Authorization", auth(tokens.owner))).status, 403, "política desabilitada nega");
    await prismaGlobal.tenantActionPolicy.updateMany({ where: { tenantId, workspaceId: wsChat, actionName: LOGISTICA_CONTEXT_SCOPE }, data: { allowed: true } });
  });
  await t.test("domínio desconhecido não é 403 e não concede logistica", async () => {
    const res = await request.get("/api/session/context?domain=foo").set("Authorization", auth(tokens.owner));
    assert.equal(res.status, 200);
    assert.equal(res.body.data.activeDomain, "core");
  });
  await t.test("revogação: somente leitura mantém consulta e bloqueia nova ativação; bloqueio total retira o domínio", async () => {
    const revoke = (action: string, mode: string) => request.post(`/api/admin/vertical-approvals/${approvalId}/revocation`).set("Authorization", auth(tokens.admin)).send({ action, mode, note: "Synthetic revocation" });
    assert.equal((await revoke("revogar", "somente_leitura")).status, 200);
    const readOnly = await request.get("/api/session/context?domain=logistica").set("Authorization", auth(tokens.owner));
    assert.equal(readOnly.status, 200);
    assert.equal(readOnly.body.data.capabilities.logisticaContext.usage, "read_only");
    assert.equal((await request.post("/api/marketplace/installations/activate").set("Authorization", auth(tokens.owner)).send({ product: "LOGISTICA" })).status, 403, "revogada não reativa pelo Marketplace");
    assert.equal((await revoke("alterar_modo", "bloqueio_total")).status, 200);
    assert.equal((await request.get("/api/session/context?domain=logistica").set("Authorization", auth(tokens.owner))).status, 403);
    const core = await request.get("/api/session/context").set("Authorization", auth(tokens.owner));
    assert.equal(core.status, 200);
    assert.equal(core.body.data.availableDomains.includes("logistica"), false);
  });
  await t.test("token revogado perde o contexto (401, não 403)", async () => {
    await prismaGlobal.apiToken.updateMany({ where: { token: tokens.owner }, data: { revoked: true } });
    assert.equal((await request.get("/api/session/context?domain=logistica").set("Authorization", auth(tokens.owner))).status, 401);
  });
});

test("LOGISTICA: jornada governada pelo canal do Marketplace (mesmas barreiras)", async (t) => {
  await t.test("sem liberação EIAH o Marketplace nega (403, não 400)", async () => {
    const res = await request.post("/api/marketplace/installations/activate").set("Authorization", auth(tokens.ownerMarket)).send({ product: "LOGISTICA" });
    assert.equal(res.status, 403);
    assert.deepEqual((await sideEffects(wsMarket)).installs, []);
  });
  await t.test("com liberação humana, o Founder ativa: só EIAH, nenhuma política, IMOB intacto", async () => {
    await requestAndApprove(tokens.ownerMarket, tokens.adminMarket, wsMarket);
    const res = await request.post("/api/marketplace/installations/activate").set("Authorization", auth(tokens.ownerMarket)).send({ product: "logistica" });
    assert.equal(res.status, 200);
    assert.equal(res.body.installation.product, "LOGISTICA");
    assert.deepEqual(res.body.releasedRoutes, ["/app/chat?domain=logistica"]);
    const effects = await sideEffects(wsMarket);
    assert.deepEqual(effects.installs, [{ product: "LOGISTICA", status: "active" }]);
    assert.deepEqual(effects.agents, ["EIAH"]);
    assert.equal(effects.policies.length, 0);
    assert.equal((await request.get("/api/session/context?domain=logistica").set("Authorization", auth(tokens.ownerMarket))).status, 403, "ativação não concede contexto sem política");
  });
  await t.test("produto fora do catálogo continua rejeitado (400)", async () => {
    for (const product of ["LEGAL", "HEALTH", "PRE_DUIMP", "", "IMOB; DROP TABLE x"]) {
      assert.equal((await request.post("/api/marketplace/installations/activate").set("Authorization", auth(tokens.ownerMarket)).send({ product })).status, 400, product);
    }
  });
});
