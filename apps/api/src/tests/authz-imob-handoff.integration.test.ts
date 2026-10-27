import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import express from "express";
import supertest from "supertest";
import { prismaGlobal } from "@repo/db";

import { chatVerticalsRouter } from "../routes/chatVerticals";
import { imobRouter } from "../routes/imob";
import { marketplaceRouter } from "../routes/marketplace";
import { verticalAccessRouter } from "../routes/verticalAccess";
import { ensureVerticalAccessStore } from "../services/products/verticalAccessApproval";
import { ensureWorkspaceMembershipForUser } from "../services/workspaceResponsibility";

// AUTHZ-IMOB-HANDOFF-001 — selecionar o IMOB no Front Door (`POST /chat/vertical-handoff`) é leitura/encaminhamento: não cria vínculo,
// não reativa, não promove, não concede. O estado é verificado DIRETAMENTE no banco (todas as colunas de `eiah_workspace_memberships`),
// antes e depois de cada cenário (PostgreSQL descartável, dados sintéticos).
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
const tenantId = `hf-t-${id}`, foreignTenant = `hf-x-${id}`;
const wsA = `hf-a-${id}`, wsB = `hf-b-${id}`, wsC = `hf-c-${id}`, wsX = `hf-xa-${id}`, wsN = `hf-n-${id}`;
const u = {
  owner: `hf-owner-${id}`, member: `hf-member-${id}`, unlinked: `hf-unl-${id}`, revoked: `hf-rev-${id}`, noperm: `hf-nop-${id}`, admin: `hf-adm-${id}`,
  ownerB: `hf-ownb-${id}`, ownerC: `hf-ownc-${id}`, solo: `hf-solo-${id}`, ownerX: `hf-ownx-${id}`, xUnlinked: `hf-xunl-${id}`, memberInN: `hf-mn-${id}`,
};
const tok = Object.fromEntries(Object.keys(u).map((key) => [key, `syn-hf-${key}-${id}`])) as Record<keyof typeof u, string>;
const auth = (token: string) => `Bearer ${token}`;
const previousAdmins = process.env.EIAH_PLATFORM_ADMIN_EMAILS;
const app = express();
app.use(express.json());
app.use("/api", verticalAccessRouter, marketplaceRouter, chatVerticalsRouter);
app.use("/api/imob", imobRouter);
const request = supertest(app);
const seen = new Map<string, string>(); // matriz de resultados (evidência): ator → desfecho do handoff para o IMOB
const handoff = async (token: string, verticalId: "imob" | "log" = "imob") => {
  const res = await request.post("/api/chat/vertical-handoff").set("Authorization", auth(token)).send({ verticalId, capabilityId: verticalId === "imob" ? "knowledge.search" : "oraculo.context", mode: "read_only" });
  if (verticalId === "imob") {
    const who = Object.entries(tok).find(([, value]) => value === token)?.[0] ?? "cross-token";
    const data = res.body?.data ?? {};
    seen.set(who, data.ok === true ? `allowed:${data.handoff?.outcome ?? "?"}` : `blocked:${data.reasonCode ?? data.handoff?.reasonCode ?? "?"}`);
  }
  return res;
};
const imobGet = (token: string, path: string) => request.get(`/api/imob${path}`).set("Authorization", auth(token));
const imobPost = (token: string, path: string, body: unknown) => request.post(`/api/imob${path}`).set("Authorization", auth(token)).send(body as object);

/** Estado COMPLETO dos vínculos dos três tenants/workspaces (inclui updated_at): qualquer escrita aparece aqui. */
async function membershipState() {
  const rows = await prismaGlobal.$queryRaw<Array<Record<string, unknown>>>`
    SELECT user_id, tenant_id, workspace_id, role_key, status, permissions::text AS permissions, created_at::text AS created_at, updated_at::text AS updated_at
    FROM eiah_workspace_memberships WHERE tenant_id IN (${tenantId}, ${foreignTenant}) ORDER BY tenant_id, workspace_id, user_id`;
  return JSON.stringify(rows);
}
const rowOf = async (userId: string, workspaceId: string) =>
  (await prismaGlobal.$queryRaw<Array<{ role_key: string; status: string; permissions: string }>>`SELECT role_key, status, permissions::text AS permissions FROM eiah_workspace_memberships WHERE user_id=${userId} AND workspace_id=${workspaceId}`)[0] ?? null;
const countFor = async (userId: string) => Number((await prismaGlobal.$queryRaw<Array<{ n: bigint }>>`SELECT count(*)::bigint AS n FROM eiah_workspace_memberships WHERE user_id=${userId}`)[0]!.n);
const outcome = (res: { body: { data?: { ok?: boolean; reasonCode?: string; handoff?: { outcome?: string; reasonCode?: string } } } }) => {
  const data = res.body.data ?? {};
  return data.ok === true ? `allowed:${data.handoff?.outcome ?? "?"}` : `blocked:${data.reasonCode ?? data.handoff?.reasonCode ?? "?"}`;
};
/** Executa `fn` e exige que NENHUMA linha de vínculo (nenhuma coluna) tenha mudado. */
async function unchanged<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const before = await membershipState();
  const result = await fn();
  assert.equal(await membershipState(), before, `${label}: memberships alteradas`);
  return result;
}

async function enableImob(workspaceId: string, token: string) {
  const tenant = workspaceId === wsX ? foreignTenant : tenantId;
  assert.equal((await request.post("/api/vertical-access/request").set("Authorization", auth(token)).send({ vertical: "IMOB", channel: "marketplace" })).status, 201);
  const rows = await prismaGlobal.$queryRaw<Array<{ id: string }>>`SELECT id FROM vertical_access_approvals WHERE tenant_id=${tenant} AND workspace_id=${workspaceId} AND vertical='IMOB'`;
  assert.equal((await request.post(`/api/admin/vertical-approvals/${rows[0]!.id}/decision`).set("Authorization", auth(tok.admin)).send({ decision: "aprovar", note: "Synthetic" })).status, 200);
  assert.equal((await request.post("/api/marketplace/installations/activate").set("Authorization", auth(token)).send({ product: "IMOB" })).status, 200);
}

before(async () => {
  process.env.EIAH_PLATFORM_ADMIN_EMAILS = `hf-adm-${id}@example.com`;
  await prismaGlobal.tenant.createMany({ data: [{ id: tenantId, name: "Synthetic handoff" }, { id: foreignTenant, name: "Synthetic handoff foreign" }] });
  await prismaGlobal.workspace.createMany({ data: [
    { id: wsA, tenantId, name: "A" }, { id: wsB, tenantId, name: "B" }, { id: wsC, tenantId, name: "C" }, { id: wsN, tenantId, name: "N sem IMOB" }, { id: wsX, tenantId: foreignTenant, name: "X" },
  ] });
  await prismaGlobal.user.createMany({ data: Object.entries(u).map(([key, userId]) => ({ id: userId, tenantId: key === "ownerX" || key === "xUnlinked" ? foreignTenant : tenantId, email: key === "admin" ? `hf-adm-${id}@example.com` : `${userId}@example.com` })) });
  for (const [userId, roleKey, workspaceId, tenant] of [
    [u.owner, "founder", wsA, tenantId], [u.member, "corretor", wsA, tenantId], [u.revoked, "corretor", wsA, tenantId], [u.noperm, "corretor", wsA, tenantId], [u.admin, "corretor", wsA, tenantId],
    [u.ownerB, "founder", wsB, tenantId], [u.ownerC, "founder", wsC, tenantId], [u.solo, "corretor", wsC, tenantId], [u.ownerX, "founder", wsX, foreignTenant], [u.memberInN, "corretor", wsN, tenantId],
  ] as const) await ensureWorkspaceMembershipForUser({ tenantId: tenant, workspaceId, userId, roleKey });
  const tokenRows: Array<[string, string, string, string]> = [
    [tok.owner, tenantId, wsA, u.owner], [tok.member, tenantId, wsA, u.member], [tok.unlinked, tenantId, wsA, u.unlinked], [tok.revoked, tenantId, wsA, u.revoked], [tok.noperm, tenantId, wsA, u.noperm],
    [tok.admin, tenantId, wsA, u.admin], [tok.ownerB, tenantId, wsB, u.ownerB], [tok.ownerC, tenantId, wsC, u.ownerC], [tok.solo, tenantId, wsC, u.solo],
    [tok.ownerX, foreignTenant, wsX, u.ownerX], [tok.xUnlinked, foreignTenant, wsX, u.xUnlinked], [tok.memberInN, tenantId, wsN, u.memberInN],
  ];
  await prismaGlobal.apiToken.createMany({ data: tokenRows.map(([token, tenant, workspaceId, userId]) => ({ token, tenantId: tenant, workspaceId, userId })) });
  await ensureVerticalAccessStore(prismaGlobal);
  await enableImob(wsA, tok.owner); await enableImob(wsB, tok.ownerB); await enableImob(wsC, tok.ownerC); await enableImob(wsX, tok.ownerX);
  // fixtures de estado (banco descartável): vínculo revogado, permissão ausente, e fundador de C revogado (deixa `solo` como único ativo)
  await prismaGlobal.$executeRaw`UPDATE eiah_workspace_memberships SET status='revoked' WHERE user_id IN (${u.revoked}, ${u.ownerC})`;
  await prismaGlobal.$executeRaw`UPDATE eiah_workspace_memberships SET permissions='[]'::jsonb WHERE user_id=${u.noperm}`;
});

after(async () => {
  console.log("MATRIX-HANDOFF " + JSON.stringify(Object.fromEntries(seen)));
  if (previousAdmins === undefined) delete process.env.EIAH_PLATFORM_ADMIN_EMAILS;
  else process.env.EIAH_PLATFORM_ADMIN_EMAILS = previousAdmins;
  await prismaGlobal.$disconnect();
});

test("1. usuário SEM vínculo seleciona o IMOB: bloqueio e memberships 0→0 (estado completo do banco)", async () => {
  assert.equal(await countFor(u.unlinked), 0);
  const res = await unchanged("sem vínculo", () => handoff(tok.unlinked));
  assert.equal(res.status, 200);
  assert.match(outcome(res), /^blocked:/, outcome(res));
  assert.equal(await countFor(u.unlinked), 0);
});

test("2. usuário COM vínculo ativo e permissão: handoff permitido e a linha do vínculo fica IDÊNTICA (papel, permissões, status, timestamps)", async () => {
  const before = await rowOf(u.member, wsA);
  const res = await unchanged("membro ativo", () => handoff(tok.member));
  assert.equal(outcome(res), "allowed:allowed", outcome(res));
  assert.deepEqual(await rowOf(u.member, wsA), before);
  assert.equal((await unchanged("fundador", () => handoff(tok.owner))).body.data.ok, true);
});

test("3. vínculo REVOGADO: bloqueio, sem reativação (status continua revoked)", async () => {
  const res = await unchanged("revogado", () => handoff(tok.revoked));
  assert.match(outcome(res), /^blocked:/, outcome(res));
  assert.equal((await rowOf(u.revoked, wsA))?.status, "revoked");
});

test("4. outro workspace: quem tem vínculo em A, com token de B, é bloqueado e nada é criado (também em workspace sem IMOB)", async () => {
  for (const [token, label] of [[tok.ownerC, "fundador de C (revogado) em C"], [tok.memberInN, "membro de N (IMOB não instalado)"]] as const) {
    const res = await unchanged(label, () => handoff(token));
    assert.match(outcome(res), /^blocked:/, `${label}: ${outcome(res)}`);
  }
  // usuário de A usando token escopado a B (onde não tem vínculo): cria-se um token só para este cenário
  await prismaGlobal.apiToken.create({ data: { token: `syn-hf-cross-${id}`, tenantId, workspaceId: wsB, userId: u.member } });
  const before = await countFor(u.member);
  const res = await unchanged("A→B", () => handoff(`syn-hf-cross-${id}`));
  assert.match(outcome(res), /^blocked:/, outcome(res));
  assert.equal(await countFor(u.member), before, "nenhum vínculo novo em B");
});

test("5. outro tenant: usuário sem vínculo no tenant estrangeiro (IMOB instalado lá) é bloqueado; nada é criado em nenhum tenant", async () => {
  const res = await unchanged("outro tenant", () => handoff(tok.xUnlinked));
  assert.match(outcome(res), /^blocked:/, outcome(res));
  assert.equal(await countFor(u.xUnlinked), 0);
});

test("6. política/permissão AUSENTE (vínculo ativo sem imob.chat.use) e IMOB não instalado: bloqueio fail-closed; linha inalterada", async () => {
  const before = await rowOf(u.noperm, wsA);
  const res = await unchanged("sem permissão", () => handoff(tok.noperm));
  assert.match(outcome(res), /^blocked:/, outcome(res));
  assert.deepEqual(await rowOf(u.noperm, wsA), before);
  const noInstall = await unchanged("IMOB não instalado", () => handoff(tok.memberInN));
  assert.equal(outcome(noInstall), "blocked:VERTICAL_NOT_REGISTERED");
});

test("7. membro ATIVO ÚNICO (corretor) não é promovido a founder pelo handoff; papel e permissões ficam idênticos", async () => {
  const before = await rowOf(u.solo, wsC);
  assert.equal(before?.role_key, "corretor");
  await unchanged("membro único", () => handoff(tok.solo));
  assert.deepEqual(await rowOf(u.solo, wsC), before, "sem promoção");
});

test("8. handoff REPETIDO (10×) por todos os perfis: nenhuma concessão nem alteração de vínculo", async () => {
  await unchanged("repetido", async () => {
    for (let i = 0; i < 10; i += 1) for (const token of [tok.unlinked, tok.member, tok.revoked, tok.noperm, tok.solo, tok.xUnlinked, tok.owner]) await handoff(token);
  });
  assert.equal(await countFor(u.unlinked), 0);
  assert.equal(await countFor(u.xUnlinked), 0);
});

test("9. consultar o registry e o handoff para a Logística continuam sem efeito de escrita (regressão)", async () => {
  await unchanged("registry/logística", async () => {
    for (const token of [tok.unlinked, tok.member, tok.xUnlinked]) {
      await request.get("/api/chat/vertical-registry").set("Authorization", auth(token));
      await handoff(token, "log");
    }
  });
});

test("10. histórico: sem vínculo = 403 mesmo depois de handoffs; conversa de outro titular = 404; consulta autorizada preservada", async () => {
  const mine = await imobPost(tok.member, "/chat/conversations", { title: "Conversa do membro" });
  assert.equal(mine.status, 201, JSON.stringify(mine.body));
  const convMember = mine.body.conversation.conversationId as string;
  assert.equal((await imobPost(tok.member, `/chat/conversations/${convMember}/messages`, { role: "user", content: "Mensagem do membro" })).status, 201);
  await unchanged("histórico", async () => {
    await handoff(tok.unlinked);
    for (const path of ["/chat/conversations", `/chat/conversations/${convMember}/messages`, `/chat/conversations/${convMember}/threads`]) {
      const res = await imobGet(tok.unlinked, path);
      assert.equal(res.status, 403, path);
      assert.equal(res.body.error.code, "IMOB_HISTORY_MEMBERSHIP_REQUIRED");
    }
    assert.equal((await imobGet(tok.owner, `/chat/conversations/${convMember}/messages`)).status, 404, "outro titular");
    const ok = await imobGet(tok.member, `/chat/conversations/${convMember}/messages`);
    assert.equal(ok.status, 200);
    assert.equal(ok.body.items[0].content, "Mensagem do membro");
  });
  assert.equal(await countFor(u.unlinked), 0);
});
