import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import express from "express";
import supertest from "supertest";
import { prismaGlobal } from "@repo/db";

import { chatVerticalsRouter } from "../routes/chatVerticals";
import { imobRouter } from "../routes/imob";
import { marketplaceRouter } from "../routes/marketplace";
import { uploadsRouter } from "../routes/uploads";
import { verticalAccessRouter } from "../routes/verticalAccess";
import { ensureVerticalAccessStore } from "../services/products/verticalAccessApproval";
import { ensureWorkspaceMembershipForUser } from "../services/workspaceResponsibility";

// AUTHZ-IMOB-SERVICE-001 — token SEM `userId` não é "corretor" nem recebe o IMOB por ausência de usuário. Não existe contrato verificável de identidade de
// serviço (o `ApiToken` só tem tenant/workspace/descrição; `TenantActionPolicy` é por workspace, não por identidade): fail-closed. Humano autorizado preservado.
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
const tenantId = `sv-t-${id}`, foreignTenant = `sv-x-${id}`;
const wsA = `sv-a-${id}`, wsB = `sv-b-${id}`, wsX = `sv-xa-${id}`;
const u = { owner: `sv-owner-${id}`, member: `sv-member-${id}`, revoked: `sv-rev-${id}`, admin: `sv-adm-${id}`, ownerB: `sv-ownb-${id}`, ownerX: `sv-ownx-${id}` };
const tok = {
  owner: `syn-sv-owner-${id}`, member: `syn-sv-member-${id}`, revoked: `syn-sv-rev-${id}`, admin: `syn-sv-adm-${id}`, ownerB: `syn-sv-ownb-${id}`, ownerX: `syn-sv-ownx-${id}`,
  svc: `syn-sv-svc-${id}`, svcB: `syn-sv-svcb-${id}`, svcX: `syn-sv-svcx-${id}`, revokedToken: `syn-sv-revtok-${id}`, expiredToken: `syn-sv-exptok-${id}`, invalid: `syn-sv-invalid-${id}`,
};
const auth = (token: string) => `Bearer ${token}`;
const previousAdmins = process.env.EIAH_PLATFORM_ADMIN_EMAILS;
const app = express();
app.use(express.json());
app.use("/api", verticalAccessRouter, marketplaceRouter, chatVerticalsRouter, uploadsRouter);
app.use("/api/imob", imobRouter);
const request = supertest(app);
const ROUTES = [
  ["GET", "/control/approval-context?limit=1"], ["POST", "/chat/resolve-turn"], ["GET", "/cases"], ["GET", "/owners"], ["GET", "/properties"],
  ["GET", "/leads"], ["GET", "/command-center/funnel-health"], ["GET", "/kpis/funnel"], ["GET", "/control/priority-queue"],
] as const;
const call = (token: string, method: "GET" | "POST", path: string) =>
  (method === "GET" ? request.get(`/api/imob${path}`) : request.post(`/api/imob${path}`).send({ message: "cadastrar imóvel" })).set("Authorization", auth(token));
const upload = (token: string, slug = "imob") => request.post("/api/uploads").set("Authorization", auth(token)).field("agentSlug", slug).attach("files", Buffer.from("documento sintético"), { filename: "doc.txt", contentType: "text/plain" });
const matrix = new Map<string, string>();
const check = (condition: boolean, message: string) => assert.ok(condition, message);

async function membershipState() {
  const rows = await prismaGlobal.$queryRaw<Array<Record<string, unknown>>>`
    SELECT user_id, tenant_id, workspace_id, role_key, status, permissions::text AS permissions, created_at::text AS created_at, updated_at::text AS updated_at
    FROM eiah_workspace_memberships WHERE tenant_id IN (${tenantId}, ${foreignTenant}) ORDER BY tenant_id, workspace_id, user_id`;
  return JSON.stringify(rows);
}
async function sweep(label: string, token: string) {
  const before = await membershipState();
  const statuses: number[] = [];
  for (const [method, path] of ROUTES) statuses.push((await call(token, method, path)).status);
  matrix.set(label, statuses.join("/"));
  check((await membershipState()) === before, `${label}: memberships alteradas`);
  return statuses;
}
async function enableImob(workspaceId: string, token: string) {
  const tenant = workspaceId === wsX ? foreignTenant : tenantId;
  assert.equal((await request.post("/api/vertical-access/request").set("Authorization", auth(token)).send({ vertical: "IMOB", channel: "marketplace" })).status, 201);
  const rows = await prismaGlobal.$queryRaw<Array<{ id: string }>>`SELECT id FROM vertical_access_approvals WHERE tenant_id=${tenant} AND workspace_id=${workspaceId} AND vertical='IMOB'`;
  assert.equal((await request.post(`/api/admin/vertical-approvals/${rows[0]!.id}/decision`).set("Authorization", auth(tok.admin)).send({ decision: "aprovar", note: "Synthetic" })).status, 200);
  assert.equal((await request.post("/api/marketplace/installations/activate").set("Authorization", auth(token)).send({ product: "IMOB" })).status, 200);
}

before(async () => {
  process.env.EIAH_PLATFORM_ADMIN_EMAILS = `sv-adm-${id}@example.com`;
  await prismaGlobal.tenant.createMany({ data: [{ id: tenantId, name: "Synthetic service" }, { id: foreignTenant, name: "Synthetic service foreign" }] });
  await prismaGlobal.workspace.createMany({ data: [{ id: wsA, tenantId, name: "A" }, { id: wsB, tenantId, name: "B" }, { id: wsX, tenantId: foreignTenant, name: "X" }] });
  await prismaGlobal.user.createMany({ data: Object.entries(u).map(([key, userId]) => ({ id: userId, tenantId: key === "ownerX" ? foreignTenant : tenantId, email: key === "admin" ? `sv-adm-${id}@example.com` : `${userId}@example.com` })) });
  for (const [userId, roleKey, workspaceId, tenant] of [
    [u.owner, "founder", wsA, tenantId], [u.member, "corretor", wsA, tenantId], [u.revoked, "corretor", wsA, tenantId], [u.admin, "corretor", wsA, tenantId],
    [u.ownerB, "founder", wsB, tenantId], [u.ownerX, "founder", wsX, foreignTenant],
  ] as const) await ensureWorkspaceMembershipForUser({ tenantId: tenant, workspaceId, userId, roleKey });
  await prismaGlobal.apiToken.createMany({ data: [
    { token: tok.owner, tenantId, workspaceId: wsA, userId: u.owner }, { token: tok.member, tenantId, workspaceId: wsA, userId: u.member }, { token: tok.revoked, tenantId, workspaceId: wsA, userId: u.revoked },
    { token: tok.admin, tenantId, workspaceId: wsA, userId: u.admin }, { token: tok.ownerB, tenantId, workspaceId: wsB, userId: u.ownerB }, { token: tok.ownerX, tenantId: foreignTenant, workspaceId: wsX, userId: u.ownerX },
    // identidades NÃO humanas (sem userId): token técnico do workspace A, de outro workspace e de outro tenant
    { token: tok.svc, tenantId, workspaceId: wsA, description: "serviço sintético A" }, { token: tok.svcB, tenantId, workspaceId: wsB, description: "serviço sintético B" },
    { token: tok.svcX, tenantId: foreignTenant, workspaceId: wsX, description: "serviço sintético X" },
    { token: tok.revokedToken, tenantId, workspaceId: wsA, description: "token revogado", revoked: true },
    { token: tok.expiredToken, tenantId, workspaceId: wsA, description: "token expirado", expiresAt: new Date(Date.now() - 3600_000) },
  ] });
  await ensureVerticalAccessStore(prismaGlobal);
  await enableImob(wsA, tok.owner); await enableImob(wsB, tok.ownerB); await enableImob(wsX, tok.ownerX);
  await prismaGlobal.$executeRaw`UPDATE eiah_workspace_memberships SET status='revoked' WHERE user_id=${u.revoked}`;
});

after(async () => {
  console.log("MATRIX-SERVICE " + JSON.stringify(Object.fromEntries(matrix)));
  if (previousAdmins === undefined) delete process.env.EIAH_PLATFORM_ADMIN_EMAILS;
  else process.env.EIAH_PLATFORM_ADMIN_EMAILS = previousAdmins;
  await prismaGlobal.$disconnect();
});

const DENIED = ROUTES.map(() => 403);

test("1. token SEM userId e sem autoridade de serviço verificável: 403 em todas as rotas do CRM; sem dados e sem alterar vínculos", async () => {
  const statuses = await sweep("serviço A (sem userId)", tok.svc);
  check(JSON.stringify(statuses) === JSON.stringify(DENIED), `esperado 403 ×9, veio ${statuses}`);
  const owners = await call(tok.svc, "GET", "/owners");
  check(owners.body?.data === undefined, "nenhum dado devolvido");
  assert.equal(owners.body.error.code, "IMOB_SERVICE_AUTHORITY_REQUIRED");
});

test("2. token inválido, revogado e expirado: 401 (a autenticação nega antes de qualquer rota do IMOB)", async () => {
  for (const [label, token] of [["inválido", tok.invalid], ["revogado", tok.revokedToken], ["expirado", tok.expiredToken]] as const) {
    const statuses = await sweep(`token ${label}`, token);
    assert.ok(statuses.every((s) => s === 401), `${label}: ${statuses}`);
  }
});

test("3. serviço de OUTRO workspace e de OUTRO tenant: negado; nada de WS-A é visível por eles", async () => {
  await request.post("/api/imob/owners").set("Authorization", auth(tok.owner)).send({ name: "Proprietário sigiloso de A" });
  for (const [label, token] of [["serviço B (outro workspace)", tok.svcB], ["serviço X (outro tenant)", tok.svcX]] as const) {
    const statuses = await sweep(label, token);
    check(JSON.stringify(statuses) === JSON.stringify(DENIED), `${label}: ${statuses}`);
  }
});

test("4. autoridade NÃO se deriva de parâmetros do cliente: cabeçalhos/query/corpo que afirmam usuário, papel ou escopo de serviço não mudam o resultado", async () => {
  const before = await membershipState();
  for (const forge of [
    (r: supertest.Test) => r.set("x-user-id", u.owner), (r: supertest.Test) => r.set("x-service-scope", "imob.crm"), (r: supertest.Test) => r.set("x-role", "corretor"),
    (r: supertest.Test) => r.query({ userId: u.owner, role: "founder" }),
  ]) {
    const res = await forge(request.get("/api/imob/owners").set("Authorization", auth(tok.svc)));
    check(res.status === 403, `forjado: ${res.status}`);
  }
  const body = await request.post("/api/imob/chat/resolve-turn").set("Authorization", auth(tok.svc)).send({ message: "cadastrar imóvel", userId: u.owner, role: "corretor", actorType: "service" });
  check(body.status === 403, `corpo forjado: ${body.status}`);
  check((await membershipState()) === before, "sem alteração de vínculos");
});

test("5. humano autorizado preservado (200 nas 9 rotas, linha de vínculo idêntica); humano revogado segue bloqueado", async () => {
  for (const [label, token] of [["humano corretor", tok.member], ["humano fundador", tok.owner]] as const) {
    const statuses = await sweep(label, token);
    assert.ok(statuses.every((s) => s === 200), `${label}: ${statuses}`);
  }
  const rev = await sweep("humano revogado", tok.revoked);
  assert.deepEqual(rev, DENIED);
});

test("6. upload IMOB com as mesmas garantias: serviço sem userId 403; humano ativo 200; download do documento do IMOB também", async () => {
  const before = await membershipState();
  const svc = await upload(tok.svc); matrix.set("upload serviço", String(svc.status));
  const svcX = await upload(tok.svcX); matrix.set("upload serviço X", String(svcX.status));
  const rev = await upload(tok.revoked); matrix.set("upload revogado", String(rev.status));
  const ok = await upload(tok.member); matrix.set("upload humano", String(ok.status));
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  check(svc.status === 403 && svcX.status === 403 && rev.status === 403, `uploads negados: ${svc.status}/${svcX.status}/${rev.status}`);
  const docId = ok.body?.data?.[0]?.id ?? ok.body?.data?.id ?? ok.body?.items?.[0]?.id;
  if (docId) {
    const dl = await request.get(`/api/uploads/${docId}`).set("Authorization", auth(tok.svc)); matrix.set("download serviço", String(dl.status));
    check(dl.status === 403, `download pelo serviço: ${dl.status}`);
    assert.equal((await request.get(`/api/uploads/${docId}`).set("Authorization", auth(tok.member))).status, 200);
  }
  // uploads de OUTROS agentes não mudam
  const other = await upload(tok.svc, "j360"); matrix.set("upload serviço (agente j360, não-IMOB)", String(other.status));
  assert.equal(other.status, 200, "upload de outro agente segue como antes");
  assert.equal(await membershipState(), before);
});

test("7. histórico IMOB sem regressão: serviço 403; titular 200; outro humano 404; sem criar vínculo", async () => {
  const mine = await request.post("/api/imob/chat/conversations").set("Authorization", auth(tok.owner)).send({ title: "Conversa do fundador" });
  assert.equal(mine.status, 201, JSON.stringify(mine.body));
  const conv = mine.body.conversation.conversationId as string;
  const before = await membershipState();
  for (const path of ["/chat/conversations", `/chat/conversations/${conv}/messages`, "/chat/telemetry/summary"]) assert.equal((await request.get(`/api/imob${path}`).set("Authorization", auth(tok.svc))).status, 403, path);
  assert.equal((await request.get(`/api/imob/chat/conversations/${conv}/messages`).set("Authorization", auth(tok.owner))).status, 200);
  assert.equal((await request.get(`/api/imob/chat/conversations/${conv}/messages`).set("Authorization", auth(tok.member))).status, 404);
  assert.equal(await membershipState(), before);
});

test("8. nenhuma consulta de serviço (repetida) cria, reativa ou promove vínculo humano", async () => {
  const before = await membershipState();
  for (let i = 0; i < 5; i += 1) for (const token of [tok.svc, tok.svcB, tok.svcX, tok.revoked]) for (const [method, path] of ROUTES) await call(token, method, path);
  assert.equal(await membershipState(), before);
  const humans = Number((await prismaGlobal.$queryRaw<Array<{ n: bigint }>>`SELECT count(*)::bigint AS n FROM eiah_workspace_memberships WHERE tenant_id IN (${tenantId}, ${foreignTenant})`)[0]!.n);
  assert.equal(humans, 6, "só os 6 vínculos humanos explícitos do preparo");
});
