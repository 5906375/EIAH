import { createLogger } from "@eiah/core/logging/logger";

const logger = createLogger({ component: "imob-intake-observability" });

type CounterLabels = Record<string, string>;

export type ImobIntakeObservabilityEventName =
  | "storage_provider_mode"
  | "draft_store_mode"
  | "upload_received"
  | "draft_created"
  | "draft_consumed"
  | "draft_expired"
  | "draft_scope_mismatch"
  | "upload_retention_skipped"
  | "upload_retention_candidates"
  | "upload_retention_deleted"
  | "upload_retention_failed"
  | "object_storage_gate_failed";

export type ImobIntakeObservabilityEvent = {
  level: "info" | "warn" | "error";
  event: ImobIntakeObservabilityEventName;
  payload: Record<string, string | number | boolean | null>;
};

const counters = new Map<string, number>();
const emittedOnce = new Set<string>();
const observedEvents: ImobIntakeObservabilityEvent[] = [];

export const IMOB_INTAKE_OBSERVABILITY_COUNTER = {
  STORAGE_PROVIDER_MODE: "imob_intake_storage_provider_mode_total",
  DRAFT_STORE_MODE: "imob_intake_draft_store_mode_total",
  UPLOADS_RECEIVED: "imob_intake_uploads_received_total",
  DRAFTS_CREATED: "imob_intake_drafts_created_total",
  DRAFTS_CONSUMED: "imob_intake_drafts_consumed_total",
  DRAFTS_EXPIRED: "imob_intake_drafts_expired_total",
  DRAFTS_SCOPE_MISMATCH: "imob_intake_drafts_scope_mismatch_total",
  CLEANUP_SKIPPED: "imob_intake_cleanup_skipped_total",
  CLEANUP_CANDIDATES: "imob_intake_cleanup_candidates_total",
  CLEANUP_DELETED: "imob_intake_cleanup_deleted_total",
  CLEANUP_FAILED: "imob_intake_cleanup_failures_total",
  OBJECT_STORAGE_GATE_FAILURES: "imob_intake_object_storage_gate_failures_total",
} as const;

function normalizePayload(payload: Record<string, string | number | boolean | null | undefined>) {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined)) as Record<
    string,
    string | number | boolean | null
  >;
}

function makeCounterKey(name: string, labels: CounterLabels) {
  const renderedLabels = Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}="${value}"`)
    .join(",");
  return renderedLabels ? `${name}{${renderedLabels}}` : name;
}

export function incrementImobIntakeCounter(name: string, labels: CounterLabels = {}, amount = 1) {
  const key = makeCounterKey(name, labels);
  counters.set(key, (counters.get(key) ?? 0) + amount);
}

export function getImobIntakeCounterSnapshot() {
  return new Map(counters);
}

export function renderImobIntakeCountersAsPrometheusText() {
  if (counters.size === 0) return "";
  return [...counters.entries()]
    .map(([key, value]) => `${key} ${value}`)
    .join("\n");
}

export function recordImobIntakeObservabilityEvent(params: {
  event: ImobIntakeObservabilityEventName;
  payload?: Record<string, string | number | boolean | null | undefined>;
  level?: "info" | "warn" | "error";
  counterName?: string;
  counterLabels?: CounterLabels;
  counterAmount?: number;
  onceKey?: string;
}) {
  if (params.onceKey) {
    if (emittedOnce.has(params.onceKey)) return;
    emittedOnce.add(params.onceKey);
  }

  const payload = normalizePayload(params.payload ?? {});
  const event: ImobIntakeObservabilityEvent = {
    level: params.level ?? "info",
    event: params.event,
    payload,
  };

  observedEvents.push(event);
  logger[event.level]({ event: params.event, ...payload }, `imob-intake.${params.event}`);

  if (params.counterName) {
    incrementImobIntakeCounter(params.counterName, params.counterLabels ?? {}, params.counterAmount ?? 1);
  }
}

export function getImobIntakeObservabilityEventsForTesting() {
  return [...observedEvents];
}

export function resetImobIntakeObservabilityForTesting() {
  counters.clear();
  emittedOnce.clear();
  observedEvents.length = 0;
}
