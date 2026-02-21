import { Router } from "express";
import { queueSnapshot, getRedisConnection } from "@eiah/core";
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

  const metrics: Record<string, Record<string, number>> = {};
  let cursor = "0";
  do {
    const [nextCursor, keys] = await redis.scan(cursor, "MATCH", "metrics:maintenance:ledger_reconcile:*", "COUNT", 200);
    cursor = nextCursor;
    for (const key of keys) {
      const value = Number(await redis.get(key));
      const parts = key.split(":");
      const metric = parts[3];
      const tenantId = parts[4] ?? "unknown";
      if (!metrics[tenantId]) metrics[tenantId] = {};
      metrics[tenantId][metric] = Number.isFinite(value) ? value : 0;
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

export const metricsRouter = Router();

metricsRouter.get("/", async (_req, res) => {
  const queues = await queueSnapshot();
  const scheduler = await loadSchedulerMetrics();
  const critical = await loadCriticalMetrics();
  const prisma = getPrismaForTenant(
    process.env.TENANT_ID ?? "tenant-demo",
    process.env.WORKSPACE_ID ?? "workspace-demo"
  );
  const pouSlo = await collectPouSloSnapshot({ criticalMetrics: critical, prisma });

  return res.json({
    ok: true,
    queues,
    scheduler,
    pouSlo,
    timestamp: Date.now(),
  });
});
