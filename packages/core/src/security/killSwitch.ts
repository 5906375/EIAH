import Redis from "ioredis";
import { requireRedisUrl } from "../config/redis";

let redisClient: Redis | null = null;

function getRedis(): Redis {
  if (!redisClient) {
    const url = requireRedisUrl(
      process.env.KILL_SWITCH_REDIS_URL ??
        process.env.REDIS_URL ??
        process.env.ACTION_QUEUE_REDIS_URL,
      "killSwitch:getRedis"
    );
    redisClient = new Redis(url, { enableOfflineQueue: false, maxRetriesPerRequest: 2 });
  }
  return redisClient;
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
  const redis = getRedis();
  await redis.set(key, payload, "PX", ttlMs);
}

export async function isCriticalKillSwitchEnabled(tenantId: string): Promise<boolean> {
  const redis = getRedis();
  const globalKey = keyForCritical("global");
  const tenantKey = keyForCritical("tenant", tenantId);
  const [globalState, tenantState] = await redis.mget(globalKey, tenantKey);
  return Boolean(globalState || tenantState);
}

export async function disableCriticalKillSwitch(tenantId: string): Promise<void> {
  const redis = getRedis();
  const globalKey = keyForCritical("global");
  const tenantKey = keyForCritical("tenant", tenantId);
  await redis.del(globalKey, tenantKey);
}
