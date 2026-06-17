import "./support/testInfraEnv";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import process from "node:process";
import supertest from "supertest";
import { prismaGlobal } from "@repo/db";

let request: ReturnType<typeof supertest>;

const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const tenantId = `tenant-ws-scope-${suffix}`;
const workspaceId = `workspace-ws-scope-${suffix}`;
const userId = `user-ws-scope-${suffix}`;
const apiToken = `tok-ws-scope-${suffix}`;
const otherWorkspaceId = `workspace-other-${suffix}`;

before(async () => {
  process.env.NODE_ENV = "test";
  const { default: app } = await import("../index");
  request = supertest(app);

  await prismaGlobal.tenant.create({ data: { id: tenantId, name: tenantId } });
  await prismaGlobal.workspace.create({ data: { id: workspaceId, tenantId, name: workspaceId } });
  await prismaGlobal.user.create({
    data: { id: userId, tenantId, email: `${userId}@example.com`, displayName: "WS Scope Tester" },
  });
  await prismaGlobal.apiToken.create({
    data: { token: apiToken, tenantId, workspaceId, userId, description: "ws-scope-test", revoked: false },
  });
});

after(async () => {
  await prismaGlobal.imobCaseEvent.deleteMany({ where: { tenantId } });
  await prismaGlobal.imobCase.deleteMany({ where: { tenantId } });
  await prismaGlobal.apiToken.deleteMany({ where: { tenantId } });
  await prismaGlobal.user.deleteMany({ where: { tenantId } });
  await prismaGlobal.workspace.deleteMany({ where: { tenantId } });
  await prismaGlobal.tenant.deleteMany({ where: { id: tenantId } });
  await prismaGlobal.$disconnect();
});

// --- GET /imob/cases ---

test("GET /imob/cases without workspaceId param returns 200", async () => {
  const res = await request
    .get("/api/imob/cases")
    .set("Authorization", `Bearer ${apiToken}`);

  assert.equal(res.status, 200);
  assert.equal(res.body?.ok, true);
  assert.ok(Array.isArray(res.body?.data?.items));
});

test("GET /imob/cases with matching workspaceId returns 200", async () => {
  const res = await request
    .get(`/api/imob/cases?workspaceId=${workspaceId}`)
    .set("Authorization", `Bearer ${apiToken}`);

  assert.equal(res.status, 200);
  assert.equal(res.body?.ok, true);
  assert.ok(Array.isArray(res.body?.data?.items));
});

test("GET /imob/cases with mismatching workspaceId returns 403 WORKSPACE_SCOPE_MISMATCH", async () => {
  const res = await request
    .get(`/api/imob/cases?workspaceId=${otherWorkspaceId}`)
    .set("Authorization", `Bearer ${apiToken}`);

  assert.equal(res.status, 403);
  assert.equal(res.body?.ok, false);
  assert.equal(res.body?.error?.code, "WORKSPACE_SCOPE_MISMATCH");
});

// --- GET /imob/cases/costs ---

test("GET /imob/cases/costs without workspaceId param returns 200", async () => {
  const res = await request
    .get("/api/imob/cases/costs")
    .set("Authorization", `Bearer ${apiToken}`);

  assert.equal(res.status, 200);
  assert.equal(res.body?.ok, true);
});

test("GET /imob/cases/costs with matching workspaceId returns 200", async () => {
  const res = await request
    .get(`/api/imob/cases/costs?workspaceId=${workspaceId}`)
    .set("Authorization", `Bearer ${apiToken}`);

  assert.equal(res.status, 200);
  assert.equal(res.body?.ok, true);
});

test("GET /imob/cases/costs with mismatching workspaceId returns 403 WORKSPACE_SCOPE_MISMATCH", async () => {
  const res = await request
    .get(`/api/imob/cases/costs?workspaceId=${otherWorkspaceId}`)
    .set("Authorization", `Bearer ${apiToken}`);

  assert.equal(res.status, 403);
  assert.equal(res.body?.ok, false);
  assert.equal(res.body?.error?.code, "WORKSPACE_SCOPE_MISMATCH");
});
