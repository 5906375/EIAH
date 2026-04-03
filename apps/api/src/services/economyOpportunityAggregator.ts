import { PrismaClient } from "@repo/db";
import { readTenantEfficiencyIntelligence } from "./optimizationRecommendationAggregator";
import { buildEconomyOpportunitySnapshot } from "../types/economyOpportunitySnapshot";

export async function readTenantEconomyOpportunitySnapshot(
  prisma: PrismaClient,
  params: {
    tenantId: string;
    workspaceId?: string;
    cycleStart?: Date;
    cycleEnd?: Date;
  }
) {
  const efficiency = await readTenantEfficiencyIntelligence(prisma, params);
  const scope = efficiency.snapshot.scope;

  const client = prisma as any;
  const hasV2 =
    client &&
    typeof client === "object" &&
    client.billingLedger &&
    client.tenantQuotaUsage &&
    client.runUsageBreakdown;

  let amountCents = 0;
  let status: "clear" | "attention_required" = "clear";
  let classification: "healthy" | "watch" | "critical" = "healthy";
  let reasonCodes: string[] = [];

  if (hasV2) {
    const [billingRows, usage] = await Promise.all([
      client.billingLedger.findMany({
        where: {
          tenantId: params.tenantId,
          ...(params.workspaceId ? { workspaceId: params.workspaceId } : {}),
          createdAt: { gte: scope.cycleStart, lt: scope.cycleEnd },
        },
        select: { amountCents: true },
      }),
      client.tenantQuotaUsage.findUnique({
        where: {
          tenant_quota_usage_cycle_unique: {
            tenantId: params.tenantId,
            cycleStart: scope.cycleStart,
            cycleEnd: scope.cycleEnd,
          },
        },
      }),
    ]);

    amountCents = billingRows.reduce((sum: number, row: { amountCents: number }) => sum + Number(row.amountCents ?? 0), 0);
    if (amountCents > 0 && !usage) {
      status = "attention_required";
      reasonCodes = ["usage_cycle_missing"];
      classification = amountCents >= 100_000 ? "critical" : "watch";
    }
  }

  const costOpportunities = efficiency.bundle.items
    .filter((item) => item.recommendationType === "cost_opportunity")
    .map((item) => ({
      id: item.id,
      title: item.title,
      workspaceId: item.workspaceId ?? null,
      estimatedSavingsCents: item.estimatedSavingsCents,
      confidence: item.confidence,
    }));

  const fleetPolicyOpportunities = efficiency.snapshot.fleetPolicyCandidates;
  const topPriority =
    status === "attention_required"
      ? "auditable_cost_attention"
      : fleetPolicyOpportunities.length > 0
      ? "fleet_policy"
      : costOpportunities.length > 0
      ? "cost_opportunity"
      : null;

  const summary =
    topPriority === "auditable_cost_attention"
      ? "Há atenção auditável pendente no ciclo atual; revise reconciliação antes de ampliar automação econômica."
      : topPriority === "fleet_policy"
      ? `Há ${fleetPolicyOpportunities.length} oportunidade(s) de fleet policy no ciclo atual.`
      : topPriority === "cost_opportunity"
      ? `Há ${costOpportunities.length} oportunidade(s) diretas de custo no ciclo atual.`
      : "Nenhuma oportunidade econômica consolidada no ciclo atual.";

  const consolidatedClassification =
    classification === "critical"
      ? "critical"
      : classification === "watch" || topPriority !== null
      ? "watch"
      : "healthy";
  const topStatus = consolidatedClassification;

  const consolidatedSummary =
    consolidatedClassification === "critical"
      ? "Economia consolidada em estado crítico por atenção auditável material no ciclo atual."
      : consolidatedClassification === "watch"
      ? topPriority === "auditable_cost_attention"
        ? "Economia consolidada em observação por atenção auditável aberta."
        : topPriority === "fleet_policy"
        ? "Economia consolidada em observação com oportunidades aplicáveis de fleet policy."
        : topPriority === "cost_opportunity"
        ? "Economia consolidada em observação com oportunidades diretas de redução de custo."
        : "Economia consolidada em observação no ciclo atual."
      : "Economia consolidada saudável no ciclo atual.";

  const tenantRecommendation =
    topStatus === "critical"
      ? "Priorize reconciliação auditável antes de expandir automação econômica ou promover novas políticas."
      : topStatus === "watch"
      ? topPriority === "fleet_policy"
        ? "Revise e aplique a principal oportunidade de fleet policy antes do próximo ciclo."
        : topPriority === "cost_opportunity"
        ? "Aplique a principal oportunidade de custo e acompanhe o efeito no próximo ciclo."
        : "Revise a atenção auditável e as oportunidades abertas antes de ampliar execução."
      : "Mantenha a política atual e monitore a próxima janela econômica do tenant.";

  return buildEconomyOpportunitySnapshot({
    scope,
    sourceOfTruth: {
      cost: "billing_ledger",
      usage: "run_usage_breakdown",
      audit: "billing_reconciliation",
    },
    generatedAt: new Date(),
    total: costOpportunities.length + fleetPolicyOpportunities.length + (status === "attention_required" ? 1 : 0),
    topStatus,
    topPriority,
    consolidatedClassification,
    tenantRecommendation,
    consolidatedSummary,
    summary,
    costOpportunities,
    fleetPolicyOpportunities,
    auditableCostAttention: {
      status,
      classification,
      summary:
        status === "attention_required"
          ? "Custo auditável requer atenção porque o ciclo possui ledger financeiro sem consolidação completa de usage."
          : "Sem atenção auditável aberta no ciclo atual.",
      amountCents,
      reasonCodes,
    },
  });
}
