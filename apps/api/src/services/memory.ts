import Redis from "ioredis";
import { PrismaClient, Prisma } from "@prisma/client";
import {
  MemoryService,
  PostgresLongTermMemoryStore,
  PostgresVectorMemoryStore,
  PrismaMemorySnapshotStore,
  RedisShortTermMemoryStore,
  type MemorySnapshotStore,
} from "@eiah/core";

const DEFAULT_REDIS_URL = "redis://127.0.0.1:6379";
const DEFAULT_SHORT_TTL_SECONDS = 60 * 60 * 24;

let redisClient: Redis | null = null;
let prismaClient: PrismaClient | null = null;
let memoryService: MemoryService | null = null;
let snapshotStore: MemorySnapshotStore | null = null;

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

function buildMemoryAdapters(prisma: PrismaClient) {
  const memoryEvent = {
    createMany: ({ data }: { data: Array<Omit<any, "id">> }) =>
      prisma.memoryEvent.createMany({
        data: data.map((row) => ({
          tenantId: row.tenantId,
          workspaceId: row.workspaceId,
          agentId: row.agentId,
          runId: row.runId ?? null,
          key: row.key,
          content: row.content,
          metadata: recordToJsonInput(row.metadata) ?? Prisma.JsonNull,
          createdAt: row.createdAt,
        })),
      }),
    findMany: (args: {
      where: {
        tenantId: string;
        workspaceId: string;
        agentId: string;
        createdAt?: { gte?: Date };
      };
      orderBy?: { createdAt: "asc" | "desc" };
      take?: number;
    }) =>
      prisma.memoryEvent.findMany(args).then((rows) =>
        rows.map((row) => ({
          id: row.id,
          tenantId: row.tenantId,
          workspaceId: row.workspaceId,
          agentId: row.agentId,
          key: row.key,
          content: row.content,
          metadata: jsonValueToRecord(row.metadata),
          createdAt: row.createdAt,
        }))
      ),
  };

  const embeddingChunk = {
    upsert: (args: {
      where: {
        tenantId_workspaceId_agentId_chunkKey: {
          tenantId: string;
          workspaceId: string;
          agentId: string;
          chunkKey: string;
        };
      };
      create: {
        tenantId: string;
        workspaceId: string;
        agentId: string;
        chunkKey: string;
        embedding: number[];
        metadata: Record<string, unknown> | null;
      };
      update: {
        embedding: number[];
        metadata?: Record<string, unknown> | null;
        updatedAt?: Date;
      };
    }) =>
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
        .then((row) => ({
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
    findMany: (args: {
      where: { tenantId: string; workspaceId: string; agentId: string };
      take?: number;
      orderBy?: { updatedAt: "asc" | "desc" };
    }) =>
      prisma.embeddingChunk.findMany(args).then((rows) =>
        rows.map((row) => ({
          id: row.id,
          tenantId: row.tenantId,
          workspaceId: row.workspaceId,
          agentId: row.agentId,
          chunkKey: row.chunkKey,
          embedding: row.embedding,
          metadata: jsonValueToRecord(row.metadata),
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        }))
      ),
  };

  const memorySnapshot = {
    findUnique: (args: {
      where: {
        tenantId_workspaceId_agentId: {
          tenantId: string;
          workspaceId: string;
          agentId: string;
        };
      };
    }) =>
      prisma.memorySnapshot.findUnique(args).then((row) => {
        if (!row) return null;
        return {
          id: row.id,
          tenantId: row.tenantId,
          workspaceId: row.workspaceId,
          agentId: row.agentId,
          shortTerm: row.shortTerm ?? [],
          longTerm: row.longTerm ?? [],
          vectorState: jsonValueToRecord(row.vectorState),
          cursor: row.cursor,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        };
      }),
    upsert: (args: {
      where: {
        tenantId_workspaceId_agentId: {
          tenantId: string;
          workspaceId: string;
          agentId: string;
        };
      };
      create: {
        tenantId: string;
        workspaceId: string;
        agentId: string;
        shortTerm: unknown;
        longTerm: unknown;
        vectorState: Record<string, unknown> | null;
        cursor: string | null;
      };
      update: {
        shortTerm: unknown;
        longTerm: unknown;
        vectorState: Record<string, unknown> | null;
        cursor: string | null;
        updatedAt: Date;
      };
    }) =>
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
            cursor: args.update.cursor,
            updatedAt: args.update.updatedAt,
          },
        })
        .then((row) => ({
          id: row.id,
          tenantId: row.tenantId,
          workspaceId: row.workspaceId,
          agentId: row.agentId,
          shortTerm: row.shortTerm ?? [],
          longTerm: row.longTerm ?? [],
          vectorState: jsonValueToRecord(row.vectorState),
          cursor: row.cursor,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        })),
  };

  return { memoryEvent, embeddingChunk, memorySnapshot };
}

function resolveRedisUrl(): string {
  return (
    process.env.MEMORY_REDIS_URL ??
    process.env.RUN_QUEUE_REDIS_URL ??
    process.env.BULLMQ_REDIS_URL ??
    process.env.REDIS_URL ??
    DEFAULT_REDIS_URL
  );
}

function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis(resolveRedisUrl(), {
      lazyConnect: true,
      maxRetriesPerRequest: null,
    });

    redisClient.on("error", (error) => {
      console.error("[memory] Redis client error", error);
    });
  }

  return redisClient;
}

function getPrismaClient(): PrismaClient {
  if (!prismaClient) {
    prismaClient = new PrismaClient();
  }

  return prismaClient;
}

export function getMemoryService(): MemoryService {
  if (!memoryService) {
    const redis = getRedisClient();
    const prisma = getPrismaClient();
    const adapters = buildMemoryAdapters(prisma);

    const shortTermStore = new RedisShortTermMemoryStore(redis, {
      prefix: process.env.MEMORY_SHORT_PREFIX ?? "memory:short",
      ttlSeconds: getShortTermTtl(),
    });
    const longTermStore = new PostgresLongTermMemoryStore(adapters);
    const vectorStore = new PostgresVectorMemoryStore(adapters);

    memoryService = new MemoryService({
      shortTermStore,
      longTermStore,
      vectorStore,
    });

    snapshotStore = new PrismaMemorySnapshotStore(adapters);
  }

  return memoryService;
}

export function getMemorySnapshotStore(): MemorySnapshotStore {
  if (!snapshotStore) {
    getMemoryService();
  }
  return snapshotStore!;
}

function getShortTermTtl(): number {
  const raw = process.env.MEMORY_SHORT_TTL_SECONDS;
  if (!raw) return DEFAULT_SHORT_TTL_SECONDS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_SHORT_TTL_SECONDS;
  }
  return Math.floor(parsed);
}

export function getMemoryPrismaClient(): PrismaClient {
  return getPrismaClient();
}
