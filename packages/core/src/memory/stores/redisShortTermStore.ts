import { MemoryRecordSchema } from "../../types";
import type { MemoryRecord, MemoryScope, ShortTermMemoryStore } from "../index";

type PipelineLike = {
  zadd(key: string, score: number, member: string): PipelineLike;
  expire(key: string, ttlSeconds: number): PipelineLike;
  exec(): Promise<unknown>;
};

type RedisClientLike = {
  zrevrange(key: string, start: number, stop: number): Promise<string[]>;
  zadd(key: string, score: number, member: string): Promise<number>;
  zcard(key: string): Promise<number>;
  zremrangebyrank(key: string, start: number, stop: number): Promise<number>;
  del(key: string): Promise<number>;
  expire(key: string, ttlSeconds: number): Promise<number>;
  pipeline(): PipelineLike;
};

const DEFAULT_PREFIX = "memory:short";
const DEFAULT_TTL_SECONDS = 60 * 60 * 24; // 24h

function scopeKey(scope: MemoryScope, prefix: string) {
  return [prefix, scope.tenantId, scope.workspaceId, scope.agentId].join(":");
}

function serialize(record: MemoryRecord): string {
  return JSON.stringify({
    ...record,
    createdAt: record.createdAt.toISOString(),
  });
}

function deserialize(payload: string): MemoryRecord | null {
  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    return MemoryRecordSchema.parse({
      ...parsed,
      createdAt: parsed.createdAt ? new Date(String(parsed.createdAt)) : new Date(),
    });
  } catch {
    return null;
  }
}

export class RedisShortTermMemoryStore implements ShortTermMemoryStore {
  private readonly prefix: string;
  private readonly ttlSeconds: number;

  constructor(
    private readonly redis: RedisClientLike,
    options: { prefix?: string; ttlSeconds?: number } = {}
  ) {
    this.prefix = options.prefix ?? DEFAULT_PREFIX;
    this.ttlSeconds = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  }

  async retrieve(scope: MemoryScope, limit = 10): Promise<MemoryRecord[]> {
    const key = scopeKey(scope, this.prefix);
    const raw = await this.redis.zrevrange(key, 0, Math.max(limit - 1, 0));
    return raw
      .map(deserialize)
      .filter((record): record is MemoryRecord => Boolean(record));
  }

  async store(scope: MemoryScope, records: MemoryRecord[]): Promise<void> {
    if (records.length === 0) return;
    const key = scopeKey(scope, this.prefix);
    const pipeline = this.redis.pipeline();
    records.forEach((record) => {
      pipeline.zadd(key, record.createdAt.getTime(), serialize(record));
    });
    pipeline.expire(key, this.ttlSeconds);
    await pipeline.exec();
  }

  async truncate(scope: MemoryScope, keepLatest: number): Promise<void> {
    const key = scopeKey(scope, this.prefix);
    if (keepLatest <= 0) {
      await this.redis.del(key);
      return;
    }

    const total = await this.redis.zcard(key);
    if (total <= keepLatest) {
      return;
    }
    const removeCount = total - keepLatest;
    await this.redis.zremrangebyrank(key, 0, removeCount - 1);
  }
}
