import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

import { setToolRegistryDbLoaderForTests, ToolRegistry } from "./ToolRegistry.js";

type ToolContractDelegate = {
  findFirst(args: unknown): Promise<unknown>;
  findMany(args: unknown): Promise<unknown[]>;
};

afterEach(() => {
  setToolRegistryDbLoaderForTests();
});

function useDelegate(overrides: Partial<ToolContractDelegate>) {
  const delegate: ToolContractDelegate = {
    findFirst: async () => null,
    findMany: async () => [],
    ...overrides,
  };
  setToolRegistryDbLoaderForTests(async () => ({
    prisma: { toolContract: delegate },
  }));
}

test("ToolRegistry.get uses exact tenant/name/version and active status filters", async () => {
  const expected = {
    name: "crm.lookup",
    version: "2.0.0",
    tenantId: "tenant-a",
    status: "active",
  };
  let received: unknown;
  useDelegate({
    findFirst: async (args: unknown) => {
      received = args;
      return expected;
    },
  });

  const result = await ToolRegistry.get("crm.lookup", "2.0.0", "tenant-a");

  assert.deepEqual(received, {
    where: {
      name: "crm.lookup",
      version: "2.0.0",
      tenantId: "tenant-a",
      status: "active",
    },
  });
  assert.equal(result, expected);
});

test("ToolRegistry.get returns null when the delegate finds no contract", async () => {
  useDelegate({ findFirst: async () => null });

  assert.equal(await ToolRegistry.get("crm.missing", "1.0.0", "tenant-a"), null);
});

test("ToolRegistry.get passes the requested tenant without cross-tenant fallback", async () => {
  let received: any;
  useDelegate({
    findFirst: async (args: unknown) => {
      received = args;
      return (args as any).where.tenantId === "tenant-a"
        ? { name: "crm.lookup", version: "1.0.0", tenantId: "tenant-a", status: "active" }
        : null;
    },
  });

  const result = await ToolRegistry.get("crm.lookup", "1.0.0", "tenant-b");

  assert.equal(received.where.tenantId, "tenant-b");
  assert.equal(received.where.status, "active");
  assert.equal(result, null, "tenant A contract must remain invisible to tenant B lookup");
});

test("ToolRegistry.list returns only active contracts in deterministic name/version order", async () => {
  const storedRecords = [
    { name: "beta.tool", version: "2.0.0", tenantId: "tenant-a", status: "active" },
    { name: "revoked.tool", version: "1.0.0", tenantId: "tenant-a", status: "revoked" },
    { name: "alpha.tool", version: "1.0.0", tenantId: "tenant-a", status: "active" },
  ];
  const expected = [storedRecords[2], storedRecords[0]];
  let received: unknown;
  useDelegate({
    findMany: async (args: unknown) => {
      received = args;
      return expected;
    },
  });

  const result = await ToolRegistry.list("tenant-a");

  assert.deepEqual(received, {
    where: { tenantId: "tenant-a", status: "active" },
    orderBy: [{ name: "asc" }, { version: "asc" }],
  });
  assert.deepEqual(result, expected);
  assert.equal(result.some((record) => record.status !== "active"), false);
});

test("ToolRegistry.get preserves the first record selected by the delegate", async () => {
  const delegateSelected = {
    name: "duplicate.tool",
    version: "1.0.0",
    tenantId: "tenant-a",
    status: "active",
    metadata: { createdAt: "2026-07-23", createdBy: "test", description: "first match" },
  };
  useDelegate({ findFirst: async () => delegateSelected });

  const result = await ToolRegistry.get("duplicate.tool", "1.0.0", "tenant-a");

  // LEG-017: com tripla ativa duplicada, ToolRegistry devolve o registro escolhido por findFirst.
  assert.equal(result, delegateSelected);
});
