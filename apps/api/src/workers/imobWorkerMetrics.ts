// In-memory counters for ImobPostRunMutationWorker.
// No external deps — pure module-level Map.
// Labels must never include PII (caseId, tenantId, workspaceId, ownerResponsible).

const _counters: Map<string, number> = new Map();

function makeKey(name: string, labels: Record<string, string>): string {
  const labelStr = Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}="${v}"`)
    .join(",");
  return labelStr ? `${name}{${labelStr}}` : name;
}

export function incrementCounter(name: string, labels: Record<string, string> = {}): void {
  const key = makeKey(name, labels);
  _counters.set(key, (_counters.get(key) ?? 0) + 1);
}

export function getCounterSnapshot(): Map<string, number> {
  return new Map(_counters);
}

export function renderCountersAsPrometheusText(): string {
  if (_counters.size === 0) return "";
  return [..._counters.entries()]
    .map(([key, value]) => `${key} ${value}`)
    .join("\n");
}

/** Only call in tests — clears all counters. */
export function resetCountersForTesting(): void {
  _counters.clear();
}

export const IMOB_WORKER_COUNTER = {
  /** Every job received by the worker queue handler, regardless of outcome. */
  JOBS_RECEIVED: "imob_run_completed_jobs_total",
  /** Jobs that completed with a successful ImobCase mutation. */
  MUTATIONS_APPLIED: "imob_post_run_mutations_applied_total",
  /** Jobs that exited early without mutating (any guard or idempotency reason). */
  SKIPS: "imob_post_run_skips_total",
  /** Jobs that threw an unhandled exception inside the BullMQ handler. */
  FAILURES: "imob_post_run_failures_total",
} as const;
