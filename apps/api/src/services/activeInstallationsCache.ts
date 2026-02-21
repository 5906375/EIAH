import Redis from "ioredis";
import type { PrismaClient } from "@repo/db/client";

export type ActiveInstallationHint = {
  agentId: string;
  status: "ACTIVE";
  version: string;
  policyRef: string | null;
};

type LoggerLike = {
  debug?: (obj: Record<string, unknown>, msg?: string) => void;
  warn?: (obj: Record<string, unknown>, msg?: string) => void;
};

const DEFAULT_TTL_SECONDS = 45;
const CACHE_KEY_PREFIX = "ctx:active_installations";

let redisClient: Redis | null | undefined;

function cacheTtlSeconds() {
  const raw = Number(process.env.ACTIVE_INSTALLATIONS_CACHE_TTL_SECONDS ?? DEFAULT_TTL_SECONDS);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_TTL_SECONDS;
  return Math.floor(raw);
}

function resolveRedisUrl() {
  return process.env.RUN_EVENTS_REDIS_URL || process.env.REDIS_URL || null;
}

function getRedisClient() {
  if (redisClient !== undefined) return redisClient;
  const redisUrl = resolveRedisUrl();
  if (!redisUrl) {
    redisClient = null;
    return redisClient;
  }
  const client = new Redis(redisUrl, {
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
  });
  client.on("error", () => {
    // Silenced to avoid noisy logs on transient DNS/network failures.
  });
  redisClient = client;
  return redisClient;
}

function cacheKey(tenantId: string, workspaceId: string) {
  return `${CACHE_KEY_PREFIX}:${tenantId}:${workspaceId}`;
}

function extractPolicyRef(config: unknown): string | null {
  if (!config || typeof config !== "object" || Array.isArray(config)) return null;
  const value = (config as Record<string, unknown>).policyRef;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

async function queryActiveInstallations(
  prisma: PrismaClient,
  tenantId: string,
  workspaceId: string
): Promise<ActiveInstallationHint[]> {
  const rows = await prisma.agentInstall.findMany({
    where: {
      tenantId,
      workspaceId,
      status: "ACTIVE",
    },
    orderBy: { updatedAt: "desc" },
    select: {
      agentId: true,
      status: true,
      version: true,
      config: true,
    },
  });
  return rows.map((row) => ({
    agentId: row.agentId,
    status: "ACTIVE" as const,
    version: row.version,
    policyRef: extractPolicyRef(row.config),
  }));
}

export async function getActiveInstallationsHint(params: {
  prisma: PrismaClient;
  tenantId: string;
  workspaceId: string;
  logger?: LoggerLike;
}): Promise<ActiveInstallationHint[]> {
  const key = cacheKey(params.tenantId, params.workspaceId);
  const redis = getRedisClient();
  if (redis) {
    try {
      const cached = await redis.get(key);
      if (cached) {
        const parsed = JSON.parse(cached) as ActiveInstallationHint[];
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (error) {
      params.logger?.warn?.({ error, key }, "active_installations.cache_read_failed");
    }
  }

  const fresh = await queryActiveInstallations(params.prisma, params.tenantId, params.workspaceId);

  if (redis) {
    try {
      await redis.set(key, JSON.stringify(fresh), "EX", cacheTtlSeconds());
    } catch (error) {
      params.logger?.warn?.({ error, key }, "active_installations.cache_write_failed");
    }
  }
  return fresh;
}

export async function invalidateActiveInstallationsHint(params: {
  tenantId: string;
  workspaceId: string;
  logger?: LoggerLike;
}): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;
  const key = cacheKey(params.tenantId, params.workspaceId);
  try {
    await redis.del(key);
  } catch (error) {
    params.logger?.warn?.({ error, key }, "active_installations.cache_invalidate_failed");
  }
}

