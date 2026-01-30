import { test } from "node:test";
import assert from "node:assert/strict";
import type { Prisma } from "../generated/client";
import { tenantGuard } from "../middleware/tenantGuard";

function runGuard(params: Prisma.MiddlewareParams) {
  const calls: { params?: Prisma.MiddlewareParams } = {};
  const guard = tenantGuard("t1", "w1");
  const next = async (p: Prisma.MiddlewareParams) => {
    calls.params = p;
    return p;
  };
  return {
    execute: () => guard(params, next),
    calls,
  };
}

test("tenantGuard: injeta tenantId/workspaceId em findMany()", async () => {
  const { execute, calls } = runGuard({
    model: "Run",
    action: "findMany",
    args: {},
    dataPath: [],
    runInTransaction: false,
  });

  await execute();
  assert.equal(calls.params?.args.where.tenantId, "t1");
  assert.equal(calls.params?.args.where.workspaceId, "w1");
});

test("tenantGuard: findFirst preserva where existente e faz merge", async () => {
  const originalWhere = { status: "pending" };
  const { execute, calls } = runGuard({
    model: "Run",
    action: "findFirst",
    args: { where: structuredClone(originalWhere) },
    dataPath: [],
    runInTransaction: false,
  });

  await execute();
  assert.deepEqual(calls.params?.args.where, {
    status: "pending",
    tenantId: "t1",
    workspaceId: "w1",
  });
  // garante que não mutamos o objeto original
  assert.deepEqual(originalWhere, { status: "pending" });
});

test("tenantGuard: findUnique faz merge com where aninhado (some/every/none)", async () => {
  const nested = {
    events: { some: { status: "ok" }, every: { foo: true }, none: { bar: false } },
  };
  const { execute, calls } = runGuard({
    model: "Run",
    action: "findUnique",
    args: { where: structuredClone(nested) },
    dataPath: [],
    runInTransaction: false,
  });

  await execute();
  assert.deepEqual(calls.params?.args.where, {
    ...nested,
    tenantId: "t1",
    workspaceId: "w1",
  });
});

test("tenantGuard: includes/select não são alterados nas leituras", async () => {
  const args = {
    where: { status: "pending" },
    include: { events: true },
    select: { id: true, status: true },
  };
  const { execute, calls } = runGuard({
    model: "Run",
    action: "findMany",
    args: structuredClone(args),
    dataPath: [],
    runInTransaction: false,
  });

  await execute();
  assert.deepEqual(calls.params?.args.include, args.include);
  assert.deepEqual(calls.params?.args.select, args.select);
});

test("tenantGuard: lista de modelos coberta inclui RunEvent e GuardrailLedger", async () => {
  const { execute: execEvent, calls: callEvent } = runGuard({
    model: "RunEvent",
    action: "findMany",
    args: {},
    dataPath: [],
    runInTransaction: false,
  });

  await execEvent();
  assert.equal(callEvent.params?.args.where.tenantId, "t1");
  assert.equal(callEvent.params?.args.where.workspaceId, "w1");

  const { execute: execLedger, calls: callLedger } = runGuard({
    model: "GuardrailLedger",
    action: "findMany",
    args: {},
    dataPath: [],
    runInTransaction: false,
  });

  await execLedger();
  assert.equal(callLedger.params?.args.where.tenantId, "t1");
});

test("tenantGuard: ActionRegistry não é guardado (catálogo global)", async () => {
  const { execute, calls } = runGuard({
    model: "ActionRegistry",
    action: "findMany",
    args: { where: { name: "x" } },
    dataPath: [],
    runInTransaction: false,
  });

  await execute();
  assert.deepEqual(calls.params?.args.where, { name: "x" });
});

test("tenantGuard: create() força tenantId/workspaceId", async () => {
  const { execute, calls } = runGuard({
    model: "Run",
    action: "create",
    args: { data: { foo: "bar" } },
    dataPath: [],
    runInTransaction: false,
  });

  await execute();
  assert.equal(calls.params?.args.data.tenantId, "t1");
  assert.equal(calls.params?.args.data.workspaceId, "w1");
});

test("tenantGuard: create() rejeita tenantId/workspaceId divergente", async () => {
  const guard = tenantGuard("t1", "w1");

  await assert.rejects(
    guard(
      {
        model: "Run",
        action: "create",
        args: { data: { tenantId: "other", workspaceId: "w1" } },
        dataPath: [],
        runInTransaction: false,
      },
      async () => ({})
    ),
    /Tenant violation/i
  );
});

test("tenantGuard: ignora modelos fora da lista (ApiToken)", async () => {
  const models: Array<Prisma.MiddlewareParams["model"]> = ["ApiToken"];
  for (const model of models) {
    const calls = { params: undefined as Prisma.MiddlewareParams | undefined };
    const guard = tenantGuard("t1", "w1");
    const next = async (p: Prisma.MiddlewareParams) => {
      calls.params = p;
      return p;
    };

    const params: Prisma.MiddlewareParams = {
      model,
      action: "findMany",
      args: { where: { foo: "bar" } },
      dataPath: [],
      runInTransaction: false,
    };

    await guard(params, next);
    assert.deepEqual(calls.params?.args.where, { foo: "bar" });
  }
});

test("tenantGuard: update sem tenantId deve falhar", async () => {
  const guard = tenantGuard("t1", "w1");
  await assert.rejects(
    guard(
      {
        model: "Run",
        action: "update",
        args: { where: { id: "123" }, data: {} },
        dataPath: [],
        runInTransaction: false,
      },
      async () => ({})
    ),
    /tenant/i
  );
});

test("tenantGuard: update com tenantId/workspaceId incorretos deve falhar", async () => {
  const guard = tenantGuard("t1", "w1");
  await assert.rejects(
    guard(
      {
        model: "Run",
        action: "update",
        args: { where: { id: "123", tenantId: "x", workspaceId: "y" }, data: {} },
        dataPath: [],
        runInTransaction: false,
      },
      async () => ({})
    ),
    /Tenant violation/i
  );
});

test("tenantGuard: update com tenantId/workspaceId corretos deve passar", async () => {
  const { execute, calls } = runGuard({
    model: "Run",
    action: "update",
    args: { where: { id: "abc", tenantId: "t1", workspaceId: "w1" }, data: { x: 1 } },
    dataPath: [],
    runInTransaction: false,
  });

  await execute();
  assert.equal(calls.params?.args.where.tenantId, "t1");
  assert.equal(calls.params?.args.where.workspaceId, "w1");
});

test("tenantGuard: delete sem tenantId/workspaceId falha", async () => {
  const guard = tenantGuard("t1", "w1");
  await assert.rejects(
    guard(
      {
        model: "Run",
        action: "delete",
        args: { where: { id: "abc" } },
        dataPath: [],
        runInTransaction: false,
      },
      async () => ({})
    ),
    /Tenant violation/i
  );
});

test("tenantGuard: deleteMany sem tenantId/workspaceId falha", async () => {
  const guard = tenantGuard("t1", "w1");
  await assert.rejects(
    guard(
      {
        model: "Run",
        action: "deleteMany",
        args: { where: {} },
        dataPath: [],
        runInTransaction: false,
      },
      async () => ({})
    ),
    /Tenant violation/i
  );
});

test("tenantGuard: updateMany sem where ou tenant/workspace falha", async () => {
  const guard = tenantGuard("t1", "w1");
  await assert.rejects(
    guard(
      {
        model: "Run",
        action: "updateMany",
        args: { data: { status: "ok" }, where: {} },
        dataPath: [],
        runInTransaction: false,
      },
      async () => ({})
    ),
    /Tenant violation/i
  );
});
