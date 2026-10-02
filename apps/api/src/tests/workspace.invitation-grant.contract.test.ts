import { after, before, test } from "node:test";
import assert from "node:assert/strict";
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

const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const tenantId = `tenant-invite-grant-${suffix}`;
const workspaceId = `workspace-invite-grant-${suffix}`;
const founderUserId = `user-invite-grant-founder-${suffix}`;
const gestorUserId = `user-invite-grant-gestor-${suffix}`;
const KEY = PRODUCT_ACTIVATION_PERMISSION;

before(async () => {
  await prismaGlobal.tenant.create({ data: { id: tenantId, name: `Tenant ${suffix}` } });
  await prismaGlobal.workspace.create({ data: { id: workspaceId, tenantId, name: `Workspace ${suffix}` } });
  await prismaGlobal.user.createMany({
    data: [
      { id: founderUserId, tenantId, email: `founder-${suffix}@example.com`, displayName: "Founder" },
      { id: gestorUserId, tenantId, email: `gestor-${suffix}@example.com`, displayName: "Gestor sem chave" },
    ],
  });
  await ensureWorkspaceMembershipForUser({ tenantId, workspaceId, userId: founderUserId, roleKey: "founder" });
  await ensureWorkspaceMembershipForUser({ tenantId, workspaceId, userId: gestorUserId, roleKey: "gestor" });
});

after(async () => {
  await prismaGlobal.$executeRaw`DELETE FROM eiah_workspace_invitations WHERE tenant_id = ${tenantId}`.catch(() => undefined);
  await prismaGlobal.$executeRaw`DELETE FROM eiah_workspace_memberships WHERE tenant_id = ${tenantId}`.catch(() => undefined);
  await prismaGlobal.$executeRaw`DELETE FROM eiah_workspace_roles WHERE tenant_id = ${tenantId}`.catch(() => undefined);
  await prismaGlobal.$executeRaw`DELETE FROM eiah_workspace_role_assignments WHERE tenant_id = ${tenantId}`.catch(() => undefined);
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
