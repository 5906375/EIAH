import crypto from "node:crypto";
import Redis from "ioredis";
import { getRedisConnection } from "../queue/connection";

const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 7;

function getRedis() {
  const connection = getRedisConnection();
  return new Redis({
    host: connection.host as string | undefined,
    port: typeof connection.port === "number" ? connection.port : undefined,
    username: connection.username as string | undefined,
    password: connection.password as string | undefined,
    db: typeof connection.db === "number" ? connection.db : undefined,
    tls: connection.tls ?? undefined,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 2,
  });
}

export function buildCanonicalRef(canonical: string) {
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

export async function storeCanonicalBundle(params: {
  canonical: string;
  ttlSeconds?: number;
}) {
  const enabled = (process.env.POU_CANONICAL_BUNDLE_ENABLED ?? "false").toLowerCase();
  if (enabled !== "1" && enabled !== "true" && enabled !== "on") {
    return null;
  }

  const ttl = params.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const ref = buildCanonicalRef(params.canonical);
  const key = `pou:canonical:${ref}`;
  const redis = getRedis();
  try {
    await redis.setex(key, ttl, params.canonical);
  } finally {
    await redis.quit().catch(() => undefined);
  }
  return ref;
}

export async function loadCanonicalBundle(ref: string) {
  const key = `pou:canonical:${ref}`;
  const redis = getRedis();
  try {
    return await redis.get(key);
  } finally {
    await redis.quit().catch(() => undefined);
  }
}

