import type { OrchestratorInput } from "../orchestrator/agentOrchestrator";
import type {
  MemoryRecord,
  MemoryScope,
  MemoryVectorMatch,
  MemorySnapshot,
} from "../types";

export interface ShortTermMemoryStore {
  retrieve(scope: MemoryScope, limit?: number): Promise<MemoryRecord[]>;
  store(scope: MemoryScope, records: MemoryRecord[]): Promise<void>;
  truncate(scope: MemoryScope, keepLatest: number): Promise<void>;
}

export interface LongTermMemoryStore {
  append(scope: MemoryScope, records: MemoryRecord[]): Promise<void>;
  query(scope: MemoryScope, params: { limit?: number; since?: Date }): Promise<MemoryRecord[]>;
}

export interface VectorMemoryStore {
  upsert(scope: MemoryScope, vectors: Array<{ key: string; values: number[]; metadata?: Record<string, unknown> }>): Promise<void>;
  search(scope: MemoryScope, params: { query: number[]; topK: number }): Promise<Array<{ key: string; score: number; metadata?: Record<string, unknown> }>>;
}

export type MemoryServiceOptions = {
  shortTermStore: ShortTermMemoryStore;
  longTermStore?: LongTermMemoryStore;
  vectorStore?: VectorMemoryStore;
};

export interface MemorySnapshotStore {
  load(scope: MemoryScope): Promise<MemorySnapshot | null>;
  save(scope: MemoryScope, snapshot: MemorySnapshot): Promise<void>;
}

export class MemoryService {
  private readonly shortTermStore: ShortTermMemoryStore;
  private readonly longTermStore?: LongTermMemoryStore;
  private readonly vectorStore?: VectorMemoryStore;

  constructor(options: MemoryServiceOptions) {
    this.shortTermStore = options.shortTermStore;
    this.longTermStore = options.longTermStore;
    this.vectorStore = options.vectorStore;
  }

  async snapshot(scope: MemoryScope, params: { topK?: number; vectorQuery?: number[] } = {}): Promise<MemorySnapshot> {
    const [shortTerm, longTerm, vectorMatches] = await Promise.all([
      this.shortTermStore.retrieve(scope, params.topK ?? 10),
      this.longTermStore?.query(scope, { limit: params.topK ?? 50 }) ?? Promise.resolve([]),
      params.vectorQuery && this.vectorStore
        ? this.vectorStore.search(scope, { query: params.vectorQuery, topK: params.topK ?? 5 })
        : Promise.resolve([]),
    ]);

    return {
      shortTerm,
      longTerm,
      vectorMatches,
    };
  }

  async ingestShortTerm(scope: MemoryScope, records: MemoryRecord[]) {
    if (records.length === 0) return;
    await this.shortTermStore.store(scope, records);
  }

  async promoteToLongTerm(scope: MemoryScope, records: MemoryRecord[]) {
    if (!this.longTermStore || records.length === 0) return;
    await this.longTermStore.append(scope, records);
  }

  async upsertVectors(
    scope: MemoryScope,
    vectors: Array<{ key: string; values: number[]; metadata?: Record<string, unknown> }>
  ) {
    if (!this.vectorStore || vectors.length === 0) return;
    await this.vectorStore.upsert(scope, vectors);
  }

  async truncateShortTerm(scope: MemoryScope, keepLatest: number) {
    await this.shortTermStore.truncate(scope, keepLatest);
  }
}

export type MemorySyncJobParams = {
  scope: MemoryScope;
  maxShortTermRecords?: number;
  cursor?: string;
};

export class MemorySyncJob {
  constructor(
    private readonly memory: MemoryService,
    private readonly options: { promoteBatchSize?: number; snapshotStore?: MemorySnapshotStore } = {}
  ) {}

  async run(params: MemorySyncJobParams): Promise<void> {
    const promoteBatchSize = this.options.promoteBatchSize ?? 50;
    const snapshot = await this.memory.snapshot(params.scope, { topK: promoteBatchSize });

    if (snapshot.shortTerm.length === 0) {
      return;
    }

    await this.memory.promoteToLongTerm(params.scope, snapshot.shortTerm);

    if (typeof params.maxShortTermRecords === "number") {
      await this.memory.truncateShortTerm(params.scope, params.maxShortTermRecords);
    }

    if (this.options.snapshotStore) {
      await this.options.snapshotStore.save(params.scope, {
        ...snapshot,
        cursor: params.cursor,
      });
    }
  }
}

export type MemoryRetentionJobParams = {
  scope: MemoryScope;
  maxAgeMs: number;
};

export class MemoryRetentionJob {
  constructor(private readonly memory: MemoryService) {}

  async run(params: MemoryRetentionJobParams) {
    const snapshot = await this.memory.snapshot(params.scope, { topK: 500 });
    const cutoff = Date.now() - params.maxAgeMs;
    const keep = snapshot.shortTerm.filter((record) => record.createdAt.getTime() >= cutoff);
    const dropCount = snapshot.shortTerm.length - keep.length;
    if (dropCount > 0) {
      await this.memory.truncateShortTerm(params.scope, keep.length);
    }
  }
}

export function scopeFromOrchestrator(input: OrchestratorInput, agentId: string): MemoryScope {
  return {
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    agentId,
  };
}

export type { MemoryScope, MemoryRecord, MemoryVectorMatch } from "../types";

export { InMemoryShortTermMemoryStore } from "./stores/inMemoryShortTermStore";
export { InMemoryLongTermMemoryStore } from "./stores/inMemoryLongTermStore";
export { InMemoryVectorStore } from "./stores/inMemoryVectorStore";
export { RedisShortTermMemoryStore } from "./stores/redisShortTermStore";
export { PostgresLongTermMemoryStore } from "./stores/postgresLongTermStore";
export { PostgresVectorMemoryStore } from "./stores/postgresVectorStore";
export { PrismaMemorySnapshotStore } from "./stores/prismaMemorySnapshotStore";
