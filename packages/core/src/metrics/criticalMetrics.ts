import Redis from "ioredis";
import { getRedisConnection } from "../queue/connection";
import { maskPII } from "../../../utils/src/masking";

const redisConnection = getRedisConnection();
let redisClient: Redis | null = null;

function getRedis() {
  if (!redisClient) {
    redisClient = new Redis({
      host: redisConnection.host as string | undefined,
      port: typeof redisConnection.port === "number" ? redisConnection.port : undefined,
      username: redisConnection.username as string | undefined,
      password: redisConnection.password as string | undefined,
      db: typeof redisConnection.db === "number" ? redisConnection.db : undefined,
      tls: redisConnection.tls ?? undefined,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 2,
    });
  }
  return redisClient;
}

function buildKey(
  metricType: "counter" | "gauge",
  metricName: string,
  labels?: Record<string, string>
) {
  const parts = ["metrics", "critical", metricType, metricName];
  if (labels) {
    for (const [key, value] of Object.entries(labels)) {
      parts.push(key, value);
    }
  }
  return parts.join(":");
}

function safeStringify(payload: unknown) {
  try {
    return JSON.stringify(payload ?? null);
  } catch {
    return JSON.stringify({ error: "unserializable" });
  }
}

export async function incrCriticalCounter(
  metricName: string,
  labels?: Record<string, string>,
  value = 1
) {
  try {
    const key = buildKey("counter", metricName, labels);
    const redis = getRedis();
    if (value === 1) {
      await redis.incr(key);
    } else {
      await redis.incrby(key, value);
    }
  } catch {
    // best-effort metrics
  }
}

export async function addCriticalLatency(
  metricBase: string,
  durationMs: number,
  labels?: Record<string, string>
) {
  const sumKey = buildKey("counter", `${metricBase}_ms_sum`, labels);
  const countKey = buildKey("counter", `${metricBase}_ms_count`, labels);
  try {
    const redis = getRedis();
    await redis.incrby(sumKey, Math.max(0, Math.round(durationMs)));
    await redis.incr(countKey);
  } catch {
    // best-effort metrics
  }
}

export async function recordCriticalLatencySample(
  metricName: string,
  durationMs: number,
  options?: { maxSamples?: number }
) {
  try {
    const redis = getRedis();
    const key = `metrics:critical:latency_samples:${metricName}`;
    const maxSamples = Math.max(10, options?.maxSamples ?? 2048);
    await redis.lpush(key, Math.max(0, Math.round(durationMs)).toString());
    await redis.ltrim(key, 0, maxSamples - 1);
    await redis.expire(key, 60 * 60 * 24 * 7);
  } catch {
    // best-effort metrics
  }
}

export async function getCriticalLatencyPercentiles(
  metricName: string,
  percentiles: number[]
) {
  try {
    const redis = getRedis();
    const key = `metrics:critical:latency_samples:${metricName}`;
    const raw = await redis.lrange(key, 0, -1);
    const values = raw
      .map((item) => Number(item))
      .filter((item) => Number.isFinite(item))
      .sort((a, b) => a - b);

    const result: Record<string, number | null> = {};
    for (const p of percentiles) {
      const normalized = Number.isFinite(p) ? Math.min(1, Math.max(0, p)) : 0;
      const label = `p${Math.round(normalized * 100)}`;
      if (values.length === 0) {
        result[label] = null;
        continue;
      }
      const rank = Math.max(0, Math.ceil(normalized * values.length) - 1);
      result[label] = values[Math.min(rank, values.length - 1)];
    }
    return result;
  } catch {
    const result: Record<string, number | null> = {};
    for (const p of percentiles) {
      const normalized = Number.isFinite(p) ? Math.min(1, Math.max(0, p)) : 0;
      result[`p${Math.round(normalized * 100)}`] = null;
    }
    return result;
  }
}

export async function setCriticalGauge(
  metricName: string,
  value: number,
  labels?: Record<string, string>
) {
  try {
    const key = buildKey("gauge", metricName, labels);
    const redis = getRedis();
    await redis.set(key, Number.isFinite(value) ? String(value) : "0");
  } catch {
    // best-effort metrics
  }
}

export async function recordCriticalSample(params: {
  kind: "invalid_schema" | "signer_fail";
  runId: string;
  payload: unknown;
  ttlSeconds?: number;
}) {
  try {
    const redis = getRedis();
    const ttl = params.ttlSeconds ?? 60 * 60 * 24 * 7;
    const raw = safeStringify(params.payload);
    const masked = maskPII(raw);
    const key = `metrics:critical:sample:${params.kind}:${params.runId}`;
    await redis.setex(key, ttl, masked);
  } catch {
    // best-effort metrics
  }
}
