import { PrismaClient } from "@repo/db";

type TenantScope = {
  tenantId: string;
  workspaceId?: string | null;
};

type UsageCycle = {
  cycleStart: Date;
  cycleEnd: Date;
};

type LedgerEntryType = "debit" | "credit" | "adjustment";
export type TenantBillingGuardMode = "shadow" | "soft" | "hard";

type InsertLedgerEntryParams = {
  tenantId: string;
  workspaceId?: string | null;
  runId?: string | null;
  amountCents: number;
  currency?: string;
  description?: string | null;
  requestId?: string | null;
  provider?: string | null;
  model?: string | null;
};

function getClientWithTenantBillingV2(prisma: PrismaClient) {
  const client = prisma as any;
  const hasV2 =
    client &&
    typeof client === "object" &&
    client.tenantQuotaPolicy &&
    client.workspaceQuotaGrant &&
    client.tenantQuotaUsage &&
    client.tenantBillingAccount &&
    client.billingLedger;
  return hasV2 ? client : null;
}

function defaultCycle(referenceDate: Date = new Date()): UsageCycle {
  const cycleStart = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), 1, 0, 0, 0, 0));
  const cycleEnd = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth() + 1, 1, 0, 0, 0, 0));
  return { cycleStart, cycleEnd };
}

export type TenantBillingGuardReasonCode =
  | "WORKSPACE_GRANT_DISABLED"
  | "TENANT_RUNS_SOFT_LIMIT"
  | "TENANT_RUNS_HARD_LIMIT"
  | "TENANT_COST_SOFT_LIMIT"
  | "TENANT_COST_HARD_LIMIT"
  | "WORKSPACE_RUNS_LIMIT"
  | "WORKSPACE_COST_LIMIT";

export type TenantBillingGuardReason = {
  code: TenantBillingGuardReasonCode;
  message: string;
  current: number;
  projected: number;
  limit: number;
};

export type TenantBillingGuardDecision = {
  mode: TenantBillingGuardMode;
  block: boolean;
  workspaceEnabled: boolean;
  reasons: TenantBillingGuardReason[];
  cycle: UsageCycle;
};

function normalizeAnchorDay(day: number | null | undefined) {
  if (!Number.isFinite(day)) return 1;
  return Math.min(28, Math.max(1, Math.trunc(Number(day))));
}

function clampDayInMonth(year: number, monthIndex: number, day: number) {
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  return Math.min(day, daysInMonth);
}

function withAnchorDate(year: number, monthIndex: number, anchorDay: number) {
  const clampedDay = clampDayInMonth(year, monthIndex, anchorDay);
  return new Date(Date.UTC(year, monthIndex, clampedDay, 0, 0, 0, 0));
}

function computeCycleWindow(referenceDate: Date, anchorDay: number): UsageCycle {
  const utcYear = referenceDate.getUTCFullYear();
  const utcMonth = referenceDate.getUTCMonth();
  const thisMonthAnchor = withAnchorDate(utcYear, utcMonth, anchorDay);
  const cycleStart =
    referenceDate.getTime() >= thisMonthAnchor.getTime()
      ? thisMonthAnchor
      : withAnchorDate(utcMonth === 0 ? utcYear - 1 : utcYear, utcMonth === 0 ? 11 : utcMonth - 1, anchorDay);
  const cycleEnd = withAnchorDate(
    cycleStart.getUTCMonth() === 11 ? cycleStart.getUTCFullYear() + 1 : cycleStart.getUTCFullYear(),
    cycleStart.getUTCMonth() === 11 ? 0 : cycleStart.getUTCMonth() + 1,
    anchorDay
  );
  return { cycleStart, cycleEnd };
}

export class QuotaPolicyService {
  constructor(private readonly prisma: PrismaClient) {}

  async resolveTenantPolicy(tenantId: string) {
    const client = getClientWithTenantBillingV2(this.prisma);
    if (!client) {
      return {
        tenantId,
        softLimitPct: 80,
        hardLimitPct: 100,
        monthlyRunsLimit: null,
        monthlyCostCentsLimit: null,
      };
    }
    const existing = await client.tenantQuotaPolicy.findUnique({
      where: { tenantId },
    });
    if (existing) return existing;

    return client.tenantQuotaPolicy.create({
      data: {
        tenantId,
        softLimitPct: 80,
        hardLimitPct: 100,
      },
    });
  }

  async resolveWorkspaceGrant(params: { tenantId: string; workspaceId: string }) {
    const client = getClientWithTenantBillingV2(this.prisma);
    if (!client) {
      return {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        enabled: true,
        localRunLimit: null,
        localCostCentsLimit: null,
      };
    }
    const workspace = await client.workspace.findUnique({
      where: { id: params.workspaceId },
      select: { id: true, tenantId: true },
    });
    if (!workspace || workspace.tenantId !== params.tenantId) {
      return null;
    }

    const existing = await client.workspaceQuotaGrant.findUnique({
      where: {
        tenantId_workspaceId: {
          tenantId: params.tenantId,
          workspaceId: params.workspaceId,
        },
      },
    });
    if (existing) return existing;

    return client.workspaceQuotaGrant.create({
      data: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        enabled: true,
      },
    });
  }
}

export class BillingLedgerService {
  constructor(private readonly prisma: PrismaClient) {}

  async insertDebit(params: InsertLedgerEntryParams) {
    return this.insertEntry("debit", params);
  }

  async insertCredit(params: InsertLedgerEntryParams) {
    return this.insertEntry("credit", params);
  }

  async insertAdjustment(params: InsertLedgerEntryParams) {
    return this.insertEntry("adjustment", params);
  }

  private async insertEntry(entryType: LedgerEntryType, params: InsertLedgerEntryParams) {
    const client = getClientWithTenantBillingV2(this.prisma);
    if (!client) {
      return {
        inserted: false as const,
        entry: {
          id: `shadow-unavailable:${params.requestId ?? "no-request-id"}`,
          tenantId: params.tenantId,
          workspaceId: params.workspaceId ?? null,
          runId: params.runId ?? null,
          entryType,
          amountCents: params.amountCents,
          currency: params.currency ?? "BRL",
          description: params.description ?? null,
          requestId: params.requestId ?? null,
          provider: params.provider ?? null,
          model: params.model ?? null,
          createdAt: new Date(),
        },
      };
    }
    if (params.requestId) {
      const existing = await client.billingLedger.findFirst({
        where: {
          tenantId: params.tenantId,
          requestId: params.requestId,
          entryType,
        },
      });
      if (existing) {
        return { inserted: false as const, entry: existing };
      }
    }

    const entry = await client.billingLedger.create({
      data: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId ?? null,
        runId: params.runId ?? null,
        entryType,
        amountCents: params.amountCents,
        currency: params.currency ?? "BRL",
        description: params.description ?? null,
        requestId: params.requestId ?? null,
        provider: params.provider ?? null,
        model: params.model ?? null,
      },
    });

    return { inserted: true as const, entry };
  }
}

export class QuotaUsageService {
  constructor(private readonly prisma: PrismaClient) {}

  async resolveCycle(params: {
    tenantId: string;
    referenceDate?: Date;
  }): Promise<UsageCycle> {
    const client = getClientWithTenantBillingV2(this.prisma);
    if (!client) {
      return defaultCycle(params.referenceDate ?? new Date());
    }
    const account = await client.tenantBillingAccount.findUnique({
      where: { tenantId: params.tenantId },
      select: { cycleAnchorDay: true },
    });

    const anchorDay = normalizeAnchorDay(account?.cycleAnchorDay);
    return computeCycleWindow(params.referenceDate ?? new Date(), anchorDay);
  }

  async refreshFromLedger(params: {
    tenantId: string;
    referenceDate?: Date;
  }) {
    const client = getClientWithTenantBillingV2(this.prisma);
    const cycle = await this.resolveCycle(params);
    if (!client) {
      return {
        usage: {
          id: `usage-unavailable:${params.tenantId}`,
          tenantId: params.tenantId,
          cycleStart: cycle.cycleStart,
          cycleEnd: cycle.cycleEnd,
          runs: 0,
          costCents: 0,
          tokens: 0,
          storageMb: 0,
          updatedAt: new Date(),
        },
        cycle,
      };
    }
    const [sumResult, debitRuns] = await Promise.all([
      client.billingLedger.aggregate({
        where: {
          tenantId: params.tenantId,
          createdAt: { gte: cycle.cycleStart, lt: cycle.cycleEnd },
        },
        _sum: {
          amountCents: true,
        },
      }),
      client.billingLedger.count({
        where: {
          tenantId: params.tenantId,
          entryType: "debit",
          amountCents: { gt: 0 },
          createdAt: { gte: cycle.cycleStart, lt: cycle.cycleEnd },
        },
      }),
    ]);

    const usage = await client.tenantQuotaUsage.upsert({
      where: {
        tenantId_cycleStart_cycleEnd: {
          tenantId: params.tenantId,
          cycleStart: cycle.cycleStart,
          cycleEnd: cycle.cycleEnd,
        },
      },
      create: {
        tenantId: params.tenantId,
        cycleStart: cycle.cycleStart,
        cycleEnd: cycle.cycleEnd,
        runs: debitRuns,
        costCents: sumResult._sum.amountCents ?? 0,
      },
      update: {
        runs: debitRuns,
        costCents: sumResult._sum.amountCents ?? 0,
        updatedAt: new Date(),
      },
    });

    return { usage, cycle };
  }

  async incrementFromEvent(params: {
    tenantId: string;
    amountCents: number;
    entryType: LedgerEntryType;
    tokensDelta?: number;
    storageMbDelta?: number;
    referenceDate?: Date;
  }) {
    const client = getClientWithTenantBillingV2(this.prisma);
    const cycle = await this.resolveCycle({
      tenantId: params.tenantId,
      referenceDate: params.referenceDate,
    });
    if (!client) {
      return {
        usage: {
          id: `usage-unavailable:${params.tenantId}`,
          tenantId: params.tenantId,
          cycleStart: cycle.cycleStart,
          cycleEnd: cycle.cycleEnd,
          runs: 0,
          costCents: 0,
          tokens: 0,
          storageMb: 0,
          updatedAt: new Date(),
        },
        cycle,
      };
    }

    const runDelta = params.entryType === "debit" && params.amountCents > 0 ? 1 : 0;
    const tokenDelta = Number.isFinite(params.tokensDelta) ? Number(params.tokensDelta) : 0;
    const storageDelta = Number.isFinite(params.storageMbDelta) ? Number(params.storageMbDelta) : 0;

    const usage = await client.tenantQuotaUsage.upsert({
      where: {
        tenantId_cycleStart_cycleEnd: {
          tenantId: params.tenantId,
          cycleStart: cycle.cycleStart,
          cycleEnd: cycle.cycleEnd,
        },
      },
      create: {
        tenantId: params.tenantId,
        cycleStart: cycle.cycleStart,
        cycleEnd: cycle.cycleEnd,
        runs: runDelta,
        costCents: params.amountCents,
        tokens: tokenDelta,
        storageMb: storageDelta,
      },
      update: {
        runs: { increment: runDelta },
        costCents: { increment: params.amountCents },
        tokens: { increment: tokenDelta },
        storageMb: { increment: storageDelta },
        updatedAt: new Date(),
      },
    });

    return { usage, cycle };
  }
}

export function isTenantBillingV2ShadowEnabled() {
  const raw = (process.env.TENANT_BILLING_V2_SHADOW ?? "false").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function getTenantBillingV2GuardMode(): TenantBillingGuardMode {
  const raw = (process.env.TENANT_BILLING_V2_GUARD_MODE ?? "shadow").trim().toLowerCase();
  if (raw === "hard" || raw === "soft" || raw === "shadow") return raw;
  return "shadow";
}

function calculatePercentLimit(limit: number, pct: number) {
  return Math.floor((limit * pct) / 100);
}

export async function ensureTenantBillingDefaults(
  prisma: PrismaClient,
  scope: TenantScope & { workspaceId: string }
) {
  if (!getClientWithTenantBillingV2(prisma)) return;
  const policyService = new QuotaPolicyService(prisma);
  await policyService.resolveTenantPolicy(scope.tenantId);
  await policyService.resolveWorkspaceGrant({
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
  });
}

export async function evaluateTenantBillingExecutionGuard(params: {
  prisma: PrismaClient;
  tenantId: string;
  workspaceId: string;
  estimatedRunCostCents: number;
  mode?: TenantBillingGuardMode;
}): Promise<TenantBillingGuardDecision> {
  if (!getClientWithTenantBillingV2(params.prisma)) {
    return {
      mode: params.mode ?? getTenantBillingV2GuardMode(),
      block: false,
      workspaceEnabled: true,
      reasons: [],
      cycle: defaultCycle(),
    };
  }
  const mode = params.mode ?? getTenantBillingV2GuardMode();
  await ensureTenantBillingDefaults(params.prisma, {
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
  });

  const policyService = new QuotaPolicyService(params.prisma);
  const usageService = new QuotaUsageService(params.prisma);

  const [policy, workspaceGrant, usageSnapshot] = await Promise.all([
    policyService.resolveTenantPolicy(params.tenantId),
    policyService.resolveWorkspaceGrant({
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
    }),
    usageService.refreshFromLedger({ tenantId: params.tenantId }),
  ]);

  const currentRuns = usageSnapshot.usage.runs ?? 0;
  const currentCost = usageSnapshot.usage.costCents ?? 0;
  const projectedRuns = currentRuns + 1;
  const projectedCost = currentCost + params.estimatedRunCostCents;

  const reasons: TenantBillingGuardReason[] = [];
  const workspaceEnabled = workspaceGrant?.enabled !== false;

  if (!workspaceEnabled) {
    reasons.push({
      code: "WORKSPACE_GRANT_DISABLED",
      message: "Workspace desabilitado para execucao.",
      current: 0,
      projected: 0,
      limit: 0,
    });
  }

  if (workspaceGrant?.localRunLimit != null && projectedRuns > workspaceGrant.localRunLimit) {
    reasons.push({
      code: "WORKSPACE_RUNS_LIMIT",
      message: "Workspace excede limite local de runs.",
      current: currentRuns,
      projected: projectedRuns,
      limit: workspaceGrant.localRunLimit,
    });
  }

  if (workspaceGrant?.localCostCentsLimit != null && projectedCost > workspaceGrant.localCostCentsLimit) {
    reasons.push({
      code: "WORKSPACE_COST_LIMIT",
      message: "Workspace excede limite local de custo.",
      current: currentCost,
      projected: projectedCost,
      limit: workspaceGrant.localCostCentsLimit,
    });
  }

  if (policy?.monthlyRunsLimit != null) {
    const softLimit = calculatePercentLimit(policy.monthlyRunsLimit, policy.softLimitPct);
    const hardLimit = calculatePercentLimit(policy.monthlyRunsLimit, policy.hardLimitPct);
    if (projectedRuns >= softLimit && projectedRuns < hardLimit) {
      reasons.push({
        code: "TENANT_RUNS_SOFT_LIMIT",
        message: "Tenant no limite soft de runs do ciclo.",
        current: currentRuns,
        projected: projectedRuns,
        limit: softLimit,
      });
    }
    if (projectedRuns >= hardLimit) {
      reasons.push({
        code: "TENANT_RUNS_HARD_LIMIT",
        message: "Tenant no limite hard de runs do ciclo.",
        current: currentRuns,
        projected: projectedRuns,
        limit: hardLimit,
      });
    }
  }

  if (policy?.monthlyCostCentsLimit != null) {
    const softLimit = calculatePercentLimit(policy.monthlyCostCentsLimit, policy.softLimitPct);
    const hardLimit = calculatePercentLimit(policy.monthlyCostCentsLimit, policy.hardLimitPct);
    if (projectedCost >= softLimit && projectedCost < hardLimit) {
      reasons.push({
        code: "TENANT_COST_SOFT_LIMIT",
        message: "Tenant no limite soft de custo do ciclo.",
        current: currentCost,
        projected: projectedCost,
        limit: softLimit,
      });
    }
    if (projectedCost >= hardLimit) {
      reasons.push({
        code: "TENANT_COST_HARD_LIMIT",
        message: "Tenant no limite hard de custo do ciclo.",
        current: currentCost,
        projected: projectedCost,
        limit: hardLimit,
      });
    }
  }

  const hasHardReason =
    reasons.some((reason) =>
      ["WORKSPACE_GRANT_DISABLED", "WORKSPACE_RUNS_LIMIT", "WORKSPACE_COST_LIMIT", "TENANT_RUNS_HARD_LIMIT", "TENANT_COST_HARD_LIMIT"].includes(reason.code)
    );

  return {
    mode,
    block: mode === "hard" && hasHardReason,
    workspaceEnabled,
    reasons,
    cycle: usageSnapshot.cycle,
  };
}
