import test from "node:test";
import assert from "node:assert/strict";
import { TxStore } from "./txStore";
import { Web3Executor } from "./web3Executor";

type AuditRow = {
  tenantId: string;
  workspaceId: string | null;
  runId: string | null;
  eventType: string;
  severity: string;
  message: string;
  metadata: unknown;
  createdAt: Date;
};

function createPrismaMock() {
  const rows: AuditRow[] = [];
  let seq = 0;

  const prisma = {
    guardrailAuditLedger: {
      async create(args: { data: Omit<AuditRow, "createdAt"> }) {
        rows.push({ ...args.data, createdAt: new Date(Date.now() + seq++) });
        return rows[rows.length - 1];
      },
      async findMany(args: {
        where: {
          tenantId: string;
          runId?: string;
          eventType?: { startsWith: string };
          createdAt?: { gte: Date };
        };
        orderBy: { createdAt: "desc" };
        take: number;
        select: {
          tenantId: true;
          workspaceId: true;
          runId: true;
          metadata: true;
        };
      }) {
        const filtered = rows
          .filter((row) => row.tenantId === args.where.tenantId)
          .filter((row) => (args.where.runId ? row.runId === args.where.runId : true))
          .filter((row) =>
            args.where.eventType?.startsWith
              ? row.eventType.startsWith(args.where.eventType.startsWith)
              : true
          )
          .filter((row) => (args.where.createdAt?.gte ? row.createdAt >= args.where.createdAt.gte : true))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(0, args.take)
          .map((row) => ({
            tenantId: row.tenantId,
            workspaceId: row.workspaceId,
            runId: row.runId,
            metadata: row.metadata,
          }));
        return filtered;
      },
    },
  };

  return { prisma, rows };
}

test("TxStore append and retrieve latest by idempotency", async () => {
  const { prisma } = createPrismaMock();
  const store = new TxStore(prisma);

  await store.append({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    runId: "run-1",
    idempotencyKey: "idem-1",
    txId: "0xtx1",
    nonce: "n-1",
    status: "submitted",
    criticalHash: "abc",
    chainId: 1337,
  });

  await store.append({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    runId: "run-1",
    idempotencyKey: "idem-1",
    txId: "0xtx1",
    nonce: "n-1",
    status: "confirmed",
    criticalHash: "abc",
    chainId: 1337,
    receipt: { blockNumber: "0x10" },
  });

  const latest = await store.latestByIdempotency({
    tenantId: "tenant-A",
    runId: "run-1",
    idempotencyKey: "idem-1",
  });

  assert.ok(latest);
  assert.equal(latest.status, "confirmed");
  assert.equal(latest.txId, "0xtx1");
});

test("Web3Executor submit and confirm transaction", async () => {
  const { prisma } = createPrismaMock();
  const store = new TxStore(prisma);
  let receiptCalls = 0;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      method?: string;
    };

    if (body.method === "eth_sendTransaction") {
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0xabc123def456" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (body.method === "eth_getTransactionReceipt") {
      receiptCalls += 1;
      const result =
        receiptCalls > 1
          ? { transactionHash: "0xabc123def456", status: "0x1", blockNumber: "0x10" }
          : null;
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (body.method === "eth_blockNumber") {
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x12" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -1, message: "unsupported" } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof globalThis.fetch;

  try {
    const executor = new Web3Executor(store, {
      rpcUrl: "http://127.0.0.1:8545",
      fromAddress: "0x1111111111111111111111111111111111111111",
      toAddress: "0x2222222222222222222222222222222222222222",
      pollIntervalMs: 1,
      timeoutMs: 200,
      confirmations: 1,
      failClosed: true,
      chainId: 1337,
    });

    const result = await executor.submitAndWait({
      tenantId: "tenant-A",
      workspaceId: "workspace-A",
      runId: "run-2",
      criticalHash: "deadbeef",
      idempotencyKey: "idem-run-2",
      nonce: "nonce-run-2",
    });

    assert.equal(result.status, "confirmed");
    assert.equal(result.txId, "0xabc123def456");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
