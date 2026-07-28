import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import process from "node:process";
import supertest from "supertest";
import { ADMIN_SCOPES } from "@eiah/core";
import { closePrismaResources, prismaGlobal } from "@repo/db";

let request: ReturnType<typeof supertest>;

const suffix = `${Date.now().toString(36)}-${Math.random()
  .toString(36)
  .slice(2, 8)}`;
const admin = {
  tenantId: `tenant-authz-admin-${suffix}`,
  workspaceId: `workspace-authz-admin-${suffix}`,
  userId: `user-authz-admin-${suffix}`,
  token: `tok-authz-admin-${suffix}`,
};
const unprivileged = {
  tenantId: `tenant-authz-unpriv-${suffix}`,
  workspaceId: `workspace-authz-unpriv-${suffix}`,
  userId: `user-authz-unpriv-${suffix}`,
  token: `tok-authz-unpriv-${suffix}`,
};
const foreign = {
  tenantId: `tenant-authz-foreign-${suffix}`,
  workspaceId: `workspace-authz-foreign-${suffix}`,
};
const actionName = `authz.action.${suffix}`;
const toolName = `authz-tool-${suffix}`;
const foreignToolName = `authz-foreign-tool-${suffix}`;
const version = Math.floor(Date.now() / 1000);

async function createIdentity(identity: typeof admin | typeof unprivileged) {
  await prismaGlobal.tenant.create({
    data: { id: identity.tenantId, name: identity.tenantId },
  });
  await prismaGlobal.workspace.create({
    data: {
      id: identity.workspaceId,
      tenantId: identity.tenantId,
      name: identity.workspaceId,
    },
  });
  await prismaGlobal.user.create({
    data: {
      id: identity.userId,
      tenantId: identity.tenantId,
      email: `${identity.userId}@example.com`,
      displayName: identity.userId,
    },
  });
  await prismaGlobal.apiToken.create({
    data: {
      token: identity.token,
      tenantId: identity.tenantId,
      workspaceId: identity.workspaceId,
      userId: identity.userId,
      revoked: false,
    },
  });
}

before(async () => {
  process.env.NODE_ENV = "test";
  request = supertest((await import("../../index")).default);

  await createIdentity(admin);
  await createIdentity(unprivileged);
  await prismaGlobal.tenant.create({
    data: { id: foreign.tenantId, name: foreign.tenantId },
  });
  await prismaGlobal.workspace.create({
    data: {
      id: foreign.workspaceId,
      tenantId: foreign.tenantId,
      name: foreign.workspaceId,
    },
  });
  await prismaGlobal.tenantActionPolicy.createMany({
    data: [ADMIN_SCOPES.actions, ADMIN_SCOPES.tools].map((actionName) => ({
      tenantId: admin.tenantId,
      workspaceId: admin.workspaceId,
      actionName,
      allowed: true,
    })),
  });
  await prismaGlobal.toolContract.create({
    data: {
      tenantId: foreign.tenantId,
      name: foreignToolName,
      version: "1.0.0",
      inputSchema: {},
      executor: "http",
      trustLevel: 1,
    },
  });
});

after(async () => {
  const tenantIds = [admin.tenantId, unprivileged.tenantId, foreign.tenantId];
  await prismaGlobal.actionRegistry.deleteMany({ where: { name: actionName } });
  await prismaGlobal.toolContract.deleteMany({
    where: { name: { in: [toolName, foreignToolName] } },
  });
  await prismaGlobal.tenantActionPolicy.deleteMany({
    where: { tenantId: { in: tenantIds } },
  });
  await prismaGlobal.apiToken.deleteMany({
    where: { tenantId: { in: tenantIds } },
  });
  // Audit ledgers are append-only. Preserve them and the referenced inert
  // tenant/workspace/user shells; revoke the temporary bearer tokens above.
  await closePrismaResources();
});

test("sem bearer ou sem admin scope falha fechado", async () => {
  assert.equal((await request.get("/api/actions")).status, 401);
  assert.equal((await request.get("/api/tools")).status, 401);

  const deniedActions = await request
    .post("/api/actions/override")
    .set("Authorization", `Bearer ${unprivileged.token}`)
    .send({ actionName, allowed: true });
  const deniedTools = await request
    .get("/api/tools")
    .set("Authorization", `Bearer ${unprivileged.token}`);
  assert.equal(deniedActions.status, 403);
  assert.equal(deniedTools.status, 403);
});

test("override rejeita contexto divergente e allowed ausente", async () => {
  const mismatch = await request
    .post("/api/actions/override")
    .set("Authorization", `Bearer ${admin.token}`)
    .send({
      tenantId: foreign.tenantId,
      workspaceId: foreign.workspaceId,
      actionName,
      allowed: true,
    });
  const missingAllowed = await request
    .post("/api/actions/override")
    .set("Authorization", `Bearer ${admin.token}`)
    .send({ actionName });

  assert.equal(mismatch.status, 400);
  assert.equal(mismatch.body?.error?.code, "AUTH_CONTEXT_MISMATCH");
  assert.equal(missingAllowed.status, 400);
  assert.equal(missingAllowed.body?.error?.code, "INVALID_PAYLOAD");
});

test("override autorizado grava somente o contexto autenticado", async () => {
  const response = await request
    .post("/api/actions/override")
    .set("Authorization", `Bearer ${admin.token}`)
    .send({ actionName, allowed: false, maxVersion: 2 });

  assert.equal(response.status, 200);
  const rows = await prismaGlobal.tenantActionPolicy.findMany({
    where: { actionName },
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.tenantId, admin.tenantId);
  assert.equal(rows[0]?.workspaceId, admin.workspaceId);
  assert.equal(rows[0]?.allowed, false);
});

test("actions.admin protege o ciclo global de versão", async () => {
  const authorization = { Authorization: `Bearer ${admin.token}` };
  assert.equal(
    (
      await request
        .post("/api/actions/version")
        .set(authorization)
        .send({ version, actions: { [actionName]: { description: "Authz" } } })
    ).status,
    200,
  );
  assert.equal((await request.get("/api/actions").set(authorization)).status, 200);
  assert.equal(
    (
      await request
        .delete(`/api/actions/version/${version}`)
        .set(authorization)
    ).status,
    200,
  );
});

test("tools.admin vincula criação/listagem ao tenant autenticado", async () => {
  const authorization = { Authorization: `Bearer ${admin.token}` };
  const payload = {
    name: toolName,
    version: "1.0.0",
    inputSchema: {},
    executor: "http",
    trustLevel: 1,
  };
  const mismatch = await request
    .post("/api/tools")
    .set(authorization)
    .send({ ...payload, tenantId: foreign.tenantId });
  const create = await request
    .post("/api/tools")
    .set(authorization)
    .send(payload);
  const list = await request.get("/api/tools").set(authorization);

  assert.equal(mismatch.status, 400);
  assert.equal(create.status, 200);
  assert.equal(create.body?.tenantId, admin.tenantId);
  assert.equal(
    list.body.some(
      (entry: { tenantId: string }) => entry.tenantId === foreign.tenantId,
    ),
    false,
  );
});
