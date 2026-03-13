import type { PrismaClient } from "@repo/db";

export type PlanPricingCode = "solo" | "starter" | "growth" | "scale";

export type PlanPricingProfile = {
  code: PlanPricingCode;
  label: string;
  basePriceCents: number;
  includedUsers: number;
  includedRuns: number;
  includedWorkspaces: number;
  overageRunCents: number;
  extraUserCents: number;
};

export type InvoiceComputation = {
  includedRuns: number;
  runOverage: number;
  userOverage: number;
  runOverageCents: number;
  userOverageCents: number;
  totalCents: number;
};

export type TenantInvoiceGenerationResult = {
  tenantId: string;
  periodStart: Date;
  periodEnd: Date;
  idempotent: boolean;
  invoice: {
    id: string;
    planCode: string;
    status: string;
    totalCents: number;
    runsCount: number;
    usersCount: number;
  };
};

export type TenantInvoiceBatchResult = {
  periodStart: Date;
  periodEnd: Date;
  processed: number;
  generated: number;
  idempotent: number;
  failed: Array<{ tenantId: string; error: string }>;
};

const PLAN_PRICING: Record<PlanPricingCode, PlanPricingProfile> = {
  solo: {
    code: "solo",
    label: "Solo",
    basePriceCents: 49_000,
    includedUsers: 3,
    includedRuns: 1_500,
    includedWorkspaces: 1,
    overageRunCents: 35,
    extraUserCents: 3_900,
  },
  starter: {
    code: "starter",
    label: "Starter B2B",
    basePriceCents: 149_000,
    includedUsers: 10,
    includedRuns: 5_000,
    includedWorkspaces: 2,
    overageRunCents: 30,
    extraUserCents: 3_900,
  },
  growth: {
    code: "growth",
    label: "Growth B2B",
    basePriceCents: 399_000,
    includedUsers: 25,
    includedRuns: 25_000,
    includedWorkspaces: 8,
    overageRunCents: 22,
    extraUserCents: 2_900,
  },
  scale: {
    code: "scale",
    label: "Scale B2B",
    basePriceCents: 990_000,
    includedUsers: 100,
    includedRuns: 100_000,
    includedWorkspaces: 20,
    overageRunCents: 15,
    extraUserCents: 1_900,
  },
};

function getClient(prisma: PrismaClient) {
  const client = prisma as any;
  const hasBillingV2 =
    client &&
    typeof client === "object" &&
    client.tenantBillingAccount &&
    client.tenantQuotaPolicy &&
    client.tenantQuotaUsage &&
    client.tenantInvoice &&
    client.user &&
    client.tenant;
  return hasBillingV2 ? client : null;
}

function firstDayUtc(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0));
}

export function resolvePreviousCalendarMonth(referenceDate: Date = new Date()) {
  const year = referenceDate.getUTCFullYear();
  const month = referenceDate.getUTCMonth();
  const periodEnd = firstDayUtc(year, month);
  const periodStart = firstDayUtc(month === 0 ? year - 1 : year, month === 0 ? 11 : month - 1);
  return { periodStart, periodEnd };
}

export function resolvePlanPricingProfile(planCode: string | null | undefined): PlanPricingProfile {
  const normalized = String(planCode ?? "starter").trim().toLowerCase();
  if (normalized === "solo") return PLAN_PRICING.solo;
  if (normalized === "growth") return PLAN_PRICING.growth;
  if (normalized === "scale") return PLAN_PRICING.scale;
  return PLAN_PRICING.starter;
}

export function calculateInvoiceAmounts(params: {
  plan: PlanPricingProfile;
  runsCount: number;
  usersCount: number;
  includedRunsOverride?: number | null;
}) {
  const includedRuns = params.includedRunsOverride ?? params.plan.includedRuns;
  const runOverage = Math.max(0, params.runsCount - includedRuns);
  const userOverage = Math.max(0, params.usersCount - params.plan.includedUsers);
  const runOverageCents = runOverage * params.plan.overageRunCents;
  const userOverageCents = userOverage * params.plan.extraUserCents;
  const totalCents = params.plan.basePriceCents + runOverageCents + userOverageCents;

  return {
    includedRuns,
    runOverage,
    userOverage,
    runOverageCents,
    userOverageCents,
    totalCents,
  } satisfies InvoiceComputation;
}

export async function generateMonthlyInvoice(
  prisma: PrismaClient,
  params: {
    tenantId: string;
    periodStart?: Date;
    periodEnd?: Date;
    referenceDate?: Date;
    actor?: "scheduler" | "manual" | "api";
  }
): Promise<TenantInvoiceGenerationResult> {
  const client = getClient(prisma);
  if (!client) {
    throw new Error("Tenant billing V2 / tenant invoices are unavailable in current Prisma client.");
  }

  const inferredPeriod = resolvePreviousCalendarMonth(params.referenceDate ?? new Date());
  const periodStart = params.periodStart ?? inferredPeriod.periodStart;
  const periodEnd = params.periodEnd ?? inferredPeriod.periodEnd;
  const actor = params.actor ?? "manual";

  const [account, policy, usage, usersCount, usageFromLedger] = await Promise.all([
    client.tenantBillingAccount.findUnique({
      where: { tenantId: params.tenantId },
      select: { planCode: true, currency: true },
    }),
    client.tenantQuotaPolicy.findUnique({
      where: { tenantId: params.tenantId },
      select: { monthlyRunsLimit: true },
    }),
    client.tenantQuotaUsage.findUnique({
      where: {
        tenant_quota_usage_cycle_unique: {
          tenantId: params.tenantId,
          cycleStart: periodStart,
          cycleEnd: periodEnd,
        },
      },
      select: { runs: true, costCents: true, tokens: true, storageMb: true },
    }),
    client.user.count({
      where: { tenantId: params.tenantId },
    }),
    client.billingLedger.aggregate({
      where: {
        tenantId: params.tenantId,
        entryType: "debit",
        amountCents: { gt: 0 },
        createdAt: { gte: periodStart, lt: periodEnd },
      },
      _count: { _all: true },
    }),
  ]);

  const plan = resolvePlanPricingProfile(account?.planCode);
  const runsCount = Number(usage?.runs ?? usageFromLedger._count._all ?? 0);
  const amounts = calculateInvoiceAmounts({
    plan,
    runsCount,
    usersCount,
    includedRunsOverride: policy?.monthlyRunsLimit ?? null,
  });
  const requestId = `invoice.generated:${params.tenantId}:${periodStart.toISOString()}`;

  const invoice = await client.tenantInvoice.upsert({
    where: {
      tenant_invoice_period_unique: {
        tenantId: params.tenantId,
        periodStart,
        periodEnd,
      },
    },
    create: {
      tenantId: params.tenantId,
      periodStart,
      periodEnd,
      currency: account?.currency ?? "BRL",
      planCode: plan.code,
      status: "generated",
      basePriceCents: plan.basePriceCents,
      includedRuns: amounts.includedRuns,
      includedUsers: plan.includedUsers,
      runsCount,
      usersCount,
      runOverage: amounts.runOverage,
      userOverage: amounts.userOverage,
      runOverageCents: amounts.runOverageCents,
      userOverageCents: amounts.userOverageCents,
      totalCents: amounts.totalCents,
      metadata: usage
        ? {
            usageSnapshot: {
              runs: usage.runs,
              costCents: usage.costCents,
              tokens: usage.tokens,
              storageMb: usage.storageMb,
            },
          }
        : { usageSnapshot: null },
    },
    update: {
      currency: account?.currency ?? "BRL",
      planCode: plan.code,
      status: "generated",
      basePriceCents: plan.basePriceCents,
      includedRuns: amounts.includedRuns,
      includedUsers: plan.includedUsers,
      runsCount,
      usersCount,
      runOverage: amounts.runOverage,
      userOverage: amounts.userOverage,
      runOverageCents: amounts.runOverageCents,
      userOverageCents: amounts.userOverageCents,
      totalCents: amounts.totalCents,
      metadata: usage
        ? {
            usageSnapshot: {
              runs: usage.runs,
              costCents: usage.costCents,
              tokens: usage.tokens,
              storageMb: usage.storageMb,
            },
          }
        : { usageSnapshot: null },
      updatedAt: new Date(),
    },
  });

  const existingLedgerEvent = await client.billingLedger.findFirst({
    where: {
      tenantId: params.tenantId,
      requestId,
      entryType: "adjustment",
    },
    select: { id: true },
  });
  if (!existingLedgerEvent) {
    await client.billingLedger.create({
      data: {
        tenantId: params.tenantId,
        workspaceId: null,
        runId: null,
        entryType: "adjustment",
        amountCents: 0,
        currency: account?.currency ?? "BRL",
        description: `Invoice generated for ${periodStart.toISOString().slice(0, 7)}`,
        requestId,
        provider: "internal",
        model: "invoice.generated",
      },
    });
  }

  await client.guardrailAuditLedger.create({
    data: {
      tenantId: params.tenantId,
      eventType: "invoice.generated",
      severity: "info",
      message: "Monthly tenant invoice generated.",
      metadata: {
        actor,
        period: periodStart.toISOString().slice(0, 7),
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        invoiceId: invoice.id,
        planCode: plan.code,
        totalCents: amounts.totalCents,
        runsCount,
        usersCount,
        runOverage: amounts.runOverage,
        userOverage: amounts.userOverage,
      },
    },
  });

  return {
    tenantId: params.tenantId,
    periodStart,
    periodEnd,
    idempotent: Boolean(existingLedgerEvent),
    invoice: {
      id: invoice.id,
      planCode: invoice.planCode,
      status: invoice.status,
      totalCents: invoice.totalCents,
      runsCount: invoice.runsCount,
      usersCount: invoice.usersCount,
    },
  };
}

export async function generateMonthlyInvoicesForAllTenants(
  prisma: PrismaClient,
  params: {
    periodStart?: Date;
    periodEnd?: Date;
    referenceDate?: Date;
    actor?: "scheduler" | "manual" | "api";
  } = {}
): Promise<TenantInvoiceBatchResult> {
  const client = getClient(prisma);
  if (!client) {
    throw new Error("Tenant billing V2 / tenant invoices are unavailable in current Prisma client.");
  }

  const inferredPeriod = resolvePreviousCalendarMonth(params.referenceDate ?? new Date());
  const periodStart = params.periodStart ?? inferredPeriod.periodStart;
  const periodEnd = params.periodEnd ?? inferredPeriod.periodEnd;
  const tenants = await client.tenant.findMany({
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  let generated = 0;
  let idempotent = 0;
  const failed: Array<{ tenantId: string; error: string }> = [];

  for (const tenant of tenants) {
    try {
      const result = await generateMonthlyInvoice(prisma, {
        tenantId: tenant.id,
        periodStart,
        periodEnd,
        actor: params.actor ?? "manual",
      });
      if (result.idempotent) idempotent += 1;
      else generated += 1;
    } catch (error) {
      failed.push({
        tenantId: tenant.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    periodStart,
    periodEnd,
    processed: tenants.length,
    generated,
    idempotent,
    failed,
  };
}
