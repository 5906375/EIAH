import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import express from "express";
import supertest from "supertest";
import { prismaGlobal } from "@repo/db";

import { chatVerticalsRouter } from "../routes/chatVerticals";
import { profileRouter } from "../routes/profile";
import { requestLogger } from "../middlewares/requestLogger";
import { extractFrictionEventFromAuditMetadata } from "../services/frictionEventAggregator";
import {
  WORKSPACE_BOOTSTRAP_POLICY_VERSION,
  WORKSPACE_BOOTSTRAP_SHADOW_ENV_KEY,
  WORKSPACE_BOOTSTRAP_SHADOW_EVENT_TYPE,
} from "../services/workspaceBootstrapShadow";
import { ensureWorkspaceMembershipForUser, ensureWorkspaceResponsibilityStore } from "../services/workspaceResponsibility";

// EIAH-AUTHZ-G2.2 — sombra do bootstrap de membership (PostgreSQL real descartável, dados sintéticos).
// Distingue SEMPRE: (a) o que o bootstrap LEGADO fez (resposta e tabelas) e (b) o que a política futura faria (evento no ledger).
// G2.2 apenas observa: o comportamento legado é preservado.
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
const tenantId = `g22-t-${id}`, otherTenantId = `g22-o-${id}`;
const W = { main: `g22-main-${id}`, empty: `g22-empty-${id}`, sole: `g22-sole-${id}`, sole2: `g22-sole2-${id}`, ev: `g22-ev-${id}`, other: `g22-x-${id}` };
const U = {
  owner: `owner-${id}`, member: `member-${id}`, plain: `plain-${id}`, selfDecl: `selfdecl-${id}`, free: `free-${id}`, first: `first-${id}`,
  sole: `sole-${id}`, sole2: `sole2-${id}`, legacy: `legacy-${id}`, creator: `creator-${id}`, activator: `activator-${id}`, invited: `invited-${id}`,
  none: `none-${id}`, existing: `existing-${id}`, ledgerFail: `ledgerfail-${id}`, prod: `prod-${id}`, off: `off-${id}`, other: `other-${id}`, otherOwner: `otherowner-${id}`,
};
const tk = (name: string) => `syn-${name}-${id}`;
const auth = (token: string) => `Bearer ${token}`;
const app = express();
app.use(requestLogger);
app.use(express.json());
app.use("/api", chatVerticalsRouter, profileRouter);
const request = supertest(app);
const getMe = (name: string, traceId?: string) => {
  const req = request.get("/api/profile/me").set("Authorization", auth(tk(name)));
  return traceId ? req.set("x-trace-id", traceId) : req;
};

async function withShadow<T>(enabled: boolean, fn: () => Promise<T>, nodeEnv?: string) {
  const previous = process.env[WORKSPACE_BOOTSTRAP_SHADOW_ENV_KEY];
  const previousEnv = process.env.NODE_ENV;
  if (enabled) process.env[WORKSPACE_BOOTSTRAP_SHADOW_ENV_KEY] = "true"; else delete process.env[WORKSPACE_BOOTSTRAP_SHADOW_ENV_KEY];
  if (nodeEnv) process.env.NODE_ENV = nodeEnv;
  try { return await fn(); }
  finally {
    if (previous === undefined) delete process.env[WORKSPACE_BOOTSTRAP_SHADOW_ENV_KEY]; else process.env[WORKSPACE_BOOTSTRAP_SHADOW_ENV_KEY] = previous;
    process.env.NODE_ENV = previousEnv;
  }
}

type Meta = {
  kind: string; operational: boolean; enforced: boolean; policyVersion: string; correlationId: string; actorUserId: string; tenantId: string; workspaceId: string;
  entryPoint: string | null; origin: { method: string; route: string } | null; observation: "membership_bootstrap" | "sole_member_promotion";
  legacy: Record<string, unknown>; futurePolicy: Record<string, unknown>; difference: Record<string, unknown>;
  evidence: { creatorLedger: boolean; productActivator: boolean; acceptedInvitation: boolean; legacyAssignment: boolean } | null; hasIndependentEvidence: boolean | null;
};
const meta = (row: { metadata: unknown }) => row.metadata as Meta;
const events = async (actor?: string, tenant = tenantId) => {
  const rows = await prismaGlobal.guardrailAuditLedger.findMany({ where: { tenantId: tenant, eventType: WORKSPACE_BOOTSTRAP_SHADOW_EVENT_TYPE }, orderBy: { createdAt: "asc" } });
  return rows.filter((row) => !actor || meta(row).actorUserId === actor);
};
const membershipRows = async (userId: string, workspaceId: string) =>
  prismaGlobal.$queryRaw<Array<{ status: string; role_key: string; permissions: unknown }>>`SELECT status, role_key, permissions FROM eiah_workspace_memberships WHERE tenant_id=${tenantId} AND workspace_id=${workspaceId} AND user_id=${userId}`;
const stateOf = async () => prismaGlobal.$queryRaw<Array<Record<string, unknown>>>`
  SELECT user_id, workspace_id, role_key, permissions::text AS permissions, status, invited_by_user_id FROM eiah_workspace_memberships WHERE tenant_id=${tenantId} ORDER BY workspace_id, user_id`;
async function authoritySnapshot() {
  const count = async (sql: string) => Number((await prismaGlobal.$queryRawUnsafe<Array<{ n: bigint }>>(sql, tenantId))[0]!.n);
  const optional = async (table: string) => (await prismaGlobal.$queryRawUnsafe<Array<{ r: string | null }>>(`SELECT to_regclass('public.${table}')::text AS r`))[0]!.r ? count(`SELECT COUNT(*)::bigint AS n FROM ${table} WHERE tenant_id = $1`) : 0;
  return {
    roleCatalog: await optional("eiah_workspace_roles"),
    legacyAssignments: await optional("eiah_workspace_role_assignments"),
    invitations: await optional("eiah_workspace_invitations"),
    designations: await optional("eiah_commercial_authority_designations"),
    policies: await count("SELECT COUNT(*)::bigint AS n FROM tenant_action_policy WHERE tenant_id = $1"),
    installations: await count("SELECT COUNT(*)::bigint AS n FROM tenant_product_installations WHERE tenant_id = $1"),
    tokens: await count("SELECT COUNT(*)::bigint AS n FROM api_tokens WHERE tenant_id = $1"),
    commercialEvents: await count("SELECT COUNT(*)::bigint AS n FROM guardrail_audit_ledger WHERE tenant_id = $1 AND event_type LIKE 'commercial_authority.%'"),
  };
}
/**
 * Visão operacional da resposta: ignora apenas carimbos de tempo. A lista `members[]` VOLTA a ser comparada (PROFILE-RACE-001):
 * a corrida entre `readCurrentMembership` (que grava) e `listWorkspaceMembers` foi eliminada em `readWorkspaceManagementSummary`.
 */
const stripTimes = (value: unknown): unknown => Array.isArray(value) ? value.map(stripTimes)
  : value && typeof value === "object" ? Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([k]) => !/At$/.test(k)).map(([k, v]) => [k, stripTimes(v)]))
  : value;
const operationalView = (res: { status: number; body: { data?: { workspace?: unknown; role?: unknown } } }) => ({ status: res.status, workspace: stripTimes(res.body.data?.workspace), role: res.body.data?.role });
const setProfileRole = (userId: string, role: string) => prismaGlobal.$executeRaw`
  INSERT INTO eiah_user_profiles (user_id, role, created_at, updated_at) VALUES (${userId}, ${role}, NOW(), NOW())
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role, updated_at = NOW()`;
const dropMembership = (userId: string, workspaceId: string) => prismaGlobal.$executeRaw`DELETE FROM eiah_workspace_memberships WHERE tenant_id=${tenantId} AND workspace_id=${workspaceId} AND user_id=${userId}`;

/** Executa a MESMA operação com a sombra desligada e ligada, repondo o estado inicial entre as duas. */
async function twinRun(actor: string, reset: () => Promise<void>, act: () => Promise<{ status: number; body: { data?: { workspace?: unknown; role?: unknown } } }>) {
  await reset();
  const beforeOff = await authoritySnapshot();
  const eventsOffBefore = (await events(actor)).length;
  const off = await withShadow(false, act);
  const stateOff = await stateOf();
  const deltaOff = await authoritySnapshot();
  const eventsOff = (await events(actor)).length - eventsOffBefore;
  await reset();
  const eventsOnBefore = (await events(actor)).length;
  const on = await withShadow(true, act);
  const stateOn = await stateOf();
  const deltaOn = await authoritySnapshot();
  const newEvents = (await events(actor)).slice(eventsOnBefore);
  return { off, on, stateOff, stateOn, beforeOff, deltaOff, deltaOn, eventsOff, newEvents };
}
const sameOperation = (r: Awaited<ReturnType<typeof twinRun>>) => {
  assert.deepEqual(operationalView(r.on), operationalView(r.off), "mesma resposta operacional com a sombra ligada e desligada");
  assert.deepEqual(r.stateOn, r.stateOff, "mesmo estado de vínculos (o observador não cria nem altera nada)");
  assert.deepEqual({ ...r.deltaOn, tokens: 0 }, { ...r.deltaOff, tokens: 0 }, "nenhuma concessão extra: catálogo, atribuições, convites, designações, políticas, instalações");
  assert.equal(r.eventsOff, 0, "desligada: 0 eventos");
};

before(async () => {
  await prismaGlobal.tenant.createMany({ data: [{ id: tenantId, name: "G22 tenant" }, { id: otherTenantId, name: "G22 other" }] });
  await prismaGlobal.workspace.createMany({ data: [
    ...["main", "empty", "sole", "sole2", "ev"].map((k) => ({ id: W[k as keyof typeof W], tenantId, name: k })),
    { id: W.other, tenantId: otherTenantId, name: "X" },
  ] });
  const people = Object.entries(U);
  await prismaGlobal.user.createMany({ data: people.map(([k, userId]) => ({ id: userId, tenantId: k === "other" || k === "otherOwner" ? otherTenantId : tenantId, email: `g22-${k}-${id}@example.com` })) });
  await ensureWorkspaceResponsibilityStore(prismaGlobal);
  // vínculos EXPLÍCITOS (mesmo caminho do onboarding/convite)
  await ensureWorkspaceMembershipForUser({ tenantId, workspaceId: W.main, userId: U.owner, roleKey: "founder" });
  await ensureWorkspaceMembershipForUser({ tenantId, workspaceId: W.main, userId: U.member, roleKey: "corretor" });
  await ensureWorkspaceMembershipForUser({ tenantId, workspaceId: W.main, userId: U.existing, roleKey: "corretor" });
  await ensureWorkspaceMembershipForUser({ tenantId, workspaceId: W.sole, userId: U.sole, roleKey: "corretor" });
  await ensureWorkspaceMembershipForUser({ tenantId, workspaceId: W.sole2, userId: U.sole2, roleKey: "corretor" });
  await ensureWorkspaceMembershipForUser({ tenantId, workspaceId: W.ev, userId: U.owner, roleKey: "founder" });
  await ensureWorkspaceMembershipForUser({ tenantId: otherTenantId, workspaceId: W.other, userId: U.otherOwner, roleKey: "founder" });
  const t = (name: string, userId: string, workspaceId: string, tenant = tenantId) => ({ token: tk(name), tenantId: tenant, workspaceId, userId });
  await prismaGlobal.apiToken.createMany({ data: [
    t("owner", U.owner, W.main), t("member", U.member, W.main), t("plain", U.plain, W.main), t("selfDecl", U.selfDecl, W.main), t("free", U.free, W.main),
    t("first", U.first, W.empty), t("sole", U.sole, W.sole), t("sole2", U.sole2, W.sole2), t("legacy", U.legacy, W.ev), t("creator", U.creator, W.ev),
    t("activator", U.activator, W.ev), t("invited", U.invited, W.ev), t("none", U.none, W.main), t("existing", U.existing, W.main),
    t("ledgerFail", U.ledgerFail, W.main), t("prod", U.prod, W.main), t("off", U.off, W.main),
    t("other", U.other, W.other, otherTenantId), t("otherOwner", U.otherOwner, W.other, otherTenantId),
  ] });
  // o repositório de perfil é criado pela primeira leitura de um membro explícito
  assert.equal((await getMe("owner")).status, 200);
});
after(async () => { await prismaGlobal.$disconnect(); });

test("S1 — desligado por padrão: o bootstrap legado cria o vínculo e NENHUM evento é gravado; NODE_ENV=production nunca liga", async () => {
  assert.deepEqual(await membershipRows(U.plain, W.main), []);
  const before = (await events()).length;
  const res = await withShadow(false, () => getMe("plain"));
  assert.equal(res.status, 200);
  const created = await membershipRows(U.plain, W.main);
  assert.equal(created.length, 1, "comportamento legado preservado: a leitura cria vínculo ativo");
  assert.equal(created[0]!.status, "active");
  assert.equal((await events()).length, before, "sem flag: 0 eventos");
  await withShadow(true, async () => {
    const prodBefore = (await events()).length;
    assert.equal((await getMe("prod")).status, 200);
    assert.equal((await membershipRows(U.prod, W.main)).length, 1, "o bootstrap legado segue igual");
    assert.equal((await events()).length, prodBefore, "NODE_ENV=production: nunca liga");
  }, "production");
});

test("S2 — bootstrap padrão observado: mesma resposta e mesmo estado com a sombra ligada e desligada; evento descreve legado × política futura", async () => {
  const r = await twinRun(U.off, () => dropMembership(U.off, W.main).then(() => undefined), () => getMe("off", `trace-default-${id}`));
  sameOperation(r);
  assert.equal(r.newEvents.length, 1, "exatamente UM evento");
  const m = meta(r.newEvents[0]!);
  assert.equal(r.newEvents[0]!.eventType, WORKSPACE_BOOTSTRAP_SHADOW_EVENT_TYPE);
  assert.equal(m.observation, "membership_bootstrap");
  assert.equal(m.operational, false);
  assert.equal(m.enforced, false);
  assert.equal(m.kind, "shadow_observation");
  assert.equal(m.policyVersion, WORKSPACE_BOOTSTRAP_POLICY_VERSION);
  assert.equal(m.entryPoint, "management_summary");
  assert.deepEqual(m.origin, { method: "GET", route: "/api/profile/me" }, "origem = padrão de rota, sem URL crua");
  assert.equal(m.correlationId, `trace-default-${id}`, "reutiliza o identificador de correlação da requisição");
  assert.equal(m.legacy.action, "membership_created_on_read");
  assert.equal(m.legacy.assignedRoleKey, "corretor");
  assert.equal(m.legacy.roleSource, "default");
  assert.equal(m.legacy.classifierConsistent, true);
  assert.equal(m.legacy.privilegedRole, false);
  assert.equal(m.futurePolicy.wouldCreateMembershipOnRead, false);
  assert.equal(m.futurePolicy.wouldAssignRoleKey, "corretor");
  assert.equal(m.difference.membershipCreatedOnRead, true);
  assert.equal(m.difference.withoutIndependentEvidence, true, "nenhuma evidência independente de admissão");
  assert.deepEqual(m.evidence, { creatorLedger: false, productActivator: false, acceptedInvitation: false, legacyAssignment: false });
  assert.equal((await membershipRows(U.off, W.main))[0]!.role_key, "corretor");
});

test("S3 — função declarada no perfil: o comportamento legado é preservado e a sombra a identifica; a política futura a ignoraria", async () => {
  await setProfileRole(U.selfDecl, "Founder");
  const r = await twinRun(U.selfDecl, () => dropMembership(U.selfDecl, W.main).then(() => undefined), () => getMe("selfDecl"));
  sameOperation(r);
  const [row] = await membershipRows(U.selfDecl, W.main);
  assert.equal(row!.role_key, "founder", "comportamento legado preservado: papel definido pelo texto do perfil");
  assert.ok(JSON.stringify(row!.permissions).includes("products.activate"), "e com products.activate");
  assert.equal(r.newEvents.length, 1);
  const m = meta(r.newEvents[0]!);
  assert.equal(m.legacy.roleSource, "profile_role");
  assert.equal(m.legacy.profileRoleUsed, true);
  assert.equal(m.legacy.profileRoleInCatalog, true);
  assert.equal(m.legacy.profileRolePrivilegedInCatalog, true);
  assert.equal(m.legacy.privilegedRole, true);
  assert.equal(m.legacy.grantsProductsActivate, true);
  assert.equal(m.legacy.grantsManageMembers, true);
  assert.equal(m.futurePolicy.wouldAssignRoleKey, "corretor");
  assert.equal(m.difference.roleDiffers, true);
  assert.equal(m.difference.privilegeReduction, true);
  assert.equal(m.difference.withoutIndependentEvidence, true);
});

test("S4 — regra de primeiro membro (workspace vazio ⇒ gestor) identificada", async () => {
  const r = await twinRun(U.first, () => dropMembership(U.first, W.empty).then(() => undefined), () => getMe("first"));
  sameOperation(r);
  assert.equal((await membershipRows(U.first, W.empty))[0]!.role_key, "gestor", "comportamento legado preservado: primeiro a ler vira gestor");
  assert.equal(r.newEvents.length, 1);
  const m = meta(r.newEvents[0]!);
  assert.equal(m.legacy.roleSource, "first_member");
  assert.equal(m.legacy.firstMemberRuleApplied, true);
  assert.equal(m.legacy.workspaceHadMembers, false);
  assert.equal(m.legacy.privilegedRole, true);
  assert.equal(m.futurePolicy.ignoresFirstMemberRule, true);
  assert.equal(m.futurePolicy.wouldAssignRoleKey, "corretor");
  assert.equal(m.difference.privilegeReduction, true);
});

test("S5 — promoção automática do único membro a Founder identificada (por duas portas de entrada)", async () => {
  const reset = () => ensureWorkspaceMembershipForUser({ tenantId, workspaceId: W.sole, userId: U.sole, roleKey: "corretor" }).then(() => undefined);
  const r = await twinRun(U.sole, reset, () => getMe("sole"));
  sameOperation(r);
  assert.equal((await membershipRows(U.sole, W.sole))[0]!.role_key, "founder", "comportamento legado preservado: leitura promove o único membro");
  assert.equal(r.newEvents.length, 1);
  const m = meta(r.newEvents[0]!);
  assert.equal(m.observation, "sole_member_promotion");
  assert.equal(m.entryPoint, "management_summary");
  assert.equal(m.legacy.action, "sole_member_promoted_to_founder");
  assert.equal(m.legacy.previousRoleKey, "corretor");
  assert.equal(m.legacy.assignedRoleKey, "founder");
  assert.equal(m.legacy.activeMemberCount, 1);
  assert.equal(m.difference.privilegeEscalationByRule, true);
  assert.equal(m.futurePolicy.wouldPromoteSoleMember, false);
  assert.equal(m.futurePolicy.wouldKeepRoleKey, "corretor");

  // segunda porta: readActorRoleAuthority (PUT do perfil → upsertWorkspaceRoleConfig), outra rota de origem
  await ensureWorkspaceMembershipForUser({ tenantId, workspaceId: W.sole2, userId: U.sole2, roleKey: "corretor" });
  const before = (await events(U.sole2)).length;
  const res = await withShadow(true, () => request.put("/api/profile/me").set("Authorization", auth(tk("sole2")))
    .send({ workspaceRoleOptions: ["Founder", "Admin", "Gestor", "Desenvolvedor", "Corretor", "Assistente"] }));
  assert.equal(res.status, 200, JSON.stringify(res.body).slice(0, 200));
  const [viaAction] = (await events(U.sole2)).slice(before);
  assert.ok(viaAction, "evento pela porta de ação");
  assert.equal(meta(viaAction).observation, "sole_member_promotion");
  assert.equal(meta(viaAction).entryPoint, "actor_role_authority");
  assert.deepEqual(meta(viaAction).origin, { method: "PUT", route: "/api/profile/me" });
});

test("S6 — presença/ausência de evidência independente (criador no ledger, ativador, convite aceito, atribuição legada)", async () => {
  await setProfileRole(U.creator, "Founder");
  await prismaGlobal.guardrailAuditLedger.create({ data: { tenantId, workspaceId: W.ev, eventType: "tenant.onboarded", severity: "info", message: "synthetic", metadata: { userId: U.creator } } });
  await prismaGlobal.tenantProductInstallation.create({ data: { tenantId, workspaceId: W.ev, product: "imob", activatedByUserId: U.activator } });
  await prismaGlobal.$executeRaw`INSERT INTO eiah_workspace_invitations (id, tenant_id, workspace_id, email, role_key, status, token, expires_at, accepted_by_user_id)
    VALUES (${`inv-${id}`}, ${tenantId}, ${W.ev}, ${`g22-invited-${id}@example.com`}, 'corretor', 'accepted', ${`invtok-${id}`}, NOW() + interval '1 day', ${U.invited})`;
  await prismaGlobal.$executeRaw`INSERT INTO eiah_workspace_role_assignments (user_id, tenant_id, workspace_id, role_key) VALUES (${U.legacy}, ${tenantId}, ${W.ev}, 'admin')`;
  const expectations: Array<[string, Record<string, boolean>, string]> = [
    ["creator", { creatorLedger: true }, "profile_role"], ["activator", { productActivator: true }, "default"],
    ["invited", { acceptedInvitation: true }, "default"], ["legacy", { legacyAssignment: true }, "legacy_assignment"],
  ];
  await withShadow(true, async () => {
    for (const [name, flag, source] of expectations) {
      const res = await getMe(name);
      assert.equal(res.status, 200, name);
      const [event] = (await events(U[name as keyof typeof U])).slice(-1);
      const m = meta(event!);
      assert.deepEqual(m.evidence, { creatorLedger: false, productActivator: false, acceptedInvitation: false, legacyAssignment: false, ...flag }, name);
      assert.equal(m.hasIndependentEvidence, true, name);
      assert.equal(m.difference.withoutIndependentEvidence, false, name);
      assert.equal(m.legacy.roleSource, source, name);
    }
  });
  const legacyEvent = (await events(U.legacy)).slice(-1)[0]!;
  assert.equal(meta(legacyEvent).futurePolicy.wouldAssignRoleKey, "admin", "atribuição legada explícita é preservada pela política futura");
  assert.equal(meta(legacyEvent).difference.roleDiffers, false);
  assert.ok(meta((await events(U.creator)).slice(-1)[0]!).evidence, "evidência lida sem escrever");
});

test("S7 — sem inflação: leitura de membro explícito em workspace com vários membros não gera evento; repetir a leitura não repete a promoção", async () => {
  const before = (await events()).length;
  await withShadow(true, async () => {
    assert.equal((await getMe("existing")).status, 200);
    assert.equal((await getMe("member")).status, 200);
  });
  assert.equal((await events()).length, before, "membros explícitos, sem bootstrap nem promoção: 0 eventos");
  const soleEvents = (await events(U.sole)).length;
  await withShadow(true, async () => { assert.equal((await getMe("sole")).status, 200); });
  assert.equal((await events(U.sole)).length, soleEvents, "já é Founder: nada a observar");
});

test("S8 — falha do ledger: a resposta e o vínculo legados são idênticos e nenhum evento é gravado", async () => {
  await withShadow(true, async () => {
    await dropMembership(U.ledgerFail, W.main);
    // Falha SÓ da gravação do evento da sombra (o restante do ledger segue, pois o próprio perfil o lê).
    await prismaGlobal.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION g22_block_shadow() RETURNS trigger AS $$ BEGIN
      IF NEW.event_type = '${WORKSPACE_BOOTSTRAP_SHADOW_EVENT_TYPE}' THEN RAISE EXCEPTION 'g22 synthetic ledger failure'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`);
    await prismaGlobal.$executeRawUnsafe("CREATE TRIGGER g22_block_shadow BEFORE INSERT ON guardrail_audit_ledger FOR EACH ROW EXECUTE FUNCTION g22_block_shadow()");
    let res;
    try { res = await getMe("ledgerFail"); }
    finally { await prismaGlobal.$executeRawUnsafe("DROP TRIGGER IF EXISTS g22_block_shadow ON guardrail_audit_ledger"); }
    assert.equal(res.status, 200, "resposta operacional inalterada com o ledger recusando o evento");
    assert.equal((await membershipRows(U.ledgerFail, W.main)).length, 1, "o bootstrap legado seguiu");
    assert.equal((await events(U.ledgerFail)).length, 0, "nenhum evento gravado enquanto o ledger recusava");
  });
});

test("S9 — registros sem token, e-mail, nome nem texto livre do perfil; não confundíveis com concessão nem com fricção", async () => {
  await setProfileRole(U.free, "Chefe-Supremo-XYZ-confidencial");
  const res = await withShadow(true, () => getMe("free"));
  assert.equal(res.status, 200);
  const rows = await prismaGlobal.guardrailAuditLedger.findMany({ where: { tenantId, eventType: WORKSPACE_BOOTSTRAP_SHADOW_EVENT_TYPE } });
  assert.ok(rows.length > 0);
  const [event] = (await events(U.free)).slice(-1);
  assert.equal(meta(event!).legacy.roleSource, "default", "papel desconhecido no catálogo não é usado");
  assert.equal(meta(event!).legacy.profileRoleInCatalog, false);
  const serialized = JSON.stringify(rows);
  for (const secret of [tk("free"), tk("owner"), "Bearer", "Chefe-Supremo-XYZ-confidencial", "@example.com", `invtok-${id}`]) assert.equal(serialized.includes(secret), false, `sem ${secret}`);
  for (const row of rows) {
    assert.equal(row.severity, "info");
    assert.equal(extractFrictionEventFromAuditMetadata(row.metadata), null, "não é lido como evento de fricção");
    assert.equal(/allowed|denied|grant|authority/i.test(row.eventType), false);
  }
  assert.equal((await authoritySnapshot()).commercialEvents, 0, "nenhum evento de autoridade/concessão");
});

test("S10 — sem vazamento entre tenants/workspaces: eventos ficam no tenant e no workspace do ator", async () => {
  await withShadow(true, async () => {
    await dropMembership(U.other, W.other).catch(() => undefined);
    await prismaGlobal.$executeRaw`DELETE FROM eiah_workspace_memberships WHERE tenant_id=${otherTenantId} AND user_id=${U.other}`;
    assert.equal((await request.get("/api/profile/me").set("Authorization", auth(tk("other")))).status, 200);
  });
  const mine = await events(undefined, tenantId), theirs = await events(undefined, otherTenantId);
  assert.ok(theirs.length >= 1);
  assert.ok(mine.length >= 1);
  const mineSerialized = JSON.stringify(mine), theirsSerialized = JSON.stringify(theirs);
  for (const foreign of [otherTenantId, W.other, U.other, U.otherOwner]) assert.equal(mineSerialized.includes(foreign), false, `tenant principal não contém ${foreign}`);
  for (const foreign of [tenantId, ...Object.values(W).filter((w) => w !== W.other), U.owner, U.member]) assert.equal(theirsSerialized.includes(foreign), false, `outro tenant não contém ${foreign}`);
  for (const row of theirs) { assert.equal(row.tenantId, otherTenantId); assert.equal(row.workspaceId, W.other); assert.equal(meta(row).tenantId, otherTenantId); }
});

test("S11 — sem concessões: nenhuma designação, política ou instalação criada pelo observador; Founders só os esperados do legado", async () => {
  const snap = await authoritySnapshot();
  assert.equal(snap.designations, 0);
  assert.equal(snap.policies, 0);
  assert.equal(snap.installations, 1, "apenas a instalação sintética do cenário S6 (evidência)");
  const founders = await prismaGlobal.$queryRaw<Array<{ user_id: string }>>`SELECT user_id FROM eiah_workspace_memberships WHERE tenant_id=${tenantId} AND role_key='founder' ORDER BY user_id`;
  const expected = [U.owner, U.owner, U.selfDecl, U.sole, U.sole2, U.creator].sort(); // owner: Founder explícito em 2 workspaces
  assert.deepEqual(founders.map((row) => row.user_id).sort(), expected, "Founders = explícitos + os criados pelo LEGADO (autodeclarado S3, promoções S5 e perfil do criador S6); o observador não adicionou nenhum");
});
