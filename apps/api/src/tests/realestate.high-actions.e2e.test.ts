import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import supertest from "supertest";
import { prismaGlobal } from "@repo/db";

let request: ReturnType<typeof supertest>;

const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const tenantId = `tenant-high-${suffix}`;
const workspaceId = `workspace-high-${suffix}`;
const userId = `user-high-${suffix}`;
const apiToken = `tok-high-${suffix}`;

const actionCatalog = [
  "realestate.register_property",
  "realestate.create_contract",
  "realestate.apply_adjustment",
  "realestate.release_commission",
];

before(async () => {
  process.env.NODE_ENV = "test";
  const { default: app } = await import("../index");
  request = supertest(app);

  await prismaGlobal.tenant.create({ data: { id: tenantId, name: tenantId } });
  await prismaGlobal.workspace.create({ data: { id: workspaceId, tenantId, name: workspaceId } });
  await prismaGlobal.user.create({
    data: { id: userId, tenantId, email: `${userId}@example.com`, displayName: "High Action Tester" },
  });
  await prismaGlobal.apiToken.create({
    data: {
      token: apiToken,
      tenantId,
      workspaceId,
      userId,
      description: "realestate-high-actions-test",
      revoked: false,
    },
  });
  for (const actionName of actionCatalog) {
    await prismaGlobal.tenantActionPolicy.create({
      data: {
        tenantId,
        workspaceId,
        actionName,
        allowed: true,
        maxVersion: 1,
      },
    });
  }
});

after(async () => {
  await prismaGlobal.$disconnect();
});

test("Realestate critical actions publish HIGH + txIdRequired contract", async () => {
  const discovery = await request
    .post("/api/agents/discovery")
    .set("Authorization", `Bearer ${apiToken}`)
    .send({ domain: "imob", actions: actionCatalog });

  assert.equal(discovery.status, 200);
  assert.equal(discovery.body?.ok, true);
  const discovered = discovery.body?.data?.actions as Array<any>;
  assert.equal(discovered.length, 4);
  for (const action of discovered) {
    assert.equal(action.tier, "HIGH");
    assert.equal(action.txIdRequired, true);
    assert.equal(action.receiptSchema?.specVersion, "receipt.canon.v1");
  }

  for (const actionName of actionCatalog) {
    const negotiate = await request
      .post("/api/agents/negotiate")
      .set("Authorization", `Bearer ${apiToken}`)
      .send({ domain: "imob", action: actionName });
    assert.equal(negotiate.status, 200);
    assert.equal(negotiate.body?.ok, true);
    assert.equal(negotiate.body?.data?.contract?.tier, "HIGH");
    assert.equal(negotiate.body?.data?.contract?.txIdRequired, true);
    assert.equal(negotiate.body?.data?.contract?.receiptSchema?.specVersion, "receipt.canon.v1");
  }
});

