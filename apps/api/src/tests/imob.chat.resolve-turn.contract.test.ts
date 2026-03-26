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


test("IMOB resolve-turn processes owner + property + lead batch intake over HTTP", async () => {
  const response = await request
    .post("/api/imob/chat/resolve-turn")
    .set("Authorization", `Bearer ${apiToken}`)
    .send({
      message: [
        "Captar proprietario Joana Batch email joana.batch@example.com telefone 11999991111 documento 12345678901",
        "Cadastrar imóvel apartamento para venda em Itapema com 2 quartos endereco Rua Batch 101 proprietario Joana Batch valor 700000",
        "Cadastrar lead Mario Batch telefone 47999991111 email mario.batch@example.com interesse compra em Itapema orçamento 720000",
      ].join("\n"),
    });

  assert.equal(response.status, 200);
  assert.equal(response.body?.ok, true);
  assert.equal(response.body?.data?.mode, "consult");
  assert.equal(response.body?.data?.action, "crm.batch.intake");
  assert.match(response.body?.data?.presentation?.text ?? "", /processei 3 operação\(ões\) deste lote/i);
  assert.equal(response.body?.data?.presentation?.card?.lines?.length, 3);

  const [owner, property, lead, caseCount] = await Promise.all([
    prismaGlobal.imobOwner.findFirst({ where: { tenantId, workspaceId, name: "Joana Batch" } }),
    prismaGlobal.imobProperty.findFirst({ where: { tenantId, workspaceId, address: { contains: "Rua Batch 101" } } }),
    prismaGlobal.imobLead.findFirst({ where: { tenantId, workspaceId, name: "Mario Batch" } }),
    prismaGlobal.imobCase.count({ where: { tenantId, workspaceId } }),
  ]);

  assert.ok(owner);
  assert.ok(property);
  assert.ok(lead);
  assert.ok(caseCount >= 1);
});
