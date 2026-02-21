import { Prisma, type PrismaClient } from "@repo/db";
import Redis from "ioredis";
import type { OrchestratorRunEvent, RunEventStore } from "../orchestrator/runEventStore";

export interface RunEventOutbox {
  publish(event: OrchestratorRunEvent): Promise<void>;
}

const redisUrl = process.env.RUN_EVENTS_REDIS_URL || process.env.REDIS_URL;
const redisPublisher = redisUrl
  ? new Redis(redisUrl, { enableOfflineQueue: false, maxRetriesPerRequest: 2 })
  : null;
const outboxStreamKey = process.env.RUN_EVENTS_OUTBOX_STREAM ?? "run-events-outbox";
const useOutbox = (() => {
  const raw = (process.env.RUN_EVENTS_USE_OUTBOX ?? "false").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "on";
})();

type StoredRunEvent = {
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

export class PrismaRunEventStore implements RunEventStore {
  private lastEvent: StoredRunEvent | null = null;

  constructor(private readonly db: PrismaClient) {}

  async record(event: OrchestratorRunEvent): Promise<void> {
    const payload =
      event.payload === undefined
        ? Prisma.DbNull
        : event.payload === null
          ? Prisma.JsonNull
          : (event.payload as Prisma.InputJsonValue);

    const created = await this.db.runEvent.create({
      data: {
        runId: event.runId,
        tenantId: event.tenantId,
        workspaceId: event.workspaceId,
        userId: event.userId ?? null,
        type: event.type,
        payload,
      },
    });

    this.lastEvent = created as StoredRunEvent;
  }

  getLastEvent(): StoredRunEvent | null {
    return this.lastEvent;
  }
}

export class RedisRunEventOutbox implements RunEventOutbox {
  constructor(private readonly store: PrismaRunEventStore) {}

  async publish(_event: OrchestratorRunEvent): Promise<void> {
    const stored = this.store.getLastEvent();
    if (!stored || !redisPublisher) return;

    const payload = JSON.stringify({ ...stored, timestamp: Date.now() });

    try {
      if (useOutbox) {
        await redisPublisher.xadd(outboxStreamKey, "*", "event", payload);
      } else {
        await redisPublisher.publish(
          `run-events:${stored.tenantId}:${stored.workspaceId}:${stored.runId}`,
          payload
        );
      }
    } catch (err) {
      // best-effort; do not fail run execution
      // eslint-disable-next-line no-console
      console.error("runEventPublisher.outbox_error", err);
    }
  }
}

export class CompositeRunEventStoreWithOutbox implements RunEventStore {
  constructor(
    private readonly stores: RunEventStore[],
    private readonly outbox: RunEventOutbox
  ) {}

  async record(event: OrchestratorRunEvent): Promise<void> {
    for (const s of this.stores) {
      await s.record(event);
    }

    await this.outbox.publish(event);
  }
}
