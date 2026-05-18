import type { ImobMarketScanResultSnapshot } from "../imobConversationContract";
import type { MarketScanResult } from "./MarketScanProvider";
import { normalizeMarketScanListings } from "./listingNormalizer";

export function toMarketScanResultSnapshot(result: MarketScanResult, generatedAt = new Date()): ImobMarketScanResultSnapshot {
  const normalized = normalizeMarketScanListings(result);
  return {
    scanId: `market-scan-${generatedAt.getTime()}`,
    providerId: normalized.providerId,
    sourceStatus: normalized.sourceStatus,
    totalItems: normalized.totalItems,
    groups: normalized.groups,
    readOnly: true,
    generatedAt: generatedAt.toISOString(),
  };
}
