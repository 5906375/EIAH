import { PrismaClient } from "@prisma/client";
import { probeRunQueue } from "@eiah/core/queue/runQueue";
import { probeActionQueue } from "@eiah/core/queue/actionQueue";

const prisma = new PrismaClient();

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
  };

  let status: "ok" | "degraded" = "ok";

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database.healthy = true;
  } catch (error) {
    checks.database = {
      healthy: false,
      error: error instanceof Error ? error.message : String(error),
    };
    status = "degraded";
  }

  try {
    const runQueue = await probeRunQueue();
    checks.runQueue = {
      healthy: true,
      counts: runQueue,
    };
  } catch (error) {
    checks.runQueue = {
      healthy: false,
      error: error instanceof Error ? error.message : String(error),
    };
    status = "degraded";
  }

  try {
    const actionQueue = await probeActionQueue();
    checks.actionQueue = {
      healthy: true,
      counts: actionQueue,
    };
  } catch (error) {
    checks.actionQueue = {
      healthy: false,
      error: error instanceof Error ? error.message : String(error),
    };
    status = "degraded";
  }

  return {
    status,
    checks,
    timestamp: new Date().toISOString(),
  };
}
