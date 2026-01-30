import assert from "node:assert/strict";
import { test } from "node:test";
import { tenantGuard } from "../middleware/tenantGuard";

type Model = "Run" | "GuardrailLedger" | "TenantActionPolicy" | "ActionRegistry";

type DbShape = Record<Model, Array<Record<string, any>>>;

function makeDb(): DbShape {
  return {
    Run: [],
    GuardrailLedger: [],
    TenantActionPolicy: [],
    ActionRegistry: [],
  };
}

function matchesWhere(record: Record<string, any>, where: Record<string, any> = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (value === undefined) return true;
    return record[key] === value;
  });
}

function normalizeCreate(model: Model, data: Record<string, any>) {
  if (model === "Run") {
    return {
      agent: "agent",
      status: "pending",
      request: {},
      ...data,
    };
  }
  if (model === "GuardrailLedger") {
    return {
      actionType: "rule",
      usageCount: 1,
      ...data,
    };
  }
  if (model === "TenantActionPolicy") {
    return {
      actionName: "someAction",
      allowed: true,
      ...data,
    };
  }
  if (model === "ActionRegistry") {
    return {
      name: "action",
      version: 1,
      ...data,
    };
  }
  return data;
}

function createCtx(tenantId: string, workspaceId: string, db: DbShape) {
  const guard = tenantGuard(tenantId, workspaceId);

  const handler = async (params: any) => {
    const store = db[params.model as Model];
    const { action, args } = params;

    if (action === "create") {
      const record = normalizeCreate(params.model, { ...args.data });
      store.push(record);
      return record;
    }

    if (action === "findMany") {
      return store.filter((row) => matchesWhere(row, args.where));
    }

    if (action === "findUnique" || action === "findFirst") {
      return store.find((row) => matchesWhere(row, args.where)) ?? null;
    }

    if (action === "update") {
      const idx = store.findIndex((row) => matchesWhere(row, args.where));
      if (idx === -1) throw new Error("Record not found");
      store[idx] = { ...store[idx], ...args.data };
      return store[idx];
    }

    if (action === "delete") {
      const idx = store.findIndex((row) => matchesWhere(row, args.where));
      if (idx === -1) throw new Error("Record not found");
      const [removed] = store.splice(idx, 1);
      return removed;
    }

    if (action === "deleteMany") {
      const before = store.length;
      db[params.model as Model] = store.filter((row) => !matchesWhere(row, args.where)) as any;
      return { count: before - db[params.model as Model].length };
    }

    throw new Error(`Action not implemented in test stub: ${action}`);
  };

  const run = (params: any) => guard(params, handler);

  return {
    run,
    create(model: Model, data: Record<string, any>) {
      return run({ model, action: "create", args: { data } });
    },
    findMany(model: Model, where: Record<string, any> = {}): Promise<Record<string, any>[]> {
      return run({ model, action: "findMany", args: { where } }) as Promise<Record<string, any>[]>;
    },
    update(model: Model, where: Record<string, any>, data: Record<string, any>) {
      return run({ model, action: "update", args: { where, data } });
    },
    delete(model: Model, where: Record<string, any>) {
      return run({ model, action: "delete", args: { where } });
    },
  };
}

test("multi-tenant isolation for Run: reads, updates e deletes", async () => {
  const db = makeDb();
  const tenantA = createCtx("tA", "wA", db);
  const tenantB = createCtx("tB", "wB", db);

  await tenantA.create("Run", { id: "runA1" });
  await tenantA.create("Run", { id: "runA2", status: "done" });
  await tenantB.create("Run", { id: "runB1" });

  const runsA = await tenantA.findMany("Run", { status: "pending" });
  const runsB = await tenantB.findMany("Run", {});

  assert.equal(runsA.length, 1);
  assert.equal(runsA[0].id, "runA1");
  assert.equal(runsB.length, 1);
  assert.equal(runsB[0].id, "runB1");

  const cross = await tenantA.findMany("Run", { id: "runB1" });
  assert.equal(cross.length, 0);

  await assert.rejects(
    tenantA.update("Run", { id: "runB1", tenantId: "tB", workspaceId: "wB" }, { status: "blocked" }),
    /Tenant violation/i
  );
  await assert.rejects(
    tenantA.delete("Run", { id: "runB1", tenantId: "tB", workspaceId: "wB" }),
    /Tenant violation/i
  );
});

test("multi-tenant isolation em GuardrailLedger", async () => {
  const db = makeDb();
  const tenantA = createCtx("tA", "wA", db);
  const tenantB = createCtx("tB", "wB", db);

  await tenantA.create("GuardrailLedger", { id: "gA1", workspaceId: "wA" });
  await tenantB.create("GuardrailLedger", { id: "gB1", workspaceId: "wB" });

  const aRows = await tenantA.findMany("GuardrailLedger", {});
  const bRows = await tenantB.findMany("GuardrailLedger", {});

  assert.equal(aRows.length, 1);
  assert.equal(aRows[0].id, "gA1");
  assert.equal(bRows.length, 1);
  assert.equal(bRows[0].id, "gB1");

  const cross = await tenantA.findMany("GuardrailLedger", { id: "gB1" });
  assert.equal(cross.length, 0);
});

test("multi-tenant isolation em TenantActionPolicy", async () => {
  const db = makeDb();
  const tenantA = createCtx("tA", "wA", db);
  const tenantB = createCtx("tB", "wB", db);

  await tenantA.create("TenantActionPolicy", { id: "pA1", workspaceId: "wA" });
  await tenantB.create("TenantActionPolicy", { id: "pB1", workspaceId: "wB" });

  const aRows = await tenantA.findMany("TenantActionPolicy", {});
  const bRows = await tenantB.findMany("TenantActionPolicy", {});

  assert.equal(aRows.length, 1);
  assert.equal(aRows[0].id, "pA1");
  assert.equal(bRows.length, 1);
  assert.equal(bRows[0].id, "pB1");

  const cross = await tenantA.findMany("TenantActionPolicy", { id: "pB1" });
  assert.equal(cross.length, 0);
});

// ActionRegistry é global (não tenant-aware) por design.
