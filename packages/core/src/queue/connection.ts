import type { RedisOptions } from "ioredis";

const DEFAULT_URL = process.env.REDIS_URL ?? "redis://127.0.0.1:6379/0";
let cachedConnection: RedisOptions | null = null;

function parseRedisUrl(url: string): RedisOptions {
  const fallback: RedisOptions = { host: "127.0.0.1", port: 6379, db: 0 };

  try {
    const parsed = new URL(url);
    const isTls = parsed.protocol === "rediss:";
    const connection: RedisOptions = {
      host: parsed.hostname || fallback.host,
      port: parsed.port ? Number(parsed.port) : fallback.port,
      connectionName: "run-ativo-universal",
    };

    if (parsed.password) connection.password = parsed.password;
    if (parsed.username) connection.username = parsed.username;
    if (parsed.pathname && parsed.pathname !== "/") {
      const dbParsed = Number(parsed.pathname.replace("/", ""));
      if (!Number.isNaN(dbParsed)) connection.db = dbParsed;
    }
    if (isTls) connection.tls = {};
    return connection;
  } catch {
    return fallback;
  }
}

function resolveRedisUrl() {
  return (
    process.env.RUN_ATIVO_UNIVERSAL_REDIS_URL ??
    process.env.ACTION_QUEUE_REDIS_URL ??
    process.env.RUN_QUEUE_REDIS_URL ??
    process.env.BULLMQ_REDIS_URL ??
    process.env.QUEUE_REDIS_URL ??
    DEFAULT_URL
  );
}

export function getRedisConnection(): RedisOptions {
  if (!cachedConnection) {
    const url = resolveRedisUrl();
    cachedConnection = parseRedisUrl(url);
  }
  return cachedConnection;
}

// 👇 compatibilidade com workers existentes
export const connection = getRedisConnection();
