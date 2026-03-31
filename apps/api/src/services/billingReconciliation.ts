import { PrismaClient } from "@repo/db";

type BillingReconciliationScope = {
  tenantId: string;
  workspaceId?: string | null;
  runId?: string | null;
  from?: Date | null;
  to?: Date | null;
  limit?: number | null;
};

type BillingReconciliationRunGap = {
  runId: string;
  workspaceId: string;
  agent: string;
  traceId: string | null;
  runCostCents: number;
  breakdownCostCents: number;
  ledgerCostCents: number;
  issue: "missing_breakdown" | "missing_ledger" | "run_vs_breakdown_mismatch" | "breakdown_vs_ledger_mismatch";
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
    from: string | null;
    to: string | null;
    limit: number;
  };
  totals: {
    runsChecked: number;
    breakdownRows: number;
    ledgerRows: number;
    auditGapCount: number;
    orphanUsageCount: number;
    duplicateChargesCount: number;
    ledgerGapCount: number;
    missingBreakdownCount: number;
    missingLedgerCount: number;
    costMismatchCount: number;
  };
  items: {
    auditGaps: BillingReconciliationRunGap[];
    orphanUsage: BillingReconciliationOrphanUsage[];
    duplicateCharges: BillingReconciliationDuplicateCharge[];
    ledgerGaps: BillingReconciliationLedgerGap[];
  };
};

function resolveLimit(input?: number | null) {
  if (!Number.isFinite(input ?? null)) return 50;
  const value = Math.trunc(input ?? 50);
  if (value <= 0) return 50;
  return Math.min(value, 200);
}

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
  const createdAt = buildCreatedAtRange(params.from, params.to);

  const runWhere = {
    tenantId: params.tenantId,
    ...(params.workspaceId ? { workspaceId: params.workspaceId } : {}),
    ...(params.runId ? { id: params.runId } : {}),
    ...(createdAt ? { createdAt } : {}),
  };

  const breakdownWhere = {
    tenantId: params.tenantId,
    ...(params.workspaceId ? { workspaceId: params.workspaceId } : {}),
    ...(params.runId ? { runId: params.runId } : {}),
    ...(createdAt ? { createdAt } : {}),
  };

  const ledgerWhere = {
    tenantId: params.tenantId,
    entryType: "debit",
    ...(params.workspaceId ? { workspaceId: params.workspaceId } : {}),
    ...(params.runId ? { runId: params.runId } : {}),
    ...(createdAt ? { createdAt } : {}),
  };

  const [runs, breakdowns, ledgerRows] = await Promise.all([
    prisma.run.findMany({
      where: runWhere,
      select: {
        id: true,
        workspaceId: true,
        agent: true,
        traceId: true,
        costCents: true,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
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
      take: limit * 20,
    }),
    prisma.billingLedger.findMany({
      where: ledgerWhere,
      select: {
        id: true,
        runId: true,
        workspaceId: true,
        requestId: true,
        amountCents: true,
      },
      orderBy: { createdAt: "desc" },
      take: limit * 20,
    }),
  ]);

  const runIds = new Set(runs.map((item) => item.id));
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
  let missingBreakdownCount = 0;
  let missingLedgerCount = 0;
  let costMismatchCount = 0;

  for (const run of runs) {
    const breakdownCostCents = breakdownByRun.get(run.id) ?? 0;
    const ledgerCostCents = ledgerByRun.get(run.id) ?? 0;

    if (breakdownCostCents === 0) {
      missingBreakdownCount += 1;
      auditGaps.push({
        runId: run.id,
        workspaceId: run.workspaceId,
        agent: run.agent,
        traceId: run.traceId,
        runCostCents: Number(run.costCents ?? 0),
        breakdownCostCents,
        ledgerCostCents,
        issue: "missing_breakdown",
      });
      continue;
    }

    if (ledgerCostCents === 0) {
      missingLedgerCount += 1;
      auditGaps.push({
        runId: run.id,
        workspaceId: run.workspaceId,
        agent: run.agent,
        traceId: run.traceId,
        runCostCents: Number(run.costCents ?? 0),
        breakdownCostCents,
        ledgerCostCents,
        issue: "missing_ledger",
      });
      continue;
    }

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

  const duplicateGroups = new Map<string, BillingReconciliationDuplicateCharge>();
  for (const item of ledgerRows) {
    const key = [item.runId ?? "null", item.workspaceId ?? "null", item.requestId ?? "null"].join(":");
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
  const duplicateCharges = Array.from(duplicateGroups.values())
    .filter((item) => item.count > 1 && item.requestId)
    .slice(0, limit);

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
      from: params.from?.toISOString() ?? null,
      to: params.to?.toISOString() ?? null,
      limit,
    },
    totals: {
      runsChecked: runs.length,
      breakdownRows: breakdowns.length,
      ledgerRows: ledgerRows.length,
      auditGapCount: auditGaps.length,
      orphanUsageCount: orphanUsage.length,
      duplicateChargesCount: duplicateCharges.length,
      ledgerGapCount: ledgerGaps.length,
      missingBreakdownCount,
      missingLedgerCount,
      costMismatchCount,
    },
    items: {
      auditGaps,
      orphanUsage,
      duplicateCharges,
      ledgerGaps,
    },
  };
}
