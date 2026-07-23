import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { MCPExecutor, setMcpExecutorDbLoaderForTests } from "./MCPExecutor.js";
import type { ToolContract } from "../types/ToolContract.js";

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

test("MCPExecutor: db executor forwards the exact where clause to findMany", async () => {
  const received: unknown[] = [];
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

  try {
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
    const result = await executor.run({
      table: "property",
      where: { tenantId: "tenant-a", status: "active" },
    });

    assert.deepEqual(result, [{ id: "property-1" }]);
    assert.deepEqual(received, [{ where: { tenantId: "tenant-a", status: "active" } }]);
  } finally {
    setMcpExecutorDbLoaderForTests();
  }
});

test("MCPExecutor: db executor rejects an unknown model", async () => {
  setMcpExecutorDbLoaderForTests(async () => ({ prismaGlobal: {} }));
  try {
    const executor = new MCPExecutor(buildContract({ executor: "db" }));
    await assert.rejects(
      executor.run({ table: "modelThatDoesNotExist", where: {} }),
      /Invalid db table\/model: modelThatDoesNotExist/
    );
  } finally {
    setMcpExecutorDbLoaderForTests();
  }
});

test("MCPExecutor: db executor rejects a Prisma member without findMany", async () => {
  setMcpExecutorDbLoaderForTests(async () => ({
    prismaGlobal: { $connect: async () => undefined },
  }));
  try {
    const executor = new MCPExecutor(buildContract({ executor: "db" }));
    await assert.rejects(
      executor.run({ table: "$connect", where: {} }),
      /Invalid db table\/model: \$connect/
    );
  } finally {
    setMcpExecutorDbLoaderForTests();
  }
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

  try {
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
  } finally {
    setMcpExecutorDbLoaderForTests();
  }
});

test("MCPExecutor: db executor currently does not inject the contract tenantId", async () => {
  let received: any;
  setMcpExecutorDbLoaderForTests(async () => ({
    prismaGlobal: {
      property: {
        findMany: async (args: unknown) => {
          received = args;
          return [];
        },
      },
    },
  }));

  try {
    const executor = new MCPExecutor(
      buildContract({ executor: "db", tenantId: "contract-tenant" })
    );
    await executor.run({ table: "property", where: { status: "active" } });

    // CARACTERIZAÇÃO TEMPORÁRIA LEG-015 — comportamento atual SEM isolamento. Expectativa futura: allowlist + tenant injection (MCP-1L). NÃO tratar este teste como especificação desejada.
    assert.deepEqual(received, { where: { status: "active" } });
    assert.equal("tenantId" in received.where, false);
  } finally {
    setMcpExecutorDbLoaderForTests();
  }
});

test("MCPExecutor: db executor currently forwards arbitrary caller where unchanged", async () => {
  let received: any;
  setMcpExecutorDbLoaderForTests(async () => ({
    prismaGlobal: {
      property: {
        findMany: async (args: unknown) => {
          received = args;
          return [];
        },
      },
    },
  }));

  try {
    const executor = new MCPExecutor(
      buildContract({ executor: "db", tenantId: "contract-tenant" })
    );
    const callerWhere = { tenantId: "other-tenant", OR: [{ secret: { not: null } }] };
    await executor.run({ table: "property", where: callerWhere });

    // CARACTERIZAÇÃO TEMPORÁRIA LEG-015 — comportamento atual SEM isolamento. Expectativa futura: allowlist + tenant injection (MCP-1L). NÃO tratar este teste como especificação desejada.
    assert.equal(received.where, callerWhere);
  } finally {
    setMcpExecutorDbLoaderForTests();
  }
});
