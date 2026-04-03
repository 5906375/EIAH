import { PrismaClient } from "@repo/db";
import { QuotaUsageService, getAgentBillingSummary } from "./tenantBilling";
import { buildEfficiencyRecommendationBundle } from "./efficiencyIntelligence";
import {
  buildOptimizationRecommendationSnapshot,
  OptimizationRecommendationSnapshot,
} from "../types/optimizationRecommendationSnapshot";
import { buildFleetPolicyOpportunityContract } from "../types/fleetPolicyOpportunityContract";

type WorkspaceCostItem = {
  workspaceId: string;
  workspaceName: string;
  runs: number;
  costCents: number;
};

type ModelCostItem = {
  provider: string;
  model: string;
  costCents: number;
  tokens: number;
};

type BuildTenantEfficiencyIntelligenceParams = {
  tenantId: string;
  workspaceId?: string;
  cycleStart: Date;
  cycleEnd: Date;
  totalCostCents: number;
  byWorkspace: WorkspaceCostItem[];
  byAgent: Awaited<ReturnType<typeof getAgentBillingSummary>>;
  byModel: ModelCostItem[];
};

type ReadTenantEfficiencyIntelligenceParams = {
  tenantId: string;
  workspaceId?: string;
  cycleStart?: Date;
  cycleEnd?: Date;
};

function getTenantBillingV2Client(prisma: PrismaClient) {
  const client = prisma as any;
  const hasV2 =
    client &&
    typeof client === "object" &&
    client.tenantBillingAccount &&
    client.tenantQuotaPolicy &&
    client.tenantQuotaUsage &&
    client.workspaceQuotaGrant &&
    client.billingLedger;
  return hasV2 ? client : null;
}

function buildOptimizationSnapshotFromBundle(params: {
  tenantId: string;
  workspaceId?: string;
  cycleStart: Date;
  cycleEnd: Date;
  bundle: ReturnType<typeof buildEfficiencyRecommendationBundle>;
  byModel: ModelCostItem[];
  byAgent: Awaited<ReturnType<typeof getAgentBillingSummary>>;
}): OptimizationRecommendationSnapshot {
  const byType = params.bundle.items.reduce<Record<string, number>>((acc, item) => {
    acc[item.recommendationType] = (acc[item.recommendationType] ?? 0) + 1;
    return acc;
  }, {});
  const byWorkspace = params.bundle.items.reduce<Record<string, number>>((acc, item) => {
    const key = item.workspaceId ?? "tenant_scope";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const byWorkspaceSavings = params.bundle.items.reduce<Record<string, number>>((acc, item) => {
    const key = item.workspaceId ?? "tenant_scope";
    acc[key] = (acc[key] ?? 0) + item.estimatedSavingsCents;
    return acc;
  }, {});
  const totalEstimatedSavingsCents = params.bundle.items.reduce(
    (sum, item) => sum + item.estimatedSavingsCents,
    0
  );
  const topType =
    Object.entries(byType).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const topWorkspace =
    Object.entries(byWorkspaceSavings).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const topRecommendation =
    [...params.bundle.items].sort((a, b) => b.estimatedSavingsCents - a.estimatedSavingsCents)[0] ?? null;
  const fleetPolicyCandidates = [...params.bundle.items]
    .filter(
      (item) =>
        item.recommendationType === "model_switch" || item.recommendationType === "fleet_policy_change"
    )
    .sort((a, b) => b.estimatedSavingsCents - a.estimatedSavingsCents)
    .slice(0, 3)
    .map((item) =>
      buildFleetPolicyOpportunityContract({
        subjectId: item.subjectId,
        label: item.title,
        workspaceId: item.workspaceId ?? null,
        model: item.subjectType === "model" ? item.subjectId : null,
        cycleStart: params.cycleStart,
        cycleEnd: params.cycleEnd,
        priority:
          item.estimatedSavingsCents >= 50_000
            ? "high"
            : item.estimatedSavingsCents >= 20_000
            ? "medium"
            : "low",
        currentCostCents: item.currentCostCents,
        estimatedSavingsCents: item.estimatedSavingsCents,
        confidence: item.confidence,
        recommendationType: item.recommendationType,
        suggestedAction:
          item.recommendationType === "model_switch"
            ? {
                actionType: "review_model_default",
                label: "Revisar modelo padrão do fluxo dominante",
              }
            : item.subjectType === "workspace"
            ? {
                actionType: "rebalance_workspace_policy",
                label: "Rebalancear policy do workspace dominante",
              }
            : {
                actionType: "review_agent_model_mix",
                label: "Revisar mix agente/modelo antes de policy global",
              },
      })
    );
  const summary =
    params.bundle.items.length === 0
      ? "Nenhuma recomendação heurística de eficiência gerada para o ciclo atual."
      : `Foram geradas ${params.bundle.items.length} recomendações heurísticas com economia potencial agregada de ${(
          totalEstimatedSavingsCents / 100
        ).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.`;

  return buildOptimizationRecommendationSnapshot({
    scope: {
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      cycleStart: params.cycleStart,
      cycleEnd: params.cycleEnd,
    },
    generatedAt: params.bundle.generatedAt,
    total: params.bundle.items.length,
    totalEstimatedSavingsCents,
    sourceOfTruth: {
      cost: "billing_ledger",
      usage: "run_usage_breakdown",
      agents: "agent_billing_summary",
    },
    byType,
    byWorkspace,
    byWorkspaceSavings,
    topType,
    topWorkspace,
    topRecommendation: topRecommendation
      ? {
          id: topRecommendation.id,
          title: topRecommendation.title,
          recommendationType: topRecommendation.recommendationType,
          subjectType: topRecommendation.subjectType,
          subjectId: topRecommendation.subjectId,
          workspaceId: topRecommendation.workspaceId,
          estimatedSavingsCents: topRecommendation.estimatedSavingsCents,
          confidence: topRecommendation.confidence,
        }
      : null,
    fleetPolicyCandidates,
    summary,
    items: params.bundle.items.map((item) => ({
      id: item.id,
      title: item.title,
      recommendationType: item.recommendationType,
      subjectType: item.subjectType,
      subjectId: item.subjectId,
      workspaceId: item.workspaceId,
      estimatedSavingsCents: item.estimatedSavingsCents,
      confidence: item.confidence,
    })),
  });
}

export function buildTenantEfficiencyIntelligence(params: BuildTenantEfficiencyIntelligenceParams) {
  const bundle = buildEfficiencyRecommendationBundle({
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    cycleStart: params.cycleStart,
    cycleEnd: params.cycleEnd,
    totalCostCents: params.totalCostCents,
    byWorkspace: params.byWorkspace,
    byAgent: params.byAgent,
    byModel: params.byModel,
  });

  const snapshot = buildOptimizationSnapshotFromBundle({
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    cycleStart: params.cycleStart,
    cycleEnd: params.cycleEnd,
    bundle,
    byModel: params.byModel,
    byAgent: params.byAgent,
  });

  return { bundle, snapshot };
}

export async function readTenantEfficiencyIntelligence(
  prisma: PrismaClient,
  params: ReadTenantEfficiencyIntelligenceParams
) {
  const client = getTenantBillingV2Client(prisma);
  const cycle =
    params.cycleStart && params.cycleEnd
      ? { cycleStart: params.cycleStart, cycleEnd: params.cycleEnd }
      : await new QuotaUsageService(prisma).resolveCycle({ tenantId: params.tenantId });

  if (!client) {
    return buildTenantEfficiencyIntelligence({
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      cycleStart: cycle.cycleStart,
      cycleEnd: cycle.cycleEnd,
      totalCostCents: 0,
      byWorkspace: [],
      byAgent: [],
      byModel: [],
    });
  }

  const [entries, byAgent, byModelRaw, workspaces] = await Promise.all([
    client.billingLedger.findMany({
      where: {
        tenantId: params.tenantId,
        createdAt: { gte: cycle.cycleStart, lt: cycle.cycleEnd },
      },
      select: {
        workspaceId: true,
        entryType: true,
        amountCents: true,
      },
    }),
    getAgentBillingSummary(prisma, {
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      cycleStart: cycle.cycleStart,
      cycleEnd: cycle.cycleEnd,
    }),
    client.runUsageBreakdown.findMany({
      where: {
        tenantId: params.tenantId,
        ...(params.workspaceId ? { workspaceId: params.workspaceId } : {}),
        createdAt: { gte: cycle.cycleStart, lt: cycle.cycleEnd },
      },
      select: {
        provider: true,
        model: true,
        amountCents: true,
        totalTokens: true,
      },
    }),
    client.workspace.findMany({
      where: { tenantId: params.tenantId },
      select: { id: true, name: true },
    }),
  ]);

  const workspaceNameById = new Map(workspaces.map((ws: { id: string; name: string }) => [ws.id, ws.name]));
  const byWorkspace = new Map<string, WorkspaceCostItem>();
  const byModel = new Map<string, ModelCostItem>();
  let totalCostCents = 0;

  for (const entry of entries) {
    const amount = Number(entry.amountCents ?? 0);
    totalCostCents += amount;
    const key = entry.workspaceId ?? "workspace:unknown";
    const current = byWorkspace.get(key) ?? {
      workspaceId: entry.workspaceId ?? "unknown",
      workspaceName: entry.workspaceId ? workspaceNameById.get(entry.workspaceId) ?? entry.workspaceId : "Sem workspace",
      runs: 0,
      costCents: 0,
    };
    current.costCents += amount;
    if (entry.entryType === "debit" && amount > 0) current.runs += 1;
    byWorkspace.set(key, current);
  }

  for (const item of byModelRaw) {
    const key = `${item.provider}::${item.model}`;
    const current = byModel.get(key) ?? {
      provider: item.provider,
      model: item.model,
      costCents: 0,
      tokens: 0,
    };
    current.costCents += Number(item.amountCents ?? 0);
    current.tokens += Number(item.totalTokens ?? 0);
    byModel.set(key, current);
  }

  return buildTenantEfficiencyIntelligence({
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    cycleStart: cycle.cycleStart,
    cycleEnd: cycle.cycleEnd,
    totalCostCents,
    byWorkspace: Array.from(byWorkspace.values()).sort((a, b) => a.workspaceName.localeCompare(b.workspaceName)),
    byAgent,
    byModel: Array.from(byModel.values()).sort((a, b) =>
      `${a.provider}:${a.model}`.localeCompare(`${b.provider}:${b.model}`)
    ),
  });
}
