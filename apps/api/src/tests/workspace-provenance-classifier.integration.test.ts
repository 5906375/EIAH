import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import express from "express";
import supertest from "supertest";
import { prismaGlobal } from "@repo/db";
import {
  classifyWorkspaceProvenanceFromDatabase,
  ProvenanceRequiredSourceError,
  withReadOnlyProvenanceSession,
} from "@eiah/core/services/workspaceProvenanceFacts";
import type { ProvenanceRecord } from "@eiah/core/services/workspaceProvenanceClassifier";

import { authRouter } from "../routes/auth";
import { onboardingRouter } from "../routes/onboarding";
import { profileRouter } from "../routes/profile";
import { workspacesRouter } from "../routes/workspaces";
import { ensureWorkspaceMembershipForUser, ensureWorkspaceResponsibilityStore } from "../services/workspaceResponsibility";

// G2.3-B — classificador governado de procedência: PostgreSQL real descartável, dados sintéticos gerados pelos FLUXOS REAIS
// (cadastro, convite, aceite, bootstrap com a sombra G2.2, criação de workspace). Só leitura; nada é concedido, regularizado ou revogado.
const dbUrl = new URL(process.env.DATABASE_URL ?? "x://");
if (!["localhost", "127.0.0.1"].includes(dbUrl.hostname) || !dbUrl.pathname.startsWith("/eiah_logistica_core_")) throw new Error("banco descartável eiah_logistica_core_* exigido");

const id = randomUUID().slice(0, 8);
const app = express(); app.use(express.json()); app.use("/api", onboardingRouter, authRouter, profileRouter, workspacesRouter);
const api = supertest(app);
const auth = (t: string) => `Bearer ${t}`;
const SHADOW = "EIAH_WORKSPACE_BOOTSTRAP_SHADOW_ENABLED";
const withShadow = async <T,>(on: boolean, fn: () => Promise<T>) => { if (on) process.env[SHADOW] = "true"; else delete process.env[SHADOW]; try { return await fn(); } finally { delete process.env[SHADOW]; } };
const email = (k: string) => `g23b-${k}-${id}@example.com`;
const NOW = new Date("2099-01-01T00:00:00.000Z");
const classify = (tenantIds: string[], options: Record<string, unknown> = {}) => classifyWorkspaceProvenanceFromDatabase({ prisma: prismaGlobal as never, tenantIds, options: { now: NOW, ...options } });

async function onboard(k: string) {
  const r = await api.post("/api/auth/onboarding").send({ email: email(k), name: k, orgName: `g23b org ${k} ${id}`, password: "password-123" });
  assert.equal(r.status, 201, JSON.stringify(r.body).slice(0, 200));
  return r.body.data as { tenantId: string; workspaceId: string; userId: string; token: string };
}
async function invite(inviterToken: string, k: string, roleKey: string, loginToken?: string) {
  const r = await api.post("/api/profile/workspace-members/invitations").set("Authorization", auth(inviterToken)).send({ email: email(k), roleKey });
  assert.equal(r.status, 201, JSON.stringify(r.body).slice(0, 200));
  const a = await api.post("/api/auth/workspace-invitations/accept").send(loginToken ? { token: r.body.data.token, loginToken } : { token: r.body.data.token, email: email(k), fullName: k, password: "password-123" });
  assert.equal(a.status, 201, JSON.stringify(a.body).slice(0, 200));
  return { userId: a.body.data.userId as string, token: a.body.data.token as string, invitationId: r.body.data.id as string };
}
async function plainUser(k: string, tenantId: string, workspaceId: string) {
  const userId = `${k}-${id}`;
  await prismaGlobal.user.create({ data: { id: userId, tenantId, email: email(k) } });
  await prismaGlobal.apiToken.create({ data: { token: `syn-${k}-${id}`, tenantId, workspaceId, userId } });
  return { userId, token: `syn-${k}-${id}` };
}
const newWs = async (k: string, tenantId: string) => (await prismaGlobal.workspace.create({ data: { id: `g23b-${k}-${id}`, tenantId, name: k } })).id;
const getMe = (token: string) => api.get("/api/profile/me").set("Authorization", auth(token));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function fingerprint() {
  return (await prismaGlobal.$queryRawUnsafe<Array<{ f: string }>>(`SELECT md5(string_agg(t, '|' ORDER BY t)) AS f FROM (
    SELECT 'm'||md5(m::text) t FROM eiah_workspace_memberships m UNION ALL SELECT 'i'||md5(i::text) FROM eiah_workspace_invitations i
    UNION ALL SELECT 'l'||md5(l::text) FROM guardrail_audit_ledger l UNION ALL SELECT 'a'||md5(a::text) FROM eiah_workspace_role_assignments a
    UNION ALL SELECT 't'||md5(t::text) FROM api_tokens t UNION ALL SELECT 'p'||md5(p::text) FROM eiah_user_profiles p
    UNION ALL SELECT 'u'||md5(u::text) FROM users u UNION ALL SELECT 'w'||md5(w::text) FROM workspaces w) q`))[0]!.f;
}

type World = { A: Awaited<ReturnType<typeof onboard>>; B: Awaited<ReturnType<typeof onboard>>; expected: Record<string, { u: string; w: string; adm: string; priv: string; reasons?: string[]; signals?: string[] }>; reactivated: string };
let world: World;
const find = (records: ProvenanceRecord[], u: string, w: string) => { const r = records.find((x) => x.userId === u && x.workspaceId === w); assert.ok(r, `registro ${u}/${w} ausente`); return r!; };

before(async () => {
  const A = await onboard("ca"); const B = await onboard("cb");
  await getMe(A.token); // cria o repositório de perfil
  const WA1 = A.workspaceId;
  const expected: World["expected"] = {};
  const put = (k: string, u: string, w: string, adm: string, priv: string, reasons: string[] = [], signals: string[] = []) => { expected[k] = { u, w, adm, priv, reasons, signals }; };

  put("creator", A.userId, WA1, "VERIFIED", "VERIFIED", ["CREATOR_LEDGER_INITIAL_WORKSPACE"]);
  const IA = await invite(A.token, "ia", "corretor"); put("invited", IA.userId, WA1, "VERIFIED", "VERIFIED", ["INVITATION_ROOTED_DEPTH_1"]);
  const MA = await invite(A.token, "ma", "gestor"); put("invitedManager", MA.userId, WA1, "VERIFIED", "VERIFIED", ["INVITATION_ROOTED_DEPTH_1"]);
  const NA = await invite(MA.token, "na", "corretor"); put("chainDepth2", NA.userId, WA1, "VERIFIED", "VERIFIED", ["INVITATION_ROOTED_DEPTH_2"]);
  const IC = await invite(A.token, "ic", "corretor");
  await prismaGlobal.$executeRaw`UPDATE eiah_workspace_memberships SET role_key='founder', permissions='["products.activate","workspace.manage_members"]'::jsonb WHERE user_id=${IC.userId} AND workspace_id=${WA1}`;
  put("privilegeConflict", IC.userId, WA1, "VERIFIED", "CONFLICTING", ["INVITATION_ROOTED_DEPTH_1"]);
  const II = await invite(A.token, "ii", "corretor");
  await prismaGlobal.$executeRaw`UPDATE eiah_workspace_memberships SET status='inactive' WHERE user_id=${II.userId} AND workspace_id=${WA1}`;
  put("inactive", II.userId, WA1, "VERIFIED", "VERIFIED", ["INVITATION_ROOTED_DEPTH_1"], ["MEMBERSHIP_NOT_ACTIVE"]);
  const TE = await invite(MA.token, "te", "corretor");
  await prismaGlobal.$executeRaw`UPDATE eiah_workspace_invitations SET created_at = (SELECT accepted_at FROM eiah_workspace_invitations WHERE accepted_by_user_id=${MA.userId} LIMIT 1) - interval '1 day' WHERE id=${TE.invitationId}`;
  put("temporalOrder", TE.userId, WA1, "UNVERIFIED", "INSUFFICIENT_EVIDENCE", ["INVITATION_INVITER_NOT_ROOTED_OR_NOT_ADMITTED_BEFORE_INVITATION"]);
  const L = await plainUser("legacyNoLink", A.tenantId, WA1); put("legacyNoLink", L.userId, WA1, "INSUFFICIENT_EVIDENCE", "NOT_APPLICABLE", [], ["TOKEN_ACCESS_WITHOUT_MEMBERSHIP"]);
  const SD = await plainUser("selfDeclared", A.tenantId, WA1);
  await prismaGlobal.$executeRaw`INSERT INTO eiah_user_profiles (user_id, role, created_at, updated_at) VALUES (${SD.userId}, 'Founder', NOW(), NOW())`;
  await withShadow(true, () => getMe(SD.token));
  put("selfDeclared", SD.userId, WA1, "UNVERIFIED", "UNVERIFIED", ["BOOTSTRAP_OBSERVED_CREATED_PROFILE_ROLE"], ["PROFILE_ROLE_EQUALS_PRIVILEGED_ROLE"]);
  const BNS = await plainUser("bootstrapUnobserved", A.tenantId, WA1); await withShadow(false, () => getMe(BNS.token));
  await prismaGlobal.$executeRaw`INSERT INTO eiah_user_profiles (user_id, role, created_at, updated_at) VALUES (${BNS.userId}, ${`Segredo-livre-${id}`}, NOW(), NOW())`; // texto livre: nunca pode aparecer na saída
  put("bootstrapUnobserved", BNS.userId, WA1, "INSUFFICIENT_EVIDENCE", "INSUFFICIENT_EVIDENCE");
  const AC = await plainUser("activatorOnly", A.tenantId, WA1); await withShadow(false, () => getMe(AC.token));
  await prismaGlobal.tenantProductInstallation.create({ data: { tenantId: A.tenantId, workspaceId: WA1, product: "imob", activatedByUserId: AC.userId } });
  put("activatorOnly", AC.userId, WA1, "UNVERIFIED", "INSUFFICIENT_EVIDENCE", ["CORROBORATION_PRODUCT_ACTIVATOR"]);

  const created2 = await api.post("/api/workspaces").set("Authorization", auth(A.token)).send({ name: `secondary ${id}` });
  assert.equal(created2.status, 201, JSON.stringify(created2.body).slice(0, 150));
  const WA2 = created2.body.data.workspaceId as string;
  put("tenantCreatorSecondary", A.userId, WA2, "UNVERIFIED", "UNVERIFIED", ["TENANT_CREATOR_NO_WORKSPACE_ADMISSION"], ["FIRST_MEMBER_GESTOR_SUSPECT"]);
  // O-1: convite emitido pelo criador do tenant no workspace ADICIONAL não enraíza o convidado
  const WA3 = await newWs("empty", A.tenantId); const FB = await plainUser("firstMember", A.tenantId, WA3);
  await withShadow(true, () => getMe(FB.token));
  put("firstMember", FB.userId, WA3, "UNVERIFIED", "UNVERIFIED", ["BOOTSTRAP_OBSERVED_CREATED_FIRST_MEMBER"], ["FIRST_MEMBER_GESTOR_SUSPECT"]);
  const XB = await invite(FB.token, "inviteFromBootstrap", "corretor");
  put("inviteFromBootstrap", XB.userId, WA3, "UNVERIFIED", "INSUFFICIENT_EVIDENCE", ["INVITATION_INVITER_NOT_ROOTED_OR_NOT_ADMITTED_BEFORE_INVITATION"]);

  const WA5 = await newWs("sole", A.tenantId); const P = await plainUser("soleFounder", A.tenantId, WA5);
  await ensureWorkspaceResponsibilityStore(prismaGlobal);
  await ensureWorkspaceMembershipForUser({ tenantId: A.tenantId, workspaceId: WA5, userId: P.userId, roleKey: "corretor" });
  await withShadow(true, () => getMe(P.token));
  put("soleFounder", P.userId, WA5, "INSUFFICIENT_EVIDENCE", "UNVERIFIED", [], ["SOLE_ACTIVE_MEMBER_PRIVILEGED_SUSPECT"]);

  const WA6 = await newWs("multi", A.tenantId); const M1 = await plainUser("multi1", A.tenantId, WA6); const M2 = await plainUser("multi2", A.tenantId, WA6);
  for (const m of [M1, M2]) {
    await ensureWorkspaceMembershipForUser({ tenantId: A.tenantId, workspaceId: WA6, userId: m.userId, roleKey: "gestor" });
    await prismaGlobal.guardrailAuditLedger.create({ data: { tenantId: A.tenantId, workspaceId: WA6, eventType: "tenant.onboarded", severity: "info", message: "synthetic", metadata: { userId: m.userId } } });
  }
  put("multiCreator1", M1.userId, WA6, "CONFLICTING", "CONFLICTING", ["MULTIPLE_CREATORS_FOR_WORKSPACE"]); put("multiCreator2", M2.userId, WA6, "CONFLICTING", "CONFLICTING");

  const WA7 = await newWs("legacyAssign", A.tenantId); const LA = await plainUser("legacyAssign", A.tenantId, WA7); const LB = await plainUser("legacyMismatch", A.tenantId, WA7);
  await ensureWorkspaceMembershipForUser({ tenantId: A.tenantId, workspaceId: WA7, userId: LA.userId, roleKey: "corretor" });
  await ensureWorkspaceMembershipForUser({ tenantId: A.tenantId, workspaceId: WA7, userId: LB.userId, roleKey: "founder" });
  for (const [u, r] of [[LA.userId, "corretor"], [LB.userId, "corretor"]]) await prismaGlobal.$executeRaw`INSERT INTO eiah_workspace_role_assignments (user_id, tenant_id, workspace_id, role_key) VALUES (${u}, ${A.tenantId}, ${WA7}, ${r})`;
  put("legacyAssignment", LA.userId, WA7, "INSUFFICIENT_EVIDENCE", "INSUFFICIENT_EVIDENCE", ["LEGACY_ASSIGNMENT_PROVENANCE_UNDOCUMENTED"]);
  put("legacyMismatch", LB.userId, WA7, "INSUFFICIENT_EVIDENCE", "CONFLICTING", ["LEGACY_ASSIGNMENT_PROVENANCE_UNDOCUMENTED"]);

  await ensureWorkspaceMembershipForUser({ tenantId: A.tenantId, workspaceId: WA1, userId: B.userId, roleKey: "corretor" });
  put("crossTenant", B.userId, WA1, "CONFLICTING", "CONFLICTING", ["USER_TENANT_DIFFERS_FROM_MEMBERSHIP_TENANT"]);

  // convite aceito que REATIVA vínculo revogado (fluxo real: segundo convite aceito com o loginToken da conta existente)
  const R1 = await invite(A.token, "reactivated", "corretor");
  await sleep(1500);
  await prismaGlobal.$executeRaw`UPDATE eiah_workspace_memberships SET status='revoked' WHERE user_id=${R1.userId} AND workspace_id=${WA1}`;
  await invite(A.token, "reactivated", "corretor", R1.token);
  put("reactivated", R1.userId, WA1, "VERIFIED", "VERIFIED", ["INVITATION_ROOTED_DEPTH_1"], ["INVITATION_ACCEPTED_ON_EXISTING_MEMBERSHIP", "MULTIPLE_ACCEPTED_INVITATIONS"]);
  world = { A, B, expected, reactivated: R1.userId };
});
after(async () => { await prismaGlobal.$disconnect(); });

test("C1 — cenários do protótipo + casos do incremento sobre fluxos reais (DB descartável)", async () => {
  const { classification } = await classify([world.A.tenantId, world.B.tenantId], { existingMembershipGraceMs: 1000 });
  const failures: string[] = [];
  for (const [name, e] of Object.entries(world.expected)) {
    const r = classification.records.find((x) => x.userId === e.u && x.workspaceId === e.w);
    if (!r) { failures.push(`${name}: ausente`); continue; }
    const ok = r.admission.state === e.adm && r.privilege.state === e.priv && (e.reasons ?? []).every((x) => r.admission.reasons.includes(x) || r.privilege.reasons.includes(x)) && (e.signals ?? []).every((x) => r.signals.includes(x));
    if (!ok) failures.push(`${name}: esperado ${e.adm}/${e.priv} ${JSON.stringify(e.reasons)} ${JSON.stringify(e.signals)}; obtido ${r.admission.state}/${r.privilege.state} ${JSON.stringify(r.admission.reasons)} ${JSON.stringify(r.privilege.reasons)} ${JSON.stringify(r.signals)}`);
  }
  assert.deepEqual(failures, [], failures.join("\n"));
  assert.ok(Object.keys(world.expected).length >= 21);
  assert.equal(find(classification.records, world.reactivated, world.A.workspaceId).needsHumanReview, true);
  assert.equal(classification.degraded, false);
  assert.equal(classification.classifiedAt, NOW.toISOString());
});

test("C2 — somente leitura: nada muda no banco e a escrita é recusada na mesma sessão", async () => {
  const before = await fingerprint();
  await classify([world.A.tenantId, world.B.tenantId]);
  await classify(); // todos os tenants
  assert.equal(await fingerprint(), before, "impressão digital das tabelas inalterada");
  await assert.rejects(() => withReadOnlyProvenanceSession(prismaGlobal as never, async (run) => { await run.exec("UPDATE eiah_workspace_memberships SET status = status"); }), /read-only/i);
  await assert.rejects(() => withReadOnlyProvenanceSession(prismaGlobal as never, async (run) => { await run.exec("INSERT INTO eiah_workspace_role_assignments (user_id, tenant_id, workspace_id, role_key) VALUES ('x','x','x','x')"); }), /read-only|violates|permission/i);
  assert.equal(await fingerprint(), before);
});

test("C3 — determinismo e isolamento entre tenants", async () => {
  const one = await classify([world.A.tenantId]); const two = await classify([world.A.tenantId]);
  assert.deepEqual(two.classification, one.classification);
  const both = await classify([world.A.tenantId, world.B.tenantId]);
  assert.deepEqual(both.classification.records.filter((r) => r.tenantId === world.A.tenantId), one.classification.records, "A idêntico com ou sem B");
  assert.equal(one.classification.records.every((r) => r.tenantId === world.A.tenantId), true, "nenhum registro de B quando só A é pedido");
  const onlyB = await classify([world.B.tenantId]);
  assert.equal(onlyB.classification.records.every((r) => r.tenantId === world.B.tenantId), true);
  assert.equal(find(onlyB.classification.records, world.B.userId, world.B.workspaceId).admission.state, "VERIFIED");
  // o vínculo de B dentro de A só aparece (e como conflito) na classificação de A
  assert.equal(onlyB.classification.records.some((r) => r.userId === world.B.userId && r.workspaceId === world.A.workspaceId), false);
  // lotes pequenos produzem o mesmo resultado que o lote único
  const chunked = await classifyWorkspaceProvenanceFromDatabase({ prisma: prismaGlobal as never, tenantIds: [world.A.tenantId, world.B.tenantId], chunkSize: 1, options: { now: NOW } });
  const whole = await classify([world.A.tenantId, world.B.tenantId]);
  const key = (r: ProvenanceRecord) => `${r.tenantId}|${r.workspaceId}|${r.userId}`;
  assert.deepEqual([...chunked.classification.records].sort((a, b) => key(a).localeCompare(key(b))), [...whole.classification.records].sort((a, b) => key(a).localeCompare(key(b))));
});

test("C4 — sem vazamento: nada de e-mail, token de API, token de convite, senha ou texto livre; agregado sem ids", async () => {
  const { classification, summary } = await classify([world.A.tenantId, world.B.tenantId]);
  const text = JSON.stringify(classification);
  const secrets = [...(await prismaGlobal.$queryRawUnsafe<Array<{ token: string }>>("SELECT token FROM eiah_workspace_invitations")).map((r) => r.token), ...(await prismaGlobal.apiToken.findMany({ select: { token: true } })).map((r) => r.token)];
  for (const bad of ["@example.com", "syn-", "tok_", "password", `Segredo-livre-${id}`, ...secrets]) assert.equal(text.includes(bad), false, `saída sem ${bad.slice(0, 10)}…`);
  const s = JSON.stringify(summary);
  for (const bad of [world.A.userId, world.A.tenantId, world.A.workspaceId]) assert.equal(s.includes(bad), false, "agregado sem identificadores");
  assert.ok(summary.totals.subjects >= 21);
  assert.ok(classification.records.every((r) => r.classificationIsNotAuthorization === true));
});

async function withTableAbsent<T>(table: string, fn: () => Promise<T>) {
  await prismaGlobal.$executeRawUnsafe(`ALTER TABLE ${table} RENAME TO ${table}_g23b_off`);
  try { return await fn(); } finally { await prismaGlobal.$executeRawUnsafe(`ALTER TABLE ${table}_g23b_off RENAME TO ${table}`); }
}

test("C5 — tabela opcional ausente: fonte `unavailable`, limitação explícita, sem prova positiva e sem criar tabela", async () => {
  const baseline = await classify([world.A.tenantId]);
  assert.equal(find(baseline.classification.records, world.expected.invited!.u, world.A.workspaceId).admission.state, "VERIFIED");
  await withTableAbsent("eiah_workspace_invitations", async () => {
    const { classification } = await classify([world.A.tenantId]);
    assert.equal(classification.sources.invitations, "unavailable"); assert.equal(classification.degraded, true);
    const r = find(classification.records, world.expected.invited!.u, world.A.workspaceId);
    assert.equal(r.admission.state, "INSUFFICIENT_EVIDENCE", "sem a fonte de convites, o convidado perde a prova — nada é inferido do silêncio");
    assert.ok(r.limitations.includes("SOURCE_UNAVAILABLE:invitations")); assert.equal(r.needsHumanReview, true);
    assert.equal((await prismaGlobal.$queryRawUnsafe<Array<{ ok: boolean }>>("SELECT to_regclass('public.eiah_workspace_invitations') IS NULL AS ok"))[0]!.ok, true, "o classificador não criou a tabela");
  });
  await withTableAbsent("vertical_access_approvals", async () => {
    const { classification } = await classify([world.A.tenantId]);
    assert.equal(classification.sources.approvals, "unavailable");
    assert.equal(find(classification.records, world.expected.creator!.u, world.A.workspaceId).admission.state, "VERIFIED", "a prova positiva do criador não depende da fonte ausente");
  });
  await withTableAbsent("eiah_workspace_role_assignments", async () => {
    const { classification } = await classify([world.A.tenantId]);
    assert.equal(classification.sources.legacy_assignments, "unavailable");
    assert.ok(find(classification.records, world.expected.legacyAssignment!.u, world.expected.legacyAssignment!.w).limitations.includes("SOURCE_UNAVAILABLE:legacy_assignments"));
  });
  // fonte obrigatória ausente: falha explícita (não classifica "tudo vazio")
  await withTableAbsent("eiah_workspace_memberships", async () => {
    await assert.rejects(() => classify([world.A.tenantId]), (e: unknown) => e instanceof ProvenanceRequiredSourceError && e.source === "memberships");
  });
  // tabela presente porém incompatível: erro isolado da fonte (savepoint), as demais continuam
  await prismaGlobal.$executeRawUnsafe("ALTER TABLE tenant_product_installations RENAME TO tenant_product_installations_g23b_off");
  await prismaGlobal.$executeRawUnsafe("CREATE TABLE tenant_product_installations (unrelated text)");
  try {
    const { classification } = await classify([world.A.tenantId]);
    assert.equal(classification.sources.installations, "error"); assert.equal(classification.sources.memberships, "available");
    assert.ok(find(classification.records, world.expected.creator!.u, world.A.workspaceId).limitations.includes("SOURCE_ERROR:installations"));
    assert.equal(find(classification.records, world.expected.creator!.u, world.A.workspaceId).admission.state, "VERIFIED");
  } finally {
    await prismaGlobal.$executeRawUnsafe("DROP TABLE tenant_product_installations");
    await prismaGlobal.$executeRawUnsafe("ALTER TABLE tenant_product_installations_g23b_off RENAME TO tenant_product_installations");
  }
});

test("C6 — fusos: sessão fixada e verificada em UTC; instantes gravados com offsets diferentes (timestamp sem fuso e timestamptz) voltam exatos", async () => {
  const { readProvenanceFacts } = await import("@eiah/core/services/workspaceProvenanceFacts");
  const T = await onboard("tz");
  // ledger (timestamp sem fuso, Prisma grava UTC) com instante explícito
  const ledgerAt = new Date("2026-03-01T12:00:00.000Z");
  const ev = await prismaGlobal.guardrailAuditLedger.create({ data: { tenantId: T.tenantId, workspaceId: T.workspaceId, eventType: "tenant.onboarded", severity: "info", message: "synthetic tz", metadata: { userId: T.userId }, createdAt: ledgerAt } });
  // convite (timestamptz) gravado com offset -03:00 e +09:00: devem voltar como os mesmos instantes absolutos
  const invitee = await prismaGlobal.user.create({ data: { id: `tz-inv-${id}`, tenantId: T.tenantId, email: email("tzinv") } });
  await prismaGlobal.$executeRaw`INSERT INTO eiah_workspace_invitations (id, tenant_id, workspace_id, email, role_key, permissions, status, token, expires_at, invited_by_user_id, accepted_by_user_id, accepted_at, created_at)
    VALUES (${`tz-${id}`}, ${T.tenantId}, ${T.workspaceId}, ${email("tzinv")}, 'corretor', '[]'::jsonb, 'accepted', ${`tz-tok-${id}`}, '2026-03-05T00:00:00-03:00'::timestamptz, ${T.userId}, ${invitee.id}, '2026-03-01T22:00:00+09:00'::timestamptz, '2026-03-01T09:30:00-03:00'::timestamptz)`;
  const facts = await withReadOnlyProvenanceSession(prismaGlobal as never, async (run) => {
    const tz = (await run.query<{ tz: string }>("SELECT current_setting('TimeZone') AS tz"))[0]!.tz;
    assert.equal(tz, "UTC", "sessão do classificador fixada em UTC");
    return readProvenanceFacts(run, [T.tenantId]);
  });
  const creator = facts.creatorEvents.find((e) => e.eventId === ev.id)!;
  assert.equal(creator.at!.toISOString(), ledgerAt.toISOString(), "timestamp sem fuso lido como UTC");
  const inv = facts.invitations.find((i) => i.id === `tz-${id}`)!;
  assert.equal(inv.createdAt!.toISOString(), "2026-03-01T12:30:00.000Z", "09:30-03:00 = 12:30Z");
  assert.equal(inv.acceptedAt!.toISOString(), "2026-03-01T13:00:00.000Z", "22:00+09:00 = 13:00Z");
  assert.equal(inv.expiresAt!.toISOString(), "2026-03-05T03:00:00.000Z");
  // criador admitido às 12:00Z; convite emitido às 12:30Z (09:30-03:00) => o concedente já era admitido => enraizado
  await ensureWorkspaceMembershipForUser({ tenantId: T.tenantId, workspaceId: T.workspaceId, userId: invitee.id, roleKey: "corretor" });
  // contra-exemplo no mesmo dia: convite emitido às 11:30Z (08:30-03:00), ANTES da admissão do criador (12:00Z) => não enraíza
  const late = await prismaGlobal.user.create({ data: { id: `tz-late-${id}`, tenantId: T.tenantId, email: email("tzlate") } });
  await prismaGlobal.$executeRaw`INSERT INTO eiah_workspace_invitations (id, tenant_id, workspace_id, email, role_key, permissions, status, token, expires_at, invited_by_user_id, accepted_by_user_id, accepted_at, created_at)
    VALUES (${`tzl-${id}`}, ${T.tenantId}, ${T.workspaceId}, ${email("tzlate")}, 'corretor', '[]'::jsonb, 'accepted', ${`tzl-tok-${id}`}, '2026-03-05T00:00:00-03:00'::timestamptz, ${T.userId}, ${late.id}, '2026-03-01T22:00:00+09:00'::timestamptz, '2026-03-01T08:30:00-03:00'::timestamptz)`;
  await ensureWorkspaceMembershipForUser({ tenantId: T.tenantId, workspaceId: T.workspaceId, userId: late.id, roleKey: "corretor" });
  const { classification } = await classify([T.tenantId]);
  assert.equal(find(classification.records, invitee.id, T.workspaceId).admission.state, "VERIFIED", "12:30Z >= 12:00Z");
  assert.equal(find(classification.records, late.id, T.workspaceId).admission.state, "UNVERIFIED", "11:30Z < 12:00Z, ainda que o relógio local pareça posterior");
});

test("C6b — controle do risco e guarda: com a sessão em outro fuso o cast ingênuo muda o instante e o leitor RECUSA rodar", async () => {
  await prismaGlobal.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL TIME ZONE 'UTC'");
    const utc = (await tx.$queryRawUnsafe<Array<{ t: string }>>("SELECT ((created_at)::timestamptz)::text AS t FROM guardrail_audit_ledger WHERE event_type='tenant.onboarded' LIMIT 1"))[0]!.t;
    await tx.$executeRawUnsafe("SET LOCAL TIME ZONE 'America/Sao_Paulo'");
    const sp = (await tx.$queryRawUnsafe<Array<{ t: string }>>("SELECT ((created_at)::timestamptz)::text AS t FROM guardrail_audit_ledger WHERE event_type='tenant.onboarded' LIMIT 1"))[0]!.t;
    assert.notEqual(new Date(utc).getTime(), new Date(sp).getTime(), "cast ingênuo de timestamp sem fuso depende do fuso da sessão");
  });
  const { readProvenanceFacts } = await import("@eiah/core/services/workspaceProvenanceFacts");
  await assert.rejects(() => prismaGlobal.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY"); await tx.$executeRawUnsafe("SET LOCAL TIME ZONE 'America/Sao_Paulo'");
    return readProvenanceFacts({ query: (sql, params = []) => tx.$queryRawUnsafe(sql, ...params) as never, exec: async (sql) => { await tx.$executeRawUnsafe(sql); } }, [world.A.tenantId]);
  }), /fuso|UTC/i);
});

test("C7 — a classificação não concede nada: nenhum vínculo/papel/designação/política/instalação/convite novo e nenhum evento de autoridade", async () => {
  const count = async (sql: string) => Number((await prismaGlobal.$queryRawUnsafe<Array<{ n: bigint }>>(sql))[0]!.n);
  const snapshot = async () => ({
    memberships: await count("SELECT COUNT(*)::bigint n FROM eiah_workspace_memberships"), invitations: await count("SELECT COUNT(*)::bigint n FROM eiah_workspace_invitations"),
    designations: await count("SELECT COUNT(*)::bigint n FROM eiah_commercial_authority_designations").catch(() => 0), policies: await count("SELECT COUNT(*)::bigint n FROM tenant_action_policy"),
    installations: await count("SELECT COUNT(*)::bigint n FROM tenant_product_installations"), tokens: await count("SELECT COUNT(*)::bigint n FROM api_tokens"),
    ledger: await count("SELECT COUNT(*)::bigint n FROM guardrail_audit_ledger"),
  });
  const b = await snapshot(); await classify(); assert.deepEqual(await snapshot(), b);
  assert.equal(b.designations, 0, "a primeira autoridade segue sem fonte: nenhuma designação existe");
});
