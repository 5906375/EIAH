import test from "node:test";
import assert from "node:assert/strict";
import { PostgresVectorMemoryStore } from "../stores/postgresVectorStore";

type EmbeddingRow = {
  id: string;
  tenantId: string;
  workspaceId: string;
  agentId: string;
  chunkKey: string;
  embedding: number[];
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
};

function cosineSimilarity(a: number[], b: number[]) {
  const minLength = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < minLength; i += 1) {
    const valueA = a[i] ?? 0;
    const valueB = b[i] ?? 0;
    dot += valueA * valueB;
    normA += valueA * valueA;
    normB += valueB * valueB;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

test("PostgresVectorMemoryStore returns equivalent ordering for pgvector and JS fallback", async () => {
  const scope = { tenantId: "t1", workspaceId: "w1", agentId: "a1" };
  const rows: EmbeddingRow[] = [
    {
      id: "1",
      tenantId: "t1",
      workspaceId: "w1",
      agentId: "a1",
      chunkKey: "alpha",
      embedding: [1, 0, 0],
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: "2",
      tenantId: "t1",
      workspaceId: "w1",
      agentId: "a1",
      chunkKey: "beta",
      embedding: [0, 1, 0],
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: "3",
      tenantId: "t1",
      workspaceId: "w1",
      agentId: "a1",
      chunkKey: "gamma",
      embedding: [1, 1, 0],
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  const query = [1, 0.4, 0];
  const expectedOrder = [...rows]
    .map((row) => ({
      key: row.chunkKey,
      score: cosineSimilarity(row.embedding, query),
    }))
    .sort((a, b) => b.score - a.score)
    .map((row) => row.key);

  const prisma = {
    embeddingChunk: {
      findMany: async () => rows,
      upsert: async () => rows[0],
    },
    $queryRaw: async () =>
      [...rows]
        .map((row) => ({
          chunk_key: row.chunkKey,
          metadata: row.metadata,
          score: cosineSimilarity(row.embedding, query),
        }))
        .sort((a, b) => b.score - a.score),
  };

  const storePg = new PostgresVectorMemoryStore(prisma as any, {
    pgvectorAvailable: true,
    vectorColumn: "embedding",
  });
  const pgResults = await storePg.search(scope, { query, topK: 3 });

  const storeFallback = new PostgresVectorMemoryStore(prisma as any, {
    pgvectorAvailable: false,
    vectorColumn: "embedding",
  });
  const fallbackResults = await storeFallback.search(scope, { query, topK: 3 });

  assert.deepEqual(
    pgResults.map((row) => row.key),
    expectedOrder
  );
  assert.deepEqual(
    fallbackResults.map((row) => row.key),
    expectedOrder
  );
});

