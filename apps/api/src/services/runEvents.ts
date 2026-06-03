import { Prisma, PrismaClient, prismaGlobal } from "@repo/db";
import Redis from "ioredis";
import { publishRunEventToStream } from "./runEventStream";
import { waitForRedisReady } from "./runEventsRedisTransport";

const redisUrl = process.env.RUN_EVENTS_REDIS_URL || process.env.REDIS_URL;
let redisPublisher: Redis | null = null;
let redisPublisherReadyPromise: Promise<Redis> | null = null;
const outboxStreamKey = process.env.RUN_EVENTS_OUTBOX_STREAM ?? "run-events-outbox";
const useOutbox = (() => {
  const raw = (process.env.RUN_EVENTS_USE_OUTBOX ?? "false").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "on";
})();

function getRedisPublisher() {
  if (!redisUrl) return null;
  if (!redisPublisher) {
    redisPublisher = new Redis(redisUrl, {
      enableOfflineQueue: false,
      lazyConnect: true,
      maxRetriesPerRequest: 2,
    });
  }
  return redisPublisher;
}

async function getRedisPublisherReady() {
  const publisher = getRedisPublisher();
  if (!publisher) return null;
  if (publisher.status === "ready") return publisher;

  if (!redisPublisherReadyPromise) {
    redisPublisherReadyPromise = waitForRedisReady(publisher)
      .then(() => {
        redisPublisherReadyPromise = null;
        return publisher;
      })
      .catch((err) => {
        redisPublisherReadyPromise = null;
        throw err;
      });
  }

  return redisPublisherReadyPromise;
}

export async function recordRunEvent(params: {
  prisma?: PrismaClient;
  runId: string;
  tenantId: string;
  workspaceId: string;
  userId?: string;
  type: string;
  payload?: unknown;
  criticalHash?: string | null;
  sclTxId?: string | null;
}) {
  const client = params.prisma ?? prismaGlobal;
  const payloadValue =
    params.payload === undefined
      ? Prisma.DbNull
      : params.payload === null
      ? Prisma.JsonNull
      : (params.payload as Prisma.InputJsonValue);

  const event = await client.runEvent.create({
    data: {
      runId: params.runId,
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      userId: params.userId ?? null,
      type: params.type,
      payload: payloadValue,
      criticalHash: params.criticalHash ?? null,
      sclTxId: params.sclTxId ?? null,
    },
  });

  let publisher: Redis | null = null;
  try {
    publisher = await getRedisPublisherReady();
  } catch (err) {
    if (useOutbox) {
      // eslint-disable-next-line no-console
      console.error("runEvents.redis_outbox_error", err);
    } else {
      // eslint-disable-next-line no-console
      console.error("runEvents.redis_publish_error", err);
    }
  }

  if (useOutbox && publisher) {
    try {
      await publisher.xadd(
        outboxStreamKey,
        "*",
        "event",
        JSON.stringify({
          ...event,
          timestamp: Date.now(),
        })
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("runEvents.redis_outbox_error", err);
    }
  } else {
    publishRunEventToStream(event);

    if (publisher) {
      try {
        await publisher.publish(
          `run-events:${event.tenantId}:${event.workspaceId}:${event.runId}`,
          JSON.stringify({ ...event, timestamp: Date.now() })
        );
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("runEvents.redis_publish_error", err);
      }
    }
  }

  return event;
}

export async function closeRunEventsTransport() {
  if (redisPublisher) {
    const current = redisPublisher;
    redisPublisher = null;
    try {
      await current.quit();
    } catch {
      current.disconnect();
      return;
    }
    current.disconnect();
  }
}

export async function listRunEvents(params: {
  prisma?: PrismaClient;
  runId: string;
  tenantId: string;
  workspaceId: string;
  cursor?: string | null;
}) {
  const client = params.prisma ?? prismaGlobal;
  let cursorEvent: { id: string; createdAt: Date } | null = null;
  if (params.cursor) {
    cursorEvent = await client.runEvent.findFirst({
      where: {
        id: params.cursor,
        runId: params.runId,
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
      },
      select: { id: true, createdAt: true },
    });
  }

  return client.runEvent.findMany({
    where: {
      runId: params.runId,
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      ...(cursorEvent
        ? {
            OR: [
              { createdAt: { gt: cursorEvent.createdAt } },
              {
                createdAt: cursorEvent.createdAt,
                id: { gt: cursorEvent.id },
              },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "asc" },
  });
}
