import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import process from "node:process";
import supertest from "supertest";
import { prismaGlobal } from "@repo/db";

let request: ReturnType<typeof supertest>;

const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const tenantId = `tenant-imob-resolve-${suffix}`;
const workspaceId = `workspace-imob-resolve-${suffix}`;
const userId = `user-imob-resolve-${suffix}`;
const apiToken = `tok-imob-resolve-${suffix}`;

before(async () => {
  process.env.NODE_ENV = "test";
  const { default: app } = await import("../index");
  request = supertest(app);

  await prismaGlobal.tenant.create({ data: { id: tenantId, name: tenantId } });
  await prismaGlobal.workspace.create({ data: { id: workspaceId, tenantId, name: workspaceId } });
  await prismaGlobal.user.create({
    data: { id: userId, tenantId, email: `${userId}@example.com`, displayName: "IMOB Resolver Tester" },
  });
  await prismaGlobal.apiToken.create({
    data: {
      token: apiToken,
      tenantId,
      workspaceId,
      userId,
      description: "imob-resolve-turn-test",
      revoked: false,
    },
  });
});

after(async () => {
  await prismaGlobal.apiToken.deleteMany({ where: { tenantId } });
  await prismaGlobal.user.deleteMany({ where: { tenantId } });
  await prismaGlobal.workspace.deleteMany({ where: { tenantId } });
  await prismaGlobal.tenant.deleteMany({ where: { id: tenantId } });
  await prismaGlobal.$disconnect();
});

test("IMOB resolve-turn returns consult mode over HTTP", async () => {
  const response = await request
    .post("/api/imob/chat/resolve-turn")
    .set("Authorization", `Bearer ${apiToken}`)
    .send({ message: "quero alugar apto" });

  assert.equal(response.status, 200);
  assert.equal(response.body?.ok, true);
  assert.equal(response.body?.data?.mode, "consult");
  assert.equal(response.body?.data?.action, "realestate.search_inventory");
  assert.equal(response.body?.data?.threadLabel, "Busca de imóveis");
});

test("IMOB search inventory returns backend presentation over HTTP", async () => {
  const response = await request
    .post("/api/imob/search/inventory")
    .set("Authorization", `Bearer ${apiToken}`)
    .send({
      query: "buscar locação em São Paulo até 3500",
      region: "São Paulo",
      segment: "locacao",
      slots: { city: "São Paulo", budgetMax: 3500 },
    });

  assert.equal(response.status, 200);
  assert.equal(response.body?.ok, true);
  assert.equal(response.body?.data?.total, 0);
  assert.match(response.body?.data?.presentation?.text ?? "", /refinar essa busca/i);
});
