import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import supertest from "supertest";
import { prismaGlobal } from "@repo/db";
import { ensureWorkspaceMembershipForUser, readWorkspaceResponsibleProfile } from "../services/workspaceResponsibility";

let request: ReturnType<typeof supertest>;

const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const tenantId = `tenant-workspace-members-${suffix}`;
const workspaceId = `workspace-workspace-members-${suffix}`;
const inviterUserId = `user-workspace-manager-${suffix}`;
const inviterToken = `tok-workspace-manager-${suffix}`;
const corretorUserId = `user-workspace-corretor-${suffix}`;
const corretorToken = `tok-workspace-corretor-${suffix}`;
const assistenteUserId = `user-workspace-assistente-${suffix}`;
const assistenteToken = `tok-workspace-assistente-${suffix}`;
const allowedCaseId = `case-stage-allowed-${suffix}`;
const blockedCaseId = `case-stage-blocked-${suffix}`;

before(async () => {
  process.env.NODE_ENV = "test";
  const { default: app } = await import("../index");
  request = supertest(app);

  await prismaGlobal.tenant.create({ data: { id: tenantId, name: `Tenant ${suffix}` } });
  await prismaGlobal.workspace.create({ data: { id: workspaceId, tenantId, name: `Workspace ${suffix}` } });
  await prismaGlobal.user.createMany({
    data: [
      {
        id: inviterUserId,
        tenantId,
        email: `manager-${suffix}@example.com`,
        displayName: "Workspace Manager",
      },
      {
        id: corretorUserId,
        tenantId,
        email: `corretor-base-${suffix}@example.com`,
        displayName: "Corretor Base",
      },
      {
        id: assistenteUserId,
        tenantId,
        email: `assistente-base-${suffix}@example.com`,
        displayName: "Assistente Base",
      },
    ],
  });
  await prismaGlobal.apiToken.createMany({
    data: [
      {
        token: inviterToken,
        tenantId,
        workspaceId,
        userId: inviterUserId,
        description: "workspace-membership-manager-test",
        revoked: false,
      },
      {
        token: corretorToken,
        tenantId,
        workspaceId,
        userId: corretorUserId,
        description: "workspace-membership-corretor-test",
        revoked: false,
      },
      {
        token: assistenteToken,
        tenantId,
        workspaceId,
        userId: assistenteUserId,
        description: "workspace-membership-assistente-test",
        revoked: false,
      },
    ],
  });
  await ensureWorkspaceMembershipForUser({
    tenantId,
    workspaceId,
    userId: inviterUserId,
    roleKey: "gestor",
  });
  await ensureWorkspaceMembershipForUser({
    tenantId,
    workspaceId,
    userId: corretorUserId,
    roleKey: "corretor",
  });
  await ensureWorkspaceMembershipForUser({
    tenantId,
    workspaceId,
    userId: assistenteUserId,
    roleKey: "assistente",
    permissions: ["imob.chat.use", "imob.stage.pending_data"],
  });
  await prismaGlobal.imobCase.createMany({
    data: [
      {
        id: allowedCaseId,
        tenantId,
        workspaceId,
        flow: "owner.create",
        stage: "pending_data",
        status: "pending_data",
      },
      {
        id: blockedCaseId,
        tenantId,
        workspaceId,
        flow: "owner.create",
        stage: "qualified",
        status: "qualified",
      },
    ],
  });
});

after(async () => {
  await prismaGlobal.imobCaseEvent.deleteMany({ where: { tenantId } }).catch(() => undefined);
  await prismaGlobal.imobCase.deleteMany({ where: { tenantId } }).catch(() => undefined);
  await prismaGlobal.apiToken.deleteMany({ where: { tenantId } });
  await prismaGlobal.user.deleteMany({ where: { tenantId } });
  await prismaGlobal.workspace.deleteMany({ where: { tenantId } });
  await prismaGlobal.tenant.deleteMany({ where: { id: tenantId } });
  await prismaGlobal.$disconnect();
});

test("workspace invitation creates official membership and profile resolves responsible from membership", async () => {
  const invitationResponse = await request
    .post("/api/profile/workspace-members/invitations")
    .set("Authorization", `Bearer ${inviterToken}`)
    .send({
      email: `corretor-${suffix}@example.com`,
      fullName: "Corretor Convidado",
      roleKey: "corretor",
    });

  assert.equal(invitationResponse.status, 201);
  assert.equal(invitationResponse.body?.ok, true);
  assert.equal(invitationResponse.body?.data?.roleLabel, "Corretor");
  assert.match(String(invitationResponse.body?.data?.token ?? ""), /^wsi_/i);

  const previewResponse = await request
    .post("/api/auth/workspace-invitations/preview")
    .send({ token: invitationResponse.body.data.token });

  assert.equal(previewResponse.status, 200);
  assert.equal(previewResponse.body?.ok, true);
  assert.equal(previewResponse.body?.data?.workspaceId, workspaceId);
  assert.equal(previewResponse.body?.data?.roleLabel, "Corretor");

  const acceptResponse = await request
    .post("/api/auth/workspace-invitations/accept")
    .send({
      token: invitationResponse.body.data.token,
      email: `corretor-${suffix}@example.com`,
      fullName: "Corretor Convidado",
      password: "SenhaSegura123",
    });

  assert.equal(acceptResponse.status, 201);
  assert.equal(acceptResponse.body?.ok, true);
  assert.equal(acceptResponse.body?.data?.roleLabel, "Corretor");
  assert.match(String(acceptResponse.body?.data?.token ?? ""), /^tok_/i);

  const invitedProfile = await request
    .get("/api/profile/me")
    .set("Authorization", `Bearer ${acceptResponse.body.data.token}`);

  assert.equal(invitedProfile.status, 200);
  assert.equal(invitedProfile.body?.ok, true);
  assert.equal(invitedProfile.body?.data?.workspace?.roleLabel, "Corretor");
  assert.match(invitedProfile.body?.data?.workspace?.responsibleLabel ?? "", /Corretor Convidado \(Corretor\)/i);
  assert.equal(
    invitedProfile.body?.data?.workspace?.members?.some((item: { email: string }) => item.email === `corretor-${suffix}@example.com`),
    true
  );
});


test("corretor cannot invite workspace members", async () => {
  const response = await request
    .post("/api/profile/workspace-members/invitations")
    .set("Authorization", `Bearer ${corretorToken}`)
    .send({
      email: `blocked-${suffix}@example.com`,
      fullName: "Invite Blocked",
      roleKey: "assistente",
      permissions: ["imob.stage.pending_data"],
    });

  assert.equal(response.status, 403);
  assert.equal(response.body?.ok, false);
  assert.equal(response.body?.error?.code, "WORKSPACE_MEMBERS_FORBIDDEN");
});

test("assistant invitation keeps only IMOB and allowed stage permissions", async () => {
  const response = await request
    .post("/api/profile/workspace-members/invitations")
    .set("Authorization", `Bearer ${inviterToken}`)
    .send({
      email: `assistente-invite-${suffix}@example.com`,
      fullName: "Assistente Etapas",
      roleKey: "assistente",
      permissions: ["workspace.manage_members", "imob.stage.pending_data", "imob.stage.ready_for_review"],
    });

  assert.equal(response.status, 201);
  assert.equal(response.body?.ok, true);
  assert.deepEqual(response.body?.data?.permissions, [
    "imob.chat.use",
    "imob.stage.pending_data",
    "imob.stage.ready_for_review",
  ]);
});

test("assistant can only operate allowed IMOB stages", async () => {
  const allowedResponse = await request
    .patch(`/api/imob/cases/${allowedCaseId}`)
    .set("Authorization", `Bearer ${assistenteToken}`)
    .send({ nextStep: "Revisar documentos pendentes" });

  assert.equal(allowedResponse.status, 200);
  assert.equal(allowedResponse.body?.ok, true);
  assert.equal(allowedResponse.body?.data?.nextStep, "Revisar documentos pendentes");

  const blockedResponse = await request
    .patch(`/api/imob/cases/${blockedCaseId}`)
    .set("Authorization", `Bearer ${assistenteToken}`)
    .send({ nextStep: "Não deveria atualizar" });

  assert.equal(blockedResponse.status, 403);
  assert.equal(blockedResponse.body?.ok, false);
  assert.equal(blockedResponse.body?.error?.code, "IMOB_STAGE_FORBIDDEN");

  const moveStageResponse = await request
    .patch(`/api/imob/cases/${allowedCaseId}`)
    .set("Authorization", `Bearer ${assistenteToken}`)
    .send({ stage: "qualified" });

  assert.equal(moveStageResponse.status, 403);
  assert.equal(moveStageResponse.body?.ok, false);
  assert.equal(moveStageResponse.body?.error?.code, "IMOB_STAGE_FORBIDDEN");
});

test("workspace membership compat layer resolves responsible profile without requiring Prisma WorkspaceMember model", async () => {
  const profile = await readWorkspaceResponsibleProfile({
    prisma: prismaGlobal,
    tenantId,
    workspaceId,
    userId: assistenteUserId,
  });

  assert.equal(profile.selectedRoleKey, "assistente");
  assert.equal(profile.selectedRoleLabel, "Assistente");
  assert.match(profile.responsibleLabel, /Assistente Base \(Assistente\)/i);
  assert.equal(profile.permissions.includes("imob.chat.use"), true);
  assert.equal(profile.permissions.includes("imob.stage.pending_data"), true);
  assert.equal(profile.permissions.includes("workspace.manage_members"), false);
});


test("custom workspace role stores default permissions and invitations inherit them", async () => {
  const updateResponse = await request
    .put("/api/profile/me")
    .set("Authorization", `Bearer ${inviterToken}`)
    .send({
      workspaceRoleOptions: [
        { label: "Founder" },
        { label: "Admin" },
        { label: "Gestor" },
        { label: "Desenvolvedor" },
        { label: "Corretor" },
        { label: "Assistente" },
        { label: "Captador", permissions: ["imob.chat.use", "imob.stage.pending_data"] },
      ],
    });

  assert.equal(updateResponse.status, 200);
  assert.equal(updateResponse.body?.ok, true);

  const invitationResponse = await request
    .post("/api/profile/workspace-members/invitations")
    .set("Authorization", `Bearer ${inviterToken}`)
    .send({
      email: `captador-${suffix}@example.com`,
      fullName: "Captador Workspace",
      roleKey: "captador",
    });

  assert.equal(invitationResponse.status, 201);
  assert.equal(invitationResponse.body?.ok, true);
  assert.deepEqual(invitationResponse.body?.data?.permissions, ["imob.chat.use", "imob.stage.pending_data"]);
});
