import type { PrismaClient } from "@repo/db";
import { BILLING_RUN_COST_DEBIT_OPERATION_ID, getGovernedOperation } from "@eiah/core/catalog/governedOperationCatalog";
import { calculateBillingReconciliation, resolveLimit, BLOCKED_ERROR_CODE_TO_CATEGORY, type BillingReconciliationScope, type BillingReconciliationSummary } from "../../../../packages/core/src/billing/reconciliation.js";
export type { BillingReconciliationSummary } from "../../../../packages/core/src/billing/reconciliation.js";

function buildCreatedAtRange(from?: Date | null, to?: Date | null) {
  if (!from && !to) return undefined;
  return {
    ...(from ? { gte: from } : {}),
    ...(to ? { lt: to } : {}),
  };
}

export async function getBillingReconciliationSummary(
  prisma: PrismaClient,
  params: BillingReconciliationScope
): Promise<BillingReconciliationSummary> {
  const limit = resolveLimit(params.limit);
  const coverageMode = params.coverageMode ?? "presentation";
  // "full" removes the DB-level take cap on the population queries below so
  // totals/auditGaps/duplicateCharges reflect the complete window-scoped
  // population, not just the `limit` most recent rows. Prisma treats
  // `take: undefined` as no limit.
  const runsTake = coverageMode === "full" ? undefined : limit;
  const breakdownsTake = coverageMode === "full" ? undefined : limit * 20;
  const ledgerTake = coverageMode === "full" ? undefined : limit * 20;
  const createdAt = buildCreatedAtRange(params.from, params.to);

  const operation = getGovernedOperation(BILLING_RUN_COST_DEBIT_OPERATION_ID);
  const knownBlockedCategories = new Set(Object.keys(operation.blockedSemantics.categories));
  for (const category of Object.values(BLOCKED_ERROR_CODE_TO_CATEGORY)) {
    if (!knownBlockedCategories.has(category)) {
      throw new Error(`billing_reconciliation_category_not_in_catalog: ${category}`);
    }
  }

  const runWhere = {
    tenantId: params.tenantId,
    // P1-T (terminalidade): Run.finishedAt IS NOT NULL — mesmo predicado
    // declarado em operation.terminality.rule.
    finishedAt: { not: null },
    ...(params.workspaceId ? { workspaceId: params.workspaceId } : {}),
    ...(params.runId ? { id: params.runId } : {}),
    ...(params.agent ? { agent: params.agent } : {}),
    ...(createdAt ? { createdAt } : {}),
  };

  const breakdownWhere = {
    tenantId: params.tenantId,
    ...(params.workspaceId ? { workspaceId: params.workspaceId } : {}),
    ...(params.runId ? { runId: params.runId } : {}),
    ...(params.agent ? { agent: params.agent } : {}),
    ...(createdAt ? { createdAt } : {}),
  };

  const ledgerWhere = {
    tenantId: params.tenantId,
    entryType: "debit",
    ...(params.workspaceId ? { workspaceId: params.workspaceId } : {}),
    ...(params.runId ? { runId: params.runId } : {}),
    ...(createdAt ? { createdAt } : {}),
  };

  const guardrailLedgerWhere = {
    tenantId: params.tenantId,
    // Match exato ao valor real gravado por runWorker.ts quando
    // guardrailReport.action === "block" AND shouldBlock (mecanismo de
    // guardrail). "blocked.trustscore" (routes/runs.ts) é mecanismo
    // distinto e não deve resolver authority de GUARDRAIL_BLOCK; qualquer
    // outro "blocked.*" também não deve.
    actionType: "blocked.guardrails",
    ...(params.runId ? { runId: params.runId } : {}),
    ...(createdAt ? { timestamp: createdAt } : {}),
  };

  const [runs, breakdowns, ledgerRowsRaw, guardrailLedgerRowsRaw] = await Promise.all([
    prisma.run.findMany({
      where: runWhere,
      select: {
        id: true,
        workspaceId: true,
        agent: true,
        traceId: true,
        costCents: true,
        status: true,
        errorCode: true,
      },
      orderBy: { createdAt: "desc" },
      take: runsTake,
    }),
    prisma.runUsageBreakdown.findMany({
      where: breakdownWhere,
      select: {
        id: true,
        runId: true,
        workspaceId: true,
        requestId: true,
        meterType: true,
        amountCents: true,
      },
      orderBy: { createdAt: "desc" },
      take: breakdownsTake,
    }),
    prisma.billingLedger.findMany({
      where: ledgerWhere,
      select: {
        id: true,
        runId: true,
        workspaceId: true,
        requestId: true,
        entryType: true,
        amountCents: true,
      },
      orderBy: { createdAt: "desc" },
      take: ledgerTake,
    }),
    prisma.guardrailLedger.findMany({
      where: guardrailLedgerWhere,
      select: {
        runId: true,
      },
    }),
  ]);

  return calculateBillingReconciliation({ runs, breakdowns, ledgerRowsRaw, guardrailLedgerRowsRaw }, params, limit);
}
