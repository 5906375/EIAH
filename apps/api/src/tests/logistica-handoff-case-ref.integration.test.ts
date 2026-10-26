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
import { OraculoPreparationRepository } from "../services/logistica/oraculo/preparationRepository";
import { ensureVerticalAccessStore } from "../services/products/verticalAccessApproval";
import { ensureLogisticaMember, logisticaOperator, logisticaOwner } from "./support/logisticaMemberFixture";

// EIAH-FD-E2E-003 — `refs.caseRef` opcional no handoff do Front Door (PostgreSQL real, dados sintéticos). A referência é opaca e NÃO é
// autorização: só é resolvida depois do handoff `log` permitido, no tenant/workspace autenticado, sem criar caso, vínculo ou política.
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
const tenantId = `log-cr-${id}`, foreignTenant = `log-cr-x-${id}`;
const wsA = `log-cr-a-${id}`, wsB = `log-cr-b-${id}`, wsX = `log-cr-xa-${id}`;
const owner = `owner-${id}`, unlinked = `unlinked-${id}`, admin = `admin-${id}`, ownerB = `ownerb-${id}`, ownerX = `ownerx-${id}`;
const tokens = { owner: `syn-owner-${id}`, unlinked: `syn-unlinked-${id}`, admin: `syn-admin-${id}`, ownerB: `syn-ownerb-${id}`, ownerX: `syn-ownerx-${id}` };
const auth = (token: string) => `Bearer ${token}`;
const previousAdmins = process.env.EIAH_PLATFORM_ADMIN_EMAILS;
const app = express();
app.use(express.json());
app.use("/api", verticalAccessRouter, chatVerticalsRouter, sessionRouter);
const request = supertest(app);
const handoff = (token: string, refs?: Record<string, unknown>, body: Record<string, unknown> = {}) =>
  request.post("/api/chat/vertical-handoff").set("Authorization", auth(token)).send({ verticalId: "log", capabilityId: "oraculo.context", mode: "read_only", ...(refs ? { refs } : {}), ...body });
const newCase = (workspace: string, tenant: string, userId: string, port: string) =>
  new OraculoPreparationRepository(prismaGlobal, { tenantId: tenant, workspaceId: workspace }).save({ context: { port: { status: "informed", value: port } } }, userId);
const countRows = async (table: "governed_cases" | "tenant_action_policy" | "eiah_workspace_memberships") =>
  Number((await prismaGlobal.$queryRawUnsafe<Array<{ n: bigint }>>(`SELECT count(*)::bigint AS n FROM ${table} WHERE tenant_id='${tenantId}'`))[0]!.n);
let caseA = "", caseB = "", caseX = "";

before(async () => {
  process.env.EIAH_PLATFORM_ADMIN_EMAILS = `log-cr-admin-${id}@example.com`;
  await prismaGlobal.tenant.createMany({ data: [{ id: tenantId, name: "Synthetic caseRef" }, { id: foreignTenant, name: "Synthetic caseRef foreign" }] });
  await prismaGlobal.workspace.createMany({ data: [{ id: wsA, tenantId, name: "Workspace A" }, { id: wsB, tenantId, name: "Workspace B" }, { id: wsX, tenantId: foreignTenant, name: "Workspace X" }] });
  await prismaGlobal.user.createMany({ data: [
    { id: owner, tenantId, email: `log-cr-owner-${id}@example.com` },
    { id: unlinked, tenantId, email: `log-cr-unlinked-${id}@example.com` },
    { id: admin, tenantId, email: `log-cr-admin-${id}@example.com` },
    { id: ownerB, tenantId, email: `log-cr-ownerb-${id}@example.com` },
    { id: ownerX, tenantId: foreignTenant, email: `log-cr-ownerx-${id}@example.com` },
  ] });
  for (const [userId, roleKey, workspaceId, tenant] of [[owner, "founder", wsA, tenantId], [admin, "corretor", wsA, tenantId], [ownerB, "founder", wsB, tenantId], [ownerX, "founder", wsX, foreignTenant]] as const) {
    await ensureLogisticaMember(prismaGlobal, { tenantId: tenant, workspaceId, userId, ...(roleKey === "founder" ? logisticaOwner() : logisticaOperator()) });
  }
  await prismaGlobal.apiToken.createMany({ data: [
    { token: tokens.owner, tenantId, workspaceId: wsA, userId: owner },
    { token: tokens.unlinked, tenantId, workspaceId: wsA, userId: unlinked },
    { token: tokens.admin, tenantId, workspaceId: wsA, userId: admin },
    { token: tokens.ownerB, tenantId, workspaceId: wsB, userId: ownerB },
    { token: tokens.ownerX, tenantId: foreignTenant, workspaceId: wsX, userId: ownerX },
  ] });
  await ensureVerticalAccessStore(prismaGlobal);
  caseA = (await newCase(wsA, tenantId, owner, "PORTO-SIGILOSO-A"))!.caseId;
  caseB = (await newCase(wsB, tenantId, ownerB, "PORTO-SIGILOSO-B"))!.caseId;
  caseX = (await newCase(wsX, foreignTenant, ownerX, "PORTO-SIGILOSO-X"))!.caseId;
});

after(async () => {
  if (previousAdmins === undefined) delete process.env.EIAH_PLATFORM_ADMIN_EMAILS;
  else process.env.EIAH_PLATFORM_ADMIN_EMAILS = previousAdmins;
  await prismaGlobal.$disconnect();
});

/** Mesmo caminho governado dos demais testes: pedido → decisão da EIAH → ativação pela conversa; a política exata é FIXTURE do banco descartável. */
async function authorizeLogisticaInWorkspaceA() {
  const created = await request.post("/api/vertical-access/request").set("Authorization", auth(tokens.owner)).send({ vertical: "LOGISTICA", channel: "chat" });
  assert.equal(created.status, 201);
  const rows = await prismaGlobal.$queryRaw<Array<{ id: string }>>`SELECT id FROM vertical_access_approvals WHERE tenant_id=${tenantId} AND workspace_id=${wsA} AND vertical='LOGISTICA'`;
  assert.equal((await request.post(`/api/admin/vertical-approvals/${rows[0]!.id}/decision`).set("Authorization", auth(tokens.admin)).send({ decision: "aprovar", note: "Synthetic" })).status, 200);
  const preview = await request.post("/api/chat/vertical-activation/preview").set("Authorization", auth(tokens.owner)).send({ verticalId: "log" });
  assert.equal((await request.post("/api/chat/vertical-activation/confirm").set("Authorization", auth(tokens.owner)).send({ verticalId: "log", registryVersion: preview.body.data.registryVersion, confirmed: true })).status, 200);
}

test("caseRef no handoff: formato inválido é recusado; sem a referência o comportamento é o de sempre", async (t) => {
  await t.test("referências malformadas → 400 INVALID_PAYLOAD (antes de qualquer consulta)", async () => {
    for (const bad of ["../etc/passwd", "curto", "a".repeat(65), "com espaço 12345", "cuid;DROP TABLE x", 12345678, ""]) {
      const res = await handoff(tokens.owner, { caseRef: bad });
      assert.equal(res.status, 400, JSON.stringify(bad));
      assert.equal(res.body.error.code, "INVALID_PAYLOAD");
    }
    assert.equal((await handoff(tokens.owner, { caseRef: "abcdefgh12", extra: "x" })).status, 400, "refs continua estrito");
  });
  await t.test("sem instalação e sem caseRef: idêntico ao comportamento atual", async () => {
    assert.deepEqual((await handoff(tokens.owner)).body.data, { ok: false, reasonCode: "VERTICAL_NOT_REGISTERED" });
  });
});

test("caseRef no handoff: só é resolvido depois do handoff permitido, no contexto autenticado", async (t) => {
  await authorizeLogisticaInWorkspaceA();
  const before = { cases: await countRows("governed_cases"), memberships: await countRows("eiah_workspace_memberships") };
  await t.test("instalada e aprovada, SEM política: handoff bloqueado — o caseRef nunca é resolvido nem ecoado", async () => {
    const withRef = await handoff(tokens.owner, { caseRef: caseA });
    assert.deepEqual(withRef.body.data, { ok: false, reasonCode: "VERTICAL_DISABLED" });
    assert.equal(JSON.stringify(withRef.body).includes(caseA), false);
    assert.deepEqual((await handoff(tokens.owner)).body.data, withRef.body.data, "mesma resposta com e sem a referência");
  });
  await prismaGlobal.tenantActionPolicy.create({ data: { tenantId, workspaceId: wsA, actionName: LOGISTICA_CONTEXT_SCOPE, allowed: true } });
  const policiesBefore = await countRows("tenant_action_policy");

  await t.test("sem caseRef o resultado não muda (sem `caseContext`)", async () => {
    const res = await handoff(tokens.owner);
    assert.equal(res.body.data.ok, true);
    assert.equal("caseContext" in res.body.data, false);
    const withOtherRefs = await handoff(tokens.owner, { conversationId: "conv-1", threadId: "thr-1" });
    assert.equal(withOtherRefs.body.data.ok, true, "conversationId/threadId continuam aceitos");
    assert.equal("caseContext" in withOtherRefs.body.data, false);
  });
  await t.test("caso do próprio workspace: resolvido; a resposta traz só a referência e nenhum dado do caso, tenant ou workspace", async () => {
    const res = await handoff(tokens.owner, { caseRef: caseA, conversationId: "conv-1" });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.ok, true);
    assert.deepEqual(res.body.data.caseContext, { status: "resolved", caseRef: caseA });
    assert.equal(res.body.data.handoff.outcome, "allowed");
    const raw = JSON.stringify(res.body);
    for (const secret of ["PORTO-SIGILOSO", tenantId, wsA, "snapshot", "revision", owner]) assert.equal(raw.includes(secret), false, secret);
  });
  await t.test("inexistente, de outro workspace e de outro tenant: respostas IDÊNTICAS (não há oráculo de existência) e sem dados", async () => {
    const bodies = [];
    for (const ref of ["naoexiste12345", caseB, caseX]) {
      const res = await handoff(tokens.owner, { caseRef: ref });
      assert.equal(res.status, 200, ref);
      assert.equal(res.body.data.ok, true, "o handoff em si segue permitido; só a referência é recusada");
      assert.deepEqual(res.body.data.caseContext, { status: "unavailable" }, ref);
      assert.equal(JSON.stringify(res.body).includes(ref), false, "a referência recusada não é ecoada");
      assert.equal(JSON.stringify(res.body).includes("PORTO-SIGILOSO"), false);
      bodies.push(JSON.stringify({ ...res.body, data: { ...res.body.data, handoff: undefined } }));
    }
    assert.equal(new Set(bodies).size, 1, "as três recusas são indistinguíveis");
  });
  await t.test("troca de contexto: o caso do workspace A não resolve com o token do workspace B nem do tenant estrangeiro (que nem têm handoff)", async () => {
    assert.deepEqual((await handoff(tokens.ownerB, { caseRef: caseA })).body.data, { ok: false, reasonCode: "VERTICAL_NOT_REGISTERED" });
    assert.deepEqual((await handoff(tokens.ownerX, { caseRef: caseA })).body.data, { ok: false, reasonCode: "VERTICAL_NOT_REGISTERED" });
  });
  await t.test("token do workspace sem vínculo ativo: bloqueado, sem resolver, sem criar vínculo", async () => {
    const res = await handoff(tokens.unlinked, { caseRef: caseA });
    assert.deepEqual(res.body.data, { ok: false, reasonCode: "VERTICAL_DISABLED" });
    assert.equal(JSON.stringify(res.body).includes(caseA), false);
    assert.equal(await countRows("eiah_workspace_memberships"), before.memberships, "nenhum vínculo criado");
  });
  await t.test("vínculo inativo e política desabilitada: o handoff bloqueia e o caseRef não é resolvido; restabelecida, volta a resolver", async () => {
    await prismaGlobal.$executeRaw`UPDATE eiah_workspace_memberships SET status='inactive' WHERE tenant_id=${tenantId} AND workspace_id=${wsA} AND user_id=${owner}`;
    assert.deepEqual((await handoff(tokens.owner, { caseRef: caseA })).body.data, { ok: false, reasonCode: "VERTICAL_DISABLED" });
    await prismaGlobal.$executeRaw`UPDATE eiah_workspace_memberships SET status='active' WHERE tenant_id=${tenantId} AND workspace_id=${wsA} AND user_id=${owner}`;
    await prismaGlobal.tenantActionPolicy.updateMany({ where: { tenantId, workspaceId: wsA, actionName: LOGISTICA_CONTEXT_SCOPE }, data: { allowed: false } });
    assert.deepEqual((await handoff(tokens.owner, { caseRef: caseA })).body.data, { ok: false, reasonCode: "VERTICAL_DISABLED" });
    await prismaGlobal.tenantActionPolicy.updateMany({ where: { tenantId, workspaceId: wsA, actionName: LOGISTICA_CONTEXT_SCOPE }, data: { allowed: true } });
    assert.deepEqual((await handoff(tokens.owner, { caseRef: caseA })).body.data.caseContext, { status: "resolved", caseRef: caseA });
  });
  await t.test("outras verticais ignoram o caseRef (IMOB não muda)", async () => {
    const without = await handoff(tokens.owner, undefined, { verticalId: "imob", capabilityId: "crm.forms" });
    const withRef = await handoff(tokens.owner, { caseRef: caseA }, { verticalId: "imob", capabilityId: "crm.forms" });
    assert.deepEqual(withRef.body, without.body);
    assert.equal(JSON.stringify(withRef.body).includes("caseContext"), false);
  });
  await t.test("integridade do registro adulterado: não resolve e não detalha", async () => {
    await prismaGlobal.$executeRaw`UPDATE governed_cases SET snapshot_hash='sha256:' || repeat('0', 64) WHERE id=${caseA}`;
    const res = await handoff(tokens.owner, { caseRef: caseA });
    assert.equal(res.body.data.ok, true);
    assert.deepEqual(res.body.data.caseContext, { status: "unavailable" });
  });
  await t.test("efeitos colaterais: nenhum caso, vínculo ou política criado por qualquer chamada", async () => {
    assert.equal(await countRows("governed_cases"), before.cases);
    assert.equal(await countRows("eiah_workspace_memberships"), before.memberships);
    assert.equal(await countRows("tenant_action_policy"), policiesBefore);
  });
});
