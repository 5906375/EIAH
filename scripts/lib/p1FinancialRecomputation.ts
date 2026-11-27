/** Real local execution, never an independent verification of supplied rows. No I/O or implicit clock. */
import { calculateBillingReconciliation, BILLING_RECONCILIATION_EVALUATOR_VERSION, type BillingReconciliationSummary } from "../../packages/core/src/billing/reconciliation.js";
import { validateFinancialProjection, FINANCIAL_PROJECTION_VERSION, type FinancialProjection } from "./p1FinancialProjection.js";
import { SOURCE_MATERIAL_VERSION, validateSourceMaterial, validateSnapshotMetadata, sourceContentDigest } from "./p1SourceMaterial.js";
export const FINANCIAL_RECOMPUTATION_VERSION = "p1-financial-recomputation.v1";
export type FinancialRecomputationResult = Readonly<{
  schemaVersion: typeof FINANCIAL_RECOMPUTATION_VERSION;
  inputDigest: string | null; evaluatorVersion: typeof BILLING_RECONCILIATION_EVALUATOR_VERSION;
  execution: "not_run" | "completed" | "error";
  reconciliation: "consistent" | "divergent" | "indeterminate";
  comparison: Readonly<{ status: "not_provided" | "not_evaluated" | "matches" | "differs"; differingMetrics: readonly string[] }>;
  reasons: readonly string[]; summary: BillingReconciliationSummary | null;
  deferredRunIds: readonly string[]; deferredFactIds: readonly string[];
  independentSourceVerification: "not_demonstrated";
  operationalEligibility: "blocked";
  blockedBy: readonly string[];
}>;
const blockers = ["operation_mapping_not_demonstrated", "denominators_not_defined", "semantic_duplicate_key_not_established", "authority_not_independently_verified", "population_not_demonstrated", "visibility_not_demonstrated", "history_not_demonstrated", "provenance_not_demonstrated"] as const;
/** importedResult is intentionally unused: even plausible claims never replace executing the core. */
export function recomputeFinancialProjection(raw: unknown, _importedResult?: unknown): FinancialRecomputationResult {
  const base: FinancialRecomputationResult = {
    schemaVersion: FINANCIAL_RECOMPUTATION_VERSION, inputDigest: null, evaluatorVersion: BILLING_RECONCILIATION_EVALUATOR_VERSION,
    execution: "not_run", reconciliation: "indeterminate", comparison: { status: "not_evaluated", differingMetrics: [] },
    reasons: [], summary: null, deferredRunIds: [], deferredFactIds: [], independentSourceVerification: "not_demonstrated", operationalEligibility: "blocked", blockedBy: blockers,
  };
  let p: FinancialProjection;
  try {
    const version = raw && typeof raw === "object" ? (raw as Record<string, unknown>).schemaVersion : null;
    if (version === SOURCE_MATERIAL_VERSION) {
      const legacy = validateSourceMaterial(raw);
      return { ...base, inputDigest: sourceContentDigest(legacy), reasons: ["financial_rows_not_available"] };
    }
    if (raw && typeof raw === "object" && !("schemaVersion" in raw)) {
      const legacy = validateSnapshotMetadata(raw);
      return { ...base, inputDigest: sourceContentDigest(legacy), reasons: ["financial_rows_not_available"] };
    }
    p = validateFinancialProjection(raw);
  } catch (error) {
    return { ...base, execution: "error", reasons: ["invalid_projection", error instanceof Error ? error.message : "validation_error"] };
  }
  const bound = { ...base, inputDigest: p.digest };
  const deferred = new Set(p.runs.filter(r => r.finishedAt === null).map(r => r.id));
  const usage = p.usage.filter(r => !deferred.has(r.reference.runId ?? ""));
  const ledger = p.ledger.filter(r => !deferred.has(r.reference.runId ?? ""));
  const runs = p.runs.filter(r => !deferred.has(r.id));
  const deferredFactIds = [...p.usage.filter(r => deferred.has(r.reference.runId ?? "")).map(r => `usage:${r.id}`), ...p.ledger.filter(r => deferred.has(r.reference.runId ?? "")).map(r => `ledger:${r.id}`)];
  const observation = { ...bound, deferredRunIds: [...deferred], deferredFactIds };
  const reasons: string[] = deferred.size ? ["pending_runs"] : [];
  const money = [...runs, ...usage, ...ledger].map(r => r.money);
  if (money.some(m => m.amountCents === null)) reasons.push("missing_amount");
  if (money.some(m => m.currency === null)) reasons.push("currency_not_provided");
  if (money.some(m => m.unit === null)) reasons.push("unit_not_provided");
  if (money.some(m => m.unit !== null && m.unit !== "cent")) reasons.push("unsupported_unit");
  if (new Set(money.map(m => m.currency).filter(v => v !== null)).size > 1) reasons.push("incompatible_currencies");
  if (ledger.some(r => r.entryType !== "debit")) reasons.push("unsupported_entry_type");
  if (p.runs.some(r => !["pending", "running", "success", "error", "blocked", "awaiting_approval"].includes(r.status))) reasons.push("unknown_run_status");
  const moneyBlockers = reasons.filter(r => r !== "pending_runs");
  if (moneyBlockers.length) return { ...observation, reasons };
  // Conservative exact bound on all subsequent sums. Numbers remain integer cents as in legacy.
  const magnitude = money.reduce((sum, m) => sum + (BigInt(m.amountCents!) < 0n ? -BigInt(m.amountCents!) : BigInt(m.amountCents!)), 0n);
  if (magnitude > BigInt(Number.MAX_SAFE_INTEGER)) return { ...observation, execution: "error", reasons: [...reasons, "aggregate_precision_overflow"] };
  try {
    const summary = calculateBillingReconciliation({
      runs: runs.map(r => ({ id: r.id, workspaceId: r.workspaceId, agent: r.agent, traceId: r.traceId, costCents: r.money.amountCents!, status: r.status, errorCode: r.errorCode })),
      breakdowns: usage.map(r => ({ id: r.id, runId: r.reference.runId!, workspaceId: r.workspaceId, requestId: r.requestId, meterType: r.meterType, amountCents: r.money.amountCents! })),
      ledgerRowsRaw: ledger.map(r => ({ id: r.id, runId: r.reference.runId, workspaceId: r.workspaceId, requestId: r.requestId, entryType: r.entryType, amountCents: r.money.amountCents! })),
      guardrailLedgerRowsRaw: p.authority.filter(r => r.actionType === "blocked.guardrails" && r.workspaceId === p.scope.workspaceId).map(r => ({ runId: r.reference.runId })),
    }, { tenantId: p.scope.tenantId, workspaceId: p.scope.workspaceId, from: new Date(p.window.from), to: new Date(p.window.to) }, Math.max(1, p.runs.length, p.usage.length, p.ledger.length * 2));
    if (summary.totals.authorityUnresolvedCount) reasons.push("authority_unresolved");
    // Preserve legacy's narrow count, but do not claim M1 authority from runtime categories/rows.
    if (runs.some(r => r.status === "blocked")) reasons.push("blocked_authority_not_independently_verified");
    if (ledger.some(r => !r.requestId)) reasons.push("duplicate_key_unavailable");
    if (!runs.length || !usage.length) reasons.push("insufficient_applicable_sample");
    const divergent = summary.totals.auditGapCount > 0 || summary.totals.duplicateChargesCount > 0 || summary.totals.orphanUsageCount > 0 || summary.totals.ledgerGapCount > 0;
    const differences = p.declaredMetrics === null ? [] : Object.keys(p.declaredMetrics).filter(k => p.declaredMetrics![k as keyof typeof p.declaredMetrics] !== summary.totals[k as keyof typeof p.declaredMetrics]);
    return { ...observation, execution: "completed", summary, reasons,
      reconciliation: reasons.length ? "indeterminate" : divergent ? "divergent" : "consistent",
      comparison: { status: p.declaredMetrics === null ? "not_provided" : differences.length ? "differs" : "matches", differingMetrics: differences },
    };
  } catch (error) {
    return { ...observation, execution: "error", reasons: ["calculation_error", error instanceof Error ? error.message : "unknown_error"] };
  }
}
