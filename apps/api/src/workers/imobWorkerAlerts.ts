// Evaluates alert rules against ImobWorkerMetrics counter snapshots.
// Pure functions — no side effects, no external deps, no PII in outputs.
//
// Rules:
//   IMOB-W-001 (ERROR)   — job_permanently_failed > 0
//   IMOB-W-002 (ERROR)   — receipt_required_no_tx_id > 0 (HIGH tier audit gap)
//   IMOB-W-003 (WARNING) — simulated skip > threshold (production misconfiguration)
//   IMOB-W-004 (WARNING) — already_processed rate > threshold (duplicate enqueue)
//   IMOB-W-005 (WARNING) — run_not_success rate > threshold (engine degraded)
//   IMOB-W-006 (ERROR)   — job_error rate > threshold (exception pattern)
//   IMOB-W-007 (WARNING) — no jobs in stall window (queue stalled)

export type AlertSeverity = "warning" | "error";

export type AlertEvent = {
  ruleId: string;
  name: string;
  severity: AlertSeverity;
  /** Human-readable message. Must contain no PII — only counts and system codes. */
  message: string;
  /** Counter key that triggered the rule. No PII by construction (see imobWorkerMetrics.ts). */
  counterKey: string;
  /** Current value of the counter/rate. */
  value: number;
  /** Threshold that was crossed. */
  threshold: number;
};

export type AlertConfig = {
  /** Any simulated skip in production triggers IMOB-W-003. Default: 0. */
  simulatedSkipThreshold: number;
  /** already_processed / jobs_total ratio. Default: 0.30 (30%). */
  duplicateSkipRateThreshold: number;
  /** run_not_success / jobs_total ratio. Default: 0.20 (20%). */
  runNotSuccessRateThreshold: number;
  /** job_error / jobs_total ratio. Default: 0.05 (5%). */
  jobErrorRateThreshold: number;
  /** No-job window for stall detection. Default: 5 min. */
  stallWindowMs: number;
};

export const DEFAULT_ALERT_CONFIG: AlertConfig = {
  simulatedSkipThreshold: 0,
  duplicateSkipRateThreshold: 0.30,
  runNotSuccessRateThreshold: 0.20,
  jobErrorRateThreshold: 0.05,
  stallWindowMs: 5 * 60 * 1000,
};

// ─── Counter helpers ──────────────────────────────────────────────────────────

function sumByLabel(
  snap: Map<string, number>,
  counterName: string,
  labelKey: string,
  labelValue: string,
): number {
  const search = `${labelKey}="${labelValue}"`;
  let total = 0;
  for (const [key, value] of snap) {
    if (key.startsWith(counterName) && key.includes(search)) {
      total += value;
    }
  }
  return total;
}

function sumByName(snap: Map<string, number>, counterName: string): number {
  let total = 0;
  for (const [key, value] of snap) {
    if (key === counterName || key.startsWith(`${counterName}{`)) {
      total += value;
    }
  }
  return total;
}

// ─── Snapshot evaluator ───────────────────────────────────────────────────────

/**
 * Evaluate all snapshot-based alert rules.
 * Returns active alert events; empty array means all-clear.
 */
export function evaluateImobWorkerAlerts(
  snapshot: Map<string, number>,
  config: AlertConfig = DEFAULT_ALERT_CONFIG,
): AlertEvent[] {
  const events: AlertEvent[] = [];

  // IMOB-W-001 (ERROR): permanently failed jobs
  const permanentFailed = sumByLabel(snapshot, "imob_post_run_failures_total", "reason", "job_permanently_failed");
  if (permanentFailed > 0) {
    events.push({
      ruleId: "IMOB-W-001",
      name: "ImobWorkerPermanentFailure",
      severity: "error",
      message: `${permanentFailed} job(s) na fila imob-run-completed exauriram retries. Inspecionar DLQ e logs do worker.`,
      counterKey: "imob_post_run_failures_total{reason=job_permanently_failed}",
      value: permanentFailed,
      threshold: 0,
    });
  }

  // IMOB-W-002 (ERROR): HIGH-tier action without txId (audit gap)
  const noTxId = sumByLabel(snapshot, "imob_post_run_skips_total", "reason", "receipt_required_no_tx_id");
  if (noTxId > 0) {
    events.push({
      ruleId: "IMOB-W-002",
      name: "ImobWorkerReceiptRequiredNoTxId",
      severity: "error",
      message: `${noTxId} ação(ões) HIGH sem txId — skip reason=receipt_required_no_tx_id. Verificar ledger upstream para audit gap.`,
      counterKey: "imob_post_run_skips_total{reason=receipt_required_no_tx_id}",
      value: noTxId,
      threshold: 0,
    });
  }

  // IMOB-W-003 (WARNING): simulated output in production
  const simulatedSkips = sumByLabel(snapshot, "imob_post_run_skips_total", "reason", "simulated");
  if (simulatedSkips > config.simulatedSkipThreshold) {
    events.push({
      ruleId: "IMOB-W-003",
      name: "ImobWorkerSimulatedInProduction",
      severity: "warning",
      message: `${simulatedSkips} skip(s) reason=simulated detectados. Engine pode estar emitindo simulated=true em produção indevidamente.`,
      counterKey: "imob_post_run_skips_total{reason=simulated}",
      value: simulatedSkips,
      threshold: config.simulatedSkipThreshold,
    });
  }

  // Rate-based rules (only meaningful with jobs > 0)
  const totalJobs = sumByName(snapshot, "imob_run_completed_jobs_total");

  if (totalJobs > 0) {
    // IMOB-W-004 (WARNING): duplicate/idempotency skip rate
    const duplicateSkips = sumByLabel(snapshot, "imob_post_run_skips_total", "reason", "already_processed");
    const duplicateRate = duplicateSkips / totalJobs;
    if (duplicateRate > config.duplicateSkipRateThreshold) {
      events.push({
        ruleId: "IMOB-W-004",
        name: "ImobWorkerHighDuplicateRate",
        severity: "warning",
        message: `Taxa de duplicatas: ${(duplicateRate * 100).toFixed(1)}% (threshold ${(config.duplicateSkipRateThreshold * 100).toFixed(0)}%). Verificar enfileiramento upstream.`,
        counterKey: "imob_post_run_skips_total{reason=already_processed}",
        value: duplicateSkips,
        threshold: Math.ceil(totalJobs * config.duplicateSkipRateThreshold),
      });
    }

    // IMOB-W-005 (WARNING): run failure rate
    const notSuccessSkips = sumByLabel(snapshot, "imob_post_run_skips_total", "reason", "run_not_success");
    const notSuccessRate = notSuccessSkips / totalJobs;
    if (notSuccessRate > config.runNotSuccessRateThreshold) {
      events.push({
        ruleId: "IMOB-W-005",
        name: "ImobWorkerHighRunFailureRate",
        severity: "warning",
        message: `Taxa de run.status≠success: ${(notSuccessRate * 100).toFixed(1)}% (threshold ${(config.runNotSuccessRateThreshold * 100).toFixed(0)}%). Engine pode estar degradado.`,
        counterKey: "imob_post_run_skips_total{reason=run_not_success}",
        value: notSuccessSkips,
        threshold: Math.ceil(totalJobs * config.runNotSuccessRateThreshold),
      });
    }

    // IMOB-W-006 (ERROR): exception rate
    const jobErrors = sumByLabel(snapshot, "imob_post_run_failures_total", "reason", "job_error");
    const jobErrorRate = jobErrors / totalJobs;
    if (jobErrorRate > config.jobErrorRateThreshold) {
      events.push({
        ruleId: "IMOB-W-006",
        name: "ImobWorkerHighJobErrorRate",
        severity: "error",
        message: `Taxa de erros de job: ${(jobErrorRate * 100).toFixed(1)}% (threshold ${(config.jobErrorRateThreshold * 100).toFixed(0)}%). Inspecionar logs do worker.`,
        counterKey: "imob_post_run_failures_total{reason=job_error}",
        value: jobErrors,
        threshold: Math.ceil(totalJobs * config.jobErrorRateThreshold),
      });
    }
  }

  return events;
}

// ─── Stall evaluator (requires two snapshots) ─────────────────────────────────

/**
 * Evaluate queue stall: fires IMOB-W-007 (WARNING) if no new jobs were received
 * in the elapsed window AND there were jobs before (i.e., the worker was running).
 *
 * Does not fire on startup (prevTotal === 0), only on regression from active state.
 */
export function evaluateImobWorkerStall(
  prev: Map<string, number>,
  curr: Map<string, number>,
  elapsedMs: number,
  stallWindowMs: number = DEFAULT_ALERT_CONFIG.stallWindowMs,
): AlertEvent[] {
  if (elapsedMs < stallWindowMs) return [];

  const prevTotal = sumByName(prev, "imob_run_completed_jobs_total");
  const currTotal = sumByName(curr, "imob_run_completed_jobs_total");
  const delta = currTotal - prevTotal;

  if (prevTotal > 0 && delta === 0) {
    return [
      {
        ruleId: "IMOB-W-007",
        name: "ImobWorkerQueueStall",
        severity: "warning",
        message: `Fila imob-run-completed parada: nenhum job processado em ${Math.round(elapsedMs / 60000)} min. Verificar Redis e worker startup.`,
        counterKey: "imob_run_completed_jobs_total",
        value: 0,
        threshold: 1,
      },
    ];
  }

  return [];
}
