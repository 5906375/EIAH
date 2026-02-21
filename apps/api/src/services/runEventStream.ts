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

const channelKey = (params: { tenantId: string; workspaceId: string; runId: string }) =>
  `${params.tenantId}:${params.workspaceId}:${params.runId}`;

const redisUrl = process.env.RUN_EVENTS_REDIS_URL || process.env.REDIS_URL;
const redisSubscriber = redisUrl ? new Redis(redisUrl) : null;
const subscriptionCount = new Map<string, number>();

redisSubscriber?.on("message", (channel, message) => {
  try {
    const event = JSON.parse(message) as RunEvent;
    emitter.emit(channel, event);
  } catch (err) {
    // apenas loga no stderr local; não interrompe SSE
    console.error("runEventStream.redis_parse_error", err);
  }
});

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
  subscriber: (event: RunEvent) => void
) {
  const channel = channelKey(params);
  emitter.on(channel, subscriber);

  if (redisSubscriber) {
    const count = subscriptionCount.get(channel) ?? 0;
    if (count === 0) {
      redisSubscriber.subscribe(`run-events:${channel}`).catch((err) => {
        console.error("runEventStream.redis_subscribe_error", err);
      });
    }
    subscriptionCount.set(channel, count + 1);
  }

  return () => {
    emitter.off(channel, subscriber);

    if (redisSubscriber) {
      const count = subscriptionCount.get(channel) ?? 0;
      const next = Math.max(count - 1, 0);
      if (next === 0) {
        subscriptionCount.delete(channel);
        redisSubscriber.unsubscribe(`run-events:${channel}`).catch((err) => {
          console.error("runEventStream.redis_unsubscribe_error", err);
        });
      } else {
        subscriptionCount.set(channel, next);
      }
    }
  };
}
