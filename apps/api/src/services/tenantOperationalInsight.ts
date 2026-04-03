import { PrismaClient } from "@repo/db";
import { summarizeFrictionEvents } from "./frictionEventAggregator";
import { readTenantEfficiencyIntelligence } from "./optimizationRecommendationAggregator";
import { readTenantEconomyOpportunitySnapshot } from "./economyOpportunityAggregator";
import { buildOperationalInsight } from "./operationalInsightAggregator";
import { type ExperienceDiagnosticsWindow } from "../types/experienceDiagnosticSnapshot";

export async function readTenantOperationalInsight(
  prisma: PrismaClient,
  params: {
    tenantId: string;
    workspaceId: string;
    window: ExperienceDiagnosticsWindow;
  }
) {
  const windowStart = new Date(
    Date.now() - (params.window === "7d" ? 7 : 30) * 24 * 60 * 60 * 1000
  );

  const [frictionSummary, efficiencyIntelligence, economyOpportunitySnapshot] = await Promise.all([
    summarizeFrictionEvents({
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      windowStart,
      limit: 200,
    }),
    readTenantEfficiencyIntelligence(prisma, {
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
    }),
    readTenantEconomyOpportunitySnapshot(prisma, {
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
    }),
  ]);

  const operationalInsightSnapshot = buildOperationalInsight({
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    window: params.window,
    frictionSummary,
    optimizationSnapshot: efficiencyIntelligence.snapshot,
  });

  return {
    window: params.window,
    frictionSummary,
    optimizationSnapshot: efficiencyIntelligence.snapshot,
    economyOpportunitySnapshot,
    operationalInsightSnapshot,
  };
}
