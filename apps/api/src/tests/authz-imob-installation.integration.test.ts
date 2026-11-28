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

// AUTHZ-IMOB-INSTALLATION-001 — vínculo ativo + `imob.chat.use` NÃO bastam: as APIs operacionais do IMOB (e upload/download de documentos do IMOB) só
// respondem se o IMOB estiver INSTALADO e HABILITADO naquele workspace (mesma fonte do registry de verticais), lido em modo somente leitura.
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
const tenantId = `in-t-${id}`, foreignTenant = `in-x-${id}`;
// A = instalado e habilitado; N = nunca instalado; D = instalação inativa; G = instalado mas agentes do IMOB desabilitados; B = outro workspace instalado; X = outro tenant instalado
const ws = { A: `in-a-${id}`, N: `in-n-${id}`, D: `in-d-${id}`, G: `in-g-${id}`, B: `in-b-${id}`, X: `in-x-${id}` };
const u = {
  owner: `in-owner-${id}`, member: `in-member-${id}`, revoked: `in-rev-${id}`, noperm: `in-nop-${id}`, admin: `in-adm-${id}`, unlinked: `in-unl-${id}`,
  founderN: `in-fn-${id}`, founderD: `in-fd-${id}`, founderG: `in-fg-${id}`, ownerB: `in-ownb-${id}`, ownerX: `in-ownx-${id}`,
};
const tok = Object.fromEntries([...Object.keys(u), "svcA", "svcN"].map((key) => [key, `syn-in-${key}-${id}`])) as Record<keyof typeof u | "svcA" | "svcN", string>;
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

/** Estado COMPLETO que nenhuma consulta pode alterar: vínculos, instalações, políticas de ação e atribuições de agente. */
async function authorityState() {
  const scope = [tenantId, foreignTenant];
  const [memberships, installations, policies, assignments] = await Promise.all([
    prismaGlobal.$queryRaw<Array<Record<string, unknown>>>`SELECT user_id, workspace_id, role_key, status, permissions::text AS permissions, updated_at::text AS updated_at FROM eiah_workspace_memberships WHERE tenant_id IN (${scope[0]}, ${scope[1]}) ORDER BY workspace_id, user_id`,
    prismaGlobal.$queryRaw<Array<Record<string, unknown>>>`SELECT workspace_id, product, status, updated_at::text AS updated_at FROM tenant_product_installations WHERE tenant_id IN (${scope[0]}, ${scope[1]}) ORDER BY workspace_id, product`,
    prismaGlobal.tenantActionPolicy.findMany({ where: { tenantId: { in: scope } }, select: { workspaceId: true, actionName: true, allowed: true }, orderBy: [{ workspaceId: "asc" }, { actionName: "asc" }] }),
    prismaGlobal.workspaceAgentAssignment.findMany({ where: { tenantId: { in: scope } }, select: { workspaceId: true, agentKey: true, enabled: true }, orderBy: [{ workspaceId: "asc" }, { agentKey: "asc" }] }),
  ]);
  return JSON.stringify({ memberships, installations, policies, assignments });
}
async function sweep(label: string, token: string) {
  const before = await authorityState();
  const statuses: number[] = [];
  for (const [method, path] of ROUTES) statuses.push((await call(token, method, path)).status);
  matrix.set(label, statuses.join("/"));
  assert.equal(await authorityState(), before, `${label}: vínculos/instalações/políticas/atribuições alterados`);
  return statuses;
}
const DENIED = ROUTES.map(() => 403);
const OK = ROUTES.map(() => 200);

async function enableImob(workspaceId: string, token: string) {
  const tenant = workspaceId === ws.X ? foreignTenant : tenantId;
  assert.equal((await request.post("/api/vertical-access/request").set("Authorization", auth(token)).send({ vertical: "IMOB", channel: "marketplace" })).status, 201);
  const rows = await prismaGlobal.$queryRaw<Array<{ id: string }>>`SELECT id FROM vertical_access_approvals WHERE tenant_id=${tenant} AND workspace_id=${workspaceId} AND vertical='IMOB'`;
  assert.equal((await request.post(`/api/admin/vertical-approvals/${rows[0]!.id}/decision`).set("Authorization", auth(tok.admin)).send({ decision: "aprovar", note: "Synthetic" })).status, 200);
  assert.equal((await request.post("/api/marketplace/installations/activate").set("Authorization", auth(token)).send({ product: "IMOB" })).status, 200);
}

before(async () => {
  process.env.EIAH_PLATFORM_ADMIN_EMAILS = `in-adm-${id}@example.com`;
  await prismaGlobal.tenant.createMany({ data: [{ id: tenantId, name: "Synthetic installation" }, { id: foreignTenant, name: "Synthetic installation foreign" }] });
  await prismaGlobal.workspace.createMany({ data: [
    { id: ws.A, tenantId, name: "A" }, { id: ws.N, tenantId, name: "N" }, { id: ws.D, tenantId, name: "D" }, { id: ws.G, tenantId, name: "G" }, { id: ws.B, tenantId, name: "B" }, { id: ws.X, tenantId: foreignTenant, name: "X" },
  ] });
  await prismaGlobal.user.createMany({ data: Object.entries(u).map(([key, userId]) => ({ id: userId, tenantId: key === "ownerX" ? foreignTenant : tenantId, email: key === "admin" ? `in-adm-${id}@example.com` : `${userId}@example.com` })) });
  for (const [userId, roleKey, workspaceId, tenant] of [
    [u.owner, "founder", ws.A, tenantId], [u.member, "corretor", ws.A, tenantId], [u.revoked, "corretor", ws.A, tenantId], [u.noperm, "corretor", ws.A, tenantId], [u.admin, "corretor", ws.A, tenantId],
    [u.founderN, "founder", ws.N, tenantId], [u.founderD, "founder", ws.D, tenantId], [u.founderG, "founder", ws.G, tenantId],
    [u.ownerB, "founder", ws.B, tenantId], [u.ownerX, "founder", ws.X, foreignTenant],
  ] as const) await ensureWorkspaceMembershipForUser({ tenantId: tenant, workspaceId, userId, roleKey });
  const rows: Array<[string, string, string, string?]> = [
    [tok.owner, tenantId, ws.A, u.owner], [tok.member, tenantId, ws.A, u.member], [tok.revoked, tenantId, ws.A, u.revoked], [tok.noperm, tenantId, ws.A, u.noperm], [tok.admin, tenantId, ws.A, u.admin],
    [tok.unlinked, tenantId, ws.A, u.unlinked], [tok.founderN, tenantId, ws.N, u.founderN], [tok.founderD, tenantId, ws.D, u.founderD], [tok.founderG, tenantId, ws.G, u.founderG],
    [tok.ownerB, tenantId, ws.B, u.ownerB], [tok.ownerX, foreignTenant, ws.X, u.ownerX], [tok.svcA, tenantId, ws.A], [tok.svcN, tenantId, ws.N],
  ];
  await prismaGlobal.apiToken.createMany({ data: rows.map(([token, tenant, workspaceId, userId]) => ({ token, tenantId: tenant, workspaceId, ...(userId ? { userId } : {}) })) });
  await ensureVerticalAccessStore(prismaGlobal);
  // instalação pelo fluxo governado (pedido → liberação EIAH → ativação, que também provisiona os agentes)
  for (const [workspaceId, token] of [[ws.A, tok.owner], [ws.D, tok.founderD], [ws.G, tok.founderG], [ws.B, tok.ownerB], [ws.X, tok.ownerX]] as const) await enableImob(workspaceId, token);
  // estados "instalado mas inativo" e "instalado sem agentes": fixtures do banco descartável
  await prismaGlobal.$executeRaw`UPDATE tenant_product_installations SET status='inactive' WHERE tenant_id=${tenantId} AND workspace_id=${ws.D} AND product='IMOB'`;
  await prismaGlobal.workspaceAgentAssignment.updateMany({ where: { tenantId, workspaceId: ws.G, agentKey: "imob-chat-audit" }, data: { enabled: false } });
  await prismaGlobal.$executeRaw`UPDATE eiah_workspace_memberships SET status='revoked' WHERE user_id=${u.revoked}`;
  await prismaGlobal.$executeRaw`UPDATE eiah_workspace_memberships SET permissions='[]'::jsonb WHERE user_id=${u.noperm}`;
  // há DADOS IMOB nos workspaces D e G (existência de dados não prova instalação)
  await prismaGlobal.imobOwner.create({ data: { tenantId, workspaceId: ws.D, name: "Proprietário residual" } });
  await prismaGlobal.imobOwner.create({ data: { tenantId, workspaceId: ws.G, name: "Proprietário residual G" } });
});

after(async () => {
  console.log("MATRIX-INSTALLATION " + JSON.stringify(Object.fromEntries(matrix)));
  if (previousAdmins === undefined) delete process.env.EIAH_PLATFORM_ADMIN_EMAILS;
  else process.env.EIAH_PLATFORM_ADMIN_EMAILS = previousAdmins;
  await prismaGlobal.$disconnect();
});

test("1. IMOB NÃO INSTALADO: fundador ativo com permissão recebe 403 em todas as rotas, no upload e no histórico; nada é instalado nem alterado", async () => {
  assert.deepEqual(await sweep("não instalado (fundador ativo)", tok.founderN), DENIED);
  const before = await authorityState();
  const up = await upload(tok.founderN); matrix.set("upload não instalado", String(up.status));
  assert.equal(up.status, 403);
  assert.equal((await request.get("/api/imob/chat/conversations").set("Authorization", auth(tok.founderN))).status, 403);
  assert.equal((await request.post("/api/imob/chat/conversations").set("Authorization", auth(tok.founderN)).send({ title: "x" })).status, 403);
  assert.equal(await authorityState(), before);
  const denied = await call(tok.founderN, "GET", "/owners");
  assert.equal(denied.body.error.code, "ENTITLEMENT_MISSING", "mesmo código do contrato existente");
  assert.equal(denied.body.error.reasonCode, "IMOB_ENTITLEMENT_MISSING");
  assert.equal((await call(tok.founderD, "GET", "/owners")).body.error.reasonCode, "IMOB_INSTALLATION_INACTIVE");
});

test("2. IMOB DESABILITADO (instalação inativa; instalado sem os agentes do IMOB): 403 mesmo com vínculo ativo, permissão e dados residuais", async () => {
  assert.deepEqual(await sweep("instalação inativa (fundador)", tok.founderD), DENIED);
  assert.deepEqual(await sweep("agentes desabilitados (fundador)", tok.founderG), DENIED);
  assert.equal((await upload(tok.founderD)).status, 403);
  assert.equal((await upload(tok.founderG)).status, 403);
});

test("3. IMOB INSTALADO + vínculo ativo + permissão: acesso preservado (200 ×9), upload e download; a linha do vínculo e a instalação ficam idênticas", async () => {
  for (const [label, token] of [["instalado, corretor", tok.member], ["instalado, fundador", tok.owner]] as const) assert.deepEqual(await sweep(label, token), OK, label);
  const before = await authorityState();
  const ok = await upload(tok.member); matrix.set("upload instalado", String(ok.status));
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const docId = ok.body?.data?.[0]?.id ?? ok.body?.data?.id ?? ok.body?.items?.[0]?.id;
  if (docId) assert.equal((await request.get(`/api/uploads/${docId}`).set("Authorization", auth(tok.member))).status, 200);
  const conv = await request.post("/api/imob/chat/conversations").set("Authorization", auth(tok.member)).send({ title: "Conversa" });
  assert.equal(conv.status, 201, JSON.stringify(conv.body));
  assert.equal(await authorityState(), before);
});

test("4. instalado MAS sem vínculo / vínculo revogado / sem permissão: bloqueio (cumulativo)", async () => {
  assert.deepEqual(await sweep("instalado, sem vínculo", tok.unlinked), DENIED);
  assert.deepEqual(await sweep("instalado, revogado", tok.revoked), DENIED);
  assert.deepEqual(await sweep("instalado, sem permissão", tok.noperm), DENIED);
});

test("5. token SEM userId continua negado (instalado ou não)", async () => {
  assert.deepEqual(await sweep("serviço, instalado", tok.svcA), DENIED);
  assert.deepEqual(await sweep("serviço, não instalado", tok.svcN), DENIED);
});

test("6. outro workspace e outro tenant: bloqueio; o usuário de A não ganha o IMOB de B nem de N com token de outro escopo", async () => {
  await prismaGlobal.apiToken.create({ data: { token: `syn-in-cross-${id}`, tenantId, workspaceId: ws.N, userId: u.member } });
  assert.deepEqual(await sweep("membro de A com token de N (não instalado, sem vínculo)", `syn-in-cross-${id}`), DENIED);
  // B e X têm IMOB instalado e seus fundadores operam NOS seus escopos; nenhum dado de A aparece
  await request.post("/api/imob/owners").set("Authorization", auth(tok.owner)).send({ name: "Proprietário sigiloso de A" });
  for (const token of [tok.ownerB, tok.ownerX]) {
    const res = await request.get("/api/imob/owners").set("Authorization", auth(token));
    assert.equal(res.status, 200);
    assert.doesNotMatch(JSON.stringify(res.body), /sigiloso de A/);
  }
});

test("7. chamadas REPETIDAS (5×) por todos os perfis em todos os estados: vínculos, instalações, políticas e atribuições idênticos", async () => {
  const before = await authorityState();
  for (let i = 0; i < 5; i += 1) for (const token of [tok.founderN, tok.founderD, tok.founderG, tok.unlinked, tok.revoked, tok.noperm, tok.svcA, tok.svcN, tok.member, tok.owner]) for (const [method, path] of ROUTES) await call(token, method, path);
  assert.equal(await authorityState(), before);
});

test("8. fluxos de instalação/administração com autoridade própria NÃO foram bloqueados: o fundador de N instala o IMOB pelo fluxo governado e só então a API responde 200", async () => {
  assert.deepEqual(await sweep("N antes da instalação", tok.founderN), DENIED);
  await enableImob(ws.N, tok.founderN);
  assert.deepEqual(await sweep("N depois da instalação governada", tok.founderN), OK);
  assert.equal((await request.get("/api/chat/vertical-registry").set("Authorization", auth(tok.svcN))).status, 200, "registry segue acessível");
});
