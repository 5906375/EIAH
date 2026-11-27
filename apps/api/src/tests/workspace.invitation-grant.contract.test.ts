import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import supertest from "supertest";
import { prismaGlobal } from "@repo/db";
import {
  createWorkspaceInvitation,
  ensureWorkspaceMembershipForUser,
  listWorkspaceRoleOptions,
  PRODUCT_ACTIVATION_PERMISSION,
  readWorkspaceResponsibleProfile,
  upsertWorkspaceRoleConfig,
} from "../services/workspaceResponsibility";

// ADR-011 §2.7: só quem pode ativar produtos concede products.activate; convites valem 72 horas.
// Só quem gerencia funções (workspace.manage_roles: Founder, Gestor) cria ou altera funções.

const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const tenantId = `tenant-invite-grant-${suffix}`;
const workspaceId = `workspace-invite-grant-${suffix}`;
const founderUserId = `user-invite-grant-founder-${suffix}`;
const gestorUserId = `user-invite-grant-gestor-${suffix}`;
const corretorUserId = `user-invite-grant-corretor-${suffix}`;
const corretorToken = `tok-invite-grant-corretor-${suffix}`;
const KEY = PRODUCT_ACTIVATION_PERMISSION;

before(async () => {
  await prismaGlobal.tenant.create({ data: { id: tenantId, name: `Tenant ${suffix}` } });
  await prismaGlobal.workspace.create({ data: { id: workspaceId, tenantId, name: `Workspace ${suffix}` } });
  await prismaGlobal.user.createMany({
    data: [
      { id: founderUserId, tenantId, email: `founder-${suffix}@example.com`, displayName: "Founder" },
      { id: gestorUserId, tenantId, email: `gestor-${suffix}@example.com`, displayName: "Gestor sem chave" },
      { id: corretorUserId, tenantId, email: `corretor-${suffix}@example.com`, displayName: "Corretor" },
    ],
  });
  await ensureWorkspaceMembershipForUser({ tenantId, workspaceId, userId: founderUserId, roleKey: "founder" });
  await ensureWorkspaceMembershipForUser({ tenantId, workspaceId, userId: gestorUserId, roleKey: "gestor" });
  await ensureWorkspaceMembershipForUser({ tenantId, workspaceId, userId: corretorUserId, roleKey: "corretor" });
  await prismaGlobal.apiToken.create({
    data: { token: corretorToken, tenantId, workspaceId, userId: corretorUserId, description: "invite-grant-corretor", revoked: false },
  });
});

after(async () => {
  await prismaGlobal.$executeRaw`DELETE FROM eiah_workspace_invitations WHERE tenant_id = ${tenantId}`.catch(() => undefined);
  await prismaGlobal.$executeRaw`DELETE FROM eiah_workspace_memberships WHERE tenant_id = ${tenantId}`.catch(() => undefined);
  await prismaGlobal.$executeRaw`DELETE FROM eiah_workspace_roles WHERE tenant_id = ${tenantId}`.catch(() => undefined);
  await prismaGlobal.$executeRaw`DELETE FROM eiah_workspace_role_assignments WHERE tenant_id = ${tenantId}`.catch(() => undefined);
  await prismaGlobal.apiToken.deleteMany({ where: { tenantId } });
  await prismaGlobal.user.deleteMany({ where: { tenantId } });
  await prismaGlobal.workspace.deleteMany({ where: { tenantId } });
  await prismaGlobal.tenant.deleteMany({ where: { id: tenantId } });
  await prismaGlobal.$disconnect();
});

async function expectGrantForbidden(promise: Promise<unknown>) {
  await assert.rejects(promise, (error: { code?: string; status?: number }) => {
    assert.equal(error.code, "PRODUCT_ACTIVATION_GRANT_FORBIDDEN");
    assert.equal(error.status, 403);
    return true;
  });
}

test("Founder concede products.activate num convite, que vale 72 horas", async () => {
  const before = Date.now();
  const invitation = await createWorkspaceInvitation({
    tenantId,
    workspaceId,
    invitedByUserId: founderUserId,
    email: `socio-${suffix}@example.com`,
    roleKey: "gestor",
    permissions: [KEY],
  });
  assert.ok(invitation.permissions.includes(KEY));
  const hours = (new Date(invitation.expiresAt).getTime() - before) / 3_600_000;
  assert.ok(hours > 71.9 && hours <= 72.01, `validade de ${hours.toFixed(2)}h`);
});

test("Gestor sem a chave não concede products.activate num convite", async () => {
  await expectGrantForbidden(createWorkspaceInvitation({
    tenantId,
    workspaceId,
    invitedByUserId: gestorUserId,
    email: `tentativa-${suffix}@example.com`,
    roleKey: "corretor",
    permissions: [KEY],
  }));
});

test("Gestor sem a chave não convida alguém como Founder", async () => {
  await expectGrantForbidden(createWorkspaceInvitation({
    tenantId,
    workspaceId,
    invitedByUserId: gestorUserId,
    email: `founder-falso-${suffix}@example.com`,
    roleKey: "founder",
  }));
});

test("Gestor sem a chave convida normalmente sem products.activate", async () => {
  const invitation = await createWorkspaceInvitation({
    tenantId,
    workspaceId,
    invitedByUserId: gestorUserId,
    email: `corretor-${suffix}@example.com`,
    roleKey: "corretor",
  });
  assert.equal(invitation.permissions.includes(KEY), false);
});

test("Gestor sem a chave não põe nem tira products.activate das funções", async () => {
  const roles = (extra: Array<{ label: string; permissions?: string[] }>) => [
    "Founder", "Admin", "Gestor", "Desenvolvedor", "Corretor", "Assistente", ...extra,
  ];

  await upsertWorkspaceRoleConfig({
    tenantId,
    workspaceId,
    userId: gestorUserId,
    roleLabels: roles([{ label: "Captador", permissions: ["imob.chat.use", KEY] }]),
  });
  let options = await listWorkspaceRoleOptions({ tenantId, workspaceId });
  assert.equal(options.find((item) => item.key === "captador")?.defaultPermissions.includes(KEY), false, "não concede");

  await upsertWorkspaceRoleConfig({
    tenantId,
    workspaceId,
    userId: founderUserId,
    roleLabels: roles([{ label: "Socio", permissions: ["imob.chat.use", KEY] }]),
  });
  options = await listWorkspaceRoleOptions({ tenantId, workspaceId });
  assert.equal(options.find((item) => item.key === "socio")?.defaultPermissions.includes(KEY), true, "Founder concede");

  await upsertWorkspaceRoleConfig({
    tenantId,
    workspaceId,
    userId: gestorUserId,
    roleLabels: roles([{ label: "Socio", permissions: ["imob.chat.use"] }]),
  });
  options = await listWorkspaceRoleOptions({ tenantId, workspaceId });
  assert.equal(options.find((item) => item.key === "socio")?.defaultPermissions.includes(KEY), true, "não retira");

  await expectGrantForbidden(createWorkspaceInvitation({
    tenantId,
    workspaceId,
    invitedByUserId: gestorUserId,
    email: `socio-pelo-gestor-${suffix}@example.com`,
    roleKey: "socio",
  }));
});

test("trocar a própria função não dá nem tira products.activate", async () => {
  await expectGrantForbidden(upsertWorkspaceRoleConfig({ tenantId, workspaceId, userId: gestorUserId, selectedRoleKey: "founder" }));

  await upsertWorkspaceRoleConfig({ tenantId, workspaceId, userId: gestorUserId, selectedRoleKey: "socio" });
  const gestorProfile = await readWorkspaceResponsibleProfile({ tenantId, workspaceId, userId: gestorUserId });
  assert.equal(gestorProfile.permissions.includes(KEY), false, "função com a chave não dá a chave a quem não tem");

  await upsertWorkspaceRoleConfig({ tenantId, workspaceId, userId: founderUserId, selectedRoleKey: "gestor" });
  const founderProfile = await readWorkspaceResponsibleProfile({ tenantId, workspaceId, userId: founderUserId });
  assert.equal(founderProfile.permissions.includes(KEY), true, "quem tinha a chave continua com ela");
});

async function expectRolesForbidden(promise: Promise<unknown>) {
  await assert.rejects(promise, (error: { code?: string; status?: number }) => {
    assert.equal(error.code, "WORKSPACE_ROLES_FORBIDDEN");
    assert.equal(error.status, 403);
    return true;
  });
}

test("Corretor salva o perfil reenviando as funções sem mudança, mas não cria nem altera funções", async () => {
  const current = await listWorkspaceRoleOptions({ tenantId, workspaceId });
  assert.ok(current.some((item) => item.label === "Socio"));
  const asSubmitted = current.map((item) => ({ label: item.label, permissions: item.defaultPermissions }));

  await upsertWorkspaceRoleConfig({ tenantId, workspaceId, userId: corretorUserId, roleLabels: asSubmitted });
  assert.deepEqual(await listWorkspaceRoleOptions({ tenantId, workspaceId }), current, "sem mudança, nada é gravado");

  await expectRolesForbidden(upsertWorkspaceRoleConfig({
    tenantId,
    workspaceId,
    userId: corretorUserId,
    roleLabels: [...asSubmitted, { label: "Supervisor", permissions: ["workspace.manage_members"] }],
  }));
  await expectRolesForbidden(upsertWorkspaceRoleConfig({
    tenantId,
    workspaceId,
    userId: corretorUserId,
    roleLabels: asSubmitted.map((item) => item.label === "Socio"
      ? { label: item.label, permissions: ["workspace.manage_members", "workspace.manage_roles"] }
      : item),
  }));
  await expectRolesForbidden(upsertWorkspaceRoleConfig({ tenantId, workspaceId, userId: corretorUserId, selectedRoleKey: "gestor" }));

  assert.deepEqual(await listWorkspaceRoleOptions({ tenantId, workspaceId }), current, "catálogo intacto");
  const profile = await readWorkspaceResponsibleProfile({ tenantId, workspaceId, userId: corretorUserId });
  assert.equal(profile.selectedRoleKey, "corretor", "não se promoveu");
});

test("PUT /api/profile/me: corretor salva o telefone com as funções sem mudança; criar função dá 403 e nada é gravado", async () => {
  process.env.NODE_ENV = "test";
  const { default: app } = await import("../index");
  const request = supertest(app);
  const current = await listWorkspaceRoleOptions({ tenantId, workspaceId });
  const asSubmitted = current.map((item) => ({ label: item.label, permissions: item.defaultPermissions }));

  const saved = await request
    .put("/api/profile/me")
    .set("Authorization", `Bearer ${corretorToken}`)
    .send({ phone: "11999990000", workspaceRoleOptions: asSubmitted });
  assert.equal(saved.status, 200);

  const denied = await request
    .put("/api/profile/me")
    .set("Authorization", `Bearer ${corretorToken}`)
    .send({ phone: "11888880000", workspaceRoleOptions: [...asSubmitted, { label: "Supervisor", permissions: ["workspace.manage_members"] }] });
  assert.equal(denied.status, 403);
  assert.equal(denied.body?.error?.code, "WORKSPACE_ROLES_FORBIDDEN");
  assert.deepEqual(await listWorkspaceRoleOptions({ tenantId, workspaceId }), current, "catálogo intacto");

  const rows = await prismaGlobal.$queryRaw<Array<{ phone: string | null }>>`
    SELECT phone FROM eiah_user_profiles WHERE user_id = ${corretorUserId}
  `;
  assert.equal(rows[0]?.phone, "11999990000", "o salvamento negado não grava nada");
});
