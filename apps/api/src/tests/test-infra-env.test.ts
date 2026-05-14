import test from "node:test";
import assert from "node:assert/strict";
import process from "node:process";

import { ensureLocalTestInfraEnv } from "./support/testInfraEnv";

test("test infra env normalizes docker-only DB and Redis hostnames to local endpoints", () => {
  const previous = {
    DATABASE_URL: process.env.DATABASE_URL,
    SHADOW_DATABASE_URL: process.env.SHADOW_DATABASE_URL,
    REDIS_URL: process.env.REDIS_URL,
    RUN_EVENTS_REDIS_URL: process.env.RUN_EVENTS_REDIS_URL,
    REDIS_HOST: process.env.REDIS_HOST,
  };

  try {
    process.env.DATABASE_URL = "postgresql://postgres:senha@eiah-postgres:5432/eiah_builder?schema=public";
    process.env.SHADOW_DATABASE_URL = "postgresql://postgres:senha@eiah-postgres:5432/eiah_builder_shadow?schema=public";
    process.env.REDIS_URL = "redis://eiah-redis:6379/0";
    process.env.RUN_EVENTS_REDIS_URL = "redis://eiah-redis:6379/1";
    delete process.env.REDIS_HOST;

    ensureLocalTestInfraEnv();

    assert.match(String(process.env.DATABASE_URL), /127\.0\.0\.1:5433/);
    assert.match(String(process.env.SHADOW_DATABASE_URL), /127\.0\.0\.1:5433/);
    assert.match(String(process.env.REDIS_URL), /127\.0\.0\.1:6379/);
    assert.match(String(process.env.RUN_EVENTS_REDIS_URL), /127\.0\.0\.1:6379/);
    assert.equal(process.env.REDIS_HOST, "127.0.0.1");
  } finally {
    process.env.DATABASE_URL = previous.DATABASE_URL;
    process.env.SHADOW_DATABASE_URL = previous.SHADOW_DATABASE_URL;
    process.env.REDIS_URL = previous.REDIS_URL;
    process.env.RUN_EVENTS_REDIS_URL = previous.RUN_EVENTS_REDIS_URL;
    process.env.REDIS_HOST = previous.REDIS_HOST;
  }
});
