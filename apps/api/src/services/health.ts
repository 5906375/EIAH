import { prismaGlobal } from "@repo/db";
import { queueSnapshot } from "@eiah/core";
import { probeSignerHealth } from "./signerHealth";

type HealthCheckStatus = {
  healthy: boolean;
  error?: string;
  counts?: unknown;
  state?: string;
  latencyMs?: number;
  provider?: string;
  status?: string;
  timestamp?: string;
};

export async function collectHealth() {
  const checks: Record<string, HealthCheckStatus> = {
    database: { healthy: false },
    runQueue: { healthy: false },
    actionQueue: { healthy: false },
    maintenanceQueue: { healthy: false },
    signer: { healthy: false },
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

  try {
    const signer = await probeSignerHealth();
    checks.signer = {
      healthy: signer.state === "OK",
      state: signer.state,
      provider: signer.provider,
      latencyMs: signer.latencyMs,
      status: signer.status,
      timestamp: signer.timestamp,
      error: signer.error ?? undefined,
    };
    if (signer.state !== "OK") {
      status = "degraded";
    }
  } catch (error) {
    checks.signer = {
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

export async function collectQueueHealth() {
  const checks: Record<string, HealthCheckStatus> = {
    runQueue: { healthy: false },
    actionQueue: { healthy: false },
    maintenanceQueue: { healthy: false },
    signer: { healthy: false },
  };
  const status: "ok" | "degraded" = "ok";

  const snapshot = await queueSnapshot();
  checks.runQueue = { healthy: true, counts: snapshot.runQueue };
  checks.actionQueue = { healthy: true, counts: snapshot.actionQueue };
  checks.maintenanceQueue = { healthy: true, counts: snapshot.maintenanceQueue };
  try {
    const signer = await probeSignerHealth();
    checks.signer = {
      healthy: signer.state === "OK",
      state: signer.state,
      provider: signer.provider,
      latencyMs: signer.latencyMs,
      status: signer.status,
      timestamp: signer.timestamp,
      error: signer.error ?? undefined,
    };
  } catch (error) {
    checks.signer = {
      healthy: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  return {
    status,
    checks,
    timestamp: new Date().toISOString(),
  };
}
