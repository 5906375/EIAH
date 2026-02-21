import { defineConfig } from "vitest/config";
import dotenv from "dotenv";
import path from "node:path";
import fs from "node:fs";
import { EventEmitter } from "node:events";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config({ path: path.resolve(__dirname, ".env") });
process.env.NODE_ENV = "test";

const inDocker = fs.existsSync("/.dockerenv");
const explicitEnvFile = process.env.VITEST_ENV_FILE;
const localTestEnvFile = path.resolve(__dirname, ".env.test");
const selectedTestEnvFile =
  explicitEnvFile && explicitEnvFile.trim().length > 0
    ? path.resolve(__dirname, explicitEnvFile)
    : !inDocker && fs.existsSync(localTestEnvFile)
    ? localTestEnvFile
    : null;
if (selectedTestEnvFile) {
  dotenv.config({ path: selectedTestEnvFile, override: true });
}

const defaultDb = inDocker
  ? "postgresql://postgres:senha@eiah-postgres:5432/eiah_builder?schema=public"
  : "postgresql://postgres:senha@127.0.0.1:5433/eiah_builder?schema=public";
const defaultRedis = inDocker ? "redis://eiah-redis:6379/0" : "redis://127.0.0.1:6379/0";

process.env.DATABASE_URL =
  process.env.VITEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  defaultDb;
process.env.REDIS_URL =
  process.env.VITEST_REDIS_URL ||
  process.env.REDIS_URL ||
  defaultRedis;
process.env.RUN_EVENTS_REDIS_URL =
  process.env.VITEST_REDIS_URL ||
  process.env.RUN_EVENTS_REDIS_URL ||
  process.env.REDIS_URL;
process.env.APP_ORIGIN = process.env.APP_ORIGIN || "http://localhost:5173";
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN || process.env.APP_ORIGIN;

function summarizeUrl(raw: string | undefined, fallback: string) {
  const value = raw && raw.trim().length > 0 ? raw : fallback;
  try {
    const parsed = new URL(value);
    return `${parsed.protocol}//${parsed.hostname}:${parsed.port || "(default)"}`;
  } catch {
    return value;
  }
}

if (process.env.NODE_ENV === "test") {
  // Single startup log to make DNS target explicit during troubleshooting.
  console.info(
    "[vitest-env]",
    JSON.stringify({
      inDocker,
      envFile: selectedTestEnvFile,
      database: summarizeUrl(process.env.DATABASE_URL, defaultDb),
      redis: summarizeUrl(process.env.REDIS_URL, defaultRedis),
      runEventsRedis: summarizeUrl(process.env.RUN_EVENTS_REDIS_URL, defaultRedis),
    })
  );
}

// Evita warning de MaxListeners durante testes com pools de conexão.
if (EventEmitter.defaultMaxListeners < 20) {
  EventEmitter.defaultMaxListeners = 20;
}

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@eiah\/core$/,
        replacement: path.resolve(__dirname, "../../packages/core/src/index.ts"),
      },
      {
        find: /^@eiah\/core\/(.*)$/,
        replacement: path.resolve(__dirname, "../../packages/core/src/$1"),
      },
      {
        find: /^@eiah\/contracts$/,
        replacement: path.resolve(__dirname, "../../packages/contracts/src/index.ts"),
      },
      {
        find: /^@eiah\/contracts\/(.*)$/,
        replacement: path.resolve(__dirname, "../../packages/contracts/src/$1"),
      },
      {
        find: /^packages\/core\/src\/(.*)$/,
        replacement: path.resolve(__dirname, "../../packages/core/src/$1"),
      },
    ],
  },
  test: {
    environment: "node",
    setupFiles: [path.resolve(__dirname, "src/tests/setup.ts")],
  },
});
