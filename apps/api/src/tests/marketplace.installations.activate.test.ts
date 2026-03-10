import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import process from "node:process";
import supertest from "supertest";
import { prismaGlobal } from "@repo/db";

let request: ReturnType<typeof supertest>;

const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const tenantId = `tenant-install-${suffix}`;
const workspaceId = `workspace-install-${suffix}`;
const userId = `user-install-${suffix}`;
const apiToken = `tok-install-${suffix}`;

before(async () => {
  process.env.NODE_ENV = "test";
  const { default: app } = await import("../index");
  request = supertest(app);

  await prismaGlobal.tenant.create({ data: { id: tenantId, name: tenantId } });
  await prismaGlobal.workspace.create({ data: { id: workspaceId, tenantId, name: workspaceId } });
  await prismaGlobal.user.create({
    data: { id: userId, tenantId, email: `${userId}@example.com`, displayName: "Marketplace Installer" },
  });
  await prismaGlobal.apiToken.create({
    data: {
      token: apiToken,
      tenantId,
      workspaceId,
      userId,
      description: "marketplace-installation-test",
      revoked: false,
    },
  });
});

after(async () => {
  await prismaGlobal.$executeRaw`
    DELETE FROM tenant_product_installations
    WHERE tenant_id = ${tenantId}
      AND workspace_id = ${workspaceId}
  `;
  await prismaGlobal.$disconnect();
});

test("POST /api/marketplace/installations/activate ativa IMOB e retorna rotas liberadas", async () => {
  const res = await request
    .post("/api/marketplace/installations/activate")
    .set("Authorization", `Bearer ${apiToken}`)
    .send({ product: "IMOB" });

  assert.equal(res.status, 200);
  assert.equal(res.body?.ok, true);
  assert.equal(res.body?.installation?.tenantId, tenantId);
  assert.equal(res.body?.installation?.workspaceId, workspaceId);
  assert.equal(res.body?.installation?.product, "IMOB");
  assert.equal(res.body?.installation?.status, "active");
  assert.ok(Array.isArray(res.body?.releasedRoutes));
  assert.ok(res.body?.releasedRoutes.includes("/app/imob/chat"));

  const list = await request
    .get("/api/marketplace/installations")
    .set("Authorization", `Bearer ${apiToken}`);
  assert.equal(list.status, 200);
  assert.equal(list.body?.ok, true);
  const imob = (list.body?.items ?? []).find((entry: any) => entry.product === "IMOB");
  assert.ok(imob);
  assert.equal(imob.status, "active");
});

test("POST /api/marketplace/installations/activate é idempotente por tenant/workspace/produto", async () => {
  const first = await request
    .post("/api/marketplace/installations/activate")
    .set("Authorization", `Bearer ${apiToken}`)
    .send({ product: "IMOB" });

  const second = await request
    .post("/api/marketplace/installations/activate")
    .set("Authorization", `Bearer ${apiToken}`)
    .send({ product: "IMOB" });

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);

  const rows = await prismaGlobal.$queryRaw<Array<{ count: bigint | number }>>`
    SELECT COUNT(*)::bigint AS count
    FROM tenant_product_installations
    WHERE tenant_id = ${tenantId}
      AND workspace_id = ${workspaceId}
      AND product = 'IMOB'
  `;

  const countValue = rows[0]?.count;
  const count = typeof countValue === "bigint" ? Number(countValue) : Number(countValue ?? 0);
  assert.equal(count, 1);
});

test("POST /api/marketplace/installations/activate rejeita produto inválido", async () => {
  const res = await request
    .post("/api/marketplace/installations/activate")
    .set("Authorization", `Bearer ${apiToken}`)
    .send({ product: "LEGAL" });

  assert.equal(res.status, 400);
  assert.equal(res.body?.ok, false);
  assert.equal(res.body?.error?.code, "INVALID_PAYLOAD");
});
