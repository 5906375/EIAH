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
import { ConsoleTelemetryBridge } from "../../../../packages/core/src/orchestrator/telemetryBridge.js";
import {
  CompositeRunEventStoreWithOutbox,
  PrismaRunEventStore,
  RedisRunEventOutbox
} from "../../../../packages/core/src/events/runEventPublisher.js";
import { assertTenantAccess } from "../../../../packages/core/src/security/rbac.js";
import {
  rateLimit,
  createFixedWindowRateLimiter,
  tenantRateLimitKey,
  ensureRunApproval,
  requiresApprovalFromRequest
} from "@eiah/core";

// IMPORT DIRETO (porque @eiah/core/logging não está exportado via package.json)
import { createLogger } from "../../../../packages/core/src/logging/logger.js";
import { createRunWorkerHealth } from "./health";

const logger = createLogger({ component: "run-worker" });
const LOCK_LEASE_TTL_MS = 15 * 60 * 1000;
const LOCK_RENEW_INTERVAL_MS = 60 * 1000;
const holderId = `${process.pid}-${randomUUID()}`;

type ApprovalCriticality = "low" | "medium" | "high" | "critical" | "unknown";

function resolveApprovalCriticality(runRecord: { request?: unknown } | null): ApprovalCriticality {
  const request =
    runRecord && typeof runRecord.request === "object" && runRecord.request !== null
      ? (runRecord.request as { metadata?: Record<string, unknown> })
      : null;
  const metadata = request?.metadata ?? null;
  const raw =
    typeof metadata?.criticality === "string"
      ? metadata.criticality
      : typeof (metadata as any)?.intent?.sensitivity === "string"
      ? ((metadata as any).intent as { sensitivity?: string }).sensitivity
      : null;
  const normalized = raw ? raw.trim().toLowerCase() : "unknown";
  if (normalized === "low" || normalized === "medium" || normalized === "high" || normalized === "critical") {
    return normalized;
  }
  return "unknown";
}

// 🔹 Conexão centralizada para BullMQ (vinda do core)
const redisConnection = getRedisConnection();

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

async function claimRunExecution(db: PrismaClient, runId: string) {
  const claimed = await db.run.updateMany({
    where: { id: runId, status: "pending" },
    data: { status: "running" },
  });
  return claimed.count === 1;
}

async function claimRunLock(
  db: PrismaClient,
  tenantId: string,
  workspaceId: string,
  runId: string
) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + LOCK_LEASE_TTL_MS);

  try {
    await db.runExecutionLock.create({
      data: {
        tenantId,
        workspaceId,
        runId,
        holderId,
        acquiredAt: now,
        expiresAt,
        attempt: 1,
      },
    });
    return { ok: true, attempt: 1, acquiredAt: now, expiresAt };
  } catch (err: any) {
    if (err?.code !== "P2002") throw err;
  }

  const existing = await db.runExecutionLock.findUnique({
    where: {
      tenantId_workspaceId_runId: {
        tenantId,
        workspaceId,
        runId,
      },
    },
  });
  if (!existing) return { ok: false } as const;

  if (existing.expiresAt && existing.expiresAt.getTime() < Date.now()) {
    const attempt = (existing.attempt ?? 1) + 1;
    const claimed = await db.runExecutionLock.updateMany({
      where: {
        tenantId,
        workspaceId,
        runId,
        expiresAt: existing.expiresAt,
      },
      data: {
        holderId,
        acquiredAt: now,
        expiresAt,
        attempt,
      },
    });
    if (claimed.count === 1) {
      return { ok: true, attempt, acquiredAt: now, expiresAt };
    }
  }

  return { ok: false } as const;
}

async function releaseRunLock(
  db: PrismaClient,
  tenantId: string,
  workspaceId: string,
  runId: string
) {
  await db.runExecutionLock.deleteMany({
    where: { tenantId, workspaceId, runId, holderId },
  });
}

async function renewRunLock(
  db: PrismaClient,
  tenantId: string,
  workspaceId: string,
  runId: string
) {
  const expiresAt = new Date(Date.now() + LOCK_LEASE_TTL_MS);
  const updated = await db.runExecutionLock.updateMany({
    where: { tenantId, workspaceId, runId, holderId },
    data: { expiresAt },
  });
  return updated.count === 1;
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

  const lockResult = await claimRunLock(db, input.tenantId, input.workspaceId, input.runId);
  if (!lockResult.ok) {
    logger.info(
      { runId: input.runId, tenantId: input.tenantId, workspaceId: input.workspaceId },
      "run-worker.lock_skip"
    );
    await db.$disconnect().catch(() => undefined);
    return;
  }

  const ok = await claimRunExecution(db, input.runId);
  if (!ok) {
    logger.info(
      { runId: input.runId, tenantId: input.tenantId, workspaceId: input.workspaceId },
      "run-worker.idempotency_skip"
    );
    await releaseRunLock(db, input.tenantId, input.workspaceId, input.runId);
    await db.$disconnect().catch(() => undefined);
    return;
  }

  const prismaEventStore = new PrismaRunEventStore(db);
  const outbox = new RedisRunEventOutbox(prismaEventStore);
  const eventStore = new CompositeRunEventStoreWithOutbox([prismaEventStore], outbox);
  const lockAcquiredAt = lockResult.acquiredAt ?? new Date();
  const lockAttempt = lockResult.attempt ?? 1;

  await eventStore.record({
    runId: input.runId,
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    type: "run.lock.acquired",
    payload: {
      holderId,
      attempt: lockAttempt,
      acquiredAt: lockAcquiredAt.toISOString(),
      expiresAt: lockResult.expiresAt?.toISOString() ?? null,
    },
  });

  const renewTimer = setInterval(() => {
    renewRunLock(db, input.tenantId, input.workspaceId, input.runId).catch((err) => {
      logger.warn({ err, runId: input.runId }, "run-worker.lock_renew_failed");
    });
  }, LOCK_RENEW_INTERVAL_MS);

  try {
    const runRecord = await db.run.findUnique({ where: { id: input.runId } });
    if (requiresApprovalFromRequest(runRecord?.request)) {
      const approvalCheck = await ensureRunApproval({
        prisma: db,
        runId: input.runId,
        tenantId: input.tenantId,
        workspaceId: input.workspaceId,
      });
      if (!approvalCheck.ok) {
        const criticality = resolveApprovalCriticality(runRecord);
        await updateRunStatus(db, input.runId, "blocked");
        await eventStore.record({
          runId: input.runId,
          tenantId: input.tenantId,
          workspaceId: input.workspaceId,
          type: "run.blocked.guardrails",
          payload: {
            reason: approvalCheck.reason,
            criticality,
            planHash: approvalCheck.planHash ?? null,
            approvedPlanHash: approvalCheck.approvedPlanHash ?? null,
            approverId: approvalCheck.approverId ?? null,
            trustSnapshot: approvalCheck.trustSnapshot ?? null,
            approvalId: approvalCheck.approval?.id ?? null,
          },
        });
        await releaseRunLock(db, input.tenantId, input.workspaceId, input.runId);
        await db.$disconnect().catch(() => undefined);
        clearInterval(renewTimer);
        return;
      }
    }
  } catch (error) {
    logger.warn({ err: error, runId: input.runId }, "run-worker.approval_check_failed");
  }

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
    clearInterval(renewTimer);
    await eventStore.record({
      runId: input.runId,
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      type: "run.lock.released",
      payload: {
        holderId,
        attempt: lockAttempt,
        durationMs: Date.now() - lockAcquiredAt.getTime(),
      },
    });
    await releaseRunLock(db, input.tenantId, input.workspaceId, input.runId);
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
