import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { ConnectionPolicyError } from "../config/redis";

type ConnectionModule = typeof import("./connection");
type CoreBarrelModule = typeof import("../index");

const REDIS_ENV_KEYS = [
  "RUN_ATIVO_UNIVERSAL_REDIS_URL",
  "ACTION_QUEUE_REDIS_URL",
  "RUN_QUEUE_REDIS_URL",
  "BULLMQ_REDIS_URL",
  "QUEUE_REDIS_URL",
  "REDIS_URL",
] as const;

const ORIGINAL_ENV = new Map<string, string | undefined>(
  REDIS_ENV_KEYS.map((key) => [key, process.env[key]])
);

let importCounter = 0;

async function importFreshConnectionModule(): Promise<ConnectionModule> {
  const url = new URL("./connection.ts", import.meta.url);
  return import(`${url.href}?case=${importCounter++}`) as Promise<ConnectionModule>;
}

async function importFreshCoreBarrel(): Promise<CoreBarrelModule> {
  const url = new URL("../index.ts", import.meta.url);
  return import(`${url.href}?case=${importCounter++}`) as Promise<CoreBarrelModule>;
}

function clearRedisEnv() {
  for (const key of REDIS_ENV_KEYS) {
    delete process.env[key];
  }
}

function restoreRedisEnv() {
  for (const key of REDIS_ENV_KEYS) {
    const original = ORIGINAL_ENV.get(key);
    if (typeof original === "string") {
      process.env[key] = original;
    } else {
      delete process.env[key];
    }
  }
}

afterEach(() => {
  restoreRedisEnv();
});

test("importing the queue connection module without Redis env does not throw", async () => {
  clearRedisEnv();

  const connectionModule = await importFreshConnectionModule();

  assert.equal(typeof connectionModule.getRedisConnection, "function");
});

test("importing the core barrel without Redis env does not throw after lazy queue connection", async () => {
  clearRedisEnv();

  const coreBarrel = await importFreshCoreBarrel();

  assert.equal(typeof coreBarrel.getRedisConnection, "function");
  assert.equal(typeof coreBarrel.connection, "object");
});

test("using getRedisConnection without Redis env fails closed", async () => {
  clearRedisEnv();

  const connectionModule = await importFreshConnectionModule();

  assert.throws(
    () => connectionModule.getRedisConnection(),
    (error) => {
      assert.equal(error instanceof ConnectionPolicyError, true);
      assert.equal(
        (error as ConnectionPolicyError).reasonCode,
        "REDIS_URL_REQUIRED",
      );
      assert.match(
        (error as Error).message,
        /connection:resolveRedisUrl: REDIS_URL_REQUIRED/,
      );
      assert.match(
        (error as Error).message,
        /Localhost fallback is forbidden in runtime/,
      );
      assert.equal((error as Error).message.includes("redis://"), false);
      assert.equal((error as Error).message.includes("super-secret"), false);
      return true;
    },
  );
});

test("using getRedisConnection with unresolved Redis placeholder fails closed clearly", async () => {
  clearRedisEnv();
  process.env.REDIS_URL = "${REDIS_URL}";

  const connectionModule = await importFreshConnectionModule();

  assert.throws(
    () => connectionModule.getRedisConnection(),
    /connection:resolveRedisUrl: CONFIG_PLACEHOLDER_UNRESOLVED/
  );
});

test("using the lazy connection facade without Redis env fails closed on property access", async () => {
  clearRedisEnv();

  const connectionModule = await importFreshConnectionModule();
  const lazyConnection = connectionModule.connection as Record<string, unknown>;

  assert.throws(
    () => lazyConnection.host,
    (error) =>
      error instanceof ConnectionPolicyError &&
      error.reasonCode === "REDIS_URL_REQUIRED",
  );
});

test("getRedisConnection uses explicit Redis env when configured", async () => {
  clearRedisEnv();
  process.env.RUN_ATIVO_UNIVERSAL_REDIS_URL = "redis://queue.example:6381/5";

  const connectionModule = await importFreshConnectionModule();
  const connection = connectionModule.getRedisConnection() as Record<string, unknown>;

  assert.equal(connection.host, "queue.example");
  assert.equal(connection.port, 6381);
  assert.equal(connection.db, 5);
  assert.equal(connection.connectionName, "run-ativo-universal");
});
