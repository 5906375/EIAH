import type {
  ImobMarketScanResultSnapshot,
  ImobMarketScanRunSnapshot,
  ImobMarketSourceAccessMode,
  ImobSourceAccessDecisionSnapshot,
} from "../imobConversationContract";
import type { MarketScanExecutionContext, MarketScanQuery } from "./MarketScanProvider";
import {
  blockMarketScanRun,
  completeMarketScanRun,
  createMarketScanRun,
  markMarketScanAuthorizationStarted,
  markMarketScanFetchStarted,
  markMarketScanMatchingStarted,
  markMarketScanNormalizationStarted,
  markMarketScanRecommendationStarted,
  markMarketScanScoringStarted,
  type ImobMarketScanRunStorePrisma,
} from "./imobMarketScanRunStore";
import { matchComparables, summarizeComparableSources } from "./comparableMatcher";
import { createMarketScanGuardianEvidence } from "./guardianEvidenceHook";
import { toMarketScanResultSnapshot } from "./listingIngestionAdapter";
import { classifyMarketConfidenceBand, computeLiquidityCompetitionScore } from "./liquidityCompetitionScorer";
import { recommendOperationalOpportunity } from "./opportunityRecommender";
import { computePriceIntelligence } from "./priceIntelligenceEngine";
import { decideSourceAccess } from "./sourceAccessPolicyGate";
import { evaluateMarketScanSourceDataQuality } from "./sourceDataQualityGate";
import type { MarketScanConnectorId, MarketScanConnectorRegistry } from "./sourceConnectorRegistry";

export type MarketScanPipelineResult = {
  run: ImobMarketScanRunSnapshot;
  sourceAccessDecision: ImobSourceAccessDecisionSnapshot;
  resultSnapshot: ImobMarketScanResultSnapshot | null;
  opportunity: import("../imobConversationContract").ImobOperationalOpportunity | null;
  evidenceBundle: import("./guardianEvidenceHook").MarketScanGuardianEvidenceBundle | null;
};
function sourceIdToAccessMode(sourceId: MarketScanConnectorId): ImobMarketSourceAccessMode {
  if (sourceId === "public_web_assisted") return "public_web_assisted";
  if (sourceId === "manual_input") return "manual_input";
  if (sourceId === "tenant_inventory_import") return "tenant_inventory_import";
  return "internal_crm";
}

function isMarketScanConnectorId(value: unknown): value is MarketScanConnectorId {
  return (
    typeof value === "string"
    && ["internal_crm", "tenant_inventory_import", "manual_input", "public_web_assisted"].includes(value)
  );
}

export async function executeMarketScanPipeline(params: {
  prisma: ImobMarketScanRunStorePrisma;
  connectorRegistry: MarketScanConnectorRegistry;
  tenantId: string;
  workspaceId: string;
  caseId?: string | null;
  query: MarketScanQuery;
  sourceId?: MarketScanConnectorId;
  sourceIds?: MarketScanConnectorId[];
  context?: Partial<MarketScanExecutionContext>;
  region?: string | null;
  operation?: string | null;
  propertyType?: string | null;
  hasTenantCredential?: boolean;
  sourceAccess?: {
    requiresLogin?: boolean;
    hasCaptcha?: boolean;
    behindPaywall?: boolean;
    collectsPii?: boolean;
    bulkCollection?: boolean;
    requestedPages?: number;
    requestedResultsPerSource?: number;
  };
}) {
  const defaultSourceIds: MarketScanConnectorId[] = ["tenant_inventory_import", "internal_crm", "public_web_assisted"];
  const sourceIds: MarketScanConnectorId[] = params.sourceIds?.length
    ? params.sourceIds
    : params.sourceId
      ? [params.sourceId]
      : defaultSourceIds;

  let run = await createMarketScanRun({
    prisma: params.prisma,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    caseId: params.caseId ?? null,
    query: params.query,
    region: params.region ?? params.query.cities[0] ?? null,
    operation: params.operation ?? params.query.goals[0] ?? null,
    propertyType: params.propertyType ?? params.query.propertyTypes[0] ?? null,
    sourceIds,
    accessMode: sourceIdToAccessMode(sourceIds[0] ?? "internal_crm"),
  });

  run = await markMarketScanAuthorizationStarted({ prisma: params.prisma, runId: run.runId });

  let lastSnapshot: ImobMarketScanResultSnapshot | null = null;
  let lastDecision: ImobSourceAccessDecisionSnapshot | null = null;
  for (const sourceId of sourceIds) {
    const sourceAccessDecision = decideSourceAccess({
      sourceId,
      requestedMode: sourceIdToAccessMode(sourceId),
      operation: sourceId === "public_web_assisted" ? "public_web_assisted_scan" : "market_scan_region",
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      hasTenantCredential: params.hasTenantCredential,
      requestedPages: sourceId === "public_web_assisted" ? 1 : params.sourceAccess?.requestedPages,
      requestedResultsPerSource: sourceId === "public_web_assisted"
        ? Math.min(params.query.limitPerGroup, 20)
        : params.sourceAccess?.requestedResultsPerSource,
      ...params.sourceAccess,
    });

    lastDecision = sourceAccessDecision;
    if (!sourceAccessDecision.allowed) {
      const blocked = await blockMarketScanRun({
        prisma: params.prisma,
        runId: run.runId,
        reason: sourceAccessDecision.reasonCode,
        sourceAccessDecision,
      });
      return {
        run: blocked,
        sourceAccessDecision,
        resultSnapshot: null,
        opportunity: null,
        evidenceBundle: null,
      } satisfies MarketScanPipelineResult;
    }

    run = await markMarketScanFetchStarted({ prisma: params.prisma, runId: run.runId });
    const result = await params.connectorRegistry.search({
      sourceId,
      query: params.query,
      context: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        caseId: params.caseId ?? null,
        ...params.context,
      },
      sourceAccessDecision,
    });

    await markMarketScanNormalizationStarted({ prisma: params.prisma, runId: run.runId });
    lastSnapshot = toMarketScanResultSnapshot(result);
    if (result.sourceStatus === "completed") {
      break;
    }
  }

  const sourceAccessDecision = lastDecision ?? decideSourceAccess({
    sourceId: "internal_crm",
    requestedMode: "internal_crm",
    operation: "market_scan_region",
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
  });
  const resultSnapshot = lastSnapshot;
  let enrichedSnapshot = resultSnapshot;
  let opportunity: MarketScanPipelineResult["opportunity"] = null;
  if (resultSnapshot && sourceAccessDecision.allowed) {
    const sourceDataQuality = evaluateMarketScanSourceDataQuality(resultSnapshot);
    enrichedSnapshot = {
      ...resultSnapshot,
      sourceDataQuality,
    };
    if (sourceDataQuality.status === "blocked") {
      const evidenceBundle = createMarketScanGuardianEvidence({
        runId: run.runId,
        queryHash: run.queryHash,
        sourceSnapshot: {
          sourceIds,
          sourceAccessDecision,
          sourceDataQuality,
          totalItems: enrichedSnapshot.totalItems,
          providerId: enrichedSnapshot.providerId,
        },
        normalizedListings: enrichedSnapshot,
        recommendation: null,
      });
      const completed = await completeMarketScanRun({
        prisma: params.prisma,
        runId: run.runId,
        resultSnapshot: enrichedSnapshot,
        evidenceBundleId: evidenceBundle.evidenceBundleId,
        recommendationId: evidenceBundle.recommendationHash,
        opportunityId: null,
      });
      return {
        run: {
          ...completed,
          sourceAccessDecision,
        },
        sourceAccessDecision,
        resultSnapshot: enrichedSnapshot,
        opportunity: null,
        evidenceBundle,
      } satisfies MarketScanPipelineResult;
    }
    await markMarketScanMatchingStarted({ prisma: params.prisma, runId: run.runId });
    const comparables = matchComparables({
      snapshot: enrichedSnapshot,
      query: params.query,
    });
    const comparableSources = summarizeComparableSources(comparables);
    await markMarketScanScoringStarted({ prisma: params.prisma, runId: run.runId });
    const priceIntelligence = computePriceIntelligence(comparables);
    const scoring = computeLiquidityCompetitionScore({
      comparables,
      priceIntelligence,
      sourceAccessDecision,
    });
    const confidenceScore = Math.max(0, Number((scoring.confidenceScore - sourceDataQuality.confidencePenalty).toFixed(2)));
    enrichedSnapshot = {
      ...enrichedSnapshot,
      intelligence: {
        comparableCount: priceIntelligence.comparableCount,
        comparableSources,
        priceRange: priceIntelligence.priceRange,
        liquidityScore: scoring.liquidityScore,
        pricingRisk: priceIntelligence.pricingRisk,
        sourceCoverageScore: scoring.sourceCoverageScore,
        confidenceScore,
        confidenceBand: classifyMarketConfidenceBand(confidenceScore),
      },
    };
    await markMarketScanRecommendationStarted({ prisma: params.prisma, runId: run.runId });
    opportunity = recommendOperationalOpportunity({
      runId: run.runId,
      priceIntelligence,
      liquidityScore: scoring.liquidityScore,
      sourceCoverageScore: scoring.sourceCoverageScore,
      confidenceScore,
    });
  }
  const evidenceBundle = createMarketScanGuardianEvidence({
    runId: run.runId,
    queryHash: run.queryHash,
    sourceSnapshot: {
      sourceIds,
      sourceAccessDecision,
      sourceDataQuality: enrichedSnapshot?.sourceDataQuality ?? null,
      totalItems: enrichedSnapshot?.totalItems ?? 0,
      providerId: enrichedSnapshot?.providerId ?? null,
    },
    normalizedListings: enrichedSnapshot,
    recommendation: opportunity,
  });
  if (opportunity) {
    opportunity = {
      ...opportunity,
      evidenceBundleId: evidenceBundle.evidenceBundleId,
    };
  }
  const completed = await completeMarketScanRun({
    prisma: params.prisma,
    runId: run.runId,
    resultSnapshot: enrichedSnapshot,
    evidenceBundleId: evidenceBundle.evidenceBundleId,
    recommendationId: evidenceBundle.recommendationHash,
    opportunityId: opportunity?.opportunityId ?? null,
  });
  const disclosure = sourceAccessDecision.allowed && sourceAccessDecision.accessMode === "public_web_assisted"
    ? {
        coverage: "limited_public_web_sample" as const,
        confidenceCap: sourceAccessDecision.confidenceCap,
        limitations: [
          "Amostra pública assistida e limitada.",
          "Sem login, captcha, paywall, bulk scraping ou coleta de PII.",
          "Não substitui inventário autorizado, feed parceiro ou base licenciada.",
        ],
      }
    : null;

  return {
    run: {
      ...completed,
      sourceAccessDecision,
      ...(disclosure ? { disclosure } : {}),
    },
    sourceAccessDecision,
    resultSnapshot: enrichedSnapshot,
    opportunity,
    evidenceBundle,
  } satisfies MarketScanPipelineResult;
}
