import { EventEmitter } from "node:events";
import { Prisma } from "@repo/db";
import Redis from "ioredis";

const emitter = new EventEmitter();
emitter.setMaxListeners(0);

type RunEvent = {
  id: string;
  runId: string;
  tenantId: string;
  workspaceId: string;
  userId: string | null;
  type: string;
  payload: Prisma.JsonValue | null;
  criticalHash: string | null;
  sclTxId: string | null;
  createdAt: Date;
};
type RunEventSubscriber = (event: RunEvent) => void;

const channelKey = (params: { tenantId: string; workspaceId: string; runId: string }) =>
  `${params.tenantId}:${params.workspaceId}:${params.runId}`;

const redisUrl = process.env.RUN_EVENTS_REDIS_URL || process.env.REDIS_URL;
let redisSubscriber: Redis | null = null;
const subscriptionCount = new Map<string, number>();

function getRedisSubscriber() {
  if (!redisUrl) return null;
  if (!redisSubscriber) {
    redisSubscriber = new Redis(redisUrl);
    redisSubscriber.on("message", (channel, message) => {
      try {
        const event = JSON.parse(message) as RunEvent;
        emitter.emit(channel, event);
      } catch (err) {
        // apenas loga no stderr local; não interrompe SSE
        // eslint-disable-next-line no-console
        console.error("runEventStream.redis_parse_error", err);
      }
    });
  }
  return redisSubscriber;
}

export function publishRunEventToStream(event: RunEvent) {
  emitter.emit(
    channelKey({
      tenantId: event.tenantId,
      workspaceId: event.workspaceId,
      runId: event.runId,
    }),
    event
  );
}

export function subscribeToRunEventStream(
  params: { tenantId: string; workspaceId: string; runId: string },
  subscriber: RunEventSubscriber
) {
  const channel = channelKey(params);
  emitter.on(channel, subscriber);

  const subscriberClient = getRedisSubscriber();
  if (subscriberClient) {
    const count = subscriptionCount.get(channel) ?? 0;
    if (count === 0) {
      subscriberClient.subscribe(`run-events:${channel}`).catch((err) => {
        // eslint-disable-next-line no-console
        console.error("runEventStream.redis_subscribe_error", err);
      });
    }
    subscriptionCount.set(channel, count + 1);
  }

  return () => {
    emitter.off(channel, subscriber);

    if (subscriberClient) {
      const count = subscriptionCount.get(channel) ?? 0;
      const next = Math.max(count - 1, 0);
      if (next === 0) {
        subscriptionCount.delete(channel);
        subscriberClient.unsubscribe(`run-events:${channel}`).catch((err) => {
          // eslint-disable-next-line no-console
          console.error("runEventStream.redis_unsubscribe_error", err);
        });
      } else {
        subscriptionCount.set(channel, next);
      }
    }
  };
}

export async function closeRunEventStream() {
  subscriptionCount.clear();
  emitter.removeAllListeners();
  if (redisSubscriber) {
    const current = redisSubscriber;
    redisSubscriber = null;
    try {
      await current.quit();
    } catch {
      current.disconnect();
      return;
    }
    current.disconnect();
  }
}
