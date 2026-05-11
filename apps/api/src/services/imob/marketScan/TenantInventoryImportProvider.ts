import type {
  MarketScanExecutionContext,
  MarketScanItem,
  MarketScanProvider,
  MarketScanQuery,
  MarketScanResult,
} from "./MarketScanProvider";
import {
  buildGroupedMarketScanResult,
  compareNullableNumber,
  compareNullableString,
  extractImportedInventoryMetadata,
  matchesGoal,
  type MarketScanRecord,
} from "./marketScanProviderUtils";

export type TenantInventoryImportPropertyRecord = MarketScanRecord;

export type TenantInventoryImportSource = {
  listProperties(scope: {
    tenantId: string;
    workspaceId: string;
  }): Promise<TenantInventoryImportPropertyRecord[]> | TenantInventoryImportPropertyRecord[];
};

export class TenantInventoryImportProvider implements MarketScanProvider {
  readonly providerId = "tenant_inventory_import";

  constructor(private readonly source: TenantInventoryImportSource) {}

  async search(
    query: MarketScanQuery,
    context: MarketScanExecutionContext,
  ): Promise<MarketScanResult> {
    const records = await this.source.listProperties({
      tenantId: context.tenantId,
      workspaceId: context.workspaceId,
    });

    const items = records
      .filter((record) => {
        if (record.tenantId !== context.tenantId) return false;
        if (record.workspaceId !== context.workspaceId) return false;
        if ((record.status ?? "").toLowerCase() === "archived") return false;
        if (!record.city || !query.cities.includes(record.city)) return false;
        if (!matchesGoal(record.goal, query.goals)) return false;
        if (query.propertyTypes.length > 0 && (!record.propertyType || !query.propertyTypes.includes(record.propertyType))) {
          return false;
        }
        if (query.bedrooms.length > 0 && !query.bedrooms.includes(record.bedrooms ?? -1)) {
          return false;
        }

        const imported = extractImportedInventoryMetadata(record.metadata);
        if (!imported?.sourceId) return false;

        const price = typeof record.askingPriceCents === "number"
          ? Math.round(record.askingPriceCents / 100)
          : null;
        if (query.priceRange?.min !== null && query.priceRange?.min !== undefined) {
          if (price === null || price < query.priceRange.min) return false;
        }
        if (query.priceRange?.max !== null && query.priceRange?.max !== undefined) {
          if (price === null || price > query.priceRange.max) return false;
        }

        return true;
      })
      .map((record) => {
        const imported = extractImportedInventoryMetadata(record.metadata)!;
        return {
          source: imported.sourceLabel ?? "tenant_inventory_import",
          sourceId: imported.sourceId!,
          providerId: this.providerId,
          retrievedAt: imported.retrievedAt ?? new Date().toISOString(),
          city: record.city ?? "sem-cidade",
          uf: context.marketScanContext?.uf ?? null,
          goal: (record.goal ?? "").trim().toLowerCase() === "locacao" ? "locacao" : "venda",
          propertyType: record.propertyType ?? null,
          bedrooms: record.bedrooms ?? null,
          price: typeof record.askingPriceCents === "number" ? Math.round(record.askingPriceCents / 100) : null,
          currency: "BRL" as const,
          neighborhood: record.neighborhood ?? null,
          address: record.address ?? null,
          title: imported.title ?? record.address ?? imported.sourceId,
          url: imported.sourceUrl ?? null,
        } satisfies MarketScanItem;
      })
      .sort((left, right) =>
        compareNullableString(left.city, right.city)
        || compareNullableString(left.goal, right.goal)
        || compareNullableString(left.propertyType, right.propertyType)
        || compareNullableNumber(left.bedrooms, right.bedrooms)
        || compareNullableNumber(left.price, right.price)
      );

    const groups = buildGroupedMarketScanResult({
      items,
      limitPerGroup: query.limitPerGroup,
    });

    return {
      providerId: this.providerId,
      sourceStatus: groups.length > 0 ? "completed" : "empty",
      totalItems: items.length,
      groups,
    };
  }
}
