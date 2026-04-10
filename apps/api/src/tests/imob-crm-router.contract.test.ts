import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import process from "node:process";
import supertest from "supertest";
import { prismaGlobal } from "@repo/db";

let request: ReturnType<typeof supertest>;

const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const tenantId = `tenant-imob-crm-router-${suffix}`;
const workspaceId = `workspace-imob-crm-router-${suffix}`;
const userId = `user-imob-crm-router-${suffix}`;
const apiToken = `tok-imob-crm-router-${suffix}`;

before(async () => {
  process.env.NODE_ENV = "test";
  const { default: app } = await import("../index");
  request = supertest(app);

  await prismaGlobal.tenant.create({ data: { id: tenantId, name: tenantId } });
  await prismaGlobal.workspace.create({ data: { id: workspaceId, tenantId, name: workspaceId } });
  await prismaGlobal.user.create({
    data: { id: userId, tenantId, email: `${userId}@example.com`, displayName: "IMOB CRM Router Tester" },
  });
  await prismaGlobal.apiToken.create({
    data: {
      token: apiToken,
      tenantId,
      workspaceId,
      userId,
      description: "imob-crm-router-test",
      revoked: false,
    },
  });
});

after(async () => {
  await prismaGlobal.$executeRaw`
    DELETE FROM memory_events
    WHERE tenant_id = ${tenantId}
      AND workspace_id = ${workspaceId}
  `;
  await prismaGlobal.imobCaseEvent.deleteMany({ where: { tenantId } });
  await prismaGlobal.imobCase.deleteMany({ where: { tenantId } });
  await prismaGlobal.imobProperty.deleteMany({ where: { tenantId } });
  await prismaGlobal.imobOwner.deleteMany({ where: { tenantId } });
  await prismaGlobal.imobLead.deleteMany({ where: { tenantId } });
  await prismaGlobal.apiToken.deleteMany({ where: { tenantId } });
  await prismaGlobal.user.deleteMany({ where: { tenantId } });
  await prismaGlobal.workspace.deleteMany({ where: { tenantId } });
  await prismaGlobal.tenant.deleteMany({ where: { id: tenantId } });
  await prismaGlobal.$disconnect();
});

test("IMOB CRM router performs owner CRUD over HTTP", async () => {
  const created = await request
    .post("/api/imob/owners")
    .set("Authorization", `Bearer ${apiToken}`)
    .send({
      name: "Joana Router",
      email: "joana.router@example.com",
      phone: "47999990000",
      pendingItems: ["ownerDocument"],
    });

  assert.equal(created.status, 201);
  assert.equal(created.body?.ok, true);
  assert.equal(created.body?.data?.name, "Joana Router");
  const ownerId = created.body?.data?.id;
  assert.ok(ownerId);

  const listed = await request
    .get("/api/imob/owners")
    .set("Authorization", `Bearer ${apiToken}`);

  assert.equal(listed.status, 200);
  assert.equal(listed.body?.ok, true);
  assert.ok((listed.body?.data?.items ?? []).some((item: any) => item.id === ownerId));

  const updated = await request
    .patch(`/api/imob/owners/${ownerId}`)
    .set("Authorization", `Bearer ${apiToken}`)
    .send({ phone: "47999991111", document: "12345678901" });

  assert.equal(updated.status, 200);
  assert.equal(updated.body?.ok, true);
  assert.equal(updated.body?.data?.phone, "47999991111");
  assert.equal(updated.body?.data?.document, "12345678901");

  const fetched = await request
    .get(`/api/imob/owners/${ownerId}`)
    .set("Authorization", `Bearer ${apiToken}`);

  assert.equal(fetched.status, 200);
  assert.equal(fetched.body?.ok, true);
  assert.equal(fetched.body?.data?.id, ownerId);

  const archived = await request
    .delete(`/api/imob/owners/${ownerId}`)
    .set("Authorization", `Bearer ${apiToken}`);

  assert.equal(archived.status, 200);
  assert.equal(archived.body?.ok, true);
  assert.equal(archived.body?.data?.status, "archived");
});

test("IMOB CRM router creates and updates property linked to owner over HTTP", async () => {
  const owner = await prismaGlobal.imobOwner.create({
    data: {
      tenantId,
      workspaceId,
      name: "Carlos Property",
      status: "ready_for_review",
    },
  });

  const created = await request
    .post("/api/imob/properties")
    .set("Authorization", `Bearer ${apiToken}`)
    .send({
      ownerId: owner.id,
      propertyType: "apartamento",
      goal: "venda",
      address: "Rua Router 123",
      city: "Itapema",
      askingPriceCents: 85000000,
    });

  assert.equal(created.status, 201);
  assert.equal(created.body?.ok, true);
  assert.equal(created.body?.data?.ownerId, owner.id);
  const propertyId = created.body?.data?.id;
  assert.ok(propertyId);

  const listed = await request
    .get("/api/imob/properties")
    .set("Authorization", `Bearer ${apiToken}`);

  assert.equal(listed.status, 200);
  assert.equal(listed.body?.ok, true);
  assert.ok((listed.body?.data?.items ?? []).some((item: any) => item.id === propertyId));

  const updated = await request
    .patch(`/api/imob/properties/${propertyId}`)
    .set("Authorization", `Bearer ${apiToken}`)
    .send({ city: "Balneário Camboriú", neighborhood: "Centro" });

  assert.equal(updated.status, 200);
  assert.equal(updated.body?.ok, true);
  assert.equal(updated.body?.data?.city, "Balneário Camboriú");
  assert.equal(updated.body?.data?.neighborhood, "Centro");

  const fetched = await request
    .get(`/api/imob/properties/${propertyId}`)
    .set("Authorization", `Bearer ${apiToken}`);

  assert.equal(fetched.status, 200);
  assert.equal(fetched.body?.ok, true);
  assert.equal(fetched.body?.data?.id, propertyId);
});
