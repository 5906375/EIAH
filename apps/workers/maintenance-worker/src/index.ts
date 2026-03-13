import "dotenv/config";
import {
  createLogger,
  MemorySyncJob,
  KnowledgeBackfillJob,
  type MemorySyncJobParams,
  type KnowledgeBackfillJobParams,
  enqueueMaintenanceJob,
  generateMonthlyInvoice,
  generateMonthlyInvoicesForAllTenants,
  reconcileLedgerService,
  getRedisConnection,
  recordGuardrailAudit,
  resolvePreviousCalendarMonth,
} from "@eiah/core";
import { consumeMaintenanceJobs } from "@eiah/core";
import "./jobs/runAtivoUniversalJob";
import { getMemoryDeps, shutdownMemoryDeps } from "./services/memory.js";
import { getPrismaForTenant, prismaGlobal } from "@repo/db";
import Redis from "ioredis";
import { Queue } from "bullmq";
import { MaintenanceJobName, QueueName } from "@eiah/contracts";
const prisma = getPrismaForTenant(
  process.env.TENANT_ID ?? "tenant-demo",
  process.env.WORKSPACE_ID ?? "workspace-demo"
);


const workerLogger = createLogger({ component: "maintenance-worker" });
const schedulerInstanceId = `${process.pid}-${Date.now()}`;
let schedulerRedis: Redis | null = null;

type LedgerReconcileJobParams = {
  tenantId: string;
  workspaceId?: string | null;
  since?: string;
  until?: string;
  limit?: number;
  actionTypes?: string[];
  persistReport?: boolean;
};

type InvoiceGenerateJobParams = {
  tenantId?: string;
  periodStart?: string;
  periodEnd?: string;
  referenceDate?: string;
  actor?: "scheduler" | "manual" | "api";
};

function envFlag(value: string | undefined, fallback = false) {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "on";
}

function getSchedulerRedis() {
  if (!schedulerRedis) {
    const connection = getRedisConnection();
    schedulerRedis = new Redis({
      host: connection.host as string | undefined,
      port: typeof connection.port === "number" ? connection.port : undefined,
      username: connection.username as string | undefined,
      password: connection.password as string | undefined,
      db: typeof connection.db === "number" ? connection.db : undefined,
      tls: connection.tls ?? undefined,
    });
  }
  return schedulerRedis;
}

async function acquireSchedulerLock(lockKey: string, ttlMs: number) {
  const redis = getSchedulerRedis();
  const result = await redis.set(lockKey, schedulerInstanceId, "PX", ttlMs, "NX");
  return result === "OK";
}

async function incrementLockSkipMetric(tenantId: string, lockKey: string) {
  const redis = getSchedulerRedis();
  const metricKey = `metrics:maintenance:ledger_reconcile:lock_skipped:${tenantId}`;
  const nextValue = await redis.incr(metricKey);
  await redis.expire(metricKey, 60 * 60 * 24 * 7);
  workerLogger.info(
    { tenantId, lockKey, metricKey, value: nextValue },
    "maintenance.ledger_reconcile.lock_skip_metric"
  );
}

async function cleanupLedgerReconcileRepeatables(params: {
  tenantId: string;
  currentJobId?: string;
  enabled: boolean;
}) {
  const queueName = process.env.MAINTENANCE_QUEUE_NAME ?? QueueName.MAINTENANCE;
  const jobName = process.env.MAINTENANCE_QUEUE_JOB_NAME ?? MaintenanceJobName;
  const connection = getRedisConnection();
  const queue = new Queue(queueName, { connection });

  try {
    const repeatables = await queue.getRepeatableJobs();
    const stale = repeatables.filter((job) => {
      if (job.name !== jobName) return false;
      if (!job.id || !job.id.startsWith("ledger-reconcile:")) return false;
      if (!params.enabled) return true;
      return params.currentJobId ? job.id !== params.currentJobId : true;
    });

    for (const job of stale) {
      await queue.removeRepeatableByKey(job.key);
    }

    if (stale.length > 0) {
      try {
        const prisma = getPrismaForTenant(
          params.tenantId,
          process.env.RECONCILE_LEDGER_WORKSPACE_ID ?? process.env.WORKSPACE_ID ?? null
        );
        await recordGuardrailAudit({
          prisma: prisma as any,
          tenantId: params.tenantId,
          workspaceId: process.env.RECONCILE_LEDGER_WORKSPACE_ID ?? process.env.WORKSPACE_ID ?? null,
          eventType: "maintenance.ledger_reconcile.cleanup",
          severity: "info",
          message: "Removed stale ledger reconcile repeatable jobs.",
          metadata: {
            queueName,
            jobName,
            removed: stale.length,
            removedIds: stale.map((entry) => entry.id),
            instanceId: schedulerInstanceId,
          },
        });
      } catch (error) {
        workerLogger.warn(
          { err: error, tenantId: params.tenantId },
          "maintenance.ledger_reconcile.cleanup_audit_failed"
        );
      }
    }

    workerLogger.info(
      { tenantId: params.tenantId, removed: stale.length },
      "maintenance.ledger_reconcile.cleanup_completed"
    );
  } finally {
    await queue.close().catch(() => undefined);
  }
}

async function cleanupInvoiceGenerateRepeatables(params: {
  currentJobId?: string;
  enabled: boolean;
}) {
  const queueName = process.env.MAINTENANCE_QUEUE_NAME ?? QueueName.MAINTENANCE;
  const jobName = process.env.MAINTENANCE_QUEUE_JOB_NAME ?? MaintenanceJobName;
  const connection = getRedisConnection();
  const queue = new Queue(queueName, { connection });

  try {
    const repeatables = await queue.getRepeatableJobs();
    const stale = repeatables.filter((job) => {
      if (job.name !== jobName) return false;
      if (!job.id || !job.id.startsWith("invoice-generate:")) return false;
      if (!params.enabled) return true;
      return params.currentJobId ? job.id !== params.currentJobId : true;
    });

    for (const job of stale) {
      await queue.removeRepeatableByKey(job.key);
    }

    workerLogger.info(
      { removed: stale.length },
      "maintenance.invoice_generate.cleanup_completed"
    );
  } finally {
    await queue.close().catch(() => undefined);
  }
}

async function scheduleLedgerReconcile() {
  const enabled = envFlag(
    process.env.RECONCILE_LEDGER_ENABLED,
    process.env.NODE_ENV === "production"
  );

  const tenantId = process.env.RECONCILE_LEDGER_TENANT_ID ?? process.env.TENANT_ID;
  if (!tenantId) {
    workerLogger.warn("maintenance.ledger_reconcile.missing_tenant");
    return;
  }

  await cleanupLedgerReconcileRepeatables({ tenantId, currentJobId: enabled ? `ledger-reconcile:${tenantId}` : undefined, enabled });

  if (!enabled) {
    workerLogger.info({ tenantId }, "maintenance.ledger_reconcile.disabled");
    return;
  }

  const intervalMinutes = Number(process.env.RECONCILE_LEDGER_INTERVAL_MINUTES ?? "60");
  const intervalMs = Number.isFinite(intervalMinutes) && intervalMinutes > 0
    ? intervalMinutes * 60 * 1000
    : 60 * 60 * 1000;

  const lockKey = `maintenance:ledger-reconcile:scheduler:${tenantId}`;
  const lockTtlMs = Math.max(intervalMs * 2, 10 * 60 * 1000);
  const lockAcquired = await acquireSchedulerLock(lockKey, lockTtlMs);
  if (!lockAcquired) {
    workerLogger.info(
      { tenantId, lockKey },
      "maintenance.ledger_reconcile.scheduler_lock_skipped"
    );
    await incrementLockSkipMetric(tenantId, lockKey);
    return;
  }

  const jobId = `ledger-reconcile:${tenantId}`;
  await enqueueMaintenanceJob(
    {
      kind: "ledger-reconcile",
      params: {
        tenantId,
        workspaceId: process.env.RECONCILE_LEDGER_WORKSPACE_ID ?? process.env.WORKSPACE_ID ?? null,
        persistReport: true,
      },
    },
    {
      jobId,
      repeat: { every: intervalMs },
    }
  );

  try {
    const prisma = getPrismaForTenant(
      tenantId,
      process.env.RECONCILE_LEDGER_WORKSPACE_ID ?? process.env.WORKSPACE_ID ?? null
    );
    await recordGuardrailAudit({
      prisma: prisma as any,
      tenantId,
      workspaceId: process.env.RECONCILE_LEDGER_WORKSPACE_ID ?? process.env.WORKSPACE_ID ?? null,
      eventType: "maintenance.ledger_reconcile.scheduled",
      severity: "info",
      message: "Ledger reconcile scheduler registered.",
      metadata: {
        intervalMinutes: intervalMs / 60000,
        lockKey,
        lockTtlMs,
        jobId,
        instanceId: schedulerInstanceId,
      },
    });
  } catch (error) {
    workerLogger.warn(
      { err: error, tenantId },
      "maintenance.ledger_reconcile.scheduler_audit_failed"
    );
  }

  workerLogger.info(
    { tenantId, intervalMinutes: intervalMs / 60000 },
    "maintenance.ledger_reconcile.scheduled"
  );
}

async function scheduleMonthlyInvoiceGeneration() {
  const enabled = envFlag(
    process.env.INVOICE_GENERATE_ENABLED,
    process.env.NODE_ENV === "production"
  );
  const jobId = `invoice-generate:${process.env.INVOICE_GENERATE_TENANT_ID ?? "all-tenants"}`;

  await cleanupInvoiceGenerateRepeatables({
    currentJobId: enabled ? jobId : undefined,
    enabled,
  });

  if (!enabled) {
    workerLogger.info("maintenance.invoice_generate.disabled");
    return;
  }

  const cronPattern = (process.env.INVOICE_GENERATE_CRON ?? "0 2 1 * *").trim();
  const timezone = (process.env.INVOICE_GENERATE_TIMEZONE ?? "UTC").trim();
  const lockKey = `maintenance:invoice-generate:scheduler:${jobId}`;
  const lockAcquired = await acquireSchedulerLock(lockKey, 8 * 60 * 60 * 1000);
  if (!lockAcquired) {
    workerLogger.info({ lockKey }, "maintenance.invoice_generate.scheduler_lock_skipped");
    return;
  }

  await enqueueMaintenanceJob(
    {
      kind: "invoice-generate",
      params: {
        tenantId: process.env.INVOICE_GENERATE_TENANT_ID ?? undefined,
        actor: "scheduler",
      },
    },
    {
      jobId,
      repeat: {
        pattern: cronPattern,
        tz: timezone,
      },
    }
  );

  workerLogger.info(
    { jobId, cronPattern, timezone, tenantId: process.env.INVOICE_GENERATE_TENANT_ID ?? null },
    "maintenance.invoice_generate.scheduled"
  );
}

async function bootstrap() {
  const { memoryService, snapshotStore } = getMemoryDeps();
  const memorySyncJob = new MemorySyncJob(memoryService, { snapshotStore });
  const knowledgeJob = new KnowledgeBackfillJob(memoryService);

  await scheduleLedgerReconcile();
  await scheduleMonthlyInvoiceGeneration();

  await consumeMaintenanceJobs(async (job) => {
    switch (job.kind) {
      case "memory-sync": {
        const params = job.params as MemorySyncJobParams;
        workerLogger.info(
          {
            scope: params.scope,
          },
          "maintenance.memory_sync.started"
        );
        await memorySyncJob.run(params);
        workerLogger.info(
          {
            scope: params.scope,
          },
          "maintenance.memory_sync.completed"
        );
        break;
      }
      case "knowledge-backfill": {
        const params = job.params as KnowledgeBackfillJobParams;
        workerLogger.info(
          {
            scope: params.scope,
          },
          "maintenance.knowledge_backfill.started"
        );
        await knowledgeJob.run(params);
        workerLogger.info(
          {
            scope: params.scope,
          },
          "maintenance.knowledge_backfill.completed"
        );
        break;
      }
      case "ledger-reconcile": {
        const params = job.params as LedgerReconcileJobParams;
        if (!params.tenantId) {
          workerLogger.warn({ job }, "maintenance.ledger_reconcile.missing_tenant");
          break;
        }
        const prisma = getPrismaForTenant(
          params.tenantId,
          params.workspaceId ?? process.env.WORKSPACE_ID ?? "workspace-demo"
        );
        const result = await reconcileLedgerService({
          tenantId: params.tenantId,
          since: params.since ? new Date(params.since) : undefined,
          until: params.until ? new Date(params.until) : undefined,
          limit: params.limit,
          actionTypes: params.actionTypes,
          persistReport: params.persistReport ?? true,
          prisma,
        });
        workerLogger.info(
          {
            tenantId: params.tenantId,
            checkedGuardrail: result.checkedGuardrail,
            checkedScl: result.checkedScl,
            missingInScl: result.missingInScl.length,
            missingInGuardrail: result.missingInGuardrail.length,
            mismatchedTx: result.mismatchedTx.length,
          },
          "maintenance.ledger_reconcile.completed"
        );
        break;
      }
      case "invoice-generate": {
        const params = job.params as InvoiceGenerateJobParams;
        const periodStart = params.periodStart ? new Date(params.periodStart) : undefined;
        const periodEnd = params.periodEnd ? new Date(params.periodEnd) : undefined;
        const inferred = resolvePreviousCalendarMonth(
          params.referenceDate ? new Date(params.referenceDate) : new Date()
        );

        if (params.tenantId) {
          const result = await generateMonthlyInvoice(prisma as any, {
            tenantId: params.tenantId,
            periodStart: periodStart ?? inferred.periodStart,
            periodEnd: periodEnd ?? inferred.periodEnd,
            actor: params.actor ?? "scheduler",
          });
          workerLogger.info(
            {
              tenantId: params.tenantId,
              invoiceId: result.invoice.id,
              totalCents: result.invoice.totalCents,
              period: result.periodStart.toISOString().slice(0, 7),
              idempotent: result.idempotent,
            },
            "maintenance.invoice_generate.completed_single"
          );
          break;
        }

        const result = await generateMonthlyInvoicesForAllTenants(prismaGlobal as any, {
          periodStart: periodStart ?? inferred.periodStart,
          periodEnd: periodEnd ?? inferred.periodEnd,
          actor: params.actor ?? "scheduler",
        });
        workerLogger.info(
          {
            period: result.periodStart.toISOString().slice(0, 7),
            processed: result.processed,
            generated: result.generated,
            idempotent: result.idempotent,
            failed: result.failed.length,
          },
          "maintenance.invoice_generate.completed_batch"
        );
        break;
      }
      default:
        workerLogger.warn(
          {
            job,
          },
          "maintenance.unknown_job"
        );
    }
  });
}

bootstrap().catch((error) => {
  workerLogger.error(
    {
      err: error,
    },
    "maintenance.worker_failed"
  );
  void shutdownMemoryDeps().finally(() => process.exit(1));
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    workerLogger.info({ signal }, "maintenance.worker_shutdown");
    if (schedulerRedis) {
      schedulerRedis.quit().catch(() => undefined);
      schedulerRedis = null;
    }
    void shutdownMemoryDeps().finally(() => process.exit(0));
  });
}
