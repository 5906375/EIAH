import type {
  MarketScanExecutionContext,
  MarketScanProvider,
  MarketScanQuery,
  MarketScanResult,
} from "./MarketScanProvider";

export class TenantInventoryImportProvider implements MarketScanProvider {
  readonly providerId = "tenant_inventory_import";

  async search(
    _query: MarketScanQuery,
    _context: MarketScanExecutionContext,
  ): Promise<MarketScanResult> {
    return {
      providerId: this.providerId,
      sourceStatus: "unavailable",
      totalItems: 0,
      groups: [],
    };
  }
}

