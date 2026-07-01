import {
  consume as consumeLegacyRunQueue,
  type RunQueuePayload
} from "@eiah/core/queue/runQueue";
import { resolveWorkerTopology } from "@eiah/core/queue/workerTopology";
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
} from "../../../../packages/core/src/actions/guardrails.js";
import { tenantRateLimitKey } from "../../../../packages/core/src/security/internalRateLimit.js";

// IMPORT DIRETO (porque @eiah/core/logging não está exportado via package.json)
import { createLogger } from "../../../../packages/core/src/logging/logger.js";
import { createRunWorkerHealth } from "./health";

// ✅ Nova importação dedicada para publish/subscribe direto
import Redis from "ioredis";

const logger = createLogger({ component: "run-worker" });

let redisPub: Redis | null = null;

function getRedisPublisher() {
  if (!redisPub) {
    redisPub = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  }
  return redisPub;
}

const redisChannelFor = (event: { runId?: string; tenantId?: string; workspaceId?: string }) =>
  `run-events:${event.tenantId ?? "unknown"}:${event.workspaceId ?? "unknown"}:${event.runId ?? "unknown"}`;


class RedisRunEventStore implements RunEventStore {
  async record(event: OrchestratorRunEvent): Promise<void> {
    try {
      const eventWithTimestamp = {
        ...event,
        createdAt: new Date().toISOString()
      };

      await getRedisPublisher().publish(
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

async function bootstrap() {
  const topology = resolveWorkerTopology(process.env);
  logger.info(
    {
      environmentId: topology.environmentId,
      serviceRole: topology.serviceRole,
      runQueueConsumerMode: topology.runQueueConsumerMode,
      runAtivoConsumerMode: topology.runAtivoConsumerMode,
      consumes: topology.consumes,
    },
    "worker.topology_resolved"
  );

  if (!topology.consumes.runs) {
    logger.info(
      { serviceRole: topology.serviceRole, mode: topology.runQueueConsumerMode },
      "run-worker.disabled"
    );
    return;
  }

  await consumeLegacyRunQueue(async (job: RunQueuePayload) => {
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

  createRunWorkerHealth("run-queue");
  logger.info("run-worker online: Consumindo somente runQueue");
}

bootstrap().catch((error) => {
  logger.error({ err: error }, "run-worker.bootstrap_failed");
  process.exit(1);
});
