/* eslint-env node */
/**********************************************************************************************
 * EIAH BUILDER - MEMORY SERVICE (Multi-Tenant Tenant-Aware Version)
 *
 * 🔐 Atualizações:
 * - Usa `prismaGlobal` como client padrão
 * - Todas as queries passam automaticamente pelo middleware `tenantGuard`
 * - Redis e PostgreSQL operam em isolamento por tenant/workspace
 * - Mantém compatibilidade com MemoryService, PrismaMemorySnapshotStore e stores vetoriais
 **********************************************************************************************/

/* eslint-env node */

import Redis from "ioredis";
import { requireRedisUrl } from "@eiah/core";
import { Prisma, PrismaClient, prismaGlobal } from "@repo/db";
import {
  MemoryService,
  PostgresLongTermMemoryStore,
  PostgresVectorMemoryStore,
  PrismaMemorySnapshotStore,
  RedisShortTermMemoryStore,
  type MemorySnapshotStore,
} from "@eiah/core";

type MemorySnapshot = Record<string, unknown>;
type MemoryEvent = Record<string, unknown>;
type EmbeddingChunk = Record<string, unknown>;

type TenantPrismaClient = PrismaClient;



const DEFAULT_SHORT_TTL_SECONDS = 60 * 60 * 24;

let redisClient: Redis | null = null;

/************************************************************************************************
 * 🧠 Utilitários JSON ⇄ Prisma
 ************************************************************************************************/

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

/************************************************************************************************
 * 🧩 Builder de adaptadores Prisma-aware
 * - Todas as chamadas usam prismaGlobal (tenantId/workspaceId seguem no payload)
 * - Todas as operações respeitam tenantGuard
 ************************************************************************************************/
function buildMemoryAdapters(
  tenantId: string,
  workspaceId: string,
  client?: TenantPrismaClient
) {
  const prisma = client ?? prismaGlobal;

  const memoryEvent = {
    createMany: async ({ data }: { data: Array<Omit<any, "id">> }) =>
      prisma.memoryEvent.createMany({
        data: data.map((row) => ({
          tenantId,
          workspaceId,
          agentId: row.agentId,
          runId: row.runId ?? null,
          key: row.key,
          content: row.content,
          metadata: recordToJsonInput(row.metadata) ?? Prisma.JsonNull,
          createdAt: row.createdAt,
        })),
      }),

    findMany: async (args: {
      where: {
        tenantId: string;
        workspaceId: string;
        agentId: string;
        createdAt?: { gte?: Date };
      };
      orderBy?: { createdAt: "asc" | "desc" };
      take?: number;
    }) =>
      prisma.memoryEvent.findMany(args as any).then((rows: any[]) =>
        rows.map((row) => ({
          id: String(row.id),
          tenantId: String(row.tenantId),
          workspaceId: String(row.workspaceId),
          agentId: String(row.agentId),
          key: String(row.key),
          content: String(row.content),
          metadata: jsonValueToRecord(row.metadata as Prisma.JsonValue),
          createdAt: row.createdAt as Date,
        }))
      ),
  };

  const embeddingChunk = {
    upsert: async (args: {
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
      (prisma.embeddingChunk as any)
        .upsert({
          where: args.where,
          create: {
            tenantId,
            workspaceId,
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
        .then((row: any) => ({
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

    findMany: async (args: {
      where: { tenantId: string; workspaceId: string; agentId: string };
      take?: number;
      orderBy?: { updatedAt: "asc" | "desc" };
    }) =>
      prisma.embeddingChunk.findMany(args as any).then((rows: any[]) =>
        rows.map((row) => ({
          id: String(row.id),
          tenantId: String(row.tenantId),
          workspaceId: String(row.workspaceId),
          agentId: String(row.agentId),
          chunkKey: String(row.chunkKey),
          embedding: row.embedding as number[],
          metadata: jsonValueToRecord(row.metadata as Prisma.JsonValue),
          createdAt: row.createdAt as Date,
          updatedAt: row.updatedAt as Date,
        }))
      ),
  };

  const memorySnapshot = {
    findUnique: async (args: {
      where: {
        tenantId_workspaceId_agentId: {
          tenantId: string;
          workspaceId: string;
          agentId: string;
        };
      };
    }) =>
      prisma.memorySnapshot.findUnique(args as any).then((row: any | null) => {
        if (!row) return null;
        return {
          id: String(row.id),
          tenantId: String(row.tenantId),
          workspaceId: String(row.workspaceId),
          agentId: String(row.agentId),
          shortTerm: row.shortTerm ?? [],
          longTerm: row.longTerm ?? [],
          vectorState: jsonValueToRecord(row.vectorState as Prisma.JsonValue),
          cursor: row.cursor as string | null,
          createdAt: row.createdAt as Date,
          updatedAt: row.updatedAt as Date,
        };
      }),

    upsert: async (args: {
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
            tenantId,
            workspaceId,
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

/************************************************************************************************
 * 🔄 Redis Client
 ************************************************************************************************/
function resolveRedisUrl(): string {
  return requireRedisUrl(
    process.env.MEMORY_REDIS_URL ??
      process.env.RUN_QUEUE_REDIS_URL ??
      process.env.BULLMQ_REDIS_URL ??
      process.env.REDIS_URL,
    "memory:resolveRedisUrl"
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

export async function closeMemoryResources() {
  if (!redisClient) return;
  const current = redisClient;
  redisClient = null;
  try {
    await current.quit();
  } catch {
    current.disconnect();
    return;
  }
  current.disconnect();
}

/************************************************************************************************
 * 🧩 Instância de serviço de memória multi-tenant
 ************************************************************************************************/
export function getMemoryService(
  tenantId: string,
  workspaceId: string,
  client?: TenantPrismaClient
): MemoryService {
  const redis = getRedisClient();
  const adapters = buildMemoryAdapters(tenantId, workspaceId, client);

  const shortTermStore = new RedisShortTermMemoryStore(redis, {
    prefix: `memory:${tenantId}:${workspaceId}`,
    ttlSeconds: getShortTermTtl(),
  });

  const longTermStore = new PostgresLongTermMemoryStore(adapters as any);
  const vectorStore = new PostgresVectorMemoryStore(adapters as any);

  return new MemoryService({
    shortTermStore,
    longTermStore,
    vectorStore,
  });
}

/************************************************************************************************
 * 📸 Snapshot store isolado por tenant/workspace
 ************************************************************************************************/
export function getMemorySnapshotStore(
  tenantId: string,
  workspaceId: string,
  client?: TenantPrismaClient
): MemorySnapshotStore {
  const adapters = buildMemoryAdapters(tenantId, workspaceId, client);
  return new PrismaMemorySnapshotStore(adapters as any);
}

/************************************************************************************************
 * 🧮 TTL Helper
 ************************************************************************************************/
function getShortTermTtl(): number {
  const raw = process.env.MEMORY_SHORT_TTL_SECONDS;
  if (!raw) return DEFAULT_SHORT_TTL_SECONDS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_SHORT_TTL_SECONDS;
  }
  return Math.floor(parsed);
}

/************************************************************************************************
 * 🧱 Interface compatível com APIs antigas (mantida opcionalmente)
 ************************************************************************************************/
export function getMemoryPrismaClient(
  tenantId: string,
  workspaceId: string
): TenantPrismaClient {
  return prismaGlobal;
}
