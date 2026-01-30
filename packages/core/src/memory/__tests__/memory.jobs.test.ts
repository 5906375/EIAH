import { test } from "node:test";
import assert from "node:assert/strict";

import {
  InMemoryLongTermMemoryStore,
  InMemoryShortTermMemoryStore,
  KnowledgeBackfillJob,
  MemoryService,
  MemorySyncJob,
} from "../index";
import type {
  MemoryRecord,
  MemoryScope,
  MemorySnapshot,
  MemorySnapshotStore,
  VectorMemoryStore,
} from "../index";

const scope: MemoryScope = {
  tenantId: "tenant-tests",
  workspaceId: "workspace-tests",
  agentId: "agent-tests",
};

function makeRecord(key: string, createdAtIso: string, metadata?: Record<string, unknown>): MemoryRecord {
  return {
    key,
    content: `content-${key}`,
    metadata,
    createdAt: new Date(createdAtIso),
  };
}

test("MemorySyncJob promove short-term, trunca excedente e persiste snapshot", async () => {
  const shortTerm = new InMemoryShortTermMemoryStore();
  const longTerm = new InMemoryLongTermMemoryStore();
  const memory = new MemoryService({
    shortTermStore: shortTerm,
    longTermStore: longTerm,
  });

  const records = [
    makeRecord("r1", "2024-01-01T00:00:00.000Z"),
    makeRecord("r2", "2024-01-02T00:00:00.000Z"),
    makeRecord("r3", "2024-01-03T00:00:00.000Z"),
  ];
  await memory.ingestShortTerm(scope, records);

  const savedSnapshots: Array<{ scope: MemoryScope; snapshot: MemorySnapshot }> = [];
  const snapshotStore: MemorySnapshotStore = {
    async load() {
      return null;
    },
    async save(snapshotScope, snapshot) {
      savedSnapshots.push({ scope: snapshotScope, snapshot });
    },
  };

  const job = new MemorySyncJob(memory, { snapshotStore, promoteBatchSize: 10 });
  await job.run({ scope, maxShortTermRecords: 1, cursor: "cursor-tests" });

  const promoted = await longTerm.query(scope, { limit: 10 });
  assert.equal(promoted.length, records.length, "todos os registros devem ir para o longo prazo");

  const remainingShort = await shortTerm.retrieve(scope, 10);
  assert.equal(remainingShort.length, 1);
  assert.equal(
    remainingShort[0]?.key,
    "r3",
    "truncate deve manter apenas o item mais recente quando maxShortTermRecords=1"
  );

  assert.equal(savedSnapshots.length, 1);
  assert.equal(savedSnapshots[0]?.scope.agentId, scope.agentId);
  assert.equal(savedSnapshots[0]?.snapshot.shortTerm.length, records.length);
  assert.equal(savedSnapshots[0]?.snapshot.cursor, "cursor-tests");
});

class RecordingVectorStore implements VectorMemoryStore {
  calls: Array<{
    scope: MemoryScope;
    vectors: Array<{ key: string; values: number[]; metadata?: Record<string, unknown> }>;
  }> = [];

  async upsert(
    callScope: MemoryScope,
    vectors: Array<{ key: string; values: number[]; metadata?: Record<string, unknown> }>
  ) {
    this.calls.push({ scope: callScope, vectors });
  }

  async search() {
    return [];
  }
}

test("KnowledgeBackfillJob envia apenas registros com embeddings para o vector store", async () => {
  const shortTerm = new InMemoryShortTermMemoryStore();
  const longTerm = new InMemoryLongTermMemoryStore();
  const vectorStore = new RecordingVectorStore();
  const memory = new MemoryService({
    shortTermStore: shortTerm,
    longTermStore: longTerm,
    vectorStore,
  });

  await longTerm.append(scope, [
    makeRecord("vectorized", "2024-02-01T00:00:00.000Z", { embedding: [0.2, 0.3, 0.4] }),
    makeRecord("ignored", "2024-02-02T00:00:00.000Z", { foo: "bar" }),
  ]);

  const job = new KnowledgeBackfillJob(memory);
  await job.run({ scope, topK: 5 });

  assert.equal(vectorStore.calls.length, 1, "vector store deve ser chamado uma vez");
  const [{ vectors }] = vectorStore.calls;
  assert.equal(vectors.length, 1, "somente registros com embedding devem ser considerados");
  assert.equal(vectors[0]?.key, "vectorized");
  assert.deepEqual(vectors[0]?.values, [0.2, 0.3, 0.4]);
});
