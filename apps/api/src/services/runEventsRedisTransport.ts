type RunEventsRedisRetryConfig = {
  attempts: number;
  delayMs: number;
};

type RedisReadyClient = {
  status: string;
  connect(): Promise<unknown>;
  ping(): Promise<unknown>;
};

export function getRunEventsRedisRetryConfig(): RunEventsRedisRetryConfig {
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

async function connectRedisIfNeeded(redis: RedisReadyClient) {
  if (redis.status === "wait" || redis.status === "end") {
    await redis.connect();
  }
}

export async function waitForRedisReady(
  redis: RedisReadyClient,
  config = getRunEventsRedisRetryConfig(),
  sleepFn: (ms: number) => Promise<unknown> = sleep
) {
  let lastError: unknown;

  for (let i = 0; i < config.attempts; i += 1) {
    try {
      if (redis.status === "ready") return;
      await connectRedisIfNeeded(redis);
      if (redis.status === "ready") return;
      await redis.ping();
      return;
    } catch (err) {
      lastError = err;
      await sleepFn(config.delayMs);
    }
  }

  throw lastError ?? new Error("Redis not ready");
}
