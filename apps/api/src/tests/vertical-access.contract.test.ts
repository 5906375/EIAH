import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import process from "node:process";
import supertest from "supertest";
import { prismaGlobal, type PrismaClient } from "@repo/db";
import { ensureWorkspaceMembershipForUser, readWorkspaceResponsibleProfile } from "../services/workspaceResponsibility";
import { backfillMigratedApprovals, ensureVerticalAccessStore } from "../services/products/verticalAccessApproval";

// ADR-011 PR 2b: liberação pela EIAH (agente + humano) antes de ativar qualquer vertical.

let request: ReturnType<typeof supertest>;
const prisma = prismaGlobal as unknown as PrismaClient;

const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const adminEmail = `eiah-admin-${suffix}@example.com`;
const tenantId = `tenant-vaccess-${suffix}`;
const workspaceId = `workspace-vaccess-${suffix}`;
const legacyWorkspaceId = `workspace-vaccess-legacy-${suffix}`;
const founderId = `user-vaccess-founder-${suffix}`;
const corretorId = `user-vaccess-corretor-${suffix}`;
const gestorId = `user-vaccess-gestor-${suffix}`;
const adminId = `user-vaccess-admin-${suffix}`;
const tokens = {
  founder: `tok-vaccess-founder-${suffix}`,
  corretor: `tok-vaccess-corretor-${suffix}`,
  admin: `tok-vaccess-admin-${suffix}`,
};

before(async () => {
  process.env.NODE_ENV = "test";
  process.env.EIAH_PLATFORM_ADMIN_EMAILS = `outra-pessoa@example.com, ${adminEmail.toUpperCase()}`;
  const { default: app } = await import("../index");
  request = supertest(app);

  await prismaGlobal.tenant.create({ data: { id: tenantId, name: `Imobiliária ${suffix}` } });
  await prismaGlobal.workspace.createMany({
    data: [
      { id: workspaceId, tenantId, name: `Novo ${suffix}` },
      { id: legacyWorkspaceId, tenantId, name: `Legado ${suffix}` },
    ],
  });
  await prismaGlobal.user.createMany({
    data: [
      { id: founderId, tenantId, email: `founder-${suffix}@example.com`, displayName: "Dona da Imobiliária" },
      { id: corretorId, tenantId, email: `corretor-${suffix}@example.com`, displayName: "Corretor" },
      { id: gestorId, tenantId, email: `gestor-${suffix}@example.com`, displayName: "Gestor que ativou" },
      { id: adminId, tenantId, email: adminEmail, displayName: "Admin EIAH" },
    ],
  });
  await prismaGlobal.apiToken.createMany({
    data: [
      { token: tokens.founder, tenantId, workspaceId, userId: founderId, description: "vaccess-founder", revoked: false },
      { token: tokens.corretor, tenantId, workspaceId, userId: corretorId, description: "vaccess-corretor", revoked: false },
      { token: tokens.admin, tenantId, workspaceId, userId: adminId, description: "vaccess-admin", revoked: false },
    ],
  });
  await ensureWorkspaceMembershipForUser({ tenantId, workspaceId, userId: founderId, roleKey: "founder" });
  await ensureWorkspaceMembershipForUser({ tenantId, workspaceId, userId: corretorId, roleKey: "corretor" });
  await ensureWorkspaceMembershipForUser({ tenantId, workspaceId, userId: adminId, roleKey: "corretor" });
  await ensureWorkspaceMembershipForUser({ tenantId, workspaceId: legacyWorkspaceId, userId: gestorId, roleKey: "gestor" });
  await ensureWorkspaceMembershipForUser({ tenantId, workspaceId: legacyWorkspaceId, userId: founderId, roleKey: "founder" });

  await ensureVerticalAccessStore(prisma);
  // Workspace que já usava o IMOB antes da barreira (ativado pelo Gestor, sem a chave).
  await prismaGlobal.$executeRaw`
    INSERT INTO tenant_product_installations (id, tenant_id, workspace_id, product, status, activated_by_user_id)
    VALUES (${`install-legacy-${suffix}`}, ${tenantId}, ${legacyWorkspaceId}, 'IMOB', 'active', ${gestorId})
  `;
});

after(async () => {
  await prismaGlobal.workspaceAgentAssignment.deleteMany({ where: { tenantId } }).catch(() => undefined);
  await prismaGlobal.tenantActionPolicy.deleteMany({ where: { tenantId } }).catch(() => undefined);
  await prismaGlobal.$executeRaw`DELETE FROM tenant_product_installations WHERE tenant_id = ${tenantId}`;
  await prismaGlobal.$executeRaw`DELETE FROM vertical_access_approval_events WHERE tenant_id = ${tenantId}`;
  await prismaGlobal.$executeRaw`DELETE FROM vertical_access_approvals WHERE tenant_id = ${tenantId}`;
  await prismaGlobal.$executeRaw`DELETE FROM eiah_workspace_memberships WHERE tenant_id = ${tenantId}`.catch(() => undefined);
  await prismaGlobal.$executeRaw`DELETE FROM eiah_workspace_roles WHERE tenant_id = ${tenantId}`.catch(() => undefined);
  await prismaGlobal.apiToken.deleteMany({ where: { tenantId } });
  await prismaGlobal.user.deleteMany({ where: { tenantId } });
  await prismaGlobal.workspace.deleteMany({ where: { tenantId } });
  await prismaGlobal.tenant.deleteMany({ where: { id: tenantId } });
  delete process.env.EIAH_PLATFORM_ADMIN_EMAILS;
  await prismaGlobal.$disconnect();
});

async function approvalRow(ws: string) {
  const rows = await prismaGlobal.$queryRaw<Array<{ id: string; status: string; source: string; decided_by: string | null; score: number | null; recommendation: string | null }>>`
    SELECT id, status, source, decided_by, score, recommendation FROM vertical_access_approvals
    WHERE tenant_id = ${tenantId} AND workspace_id = ${ws} AND vertical = 'IMOB'
  `;
  return rows[0] ?? null;
}

test("migração: quem já usava fica 'aprovado na migração' e quem ativou recebe a chave, uma única vez", async () => {
  await backfillMigratedApprovals(prisma);
  const row = await approvalRow(legacyWorkspaceId);
  assert.equal(row?.status, "aprovado");
  assert.equal(row?.source, "migration");
  assert.equal(row?.decided_by, "system:migration");
  assert.equal(row?.score, null, "sem score na migração");

  let gestor = await readWorkspaceResponsibleProfile({ tenantId, workspaceId: legacyWorkspaceId, userId: gestorId });
  assert.ok(gestor.permissions.includes("products.activate"), "quem ativou recebe a chave");

  // O Founder tira a chave; rodar de novo não devolve.
  await prismaGlobal.$executeRaw`
    UPDATE eiah_workspace_memberships SET permissions = permissions - 'products.activate'
    WHERE user_id = ${gestorId} AND workspace_id = ${legacyWorkspaceId}
  `;
  await backfillMigratedApprovals(prisma);
  gestor = await readWorkspaceResponsibleProfile({ tenantId, workspaceId: legacyWorkspaceId, userId: gestorId });
  assert.equal(gestor.permissions.includes("products.activate"), false);
  assert.equal(await approvalRow(workspaceId), null, "workspace sem IMOB não ganha liberação");
});

test("sem liberação, nada é ativado (Marketplace e chat) — primeiro a liberação, depois a permissão", async () => {
  const marketplace = await request
    .post("/api/marketplace/installations/activate")
    .set("Authorization", `Bearer ${tokens.corretor}`)
    .send({ product: "IMOB" });
  assert.equal(marketplace.status, 403);
  assert.equal(marketplace.body?.error?.code, "VERTICAL_NOT_APPROVED", "a liberação vem antes da permissão");

  const preview = await request
    .post("/api/chat/vertical-activation/preview")
    .set("Authorization", `Bearer ${tokens.founder}`)
    .send({ verticalId: "imob" });
  assert.equal(preview.status, 200);
  assert.equal(preview.body?.data?.status, "approval_required");

  const installs = await prismaGlobal.$queryRaw<Array<{ total: bigint }>>`
    SELECT COUNT(*)::bigint AS total FROM tenant_product_installations WHERE workspace_id = ${workspaceId}
  `;
  assert.equal(Number(installs[0]?.total ?? 0), 0);
});

test("pedido: corretor não pede; Founder pede e o agente pontua sem aprovar", async () => {
  const denied = await request
    .post("/api/vertical-access/request")
    .set("Authorization", `Bearer ${tokens.corretor}`)
    .send({ vertical: "IMOB" });
  assert.equal(denied.status, 403);
  assert.equal(denied.body?.error?.code, "VERTICAL_ACCESS_REQUEST_FORBIDDEN");

  const requested = await request
    .post("/api/vertical-access/request")
    .set("Authorization", `Bearer ${tokens.founder}`)
    .send({ vertical: "IMOB" });
  assert.equal(requested.status, 201);
  assert.equal(requested.body?.data?.status, "aguardando_humano");
  assert.equal(requested.body?.data?.score, undefined, "o cliente não vê o score");

  const row = await approvalRow(workspaceId);
  assert.equal(row?.status, "aguardando_humano");
  // Tenant novo: sem conta de billing e sem pagamento confirmado → 55 (revisar).
  assert.equal(row?.score, 55);
  assert.equal(row?.recommendation, "revisar");

  const again = await request
    .post("/api/vertical-access/request")
    .set("Authorization", `Bearer ${tokens.founder}`)
    .send({ vertical: "IMOB" });
  assert.equal(again.status, 200);
  assert.equal(again.body?.data?.outcome, "already_requested", "pedido aberto não duplica");

  const pending = await request
    .post("/api/marketplace/installations/activate")
    .set("Authorization", `Bearer ${tokens.founder}`)
    .send({ product: "IMOB" });
  assert.equal(pending.status, 403);
  assert.equal(pending.body?.error?.code, "VERTICAL_APPROVAL_PENDING");
});

test("fila do administrador EIAH: invisível para os demais; decisão humana com observação quando exigida", async () => {
  const hidden = await request.get("/api/admin/vertical-approvals").set("Authorization", `Bearer ${tokens.founder}`);
  assert.equal(hidden.status, 404, "Founder do cliente não é administrador EIAH");

  const queue = await request.get("/api/admin/vertical-approvals").set("Authorization", `Bearer ${tokens.admin}`);
  assert.equal(queue.status, 200);
  const item = queue.body?.data?.items?.find((entry: { workspaceName: string }) => entry.workspaceName === `Novo ${suffix}`);
  assert.ok(item, "o pedido aparece na fila");
  assert.equal(item.status, "aguardando_humano");
  assert.equal(item.score, 55);
  assert.ok(Array.isArray(item.scoreReasons) && item.scoreReasons.length > 0, "motivos do score");
  assert.equal(item.requestedBy, "Dona da Imobiliária");
  assert.ok(queue.body.data.awaiting >= 1);

  const noNote = await request
    .post(`/api/admin/vertical-approvals/${item.id}/decision`)
    .set("Authorization", `Bearer ${tokens.admin}`)
    .send({ decision: "recusar" });
  assert.equal(noNote.status, 400);
  assert.equal(noNote.body?.error?.code, "VERTICAL_ACCESS_NOTE_REQUIRED");

  const byClient = await request
    .post(`/api/admin/vertical-approvals/${item.id}/decision`)
    .set("Authorization", `Bearer ${tokens.founder}`)
    .send({ decision: "aprovar" });
  assert.equal(byClient.status, 404, "cliente não aprova o próprio billing");

  const approved = await request
    .post(`/api/admin/vertical-approvals/${item.id}/decision`)
    .set("Authorization", `Bearer ${tokens.admin}`)
    .send({ decision: "aprovar" });
  assert.equal(approved.status, 200);
  assert.equal(approved.body?.data?.status, "aprovado");
  assert.equal(approved.body?.data?.decidedBy, `admin:${adminEmail}`);

  const twice = await request
    .post(`/api/admin/vertical-approvals/${item.id}/decision`)
    .set("Authorization", `Bearer ${tokens.admin}`)
    .send({ decision: "recusar", note: "tarde demais" });
  assert.equal(twice.status, 409);

  const events = await prismaGlobal.$queryRaw<Array<{ to_status: string; actor: string }>>`
    SELECT to_status, actor FROM vertical_access_approval_events
    WHERE approval_id = ${item.id} ORDER BY created_at ASC
  `;
  assert.deepEqual(events.map((event) => event.to_status), ["pendente", "aguardando_humano", "aprovado"]);
  assert.equal(events[1]?.actor, "agent:vertical-access-reviewer");
  assert.equal(events[2]?.actor, `admin:${adminEmail}`);
});

test("com liberação aprovada, o Founder ativa; o cliente vê só o estado", async () => {
  const state = await request.get("/api/vertical-access?vertical=IMOB").set("Authorization", `Bearer ${tokens.founder}`);
  assert.equal(state.status, 200);
  assert.equal(state.body?.data?.status, "aprovado");
  assert.deepEqual(Object.keys(state.body.data).sort(), ["decidedAt", "requestedAt", "status", "vertical"]);

  const activated = await request
    .post("/api/marketplace/installations/activate")
    .set("Authorization", `Bearer ${tokens.founder}`)
    .send({ product: "IMOB" });
  assert.equal(activated.status, 200);
  assert.equal(activated.body?.installation?.status, "active");
});
