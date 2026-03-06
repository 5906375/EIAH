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
    const client = this.prisma as any;
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
    const client = this.prisma as any;
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
    const client = this.prisma as any;
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
    const client = this.prisma as any;
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
    const client = this.prisma as any;
    const cycle = await this.resolveCycle(params);
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
    const client = this.prisma as any;
    const cycle = await this.resolveCycle({
      tenantId: params.tenantId,
      referenceDate: params.referenceDate,
    });

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

export async function ensureTenantBillingDefaults(
  prisma: PrismaClient,
  scope: TenantScope & { workspaceId: string }
) {
  const policyService = new QuotaPolicyService(prisma);
  await policyService.resolveTenantPolicy(scope.tenantId);
  await policyService.resolveWorkspaceGrant({
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
  });
}
