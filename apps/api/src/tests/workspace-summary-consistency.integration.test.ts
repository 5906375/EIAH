import assert from "node:assert/strict";
import { spawn } from "node:child_process";
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

// PROFILE-RACE-001 — `readWorkspaceManagementSummary`: o papel do ator e `members[].roleKey` precisam ser consistentes na MESMA resposta.
// Antes da correção, `listWorkspaceMembers` rodava em paralelo com `readCurrentMembership` (que grava ao criar/promover) e a lista saía obsoleta.
// A ordem é forçada de modo DETERMINÍSTICO por um proxy de latência sobre o Prisma (sem tocar na função). Banco descartável, dados sintéticos.
// Limite: a correção ordena o PRÓPRIO efeito do ator; não torna a lista imune a alterações concorrentes independentes de OUTRAS pessoas (é um instantâneo).
const dbUrl = new URL(process.env.DATABASE_URL ?? "x://");
if (!["localhost", "127.0.0.1"].includes(dbUrl.hostname) || !dbUrl.pathname.startsWith("/eiah_logistica_core_")) throw new Error("banco descartável eiah_logistica_core_* exigido");

const id = randomUUID().slice(0, 8);
const tenantId = `rc-t-${id}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type Rule = { match: RegExp; ms: number };
function delayed(prisma: any, rules: Rule[]) {
  const wrap = (fn: Function) => async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sql = strings.join("?");
    for (const rule of rules) if (rule.match.test(sql)) await sleep(rule.ms);
    return fn.call(prisma, strings, ...values);
  };
  return new Proxy(prisma, { get(target, prop) {
    const value = Reflect.get(target, prop, target);
    if (prop === "$queryRaw" || prop === "$executeRaw") return wrap(value as Function);
    return typeof value === "function" ? (value as Function).bind(target) : value;
  } });
}
const LIST = /FROM eiah_workspace_memberships AS membership/;   // listWorkspaceMembers
const WRITE = /INSERT INTO eiah_workspace_memberships/;         // upsertWorkspaceMembership (bootstrap/promoção)
const ORDERS: Array<[string, Rule[]]> = [["lista ANTES da gravação", [{ match: WRITE, ms: 300 }]], ["lista DEPOIS da gravação", [{ match: LIST, ms: 300 }]], ["sem injeção", []]];

let n = 0;
type Kind = "sole" | "unlinked" | "firstMember" | "profileFounder";
async function freshWorkspace(kind: Kind) {
  const k = (n += 1); // capturado de forma síncrona: chamadas concorrentes não podem compartilhar o mesmo contador
  const workspaceId = `rc-w${k}-${id}`, userId = `rc-u${k}-${id}`, other = `rc-o${k}-${id}`;
  await prismaGlobal.workspace.create({ data: { id: workspaceId, tenantId, name: `w${k}` } });
  await prismaGlobal.user.createMany({ data: [{ id: userId, tenantId, email: `rc-${k}-${id}@example.com`, displayName: "Ator" }, { id: other, tenantId, email: `rc-o${k}-${id}@example.com` }] });
  if (kind === "sole") await ensureWorkspaceMembershipForUser({ tenantId, workspaceId, userId, roleKey: "corretor" });
  if (kind === "unlinked" || kind === "profileFounder") await ensureWorkspaceMembershipForUser({ tenantId, workspaceId, userId: other, roleKey: "corretor" });
  if (kind === "profileFounder") await prismaGlobal.$executeRaw`INSERT INTO eiah_user_profiles (user_id, role, created_at, updated_at) VALUES (${userId}, 'Founder', NOW(), NOW())`;
  return { workspaceId, userId, other };
}
const EXPECTED: Record<Kind, string> = { sole: "founder", unlinked: "corretor", firstMember: "gestor", profileFounder: "founder" };
const roleInList = (summary: { members: Array<{ userId: string; roleKey: string }> }, userId: string) => summary.members.find((m) => m.userId === userId)?.roleKey ?? null;
type Summary = Awaited<ReturnType<typeof readWorkspaceManagementSummary>>;
const stable = (s: Summary) => JSON.parse(JSON.stringify(s, (k, v) => (/At$/.test(k) ? undefined : v)));

before(async () => {
  await prismaGlobal.tenant.create({ data: { id: tenantId, name: "race" } });
  await ensureWorkspaceResponsibilityStore(prismaGlobal);
  await prismaGlobal.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS eiah_user_profiles (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, phone TEXT, cep TEXT, role TEXT, website TEXT, city TEXT, country TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
});
after(async () => { await prismaGlobal.$disconnect(); });

for (const kind of ["sole", "unlinked", "firstMember", "profileFounder"] as Kind[]) {
  test(`${kind}: papel do ator e members[].roleKey são consistentes em qualquer ordem de execução`, async () => {
    const seen: Array<[string, Summary]> = [];
    for (const [label, rules] of ORDERS) {
      const { workspaceId, userId } = await freshWorkspace(kind);
      const summary = await readWorkspaceManagementSummary({ prisma: delayed(prismaGlobal, rules), tenantId, workspaceId, userId });
      assert.equal(summary.selectedRoleKey, EXPECTED[kind], `${label}: papel efetivo do ator (inalterado)`);
      assert.equal(roleInList(summary, userId), summary.selectedRoleKey, `${label}: members[ator].roleKey == papel efetivo`);
      assert.equal(summary.members.filter((m) => m.userId === userId).length, 1, `${label}: ator aparece exatamente uma vez`);
      assert.equal(summary.members.find((m) => m.userId === userId)!.isCurrentUser, true);
      seen.push([label, summary]);
    }
    // com a corrida eliminada, a resposta inteira é a MESMA nas três ordens (mesmos campos além de ids/carimbos)
    const norm = (s: Summary) => JSON.parse(JSON.stringify(stable(s)).replace(/rc-[wuo]\d+-[0-9a-f]{8}|rc-\d+-[0-9a-f]{8}@example\.com|rc-o\d+-[0-9a-f]{8}@example\.com/g, "X"));
    assert.deepEqual(norm(seen[1]![1]), norm(seen[0]![1]));
    assert.deepEqual(norm(seen[2]![1]), norm(seen[0]![1]));
  });
}

test("decisões de autorização inalteradas: papel, permissões, gestão de membros, estado do banco e catálogo", async () => {
  const expectManage: Record<Kind, boolean> = { sole: true, unlinked: false, firstMember: true, profileFounder: true };
  for (const kind of ["sole", "unlinked", "firstMember", "profileFounder"] as Kind[]) {
    const { workspaceId, userId } = await freshWorkspace(kind);
    const before = Number((await prismaGlobal.$queryRawUnsafe<Array<{ c: bigint }>>("SELECT COUNT(*)::bigint c FROM eiah_workspace_memberships WHERE workspace_id=$1", workspaceId))[0]!.c);
    const summary = await readWorkspaceManagementSummary({ tenantId, workspaceId, userId });
    const responsible = await readWorkspaceResponsibleProfile({ tenantId, workspaceId, userId });
    assert.equal(summary.canManageMembers, expectManage[kind], kind);
    assert.deepEqual(responsible.permissions, summary.permissions); assert.equal(responsible.selectedRoleKey, summary.selectedRoleKey); assert.equal(responsible.canManageMembers, summary.canManageMembers);
    const rows = await prismaGlobal.$queryRawUnsafe<Array<{ user_id: string; role_key: string; status: string }>>("SELECT user_id, role_key, status FROM eiah_workspace_memberships WHERE workspace_id=$1 AND user_id=$2", workspaceId, userId);
    assert.equal(rows.length, 1); assert.equal(rows[0]!.role_key, EXPECTED[kind]); assert.equal(rows[0]!.status, "active");
    const after = Number((await prismaGlobal.$queryRawUnsafe<Array<{ c: bigint }>>("SELECT COUNT(*)::bigint c FROM eiah_workspace_memberships WHERE workspace_id=$1", workspaceId))[0]!.c);
    assert.equal(after - before, kind === "sole" ? 0 : 1, "no máximo o vínculo do próprio ator é criado; promoção não cria linha");
    const catalog = Number((await prismaGlobal.$queryRawUnsafe<Array<{ c: bigint }>>("SELECT COUNT(*)::bigint c FROM eiah_workspace_roles WHERE workspace_id=$1", workspaceId))[0]!.c);
    assert.equal(catalog, 6, "catálogo de papéis inalterado (6 padrões)");
    // nenhuma concessão nova
    const extra = await prismaGlobal.$queryRawUnsafe<Array<{ c: bigint }>>("SELECT (SELECT COUNT(*) FROM eiah_workspace_invitations WHERE workspace_id=$1) + (SELECT COUNT(*) FROM tenant_product_installations WHERE workspace_id=$1) + (SELECT COUNT(*) FROM tenant_action_policy WHERE tenant_id=$2) AS c", workspaceId, tenantId);
    assert.equal(Number(extra[0]!.c), 0);
  }
  // consumidor que decide por papel: convidar continua exigindo gestão de membros
  const mgr = await freshWorkspace("firstMember");
  const ok = await createWorkspaceInvitation({ tenantId, workspaceId: mgr.workspaceId, invitedByUserId: mgr.userId, email: `rc-inv-${id}@example.com`, roleKey: "corretor" });
  assert.equal(ok.status, "pending");
  const plain = await freshWorkspace("unlinked");
  await assert.rejects(() => createWorkspaceInvitation({ tenantId, workspaceId: plain.workspaceId, invitedByUserId: plain.userId, email: `rc-inv2-${id}@example.com`, roleKey: "corretor" }), (e: { code?: string; status?: number }) => e.code === "WORKSPACE_MEMBERS_FORBIDDEN" && e.status === 403);
});

test("tempo natural: 60 promoções e 60 criações sem divergência", async () => {
  for (const kind of ["sole", "unlinked"] as Kind[]) {
    let mismatches = 0;
    for (let i = 0; i < 60; i += 1) {
      const { workspaceId, userId } = await freshWorkspace(kind);
      const s = await readWorkspaceManagementSummary({ tenantId, workspaceId, userId });
      if (s.selectedRoleKey !== roleInList(s, userId)) mismatches += 1;
    }
    assert.equal(mismatches, 0, `${kind}: divergências`);
  }
});

test("concorrência e carga: 12 atores simultâneos em workspaces distintos e 4 processos saturando a CPU", async () => {
  const burners = Array.from({ length: 4 }, () => spawn(process.execPath, ["-e", "const t=Date.now();while(Date.now()-t<45000){}"], { stdio: "ignore" }));
  try {
    let mismatches = 0, errors = 0, total = 0;
    for (let round = 0; round < 5; round += 1) {
      const kinds: Kind[] = ["sole", "unlinked", "firstMember", "profileFounder"];
      const jobs = Array.from({ length: 12 }, async (_, i) => {
        const kind = kinds[i % kinds.length]!;
        const { workspaceId, userId } = await freshWorkspace(kind);
        try {
          const s = await readWorkspaceManagementSummary({ tenantId, workspaceId, userId });
          total += 1;
          if (s.selectedRoleKey !== EXPECTED[kind] || s.selectedRoleKey !== roleInList(s, userId)) mismatches += 1;
        } catch { errors += 1; }
      });
      await Promise.all(jobs);
    }
    assert.equal(errors, 0, "nenhum erro/deadlock sob concorrência"); assert.equal(total, 60); assert.equal(mismatches, 0);
  } finally { burners.forEach((b) => b.kill("SIGKILL")); }
});

test("limite documentado: dois atores na MESMA workspace ao mesmo tempo — cada um vê a PRÓPRIA linha consistente (a lista é um instantâneo)", async () => {
  const { workspaceId, other } = await freshWorkspace("unlinked");
  const a = `rc-ca-${id}`, b = `rc-cb-${id}`;
  await prismaGlobal.user.createMany({ data: [{ id: a, tenantId, email: `rc-ca-${id}@example.com` }, { id: b, tenantId, email: `rc-cb-${id}@example.com` }] });
  void other;
  const [sa, sb] = await Promise.all([a, b].map((userId) => readWorkspaceManagementSummary({ tenantId, workspaceId, userId })));
  for (const [s, userId] of [[sa!, a], [sb!, b]] as const) { assert.equal(s.selectedRoleKey, "corretor"); assert.equal(roleInList(s, userId), "corretor"); }
});
