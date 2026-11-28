import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import express from "express";
import supertest from "supertest";
import { prismaGlobal } from "@repo/db";

import { chatVerticalsRouter } from "../routes/chatVerticals";
import { profileRouter } from "../routes/profile";
import { sessionRouter } from "../routes/session";
import { extractFrictionEventFromAuditMetadata } from "../services/frictionEventAggregator";
import { WORKSPACE_SWITCH_POLICY_VERSION, WORKSPACE_SWITCH_SHADOW_ENV_KEY, WORKSPACE_SWITCH_SHADOW_EVENT_TYPE } from "../services/workspaceSwitchAuthorization";
import { ensureWorkspaceMembershipForUser, ensureWorkspaceResponsibilityStore } from "../services/workspaceResponsibility";

// EIAH-AUTHZ-SESSION-WORKSPACE-G2 — modo sombra de `POST /session/workspace` (PostgreSQL real descartável, dados sintéticos).
// Distingue SEMPRE: (a) o que a política FUTURA decidiria (evento no ledger) e (b) o que a rota atual FEZ (resposta). G2 apenas observa:
// o comportamento legado é preservado e o modo sombra aceita um vínculo criado por bootstrap (a tabela não guarda procedência).
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
const tenantId = `g2-t-${id}`, otherTenantId = `g2-o-${id}`;
const wsA = `g2-a-${id}`, wsB = `g2-b-${id}`, wsOther = `g2-x-${id}`;
const U = {
  member: `member-${id}`, onlyA: `onlya-${id}`, inactive: `inactive-${id}`, revoked: `revoked-${id}`, legacy: `legacy-${id}`,
  none: `none-${id}`, selfDeclared: `selfdecl-${id}`, expired: `expired-${id}`, revokedToken: `revtok-${id}`, repeat: `repeat-${id}`,
  reuse: `reuse-${id}`, off: `off-${id}`, e2: `e2-${id}`, unlinked: `unlinked-${id}`, other: `other-${id}`, owner: `owner-${id}`,
  ledgerFail: `ledgerfail-${id}`, svc: `svc-${id}`, flagOff: `flagoff-${id}`, prod: `prod-${id}`,
};
const tk = (name: string) => `syn-${name}-${id}`;
const auth = (token: string) => `Bearer ${token}`;
const app = express();
app.use(express.json());
app.use("/api", sessionRouter, chatVerticalsRouter, profileRouter);
const request = supertest(app);
const switchTo = (token: string, workspaceId: unknown) => request.post("/api/session/workspace").set("Authorization", auth(token)).send({ workspaceId });

async function withShadow<T>(enabled: boolean, fn: () => Promise<T>) {
  const previous = process.env[WORKSPACE_SWITCH_SHADOW_ENV_KEY];
  if (enabled) process.env[WORKSPACE_SWITCH_SHADOW_ENV_KEY] = "true"; else delete process.env[WORKSPACE_SWITCH_SHADOW_ENV_KEY];
  try { return await fn(); }
  finally { if (previous === undefined) delete process.env[WORKSPACE_SWITCH_SHADOW_ENV_KEY]; else process.env[WORKSPACE_SWITCH_SHADOW_ENV_KEY] = previous; }
}
const events = async (actor?: string) => {
  const rows = await prismaGlobal.guardrailAuditLedger.findMany({ where: { tenantId, eventType: WORKSPACE_SWITCH_SHADOW_EVENT_TYPE }, orderBy: { createdAt: "asc" } });
  return rows.filter((row) => !actor || (row.metadata as { actorUserId?: string | null } | null)?.actorUserId === actor);
};
const meta = (row: { metadata: unknown }) => row.metadata as { shadow: { wouldAllow: boolean; reasonCode: string; evidence: string }; legacy: { outcome: string; tokenAction?: string }; targetWorkspaceId: string | null; correlationId: string; policyVersion: string; operational: boolean; enforced: boolean; actorUserId: string | null };
const membershipRows = async (userId: string, workspaceId: string) =>
  prismaGlobal.$queryRaw<Array<{ status: string; role_key: string }>>`SELECT status, role_key FROM eiah_workspace_memberships WHERE tenant_id=${tenantId} AND workspace_id=${workspaceId} AND user_id=${userId}`;
async function snapshot() {
  const count = async (sql: string) => Number((await prismaGlobal.$queryRawUnsafe<Array<{ n: bigint }>>(sql, tenantId))[0]!.n);
  const optional = async (table: string) => (await prismaGlobal.$queryRawUnsafe<Array<{ r: string | null }>>(`SELECT to_regclass('public.${table}')::text AS r`))[0]!.r ? count(`SELECT COUNT(*)::bigint AS n FROM ${table} WHERE tenant_id = $1`) : 0;
  return {
    memberships: await count("SELECT COUNT(*)::bigint AS n FROM eiah_workspace_memberships WHERE tenant_id = $1"),
    roleCatalog: await optional("eiah_workspace_roles"),
    legacyAssignments: await optional("eiah_workspace_role_assignments"),
    designations: await optional("eiah_commercial_authority_designations"),
    policies: await count("SELECT COUNT(*)::bigint AS n FROM tenant_action_policy WHERE tenant_id = $1"),
    installations: await count("SELECT COUNT(*)::bigint AS n FROM tenant_product_installations WHERE tenant_id = $1"),
    agentAssignments: await count(`SELECT COUNT(*)::bigint AS n FROM workspace_agent_assignments WHERE tenant_id = $1`).catch(() => 0),
    tokens: await count("SELECT COUNT(*)::bigint AS n FROM api_tokens WHERE tenant_id = $1"),
  };
}
const withoutTokens = (s: Awaited<ReturnType<typeof snapshot>>) => { const { tokens: _x, ...rest } = s; return rest; };

before(async () => {
  await prismaGlobal.tenant.createMany({ data: [{ id: tenantId, name: "G2 tenant" }, { id: otherTenantId, name: "G2 other" }] });
  await prismaGlobal.workspace.createMany({ data: [{ id: wsA, tenantId, name: "A" }, { id: wsB, tenantId, name: "B" }, { id: wsOther, tenantId: otherTenantId, name: "X" }] });
  const people = Object.entries(U).filter(([k]) => k !== "svc");
  await prismaGlobal.user.createMany({ data: people.map(([k, userId]) => ({ id: userId, tenantId: k === "other" ? otherTenantId : tenantId, email: `g2-${k}-${id}@example.com` })) });
  await ensureWorkspaceResponsibilityStore(prismaGlobal);
  // vínculos EXPLÍCITOS (mesmo caminho do onboarding/convite)
  const explicit: Array<[string, string, string]> = [
    [U.member, "corretor", wsA], [U.member, "corretor", wsB], [U.onlyA, "corretor", wsA], [U.inactive, "corretor", wsA], [U.inactive, "corretor", wsB],
    [U.revoked, "corretor", wsA], [U.revoked, "corretor", wsB], [U.legacy, "corretor", wsA], [U.none, "corretor", wsA], [U.selfDeclared, "corretor", wsA],
    [U.expired, "corretor", wsA], [U.revokedToken, "corretor", wsA], [U.repeat, "corretor", wsA], [U.reuse, "corretor", wsA], [U.off, "corretor", wsA],
    [U.e2, "corretor", wsA], [U.ledgerFail, "corretor", wsA], [U.flagOff, "corretor", wsA], [U.prod, "corretor", wsA], [U.owner, "founder", wsA], [U.owner, "founder", wsB],
  ];
  for (const [userId, roleKey, workspaceId] of explicit) await ensureWorkspaceMembershipForUser({ tenantId, workspaceId, userId, roleKey });
  await ensureWorkspaceMembershipForUser({ tenantId: otherTenantId, workspaceId: wsOther, userId: U.other, roleKey: "founder" });
  await prismaGlobal.$executeRaw`UPDATE eiah_workspace_memberships SET status='inactive' WHERE tenant_id=${tenantId} AND workspace_id=${wsB} AND user_id=${U.inactive}`;
  await prismaGlobal.$executeRaw`UPDATE eiah_workspace_memberships SET status='revoked' WHERE tenant_id=${tenantId} AND workspace_id=${wsB} AND user_id=${U.revoked}`;
  await prismaGlobal.$executeRaw`INSERT INTO eiah_workspace_role_assignments (user_id, tenant_id, workspace_id, role_key) VALUES (${U.legacy}, ${tenantId}, ${wsB}, 'corretor')`;
  const t = (name: string, userId: string | null, workspaceId = wsA, extra: Record<string, unknown> = {}) => ({ token: tk(name), tenantId: name === "other" ? otherTenantId : tenantId, workspaceId: name === "other" ? wsOther : workspaceId, userId, ...extra });
  await prismaGlobal.apiToken.createMany({ data: [
    t("member", U.member), t("onlyA", U.onlyA), t("inactive", U.inactive), t("revoked", U.revoked), t("legacy", U.legacy), t("none", U.none),
    t("selfDeclared", U.selfDeclared), t("expired", U.expired, wsA, { expiresAt: new Date(Date.now() - 60_000) }), t("revokedToken", U.revokedToken, wsA, { revoked: true }),
    t("repeat", U.repeat), t("reuse", U.reuse), t("off", U.off), t("e2", U.e2), t("unlinked", U.unlinked, wsA), t("other", U.other), t("owner", U.owner),
    t("ledgerFail", U.ledgerFail), t("svc", null), t("flagOff", U.flagOff), t("prod", U.prod),
    // token de OUTRA origem já existente no destino (integração): a rota legada o devolve (reuso)
    { token: tk("reuse-dest"), tenantId, workspaceId: wsB, userId: U.reuse, description: "Integration token" },
  ] });
});
after(async () => { await prismaGlobal.$disconnect(); });

test("T17 — desligado por padrão: nenhuma observação, comportamento legado idêntico; flag fora de ambiente local também não liga", async () => {
  await withShadow(false, async () => {
    const before = (await events()).length;
    const res = await switchTo(tk("flagOff"), wsB);
    assert.equal(res.status, 200);
    assert.equal((await events()).length, before, "sem flag: 0 eventos");
  });
  const previousEnv = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "production";
    await withShadow(true, async () => {
      const before = (await events()).length;
      assert.equal((await switchTo(tk("prod"), wsB)).status, 200);
      assert.equal((await events()).length, before, "NODE_ENV=production: nunca liga");
    });
  } finally { process.env.NODE_ENV = previousEnv; }
});

test("T1 — troca autorizada (vínculo ativo nos dois): política futura PERMITIRIA e a rota atual permitiu", async () => {
  await withShadow(true, async () => {
    const res = await switchTo(tk("member"), wsB);
    assert.equal(res.status, 200, "resultado operacional atual");
    assert.equal(res.body.data.workspaceId, wsB);
    const [event] = (await events(U.member)).slice(-1);
    assert.ok(event);
    assert.deepEqual(meta(event).shadow, { wouldAllow: true, reasonCode: "MEMBERSHIP_ACTIVE", evidence: "membership" });
    assert.equal(meta(event).legacy.outcome, "allowed");
    assert.equal(meta(event).policyVersion, WORKSPACE_SWITCH_POLICY_VERSION);
    assert.equal(meta(event).operational, false);
    assert.equal(meta(event).enforced, false);
  });
});

test("T2/T8 — sem vínculo no destino: política futura BLOQUEARIA, a rota atual PERMITE e nada é criado pela avaliação", async () => {
  await withShadow(true, async () => {
    const before = await snapshot();
    assert.deepEqual(await membershipRows(U.onlyA, wsB), []);
    const res = await switchTo(tk("onlyA"), wsB);
    assert.equal(res.status, 200, "comportamento atual inalterado: a troca é concedida");
    const after = await snapshot();
    assert.deepEqual(withoutTokens(after), withoutTokens(before), "nenhum vínculo/papel/política/instalação/designação criado");
    assert.equal(after.tokens, before.tokens + 1, "o único efeito é o token que a rota legada já emitia");
    assert.deepEqual(await membershipRows(U.onlyA, wsB), [], "a avaliação não criou vínculo (sem bootstrap)");
    const [event] = (await events(U.onlyA)).slice(-1);
    assert.deepEqual(meta(event!).shadow, { wouldAllow: false, reasonCode: "MEMBERSHIP_REQUIRED", evidence: "none" });
    assert.deepEqual(meta(event!).legacy, { outcome: "allowed", tokenAction: "created" });
  });
});

test("T3/T4 — vínculo inativo ou revogado: política futura bloquearia; rota atual permite", async () => {
  await withShadow(true, async () => {
    for (const user of [U.inactive, U.revoked]) {
      const res = await switchTo(tk(user === U.inactive ? "inactive" : "revoked"), wsB);
      assert.equal(res.status, 200);
      const [event] = (await events(user)).slice(-1);
      assert.deepEqual(meta(event!).shadow, { wouldAllow: false, reasonCode: "MEMBERSHIP_NOT_ACTIVE", evidence: "none" });
    }
  });
});

test("T5/T7 — outro tenant e inexistente: 403 idêntico, observação idêntica (sem enumeração)", async () => {
  await withShadow(true, async () => {
    const other = await switchTo(tk("member"), wsOther);
    const missing = await switchTo(tk("member"), `inexistente-${id}`);
    assert.equal(other.status, 403);
    assert.deepEqual(other.body, missing.body, "mesmo corpo");
    assert.equal(other.body.error.code, "WORKSPACE_FORBIDDEN");
    const [a, b] = (await events(U.member)).slice(-2);
    assert.deepEqual(meta(a!).shadow, { wouldAllow: false, reasonCode: "WORKSPACE_FORBIDDEN", evidence: "none" });
    assert.deepEqual(meta(a!).shadow, meta(b!).shadow);
    assert.deepEqual(meta(a!).legacy, { outcome: "forbidden_workspace" });
    // usuário de OUTRO tenant tentando trocar para o workspace do tenant da plataforma
    const reverse = await switchTo(tk("other"), wsA);
    assert.equal(reverse.status, 403);
  });
});

test("T6 — token sem identidade humana: política futura bloquearia (IDENTITY_REQUIRED); rota atual ainda emite token de serviço", async () => {
  await withShadow(true, async () => {
    const res = await switchTo(tk("svc"), wsB);
    assert.equal(res.status, 200, "legado: automação troca de workspace");
    assert.equal(res.body.data.userId, null);
    const [event] = (await events()).slice(-1);
    assert.deepEqual(meta(event!).shadow, { wouldAllow: false, reasonCode: "IDENTITY_REQUIRED", evidence: "none" });
    assert.equal(meta(event!).actorUserId, null);
  });
});

test("T9 — função autodeclarada 'Founder' no perfil não admite: política futura bloqueia e nada é criado", async () => {
  await withShadow(true, async () => {
    const put = await request.put("/api/profile/me").set("Authorization", auth(tk("selfDeclared"))).send({ role: "Founder" });
    assert.ok([200, 204].includes(put.status), `perfil gravado (${put.status})`);
    const before = await snapshot();
    const res = await switchTo(tk("selfDeclared"), wsB);
    assert.equal(res.status, 200);
    const after = await snapshot();
    assert.deepEqual(withoutTokens(after), withoutTokens(before));
    assert.deepEqual(await membershipRows(U.selfDeclared, wsB), []);
    const [event] = (await events(U.selfDeclared)).slice(-1);
    assert.deepEqual(meta(event!).shadow, { wouldAllow: false, reasonCode: "MEMBERSHIP_REQUIRED", evidence: "none" });
  });
});

test("T10/T11 — atribuição legada explícita: válida permitiria; inexistente bloqueia", async () => {
  await withShadow(true, async () => {
    assert.equal((await switchTo(tk("legacy"), wsB)).status, 200);
    const [valid] = (await events(U.legacy)).slice(-1);
    assert.deepEqual(meta(valid!).shadow, { wouldAllow: true, reasonCode: "LEGACY_ASSIGNMENT", evidence: "legacy_assignment" });
    assert.equal((await switchTo(tk("none"), wsB)).status, 200);
    const [absent] = (await events(U.none)).slice(-1);
    assert.deepEqual(meta(absent!).shadow, { wouldAllow: false, reasonCode: "MEMBERSHIP_REQUIRED", evidence: "none" });
    assert.deepEqual(await membershipRows(U.legacy, wsB), [], "a atribuição legada não vira vínculo");
  });
});

test("T12 — token expirado ou revogado: 401 e nenhuma observação (sem escopo confiável)", async () => {
  await withShadow(true, async () => {
    const before = (await events()).length;
    assert.equal((await switchTo(tk("expired"), wsB)).status, 401);
    assert.equal((await switchTo(tk("revokedToken"), wsB)).status, 401);
    assert.equal((await switchTo("token-inexistente", wsB)).status, 401);
    assert.equal((await events()).length, before);
  });
});

test("T13 e tentativa repetida — reutilização: a rota atual devolve até token de outra origem; repetir reutiliza o da troca", async () => {
  await withShadow(true, async () => {
    const first = await switchTo(tk("reuse"), wsB);
    assert.equal(first.status, 200);
    assert.equal(first.body.data.token, tk("reuse-dest"), "legado: devolve o token de integração já existente");
    const [reused] = (await events(U.reuse)).slice(-1);
    assert.deepEqual(meta(reused!).legacy, { outcome: "allowed", tokenAction: "reused_other_origin" });
    const a = await switchTo(tk("repeat"), wsB);
    const b = await switchTo(tk("repeat"), wsB);
    assert.equal(a.body.data.token, b.body.data.token, "mesma troca, mesmo token");
    const [e1, e2] = (await events(U.repeat)).slice(-2);
    assert.deepEqual(meta(e1!).legacy, { outcome: "allowed", tokenAction: "created" });
    assert.deepEqual(meta(e2!).legacy, { outcome: "allowed", tokenAction: "reused_switch_token" });
    assert.notEqual(meta(e1!).correlationId, meta(e2!).correlationId);
    assert.deepEqual(meta(e1!).shadow, meta(e2!).shadow, "mesma decisão");
  });
});

test("T14 — auditoria: campos, sem credenciais, não confundível com concessão nem com evento de fricção", async () => {
  await withShadow(true, async () => {
    const res = await switchTo(tk("onlyA"), wsB);
    const [event] = (await events(U.onlyA)).slice(-1);
    assert.equal(event!.eventType, WORKSPACE_SWITCH_SHADOW_EVENT_TYPE);
    assert.equal(event!.severity, "info");
    assert.equal(event!.workspaceId, wsA, "workspace da origem");
    assert.ok(event!.createdAt instanceof Date);
    const serialized = JSON.stringify(event);
    for (const secret of [res.body.data.token, tk("onlyA"), "Bearer"]) assert.equal(serialized.includes(secret), false, "sem token/segredo");
    assert.equal(meta(event!).actorUserId, U.onlyA);
    assert.equal(meta(event!).targetWorkspaceId, wsB);
    assert.equal(/allowed|denied|grant/i.test(event!.eventType), false, "o tipo não parece decisão/concessão");
    assert.equal(extractFrictionEventFromAuditMetadata(event!.metadata), null, "não é lido como evento de fricção");
    const operational = await prismaGlobal.guardrailAuditLedger.count({ where: { tenantId, eventType: { startsWith: "commercial_authority." } } });
    assert.equal(operational, 0, "nenhum evento de autoridade/concessão");
  });
});

test("T15 — sem vazamento: o token da troca só enxerga o destino; o de origem continua na origem", async () => {
  await withShadow(true, async () => {
    const res = await switchTo(tk("member"), wsB);
    const ctxB = await request.get("/api/session/context").set("Authorization", auth(res.body.data.token));
    assert.equal(ctxB.body.data.workspaceId, wsB);
    const ctxA = await request.get("/api/session/context").set("Authorization", auth(tk("member")));
    assert.equal(ctxA.body.data.workspaceId, wsA);
  });
});

test("equivalência — mesma resposta operacional com o modo sombra ligado e desligado (inclusive payload inválido)", async () => {
  const shape = (res: { status: number; body: { ok?: boolean; data?: Record<string, unknown>; error?: { code?: string } } }) => ({
    status: res.status, ok: res.body.ok, keys: Object.keys(res.body.data ?? {}).sort(), code: res.body.error?.code,
  });
  const off = await withShadow(false, async () => ({
    allowed: shape(await switchTo(tk("off"), wsB)), forbidden: shape(await switchTo(tk("off"), wsOther)), invalid: shape(await switchTo(tk("off"), "")), missing: shape(await switchTo(tk("off"), undefined)),
  }));
  const on = await withShadow(true, async () => ({
    allowed: shape(await switchTo(tk("off"), wsB)), forbidden: shape(await switchTo(tk("off"), wsOther)), invalid: shape(await switchTo(tk("off"), "")), missing: shape(await switchTo(tk("off"), undefined)),
  }));
  assert.deepEqual(on, off);
  assert.equal(on.invalid.status, 400);
  const invalidEvents = (await events(U.off)).filter((row) => meta(row).legacy.outcome === "rejected_payload");
  assert.ok(invalidEvents.length >= 2);
  assert.deepEqual(meta(invalidEvents[0]!).shadow, { wouldAllow: false, reasonCode: "TARGET_INVALID", evidence: "none" });
});

test("falha do ledger: a rota atual responde igual e a negativa/permissão nunca depende da observabilidade", async () => {
  await withShadow(true, async () => {
    await prismaGlobal.$executeRawUnsafe('ALTER TABLE guardrail_audit_ledger RENAME TO guardrail_audit_ledger_g2_off');
    try {
      const res = await switchTo(tk("ledgerFail"), wsB);
      assert.equal(res.status, 200, "legado inalterado mesmo sem ledger");
      assert.equal(res.body.data.workspaceId, wsB);
      const denied = await switchTo(tk("ledgerFail"), wsOther);
      assert.equal(denied.status, 403, "negativa legada preservada");
    } finally {
      await prismaGlobal.$executeRawUnsafe('ALTER TABLE guardrail_audit_ledger_g2_off RENAME TO guardrail_audit_ledger');
    }
    assert.equal((await events(U.ledgerFail)).length, 0, "nenhum evento foi gravado enquanto o ledger falhava");
  });
});

test("T16 — o comportamento legado é preservado (G2 apenas observa); a sombra o observa", async () => {
  await withShadow(true, async () => {
    // E2: membro só da origem troca para o destino e uma ação legada (propor ativação) cria o vínculo (bootstrap)
    assert.deepEqual(await membershipRows(U.e2, wsB), []);
    const swEvents = (await events(U.e2)).length;
    const sw = await switchTo(tk("e2"), wsB);
    assert.equal(sw.status, 200, "legado concede a troca");
    assert.deepEqual(await membershipRows(U.e2, wsB), [], "a troca + avaliação sombra não criam vínculo");
    const [switched] = (await events(U.e2)).slice(-1);
    assert.equal((await events(U.e2)).length, swEvents + 1);
    assert.deepEqual(meta(switched!).shadow, { wouldAllow: false, reasonCode: "MEMBERSHIP_REQUIRED", evidence: "none" });
    const preview = await request.post("/api/chat/vertical-activation/preview").set("Authorization", auth(sw.body.data.token)).send({ verticalId: "imob" });
    assert.equal(preview.status, 200);
    const created = await membershipRows(U.e2, wsB);
    assert.equal(created.length, 1, "comportamento legado preservado: ação legada cria vínculo ativo no destino");
    assert.equal(created[0]!.status, "active");
    // limitação: depois do bootstrap a sombra aceita o vínculo, pois a tabela não guarda procedência
    await switchTo(tk("e2"), wsB);
    const [after] = (await events(U.e2)).slice(-1);
    assert.deepEqual(meta(after!).shadow, { wouldAllow: true, reasonCode: "MEMBERSHIP_ACTIVE", evidence: "membership" });
    // E1: token sem vínculo na PRÓPRIA origem, mesma criação legada (fora do alcance da troca)
    assert.deepEqual(await membershipRows(U.unlinked, wsA), []);
    await request.post("/api/chat/vertical-activation/preview").set("Authorization", auth(tk("unlinked"))).send({ verticalId: "imob" });
    assert.equal((await membershipRows(U.unlinked, wsA)).length, 1, "E1 permanece");
  });
});

test("ausência de concessões — nenhuma designação, política, instalação ou promoção criada em todo o arquivo de testes", async () => {
  const snap = await snapshot();
  assert.equal(snap.designations, 0);
  assert.equal(snap.policies, 0);
  assert.equal(snap.installations, 0);
  const founders = await prismaGlobal.$queryRaw<Array<{ user_id: string }>>`SELECT user_id FROM eiah_workspace_memberships WHERE tenant_id=${tenantId} AND role_key='founder' AND user_id <> ${U.owner}`;
  assert.deepEqual(founders, [], "ninguém além do dono explícito virou Founder");
});
