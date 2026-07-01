import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type HealthCheckStatus = {
  healthy: boolean;
  error?: string;
  counts?: unknown;
};

// Worker ownership state — populated by index.ts after lease acquisition.
// Exposed via /api/health without leaking secrets (no Redis credentials).
type WorkerOwnershipEntry = {
  owned: boolean;
  ownerId: string | null;
  acquiredAt: string | null;
};

const _workerOwnership: Record<string, WorkerOwnershipEntry> = {};

export function setWorkerOwnershipState(queue: string, state: WorkerOwnershipEntry): void {
  _workerOwnership[queue] = state;
}

export function getWorkerOwnershipState(): Record<string, WorkerOwnershipEntry> {
  return { ..._workerOwnership };
}

export type PublicHealthDependencyStatus = "connected" | "disconnected" | "ready" | "error";
export type PublicHealthStatus = "healthy" | "degraded" | "unhealthy";

export type PublicHealthReport = {
  status: PublicHealthStatus;
  timestamp: string;
  environment: "production" | "staging";
  version: string;
  dependencies: {
    database: Extract<PublicHealthDependencyStatus, "connected" | "disconnected">;
    agentRuntime: Extract<PublicHealthDependencyStatus, "ready" | "error">;
  };
  workerOwnership?: Record<string, { owned: boolean; ownerId: string | null; acquiredAt: string | null }>;
};

type HealthDependencyProbeResult = {
  ok: boolean;
  error?: string;
};

function resolvePackageVersion() {
  const envVersion = process.env.BUILD_VERSION?.trim() || process.env.APP_VERSION?.trim();
  if (envVersion) return envVersion;

  try {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const packageJsonPath = path.resolve(currentDir, "../../package.json");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { version?: string };
    if (typeof packageJson.version === "string" && packageJson.version.trim().length > 0) {
      return packageJson.version.trim();
    }
  } catch {
    // fallback below
  }

  return "0.0.0-dev";
}

function resolveHealthEnvironment(): "production" | "staging" {
  const raw =
    process.env.APP_ENV?.trim().toLowerCase()
    || process.env.HEALTH_ENV?.trim().toLowerCase()
    || process.env.NODE_ENV?.trim().toLowerCase()
    || "staging";

  return raw === "production" ? "production" : "staging";
}

function derivePublicHealthStatus(params: {
  databaseOk: boolean;
  agentRuntimeOk: boolean;
}): PublicHealthStatus {
  if (params.databaseOk && params.agentRuntimeOk) return "healthy";
  if (!params.databaseOk && !params.agentRuntimeOk) return "unhealthy";
  return "degraded";
}

async function probeDatabase(): Promise<HealthDependencyProbeResult> {
  try {
    const { prismaGlobal } = await import("@repo/db");
    await prismaGlobal.$queryRaw`SELECT 1`;
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function probeAgentRuntime(): Promise<HealthDependencyProbeResult> {
  try {
    const { queueSnapshot } = await import("@eiah/core");
    await queueSnapshot();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function collectPublicHealth(params?: {
  databaseProbe?: () => Promise<HealthDependencyProbeResult>;
  agentRuntimeProbe?: () => Promise<HealthDependencyProbeResult>;
  now?: Date;
}): Promise<PublicHealthReport> {
  const database = await (params?.databaseProbe ?? probeDatabase)();
  const agentRuntime = await (params?.agentRuntimeProbe ?? probeAgentRuntime)();

  const ownership = getWorkerOwnershipState();
  return {
    status: derivePublicHealthStatus({
      databaseOk: database.ok,
      agentRuntimeOk: agentRuntime.ok,
    }),
    timestamp: (params?.now ?? new Date()).toISOString(),
    environment: resolveHealthEnvironment(),
    version: resolvePackageVersion(),
    dependencies: {
      database: database.ok ? "connected" : "disconnected",
      agentRuntime: agentRuntime.ok ? "ready" : "error",
    },
    workerOwnership: Object.keys(ownership).length > 0 ? ownership : undefined,
  };
}

export async function collectHealth() {
  const { prismaGlobal } = await import("@repo/db");
  const { queueSnapshot } = await import("@eiah/core");
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
  const { queueSnapshot } = await import("@eiah/core");
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
