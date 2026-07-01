import assert from "node:assert/strict";
import test from "node:test";
import type Redis from "ioredis";
import {
  acquireWorkerOwnershipLease,
  getLeaseState,
  resolveLeaseKey,
  resolveMetaKey,
  type LeaseOptions,
  type WorkerQueue,
} from "./workerOwnershipLease";

// ---------------------------------------------------------------------------
// Fake Redis — only the methods used by workerOwnershipLease at runtime
// ---------------------------------------------------------------------------

class FakeRedis {
  private readonly store = new Map<string, { value: string; expiresAt: number | null }>();

  private isExpired(entry: { value: string; expiresAt: number | null }): boolean {
    if (entry.expiresAt === null) return false;
    return Date.now() >= entry.expiresAt;
  }

  private lookup(key: string): string | null {
    const entry = this.store.get(key);
    if (!entry || this.isExpired(entry)) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ...rest: Array<string | number>): Promise<string | null> {
    let ttlMs: number | null = null;
    let nx = false;

    for (let i = 0; i < rest.length; i++) {
      const opt = String(rest[i]).toUpperCase();
      if (opt === "PX") {
        ttlMs = Number(rest[++i]);
      } else if (opt === "EX") {
        ttlMs = Number(rest[++i]) * 1000;
      } else if (opt === "NX") {
        nx = true;
      }
    }

    if (nx && this.lookup(key) !== null) return null;

    const expiresAt = ttlMs !== null ? Date.now() + ttlMs : null;
    this.store.set(key, { value: String(value), expiresAt });
    return "OK";
  }

  private pexpireSync(key: string, ms: number): void {
    const entry = this.store.get(key);
    if (!entry || this.isExpired(entry)) { this.store.delete(key); return; }
    entry.expiresAt = Date.now() + ms;
  }

  async eval(script: string, numkeys: number, ...rest: string[]): Promise<number> {
    const keys = rest.slice(0, numkeys);
    const args = rest.slice(numkeys);
    const current = this.lookup(keys[0] ?? "");

    if (script.includes("pexpire")) {
      // RENEW_SCRIPT
      if (current !== args[0]) return 0;
      this.pexpireSync(keys[0] ?? "", Number(args[1]));
      this.pexpireSync(keys[1] ?? "", Number(args[1]));
      return 1;
    }

    if (script.includes("del")) {
      // RELEASE_SCRIPT
      if (current !== args[0]) return 0;
      this.store.delete(keys[0] ?? "");
      this.store.delete(keys[1] ?? "");
      return 1;
    }

    return 0;
  }

  async quit(): Promise<void> {}

  hasKey(key: string): boolean { return this.lookup(key) !== null; }
  getValue(key: string): string | null { return this.lookup(key); }
  forceDelete(key: string): void { this.store.delete(key); }
}

// Cast FakeRedis to Redis for type compatibility.
// FakeRedis implements all methods used at runtime; the cast is intentional.
function asRedis(fake: FakeRedis): Redis {
  return fake as unknown as Redis;
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function makeOpts(
  fake: FakeRedis,
  env: string,
  queue: WorkerQueue = "runs",
  overrides: Partial<Omit<LeaseOptions, "redis">> = {},
): LeaseOptions {
  return {
    environmentId: env,
    queue,
    ownerId: "owner-A",
    redis: asRedis(fake),
    ttlMs: 5_000,
    renewIntervalMs: 9_999_999,
    onLeaseLost: () => {},
    ...overrides,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("acquire returns acquired=true when no lease exists", async () => {
  const fake = new FakeRedis();
  const env = "env-acquire-01";
  const lease = await acquireWorkerOwnershipLease(makeOpts(fake, env));

  assert.equal(lease.acquired, true);
  assert.equal(fake.hasKey(resolveLeaseKey(env, "runs")), true);
  assert.equal(fake.hasKey(resolveMetaKey(env, "runs")), true);
  assert.equal(fake.getValue(resolveLeaseKey(env, "runs")), "owner-A");

  const state = getLeaseState(env, "runs");
  assert.equal(state.owned, true);
  assert.equal(state.ownerId, "owner-A");
  assert.ok(typeof state.acquiredAt === "string" && state.acquiredAt.length > 0);

  lease.stop();
});

test("acquire returns acquired=false when another instance holds the lease", async () => {
  const fake = new FakeRedis();
  const env = "env-acquire-02";

  const leaseA = await acquireWorkerOwnershipLease(makeOpts(fake, env, "runs", { ownerId: "owner-A" }));
  assert.equal(leaseA.acquired, true);

  const leaseB = await acquireWorkerOwnershipLease(makeOpts(fake, env, "runs", { ownerId: "owner-B" }));
  assert.equal(leaseB.acquired, false);
  assert.equal(fake.getValue(resolveLeaseKey(env, "runs")), "owner-A");

  leaseA.stop();
});

test("acquire is independent per queue — runs and run-ativo-universal do not conflict", async () => {
  const fake = new FakeRedis();
  const env = "env-acquire-03";

  const leaseRuns = await acquireWorkerOwnershipLease(
    makeOpts(fake, env, "runs", { ownerId: "owner-A" }),
  );
  const leaseAtivo = await acquireWorkerOwnershipLease(
    makeOpts(fake, env, "run-ativo-universal", { ownerId: "owner-B" }),
  );

  assert.equal(leaseRuns.acquired, true);
  assert.equal(leaseAtivo.acquired, true);

  leaseRuns.stop();
  leaseAtivo.stop();
});

test("release removes both lease and meta keys atomically (Lua CAS)", async () => {
  const fake = new FakeRedis();
  const env = "env-release-01";

  const lease = await acquireWorkerOwnershipLease(makeOpts(fake, env));
  assert.equal(lease.acquired, true);

  await lease.release();

  assert.equal(fake.hasKey(resolveLeaseKey(env, "runs")), false);
  assert.equal(fake.hasKey(resolveMetaKey(env, "runs")), false);

  const state = getLeaseState(env, "runs");
  assert.equal(state.owned, false);
  assert.equal(state.ownerId, null);
});

test("Lua CAS release: non-owner cannot delete owner's lease", async () => {
  const fake = new FakeRedis();
  const env = "env-release-02";

  const leaseA = await acquireWorkerOwnershipLease(
    makeOpts(fake, env, "runs", { ownerId: "owner-A" }),
  );
  assert.equal(leaseA.acquired, true);

  // Attempt release with wrong ownerId — must return 0 (no-op)
  const releaseScript = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  redis.call('del', KEYS[1])
  redis.call('del', KEYS[2])
  return 1
else
  return 0
end`;
  const result = await fake.eval(
    releaseScript,
    2,
    resolveLeaseKey(env, "runs"),
    resolveMetaKey(env, "runs"),
    "owner-B",
  );
  assert.equal(result, 0);
  assert.equal(fake.getValue(resolveLeaseKey(env, "runs")), "owner-A");

  leaseA.stop();
});

test("renewal succeeds while owner holds the lease (no onLeaseLost)", async () => {
  const fake = new FakeRedis();
  const env = "env-renew-01";
  let lostCalled = false;

  const lease = await acquireWorkerOwnershipLease(
    makeOpts(fake, env, "runs", {
      renewIntervalMs: 20,
      onLeaseLost: () => { lostCalled = true; },
    }),
  );
  assert.equal(lease.acquired, true);

  await sleep(60);

  assert.equal(lostCalled, false);
  assert.equal(fake.hasKey(resolveLeaseKey(env, "runs")), true);
  assert.equal(getLeaseState(env, "runs").owned, true);

  lease.stop();
});

test("onLeaseLost is called when lease key disappears during renewal", async () => {
  const fake = new FakeRedis();
  const env = "env-lost-01";
  let lostCalled = false;

  const lease = await acquireWorkerOwnershipLease(
    makeOpts(fake, env, "runs", {
      renewIntervalMs: 20,
      onLeaseLost: () => { lostCalled = true; },
    }),
  );
  assert.equal(lease.acquired, true);

  // Simulate lease theft
  fake.forceDelete(resolveLeaseKey(env, "runs"));

  await sleep(70);

  assert.equal(lostCalled, true);
  assert.equal(getLeaseState(env, "runs").owned, false);
  assert.equal(getLeaseState(env, "runs").ownerId, null);
});

test("stop() cancels renewal timer without calling onLeaseLost", async () => {
  const fake = new FakeRedis();
  const env = "env-stop-01";
  let lostCalled = false;

  const lease = await acquireWorkerOwnershipLease(
    makeOpts(fake, env, "runs", {
      renewIntervalMs: 20,
      onLeaseLost: () => { lostCalled = true; },
    }),
  );
  assert.equal(lease.acquired, true);
  lease.stop();

  fake.forceDelete(resolveLeaseKey(env, "runs"));
  await sleep(70);

  assert.equal(lostCalled, false, "onLeaseLost must not fire after stop()");
});

test("getLeaseState returns owned=false for unknown (environmentId, queue)", () => {
  const state = getLeaseState("env-never-registered", "runs");
  assert.equal(state.owned, false);
  assert.equal(state.ownerId, null);
  assert.equal(state.acquiredAt, null);
});

// ---------------------------------------------------------------------------
// Conditional real-Redis integration test
// Strictly opt-in: Redis-real duplicateSideEffects evidence only runs when
// explicitly authorized by EIAH_RUN_REDIS_REAL_TESTS=true and REDIS_URL.
// REDIS_URL alone may exist in CI/app envs and must not trigger real Redis tests.
// RUN_QUEUE_REDIS_URL / BULLMQ_REDIS_URL are intentionally excluded here.
// ---------------------------------------------------------------------------

// Strictly opt-in: Redis-real duplicateSideEffects evidence only runs when
// explicitly authorized by EIAH_RUN_REDIS_REAL_TESTS=true and REDIS_URL.
// REDIS_URL alone may exist in CI/app envs and must not trigger real Redis tests.
// RUN_QUEUE_REDIS_URL / BULLMQ_REDIS_URL are intentionally excluded here.
const REDIS_REAL_TESTS_ENABLED = process.env.EIAH_RUN_REDIS_REAL_TESTS === "true";
const REDIS_URL_FOR_LEASE_TEST = process.env.REDIS_URL ?? null;

const redisRealSkipReason =
  REDIS_REAL_TESTS_ENABLED && REDIS_URL_FOR_LEASE_TEST
    ? false
    : "EIAH_RUN_REDIS_REAL_TESTS=true and REDIS_URL are required — Redis-real duplicateSideEffects gate skipped; coverage is PARTIAL";

test(
  "duplicateSideEffects=0: two concurrent instances for the same (environmentId, queue), only one acquires",
  { skip: redisRealSkipReason },
  async () => {
    // Import is deferred to test body — no ioredis client created when test is skipped.
    const { default: Redis } = await import("ioredis");

    const url = REDIS_URL_FOR_LEASE_TEST!;

    // lazyConnect: true — no eager connection attempt; connect() is called explicitly below.
    // retryStrategy: () => null — no reconnect on failure; fail fast.
    // maxRetriesPerRequest: 1 — single attempt per command.
    const redisA = new Redis(url, {
      lazyConnect: true,
      retryStrategy: () => null,
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
    });
    const redisB = new Redis(url, {
      lazyConnect: true,
      retryStrategy: () => null,
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
    });

    // Error handlers prevent unhandled error events when connection fails.
    // The explicit connect() below will throw in that case, failing the test.
    const errA: Error[] = [];
    const errB: Error[] = [];
    redisA.on("error", (err: Error) => errA.push(err));
    redisB.on("error", (err: Error) => errB.push(err));

    const testEnvId = `test-dup-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    let sideEffectCount = 0;

    let leaseA: Awaited<ReturnType<typeof acquireWorkerOwnershipLease>> | null = null;
    let leaseB: Awaited<ReturnType<typeof acquireWorkerOwnershipLease>> | null = null;

    try {
      // Explicit connect — throws if Redis is unreachable (fails the test, not CI process).
      await Promise.all([redisA.connect(), redisB.connect()]);

      [leaseA, leaseB] = await Promise.all([
        acquireWorkerOwnershipLease({
          environmentId: testEnvId,
          queue: "runs",
          ownerId: "owner-A",
          redis: redisA,
          ttlMs: 15_000,
          renewIntervalMs: 5_000,
          onLeaseLost: () => {},
        }),
        acquireWorkerOwnershipLease({
          environmentId: testEnvId,
          queue: "runs",
          ownerId: "owner-B",
          redis: redisB,
          ttlMs: 15_000,
          renewIntervalMs: 5_000,
          onLeaseLost: () => {},
        }),
      ]);

      const acquiredCount = [leaseA.acquired, leaseB.acquired].filter(Boolean).length;
      assert.equal(acquiredCount, 1, "exactly one lease must be acquired");

      if (leaseA.acquired) sideEffectCount++;
      if (leaseB.acquired) sideEffectCount++;

      const duplicateSideEffects = sideEffectCount - 1;
      assert.equal(sideEffectCount, 1, "sideEffectCount must equal 1 — derived from real Redis execution");
      assert.equal(duplicateSideEffects, 0, "duplicateSideEffects=0 — derived from real Redis, not hardcoded");
    } finally {
      leaseA?.stop();
      leaseB?.stop();
      await Promise.allSettled([
        leaseA?.release(),
        leaseB?.release(),
        redisA.quit().catch(() => redisA.disconnect()),
        redisB.quit().catch(() => redisB.disconnect()),
      ]);
    }
  },
);
