import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import process from "node:process";
import supertest from "supertest";
import { prismaGlobal, type PrismaClient } from "@repo/db";
import { ensureWorkspaceMembershipForUser } from "../services/workspaceResponsibility";
import { ensureVerticalAccessStore } from "../services/products/verticalAccessApproval";

// ADR-011 §2.7 (PR 2d): criação de acessos pelo front door por link de uso único (72 h).

let request: ReturnType<typeof supertest>;
const prisma = prismaGlobal as unknown as PrismaClient;

const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const tenantId = `tenant-fdaccess-${suffix}`;
const workspaceId = `workspace-fdaccess-${suffix}`;
const founderId = `user-fdaccess-founder-${suffix}`;
const gestorId = `user-fdaccess-gestor-${suffix}`;
const corretorId = `user-fdaccess-corretor-${suffix}`;
const existingId = `user-fdaccess-existing-${suffix}`;
const tokens = {
  founder: `tok-fdaccess-founder-${suffix}`,
  gestor: `tok-fdaccess-gestor-${suffix}`,
  corretor: `tok-fdaccess-corretor-${suffix}`,
};
const newEmail = `nova.pessoa-${suffix}@example.com`;
const existingEmail = `ja.tem.conta-${suffix}@example.com`;

before(async () => {
  process.env.NODE_ENV = "test";
  const { default: app } = await import("../index");
  request = supertest(app);
  await prismaGlobal.tenant.create({ data: { id: tenantId, name: `Imobiliária ${suffix}` } });
  await prismaGlobal.workspace.create({ data: { id: workspaceId, tenantId, name: `Principal ${suffix}` } });
  await prismaGlobal.user.createMany({
    data: [
      { id: founderId, tenantId, email: `founder-${suffix}@example.com`, displayName: "Founder" },
      { id: gestorId, tenantId, email: `gestor-${suffix}@example.com`, displayName: "Gestor" },
      { id: corretorId, tenantId, email: `corretor-${suffix}@example.com`, displayName: "Corretor" },
      { id: existingId, tenantId, email: existingEmail, displayName: "Já tem conta" },
    ],
  });
  await prismaGlobal.apiToken.createMany({
    data: [
      { token: tokens.founder, tenantId, workspaceId, userId: founderId, description: "fd-founder", revoked: false },
      { token: tokens.gestor, tenantId, workspaceId, userId: gestorId, description: "fd-gestor", revoked: false },
      { token: tokens.corretor, tenantId, workspaceId, userId: corretorId, description: "fd-corretor", revoked: false },
    ],
  });
  await ensureWorkspaceMembershipForUser({ tenantId, workspaceId, userId: founderId, roleKey: "founder" });
  await ensureWorkspaceMembershipForUser({ tenantId, workspaceId, userId: gestorId, roleKey: "gestor" });
  await ensureWorkspaceMembershipForUser({ tenantId, workspaceId, userId: corretorId, roleKey: "corretor" });
  await ensureVerticalAccessStore(prisma);
});

after(async () => {
  await prismaGlobal.$executeRaw`DELETE FROM eiah_workspace_invitations WHERE tenant_id = ${tenantId}`;
  await prismaGlobal.$executeRaw`DELETE FROM vertical_access_approvals WHERE tenant_id = ${tenantId}`;
  await prismaGlobal.$executeRaw`DELETE FROM legacy_auth_credentials WHERE user_id IN (SELECT id FROM users WHERE tenant_id = ${tenantId})`.catch(() => undefined);
  await prismaGlobal.$executeRaw`DELETE FROM eiah_workspace_memberships WHERE tenant_id = ${tenantId}`.catch(() => undefined);
  await prismaGlobal.$executeRaw`DELETE FROM eiah_workspace_roles WHERE tenant_id = ${tenantId}`.catch(() => undefined);
  await prismaGlobal.apiToken.deleteMany({ where: { tenantId } });
  await prismaGlobal.user.deleteMany({ where: { tenantId } });
  await prismaGlobal.workspace.deleteMany({ where: { tenantId } });
  await prismaGlobal.tenant.deleteMany({ where: { id: tenantId } });
  await prismaGlobal.$disconnect();
});

const options = (token: string) => request.get("/api/front-door/accesses/options").set("Authorization", `Bearer ${token}`);
const create = (token: string, body: Record<string, unknown>) =>
  request.post("/api/front-door/accesses").set("Authorization", `Bearer ${token}`).send(body);
const preview = (token: string) => request.post("/api/auth/workspace-invitations/preview").send({ token });

test("sem vertical liberada pela EIAH, ninguém cria acesso pelo front door; corretor nunca", async () => {
  const founder = await options(tokens.founder);
  assert.equal(founder.status, 200);
  assert.equal(founder.body.data.allowed, false);
  assert.equal(founder.body.data.reason, "NO_APPROVED_VERTICAL");
  assert.deepEqual(founder.body.data.roles, []);
  const denied = await create(tokens.founder, { email: newEmail, roleKey: "corretor" });
  assert.equal(denied.status, 403);
  assert.equal(denied.body.error.code, "FRONT_DOOR_ACCESS_NO_APPROVED_VERTICAL");

  await prismaGlobal.$executeRaw`
    INSERT INTO vertical_access_approvals (id, tenant_id, workspace_id, vertical, status, source, decided_by, decided_at)
    VALUES (${`appr-${suffix}`}, ${tenantId}, ${workspaceId}, 'IMOB', 'aprovado', 'request', 'admin:test@example.com', NOW())
  `;
  const corretor = await options(tokens.corretor);
  assert.equal(corretor.body.data.allowed, false);
  assert.equal(corretor.body.data.reason, "MEMBERS_FORBIDDEN");
  assert.equal((await create(tokens.corretor, { email: newEmail, roleKey: "corretor" })).status, 403);
});

test("com vertical liberada: Founder cria; link de uso único, 72 h, e-mail mascarado; Founder não é concedido", async () => {
  const founder = await options(tokens.founder);
  assert.equal(founder.body.data.allowed, true);
  const roleKeys = founder.body.data.roles.map((role: { key: string }) => role.key);
  assert.equal(roleKeys.includes("founder"), false);
  assert.ok(roleKeys.includes("corretor"));

  assert.equal((await create(tokens.founder, { email: newEmail, roleKey: "founder" })).status, 403);

  const created = await create(tokens.founder, { email: newEmail.toUpperCase(), fullName: "Nova Pessoa", roleKey: "corretor" });
  assert.equal(created.status, 201);
  assert.match(created.body.data.token, /^wsi_/);
  assert.equal(created.body.data.maskedEmail, `no***@example.com`);
  assert.equal(created.body.data.accountExists, false);
  const hours = (new Date(created.body.data.expiresAt).getTime() - Date.now()) / 3_600_000;
  assert.ok(hours > 71.9 && hours <= 72, `validade de 72 h (${hours})`);
  assert.equal(JSON.stringify(created.body).includes(newEmail), false, "a resposta não devolve o e-mail aberto");

  const profile = await request.get("/api/profile/me").set("Authorization", `Bearer ${tokens.founder}`);
  const listed = profile.body.data.workspace.invitations.find((item: { email: string }) => item.email === newEmail);
  assert.ok(listed, "convite aparece na lista do perfil");
  assert.equal(listed.token, undefined, "a lista nunca devolve o link");
});

test("link novo para o mesmo e-mail invalida o anterior; reemitir também; o link vale uma vez", async () => {
  const first = await create(tokens.founder, { email: newEmail, roleKey: "corretor" });
  const second = await create(tokens.founder, { email: newEmail, roleKey: "corretor" });
  assert.equal((await preview(first.body.data.token)).body.data.status, "revoked");

  const reissued = await request
    .post(`/api/profile/workspace-members/invitations/${second.body.data.invitationId}/reissue`)
    .set("Authorization", `Bearer ${tokens.founder}`)
    .send({});
  assert.equal(reissued.status, 201);
  assert.notEqual(reissued.body.data.token, second.body.data.token);
  assert.equal((await preview(second.body.data.token)).body.data.status, "revoked");
  const again = await request
    .post(`/api/profile/workspace-members/invitations/${second.body.data.invitationId}/reissue`)
    .set("Authorization", `Bearer ${tokens.founder}`)
    .send({});
  assert.equal(again.status, 409, "link já substituído não é reemitido");

  const oldAccept = await request
    .post("/api/auth/workspace-invitations/accept")
    .send({ token: first.body.data.token, email: newEmail, fullName: "Nova Pessoa", password: "senha-segura-123" });
  assert.equal(oldAccept.status, 409, "link antigo não vale");

  const accepted = await request
    .post("/api/auth/workspace-invitations/accept")
    .send({ token: reissued.body.data.token, email: newEmail, fullName: "Nova Pessoa", password: "senha-segura-123" });
  assert.equal(accepted.status, 201);
  assert.equal(accepted.body.data.workspaceId, workspaceId);
  const reuse = await request
    .post("/api/auth/workspace-invitations/accept")
    .send({ token: reissued.body.data.token, email: newEmail, fullName: "Nova Pessoa", password: "senha-segura-123" });
  assert.equal(reuse.status, 409, "uso único");

  const member = await create(tokens.founder, { email: newEmail, roleKey: "corretor" });
  assert.equal(member.status, 409);
  assert.equal(member.body.error.code, "FRONT_DOOR_ACCESS_ALREADY_MEMBER");
});

test("e-mail que já tem conta: o link só adiciona ao workspace pelo login", async () => {
  const created = await create(tokens.gestor, { email: existingEmail, roleKey: "corretor" });
  assert.equal(created.status, 201);
  assert.equal(created.body.data.accountExists, true);
  const shown = await preview(created.body.data.token);
  assert.equal(shown.body.data.accountExists, true);
  const signup = await request
    .post("/api/auth/workspace-invitations/accept")
    .send({ token: created.body.data.token, email: existingEmail, fullName: "Outro nome", password: "senha-nova-123" });
  assert.equal(signup.status, 409, "sem senha nova para quem já tem conta");
  assert.equal(signup.body.error.code, "WORKSPACE_INVITATION_LOGIN_REQUIRED");
});

test("quem não tem products.activate não vê nem concede função com a chave", async () => {
  const gestor = await options(tokens.gestor);
  assert.equal(gestor.body.data.allowed, true);
  for (const role of gestor.body.data.roles as Array<{ grantsActivation: boolean }>) assert.equal(role.grantsActivation, false);
});
