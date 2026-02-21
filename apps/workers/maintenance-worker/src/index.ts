import "dotenv/config";
import {
  createLogger,
  MemorySyncJob,
  KnowledgeBackfillJob,
  type MemorySyncJobParams,
  type KnowledgeBackfillJobParams,
  enqueueMaintenanceJob,
  reconcileLedgerService,
  enableCriticalKillSwitch,
  addCriticalLatency,
  incrCriticalCounter,
  getRedisConnection,
  recordGuardrailAudit,
  registerAllActions,
  VersionedActionRegistry,
  reconcileWeb3Transactions,
} from "@eiah/core";
import { consumeMaintenanceJobs } from "@eiah/core";
import "./jobs/runAtivoUniversalJob";
import { getMemoryDeps, shutdownMemoryDeps } from "./services/memory.js";
import { getPrismaForTenant } from "@repo/db";
import Redis from "ioredis";
import { Queue } from "bullmq";
import { MaintenanceJobName, QueueName } from "@eiah/contracts";
const _prisma = getPrismaForTenant(
  process.env.TENANT_ID ?? "tenant-demo",
  process.env.WORKSPACE_ID ?? "workspace-demo"
);

// Ensure core action registry is initialized for runAtivo reporting actions.
registerAllActions(new VersionedActionRegistry());

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

async function incrementSchedulerMetric(
  tenantId: string,
  metric: "scheduled" | "completed" | "failed"
) {
  const redis = getSchedulerRedis();
  const metricKey = `metrics:maintenance:ledger_reconcile:${metric}:${tenantId}`;
  const nextValue = await redis.incr(metricKey);
  await redis.expire(metricKey, 60 * 60 * 24 * 7);
  workerLogger.info({ tenantId, metric, metricKey, value: nextValue }, "maintenance.metric.incremented");
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
  await incrementSchedulerMetric(tenantId, "scheduled");

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

function scheduleWeb3ReconciliationLoop() {
  const enabled = envFlag(process.env.WEB3_RECONCILE_ENABLED, false);
  if (!enabled) return;

  const tenantId = process.env.WEB3_RECONCILE_TENANT_ID ?? process.env.TENANT_ID;
  if (!tenantId) {
    workerLogger.warn("maintenance.web3_reconcile.missing_tenant");
    return;
  }

  const workspaceId = process.env.WEB3_RECONCILE_WORKSPACE_ID ?? process.env.WORKSPACE_ID ?? null;
  const intervalMs = Math.max(
    15_000,
    Number(process.env.WEB3_RECONCILE_INTERVAL_MS ?? "60000")
  );
  const limit = Math.max(10, Number(process.env.WEB3_RECONCILE_LIMIT ?? "100"));
  const lookbackHours = Math.max(1, Number(process.env.WEB3_RECONCILE_LOOKBACK_HOURS ?? "24"));
  const prisma = getPrismaForTenant(tenantId, workspaceId);

  const tick = async () => {
    try {
      const report = await reconcileWeb3Transactions({
        prisma: prisma as any,
        tenantId,
        limit,
        lookbackHours,
      });
      workerLogger.info(
        { tenantId, report },
        "maintenance.web3_reconcile.completed"
      );
    } catch (error) {
      workerLogger.warn(
        { tenantId, err: error },
        "maintenance.web3_reconcile.failed"
      );
    }
  };

  void tick();
  const handle = setInterval(() => {
    void tick();
  }, intervalMs);
  handle.unref?.();
}

async function bootstrap() {
  const { memoryService, snapshotStore } = getMemoryDeps();
  const memorySyncJob = new MemorySyncJob(memoryService, { snapshotStore });
  const knowledgeJob = new KnowledgeBackfillJob(memoryService);

  await scheduleLedgerReconcile();
  scheduleWeb3ReconciliationLoop();

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
        try {
          const prisma = getPrismaForTenant(
            params.tenantId,
            params.workspaceId ?? process.env.WORKSPACE_ID ?? "workspace-demo"
          );
          const reconcileStart = Date.now();
          const result = await reconcileLedgerService({
            tenantId: params.tenantId,
            since: params.since ? new Date(params.since) : undefined,
            until: params.until ? new Date(params.until) : undefined,
            limit: params.limit,
            actionTypes: params.actionTypes,
            persistReport: params.persistReport ?? true,
            prisma,
          });
          await addCriticalLatency("reconciler_latency", Date.now() - reconcileStart);
          await incrCriticalCounter("reconciliation_ok_total");

          const divergenceByType = result.divergences.reduce<Record<string, number>>(
            (acc, item) => {
              acc[item.type] = (acc[item.type] ?? 0) + 1;
              return acc;
            },
            {}
          );
          for (const [type, count] of Object.entries(divergenceByType)) {
            await incrCriticalCounter("reconciliation_divergence_total", { type }, count);
          }
          const divergenceCount = result.divergences.length;
          const totalChecked = result.checkedGuardrail + result.checkedScl;
          const threshold = Number(process.env.LEDGER_RECONCILE_KILLSWITCH_THRESHOLD ?? "0.2");
          const minDivergences = Number(process.env.LEDGER_RECONCILE_KILLSWITCH_MIN ?? "5");

          if (
            totalChecked > 0 &&
            divergenceCount >= (Number.isFinite(minDivergences) ? minDivergences : 5) &&
            divergenceCount / totalChecked >= (Number.isFinite(threshold) ? threshold : 0.2)
          ) {
            await enableCriticalKillSwitch({
              tenantId: params.tenantId,
              ttlMs: Number(process.env.KILL_SWITCH_TTL_MS ?? "900000"),
              reason: `ledger_reconcile_divergence_rate:${divergenceCount}/${totalChecked}`,
            });
            workerLogger.warn(
              {
                tenantId: params.tenantId,
                divergenceCount,
                totalChecked,
              },
              "maintenance.ledger_reconcile.killswitch_enabled"
            );
          }

          const webhook = process.env.LEDGER_RECONCILE_ALERT_WEBHOOK;
          if (webhook && divergenceCount > 0) {
            try {
              const payload = {
                tenantId: params.tenantId,
                workspaceId: params.workspaceId ?? null,
                divergenceCount,
                totalChecked,
                sample: result.divergences.slice(0, 10),
                runbook: "docs/runbooks/ledger-reconcile.md",
              };
              const controller = new AbortController();
              const timer = setTimeout(() => controller.abort(), 2000);
              await globalThis.fetch(webhook, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(payload),
                signal: controller.signal,
              });
              clearTimeout(timer);
            } catch (alertError) {
              workerLogger.warn(
                { err: alertError, tenantId: params.tenantId },
                "maintenance.ledger_reconcile.alert_failed"
              );
            }
          }
          workerLogger.info(
            {
              tenantId: params.tenantId,
              checkedGuardrail: result.checkedGuardrail,
              checkedScl: result.checkedScl,
              missingInScl: result.missingInScl.length,
              missingInGuardrail: result.missingInGuardrail.length,
              mismatchedTx: result.mismatchedTx.length,
              divergences: result.divergences.length,
            },
            "maintenance.ledger_reconcile.completed"
          );
          await incrementSchedulerMetric(params.tenantId, "completed");
        } catch (error) {
          const reason =
            error instanceof Error && error.message ? error.message.split(":")[0] : "unknown";
          await incrCriticalCounter("reconciliation_fail_total", { reason });
          await incrementSchedulerMetric(params.tenantId, "failed");
          throw error;
        }
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
