import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { MCPExecutor, setMcpExecutorDbLoaderForTests } from "./MCPExecutor.js";
import {
  McpDbPolicyError,
  setMcpDbAllowlistForTests,
} from "./dbAllowlist.js";
import type { ToolContract } from "../types/ToolContract.js";

afterEach(() => {
  setMcpExecutorDbLoaderForTests();
  setMcpDbAllowlistForTests();
});

let contractCounter = 0;
function buildContract(overrides: Partial<ToolContract> = {}): ToolContract {
  contractCounter += 1;
  return {
    name: `test.tool.${contractCounter}`,
    version: "1.0.0",
    tenantId: `tenant-test-${contractCounter}`,
    inputSchema: { type: "object" },
    executor: "http",
    trustLevel: 1,
    ...overrides,
  };
}

test("MCPExecutor: http executor resolves parsed JSON on success (fetch mocked)", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ ok: true, value: 42 }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;

  try {
    const executor = new MCPExecutor(buildContract({ executor: "http" }));
    const result = await executor.run({ url: "https://example.test/api", options: {} });
    assert.deepEqual(result, { ok: true, value: 42 });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("MCPExecutor: http executor rejects with status details on non-ok response", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response("server exploded", {
      status: 500,
      statusText: "Internal Server Error",
    })) as typeof fetch;

  try {
    const executor = new MCPExecutor(buildContract({ executor: "http" }));
    await assert.rejects(
      executor.run({ url: "https://example.test/api", options: {} }),
      /HTTP executor failed: 500/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("MCPExecutor: fs executor reads a real temporary file", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "mcp-runner-fs-test-"));
  const filePath = path.join(dir, "payload.txt");
  await writeFile(filePath, "hello from mcp-runner test", "utf-8");

  try {
    const executor = new MCPExecutor(buildContract({ executor: "fs" }));
    const result = await executor.run({ path: filePath });
    assert.equal(result, "hello from mcp-runner test");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("MCPExecutor: web3 executor is explicitly not implemented", async () => {
  const executor = new MCPExecutor(buildContract({ executor: "web3" }));
  await assert.rejects(
    executor.run({}),
    /web3 executor not implemented in @repo\/mcp-runner yet/
  );
});

test("MCPExecutor: timeout rejects a slow execution before it resolves", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    new Promise((resolve) => {
      setTimeout(
        () => resolve(new Response(JSON.stringify({ ok: true }), { status: 200 })),
        100
      );
    })) as unknown as typeof fetch;

  try {
    const executor = new MCPExecutor(
      buildContract({ executor: "http", limits: { timeoutMs: 20 } })
    );
    await assert.rejects(
      executor.run({ url: "https://example.test/slow", options: {} }),
      /MCP executor timeout after 20ms/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("MCPExecutor: circuit breaker opens after repeated failures and blocks the next call", async () => {
  const originalFetch = globalThis.fetch;
  const originalThreshold = process.env.MCP_CB_FAILURE_THRESHOLD;
  process.env.MCP_CB_FAILURE_THRESHOLD = "2";

  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    return new Response("boom", { status: 500, statusText: "Internal Server Error" });
  }) as typeof fetch;

  try {
    const executor = new MCPExecutor(buildContract({ executor: "http" }));

    await assert.rejects(executor.run({ url: "https://example.test/a", options: {} }));
    await assert.rejects(executor.run({ url: "https://example.test/a", options: {} }));
    assert.equal(fetchCalls, 2, "both failures should have called fetch");

    await assert.rejects(
      executor.run({ url: "https://example.test/a", options: {} }),
      /Circuit breaker open/
    );
    assert.equal(fetchCalls, 2, "the breaker must block the third call before calling fetch again");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalThreshold === undefined) {
      delete process.env.MCP_CB_FAILURE_THRESHOLD;
    } else {
      process.env.MCP_CB_FAILURE_THRESHOLD = originalThreshold;
    }
  }
});

test("MCPExecutor: db executor denies every production model while the allowlist is empty", async () => {
  let dbLoads = 0;
  const sensitiveModelName = "credential-must-not-leak";
  setMcpExecutorDbLoaderForTests(async () => {
    dbLoads += 1;
    return { prismaGlobal: {} };
  });

  const contract = buildContract({ executor: "db" });
  const executor = new MCPExecutor(contract);
  await assert.rejects(
    executor.run(
      { table: sensitiveModelName, where: {} },
      { tenantId: "tenant-authenticated" }
    ),
    (error) => {
      assert.equal(error instanceof McpDbPolicyError, true);
      assert.equal(
        (error as McpDbPolicyError).reasonCode,
        "DB_MODEL_NOT_ALLOWLISTED"
      );
      assert.equal(
        (error as McpDbPolicyError).message.includes(sensitiveModelName),
        false
      );
      return true;
    }
  );
  assert.equal(dbLoads, 0, "allowlist denial must happen before loading Prisma");
});

test("MCPExecutor: allowlisted tenant model receives authenticated tenant and workspace scope", async () => {
  const received: unknown[] = [];
  setMcpDbAllowlistForTests([
    {
      model: "property",
      tenantField: "tenantId",
      workspaceField: "workspaceId",
      readOnly: true,
    },
  ]);
  setMcpExecutorDbLoaderForTests(async () => ({
    prismaGlobal: {
      property: {
        findMany: async (args: unknown) => {
          received.push(args);
          return [{ id: "property-1" }];
        },
      },
    },
  }));

  const executor = new MCPExecutor(
    buildContract({
      executor: "db",
      inputSchema: {
        type: "object",
        required: ["table", "where"],
        properties: { table: { type: "string" }, where: { type: "object" } },
      },
    })
  );
  const result = await executor.run(
    {
      table: "property",
      where: { status: "active" },
    },
    {
      tenantId: "tenant-authenticated",
      workspaceId: "workspace-authenticated",
    }
  );

  assert.deepEqual(result, [{ id: "property-1" }]);
  assert.deepEqual(received, [
    {
      where: {
        status: "active",
        tenantId: "tenant-authenticated",
        workspaceId: "workspace-authenticated",
      },
    },
  ]);
});

test("MCPExecutor: structurally invalid db where uses DB_INPUT_INVALID before Prisma", async () => {
  let dbLoads = 0;
  setMcpDbAllowlistForTests([
    {
      model: "property",
      tenantField: "tenantId",
      workspaceField: null,
      readOnly: true,
    },
  ]);
  setMcpExecutorDbLoaderForTests(async () => {
    dbLoads += 1;
    return { prismaGlobal: {} };
  });

  const executor = new MCPExecutor(
    buildContract({
      executor: "db",
      inputSchema: { type: "object" },
    })
  );

  await assert.rejects(
    executor.run(
      { table: "property", where: "invalid" },
      { tenantId: "tenant-authenticated" }
    ),
    (error) =>
      error instanceof McpDbPolicyError &&
      error.reasonCode === "DB_INPUT_INVALID"
  );
  assert.equal(dbLoads, 0, "input denial must happen before loading Prisma");
});

test("MCPExecutor: divergent caller scope fails high before Prisma", async () => {
  let dbLoads = 0;
  setMcpDbAllowlistForTests([
    {
      model: "property",
      tenantField: "tenantId",
      workspaceField: null,
      readOnly: true,
    },
  ]);
  setMcpExecutorDbLoaderForTests(async () => {
    dbLoads += 1;
    return { prismaGlobal: {} };
  });

  const contract = buildContract({ executor: "db" });
  const executor = new MCPExecutor(contract);
  await assert.rejects(
    executor.run(
      {
        table: "property",
        where: {
          status: "active",
          OR: [{ tenantId: "tenant-other" }],
        },
      },
      { tenantId: "tenant-authenticated" }
    ),
    (error) =>
      error instanceof McpDbPolicyError &&
      error.reasonCode === "DB_SCOPE_VIOLATION"
  );
  assert.equal(dbLoads, 0);
});

test("MCPExecutor: tenantized model without authenticated tenant fails closed", async () => {
  let dbLoads = 0;
  setMcpDbAllowlistForTests([
    {
      model: "property",
      tenantField: "tenantId",
      workspaceField: null,
      readOnly: true,
    },
  ]);
  setMcpExecutorDbLoaderForTests(async () => {
    dbLoads += 1;
    return { prismaGlobal: {} };
  });

  const executor = new MCPExecutor(buildContract({ executor: "db" }));
  await assert.rejects(
    executor.run({ table: "property", where: {} }, {}),
    (error) =>
      error instanceof McpDbPolicyError &&
      error.reasonCode === "DB_SCOPE_MISSING"
  );
  assert.equal(dbLoads, 0, "scope denial must happen before loading Prisma");
});

test("MCPExecutor: workspace-scoped model without authenticated workspace fails closed", async () => {
  let dbLoads = 0;
  setMcpDbAllowlistForTests([
    {
      model: "property",
      tenantField: "tenantId",
      workspaceField: "workspaceId",
      readOnly: true,
    },
  ]);
  setMcpExecutorDbLoaderForTests(async () => {
    dbLoads += 1;
    return { prismaGlobal: {} };
  });

  const executor = new MCPExecutor(buildContract({ executor: "db" }));
  await assert.rejects(
    executor.run(
      { table: "property", where: {} },
      { tenantId: "tenant-authenticated" }
    ),
    (error) =>
      error instanceof McpDbPolicyError &&
      error.reasonCode === "DB_SCOPE_MISSING"
  );
  assert.equal(dbLoads, 0, "scope denial must happen before loading Prisma");
});

test("MCPExecutor: input validation fails before the db delegate is called", async () => {
  let calls = 0;
  setMcpExecutorDbLoaderForTests(async () => ({
    prismaGlobal: {
      property: {
        findMany: async () => {
          calls += 1;
          return [];
        },
      },
    },
  }));

  const executor = new MCPExecutor(
    buildContract({
      executor: "db",
      inputSchema: {
        type: "object",
        required: ["table", "where"],
        properties: { table: { const: "property" }, where: { type: "object" } },
      },
    })
  );

  await assert.rejects(executor.run({ table: "property" }), /Invalid payload/);
  assert.equal(calls, 0);
});

test("MCPExecutor: allowlisted global model is read-only and emits an access log", async () => {
  const logs: unknown[] = [];
  let received: unknown;
  setMcpDbAllowlistForTests([
    {
      model: "globalCatalog",
      tenantField: null,
      workspaceField: null,
      readOnly: true,
    },
  ]);
  setMcpExecutorDbLoaderForTests(async () => ({
    prismaGlobal: {
      globalCatalog: {
        findMany: async (args: unknown) => {
          received = args;
          return [{ id: "global-1" }];
        },
      },
    },
  }));

  const contract = buildContract({ executor: "db" });
  const executor = new MCPExecutor(contract);
  const result = await executor.run(
    { table: "globalCatalog", where: { status: "published" } },
    { logGlobalDbAccess: (event) => logs.push(event) }
  );

  assert.deepEqual(result, [{ id: "global-1" }]);
  assert.deepEqual(received, { where: { status: "published" } });
  assert.deepEqual(logs, [
    {
      eventType: "mcp.db.global_access",
      model: "globalCatalog",
      tool: contract.name,
      version: "1.0.0",
    },
  ]);
});

test("MCPExecutor: allowlisted name must still resolve to a Prisma findMany delegate", async () => {
  setMcpDbAllowlistForTests([
    {
      model: "$connect",
      tenantField: null,
      workspaceField: null,
      readOnly: true,
    },
  ]);
  setMcpExecutorDbLoaderForTests(async () => ({
    prismaGlobal: { $connect: async () => undefined },
  }));

  const executor = new MCPExecutor(buildContract({ executor: "db" }));
  await assert.rejects(
    executor.run(
      { table: "$connect", where: {} },
      { logGlobalDbAccess: () => undefined }
    ),
    /Invalid db table\/model: \$connect/
  );
});

// Fail-closed canônico desde MCP-1L. Regressão para acesso sem
// allowlist/escopo é violação P0.
