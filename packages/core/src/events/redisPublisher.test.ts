import { afterEach, test } from "node:test";
import assert from "node:assert/strict";

type RedisPublisherModule = typeof import("./redisPublisher");

const REDIS_ENV_KEYS = ["RUN_EVENTS_REDIS_URL", "REDIS_URL"] as const;
const ORIGINAL_ENV = new Map<string, string | undefined>(
  REDIS_ENV_KEYS.map((key) => [key, process.env[key]])
);

let importCounter = 0;

async function importFreshModule(relativePath: string): Promise<RedisPublisherModule> {
  const url = new URL(relativePath, import.meta.url);
  return import(`${url.href}?case=${importCounter++}`) as Promise<RedisPublisherModule>;
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

test("importing the publisher module without Redis env does not instantiate Redis", async () => {
  delete process.env.RUN_EVENTS_REDIS_URL;
  delete process.env.REDIS_URL;

  const publisherModule = await importFreshModule("./redisPublisher.ts");

  assert.equal(publisherModule.hasRedisPublisherInstanceForTests(), false);
});

test("importing the core barrel without Redis env does not instantiate Redis", async () => {
  delete process.env.RUN_EVENTS_REDIS_URL;
  delete process.env.REDIS_URL;

  const barrelModule = await importFreshModule("../index.ts");

  assert.equal(barrelModule.hasRedisPublisherInstanceForTests(), false);
});

test("publishEvent without Redis env fails closed", async () => {
  delete process.env.RUN_EVENTS_REDIS_URL;
  delete process.env.REDIS_URL;

  const publisherModule = await importFreshModule("./redisPublisher.ts");

  await assert.rejects(
    () => publisherModule.publishEvent("events:test", { ok: true }),
    /redisPublisher: REDIS_URL_REQUIRED/
  );
  assert.equal(publisherModule.hasRedisPublisherInstanceForTests(), false);
});

test("publishEvent uses explicit RUN_EVENTS_REDIS_URL before REDIS_URL", async () => {
  process.env.RUN_EVENTS_REDIS_URL = "redis://run-events.example:6380/4";
  process.env.REDIS_URL = "redis://fallback.example:6379/0";

  const publisherModule = await importFreshModule("./redisPublisher.ts");
  const usedUrls: string[] = [];
  const published: Array<{ channel: string; message: string }> = [];

  publisherModule.setRedisPublisherFactoryForTests((url) => {
    usedUrls.push(url);
    return {
      publish: async (channel: string, message: string) => {
        published.push({ channel, message });
        return 1;
      },
      quit: async () => "OK",
      disconnect: () => undefined,
    };
  });

  await publisherModule.publishEvent("events:test", { ok: true });

  assert.deepEqual(usedUrls, ["redis://run-events.example:6380/4"]);
  assert.deepEqual(published, [{ channel: "events:test", message: JSON.stringify({ ok: true }) }]);
  await publisherModule.closeRedisPublisher();
  publisherModule.setRedisPublisherFactoryForTests(null);
});

test("closeRedisPublisher resets the singleton", async () => {
  process.env.RUN_EVENTS_REDIS_URL = "redis://run-events.example:6380/9";
  delete process.env.REDIS_URL;

  const publisherModule = await importFreshModule("./redisPublisher.ts");
  let instances = 0;
  let quits = 0;
  let disconnects = 0;

  publisherModule.setRedisPublisherFactoryForTests(() => {
    instances += 1;
    return {
      publish: async () => 1,
      quit: async () => {
        quits += 1;
        return "OK";
      },
      disconnect: () => {
        disconnects += 1;
      },
    };
  });

  await publisherModule.publishEvent("events:first", { id: 1 });
  await publisherModule.publishEvent("events:second", { id: 2 });
  assert.equal(instances, 1);

  await publisherModule.closeRedisPublisher();
  assert.equal(quits, 1);
  assert.equal(disconnects, 1);
  assert.equal(publisherModule.hasRedisPublisherInstanceForTests(), false);

  await publisherModule.publishEvent("events:third", { id: 3 });
  assert.equal(instances, 2);

  await publisherModule.closeRedisPublisher();
  publisherModule.setRedisPublisherFactoryForTests(null);
});
