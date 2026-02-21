import { Router } from "express";
import { queueSnapshot, getRedisConnection, setCriticalGauge } from "@eiah/core";
import Redis from "ioredis";
import { collectPouSloSnapshot } from "../services/pouSlo";
import { getPrismaForTenant } from "@repo/db";

async function loadSchedulerMetrics() {
  const connection = getRedisConnection();
  const redis = new Redis({
    host: connection.host as string | undefined,
    port: typeof connection.port === "number" ? connection.port : undefined,
    username: connection.username as string | undefined,
    password: connection.password as string | undefined,
    db: typeof connection.db === "number" ? connection.db : undefined,
    tls: connection.tls ?? undefined,
  });

  const metrics: Array<{ tenantId: string; metric: string; value: number }> = [];
  let cursor = "0";
  do {
    const [nextCursor, keys] = await redis.scan(cursor, "MATCH", "metrics:maintenance:ledger_reconcile:*", "COUNT", 200);
    cursor = nextCursor;
    for (const key of keys) {
      const value = Number(await redis.get(key));
      const parts = key.split(":");
      const metric = parts[3];
      const tenantId = parts[4] ?? "unknown";
      metrics.push({
        tenantId,
        metric,
        value: Number.isFinite(value) ? value : 0,
      });
    }
  } while (cursor !== "0");

  await redis.quit().catch(() => undefined);
  return metrics;
}

async function loadCriticalMetrics() {
  const connection = getRedisConnection();
  const redis = new Redis({
    host: connection.host as string | undefined,
    port: typeof connection.port === "number" ? connection.port : undefined,
    username: connection.username as string | undefined,
    password: connection.password as string | undefined,
    db: typeof connection.db === "number" ? connection.db : undefined,
    tls: connection.tls ?? undefined,
  });

  const metrics: Array<{
    metric: string;
    value: number;
    labels: Record<string, string>;
  }> = [];

  let cursor = "0";
  do {
    const [nextCursor, keys] = await redis.scan(
      cursor,
      "MATCH",
      "metrics:critical:*",
      "COUNT",
      500
    );
    cursor = nextCursor;
    for (const key of keys) {
      const parts = key.split(":");
      if (parts.length < 4) continue;
      const type = parts[2];
      if (type !== "counter" && type !== "gauge") continue;
      const metric = parts[3];
      const labels: Record<string, string> = {};
      for (let i = 4; i + 1 < parts.length; i += 2) {
        labels[parts[i]] = parts[i + 1];
      }
      const value = Number(await redis.get(key));
      metrics.push({
        metric,
        labels,
        value: Number.isFinite(value) ? value : 0,
      });
    }
  } while (cursor !== "0");

  await redis.quit().catch(() => undefined);
  return metrics;
}

export const metricsPromRouter = Router();

metricsPromRouter.get("/", async (_req, res) => {
  const queues = await queueSnapshot();
  const scheduler = await loadSchedulerMetrics();
  const critical = await loadCriticalMetrics();
  const prisma = getPrismaForTenant(
    process.env.TENANT_ID ?? "tenant-demo",
    process.env.WORKSPACE_ID ?? "workspace-demo"
  );
  const pouSlo = await collectPouSloSnapshot({ criticalMetrics: critical, prisma });

  let output = "";

  for (const [queueName, metric] of Object.entries(queues)) {
    for (const [field, value] of Object.entries(metric)) {
      if (typeof value === "object" && value !== null) {
        for (const [subField, subValue] of Object.entries(value)) {
          const key = `queue_${queueName}_${field}_${subField}`.replace(/[^a-z0-9_]/gi, "_");
          output += `${key} ${subValue}\n`;
        }
      } else {
        const key = `queue_${queueName}_${field}`.replace(/[^a-z0-9_]/gi, "_");
        output += `${key} ${value}\n`;
      }
    }
  }

  const actionQueue = queues.actionQueue?.queue ?? null;
  if (actionQueue) {
    const backlog =
      (actionQueue.waiting ?? 0) +
      (actionQueue.active ?? 0) +
      (actionQueue.delayed ?? 0);
    output += `commit_worker_backlog ${backlog}\n`;
    await setCriticalGauge("bullmq_waiting", actionQueue.waiting ?? 0, { queue: "actionQueue" });
    await setCriticalGauge("bullmq_active", actionQueue.active ?? 0, { queue: "actionQueue" });
    await setCriticalGauge("bullmq_delayed", actionQueue.delayed ?? 0, { queue: "actionQueue" });
    await setCriticalGauge("bullmq_failed", actionQueue.failed ?? 0, { queue: "actionQueue" });
  }

  for (const row of scheduler) {
    const key = `maintenance_ledger_reconcile_${row.metric}_total`.replace(/[^a-z0-9_]/gi, "_");
    output += `${key}{tenant_id="${row.tenantId}"} ${row.value}\n`;
  }

  for (const row of critical) {
    const key = row.metric.replace(/[^a-z0-9_]/gi, "_");
    const labels = Object.entries(row.labels)
      .map(([k, v]) => `${k}="${v}"`)
      .join(",");
    if (labels) {
      output += `${key}{${labels}} ${row.value}\n`;
    } else {
      output += `${key} ${row.value}\n`;
    }
  }

  output += `pou_endpoint_availability ${pouSlo.availability}\n`;
  if (pouSlo.p95Ms !== null) {
    output += `pou_endpoint_latency_p95_ms ${pouSlo.p95Ms}\n`;
  }
  if (pouSlo.p99Ms !== null) {
    output += `pou_endpoint_latency_p99_ms ${pouSlo.p99Ms}\n`;
  }
  output += `pou_reconciliation_mismatch_rate ${pouSlo.mismatchRate}\n`;
  output += `pou_reconciliation_mismatch_total ${pouSlo.mismatchCount}\n`;
  output += `pou_reconciliation_checked_total ${pouSlo.checkedTotal}\n`;
  output += `pou_backlog_pending_total ${pouSlo.backlogPending}\n`;
  output += `pou_backlog_pending_trust_total ${pouSlo.backlogPendingTrust}\n`;
  output += `pou_backlog_total ${pouSlo.backlogTotal}\n`;
  output += `pou_alert_availability ${pouSlo.alerts.availability ? 1 : 0}\n`;
  output += `pou_alert_latency_p95 ${pouSlo.alerts.latencyP95 ? 1 : 0}\n`;
  output += `pou_alert_latency_p99 ${pouSlo.alerts.latencyP99 ? 1 : 0}\n`;
  output += `pou_alert_mismatch_rate ${pouSlo.alerts.mismatchRate ? 1 : 0}\n`;
  output += `pou_alert_backlog ${pouSlo.alerts.backlog ? 1 : 0}\n`;
  output += `pou_alert_any ${pouSlo.alerts.any ? 1 : 0}\n`;

  await setCriticalGauge("pou_endpoint_availability", pouSlo.availability);
  if (pouSlo.p95Ms !== null) await setCriticalGauge("pou_endpoint_latency_p95_ms", pouSlo.p95Ms);
  if (pouSlo.p99Ms !== null) await setCriticalGauge("pou_endpoint_latency_p99_ms", pouSlo.p99Ms);
  await setCriticalGauge("pou_reconciliation_mismatch_rate", pouSlo.mismatchRate);
  await setCriticalGauge("pou_backlog_total", pouSlo.backlogTotal);
  await setCriticalGauge("pou_alert_any", pouSlo.alerts.any ? 1 : 0);

  res.set("Content-Type", "text/plain");
  res.send(output);
});
