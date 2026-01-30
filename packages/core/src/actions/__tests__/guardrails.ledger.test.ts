import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createLedgerBackedIdempotencyStore,
  encodeGuardrailKey,
  type GuardrailLedgerAdapter,
} from "../guardrails";

class UniqueViolationError extends Error {
  constructor() {
    super("Unique constraint violation");
    this.name = "PrismaClientKnownRequestError";
  }
}

type LedgerKey = `${string}:${string}:${string}`;

function createMockAdapter(): {
  adapter: GuardrailLedgerAdapter;
  insertedKeys: Set<LedgerKey>;
  cleanupCalls: Array<{ tenantId: string; actionType: string; before: Date }>;
} {
  const insertedKeys = new Set<LedgerKey>();
  const cleanupCalls: Array<{ tenantId: string; actionType: string; before: Date }> = [];

  const adapter: GuardrailLedgerAdapter = {
    async insert(entry) {
      const key: LedgerKey = `${entry.tenantId}:${entry.actionType}:${entry.idempotencyKey ?? ""}`;
      if (insertedKeys.has(key)) {
        throw new UniqueViolationError();
      }
      insertedKeys.add(key);
    },
    async cleanup(params) {
      cleanupCalls.push(params);
    },
    isUniqueConstraintError(error) {
      return error instanceof UniqueViolationError;
    },
  };

  return { adapter, insertedKeys, cleanupCalls };
}

describe("createLedgerBackedIdempotencyStore", () => {
  it("registers the first call and rejects duplicates (sequential)", async () => {
    const { adapter } = createMockAdapter();
    const store = createLedgerBackedIdempotencyStore(adapter);
    const key = encodeGuardrailKey({
      tenantId: "tenant-1",
      actionType: "action-a",
      idempotencyKey: "job-123",
    });

    const firstRun = await store.register(key, 0);
    const secondRun = await store.register(key, 0);

    assert.equal(firstRun, true);
    assert.equal(secondRun, false);
  });

  it("only accepts one concurrent registration per key", async () => {
    const { adapter } = createMockAdapter();
    const store = createLedgerBackedIdempotencyStore(adapter);
    const key = encodeGuardrailKey({
      tenantId: "tenant-1",
      actionType: "action-a",
      idempotencyKey: "concurrent",
    });

    const results = await Promise.all([store.register(key, 0), store.register(key, 0)]);
    results.sort(); // [false, true]

    assert.deepEqual(results, [false, true]);
  });

  it("propagates non-unique errors from the adapter", async () => {
    const { adapter } = createMockAdapter();
    const boom = new Error("boom");
    adapter.insert = async () => {
      throw boom;
    };
    const store = createLedgerBackedIdempotencyStore(adapter);
    const key = encodeGuardrailKey({
      tenantId: "tenant-1",
      actionType: "action-a",
      idempotencyKey: "fails",
    });

    await assert.rejects(() => store.register(key, 0), (error) => error === boom);
  });

  it("runs cleanup when ttl is positive", async () => {
    const { adapter, cleanupCalls } = createMockAdapter();
    const store = createLedgerBackedIdempotencyStore(adapter);
    const key = encodeGuardrailKey({
      tenantId: "tenant-1",
      actionType: "action-a",
      idempotencyKey: "ttl",
    });

    await store.register(key, 1_000);

    assert.equal(cleanupCalls.length, 1);
    assert.equal(cleanupCalls[0]?.tenantId, "tenant-1");
    assert.equal(cleanupCalls[0]?.actionType, "action-a");
  });
});
