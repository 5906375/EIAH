/** Pure extraction of the existing billing calculation. Legacy quirks intentionally preserved.
 * No acquisition, environment, implicit clock or I/O. Input order controls presentation order.
 */
import type { GovernedOperationBlockedCategory } from "../catalog/governedOperationCatalog.js";
export const BILLING_RECONCILIATION_EVALUATOR_VERSION = "billing-reconciliation-legacy.v1";
export type ReconciliationRun = { id: string; workspaceId: string; agent: string; traceId: string | null; costCents: number | null; status: string; errorCode: string | null };
export type ReconciliationUsage = { id: string; runId: string; workspaceId: string; requestId: string; meterType: string; amountCents: number | null };
export type ReconciliationLedger = { id: string; runId: string | null; workspaceId: string | null; requestId: string | null; entryType: string; amountCents: number | null };
export type ReconciliationRows = {
  runs: readonly ReconciliationRun[]; breakdowns: readonly ReconciliationUsage[];
  ledgerRowsRaw: readonly ReconciliationLedger[]; guardrailLedgerRowsRaw: readonly { runId: string | null }[];
};
export type BillingReconciliationScope = {
  tenantId: string;
  workspaceId?: string | null;
  runId?: string | null;
  agent?: string | null;
  from?: Date | null;
  to?: Date | null;
  limit?: number | null;
  /**
   * "presentation" (default): existing behavior, unchanged — the
   * runs/breakdowns/ledger rows this function reads are capped by `limit`
   * (a display/pagination concern for human-facing consumers of this
   * summary).
   *
   * "full": `totals` (and the un-sliced `items.auditGaps`/
   * `items.authorityUnresolved`) reflect the COMPLETE population matching
   * tenantId/workspaceId/window — no `take` cap on the underlying reads.
   * For evidence-grade callers (P1-R3) that must never silently
   * under-report a population larger than `limit` as if it were the whole
   * window. `items.orphanUsage`/`items.duplicateCharges`/`items.ledgerGaps`
   * remain sliced to `limit` for display even in "full" mode — the totals
   * they are counted from (`duplicateChargesCount` etc.) are already
   * computed over the complete, un-sliced row set regardless of mode; only
   * the DB `take` cap this option controls could ever make them incomplete.
   */
  coverageMode?: "presentation" | "full";
};

type BillingReconciliationRunGap = {
  runId: string;
  workspaceId: string;
  agent: string;
  traceId: string | null;
  runCostCents: number;
  breakdownCostCents: number;
  ledgerCostCents: number;
  /**
   * "missing_breakdown" is kept in the union for wire compatibility with
   * existing consumers (apps/web) but is never emitted anymore: per the
   * ratified P1-A semantics, breakdown absence means not_applicable, not a
   * gap — it is only reflected in totals.missingBreakdownCount.
   */
  issue: "missing_breakdown" | "missing_ledger" | "run_vs_breakdown_mismatch" | "breakdown_vs_ledger_mismatch";
};

type BillingReconciliationAuthorityUnresolved = {
  runId: string;
  workspaceId: string;
  agent: string;
  errorCode: string | null;
  /**
   * Why the collector could not resolve whether a valid governance decision
   * legitimately prevented the expected billing effect. Per the ratified
   * P1-B semantics (docs/ops/ape-audit-telemetry-decision.md §13.4) and the
   * catalog's authorityResolutionRequired invariant, this is never silently
   * treated as "no gap" nor as "gap" — it is reported fail-closed for review.
   */
  reason: "GUARDRAIL_AUTHORITY_EVIDENCE_NOT_FOUND" | "UNKNOWN_BLOCK_CATEGORY";
};

type BillingReconciliationDuplicateCharge = {
  runId: string | null;
  workspaceId: string | null;
  requestId: string | null;
  count: number;
  amountCents: number;
};

type BillingReconciliationOrphanUsage = {
  runId: string;
  workspaceId: string;
  requestId: string;
  meterType: string;
  amountCents: number;
};

type BillingReconciliationLedgerGap = {
  ledgerId: string;
  runId: string | null;
  workspaceId: string | null;
  requestId: string | null;
  amountCents: number;
  issue: "missing_workspace" | "ledger_without_run";
};

export type BillingReconciliationSummary = {
  filters: {
    tenantId: string;
    workspaceId: string | null;
    runId: string | null;
    agent: string | null;
    from: string | null;
    to: string | null;
    limit: number;
  };
  totals: {
    runsChecked: number;
    breakdownRows: number;
    ledgerRows: number;
    auditGapCount: number;
    authorityUnresolvedCount: number;
    orphanUsageCount: number;
    duplicateChargesCount: number;
    ledgerGapCount: number;
    missingBreakdownCount: number;
    missingLedgerCount: number;
    costMismatchCount: number;
  };
  items: {
    auditGaps: BillingReconciliationRunGap[];
    authorityUnresolved: BillingReconciliationAuthorityUnresolved[];
    orphanUsage: BillingReconciliationOrphanUsage[];
    duplicateCharges: BillingReconciliationDuplicateCharge[];
    ledgerGaps: BillingReconciliationLedgerGap[];
  };
};

export function resolveLimit(input?: number | null) {
  if (!Number.isFinite(input ?? null)) return 50;
  const value = Math.trunc(input ?? 50);
  if (value <= 0) return 50;
  return Math.min(value, 200);
}

/**
 * Maps the real Run.errorCode values written by apps/api/src/workers/runWorker.ts
 * to the governed operation catalog's blocked categories. This is deliberately a
 * fixed, explicit mapping over real runtime fields — never an inference from the
 * catalog's category name string itself.
 */
export const BLOCKED_ERROR_CODE_TO_CATEGORY: Record<string, GovernedOperationBlockedCategory> = {
  USER_CANCELLED: "USER_CANCELLED",
  GUARDRAILS_BLOCKED: "GUARDRAIL_BLOCK",
};

function resolveBlockedCategory(errorCode: string | null): GovernedOperationBlockedCategory | null {
  if (!errorCode) return null;
  return BLOCKED_ERROR_CODE_TO_CATEGORY[errorCode] ?? null;
}

export function calculateBillingReconciliation(
  { runs, breakdowns, ledgerRowsRaw, guardrailLedgerRowsRaw }: ReconciliationRows,
  params: BillingReconciliationScope,
  limit: number = resolveLimit(params.limit),
): BillingReconciliationSummary {
  const runIds = new Set(runs.map((item) => item.id));
  const ledgerRows = params.agent
    ? ledgerRowsRaw.filter((item) => item.runId && runIds.has(item.runId))
    : ledgerRowsRaw;

  // Evidência real (não inferida da string "GUARDRAIL_BLOCK") de que uma
  // decisão de governança válida foi registrada para o run: uma linha em
  // GuardrailLedger com actionType "blocked.*" vinculada ao runId.
  const guardrailAuthorityRunIds = new Set(
    guardrailLedgerRowsRaw
      .map((item) => item.runId)
      .filter((runId): runId is string => !!runId && runIds.has(runId))
  );

  const breakdownByRun = new Map<string, number>();
  const ledgerByRun = new Map<string, number>();

  for (const item of breakdowns) {
    breakdownByRun.set(item.runId, (breakdownByRun.get(item.runId) ?? 0) + Number(item.amountCents ?? 0));
  }
  for (const item of ledgerRows) {
    if (!item.runId) continue;
    ledgerByRun.set(item.runId, (ledgerByRun.get(item.runId) ?? 0) + Number(item.amountCents ?? 0));
  }

  const auditGaps: BillingReconciliationRunGap[] = [];
  const authorityUnresolved: BillingReconciliationAuthorityUnresolved[] = [];
  let missingBreakdownCount = 0; // P1-A: not_applicable (RunUsageBreakdown ausente) — não é gap
  let missingLedgerCount = 0;
  let costMismatchCount = 0;

  for (const run of runs) {
    // P1-A (applicability): sem RunUsageBreakdown, não há expectativa
    // verificável de efeito financeiro. not_applicable, não auditGap.
    if (!breakdownByRun.has(run.id)) {
      missingBreakdownCount += 1;
      continue;
    }

    const breakdownCostCents = breakdownByRun.get(run.id) ?? 0;

    // P1-Z (zero-cost): breakdown existe (ainda que somando zero) é
    // aplicável — nunca reclassificado como not_applicable.
    if (!ledgerByRun.has(run.id)) {
      const blockedCategory = run.status === "blocked" ? resolveBlockedCategory(run.errorCode) : null;

      if (blockedCategory === "GUARDRAIL_BLOCK") {
        // catalog: authorityResolutionRequired=true — o catálogo nunca
        // conclui isso sozinho; resolvemos com evidência real (GuardrailLedger).
        if (guardrailAuthorityRunIds.has(run.id)) {
          // Efeito legitimamente impedido por decisão de governança válida
          // e comprovada. Ausência de BillingLedger correspondente não é
          // auditGap.
          continue;
        }
        authorityUnresolved.push({
          runId: run.id,
          workspaceId: run.workspaceId,
          agent: run.agent,
          errorCode: run.errorCode,
          reason: "GUARDRAIL_AUTHORITY_EVIDENCE_NOT_FOUND",
        });
        continue;
      }

      if (run.status === "blocked" && blockedCategory === null) {
        // Categoria de bloqueio desconhecida: fail-closed — nunca presumir
        // gap nem no-gap sem evidência classificável.
        authorityUnresolved.push({
          runId: run.id,
          workspaceId: run.workspaceId,
          agent: run.agent,
          errorCode: run.errorCode,
          reason: "UNKNOWN_BLOCK_CATEGORY",
        });
        continue;
      }

      // USER_CANCELLED (runtime_attempt != independent_authority, mas sem
      // narrativa de prevenção legítima de governança) ou execução terminal
      // não bloqueada: ausência de BillingLedger é auditGap real.
      missingLedgerCount += 1;
      auditGaps.push({
        runId: run.id,
        workspaceId: run.workspaceId,
        agent: run.agent,
        traceId: run.traceId,
        runCostCents: Number(run.costCents ?? 0),
        breakdownCostCents,
        ledgerCostCents: 0,
        issue: "missing_ledger",
      });
      continue;
    }

    const ledgerCostCents = ledgerByRun.get(run.id) ?? 0;

    if (Number(run.costCents ?? 0) !== breakdownCostCents) {
      costMismatchCount += 1;
      auditGaps.push({
        runId: run.id,
        workspaceId: run.workspaceId,
        agent: run.agent,
        traceId: run.traceId,
        runCostCents: Number(run.costCents ?? 0),
        breakdownCostCents,
        ledgerCostCents,
        issue: "run_vs_breakdown_mismatch",
      });
      continue;
    }

    if (breakdownCostCents !== ledgerCostCents) {
      costMismatchCount += 1;
      auditGaps.push({
        runId: run.id,
        workspaceId: run.workspaceId,
        agent: run.agent,
        traceId: run.traceId,
        runCostCents: Number(run.costCents ?? 0),
        breakdownCostCents,
        ledgerCostCents,
        issue: "breakdown_vs_ledger_mismatch",
      });
    }
  }

  const orphanUsage = breakdowns
    .filter((item) => !runIds.has(item.runId))
    .slice(0, limit)
    .map((item) => ({
      runId: item.runId,
      workspaceId: item.workspaceId,
      requestId: item.requestId,
      meterType: item.meterType,
      amountCents: Number(item.amountCents ?? 0),
    }));

  // Grupo semântico ratificado (docs/ops/ape-audit-telemetry-decision.md §3.2):
  // tenantId + workspaceId + requestId + entryType. tenantId já é fixado pelo
  // escopo da query (ledgerWhere.tenantId); runId não participa da chave —
  // requestId já é run-scoped (`run:{runId}:debit`) e é o identificador de
  // idempotência real.
  const duplicateGroups = new Map<string, BillingReconciliationDuplicateCharge>();
  for (const item of ledgerRows) {
    const key = [params.tenantId, item.workspaceId ?? "null", item.requestId ?? "null", item.entryType ?? "null"].join(":");
    const current = duplicateGroups.get(key) ?? {
      runId: item.runId,
      workspaceId: item.workspaceId ?? null,
      requestId: item.requestId ?? null,
      count: 0,
      amountCents: 0,
    };
    current.count += 1;
    current.amountCents += Number(item.amountCents ?? 0);
    duplicateGroups.set(key, current);
  }
  const duplicateEligibleGroups = Array.from(duplicateGroups.values()).filter(
    (item) => item.count > 1 && item.requestId
  );
  // Σ max(0, n - 1) por grupo, calculado ANTES de qualquer truncamento por
  // limit — o limit só afeta os itens retornados para exibição.
  const duplicateChargesCount = duplicateEligibleGroups.reduce(
    (sum, item) => sum + Math.max(0, item.count - 1),
    0
  );
  const duplicateCharges = duplicateEligibleGroups.slice(0, limit);

  const ledgerGaps = ledgerRows
    .flatMap((item): BillingReconciliationLedgerGap[] => {
      const issues: BillingReconciliationLedgerGap[] = [];
      if (!item.workspaceId) {
        issues.push({
          ledgerId: item.id,
          runId: item.runId ?? null,
          workspaceId: null,
          requestId: item.requestId ?? null,
          amountCents: Number(item.amountCents ?? 0),
          issue: "missing_workspace",
        });
      }
      if (!item.runId || !runIds.has(item.runId)) {
        issues.push({
          ledgerId: item.id,
          runId: item.runId ?? null,
          workspaceId: item.workspaceId ?? null,
          requestId: item.requestId ?? null,
          amountCents: Number(item.amountCents ?? 0),
          issue: "ledger_without_run",
        });
      }
      return issues;
    })
    .slice(0, limit);

  return {
    filters: {
      tenantId: params.tenantId,
      workspaceId: params.workspaceId ?? null,
      runId: params.runId ?? null,
      agent: params.agent ?? null,
      from: params.from?.toISOString() ?? null,
      to: params.to?.toISOString() ?? null,
      limit,
    },
    totals: {
      runsChecked: runs.length,
      breakdownRows: breakdowns.length,
      ledgerRows: ledgerRows.length,
      auditGapCount: auditGaps.length,
      authorityUnresolvedCount: authorityUnresolved.length,
      orphanUsageCount: orphanUsage.length,
      duplicateChargesCount,
      ledgerGapCount: ledgerGaps.length,
      missingBreakdownCount,
      missingLedgerCount,
      costMismatchCount,
    },
    items: {
      auditGaps,
      authorityUnresolved,
      orphanUsage,
      duplicateCharges,
      ledgerGaps,
    },
  };
}
