import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { prismaGlobal } from "@repo/db";

import {
  createWorkspaceInvitation,
  ensureWorkspaceMembershipForUser,
  ensureWorkspaceResponsibilityStore,
  readWorkspaceManagementSummary,
  readWorkspaceResponsibleProfile,
} from "../services/workspaceResponsibility";
import { WORKSPACE_BOOTSTRAP_SHADOW_ENV_KEY, WORKSPACE_BOOTSTRAP_SHADOW_EVENT_TYPE } from "../services/workspaceBootstrapShadow";

// AUTHZ-4b — a promoção automática a Founder só vale para o ÚNICO membro ATIVO, e somente se esse membro for o próprio ator e o seu vínculo
// estiver `active` no estado persistido. PostgreSQL descartável, dados sintéticos.
const dbUrl = new URL(process.env.DATABASE_URL ?? "x://");
if (!["localhost", "127.0.0.1"].includes(dbUrl.hostname) || !dbUrl.pathname.startsWith("/eiah_logistica_core_")) throw new Error("banco descartável eiah_logistica_core_* exigido");

const id = randomUUID().slice(0, 8);
const tenantId = `pg-t-${id}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function delayed(prisma: any, match: RegExp, ms: number) {
  const wrap = (fn: Function) => async (strings: TemplateStringsArray, ...values: unknown[]) => { if (match.test(strings.join("?"))) await sleep(ms); return fn.call(prisma, strings, ...values); };
  return new Proxy(prisma, { get(target, prop) {
    const value = Reflect.get(target, prop, target);
    if (prop === "$queryRaw" || prop === "$executeRaw") return wrap(value as Function);
    return typeof value === "function" ? (value as Function).bind(target) : value;
  } });
}
let n = 0;
async function world(members: Array<{ key: string; role: string; status?: string }>) {
  const k = (n += 1);
  const workspaceId = `pg-w${k}-${id}`;
  await prismaGlobal.workspace.create({ data: { id: workspaceId, tenantId, name: `w${k}` } });
  const users: Record<string, string> = {};
  for (const m of members) {
    const userId = `pg-${m.key}${k}-${id}`;
    users[m.key] = userId;
    await prismaGlobal.user.create({ data: { id: userId, tenantId, email: `pg-${m.key}${k}-${id}@example.com`, displayName: m.key } });
    await ensureWorkspaceMembershipForUser({ tenantId, workspaceId, userId, roleKey: m.role });
    if (m.status && m.status !== "active") await prismaGlobal.$executeRaw`UPDATE eiah_workspace_memberships SET status=${m.status} WHERE workspace_id=${workspaceId} AND user_id=${userId}`;
  }
  return { workspaceId, users };
}
const row = async (workspaceId: string, userId: string) => (await prismaGlobal.$queryRawUnsafe<Array<{ role_key: string; status: string; permissions: string[]; updated_at: Date }>>("SELECT role_key, status, permissions, updated_at FROM eiah_workspace_memberships WHERE workspace_id=$1 AND user_id=$2", workspaceId, userId))[0]!;
const read = (workspaceId: string, userId: string, prisma?: unknown) => readWorkspaceManagementSummary({ ...(prisma ? { prisma } : {}), tenantId, workspaceId, userId });
const hasPriv = (perms: string[]) => perms.includes("products.activate") || perms.includes("workspace.manage_members") || perms.includes("workspace.manage_roles");
let founderReference: string[] = [];

before(async () => {
  await prismaGlobal.tenant.create({ data: { id: tenantId, name: "authz4b" } });
  await ensureWorkspaceResponsibilityStore(prismaGlobal);
  const ref = await world([{ key: "ref", role: "founder" }]);
  founderReference = (await row(ref.workspaceId, ref.users.ref!)).permissions;
});
after(async () => { await prismaGlobal.$disconnect(); });

for (const status of ["inactive", "revoked"]) {
  test(`${status}: membro com OUTRO membro ativo NÃO é promovido, não ganha privilégio, não é reativado e não consegue convidar`, async () => {
    for (const otherRole of ["corretor", "founder"]) {
      const { workspaceId, users } = await world([{ key: "actor", role: "corretor", status }, { key: "other", role: otherRole }]);
      const before = await row(workspaceId, users.actor!);
      const summary = await read(workspaceId, users.actor!);
      const profile = await readWorkspaceResponsibleProfile({ tenantId, workspaceId, userId: users.actor! });
      const after = await row(workspaceId, users.actor!);
      assert.equal(after.role_key, "corretor", `${otherRole}: papel preservado`);
      assert.equal(after.status, status, `${otherRole}: status preservado (sem reativação)`);
      assert.deepEqual(after.permissions, before.permissions, `${otherRole}: permissões preservadas`);
      assert.equal(after.updated_at.getTime(), before.updated_at.getTime(), `${otherRole}: nenhuma escrita no vínculo`);
      assert.equal(hasPriv(after.permissions), false);
      assert.equal(summary.selectedRoleKey, "corretor"); assert.equal(summary.canManageMembers, false); assert.equal(summary.permissions.includes("products.activate"), false);
      assert.equal(profile.canManageMembers, false); assert.equal(profile.selectedRoleKey, "corretor");
      await assert.rejects(() => createWorkspaceInvitation({ tenantId, workspaceId, invitedByUserId: users.actor!, email: `pg-inv-${n}-${id}@example.com`, roleKey: "corretor" }), (e: { code?: string; status?: number }) => e.code === "WORKSPACE_MEMBERS_FORBIDDEN" && e.status === 403);
      const other = await row(workspaceId, users.other!);
      assert.equal(other.role_key, otherRole, "o outro membro não é alterado");
    }
  });
}

test("ninguém ativo (ator inativo sozinho) e vários inativos: nenhuma promoção", async () => {
  const { workspaceId, users } = await world([{ key: "actor", role: "corretor", status: "inactive" }, { key: "x", role: "corretor", status: "revoked" }]);
  await read(workspaceId, users.actor!);
  assert.equal((await row(workspaceId, users.actor!)).role_key, "corretor");
  assert.equal((await row(workspaceId, users.x!)).role_key, "corretor");
});

test("legítimo preservado: o ÚNICO membro ativo (o próprio ator, não privilegiado) continua sendo promovido, com as mesmas permissões e sem linha nova", async () => {
  const { workspaceId, users } = await world([{ key: "actor", role: "corretor" }]);
  const count = async () => Number((await prismaGlobal.$queryRawUnsafe<Array<{ c: bigint }>>("SELECT COUNT(*)::bigint c FROM eiah_workspace_memberships WHERE workspace_id=$1", workspaceId))[0]!.c);
  const rowsBefore = await count();
  const summary = await read(workspaceId, users.actor!);
  const after = await row(workspaceId, users.actor!);
  assert.equal(summary.selectedRoleKey, "founder"); assert.equal(after.role_key, "founder"); assert.equal(after.status, "active");
  assert.deepEqual(after.permissions, founderReference, "permissões idênticas às de um Founder explícito");
  assert.equal(summary.canManageMembers, true); assert.equal(summary.permissions.includes("products.activate"), true);
  assert.equal(await count(), rowsBefore);
  // repetida: estável e sem nova escrita
  const stamp = (await row(workspaceId, users.actor!)).updated_at.getTime();
  const again = await read(workspaceId, users.actor!);
  assert.equal(again.selectedRoleKey, "founder"); assert.equal((await row(workspaceId, users.actor!)).updated_at.getTime(), stamp);
  const invitation = await createWorkspaceInvitation({ tenantId, workspaceId, invitedByUserId: users.actor!, email: `pg-ok-${id}@example.com`, roleKey: "corretor" });
  assert.equal(invitation.status, "pending");
});

test("dois membros ativos: ninguém é promovido; ativo + inativo: o ativo (sozinho) é promovido e o inativo não", async () => {
  const two = await world([{ key: "a", role: "corretor" }, { key: "b", role: "corretor" }]);
  await read(two.workspaceId, two.users.a!); await read(two.workspaceId, two.users.b!);
  assert.equal((await row(two.workspaceId, two.users.a!)).role_key, "corretor"); assert.equal((await row(two.workspaceId, two.users.b!)).role_key, "corretor");
  const mixed = await world([{ key: "active", role: "corretor" }, { key: "idle", role: "corretor", status: "inactive" }]);
  await read(mixed.workspaceId, mixed.users.idle!); // o inativo lê primeiro: não pode promover a si nem ao ativo
  assert.equal((await row(mixed.workspaceId, mixed.users.idle!)).role_key, "corretor"); assert.equal((await row(mixed.workspaceId, mixed.users.active!)).role_key, "corretor");
  await read(mixed.workspaceId, mixed.users.active!);
  assert.equal((await row(mixed.workspaceId, mixed.users.active!)).role_key, "founder", "legítimo: único ativo");
  assert.equal((await row(mixed.workspaceId, mixed.users.idle!)).role_key, "corretor");
  assert.equal((await row(mixed.workspaceId, mixed.users.idle!)).status, "inactive");
});

test("ator sem vínculo: a regra de bootstrap (inalterada) decide; a promoção não cria nem eleva ninguém", async () => {
  const oneActive = await world([{ key: "x", role: "corretor" }]);
  const newcomer = `pg-new-${id}`;
  await prismaGlobal.user.create({ data: { id: newcomer, tenantId, email: `pg-new-${id}@example.com` } });
  const s1 = await read(oneActive.workspaceId, newcomer);
  assert.equal(s1.selectedRoleKey, "corretor", "bootstrap padrão (não é promoção)");
  await read(oneActive.workspaceId, newcomer);
  assert.equal((await row(oneActive.workspaceId, newcomer)).role_key, "corretor", "agora há 2 ativos: sem promoção");
  assert.equal((await row(oneActive.workspaceId, oneActive.users.x!)).role_key, "corretor");
});

test("concorrência determinística: revogação DURANTE a promoção não é desfeita (sem reativação) nem vira privilégio", async () => {
  const { workspaceId, users } = await world([{ key: "actor", role: "corretor" }]);
  const slow = delayed(prismaGlobal, /(UPDATE|INSERT INTO) eiah_workspace_memberships/, 400);
  const pending = read(workspaceId, users.actor!, slow);
  await sleep(150);
  await prismaGlobal.$executeRaw`UPDATE eiah_workspace_memberships SET status='revoked' WHERE workspace_id=${workspaceId} AND user_id=${users.actor!}`;
  await pending;
  const after = await row(workspaceId, users.actor!);
  assert.equal(after.status, "revoked", "a revogação concorrente permanece (sem reativação)");
  assert.equal(after.role_key, "corretor", "sem promoção após a revogação");
  assert.equal(hasPriv(after.permissions), false);
});

test("concorrência aleatória: 150 pares leitura×revogação em instantes variados — nunca termina ativo; promoção só se ocorreu antes da revogação", async () => {
  let reactivated = 0, promotedBeforeRevoke = 0;
  for (let i = 0; i < 150; i += 1) {
    const { workspaceId, users } = await world([{ key: "actor", role: "corretor" }]);
    const offset = Math.floor(Math.random() * 7);
    await Promise.all([
      read(workspaceId, users.actor!),
      (async () => { await sleep(offset); await prismaGlobal.$executeRaw`UPDATE eiah_workspace_memberships SET status='revoked' WHERE workspace_id=${workspaceId} AND user_id=${users.actor!}`; })(),
    ]);
    const after = await row(workspaceId, users.actor!);
    if (after.status !== "revoked") reactivated += 1;
    if (after.role_key === "founder") promotedBeforeRevoke += 1;
  }
  assert.equal(reactivated, 0, "nenhuma revogação foi desfeita");
  console.log(`# promovidos antes da revogação (legítimo): ${promotedBeforeRevoke}/150`);
});

test("concorrência: outro membro ATIVANDO durante a promoção — o inativo jamais vira Founder e não há deadlock nem erro", async () => {
  let errors = 0, bFounder = 0, aFounder = 0;
  for (let i = 0; i < 100; i += 1) {
    const { workspaceId, users } = await world([{ key: "a", role: "corretor" }, { key: "b", role: "corretor", status: "inactive" }]);
    const offset = Math.floor(Math.random() * 7);
    const results = await Promise.allSettled([
      read(workspaceId, users.a!),
      read(workspaceId, users.b!),
      (async () => { await sleep(offset); await prismaGlobal.$executeRaw`UPDATE eiah_workspace_memberships SET status='active' WHERE workspace_id=${workspaceId} AND user_id=${users.b!}`; })(),
    ]);
    errors += results.filter((r) => r.status === "rejected").length;
    if ((await row(workspaceId, users.b!)).role_key === "founder") bFounder += 1;
    if ((await row(workspaceId, users.a!)).role_key === "founder") aFounder += 1;
  }
  console.log(`# ativação concorrente: A promovido (era o único ativo no instante) ${aFounder}/100; B promovido ${bFounder}/100; erros ${errors}`);
  assert.equal(errors, 0, "nenhum erro/deadlock");
  assert.equal(bFounder, 0, "o membro que estava inativo nunca é promovido (A permanece ativo, logo B nunca é o único ativo)");
});

test("concorrência: 4 membros (2 ativos, 2 inativos) lendo ao mesmo tempo com trocas de status — sem erro e sem inativo promovido", async () => {
  let errors = 0, inactiveFounder = 0;
  for (let i = 0; i < 40; i += 1) {
    const { workspaceId, users } = await world([{ key: "a", role: "corretor" }, { key: "b", role: "corretor" }, { key: "c", role: "corretor", status: "inactive" }, { key: "d", role: "corretor", status: "revoked" }]);
    const results = await Promise.allSettled([
      ...["a", "b", "c", "d"].map((k) => read(workspaceId, users[k]!)),
      (async () => { await sleep(Math.floor(Math.random() * 5)); await prismaGlobal.$executeRaw`UPDATE eiah_workspace_memberships SET status='inactive' WHERE workspace_id=${workspaceId} AND user_id=${users.b!}`; })(),
    ]);
    errors += results.filter((r) => r.status === "rejected").length;
    for (const k of ["c", "d"]) { const r = await row(workspaceId, users[k]!); if (r.role_key === "founder" || r.status !== (k === "c" ? "inactive" : "revoked")) inactiveFounder += 1; }
  }
  assert.equal(errors, 0, "nenhum erro/deadlock"); assert.equal(inactiveFounder, 0, "inativos/revogados intactos");
});

test("sombra G2.2: promoção recusada não emite evento; a legítima emite exatamente um", async () => {
  const previous = process.env[WORKSPACE_BOOTSTRAP_SHADOW_ENV_KEY];
  process.env[WORKSPACE_BOOTSTRAP_SHADOW_ENV_KEY] = "true";
  try {
    const refused = await world([{ key: "actor", role: "corretor", status: "inactive" }, { key: "other", role: "corretor" }]);
    const legit = await world([{ key: "actor", role: "corretor" }]);
    await read(refused.workspaceId, refused.users.actor!); await read(legit.workspaceId, legit.users.actor!);
    const events = await prismaGlobal.guardrailAuditLedger.findMany({ where: { tenantId, eventType: WORKSPACE_BOOTSTRAP_SHADOW_EVENT_TYPE } });
    const of = (w: string) => events.filter((e) => e.workspaceId === w);
    assert.equal(of(refused.workspaceId).length, 0); assert.equal(of(legit.workspaceId).length, 1);
    const meta = of(legit.workspaceId)[0]!.metadata as { observation: string; legacy: { activeMemberCount: number } };
    assert.equal(meta.observation, "sole_member_promotion"); assert.equal(meta.legacy.activeMemberCount, 1);
  } finally { if (previous === undefined) delete process.env[WORKSPACE_BOOTSTRAP_SHADOW_ENV_KEY]; else process.env[WORKSPACE_BOOTSTRAP_SHADOW_ENV_KEY] = previous; }
});
