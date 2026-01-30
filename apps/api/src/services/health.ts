import { prismaGlobal } from "@repo/db";
import { queueSnapshot } from "@eiah/core";

type HealthCheckStatus = {
  healthy: boolean;
  error?: string;
  counts?: unknown;
};

export async function collectHealth() {
  const checks: Record<string, HealthCheckStatus> = {
    database: { healthy: false },
    runQueue: { healthy: false },
    actionQueue: { healthy: false },
    maintenanceQueue: { healthy: false },
  };

  let status: "ok" | "degraded" = "ok";

  try {
    await prismaGlobal.$queryRaw`SELECT 1`;
    checks.database.healthy = true;
  } catch (error) {
    checks.database = {
      healthy: false,
      error: error instanceof Error ? error.message : String(error),
    };
    status = "degraded";
  }

  const snapshot = await queueSnapshot();
  checks.runQueue = { healthy: true, counts: snapshot.runQueue };
  checks.actionQueue = { healthy: true, counts: snapshot.actionQueue };
  checks.maintenanceQueue = { healthy: true, counts: snapshot.maintenanceQueue };

  return {
    status,
    checks,
    timestamp: new Date().toISOString(),
  };
}

export async function collectQueueHealth() {
  const checks: Record<string, HealthCheckStatus> = {
    runQueue: { healthy: false },
    actionQueue: { healthy: false },
    maintenanceQueue: { healthy: false },
  };
  let status: "ok" | "degraded" = "ok";

  const snapshot = await queueSnapshot();
  checks.runQueue = { healthy: true, counts: snapshot.runQueue };
  checks.actionQueue = { healthy: true, counts: snapshot.actionQueue };
  checks.maintenanceQueue = { healthy: true, counts: snapshot.maintenanceQueue };

  return {
    status,
    checks,
    timestamp: new Date().toISOString(),
  };
}
