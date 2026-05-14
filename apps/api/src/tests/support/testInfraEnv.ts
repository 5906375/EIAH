import process from "node:process";

const DEFAULT_DATABASE_URL = "postgresql://postgres:senha@127.0.0.1:5433/eiah_builder?schema=public";
const DEFAULT_SHADOW_DATABASE_URL = "postgresql://postgres:senha@127.0.0.1:5433/eiah_builder_shadow?schema=public";
const DEFAULT_REDIS_URL = "redis://127.0.0.1:6379/0";

function shouldRewriteDockerHostname(raw: string | null | undefined, hostnames: string[]) {
  if (typeof raw !== "string" || raw.trim().length === 0) return true;
  return hostnames.some((hostname) => raw.includes(hostname));
}

function normalizePostgresUrl(
  raw: string | null | undefined,
  fallback: string,
  targetPort: string,
) {
  const source = typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : fallback;
  try {
    const url = new URL(source);
    url.hostname = "127.0.0.1";
    url.port = targetPort;
    return url.toString();
  } catch {
    return fallback;
  }
}

function normalizeRedisUrl(raw: string | null | undefined, fallback: string) {
  const source = typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : fallback;
  try {
    const url = new URL(source);
    url.hostname = "127.0.0.1";
    if (!url.port) url.port = "6379";
    return url.toString();
  } catch {
    return fallback;
  }
}

export function ensureLocalTestInfraEnv() {
  const preferredDatabaseUrl = process.env.VITEST_DATABASE_URL ?? DEFAULT_DATABASE_URL;
  const preferredShadowDatabaseUrl = process.env.VITEST_SHADOW_DATABASE_URL ?? DEFAULT_SHADOW_DATABASE_URL;
  const preferredRedisUrl = process.env.VITEST_REDIS_URL ?? DEFAULT_REDIS_URL;

  if (shouldRewriteDockerHostname(process.env.DATABASE_URL, ["eiah-postgres"])) {
    process.env.DATABASE_URL = normalizePostgresUrl(process.env.DATABASE_URL, preferredDatabaseUrl, "5433");
  }

  if (shouldRewriteDockerHostname(process.env.SHADOW_DATABASE_URL, ["eiah-postgres"])) {
    process.env.SHADOW_DATABASE_URL = normalizePostgresUrl(
      process.env.SHADOW_DATABASE_URL,
      preferredShadowDatabaseUrl,
      "5433",
    );
  }

  const redisEnvKeys = [
    "REDIS_URL",
    "RUN_EVENTS_REDIS_URL",
    "RUN_QUEUE_REDIS_URL",
    "ACTION_QUEUE_REDIS_URL",
    "QUEUE_REDIS_URL",
    "BULLMQ_REDIS_URL",
    "MEMORY_REDIS_URL",
    "MAINTENANCE_QUEUE_REDIS_URL",
  ] as const;

  for (const key of redisEnvKeys) {
    if (shouldRewriteDockerHostname(process.env[key], ["eiah-redis"])) {
      process.env[key] = normalizeRedisUrl(process.env[key], preferredRedisUrl);
    }
  }

  process.env.REDIS_HOST ??= "127.0.0.1";
}

ensureLocalTestInfraEnv();
