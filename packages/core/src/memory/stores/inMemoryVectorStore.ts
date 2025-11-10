import type { MemoryScope, VectorMemoryStore } from "../index";

type ScopeKey = string;

function scopeKey(scope: MemoryScope): ScopeKey {
  return [scope.tenantId, scope.workspaceId, scope.agentId].join(":");
}

type VectorEntry = {
  key: string;
  values: number[];
  metadata?: Record<string, unknown>;
};

export class InMemoryVectorStore implements VectorMemoryStore {
  private readonly vectors = new Map<ScopeKey, Map<string, VectorEntry>>();

  async upsert(
    scope: MemoryScope,
    entries: Array<{ key: string; values: number[]; metadata?: Record<string, unknown> }>
  ): Promise<void> {
    const key = scopeKey(scope);
    const store = this.vectors.get(key) ?? new Map<string, VectorEntry>();
    entries.forEach((entry) => {
      store.set(entry.key, {
        key: entry.key,
        values: entry.values,
        metadata: entry.metadata,
      });
    });
    this.vectors.set(key, store);
  }

  async search(
    scope: MemoryScope,
    params: { query: number[]; topK: number }
  ): Promise<Array<{ key: string; score: number; metadata?: Record<string, unknown> }>> {
    const key = scopeKey(scope);
    const store = this.vectors.get(key);
    if (!store || store.size === 0) {
      return [];
    }

    const queryNorm = l2Norm(params.query);
    const candidates = Array.from(store.values()).map((entry) => {
      const score = cosineSimilarity(entry.values, params.query, queryNorm);
      return {
        key: entry.key,
        score,
        metadata: entry.metadata,
      };
    });

    return candidates
      .sort((a, b) => b.score - a.score)
      .slice(0, params.topK);
  }
}

function l2Norm(values: number[]): number {
  const sum = values.reduce((acc, value) => acc + value * value, 0);
  return Math.sqrt(sum) || 1;
}

function cosineSimilarity(a: number[], b: number[], normA: number): number {
  const normB = l2Norm(b);
  const minLength = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < minLength; i += 1) {
    dot += a[i]! * b[i]!;
  }
  return dot / (normA * normB);
}
