import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

// Importa tenantGuard, Prisma types e getPrismaForTenant do pacote oficial
import { tenantGuard, getPrismaForTenant, Prisma } from "@repo/db";

/* ============================================
   SEÇÃO 1 — TESTES UNITÁRIOS DO tenantGuard
   ============================================ */

type Captured = { params?: Prisma.MiddlewareParams };

function runGuard(params: Prisma.MiddlewareParams) {
  const guard = tenantGuard("t-1", "w-1");
  const captured: Captured = {};

  const next = async (p: Prisma.MiddlewareParams) => {
    captured.params = p;
    return p;
  };

  return { guard, captured, execute: () => guard(params, next) };
}

test("tenantGuard injeta tenantId/workspaceId em findMany()", async () => {
  const { execute, captured } = runGuard({
    model: "Run",
    action: "findMany",
    args: {},
    dataPath: [],
    runInTransaction: false,
  });

  await execute();

  assert.equal(captured.params?.args.where.tenantId, "t-1");
  assert.equal(captured.params?.args.where.workspaceId, "w-1");
});

test("tenantGuard injeta tenantId/workspaceId em create()", async () => {
  const { execute, captured } = runGuard({
    model: "Run",
    action: "create",
    args: { data: { foo: "bar" } },
    dataPath: [],
    runInTransaction: false,
  });

  await execute();

  assert.equal(captured.params?.args.data.tenantId, "t-1");
  assert.equal(captured.params?.args.data.workspaceId, "w-1");
});

test("tenantGuard bloqueia update sem tenantId/workspaceId", async () => {
  const guard = tenantGuard("t-1", "w-1");

  await assert.rejects(
    guard(
      {
        model: "Run",
        action: "update",
        args: { where: { id: "abc" }, data: {} },
        dataPath: [],
        runInTransaction: false,
      },
      async () => ({})
    ),
    /tenant/i
  );
});

/* ============================================
   SEÇÃO 2 — TESTES DE INTEGRAÇÃO MULTI-TENANT
   ============================================ */

let prismaA: any;
let prismaB: any;

beforeEach(() => {
  prismaA = getPrismaForTenant("tenantA", "workspaceA");
  prismaB = getPrismaForTenant("tenantB", "workspaceB");
});

test("Tenant A não deve ver dados do Tenant B", async () => {
  await prismaA.run.create({
    data: {
      runId: "runA",
      tenantId: "tenantA",
      workspaceId: "workspaceA",
      status: "pending",
    },
  });

  await prismaB.run.create({
    data: {
      runId: "runB",
      tenantId: "tenantB",
      workspaceId: "workspaceB",
      status: "pending",
    },
  });

  const runsA = await prismaA.run.findMany();
  assert.equal(runsA.length, 1);
  assert.equal(runsA[0].runId, "runA");

  const runsB = await prismaB.run.findMany();
  assert.equal(runsB.length, 1);
  assert.equal(runsB[0].runId, "runB");

  const notFound = await prismaA.run.findMany({
    where: { runId: "runB" },
  });

  assert.equal(notFound.length, 0);
});

test("Update sem tenantId deve falhar (integração)", async () => {
  await assert.rejects(
    prismaA.run.update({
      where: { runId: "doesNotMatter" },
      data: { status: "complete" },
    }),
    /tenant/i
  );
});
