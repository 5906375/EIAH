import Redis from "ioredis";

const DEFAULT_REDIS_URL = "redis://127.0.0.1:6379/0";

const redisUrl =
  process.env.KILL_SWITCH_REDIS_URL ??
  process.env.REDIS_URL ??
  process.env.ACTION_QUEUE_REDIS_URL ??
  DEFAULT_REDIS_URL;

let redisClient: Redis | null = null;

function getRedis() {
  if (!redisClient) {
    redisClient = new Redis(redisUrl, { enableOfflineQueue: false, maxRetriesPerRequest: 2 });
  }
  return redisClient;
}

function keyForCritical(scope: "tenant" | "global", tenantId?: string) {
  if (scope === "global") return "killswitch:critical:global";
  return `killswitch:critical:${tenantId ?? "unknown"}`;
}

export async function enableCriticalKillSwitch(params: {
  tenantId?: string;
  scope?: "tenant" | "global";
  ttlMs?: number;
  reason?: string;
}) {
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

export async function isCriticalKillSwitchEnabled(tenantId?: string) {
  const redis = getRedis();
  const globalKey = keyForCritical("global");
  const tenantKey = keyForCritical("tenant", tenantId);

  const [globalState, tenantState] = await redis.mget(globalKey, tenantKey);
  return Boolean(globalState || tenantState);
}

export async function disableCriticalKillSwitch(tenantId?: string) {
  const redis = getRedis();
  const globalKey = keyForCritical("global");
  const tenantKey = keyForCritical("tenant", tenantId);
  await redis.del(globalKey, tenantKey);
}
