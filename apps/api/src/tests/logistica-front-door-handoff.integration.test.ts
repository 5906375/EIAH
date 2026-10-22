import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import express from "express";
import supertest from "supertest";
import { LOGISTICA_CONTEXT_SCOPE } from "@eiah/contracts";
import { prismaGlobal } from "@repo/db";

import { chatVerticalsRouter } from "../routes/chatVerticals";
import { sessionRouter } from "../routes/session";
import { verticalAccessRouter } from "../routes/verticalAccess";
import { ensureVerticalAccessStore } from "../services/products/verticalAccessApproval";
import { ensureWorkspaceMembershipForUser } from "../services/workspaceResponsibility";

// EIAH-FD-ADR010-M2/M3 — Teste HTTP INTEGRADO (PostgreSQL real, dados sintéticos): o handoff `log`/`read_only` do Front Door só é
// permitido com instalação, liberação EIAH, vínculo ATIVO e política exata; consultar o registry nunca cria vínculo.
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
const tenantId = `log-fd-${id}`;
const wsA = `log-fd-a-${id}`;
const wsB = `log-fd-b-${id}`;
const owner = `owner-${id}`, unlinked = `unlinked-${id}`, admin = `admin-${id}`, ownerB = `ownerb-${id}`;
const tokens = { owner: `syn-owner-${id}`, unlinked: `syn-unlinked-${id}`, admin: `syn-admin-${id}`, ownerB: `syn-ownerb-${id}` };
const auth = (token: string) => `Bearer ${token}`;
const previousAdmins = process.env.EIAH_PLATFORM_ADMIN_EMAILS;
const app = express();
app.use(express.json());
app.use("/api", verticalAccessRouter, chatVerticalsRouter, sessionRouter);
const request = supertest(app);
const handoff = (token: string, body: Record<string, unknown> = {}) =>
  request.post("/api/chat/vertical-handoff").set("Authorization", auth(token)).send({ verticalId: "log", capabilityId: "oraculo.context", mode: "read_only", ...body });
const logEntry = async (token: string) =>
  (await request.get("/api/chat/vertical-registry").set("Authorization", auth(token))).body.data.verticals.find((v: { id: string }) => v.id === "log");
const membershipRows = async (userId: string) =>
  prismaGlobal.$queryRaw<Array<{ status: string }>>`SELECT status FROM eiah_workspace_memberships WHERE tenant_id=${tenantId} AND workspace_id=${wsA} AND user_id=${userId}`;

before(async () => {
  process.env.EIAH_PLATFORM_ADMIN_EMAILS = `log-fd-admin-${id}@example.com`;
  await prismaGlobal.tenant.create({ data: { id: tenantId, name: "Synthetic front door handoff" } });
  await prismaGlobal.workspace.createMany({ data: [{ id: wsA, tenantId, name: "Workspace A" }, { id: wsB, tenantId, name: "Workspace B" }] });
  await prismaGlobal.user.createMany({ data: [
    { id: owner, tenantId, email: `log-fd-owner-${id}@example.com` },
    { id: unlinked, tenantId, email: `log-fd-unlinked-${id}@example.com` },
    { id: admin, tenantId, email: `log-fd-admin-${id}@example.com` },
    { id: ownerB, tenantId, email: `log-fd-ownerb-${id}@example.com` },
  ] });
  for (const [userId, roleKey, workspaceId] of [[owner, "founder", wsA], [admin, "corretor", wsA], [ownerB, "founder", wsB]] as const) {
    await ensureWorkspaceMembershipForUser({ tenantId, workspaceId, userId, roleKey });
  }
  // `unlinked`: token válido do workspace A, mas nenhum vínculo.
  await prismaGlobal.apiToken.createMany({ data: [
    { token: tokens.owner, tenantId, workspaceId: wsA, userId: owner },
    { token: tokens.unlinked, tenantId, workspaceId: wsA, userId: unlinked },
    { token: tokens.admin, tenantId, workspaceId: wsA, userId: admin },
    { token: tokens.ownerB, tenantId, workspaceId: wsB, userId: ownerB },
  ] });
  await ensureVerticalAccessStore(prismaGlobal);
});

after(async () => {
  if (previousAdmins === undefined) delete process.env.EIAH_PLATFORM_ADMIN_EMAILS;
  else process.env.EIAH_PLATFORM_ADMIN_EMAILS = previousAdmins;
  await prismaGlobal.$disconnect();
});

test("Front Door: handoff da Logística é fail-closed em cada etapa da governança", async (t) => {
  let approvalId = "";
  await t.test("sem instalação: bloqueado como não registrado; nenhuma entrada no registry", async () => {
    const res = await handoff(tokens.owner);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data, { ok: false, reasonCode: "VERTICAL_NOT_REGISTERED" });
    assert.equal(await logEntry(tokens.owner), undefined);
    assert.equal((await handoff("token-invalido")).status, 401);
  });
  await t.test("instalada e aprovada, mas sem política: bloqueada (instalação ≠ autorização) e sem capacidade anunciada", async () => {
    const created = await request.post("/api/vertical-access/request").set("Authorization", auth(tokens.owner)).send({ vertical: "LOGISTICA", channel: "chat" });
    assert.equal(created.status, 201);
    const rows = await prismaGlobal.$queryRaw<Array<{ id: string }>>`SELECT id FROM vertical_access_approvals WHERE tenant_id=${tenantId} AND workspace_id=${wsA} AND vertical='LOGISTICA'`;
    approvalId = rows[0]!.id;
    assert.equal((await request.post(`/api/admin/vertical-approvals/${approvalId}/decision`).set("Authorization", auth(tokens.admin)).send({ decision: "aprovar", note: "Synthetic" })).status, 200);
    const preview = await request.post("/api/chat/vertical-activation/preview").set("Authorization", auth(tokens.owner)).send({ verticalId: "log" });
    assert.equal(preview.body.data.status, "available");
    const confirm = await request.post("/api/chat/vertical-activation/confirm").set("Authorization", auth(tokens.owner)).send({ verticalId: "log", registryVersion: preview.body.data.registryVersion, confirmed: true });
    assert.equal(confirm.status, 200);
    const res = await handoff(tokens.owner);
    assert.deepEqual(res.body.data, { ok: false, reasonCode: "VERTICAL_DISABLED" });
    const entry = await logEntry(tokens.owner);
    assert.equal(entry.status, "disabled");
    assert.deepEqual(entry.capabilities, []);
    assert.equal(entry.rolloutStage, "context_only");
  });
  await t.test("com a política exata do workspace: permitido; capacidade só de leitura; escrita e ação crítica não existem", async () => {
    await prismaGlobal.tenantActionPolicy.create({ data: { tenantId, workspaceId: wsA, actionName: LOGISTICA_CONTEXT_SCOPE, allowed: true } });
    const res = await handoff(tokens.owner);
    assert.equal(res.body.data.ok, true);
    assert.equal(res.body.data.handoff.vertical.id, "log");
    assert.equal(res.body.data.handoff.capability.id, "oraculo.context");
    assert.equal(res.body.data.handoff.outcome, "allowed");
    assert.equal(JSON.stringify(res.body).includes(tenantId) || JSON.stringify(res.body).includes(wsA), false, "a superfície não recebe tenant/workspace");
    assert.deepEqual((await logEntry(tokens.owner)).capabilities, [{ id: "oraculo.context", allowedModes: ["read_only"] }]);
    for (const body of [{ mode: "requires_write" }, { mode: "critical_action" }, { capabilityId: "oraculo.preparation" }, { verticalId: "logistica" }]) {
      assert.equal((await handoff(tokens.owner, body)).body.data.ok, false, JSON.stringify(body));
    }
    const policies = await prismaGlobal.tenantActionPolicy.findMany({ where: { tenantId, workspaceId: wsA } });
    assert.deepEqual(policies.map((p) => p.actionName), [LOGISTICA_CONTEXT_SCOPE], "o handoff não cria política");
  });
  await t.test("token do workspace sem vínculo ativo: bloqueado, e consultar o registry NÃO cria vínculo", async () => {
    assert.deepEqual(await membershipRows(unlinked), []);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const res = await handoff(tokens.unlinked);
      assert.deepEqual(res.body.data, { ok: false, reasonCode: "VERTICAL_DISABLED" }, `tentativa ${attempt + 1}`);
      assert.equal((await logEntry(tokens.unlinked)).status, "disabled");
    }
    assert.deepEqual(await membershipRows(unlinked), [], "nenhum vínculo foi criado por consultar o registry");
    const session = await request.get("/api/session/context?domain=logistica").set("Authorization", auth(tokens.unlinked));
    assert.equal(session.status, 403);
    assert.equal(session.body.error.capability.reason, "membership_required");
  });
  await t.test("vínculo inativo e política desabilitada bloqueiam; outro workspace do tenant não herda", async () => {
    await prismaGlobal.$executeRaw`UPDATE eiah_workspace_memberships SET status='inactive' WHERE tenant_id=${tenantId} AND workspace_id=${wsA} AND user_id=${owner}`;
    assert.deepEqual((await handoff(tokens.owner)).body.data, { ok: false, reasonCode: "VERTICAL_DISABLED" });
    await prismaGlobal.$executeRaw`UPDATE eiah_workspace_memberships SET status='active' WHERE tenant_id=${tenantId} AND workspace_id=${wsA} AND user_id=${owner}`;
    await prismaGlobal.tenantActionPolicy.updateMany({ where: { tenantId, workspaceId: wsA, actionName: LOGISTICA_CONTEXT_SCOPE }, data: { allowed: false } });
    assert.deepEqual((await handoff(tokens.owner)).body.data, { ok: false, reasonCode: "VERTICAL_DISABLED" });
    await prismaGlobal.tenantActionPolicy.updateMany({ where: { tenantId, workspaceId: wsA, actionName: LOGISTICA_CONTEXT_SCOPE }, data: { allowed: true } });
    assert.equal((await handoff(tokens.owner)).body.data.ok, true, "restabelecida a política, volta a valer");
    assert.deepEqual((await handoff(tokens.ownerB)).body.data, { ok: false, reasonCode: "VERTICAL_NOT_REGISTERED" }, "workspace B sem instalação");
  });
  await t.test("revogação: somente leitura mantém a consulta; bloqueio total bloqueia o handoff", async () => {
    const revoke = (action: string, mode: string) => request.post(`/api/admin/vertical-approvals/${approvalId}/revocation`).set("Authorization", auth(tokens.admin)).send({ action, mode, note: "Synthetic revocation" });
    assert.equal((await revoke("revogar", "somente_leitura")).status, 200);
    assert.equal((await handoff(tokens.owner)).body.data.ok, true);
    assert.equal((await revoke("alterar_modo", "bloqueio_total")).status, 200);
    assert.deepEqual((await handoff(tokens.owner)).body.data, { ok: false, reasonCode: "VERTICAL_DISABLED" });
  });
  await t.test("proposta de ativação com versão divergente é rejeitada (409) e nada é instalado", async () => {
    const stale = await request.post("/api/chat/vertical-activation/confirm").set("Authorization", auth(tokens.ownerB)).send({ verticalId: "log", registryVersion: "vr1-000000000000", confirmed: true });
    assert.equal(stale.status, 409, "versão divergente é rejeitada (ACTIVATION_PROPOSAL_STALE) antes de qualquer efeito");
    assert.equal(stale.body.error.code, "ACTIVATION_PROPOSAL_STALE");
    const rowsB = await prismaGlobal.$queryRaw<Array<{ product: string }>>`SELECT product FROM tenant_product_installations WHERE tenant_id=${tenantId} AND workspace_id=${wsB}`;
    assert.deepEqual(rowsB, []);
  });
});
