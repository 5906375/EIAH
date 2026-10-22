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
import { acceptWorkspaceInvitation, createWorkspaceInvitation, ensureWorkspaceMembershipForUser } from "../services/workspaceResponsibility";

// AUTHZ-IMOB-CRM-001 — as rotas do CRM IMOB (approval-context, resolve-turn, cases, owners e equivalentes) NÃO criam vínculo, NÃO atendem vínculo
// revogado nem usuário sem vínculo, e não promovem membro. O estado é verificado no banco (dump completo de `eiah_workspace_memberships`) antes/depois.
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
const tenantId = `cr-t-${id}`, foreignTenant = `cr-x-${id}`;
const wsA = `cr-a-${id}`, wsB = `cr-b-${id}`, wsC = `cr-c-${id}`, wsX = `cr-xa-${id}`;
const u = {
  owner: `cr-owner-${id}`, member: `cr-member-${id}`, unlinked: `cr-unl-${id}`, revoked: `cr-rev-${id}`, noperm: `cr-nop-${id}`, admin: `cr-adm-${id}`,
  ownerB: `cr-ownb-${id}`, ownerC: `cr-ownc-${id}`, solo: `cr-solo-${id}`, ownerX: `cr-ownx-${id}`, xUnlinked: `cr-xunl-${id}`, invitee: `cr-inv-${id}`,
};
const tok = Object.fromEntries(Object.keys(u).map((key) => [key, `syn-cr-${key}-${id}`])) as Record<keyof typeof u, string>;
const auth = (token: string) => `Bearer ${token}`;
const previousAdmins = process.env.EIAH_PLATFORM_ADMIN_EMAILS;
const app = express();
app.use(express.json());
app.use("/api", verticalAccessRouter, marketplaceRouter, chatVerticalsRouter, uploadsRouter);
app.use("/api/imob", imobRouter);
const request = supertest(app);

/** Rotas CRM/IMOB exercitadas diretamente pela API (independente do Front Door). */
const ROUTES = [
  ["GET", "/control/approval-context?limit=1"], ["POST", "/chat/resolve-turn"], ["GET", "/cases"], ["GET", "/owners"], ["GET", "/properties"],
  ["GET", "/leads"], ["GET", "/command-center/funnel-health"], ["GET", "/kpis/funnel"], ["GET", "/control/priority-queue"],
] as const;
const call = (token: string, method: "GET" | "POST", path: string) =>
  (method === "GET" ? request.get(`/api/imob${path}`) : request.post(`/api/imob${path}`).send({ message: "cadastrar imóvel" })).set("Authorization", auth(token));
const matrix = new Map<string, string>();

async function membershipState() {
  const rows = await prismaGlobal.$queryRaw<Array<Record<string, unknown>>>`
    SELECT user_id, tenant_id, workspace_id, role_key, status, permissions::text AS permissions, created_at::text AS created_at, updated_at::text AS updated_at
    FROM eiah_workspace_memberships WHERE tenant_id IN (${tenantId}, ${foreignTenant}) ORDER BY tenant_id, workspace_id, user_id`;
  return JSON.stringify(rows);
}
const rowOf = async (userId: string, workspaceId: string) =>
  (await prismaGlobal.$queryRaw<Array<{ role_key: string; status: string; permissions: string }>>`SELECT role_key, status, permissions::text AS permissions FROM eiah_workspace_memberships WHERE user_id=${userId} AND workspace_id=${workspaceId}`)[0] ?? null;
const countFor = async (userId: string) => Number((await prismaGlobal.$queryRaw<Array<{ n: bigint }>>`SELECT count(*)::bigint AS n FROM eiah_workspace_memberships WHERE user_id=${userId}`)[0]!.n);
/** Chama todas as rotas com `token`; exige que NENHUMA linha de vínculo tenha mudado. Devolve os status por rota. */
async function sweep(label: string, token: string) {
  const before = await membershipState();
  const statuses: Record<string, number> = {};
  for (const [method, path] of ROUTES) statuses[`${method} ${path.split("?")[0]}`] = (await call(token, method, path)).status;
  const changed = (await membershipState()) !== before;
  matrix.set(label, `${Object.values(statuses).join("/")}${changed ? " [vínculos ALTERADOS]" : ""}`);
  // CRM_MATRIX_PROBE=1: só registra a matriz (usado para registrar o estado ANTERIOR); em condições normais a alteração reprova o teste.
  if (!process.env.CRM_MATRIX_PROBE) assert.equal(changed, false, `${label}: memberships alteradas`);
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
  process.env.EIAH_PLATFORM_ADMIN_EMAILS = `cr-adm-${id}@example.com`;
  await prismaGlobal.tenant.createMany({ data: [{ id: tenantId, name: "Synthetic crm" }, { id: foreignTenant, name: "Synthetic crm foreign" }] });
  await prismaGlobal.workspace.createMany({ data: [{ id: wsA, tenantId, name: "A" }, { id: wsB, tenantId, name: "B" }, { id: wsC, tenantId, name: "C" }, { id: wsX, tenantId: foreignTenant, name: "X" }] });
  await prismaGlobal.user.createMany({ data: Object.entries(u).map(([key, userId]) => ({ id: userId, tenantId: key === "ownerX" || key === "xUnlinked" ? foreignTenant : tenantId, email: key === "admin" ? `cr-adm-${id}@example.com` : `${userId}@example.com`, displayName: `Sintético ${key}` })) });
  for (const [userId, roleKey, workspaceId, tenant] of [
    [u.owner, "founder", wsA, tenantId], [u.member, "corretor", wsA, tenantId], [u.revoked, "corretor", wsA, tenantId], [u.noperm, "corretor", wsA, tenantId], [u.admin, "corretor", wsA, tenantId],
    [u.ownerB, "founder", wsB, tenantId], [u.ownerC, "founder", wsC, tenantId], [u.solo, "corretor", wsC, tenantId], [u.ownerX, "founder", wsX, foreignTenant],
  ] as const) await ensureWorkspaceMembershipForUser({ tenantId: tenant, workspaceId, userId, roleKey });
  const tokenRows: Array<[string, string, string, string]> = [
    [tok.owner, tenantId, wsA, u.owner], [tok.member, tenantId, wsA, u.member], [tok.unlinked, tenantId, wsA, u.unlinked], [tok.revoked, tenantId, wsA, u.revoked], [tok.noperm, tenantId, wsA, u.noperm],
    [tok.admin, tenantId, wsA, u.admin], [tok.ownerB, tenantId, wsB, u.ownerB], [tok.ownerC, tenantId, wsC, u.ownerC], [tok.solo, tenantId, wsC, u.solo],
    [tok.ownerX, foreignTenant, wsX, u.ownerX], [tok.xUnlinked, foreignTenant, wsX, u.xUnlinked], [tok.invitee, tenantId, wsA, u.invitee],
  ];
  await prismaGlobal.apiToken.createMany({ data: tokenRows.map(([token, tenant, workspaceId, userId]) => ({ token, tenantId: tenant, workspaceId, userId })) });
  await ensureVerticalAccessStore(prismaGlobal);
  await enableImob(wsA, tok.owner); await enableImob(wsB, tok.ownerB); await enableImob(wsC, tok.ownerC); await enableImob(wsX, tok.ownerX);
  // fixtures de estado (banco descartável): vínculo revogado, permissão ausente, fundador de C revogado (deixa `solo` como único ativo)
  await prismaGlobal.$executeRaw`UPDATE eiah_workspace_memberships SET status='revoked' WHERE user_id IN (${u.revoked}, ${u.ownerC})`;
  await prismaGlobal.$executeRaw`UPDATE eiah_workspace_memberships SET permissions='[]'::jsonb WHERE user_id=${u.noperm}`;
});

after(async () => {
  console.log("MATRIX-CRM " + JSON.stringify(Object.fromEntries(matrix)));
  if (previousAdmins === undefined) delete process.env.EIAH_PLATFORM_ADMIN_EMAILS;
  else process.env.EIAH_PLATFORM_ADMIN_EMAILS = previousAdmins;
  await prismaGlobal.$disconnect();
});

const DENIED = Object.fromEntries(ROUTES.map(([method, path]) => [`${method} ${path.split("?")[0]}`, 403]));

test("1. SEM vínculo: 403 em todas as rotas do CRM e memberships 0→0 (estado completo do banco)", async () => {
  assert.equal(await countFor(u.unlinked), 0);
  assert.deepEqual(await sweep("sem vínculo", tok.unlinked), DENIED);
  assert.equal(await countFor(u.unlinked), 0);
});

test("2. vínculo REVOGADO: 403 em todas as rotas; status continua revoked (sem reativação)", async () => {
  assert.deepEqual(await sweep("revogado", tok.revoked), DENIED);
  assert.equal((await rowOf(u.revoked, wsA))?.status, "revoked");
});

test("3. vínculo ATIVO e autorizado: as funcionalidades atuais continuam (200) e a linha do vínculo fica IDÊNTICA", async () => {
  for (const token of [tok.member, tok.owner]) {
    const statuses = await sweep(token === tok.member ? "ativo corretor" : "ativo fundador", token);
    for (const [route, status] of Object.entries(statuses)) assert.equal(status, 200, route);
  }
  // escrita autorizada continua funcionando
  const created = await request.post("/api/imob/owners").set("Authorization", auth(tok.member)).send({ name: "Proprietário Sintético CRM" });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal((await request.get("/api/imob/owners").set("Authorization", auth(tok.member))).body.data.items.length, 1);
});

test("4. membro ATIVO ÚNICO (corretor) não é promovido: papel e permissões idênticos após todas as rotas", async () => {
  const before = await rowOf(u.solo, wsC);
  assert.equal(before?.role_key, "corretor");
  await sweep("membro único", tok.solo);
  assert.deepEqual(await rowOf(u.solo, wsC), before);
});

test("5. outro WORKSPACE: quem tem vínculo em A, com token de B (sem vínculo em B), recebe 403 e nenhum vínculo é criado", async () => {
  await prismaGlobal.apiToken.create({ data: { token: `syn-cr-cross-${id}`, tenantId, workspaceId: wsB, userId: u.member } });
  const before = await countFor(u.member);
  assert.deepEqual(await sweep("A→B", `syn-cr-cross-${id}`), DENIED);
  assert.equal(await countFor(u.member), before);
  // e os dados de A não aparecem pelas rotas de B
  assert.equal((await request.get("/api/imob/owners").set("Authorization", auth(tok.ownerB))).body.data.items.length, 0);
});

test("6. outro TENANT: sem vínculo no tenant estrangeiro (IMOB instalado lá) recebe 403; nada criado em nenhum tenant", async () => {
  assert.deepEqual(await sweep("outro tenant", tok.xUnlinked), DENIED);
  assert.equal(await countFor(u.xUnlinked), 0);
});

test("7. permissão AUSENTE (vínculo ativo sem imob.chat.use): bloqueio fail-closed em todas as rotas; linha inalterada", async () => {
  const before = await rowOf(u.noperm, wsA);
  assert.deepEqual(await sweep("sem permissão", tok.noperm), DENIED);
  assert.deepEqual(await rowOf(u.noperm, wsA), before);
});

test("8. chamadas REPETIDAS (5×) por todos os perfis: nenhuma criação, reativação ou promoção implícita", async () => {
  const before = await membershipState();
  for (let i = 0; i < 5; i += 1) for (const token of [tok.unlinked, tok.revoked, tok.noperm, tok.xUnlinked, tok.solo, tok.member, tok.owner]) for (const [method, path] of ROUTES) await call(token, method, path);
  assert.equal(await membershipState(), before);
  assert.equal(await countFor(u.unlinked), 0);
});

test("9. onboarding EXPLÍCITO existente sem regressão: convite aceito cria o vínculo e só então o CRM responde 200", async () => {
  assert.equal((await call(tok.invitee, "GET", "/owners")).status, 403, "antes do convite: sem acesso");
  assert.equal(await countFor(u.invitee), 0);
  const invitation = await createWorkspaceInvitation({ tenantId, workspaceId: wsA, invitedByUserId: u.owner, email: `${u.invitee}@example.com`, roleKey: "corretor" });
  const token = (invitation as { token?: string; invitation?: { token?: string } }).token ?? (invitation as { invitation?: { token?: string } }).invitation?.token;
  assert.ok(token, "convite com token");
  await acceptWorkspaceInvitation({ token: token!, authenticatedUserId: u.invitee, email: `${u.invitee}@example.com` });
  assert.equal(await countFor(u.invitee), 1, "o convite (fluxo explícito) cria o vínculo");
  const statuses = await sweep("convidado", tok.invitee);
  for (const [route, status] of Object.entries(statuses)) assert.equal(status, 200, route);
  // `ensureWorkspaceMembershipForUser` (onboarding explícito) segue funcionando
  await prismaGlobal.apiToken.create({ data: { token: `syn-cr-new-${id}`, tenantId, workspaceId: wsA, userId: u.unlinked } });
  await ensureWorkspaceMembershipForUser({ tenantId, workspaceId: wsA, userId: u.unlinked, roleKey: "corretor" });
  assert.equal((await call(`syn-cr-new-${id}`, "GET", "/owners")).status, 200);
});

test("10. histórico IMOB: as proteções anteriores seguem valendo (sem vínculo 403; outro titular 404; titular lê)", async () => {
  const mine = await request.post("/api/imob/chat/conversations").set("Authorization", auth(tok.owner)).send({ title: "Conversa do fundador" });
  assert.equal(mine.status, 201, JSON.stringify(mine.body));
  const conv = mine.body.conversation.conversationId as string;
  assert.equal((await request.post(`/api/imob/chat/conversations/${conv}/messages`).set("Authorization", auth(tok.owner)).send({ role: "user", content: "Mensagem do fundador" })).status, 201);
  const before = await membershipState();
  for (const path of ["/chat/conversations", `/chat/conversations/${conv}/messages`, `/chat/conversations/${conv}/threads`]) {
    const res = await request.get(`/api/imob${path}`).set("Authorization", auth(tok.xUnlinked));
    assert.equal(res.status, 403, path);
  }
  assert.equal((await request.get(`/api/imob/chat/conversations/${conv}/messages`).set("Authorization", auth(tok.member))).status, 404, "outro titular");
  assert.equal((await request.get(`/api/imob/chat/conversations/${conv}/messages`).set("Authorization", auth(tok.owner))).status, 200);
  assert.equal(await membershipState(), before);
});

test("11. caminho equivalente: upload de documentos do IMOB (`POST /uploads` agentSlug=imob) também só aceita vínculo ATIVO e não cria/promove/reativa", async () => {
  const upload = (token: string) => request.post("/api/uploads").set("Authorization", auth(token)).field("agentSlug", "imob").attach("files", Buffer.from("documento sintético"), { filename: "doc.txt", contentType: "text/plain" });
  // usuário NOVO sem vínculo (o `unlinked` já foi integrado pelo onboarding explícito do teste 9)
  const freshId = `cr-fresh-${id}`;
  await prismaGlobal.user.create({ data: { id: freshId, tenantId, email: `${freshId}@example.com` } });
  await prismaGlobal.apiToken.create({ data: { token: `syn-cr-fresh-${id}`, tenantId, workspaceId: wsA, userId: freshId } });
  const before = await membershipState();
  for (const [label, token] of [["sem vínculo", `syn-cr-fresh-${id}`], ["outro tenant sem vínculo", tok.xUnlinked], ["revogado", tok.revoked], ["sem permissão", tok.noperm]] as const) {
    const res = await upload(token);
    matrix.set(`upload ${label}`, String(res.status));
    assert.equal(res.status, 403, label);
    assert.equal(res.body?.error?.code, "UPLOAD_FORBIDDEN", label);
  }
  assert.equal(await membershipState(), before, "uploads negados não alteram vínculos");
  const ok = await upload(tok.member);
  matrix.set("upload ativo", String(ok.status));
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(await membershipState(), before);
});
