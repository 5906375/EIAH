import test from "node:test";
import assert from "node:assert/strict";

import { MCPCircuitBreaker } from "./MCPCircuitBreaker.js";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("MCPCircuitBreaker: closed state executes fn and stays closed on success", async () => {
  const breaker = new MCPCircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 1_000 });

  const result = await breaker.execute(async () => "ok");

  assert.equal(result, "ok");
  assert.equal(breaker.snapshot.state, "closed");
  assert.equal(breaker.snapshot.failures, 0);
});

test("MCPCircuitBreaker: opens only after reaching the failure threshold", async () => {
  const breaker = new MCPCircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 1_000 });
  const failing = async () => {
    throw new Error("boom");
  };

  await assert.rejects(breaker.execute(failing), /boom/);
  assert.equal(breaker.snapshot.state, "closed", "a single failure must not open the breaker");

  await assert.rejects(breaker.execute(failing), /boom/);
  assert.equal(breaker.snapshot.state, "open");
});

test("MCPCircuitBreaker: open state blocks execution without calling fn", async () => {
  const breaker = new MCPCircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 10_000 });

  await assert.rejects(
    breaker.execute(async () => {
      throw new Error("boom");
    })
  );
  assert.equal(breaker.snapshot.state, "open");

  let called = false;
  await assert.rejects(
    breaker.execute(async () => {
      called = true;
      return "should not run";
    }),
    /Circuit breaker open/
  );
  assert.equal(called, false, "fn must not be invoked while the breaker is open");
});

test("MCPCircuitBreaker: transitions to half-open after resetTimeoutMs and closes on success", async () => {
  const breaker = new MCPCircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 20 });

  await assert.rejects(
    breaker.execute(async () => {
      throw new Error("boom");
    })
  );
  assert.equal(breaker.snapshot.state, "open");

  await delay(40);

  const result = await breaker.execute(async () => "recovered");
  assert.equal(result, "recovered");
  assert.equal(breaker.snapshot.state, "closed");
});

test("MCPCircuitBreaker: half-open failure re-opens the circuit", async () => {
  const breaker = new MCPCircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 20 });

  await assert.rejects(
    breaker.execute(async () => {
      throw new Error("boom");
    })
  );
  await delay(40);

  await assert.rejects(
    breaker.execute(async () => {
      throw new Error("still failing");
    }),
    /still failing/
  );
  assert.equal(breaker.snapshot.state, "open");
});

test("MCPCircuitBreaker: concurrent half-open attempts — second call is rejected while first is in flight", async () => {
  const breaker = new MCPCircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 20 });

  await assert.rejects(
    breaker.execute(async () => {
      throw new Error("boom");
    })
  );
  await delay(40);

  const first = breaker.execute(async () => {
    await delay(60);
    return "first";
  });
  const second = breaker.execute(async () => "second");

  await assert.rejects(second, /Circuit breaker half-open/);
  assert.equal(await first, "first");
  assert.equal(breaker.snapshot.state, "closed");
});
