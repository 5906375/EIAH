import Redis from "ioredis";
import { requireRedisUrl } from "@eiah/core";
import { Prisma, type MemoryEvent, type EmbeddingChunk, type MemorySnapshot, prisma } from "@repo/db";
import {
  MemoryService,
  RedisShortTermMemoryStore,
  PostgresLongTermMemoryStore,
  PostgresVectorMemoryStore,
  PrismaMemorySnapshotStore,
} from "@eiah/core";

const DEFAULT_REDIS_URL = requireRedisUrl(process.env.REDIS_URL, "maintenance-worker:memory");
const DEFAULT_SHORT_TTL_SECONDS = Number(process.env.MEMORY_SHORT_TTL_SECONDS ?? 60 * 60 * 24);

let redisClient: Redis | null = null;
let memoryService: MemoryService | null = null;
let snapshotStore: PrismaMemorySnapshotStore | null = null;

type LongTermMemoryEventRow = {
  tenantId: string;
  workspaceId: string;
  agentId: string;
  key: string;
  content: string;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
};

function ensureRedis() {
  if (!redisClient) {
    redisClient = new Redis(DEFAULT_REDIS_URL);
  }
  return redisClient;
}

function jsonValueToRecord(
  value: Prisma.JsonValue | null | undefined
): Record<string, unknown> | null {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    return null;
  }
  return value as Record<string, unknown>;
}

function recordToJsonInput(
  value: Record<string, unknown> | null | undefined
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}

export function getMemoryDeps() {
  if (!memoryService || !snapshotStore) {
    const redis = ensureRedis();

    memoryService = new MemoryService({
      shortTermStore: new RedisShortTermMemoryStore(redis, {
        ttlSeconds: DEFAULT_SHORT_TTL_SECONDS,
      }),
      longTermStore: new PostgresLongTermMemoryStore({
        memoryEvent: {
          createMany: async ({ data }) =>
            prisma.memoryEvent.createMany({
              data: data.map((row: LongTermMemoryEventRow) => ({
                tenantId: row.tenantId,
                workspaceId: row.workspaceId,
                agentId: row.agentId,
                key: row.key,
                content: row.content,
                metadata: recordToJsonInput(row.metadata) ?? Prisma.JsonNull,
                createdAt: row.createdAt,
              })),
            }),
          findMany: async (args) => {
            const rows = await prisma.memoryEvent.findMany(args as Prisma.MemoryEventFindManyArgs);
            return rows.map((row: MemoryEvent) => ({
              id: row.id,
              tenantId: row.tenantId,
              workspaceId: row.workspaceId,
              agentId: row.agentId,
              key: row.key,
              content: row.content,
              metadata: jsonValueToRecord(row.metadata),
              createdAt: row.createdAt,
            }));
          },
        },
      }),
      vectorStore: new PostgresVectorMemoryStore({
        embeddingChunk: {
          upsert: async (args) =>
            prisma.embeddingChunk
              .upsert({
                where: args.where,
                create: {
                  tenantId: args.create.tenantId,
                  workspaceId: args.create.workspaceId,
                  agentId: args.create.agentId,
                  chunkKey: args.create.chunkKey,
                  embedding: args.create.embedding,
                  metadata: recordToJsonInput(args.create.metadata) ?? Prisma.JsonNull,
                },
                update: {
                  embedding: args.update.embedding,
                  metadata: recordToJsonInput(args.update.metadata) ?? Prisma.JsonNull,
                  updatedAt: args.update.updatedAt ?? new Date(),
                },
              })
              .then((row: EmbeddingChunk) => ({
                id: row.id,
                tenantId: row.tenantId,
                workspaceId: row.workspaceId,
                agentId: row.agentId,
                chunkKey: row.chunkKey,
                embedding: row.embedding,
                metadata: jsonValueToRecord(row.metadata),
                createdAt: row.createdAt,
                updatedAt: row.updatedAt,
              })),
          findMany: async (args) => {
            const rows = await prisma.embeddingChunk.findMany(args as Prisma.EmbeddingChunkFindManyArgs);
            return rows.map((row: EmbeddingChunk) => ({
              id: row.id,
              tenantId: row.tenantId,
              workspaceId: row.workspaceId,
              agentId: row.agentId,
              chunkKey: row.chunkKey,
              embedding: row.embedding,
              metadata: jsonValueToRecord(row.metadata),
              createdAt: row.createdAt,
              updatedAt: row.updatedAt,
            }));
          },
        },
      }),
    });

    snapshotStore = new PrismaMemorySnapshotStore({
      memorySnapshot: {
        findUnique: (args) =>
          prisma.memorySnapshot.findUnique(args as Prisma.MemorySnapshotFindUniqueArgs).then((row: MemorySnapshot | null) => {
            if (!row) return null;
            return {
              id: row.id,
              tenantId: row.tenantId,
              workspaceId: row.workspaceId,
              agentId: row.agentId,
              shortTerm: row.shortTerm,
              longTerm: row.longTerm,
              vectorState: jsonValueToRecord(row.vectorState),
              cursor: row.cursor,
              createdAt: row.createdAt,
              updatedAt: row.updatedAt,
            };
          }),
        upsert: async (args) =>
          prisma.memorySnapshot
            .upsert({
              where: args.where,
              create: {
                tenantId: args.create.tenantId,
                workspaceId: args.create.workspaceId,
                agentId: args.create.agentId,
                shortTerm: args.create.shortTerm as Prisma.InputJsonValue,
                longTerm: args.create.longTerm as Prisma.InputJsonValue,
                vectorState: recordToJsonInput(args.create.vectorState) ?? Prisma.JsonNull,
                cursor: args.create.cursor,
              },
              update: {
                shortTerm: args.update.shortTerm as Prisma.InputJsonValue,
                longTerm: args.update.longTerm as Prisma.InputJsonValue,
                vectorState: recordToJsonInput(args.update.vectorState) ?? Prisma.JsonNull,
                cursor: args.update.cursor ?? null,
                updatedAt: args.update.updatedAt,
              },
            })
            .then((row: MemorySnapshot) => ({
              id: row.id,
              tenantId: row.tenantId,
              workspaceId: row.workspaceId,
              agentId: row.agentId,
              shortTerm: row.shortTerm,
              longTerm: row.longTerm,
              vectorState: jsonValueToRecord(row.vectorState),
              cursor: row.cursor,
              createdAt: row.createdAt,
              updatedAt: row.updatedAt,
            })),
      },
    });
  }

  return { memoryService, snapshotStore } as {
    memoryService: MemoryService;
    snapshotStore: PrismaMemorySnapshotStore;
  };
}

export async function shutdownMemoryDeps() {
  if (redisClient) {
    await redisClient.quit().catch(() => undefined);
    redisClient = null;
  }
  memoryService = null;
  snapshotStore = null;
}
