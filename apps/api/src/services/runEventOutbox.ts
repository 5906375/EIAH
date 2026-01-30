import Redis from "ioredis";

const redisUrl = process.env.RUN_EVENTS_REDIS_URL || process.env.REDIS_URL;
const outboxStreamKey = process.env.RUN_EVENTS_OUTBOX_STREAM ?? "run-events-outbox";
const outboxGroup = process.env.RUN_EVENTS_OUTBOX_GROUP ?? "run-events-group";
const outboxConsumer =
  process.env.RUN_EVENTS_OUTBOX_CONSUMER ?? `api-${process.pid}`;

function shouldUseOutbox() {
  const raw = (process.env.RUN_EVENTS_USE_OUTBOX ?? "false").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "on";
}

function createRedisClient() {
  if (!redisUrl) return null;
  return new Redis(redisUrl, { enableOfflineQueue: false, maxRetriesPerRequest: 2 });
}

function getRetryConfig() {
  const attemptsRaw = process.env.RUN_EVENTS_OUTBOX_RETRY_ATTEMPTS;
  const delayRaw = process.env.RUN_EVENTS_OUTBOX_RETRY_DELAY_MS;
  const attempts = attemptsRaw ? Number(attemptsRaw) : 10;
  const delayMs = delayRaw ? Number(delayRaw) : 500;
  return {
    attempts: Number.isFinite(attempts) && attempts > 0 ? Math.floor(attempts) : 10,
    delayMs: Number.isFinite(delayMs) && delayMs > 0 ? Math.floor(delayMs) : 500,
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForRedisReady(redis: Redis) {
  const { attempts, delayMs } = getRetryConfig();
  let lastError: unknown;

  for (let i = 0; i < attempts; i += 1) {
    try {
      if (redis.status === "ready") return;
      await redis.ping();
      return;
    } catch (err) {
      lastError = err;
      await sleep(delayMs);
    }
  }

  throw lastError ?? new Error("Redis not ready");
}

async function ensureGroup(redis: Redis) {
  try {
    await redis.xgroup("CREATE", outboxStreamKey, outboxGroup, "0", "MKSTREAM");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes("BUSYGROUP")) {
      throw err;
    }
  }
}

async function ensureGroupWithRetry(redis: Redis) {
  const { attempts, delayMs } = getRetryConfig();
  let lastError: unknown;

  for (let i = 0; i < attempts; i += 1) {
    try {
      await ensureGroup(redis);
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("BUSYGROUP")) return;
      lastError = err;
      await sleep(delayMs);
    }
  }

  throw lastError ?? new Error("Failed to create outbox group");
}

type OutboxEvent = {
  id: string;
  runId: string;
  tenantId: string;
  workspaceId: string;
};

export async function startRunEventOutboxProcessor() {
  if (!shouldUseOutbox()) return;
  if (!redisUrl) return;

  const redis = createRedisClient();
  if (!redis) return;

  await waitForRedisReady(redis);
  await ensureGroupWithRetry(redis);

  const poll = async () => {
    try {
      const response = await redis.xreadgroup(
        "GROUP",
        outboxGroup,
        outboxConsumer,
        "COUNT",
        50,
        "BLOCK",
        1000,
        "STREAMS",
        outboxStreamKey,
        ">"
      );

      if (!response) return;

      for (const [, entries] of response) {
        for (const [entryId, fields] of entries as Array<[string, string[]]>) {
          const payloadIndex = fields.findIndex((value) => value === "event");
          const payloadValue = payloadIndex >= 0 ? fields[payloadIndex + 1] : null;
          if (!payloadValue) {
            await redis.xack(outboxStreamKey, outboxGroup, entryId);
            continue;
          }

          let event: OutboxEvent | null = null;
          try {
            event = JSON.parse(payloadValue) as OutboxEvent;
          } catch {
            event = null;
          }

          if (event) {
            const channel = `run-events:${event.tenantId}:${event.workspaceId}:${event.runId}`;
            await redis.publish(channel, payloadValue);
          }

          await redis.xack(outboxStreamKey, outboxGroup, entryId);
        }
      }
    } catch {
      // best-effort
    }
  };

  setInterval(poll, 1000);
}
