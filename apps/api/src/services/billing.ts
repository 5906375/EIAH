import { PrismaClient, prismaGlobal } from "@repo/db";
import { emitRunEvent } from "./runEventEmitter";
import {
  BillingLedgerService,
  QuotaUsageService,
  ensureTenantBillingDefaults,
  incrementWorkspaceUsageFromEvent,
  isTenantBillingV2EnforceEnabled,
  isTenantBillingV2ShadowEnabled,
} from "./tenantBilling";

type WorkspaceScope = { tenantId: string; workspaceId: string };

type RecordRunUsageBreakdownParams = {
  tenantId: string;
  workspaceId: string;
  runId: string;
  agent: string;
  agentVersion?: string | null;
  provider: string;
  model: string;
  pricingVersion: string;
  requestId: string;
  traceId?: string | null;
  meterType: string;
  requestClass: string;
  promptTokens?: number;
  completionTokens?: number;
  cachedTokens?: number;
  totalTokens?: number;
  amountCents: number;
  currency?: string;
  estimated?: boolean;
  prisma?: PrismaClient;
};

/**
 * Cria o client tenant-aware para qualquer operação de billing.
 * Substitui o prisma global, garantindo isolamento e enforcement via tenantGuard.
 */
function resolveClient(
  tenantId: string,
  workspaceId: string,
  client?: PrismaClient
) {
  return client ?? prismaGlobal;
}

/**
 * Verifica se o workspace pertence ao tenant informado.
 */
async function workspaceBelongsToTenant(
  client: PrismaClient,
  scope: WorkspaceScope
) {
  const workspace = await client.workspace.findUnique({
    where: { id: scope.workspaceId },
    select: { tenantId: true },
  });
  return workspace?.tenantId === scope.tenantId;
}

/**
 * Verifica se o run pertence ao mesmo tenant e workspace.
 */
async function runBelongsToTenantWorkspace(
  client: PrismaClient,
  scope: WorkspaceScope & { runId: string }
) {
  const run = await client.run.findUnique({
    where: { id: scope.runId },
    select: { tenantId: true, workspaceId: true },
  });
  return (
    run?.tenantId === scope.tenantId && run?.workspaceId === scope.workspaceId
  );
}

/**
 * Calcula custo estimado em centavos de um run (baseado em pricing ativo).
 * Multi-tenant seguro: client vem de prismaGlobal.
 */
export async function estimateCostCents(params: {
  agent: string;
  inputBytes: number;
  tools?: string[];
  tenantId: string;
  workspaceId: string;
  prisma?: PrismaClient;
}) {
  const client = resolveClient(params.tenantId, params.workspaceId, params.prisma);
  const allowed = await workspaceBelongsToTenant(client, {
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
  });
  if (!allowed) return null;

  const pricing = await client.pricing.findFirst({
    where: { agent: params.agent, active: true },
  });

  const perRun = pricing?.perRunCents ?? 0;
  const perMB = pricing?.perMBcents ?? 0;
  const mb = Math.ceil(params.inputBytes / (1024 * 1024));

  return perRun + perMB * mb;
}

export async function recordRunUsageBreakdown(params: RecordRunUsageBreakdownParams) {
  const client = resolveClient(params.tenantId, params.workspaceId, params.prisma);
  const runInScope = await runBelongsToTenantWorkspace(client, {
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    runId: params.runId,
  });
  if (!runInScope) {
    return { inserted: false as const, item: null };
  }

  const existing = await client.runUsageBreakdown.findUnique({
    where: {
      run_usage_breakdown_idempotency_unique: {
        runId: params.runId,
        requestId: params.requestId,
        meterType: params.meterType,
      },
    },
  });
  if (existing) {
    return { inserted: false as const, item: existing };
  }

  const item = await client.runUsageBreakdown.create({
    data: {
      runId: params.runId,
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      agent: params.agent,
      agentVersion: params.agentVersion ?? null,
      provider: params.provider,
      model: params.model,
      pricingVersion: params.pricingVersion,
      requestId: params.requestId,
      traceId: params.traceId ?? null,
      meterType: params.meterType,
      requestClass: params.requestClass,
      promptTokens: params.promptTokens ?? 0,
      completionTokens: params.completionTokens ?? 0,
      cachedTokens: params.cachedTokens ?? 0,
      totalTokens:
        params.totalTokens ??
        (params.promptTokens ?? 0) + (params.completionTokens ?? 0) + (params.cachedTokens ?? 0),
      amountCents: params.amountCents,
      currency: params.currency ?? "BRL",
      estimated: params.estimated ?? false,
    },
  });

  return { inserted: true as const, item };
}

export async function deriveRunCostCents(params: {
  tenantId: string;
  workspaceId: string;
  runId: string;
  prisma?: PrismaClient;
}) {
  const client = resolveClient(params.tenantId, params.workspaceId, params.prisma);
  const aggregate = await client.runUsageBreakdown.aggregate({
    where: {
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      runId: params.runId,
    },
    _sum: {
      amountCents: true,
    },
  });
  return aggregate._sum.amountCents ?? 0;
}

export async function listRunUsageBreakdowns(params: {
  tenantId: string;
  workspaceId: string;
  runId: string;
  prisma?: PrismaClient;
}) {
  const client = resolveClient(params.tenantId, params.workspaceId, params.prisma);
  return client.runUsageBreakdown.findMany({
    where: {
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      runId: params.runId,
    },
    orderBy: [{ createdAt: "asc" }, { meterType: "asc" }],
  });
}

export async function chargeRunFromBreakdown(params: {
  tenantId: string;
  workspaceId: string;
  runId: string;
  requestId: string;
  provider?: string | null;
  model?: string | null;
  prisma?: PrismaClient;
}) {
  const client = resolveClient(params.tenantId, params.workspaceId, params.prisma);
  const run = await client.run.findUnique({
    where: { id: params.runId },
    select: {
      id: true,
      tenantId: true,
      workspaceId: true,
      traceId: true,
    },
  });
  if (!run || run.tenantId !== params.tenantId || run.workspaceId !== params.workspaceId) {
    return false;
  }

  const breakdowns = await client.runUsageBreakdown.findMany({
    where: {
      runId: params.runId,
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
    },
    orderBy: { createdAt: "asc" },
  });
  if (breakdowns.length === 0) {
    return false;
  }

  const costCents = await deriveRunCostCents({
    prisma: client,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    runId: params.runId,
  });
  const totalTokens = breakdowns.reduce((sum, item) => sum + (item.totalTokens ?? 0), 0);

  await client.run.update({
    where: { id: params.runId },
    data: {
      costCents,
      traceId: run.traceId ?? breakdowns.find((item) => item.traceId)?.traceId ?? null,
    },
  });

  const enforceV2 = isTenantBillingV2EnforceEnabled();
  const writeShadow = isTenantBillingV2ShadowEnabled();
  const shouldWriteV2 = true;

  if (!enforceV2) {
    await client.planQuota
      .update({
        where: { projectId: params.workspaceId },
        data: { monthUsageCents: { increment: costCents } },
      })
      .catch(async () => {
        await client.planQuota.create({
          data: {
            projectId: params.workspaceId,
            softLimitCents: 5000,
            hardLimitCents: 10000,
            monthUsageCents: costCents,
          },
        });
      });
  }

  if (shouldWriteV2) {
    try {
      await ensureTenantBillingDefaults(client, {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
      });

      const ledgerService = new BillingLedgerService(client);
      const quotaUsageService = new QuotaUsageService(client);
      const ledger = await ledgerService.insertDebit({
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        runId: params.runId,
        amountCents: costCents,
        currency: breakdowns[0]?.currency ?? "BRL",
        description: enforceV2 ? "Enforced charge for run execution" : "Shadow charge for run execution",
        requestId: params.requestId,
        provider: params.provider ?? breakdowns[0]?.provider ?? null,
        model: params.model ?? breakdowns[0]?.model ?? null,
      });

      if (ledger.inserted) {
        const usageSnapshot = await quotaUsageService.incrementFromEvent({
          tenantId: params.tenantId,
          amountCents: costCents,
          entryType: "debit",
          tokensDelta: totalTokens,
        });
        await incrementWorkspaceUsageFromEvent(client, {
          tenantId: params.tenantId,
          workspaceId: params.workspaceId,
          cycleStart: usageSnapshot.cycle.cycleStart,
          cycleEnd: usageSnapshot.cycle.cycleEnd,
          runs: costCents > 0 ? 1 : 0,
          costCents,
          tokens: totalTokens,
        });

        await emitRunEvent({
          runId: params.runId,
          tenantId: params.tenantId,
          workspaceId: params.workspaceId,
          type: "billing.usage.updated",
          payload: {
            mode: enforceV2 ? "enforce" : "shadow",
            ledgerId: ledger.entry.id,
            requestId: params.requestId,
            cycleStart: usageSnapshot.cycle.cycleStart.toISOString(),
            cycleEnd: usageSnapshot.cycle.cycleEnd.toISOString(),
            usage: {
              runs: usageSnapshot.usage.runs,
              costCents: usageSnapshot.usage.costCents,
              tokens: usageSnapshot.usage.tokens,
              storageMb: usageSnapshot.usage.storageMb,
            },
          },
        });
      }
    } catch (error) {
      console.warn("[tenant-billing-v2] failed to write tenant usage", {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        runId: params.runId,
        enforceV2,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  await emitRunEvent({
    runId: params.runId,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    type: "run.usage_recorded",
    payload: {
      costCents,
      mode: enforceV2 ? "enforce" : writeShadow ? "shadow" : "legacy",
      requestId: params.requestId,
      traceId: run.traceId,
      breakdownCount: breakdowns.length,
    },
  });

  return true;
}

/**
 * Registra a cobrança de um run e atualiza quota de consumo.
 */
export async function chargeRun(params: {
  tenantId: string;
  workspaceId: string;
  runId: string;
  costCents: number;
  prisma?: PrismaClient;
}) {
  const client = resolveClient(params.tenantId, params.workspaceId, params.prisma);
  const run = await client.run.findUnique({
    where: { id: params.runId },
    select: {
      id: true,
      tenantId: true,
      workspaceId: true,
      agent: true,
      agentVersion: true,
      traceId: true,
    },
  });
  const runInScope =
    run?.tenantId === params.tenantId && run?.workspaceId === params.workspaceId;
  if (!runInScope || !run) return false;

  const requestId = `run:${params.runId}:debit`;
  const existingBreakdowns = await listRunUsageBreakdowns({
    prisma: client,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    runId: params.runId,
  });
  const hasRunChargeBreakdown = existingBreakdowns.some((item) => item.meterType === "run");

  if (!hasRunChargeBreakdown) {
    await recordRunUsageBreakdown({
      prisma: client,
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      runId: params.runId,
      agent: run.agent,
      agentVersion: run.agentVersion,
      provider: "internal",
      model: "legacy-estimate",
      pricingVersion: "legacy-estimate:v1",
      requestId,
      traceId: run.traceId,
      meterType: "run",
      requestClass: "execution",
      amountCents: params.costCents,
      estimated: true,
    });
  }
  return chargeRunFromBreakdown({
    prisma: client,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    runId: params.runId,
    requestId,
    provider: "internal",
    model: "legacy-estimate",
  });
}

/**
 * Retorna a quota atual de uso (billing) do workspace.
 */
export async function getQuota(params: WorkspaceScope & { prisma?: PrismaClient }) {
  const client = resolveClient(params.tenantId, params.workspaceId, params.prisma);
  const allowed = await workspaceBelongsToTenant(client, params);
  if (!allowed) return null;
  const enforceV2 = isTenantBillingV2EnforceEnabled();
  const v2Client = client as any;
  const hasV2 =
    v2Client &&
    typeof v2Client === "object" &&
    v2Client.tenantQuotaPolicy &&
    v2Client.workspaceQuotaGrant &&
    v2Client.billingLedger;

  if (enforceV2 && hasV2) {
    try {
      await ensureTenantBillingDefaults(v2Client, {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
      });

      const quotaUsageService = new QuotaUsageService(v2Client);
      const cycle = await quotaUsageService.resolveCycle({ tenantId: params.tenantId });
      const [policy, workspaceGrant, workspaceCost] = await Promise.all([
        v2Client.tenantQuotaPolicy.findUnique({
          where: { tenantId: params.tenantId },
        }),
        v2Client.workspaceQuotaGrant.findUnique({
          where: {
            workspace_quota_grant_unique: {
              tenantId: params.tenantId,
              workspaceId: params.workspaceId,
            },
          },
        }),
        v2Client.billingLedger.aggregate({
          where: {
            tenantId: params.tenantId,
            workspaceId: params.workspaceId,
            createdAt: { gte: cycle.cycleStart, lt: cycle.cycleEnd },
          },
          _sum: { amountCents: true },
        }),
      ]);

      const workspaceUsage = workspaceCost?._sum?.amountCents ?? 0;
      const tenantHard = policy?.monthlyCostCentsLimit ?? null;
      const workspaceHard = workspaceGrant?.localCostCentsLimit ?? null;
      const effectiveHard = workspaceHard ?? tenantHard ?? 0;
      const softPct = policy?.softLimitPct ?? 80;
      const effectiveSoft = effectiveHard > 0 ? Math.floor((effectiveHard * softPct) / 100) : 0;
      const percent = effectiveHard > 0 ? Math.min(100, (workspaceUsage / effectiveHard) * 100) : 0;

      return {
        softLimitCents: effectiveSoft,
        hardLimitCents: effectiveHard,
        monthUsageCents: workspaceUsage,
        percent,
      };
    } catch (error) {
      console.warn("[tenant-billing-v2] failed to resolve enforced quota, falling back to legacy", {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const quota = await client.planQuota.findUnique({
    where: { projectId: params.workspaceId },
  });

  if (!quota) {
    return {
      softLimitCents: 0,
      hardLimitCents: 0,
      monthUsageCents: 0,
      percent: 0,
    } as const;
  }

  const percent = quota.hardLimitCents
    ? Math.min(100, (quota.monthUsageCents / quota.hardLimitCents) * 100)
    : 0;

  return {
    softLimitCents: quota.softLimitCents,
    hardLimitCents: quota.hardLimitCents,
    monthUsageCents: quota.monthUsageCents,
    percent,
  };
}
