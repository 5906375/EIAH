import {
  consume as consumeLegacyRunQueue,
  type RunQueuePayload
} from "@eiah/core/queue/runQueue";

import {
  RUN_ATIVO_UNIVERSAL_QUEUE_NAME,
  type RunAtivoUniversalJobPayload
} from "@eiah/core/queue/runAtivoUniversalQueue";

import { Worker } from "bullmq";
import { getRedisConnection } from "@eiah/core/queue/connection";
import { randomUUID } from "crypto";
import { Prisma, RunStatus, PrismaClient, getPrismaForTenant } from "@repo/db";
import type {
  OrchestratorRunEvent,
  RunEventStore
} from "../../../../packages/core/src/orchestrator/runEventStore.js";

// IMPORTS DIRETOS DO SOURCE DO CORE (FUNCIONAM EM RUNTIME)
import { AgentOrchestrator } from "../../../../packages/core/src/orchestrator/agentOrchestrator.js";
import { DefaultPlanManager } from "../../../../packages/core/src/orchestrator/planManager.js";
import { CompositeRunEventStore } from "../../../../packages/core/src/orchestrator/runEventStore.js";
import { ConsoleTelemetryBridge } from "../../../../packages/core/src/orchestrator/telemetryBridge.js";
import { assertTenantAccess } from "../../../../packages/core/src/security/rbac.js";
import {
  rateLimit,
  createFixedWindowRateLimiter,
  tenantRateLimitKey
} from "@eiah/core";

// IMPORT DIRETO (porque @eiah/core/logging não está exportado via package.json)
import { createLogger } from "../../../../packages/core/src/logging/logger.js";
import { createRunWorkerHealth } from "./health";

// ✅ Nova importação dedicada para publish/subscribe direto
import Redis from "ioredis";

const logger = createLogger({ component: "run-worker" });

// 🔹 Conexão centralizada para BullMQ (vinda do core)
const redisConnection = getRedisConnection();

// 🔹 Conexão direta para publish/sub (ioredis)
const redisPub = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");

const redisChannelFor = (event: { runId?: string; tenantId?: string; workspaceId?: string }) =>
  `run-events:${event.tenantId ?? "unknown"}:${event.workspaceId ?? "unknown"}:${event.runId ?? "unknown"}`;


class RedisRunEventStore implements RunEventStore {
  async record(event: OrchestratorRunEvent): Promise<void> {
    try {
      const eventWithTimestamp = {
        ...event,
        createdAt: new Date().toISOString()
      };

      await redisPub.publish(
        redisChannelFor(event),
        JSON.stringify(eventWithTimestamp)
      );
    } catch (err) {
      logger.error({ err, event }, "run-worker.redis_publish_failed");
    }
  }
}

class PrismaRunEventStore implements RunEventStore {
  constructor(private readonly db: PrismaClient) { }

  async record(event: OrchestratorRunEvent): Promise<void> {
    try {
      const payload =
        event.payload === undefined
          ? Prisma.DbNull
          : event.payload === null
            ? Prisma.JsonNull
            : (event.payload as Prisma.InputJsonValue);

      await this.db.runEvent.create({
        data: {
          runId: event.runId,
          tenantId: event.tenantId,
          workspaceId: event.workspaceId,
          userId: event.userId ?? null,
          type: event.type,
          payload
        }
      });
    } catch (err) {
      logger.error({ err, event }, "run-worker.prisma_run_event_failed");
    }
  }
}

async function updateRunStatus(
  db: PrismaClient,
  runId: string,
  status: RunStatus
) {
  try {
    await db.run.update({
      where: { id: runId },
      data: { status }
    });
  } catch (err) {
    logger.warn({ err, runId, status }, "run-worker.update_run_status_failed");
  }
}

const runRateLimiter = createFixedWindowRateLimiter({
  limit: 20,
  windowMs: 1_000
});

async function executeRun(input: {
  objective: string;
  runId: string;
  tenantId: string;
  workspaceId: string;
  metadata?: Record<string, unknown>;
}) {
  logger.info({ input }, "run-worker.executeRun");

  await rateLimit({
    limiter: runRateLimiter,
    keyResolver: (context) =>
      tenantRateLimitKey(context.tenantId, context.workspaceId, context.action)
  }).before({
    action: "run.execute",
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    runId: input.runId,
    logger: (event, payload) =>
      logger.info({ event, payload }, "run-worker.rateLimit")
  });

  const db = getPrismaForTenant(input.tenantId, input.workspaceId);

  const eventStore = new CompositeRunEventStore([
    new RedisRunEventStore(),
    new PrismaRunEventStore(db)
  ]);

  const orchestrator = new AgentOrchestrator({
    planManager: new DefaultPlanManager(),
    act: async (step, context) => {
      const actionName = step.action;
      const action = actionName ? context.actions[actionName] : null;
      if (!action) {
        throw new Error(`Action '${actionName ?? "undefined"}' não registrada.`);
      }
      return action.handler({
        action: action.name,
        input: step.params,
        runId: context.input.runId,
        stepId: step.id,
        tenantId: context.input.tenantId,
        workspaceId: context.input.workspaceId,
        metadata: context.input.metadata,
        logger: (event, payload) => logger.info({ event, payload })
      });
    },
    logger: (event, data) => logger.info({ event, data }),
    eventStore,
    telemetry: new ConsoleTelemetryBridge()
  });

  await updateRunStatus(db, input.runId, "running");
  await eventStore.record({
    runId: input.runId,
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    type: "run.started",
    payload: { objective: input.objective }
  });

  try {
    const result = await orchestrator.run({
      objective: input.objective,
      runId: input.runId,
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      metadata: input.metadata,
      actions: {}
    });

    await updateRunStatus(db, input.runId, "success");
    await eventStore.record({
      runId: input.runId,
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      type: "run.completed",
      payload: { result }
    });

    return result;
  } catch (err) {
    await updateRunStatus(db, input.runId, "error");
    await eventStore.record({
      runId: input.runId,
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      type: "run.failed",
      payload: { message: (err as Error)?.message }
    });
    throw err;
  } finally {
    await db.$disconnect().catch(() => undefined);
  }
}

consumeLegacyRunQueue(async (job: RunQueuePayload) => {
  logger.info({ job }, "run-worker.consumeLegacyQueue");

  const objective = job.prompt ?? "Execução sem prompt";
  const runId = job.runId ?? randomUUID();
  const tenantId = job.tenantId ?? "default-tenant";
  const workspaceId = job.workspaceId ?? "default-workspace";

  const lookupDb = getPrismaForTenant(tenantId, workspaceId);
  try {
    const run = await lookupDb.run.findUnique({ where: { id: runId } });
    assertTenantAccess(run?.tenantId ?? tenantId, job.tenantId ?? tenantId);
  } finally {
    await lookupDb.$disconnect().catch(() => undefined);
  }

  await executeRun({
    objective,
    runId,
    tenantId,
    workspaceId,
    metadata: job.metadata
  });
});

// Health/DLQ listeners
createRunWorkerHealth("run-queue");

// Worker principal
new Worker<RunAtivoUniversalJobPayload>(
  RUN_ATIVO_UNIVERSAL_QUEUE_NAME,
  async (job) => {
    const data = job.data;

    logger.info({ data }, "run-worker.consumeUniversalQueue");

    const objective = `Processar ativo ${data.ativoId}`;
    const metadata = { agentId: data.agentId, ativoId: data.ativoId };

    await executeRun({
      objective,
      runId: data.runId,
      tenantId: data.tenantId,
      workspaceId: data.workspaceId,
      metadata
    });
  },
  { connection: redisConnection }
);

logger.info("run-worker online: Consumindo runQueue e run-ativo-universal");
