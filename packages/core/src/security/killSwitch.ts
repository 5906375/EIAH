import Redis from "ioredis";
import { requireRedisUrl } from "../config/redis";

let redisClient: Redis | null = null;

export type TenantCapabilityFlagScope = {
  capabilityId: string;
  tenantId: string;
  workspaceId: string;
};

export type TenantCapabilityFlagBackend = {
  get(key: string): Promise<string | null>;
};

export type TenantCapabilityFlagResolution = {
  enabled: boolean;
  source: "explicit" | "default" | "backend_error";
};

function getRedis(): Redis {
  if (!redisClient) {
    const url = requireRedisUrl(
      process.env.KILL_SWITCH_REDIS_URL ??
        process.env.REDIS_URL ??
        process.env.ACTION_QUEUE_REDIS_URL,
      "killSwitch:getRedis"
    );
    redisClient = new Redis(url, {
      enableOfflineQueue: false,
      lazyConnect: true,
      maxRetriesPerRequest: 2,
    });
    // Callers receive the failure through the awaited command/connect promise.
    redisClient.on("error", () => undefined);
  }
  return redisClient;
}

async function getReadyRedis(): Promise<Redis> {
  const redis = getRedis();
  if (redis.status === "ready") return redis;
  if (redis.status === "wait" || redis.status === "end") {
    await redis.connect();
    return redis;
  }
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("kill switch Redis readiness timed out"));
    }, 1_000);
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      clearTimeout(timeout);
      redis.off("ready", onReady);
      redis.off("error", onError);
    };
    redis.once("ready", onReady);
    redis.once("error", onError);
  });
  return redis;
}

const redisTenantCapabilityFlagBackend: TenantCapabilityFlagBackend = {
  async get(key) {
    return (await getReadyRedis()).get(key);
  },
};

function encodeKeyPart(value: string): string {
  return encodeURIComponent(value.trim());
}

export function keyForTenantCapabilityFlag(scope: TenantCapabilityFlagScope): string {
  return [
    "killswitch",
    "capability",
    encodeKeyPart(scope.capabilityId),
    encodeKeyPart(scope.tenantId),
    encodeKeyPart(scope.workspaceId),
  ].join(":");
}

/**
 * Resolves an allow flag for one tenant/workspace capability.
 * Missing, invalid and unavailable state is deliberately fail-closed.
 */
export async function resolveTenantCapabilityFlag(
  scope: TenantCapabilityFlagScope,
  backend: TenantCapabilityFlagBackend = redisTenantCapabilityFlagBackend,
): Promise<TenantCapabilityFlagResolution> {
  try {
    const value = await backend.get(keyForTenantCapabilityFlag(scope));
    if (value === "enabled") return { enabled: true, source: "explicit" };
    if (value === "disabled") return { enabled: false, source: "explicit" };
    return { enabled: false, source: "default" };
  } catch {
    return { enabled: false, source: "backend_error" };
  }
}

export async function setTenantCapabilityFlag(params: TenantCapabilityFlagScope & {
  enabled: boolean;
  ttlMs?: number;
}): Promise<void> {
  const redis = await getReadyRedis();
  const key = keyForTenantCapabilityFlag(params);
  const value = params.enabled ? "enabled" : "disabled";
  if (params.ttlMs !== undefined) {
    await redis.set(key, value, "PX", params.ttlMs);
    return;
  }
  await redis.set(key, value);
}

export async function clearTenantCapabilityFlag(scope: TenantCapabilityFlagScope): Promise<void> {
  await (await getReadyRedis()).del(keyForTenantCapabilityFlag(scope));
}

export async function closeCriticalKillSwitchRedis(): Promise<void> {
  if (!redisClient) {
    return;
  }
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

type KillSwitchScope = "global" | "tenant";

function keyForCritical(scope: KillSwitchScope, tenantId?: string): string {
  if (scope === "global") return "killswitch:critical:global";
  return `killswitch:critical:${tenantId ?? "unknown"}`;
}

export type EnableCriticalKillSwitchParams = {
  scope?: KillSwitchScope;
  tenantId?: string;
  reason?: string;
  ttlMs?: number;
};

export async function enableCriticalKillSwitch(params: EnableCriticalKillSwitchParams): Promise<void> {
  const scope = params.scope ?? "tenant";
  const ttlMs = params.ttlMs ?? 15 * 60 * 1000;
  const key = keyForCritical(scope, params.tenantId);
  const payload = JSON.stringify({
    scope,
    tenantId: params.tenantId ?? null,
    reason: params.reason ?? null,
    activatedAt: new Date().toISOString(),
    ttlMs,
  });
  const redis = await getReadyRedis();
  await redis.set(key, payload, "PX", ttlMs);
}

export async function isCriticalKillSwitchEnabled(tenantId: string): Promise<boolean> {
  const redis = await getReadyRedis();
  const globalKey = keyForCritical("global");
  const tenantKey = keyForCritical("tenant", tenantId);
  const [globalState, tenantState] = await redis.mget(globalKey, tenantKey);
  return Boolean(globalState || tenantState);
}

export async function disableCriticalKillSwitch(tenantId: string): Promise<void> {
  const redis = await getReadyRedis();
  const globalKey = keyForCritical("global");
  const tenantKey = keyForCritical("tenant", tenantId);
  await redis.del(globalKey, tenantKey);
}
