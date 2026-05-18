import type { ImobSourceAccessDecisionSnapshot } from "../imobConversationContract";
import type {
  MarketScanExecutionContext,
  MarketScanProvider,
  MarketScanQuery,
  MarketScanResult,
} from "./MarketScanProvider";
import type { MarketScanProviderId } from "./imobMarketScanProviderRouter";

export type MarketScanConnectorId = MarketScanProviderId | "manual_input" | "public_web_assisted";

export type MarketScanConnectorRegistry = {
  search(params: {
    sourceId: MarketScanConnectorId;
    query: MarketScanQuery;
    context: MarketScanExecutionContext;
    sourceAccessDecision: ImobSourceAccessDecisionSnapshot;
  }): Promise<MarketScanResult>;
};

export class SourceConnectorRegistry implements MarketScanConnectorRegistry {
  constructor(private readonly providers: Partial<Record<MarketScanProviderId, MarketScanProvider>>) {}

  async search(params: {
    sourceId: MarketScanConnectorId;
    query: MarketScanQuery;
    context: MarketScanExecutionContext;
    sourceAccessDecision: ImobSourceAccessDecisionSnapshot;
  }): Promise<MarketScanResult> {
    if (!params.sourceAccessDecision.allowed) {
      return {
        providerId: params.sourceId,
        sourceStatus: "unavailable",
        totalItems: 0,
        groups: [],
      };
    }
    if (params.sourceAccessDecision.sourceId !== params.sourceId) {
      throw new Error("Source connector blocked: access decision does not match requested source.");
    }
    if (params.sourceId === "manual_input" || params.sourceId === "public_web_assisted") {
      return {
        providerId: params.sourceId,
        sourceStatus: "empty",
        totalItems: 0,
        groups: [],
      };
    }

    const provider = this.providers[params.sourceId];
    if (!provider) {
      return {
        providerId: params.sourceId,
        sourceStatus: "unavailable",
        totalItems: 0,
        groups: [],
      };
    }
    return provider.search(params.query, params.context);
  }
}
