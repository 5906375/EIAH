import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { LOGISTICA_CONTEXT_SCOPE, ORACULO_PREPARATION_WRITE_SCOPE } from "@eiah/contracts";
import { prismaGlobal } from "@repo/db";

import {
  acceptWorkspaceInvitation,
  createWorkspaceInvitation,
  ensureWorkspaceMembershipForUser,
  ensureWorkspaceResponsibilityStore,
  readWorkspaceResponsibleProfile,
} from "../services/workspaceResponsibility";
import { ensureLogisticaMember, logisticaOperator } from "./support/logisticaMemberFixture";

// AUTHZ-CONSOLIDATION-001 — integridade de papéis e de permissões expressas (PostgreSQL descartável, dados sintéticos).
//  1) papel desconhecido é negado sem escrita parcial;
//  2) AUTHZ-4b: leitura/promoção automática não sobrescreve papel nem permissões concedidos de forma expressa (ex.: capacidades `log.*`);
//  3) o bootstrap nunca grava `log.*`, nem quando o papel escolhido por fonte legada tem essas permissões como padrão do catálogo.
const dbUrl = new URL(process.env.DATABASE_URL ?? "x://");
if (!["localhost", "127.0.0.1"].includes(dbUrl.hostname) || !dbUrl.pathname.startsWith("/eiah_logistica_core_")) throw new Error("banco descartável eiah_logistica_core_* exigido");

const id = randomUUID().slice(0, 8);
const tenantId = `ri-t-${id}`;
let n = 0;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
function delayed(prisma: any, match: RegExp, ms: number) {
  const wrap = (fn: Function) => async (strings: TemplateStringsArray, ...values: unknown[]) => { if (match.test(strings.join("?"))) await sleep(ms); return fn.call(prisma, strings, ...values); };
  return new Proxy(prisma, { get(target, prop) {
    const value = Reflect.get(target, prop, target);
    if (prop === "$queryRaw" || prop === "$executeRaw") return wrap(value as Function);
    return typeof value === "function" ? (value as Function).bind(target) : value;
  } });
}
async function world() {
  const k = (n += 1);
  const workspaceId = `ri-w${k}-${id}`;
  await prismaGlobal.workspace.create({ data: { id: workspaceId, tenantId, name: `w${k}` } });
  const user = async (key: string) => {
    const userId = `ri-${key}${k}-${id}`;
    await prismaGlobal.user.create({ data: { id: userId, tenantId, email: `ri-${key}${k}-${id}@example.com`, displayName: key } });
    return userId;
  };
  return { workspaceId, user };
}
type Row = { role_key: string; status: string; permissions: string[]; updated_at: Date };
const row = async (workspaceId: string, userId: string): Promise<Row | undefined> =>
  (await prismaGlobal.$queryRawUnsafe<Row[]>("SELECT role_key, status, permissions, updated_at FROM eiah_workspace_memberships WHERE tenant_id=$1 AND workspace_id=$2 AND user_id=$3", tenantId, workspaceId, userId))[0];
const count = async (workspaceId: string) =>
  Number((await prismaGlobal.$queryRawUnsafe<Array<{ n: bigint }>>("SELECT count(*)::bigint AS n FROM eiah_workspace_memberships WHERE tenant_id=$1 AND workspace_id=$2", tenantId, workspaceId))[0]!.n);
const profile = (workspaceId: string, userId: string, prisma?: unknown) => readWorkspaceResponsibleProfile({ ...(prisma ? { prisma } : {}), tenantId, workspaceId, userId });
const roleInvalid = (error: any) => error?.code === "WORKSPACE_ROLE_INVALID" && error?.status === 400;
const isLog = (permission: string) => permission.startsWith("log.");

before(async () => {
  await prismaGlobal.tenant.create({ data: { id: tenantId, name: "role integrity" } });
  await ensureWorkspaceResponsibilityStore(prismaGlobal);
});
after(async () => { await prismaGlobal.$disconnect(); });

test("papel desconhecido: nega com WORKSPACE_ROLE_INVALID, não cria vínculo e nunca vira founder", async () => {
  const w = await world();
  const u = await w.user("new");
  for (const roleKey of ["papel_inexistente", "Fundador", "super admin", ""]) {
    await assert.rejects(ensureWorkspaceMembershipForUser({ tenantId, workspaceId: w.workspaceId, userId: u, roleKey }), roleInvalid, JSON.stringify(roleKey));
  }
  assert.equal(await row(w.workspaceId, u), undefined, "nenhum vínculo foi criado");
  assert.equal(await count(w.workspaceId), 0);
});

test("papel desconhecido sobre vínculo existente: nega e o vínculo fica IDÊNTICO (papel, permissões, status, updated_at)", async () => {
  const w = await world();
  const u = await w.user("member");
  await ensureWorkspaceMembershipForUser({ tenantId, workspaceId: w.workspaceId, userId: u, roleKey: "corretor" });
  const before = await row(w.workspaceId, u);
  await assert.rejects(ensureWorkspaceMembershipForUser({ tenantId, workspaceId: w.workspaceId, userId: u, roleKey: "papel_inexistente", permissions: ["products.activate"] }), roleInvalid);
  assert.deepEqual(await row(w.workspaceId, u), before, "nenhuma modificação parcial");
  assert.equal(before!.role_key, "corretor");
});

test("papéis válidos preservam o comportamento (normalização de chave incluída)", async () => {
  const w = await world();
  const expected: Array<[string, string, (permissions: string[]) => void]> = [
    ["founder", "founder", (p) => { assert.ok(p.includes("workspace.manage_members") && p.includes("products.activate")); }],
    ["gestor", "gestor", (p) => { assert.ok(p.includes("workspace.manage_members")); assert.ok(!p.includes("products.activate")); }],
    ["  Corretor ", "corretor", (p) => { assert.deepEqual(p, ["imob.chat.use", "imob.stage.*"]); }],
    ["assistente", "assistente", (p) => { assert.deepEqual(p, ["imob.chat.use"]); }],
  ];
  for (const [input, roleKey, check] of expected) {
    const userId = await w.user(roleKey);
    await ensureWorkspaceMembershipForUser({ tenantId, workspaceId: w.workspaceId, userId, roleKey: input });
    const stored = await row(w.workspaceId, userId);
    assert.equal(stored!.role_key, roleKey);
    check(stored!.permissions);
  }
  // papel customizado REGISTRADO no catálogo mantém as permissões expressas
  const op = await w.user("op");
  await ensureLogisticaMember(prismaGlobal, { tenantId, workspaceId: w.workspaceId, userId: op, ...logisticaOperator() });
  const stored = await row(w.workspaceId, op);
  assert.equal(stored!.role_key, "logistica_operador");
  assert.ok(stored!.permissions.includes(LOGISTICA_CONTEXT_SCOPE) && stored!.permissions.includes(ORACULO_PREPARATION_WRITE_SCOPE));
});

test("convite cujo papel saiu do catálogo: aceitar nega e não deixa usuário nem vínculo parciais (transação revertida)", async () => {
  const w = await world();
  const inviter = await w.user("inviter");
  await ensureWorkspaceMembershipForUser({ tenantId, workspaceId: w.workspaceId, userId: inviter, roleKey: "founder" });
  await prismaGlobal.$executeRaw`INSERT INTO eiah_workspace_roles (tenant_id, workspace_id, role_key, label, default_permissions, created_at, updated_at) VALUES (${tenantId}, ${w.workspaceId}, 'papel_temporario', 'papel_temporario', '["imob.chat.use"]'::jsonb, NOW(), NOW())`;
  const email = `ri-invited-${id}-${n}@example.com`;
  const invitation = await createWorkspaceInvitation({ tenantId, workspaceId: w.workspaceId, invitedByUserId: inviter, email, roleKey: "papel_temporario", permissions: ["imob.chat.use"] });
  await assert.rejects(
    createWorkspaceInvitation({ tenantId, workspaceId: w.workspaceId, invitedByUserId: inviter, email: `x-${email}`, roleKey: "papel_inexistente" }),
    roleInvalid, "criar convite com papel inexistente já era negado e continua negado");
  await prismaGlobal.$executeRaw`DELETE FROM eiah_workspace_roles WHERE tenant_id=${tenantId} AND workspace_id=${w.workspaceId} AND role_key='papel_temporario'`;
  const membersBefore = await count(w.workspaceId);
  await assert.rejects(acceptWorkspaceInvitation({ token: invitation.token, email, fullName: "Convidado Sintético" }), roleInvalid);
  assert.equal(await count(w.workspaceId), membersBefore, "nenhum vínculo novo");
  assert.equal(await prismaGlobal.user.count({ where: { email } }), 0, "nenhum usuário parcial");
});

test("AUTHZ-4b: o ÚNICO membro com capacidades da Logística expressas não é promovido nem sobrescrito por leituras de perfil", async () => {
  const w = await world();
  const u = await w.user("solo");
  await ensureLogisticaMember(prismaGlobal, { tenantId, workspaceId: w.workspaceId, userId: u, ...logisticaOperator() });
  const before = await row(w.workspaceId, u);
  for (let i = 0; i < 3; i += 1) {
    const read = await profile(w.workspaceId, u);
    assert.ok(read.permissions.includes(LOGISTICA_CONTEXT_SCOPE), "a capacidade continua efetiva");
  }
  assert.deepEqual(await row(w.workspaceId, u), before, "papel, permissões e updated_at intactos após leituras");
  assert.equal(before!.role_key, "logistica_operador");
});

test("AUTHZ-4b: permissão expressa além do padrão (products.activate num corretor) e etapas expressas (assistente) impedem a promoção", async () => {
  const w = await world();
  const granted = await w.user("granted");
  await ensureWorkspaceMembershipForUser({ tenantId, workspaceId: w.workspaceId, userId: granted, roleKey: "corretor", permissions: ["products.activate"] });
  const beforeGranted = await row(w.workspaceId, granted);
  assert.ok(beforeGranted!.permissions.includes("products.activate"));
  await profile(w.workspaceId, granted);
  assert.deepEqual(await row(w.workspaceId, granted), beforeGranted, "não virou founder e não perdeu a permissão");

  const w2 = await world();
  const staged = await w2.user("staged");
  await ensureWorkspaceMembershipForUser({ tenantId, workspaceId: w2.workspaceId, userId: staged, roleKey: "assistente", permissions: ["imob.stage.documentos"] });
  const beforeStaged = await row(w2.workspaceId, staged);
  assert.ok(beforeStaged!.permissions.includes("imob.stage.documentos"));
  await profile(w2.workspaceId, staged);
  assert.deepEqual(await row(w2.workspaceId, staged), beforeStaged, "etapa expressa preservada, sem promoção");
});

test("AUTHZ-4b: política legada preservada — o único membro ativo só com as permissões PADRÃO do papel continua sendo promovido", async () => {
  const w = await world();
  const u = await w.user("default");
  await ensureWorkspaceMembershipForUser({ tenantId, workspaceId: w.workspaceId, userId: u, roleKey: "corretor" });
  await profile(w.workspaceId, u);
  const promoted = await row(w.workspaceId, u);
  assert.equal(promoted!.role_key, "founder");
  assert.ok(promoted!.permissions.includes("workspace.manage_members"));
  assert.ok(!promoted!.permissions.some(isLog), "a promoção nunca cria capacidade da Logística");
});

test("AUTHZ-4b: concessão expressa concorrente durante a promoção não é desfeita (a gravação é condicional às permissões padrão)", async () => {
  const w = await world();
  const u = await w.user("race");
  await ensureWorkspaceMembershipForUser({ tenantId, workspaceId: w.workspaceId, userId: u, roleKey: "corretor" });
  const slow = delayed(prismaGlobal, /UPDATE eiah_workspace_memberships AS m/, 400);
  const reading = profile(w.workspaceId, u, slow);
  await sleep(120);
  await prismaGlobal.$executeRaw`UPDATE eiah_workspace_memberships SET permissions = permissions || ${JSON.stringify([LOGISTICA_CONTEXT_SCOPE])}::jsonb WHERE tenant_id=${tenantId} AND workspace_id=${w.workspaceId} AND user_id=${u}`;
  await reading;
  const after = await row(w.workspaceId, u);
  assert.equal(after!.role_key, "corretor", "não foi promovido por cima da concessão");
  assert.ok(after!.permissions.includes(LOGISTICA_CONTEXT_SCOPE), "a concessão expressa permaneceu");
});

test("revogação continua efetiva: vínculo revogado com capacidades gravadas não tem permissão efetiva, não é promovido nem reativado", async () => {
  const w = await world();
  const u = await w.user("revoked");
  await ensureLogisticaMember(prismaGlobal, { tenantId, workspaceId: w.workspaceId, userId: u, ...logisticaOperator() });
  await prismaGlobal.$executeRaw`UPDATE eiah_workspace_memberships SET status='revoked' WHERE tenant_id=${tenantId} AND workspace_id=${w.workspaceId} AND user_id=${u}`;
  const before = await row(w.workspaceId, u);
  const read = await profile(w.workspaceId, u);
  assert.deepEqual(read.permissions, [], "sem permissão operacional efetiva");
  assert.deepEqual(await row(w.workspaceId, u), before, "o registro persistido não mudou");
});

test("bootstrap nunca concede `log.*`: nem quando a fonte legada escolhe um papel cujo padrão no catálogo carrega as capacidades", async () => {
  const w = await world();
  const founder = await w.user("founder");
  await ensureWorkspaceMembershipForUser({ tenantId, workspaceId: w.workspaceId, userId: founder, roleKey: "founder" });
  await ensureLogisticaMember(prismaGlobal, { tenantId, workspaceId: w.workspaceId, userId: founder, ...logisticaOperator() }); // registra o papel no catálogo
  await ensureWorkspaceMembershipForUser({ tenantId, workspaceId: w.workspaceId, userId: founder, roleKey: "founder" });
  const stranger = await w.user("stranger");
  await prismaGlobal.$executeRaw`INSERT INTO eiah_workspace_role_assignments (user_id, tenant_id, workspace_id, role_key) VALUES (${stranger}, ${tenantId}, ${w.workspaceId}, 'logistica_operador')`;
  assert.equal(await row(w.workspaceId, stranger), undefined);
  const read = await profile(w.workspaceId, stranger);
  const stored = await row(w.workspaceId, stranger);
  assert.ok(stored, "o bootstrap legado criou o vínculo (comportamento existente)");
  assert.ok(!stored!.permissions.some(isLog), `sem capacidade da Logística: ${JSON.stringify(stored!.permissions)}`);
  assert.ok(!read.permissions.some(isLog));
});
