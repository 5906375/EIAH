import type { ConnectionOptions } from "bullmq";
import { requireRedisUrl } from "../config/redis";

let cachedConnection: ConnectionOptions | null = null;
type LazyConnectionField =
  | "host"
  | "port"
  | "username"
  | "password"
  | "db"
  | "tls"
  | "connectionName";

function parseRedisUrl(url: string): ConnectionOptions {
  try {
    const parsed = new URL(url);
    const isTls = parsed.protocol === "rediss:";
    const connection: ConnectionOptions = {
      host: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : 6379,
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
    throw new Error(`connection:parseRedisUrl: invalid Redis URL "${url}"`);
  }
}

function resolveRedisUrl(): string {
  return requireRedisUrl(
    process.env.RUN_ATIVO_UNIVERSAL_REDIS_URL ??
      process.env.ACTION_QUEUE_REDIS_URL ??
      process.env.RUN_QUEUE_REDIS_URL ??
      process.env.BULLMQ_REDIS_URL ??
      process.env.QUEUE_REDIS_URL ??
      process.env.REDIS_URL,
    "connection:resolveRedisUrl"
  );
}

export function getRedisConnection(): ConnectionOptions {
  if (!cachedConnection) {
    const url = resolveRedisUrl();
    cachedConnection = parseRedisUrl(url);
  }
  return cachedConnection;
}

function defineLazyConnectionProperty(
  target: Record<string, unknown>,
  key: LazyConnectionField,
) {
  Object.defineProperty(target, key, {
    enumerable: true,
    configurable: false,
    get() {
      return (getRedisConnection() as Record<string, unknown>)[key];
    },
  });
}

function createLazyConnectionOptions(): ConnectionOptions {
  const lazyConnection = {} as Record<string, unknown>;

  for (const key of [
    "host",
    "port",
    "username",
    "password",
    "db",
    "tls",
    "connectionName",
  ] as const satisfies readonly LazyConnectionField[]) {
    defineLazyConnectionProperty(lazyConnection, key);
  }

  return lazyConnection as ConnectionOptions;
}

// Compatibilidade com workers existentes sem side effect de import.
export const connection = createLazyConnectionOptions();
