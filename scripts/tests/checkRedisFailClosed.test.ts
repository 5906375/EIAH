import assert from "node:assert/strict";
import test from "node:test";
import { scanRedisFailClosedSource } from "../checkRedisFailClosed";

test("Redis fail-closed detector still rejects a real localhost fallback", () => {
  const violations = scanRedisFailClosedSource(
    "packages/core/src/config/unsafeRedis.ts",
    'const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";',
  );

  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.reason, "redis_localhost_name_fallback");
});

test("Redis fail-closed detector accepts prescriptive prohibition wording", () => {
  const violations = scanRedisFailClosedSource(
    "packages/core/src/reasons/reasonCatalog.ts",
    'descriptionPrefix: "Required Redis connection URL is absent and localhost fallback is forbidden",',
  );

  assert.deepEqual(violations, []);
});

test("prescriptive comment cannot hide a real localhost fallback", () => {
  const violations = scanRedisFailClosedSource(
    "packages/core/src/config/unsafeRedis.ts",
    'const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379"; // localhost fallback is forbidden',
  );

  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.reason, "redis_localhost_name_fallback");
});
