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
  markMarketScanNormalizationStarted,
  type ImobMarketScanRunStorePrisma,
} from "./imobMarketScanRunStore";
import { toMarketScanResultSnapshot } from "./listingIngestionAdapter";
import { decideSourceAccess } from "./sourceAccessPolicyGate";
import type { MarketScanConnectorId, MarketScanConnectorRegistry } from "./sourceConnectorRegistry";

export type MarketScanPipelineResult = {
  run: ImobMarketScanRunSnapshot;
  sourceAccessDecision: ImobSourceAccessDecisionSnapshot;
  resultSnapshot: ImobMarketScanResultSnapshot | null;
};

function sourceIdToAccessMode(sourceId: MarketScanConnectorId): ImobMarketSourceAccessMode {
  if (sourceId === "public_web_assisted") return "public_web_assisted";
  if (sourceId === "manual_input") return "manual_input";
  if (sourceId === "tenant_inventory_import") return "tenant_inventory_import";
  return "internal_crm";
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
  const sourceIds = params.sourceIds?.length
    ? params.sourceIds
    : params.sourceId
      ? [params.sourceId]
      : ["internal_crm"];

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
  const completed = await completeMarketScanRun({
    prisma: params.prisma,
    runId: run.runId,
    resultSnapshot,
  });

  return {
    run: {
      ...completed,
      sourceAccessDecision,
    },
    sourceAccessDecision,
    resultSnapshot,
  } satisfies MarketScanPipelineResult;
}
