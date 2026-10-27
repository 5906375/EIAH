import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import express from "express";
import supertest from "supertest";
import { LOGISTICA_CONTEXT_SCOPE, ORACULO_CONTENT_REVIEW_SCOPE, ORACULO_PREPARATION_WRITE_SCOPE } from "@eiah/contracts";
import { prismaGlobal } from "@repo/db";

import { chatVerticalsRouter } from "../routes/chatVerticals";
import { oraculoPreparationRouter } from "../routes/oraculoPreparation";
import { sessionRouter } from "../routes/session";
import { readVerticalRegistryFacts } from "../services/chat/workspaceVerticalRegistry";
import { ensureVerticalAccessStore } from "../services/products/verticalAccessApproval";
import { ensureWorkspaceMembershipForUser, readWorkspaceResponsibleProfile } from "../services/workspaceResponsibility";
import { canAccessOraculoUploads } from "../services/logistica/control/oraculoUploadAccess";
import { ensureLogisticaMember, logisticaOperator, logisticaReader } from "./support/logisticaMemberFixture";

// EIAH-FD-ADR010-R1 — Matriz de autorização da LOGISTICA (PostgreSQL real, dados sintéticos).
// Regra: consultar um registry ou contexto nunca cria autoridade; o acesso exige vínculo, instalação, liberação EIAH e política exata.
// O acesso exige vínculo ativo, capacidade expressa no vínculo, instalação, liberação EIAH e política exata do workspace.
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
const tenantId = `r1-t-${id}`, otherTenantId = `r1-o-${id}`;
const wsFull = `r1-full-${id}`;       // instalada + liberada + política de contexto
const wsNoPolicy = `r1-nopol-${id}`;  // instalada + liberada, sem política
const wsNoApproval = `r1-noapp-${id}`; // instalada, sem liberação
const wsNoInstall = `r1-noinst-${id}`; // sem instalação
const wsImob = `r1-imob-${id}`;        // IMOB instalado (permissão do IMOB depende do perfil legado) + Logística liberada
const wsOther = `r1-other-${id}`;      // workspace do outro tenant
const wsFull2 = `r1-full2-${id}`;     // segundo workspace completo (instalado + liberado + políticas), sem vínculos de leitor/escritor
const users = {
  owner: `owner-${id}`, member: `member-${id}`, unlinked: `unlinked-${id}`, bMember: `bmember-${id}`, other: `other-${id}`,
  imobUnlinked: `imobun-${id}`, noPolicy: `nopol-${id}`, noApproval: `noapp-${id}`, noInstall: `noinst-${id}`,
  reader: `reader-${id}`, writeNoRead: `wnr-${id}`, writer: `writer-${id}`, revoked: `revoked-${id}`, unlinked2: `unlinked2-${id}`,
};
const tk = (name: string) => `syn-${name}-${id}`;
const auth = (token: string) => `Bearer ${token}`;
const app = express();
app.use(express.json());
app.use("/api", chatVerticalsRouter, oraculoPreparationRouter, sessionRouter);
const request = supertest(app);
const base = "/api/logistica/oraculo/preparations";
const emptyContext = { context: { port: { status: "not_informed" }, depot: { status: "not_informed" }, flow: { status: "not_informed" } } };

const membership = async (userId: string, workspaceId: string) =>
  prismaGlobal.$queryRaw<Array<{ status: string; role_key: string }>>`SELECT status, role_key FROM eiah_workspace_memberships WHERE tenant_id=${tenantId} AND workspace_id=${workspaceId} AND user_id=${userId}`;
const storedPermissions = async (userId: string, workspaceId: string) => {
  const rows = await prismaGlobal.$queryRaw<Array<{ permissions: unknown }>>`SELECT permissions FROM eiah_workspace_memberships WHERE tenant_id=${tenantId} AND workspace_id=${workspaceId} AND user_id=${userId}`;
  return Array.isArray(rows[0]?.permissions) ? (rows[0]!.permissions as string[]) : [];
};
const session = (token: string) => request.get("/api/session/context?domain=logistica").set("Authorization", auth(token));
const handoffLog = (token: string) => request.post("/api/chat/vertical-handoff").set("Authorization", auth(token)).send({ verticalId: "log", capabilityId: "oraculo.context", mode: "read_only" });
async function installAndApprove(workspaceId: string, opts: { install: boolean; approve: boolean }) {
  await prismaGlobal.$executeRaw`INSERT INTO tenant_product_installations (id, tenant_id, workspace_id, product, status, activated_by_user_id) SELECT ${randomUUID()}, ${tenantId}, ${workspaceId}, 'LOGISTICA', 'active', ${users.owner} WHERE ${opts.install}`;
  if (opts.approve) {
    await prismaGlobal.$executeRaw`INSERT INTO vertical_access_approvals (id, tenant_id, workspace_id, vertical, status, source, decided_by, decided_at, note, created_at, updated_at) VALUES (${randomUUID()}, ${tenantId}, ${workspaceId}, 'LOGISTICA', 'aprovado', 'migration', 'synthetic-admin', NOW(), 'synthetic', NOW(), NOW())`;
  }
}
const grant = (workspaceId: string, actionName: string) => prismaGlobal.tenantActionPolicy.create({ data: { tenantId, workspaceId, actionName, allowed: true } });
let caseId = "";

before(async () => {
  await prismaGlobal.tenant.createMany({ data: [{ id: tenantId, name: "R1 tenant" }, { id: otherTenantId, name: "R1 other tenant" }] });
  await prismaGlobal.workspace.createMany({ data: [
    { id: wsFull, tenantId, name: "full" }, { id: wsNoPolicy, tenantId, name: "nopol" }, { id: wsNoApproval, tenantId, name: "noapp" },
    { id: wsNoInstall, tenantId, name: "noinst" }, { id: wsImob, tenantId, name: "imob" }, { id: wsOther, tenantId: otherTenantId, name: "other" },
    { id: wsFull2, tenantId, name: "full2" },
  ] });
  await prismaGlobal.user.createMany({ data: Object.entries(users).map(([key, userId]) => ({ id: userId, tenantId: key === "other" ? otherTenantId : tenantId, email: `r1-${key}-${id}@example.com` })) });
  // vínculos EXPLÍCITOS (mesmo caminho do onboarding/convite): dono e membro de cada workspace relevante
  // vínculos EXPLÍCITOS (mesmo caminho do onboarding/convite), COM a capacidade da Logística gravada no próprio vínculo (S03)
  for (const [userId, grants, workspaceId] of [
    [users.owner, logisticaOperator(), wsFull], [users.member, logisticaReader(), wsFull], [users.bMember, logisticaReader(), wsNoInstall],
    [users.noPolicy, logisticaOperator(), wsNoPolicy], [users.noApproval, logisticaOperator(), wsNoApproval], [users.noInstall, logisticaOperator(), wsNoInstall],
    [users.owner, logisticaOperator(), wsImob], [users.other, logisticaOperator(), wsOther],
    [users.reader, logisticaReader(), wsFull], [users.writer, { roleKey: "logistica_escritor", permissions: [LOGISTICA_CONTEXT_SCOPE, ORACULO_PREPARATION_WRITE_SCOPE] }, wsFull],
    [users.writeNoRead, { roleKey: "logistica_sem_contexto", permissions: [ORACULO_PREPARATION_WRITE_SCOPE, ORACULO_CONTENT_REVIEW_SCOPE] }, wsFull],
    [users.revoked, logisticaOperator(), wsFull],
  ] as const) await ensureLogisticaMember(prismaGlobal, { tenantId: workspaceId === wsOther ? otherTenantId : tenantId, workspaceId, userId, ...grants });
  await prismaGlobal.$executeRaw`UPDATE eiah_workspace_memberships SET status='revoked' WHERE tenant_id=${tenantId} AND workspace_id=${wsFull} AND user_id=${users.revoked}`;
  const tokens: Array<[string, string, string, string]> = [
    ["owner", tenantId, wsFull, users.owner], ["member", tenantId, wsFull, users.member], ["unlinked", tenantId, wsFull, users.unlinked],
    ["bMember", tenantId, wsNoInstall, users.bMember], ["other", otherTenantId, wsOther, users.other],
    ["imobUnlinked", tenantId, wsImob, users.imobUnlinked], ["noPolicy", tenantId, wsNoPolicy, users.noPolicy],
    ["noApproval", tenantId, wsNoApproval, users.noApproval], ["noInstall", tenantId, wsNoInstall, users.noInstall],
    ["reader", tenantId, wsFull, users.reader], ["readerOtherWs", tenantId, wsFull2, users.reader], ["writer", tenantId, wsFull, users.writer],
    ["writeNoRead", tenantId, wsFull, users.writeNoRead], ["revoked", tenantId, wsFull, users.revoked], ["unlinked2", tenantId, wsFull, users.unlinked2],
  ];
  await prismaGlobal.apiToken.createMany({ data: tokens.map(([name, tId, workspaceId, userId]) => ({ token: tk(name), tenantId: tId, workspaceId, userId })) });
  await ensureVerticalAccessStore(prismaGlobal);
  await installAndApprove(wsFull, { install: true, approve: true });
  await installAndApprove(wsNoPolicy, { install: true, approve: true });
  await installAndApprove(wsNoApproval, { install: true, approve: false });
  await installAndApprove(wsImob, { install: true, approve: true });
  await installAndApprove(wsFull2, { install: true, approve: true });
  await prismaGlobal.$executeRaw`INSERT INTO tenant_product_installations (id, tenant_id, workspace_id, product, status, activated_by_user_id) VALUES (${randomUUID()}, ${tenantId}, ${wsImob}, 'IMOB', 'active', ${users.owner})`;
  await grant(wsImob, LOGISTICA_CONTEXT_SCOPE);
  for (const scope of [LOGISTICA_CONTEXT_SCOPE, ORACULO_PREPARATION_WRITE_SCOPE, ORACULO_CONTENT_REVIEW_SCOPE]) { await grant(wsFull, scope); await grant(wsFull2, scope); }
  const created = await request.post(base).set("Authorization", auth(tk("owner"))).send(emptyContext);
  assert.equal(created.status, 201, "o dono cria o caso (preparação)");
  caseId = created.body.data.caseId;
});

after(async () => { await prismaGlobal.$disconnect(); });

test("S01 — vínculo ausente: sem vínculo o contexto, a lista e o caso são negados (e a negação não cria vínculo)", async () => {
  assert.deepEqual(await membership(users.unlinked, wsFull), []);
  const ctx = await session(tk("unlinked"));
  assert.equal(ctx.status, 403);
  assert.equal(ctx.body.error.capability.reason, "membership_required");
  assert.equal((await request.get(base).set("Authorization", auth(tk("unlinked")))).status, 403);
  assert.equal((await request.get(`${base}/${caseId}`).set("Authorization", auth(tk("unlinked")))).status, 403);
  assert.equal((await request.post(base).set("Authorization", auth(tk("unlinked"))).send(emptyContext)).status, 403);
  assert.deepEqual(await membership(users.unlinked, wsFull), [], "as negações não criaram vínculo");
});

test("S02 — leitura de registry/handoff nunca cria vínculo (workspace com e sem IMOB instalado)", async () => {
  for (const [token, userId, workspaceId] of [[tk("unlinked"), users.unlinked, wsFull], [tk("imobUnlinked"), users.imobUnlinked, wsImob]] as const) {
    assert.deepEqual(await membership(userId, workspaceId), []);
    for (let i = 0; i < 2; i += 1) {
      assert.equal((await request.get("/api/chat/vertical-registry").set("Authorization", auth(token))).status, 200);
      const hand = await handoffLog(token);
      assert.deepEqual(hand.body.data, { ok: false, reasonCode: "VERTICAL_DISABLED" }, `handoff da Logística negado (${workspaceId})`);
    }
    assert.deepEqual(await membership(userId, workspaceId), [], `nenhum vínculo criado em ${workspaceId}`);
    assert.equal((await session(token)).status, 403);
  }
  // handoff para o IMOB e perfil legado continuam como antes (comportamento do IMOB preservado): ver teste de preservação
});

test("AUTHZ-IMOB-HANDOFF-001: o handoff PARA o IMOB só LÊ o vínculo ativo (não cria); o perfil legado, fora do handoff, segue sendo o onboarding existente", async () => {
  const scope = { tenantId, workspaceId: wsImob, userId: users.imobUnlinked };
  const without = await readVerticalRegistryFacts(prismaGlobal as never, scope);
  assert.equal(without.imob.userCanUse, false, "consulta do registry não lê o perfil");
  assert.deepEqual(await membership(users.imobUnlinked, wsImob), []);
  const handoffRead = await readVerticalRegistryFacts(prismaGlobal as never, scope, { resolveImobPermission: true });
  assert.equal(handoffRead.imob.userCanUse, false, "sem vínculo ativo o handoff nega");
  assert.deepEqual(await membership(users.imobUnlinked, wsImob), [], "o handoff não cria vínculo");
  const profile = await readWorkspaceResponsibleProfile({ tenantId, workspaceId: wsImob, userId: users.imobUnlinked });
  assert.ok(profile.permissions.includes("imob.chat.use"), "perfil legado: o vínculo é criado com a função padrão do IMOB");
  assert.equal((await membership(users.imobUnlinked, wsImob)).length, 1);
  const withProfile = await readVerticalRegistryFacts(prismaGlobal as never, scope, { resolveImobPermission: true });
  assert.equal(withProfile.imob.userCanUse, true, "com vínculo ativo existente, o handoff usa a permissão (somente leitura)");
  // o vínculo já existe (criado pelo onboarding legado acima, não pelo handoff): leitura repetida não o altera
  const scope2 = { tenantId, workspaceId: wsImob, userId: users.imobUnlinked };
  assert.equal((await readVerticalRegistryFacts(prismaGlobal as never, scope2, { resolveImobPermission: true })).imob.userCanUse, true);
});

test("S04/S05/S06 — produto, liberação e política são exigidos além do vínculo explícito", async () => {
  const noInstall = await session(tk("noInstall"));
  assert.equal(noInstall.status, 403);
  assert.equal(noInstall.body.error.capability.reason, "installation_missing");
  const noApproval = await session(tk("noApproval"));
  assert.equal(noApproval.status, 403);
  assert.equal(noApproval.body.error.capability.reason, "approval_required");
  const noPolicy = await session(tk("noPolicy"));
  assert.equal(noPolicy.status, 403);
  assert.equal(noPolicy.body.error.capability.reason, "policy_denied");
  for (const token of [tk("noInstall"), tk("noApproval"), tk("noPolicy")]) {
    assert.equal((await request.get(base).set("Authorization", auth(token))).status, 403);
    assert.equal((await handoffLog(token)).body.data.ok, false);
  }
});

test("S06b — sem a política exata de escrita a preparação é negada mesmo com acesso ao contexto", async () => {
  await grant(wsNoPolicy, LOGISTICA_CONTEXT_SCOPE);
  assert.equal((await session(tk("noPolicy"))).status, 200, "contexto liberado");
  const write = await request.post(base).set("Authorization", auth(tk("noPolicy"))).send(emptyContext);
  assert.equal(write.status, 403);
  assert.equal(write.body.error.code, "ORACULO_PREPARATION_WRITE_DENIED");
  assert.equal((await request.get(base).set("Authorization", auth(tk("noPolicy")))).status, 200, "leitura continua permitida");
});

test("S07 — usuário de outro workspace (token do outro workspace) não acessa o caso", async () => {
  assert.deepEqual(await membership(users.bMember, wsFull), []);
  const res = await request.get(`${base}/${caseId}`).set("Authorization", auth(tk("bMember")));
  assert.ok([403, 404].includes(res.status), `status ${res.status}`);
  assert.equal(JSON.stringify(res.body).includes(caseId), false);
  assert.equal((await request.get(base).set("Authorization", auth(tk("bMember")))).status, 403);
});

test("S08 — usuário de outro tenant não acessa o caso, documentos ou evidências", async () => {
  for (const path of [`${base}/${caseId}`, `${base}/${caseId}/evidence`, `${base}/${caseId}/revisions`, `${base}/${caseId}/document-reviews`, base]) {
    const res = await request.get(path).set("Authorization", auth(tk("other")));
    assert.ok([403, 404].includes(res.status), `${path}: ${res.status}`);
    assert.equal(JSON.stringify(res.body).includes(caseId), false);
  }
  const forged = await request.get(`${base}/${caseId}`).set("Authorization", auth(tk("other"))).set("x-tenant-id", tenantId).set("x-workspace-id", wsFull);
  assert.ok([403, 404].includes(forged.status), "cabeçalhos forjados não mudam o escopo");
  assert.equal((await handoffLog(tk("other"))).body.data.ok, false);
});

test("S09 — vínculo explícito válido consulta o caso dentro das suas políticas", async () => {
  const ctx = await session(tk("member"));
  assert.equal(ctx.status, 200);
  assert.equal(ctx.body.data.capabilities.logisticaContext.executionAllowed, false);
  assert.equal((await handoffLog(tk("member"))).body.data.ok, true);
  const got = await request.get(`${base}/${caseId}`).set("Authorization", auth(tk("member")));
  assert.equal(got.status, 200);
  assert.equal(got.body.data.caseId, caseId);
  await prismaGlobal.$executeRaw`UPDATE eiah_workspace_memberships SET status='inactive' WHERE tenant_id=${tenantId} AND workspace_id=${wsFull} AND user_id=${users.member}`;
  assert.equal((await session(tk("member"))).status, 403, "vínculo desativado bloqueia");
  assert.equal((await request.get(`${base}/${caseId}`).set("Authorization", auth(tk("member")))).status, 403);
  await prismaGlobal.$executeRaw`UPDATE eiah_workspace_memberships SET status='active' WHERE tenant_id=${tenantId} AND workspace_id=${wsFull} AND user_id=${users.member}`;
});

// S03 — vínculo implícito (bootstrap legado) não comprova aprovação humana: sem capacidade gravada no próprio vínculo, a Logística é negada.
test("S03 — vínculo criado implicitamente pelo comportamento legado do IMOB não concede a Logística por si só", async () => {
  assert.deepEqual(await membership(users.unlinked, wsFull), []);
  // qualquer rota legada que lê o perfil cria o vínculo: aqui o perfil, como faz `canUserActivateProducts` (ativação, billing, perfil, uploads…)
  await readWorkspaceResponsibleProfile({ tenantId, workspaceId: wsFull, userId: users.unlinked });
  assert.equal((await membership(users.unlinked, wsFull)).length, 1, "o vínculo legado foi criado");
  const stored = await storedPermissions(users.unlinked, wsFull);
  assert.ok(stored.length > 0 && stored.every((permission) => !permission.startsWith("log.")), `o vínculo implícito não carrega capacidade da Logística: ${JSON.stringify(stored)}`);
  const ctx = await session(tk("unlinked"));
  assert.equal(ctx.status, 403, "o vínculo implícito não basta");
  assert.equal(ctx.body.error.capability.reason, "membership_required");
  assert.equal((await request.get(`${base}/${caseId}`).set("Authorization", auth(tk("unlinked")))).status, 403, "o caso continua inacessível");
  assert.equal((await request.get(base).set("Authorization", auth(tk("unlinked")))).status, 403);
  assert.equal((await request.post(base).set("Authorization", auth(tk("unlinked"))).send(emptyContext)).status, 403, "e nada é escrito");
  assert.equal(await canAccessOraculoUploads(prismaGlobal as never, { tenantId, workspaceId: wsFull, userId: users.unlinked }, false), false, "nem uploads (leitura)");
  assert.equal(await canAccessOraculoUploads(prismaGlobal as never, { tenantId, workspaceId: wsFull, userId: users.unlinked }, true), false, "nem uploads (escrita)");
});

test("S10 — leitura e escrita são capacidades separadas: ler não escreve; escrever sem o contexto é negado; escrever não revisa", async () => {
  const reader = tk("reader"), writer = tk("writer"), writeNoRead = tk("writeNoRead");
  assert.equal((await session(reader)).status, 200);
  assert.equal((await request.get(`${base}/${caseId}`).set("Authorization", auth(reader))).status, 200, "leitor lê o caso");
  const readerWrite = await request.post(base).set("Authorization", auth(reader)).send(emptyContext);
  assert.equal(readerWrite.status, 403, "a política do workspace permite escrever, mas o leitor não tem a capacidade de escrita");
  assert.equal(readerWrite.body.error.code, "ORACULO_PREPARATION_WRITE_DENIED");
  assert.equal(await canAccessOraculoUploads(prismaGlobal as never, { tenantId, workspaceId: wsFull, userId: users.reader }, false), true);
  assert.equal(await canAccessOraculoUploads(prismaGlobal as never, { tenantId, workspaceId: wsFull, userId: users.reader }, true), false);
  const noContext = await session(writeNoRead);
  assert.equal(noContext.status, 403, "escrita/revisão sem a capacidade de contexto não abre a Logística");
  assert.equal(noContext.body.error.capability.reason, "membership_required");
  assert.equal((await request.get(base).set("Authorization", auth(writeNoRead))).status, 403);
  assert.equal((await request.post(base).set("Authorization", auth(writeNoRead)).send(emptyContext)).status, 403);
  assert.equal((await request.post(base).set("Authorization", auth(writer)).send(emptyContext)).status, 201, "quem tem contexto + escrita cria");
  assert.equal(await canAccessOraculoUploads(prismaGlobal as never, { tenantId, workspaceId: wsFull, userId: users.writer }, true), true);
  const review = await request.post(`${base}/${caseId}/document-reviews`).set("Authorization", auth(writer)).send({});
  assert.equal(review.status, 403, "escrever não é revisar o conteúdo");
  assert.equal(review.body.error.subreason, "content_review_policy_denied");
});

test("S11 — vínculo revogado, mesmo com a capacidade ainda gravada, não acessa a Logística", async () => {
  assert.deepEqual((await membership(users.revoked, wsFull)).map((row) => row.status), ["revoked"]);
  assert.ok((await storedPermissions(users.revoked, wsFull)).includes(LOGISTICA_CONTEXT_SCOPE), "a capacidade segue gravada (histórico)");
  const ctx = await session(tk("revoked"));
  assert.equal(ctx.status, 403);
  assert.equal(ctx.body.error.capability.reason, "membership_required");
  assert.equal((await request.get(`${base}/${caseId}`).set("Authorization", auth(tk("revoked")))).status, 403);
  assert.equal((await request.post(base).set("Authorization", auth(tk("revoked"))).send(emptyContext)).status, 403);
  assert.equal(await canAccessOraculoUploads(prismaGlobal as never, { tenantId, workspaceId: wsFull, userId: users.revoked }, false), false);
  assert.deepEqual((await membership(users.revoked, wsFull)).map((row) => row.status), ["revoked"], "a negação não reativa o vínculo");
});

test("S12 — a capacidade pertence ao vínculo daquele workspace: não atravessa workspaces nem tenants", async () => {
  // o mesmo usuário (leitor em wsFull) usa um token do wsFull2, que é completo (instalado, liberado, com política), mas onde ele não tem vínculo
  assert.deepEqual(await membership(users.reader, wsFull2), []);
  const other = await session(tk("readerOtherWs"));
  assert.equal(other.status, 403);
  assert.equal(other.body.error.capability.reason, "membership_required");
  assert.deepEqual(await membership(users.reader, wsFull2), [], "a negação não criou vínculo no outro workspace");
  assert.equal(await canAccessOraculoUploads(prismaGlobal as never, { tenantId, workspaceId: wsFull2, userId: users.reader }, false), false);
  // membro com todas as capacidades em OUTRO tenant não acessa o caso deste (S08 cobre rotas e cabeçalhos forjados); a identidade do outro tenant nega no resolvedor
  assert.equal(await canAccessOraculoUploads(prismaGlobal as never, { tenantId, workspaceId: wsFull, userId: users.other }, false), false);
});

test("S13 — nenhuma leitura cria autoridade: registry, sessão, handoff e listas não criam vínculo nem capacidade", async () => {
  assert.deepEqual(await membership(users.unlinked2, wsFull), []);
  for (let i = 0; i < 2; i += 1) {
    assert.equal((await request.get("/api/chat/vertical-registry").set("Authorization", auth(tk("unlinked2")))).status, 200);
    assert.equal((await handoffLog(tk("unlinked2"))).body.data.ok, false);
    assert.equal((await session(tk("unlinked2"))).status, 403);
    assert.equal((await request.get(base).set("Authorization", auth(tk("unlinked2")))).status, 403);
  }
  assert.deepEqual(await membership(users.unlinked2, wsFull), [], "nenhum vínculo foi criado por leituras");
});
