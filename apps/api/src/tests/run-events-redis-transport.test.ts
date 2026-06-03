import assert from "node:assert/strict";
import test from "node:test";
import { waitForRedisReady } from "../services/runEventsRedisTransport";

test("waitForRedisReady connects lazy clients before pinging", async () => {
  const calls: string[] = [];
  const redis = {
    status: "wait",
    async connect() {
      calls.push("connect");
      redis.status = "ready";
    },
    async ping() {
      calls.push("ping");
      return "PONG";
    },
  };

  await waitForRedisReady(redis, { attempts: 2, delayMs: 0 }, async () => undefined);

  assert.deepEqual(calls, ["connect"]);
});

test("waitForRedisReady retries ping until the client becomes ready", async () => {
  let attempts = 0;
  const redis = {
    status: "connecting",
    async connect() {
      throw new Error("connect should not be called while already connecting");
    },
    async ping() {
      attempts += 1;
      if (attempts === 1) {
        throw new Error("socket not writable yet");
      }
      redis.status = "ready";
      return "PONG";
    },
  };

  await waitForRedisReady(redis, { attempts: 3, delayMs: 0 }, async () => undefined);

  assert.equal(attempts, 2);
});
