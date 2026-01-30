import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import supertest from "supertest";
import app from "../../index";
import { prismaGlobal } from "@repo/db";

const request = supertest(app);

before(async () => {
  await prismaGlobal.actionRegistry.deleteMany({});
  await prismaGlobal.tenantActionPolicy.deleteMany({});
});

after(async () => {
  await prismaGlobal.$disconnect();
});

test("GET /api/actions retorna vazio inicialmente", async () => {
  const res = await request.get("/api/actions");

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.versions.length, 0);
});

test("POST /api/actions/version registra nova versão", async () => {
  const res = await request.post("/api/actions/version").send({
    version: 1,
    actions: {
      ping: { description: "Ping test", schema: { type: "object" } },
    },
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
});

test("GET /api/actions lista versão registrada", async () => {
  const res = await request.get("/api/actions");

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.versions.length, 1);
  assert.equal(res.body.versions[0].name, "ping");
});

test("POST /api/actions/override cria override por tenant", async () => {
  const res = await request.post("/api/actions/override").send({
    tenantId: "t1",
    actionName: "ping",
    allowed: false,
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
});

test("DELETE /api/actions/version remove versão", async () => {
  const res = await request.delete("/api/actions/version/1");

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);

  const list = await request.get("/api/actions");
  assert.equal(list.body.versions.length, 0);
});
