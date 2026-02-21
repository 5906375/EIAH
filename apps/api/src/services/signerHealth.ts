import { SignerManager } from "@eiah/core";

export type SignerRuntimeState = "OK" | "DEGRADED" | "DOWN";
export type SignerBootDecision = "up" | "up_degraded" | "down";

export type SignerProbeResult = {
  state: SignerRuntimeState;
  provider: string;
  status: string;
  latencyMs: number;
  error: string | null;
  timestamp: string;
};

let lastProbe: SignerProbeResult | null = null;
let lastProbeAtMs = 0;
const recentFailuresMs: number[] = [];

function parseBoolEnv(value: string | undefined, fallback = false) {
  if (value == null) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "on", "yes"].includes(normalized)) return true;
  if (["false", "0", "off", "no"].includes(normalized)) return false;
  return fallback;
}

function parseNumberEnv(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nowIso() {
  return new Date().toISOString();
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      const timer = setTimeout(() => {
        clearTimeout(timer);
        reject(new Error(`signer_health_timeout_${timeoutMs}ms`));
      }, timeoutMs);
    }),
  ]);
}

function trimRecentFailures(lookbackMs: number, nowMs: number) {
  while (recentFailuresMs.length > 0 && nowMs - recentFailuresMs[0] > lookbackMs) {
    recentFailuresMs.shift();
  }
}

export function classifySignerState(params: {
  ok: boolean;
  latencyMs: number;
  hasRecentFailures: boolean;
  degradedLatencyMs: number;
}) {
  if (!params.ok) return "DOWN" as const;
  if (params.latencyMs > params.degradedLatencyMs) return "DEGRADED" as const;
  if (params.hasRecentFailures) return "DEGRADED" as const;
  return "OK" as const;
}

export function resolveSignerBootDecision(params: {
  criticalEnv: boolean;
  state: SignerRuntimeState;
  allowDegraded: boolean;
}): SignerBootDecision {
  if (!params.criticalEnv) return "up";
  if (params.state === "DOWN") return "down";
  if (params.state === "DEGRADED" && !params.allowDegraded) return "down";
  if (params.state === "DEGRADED") return "up_degraded";
  return "up";
}

export async function probeSignerHealth(options?: { force?: boolean }): Promise<SignerProbeResult> {
  const force = options?.force ?? false;
  const cacheMs = parseNumberEnv(process.env.SIGNER_HEALTH_CACHE_MS, 5000);
  const timeoutMs = parseNumberEnv(process.env.SIGNER_HEALTH_TIMEOUT_MS, 1500);
  const degradedLatencyMs = parseNumberEnv(process.env.SIGNER_HEALTH_DEGRADED_MS, 800);
  const unstableLookbackMs = parseNumberEnv(process.env.SIGNER_HEALTH_UNSTABLE_LOOKBACK_MS, 120000);
  const nowMs = Date.now();

  if (!force && lastProbe && nowMs - lastProbeAtMs <= cacheMs) {
    return lastProbe;
  }

  const provider = (process.env.SIGNER_PROVIDER ?? "local").trim().toLowerCase();
  const startedAt = Date.now();
  let ok = false;
  let status = "unknown";
  let error: string | null = null;

  try {
    const signer = SignerManager.fromEnv();
    const result = await withTimeout(signer.healthCheck(), timeoutMs);
    ok = Boolean(result.ok);
    status = result.status ?? (ok ? "ok" : "unknown");
    if (!ok) {
      error = result.status ?? "signer_unhealthy";
    }
  } catch (probeError) {
    error = probeError instanceof Error ? probeError.message : String(probeError);
    status = "probe_error";
  }

  const latencyMs = Date.now() - startedAt;
  if (!ok) {
    recentFailuresMs.push(nowMs);
  }
  trimRecentFailures(unstableLookbackMs, nowMs);
  const hasRecentFailures = recentFailuresMs.length > 0;
  const state = classifySignerState({
    ok,
    latencyMs,
    hasRecentFailures,
    degradedLatencyMs,
  });

  const result: SignerProbeResult = {
    state,
    provider,
    status,
    latencyMs,
    error,
    timestamp: nowIso(),
  };

  lastProbe = result;
  lastProbeAtMs = nowMs;
  return result;
}

export function isCriticalSignerBootEnv() {
  const nodeEnv = (process.env.NODE_ENV ?? "development").trim().toLowerCase();
  const criticalFlag = parseBoolEnv(process.env.SIGNER_BOOT_CRITICAL, false);
  if (criticalFlag) return true;
  return nodeEnv === "production" || nodeEnv === "staging";
}

export async function evaluateSignerBootGate() {
  const criticalEnv = isCriticalSignerBootEnv();
  const allowDegraded = parseBoolEnv(process.env.SIGNER_BOOT_ALLOW_DEGRADED, false);
  const probe = await probeSignerHealth({ force: true });
  const decision = resolveSignerBootDecision({
    criticalEnv,
    state: probe.state,
    allowDegraded,
  });
  return {
    decision,
    criticalEnv,
    allowDegraded,
    probe,
  };
}
