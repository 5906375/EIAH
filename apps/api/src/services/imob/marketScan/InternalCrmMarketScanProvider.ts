import type { ImobCrmPropertyType } from "../crm/imobCrmPropertyTypes";
import type {
  MarketScanExecutionContext,
  MarketScanGroup,
  MarketScanItem,
  MarketScanProvider,
  MarketScanQuery,
  MarketScanResult,
} from "./MarketScanProvider";

export type InternalCrmMarketScanPropertyRecord = {
  id: string;
  tenantId: string;
  workspaceId: string;
  propertyType: ImobCrmPropertyType | null;
  goal: string | null;
  city: string | null;
  neighborhood?: string | null;
  address?: string | null;
  bedrooms?: number | null;
  askingPriceCents?: number | null;
  status?: string | null;
};

export type InternalCrmMarketScanSource = {
  listProperties(scope: {
    tenantId: string;
    workspaceId: string;
  }): Promise<InternalCrmMarketScanPropertyRecord[]> | InternalCrmMarketScanPropertyRecord[];
};

function mapRequestedGoalToInventoryGoal(goal: string) {
  return goal === "locacao" ? "locacao" : "venda";
}

function matchesGoal(recordGoal: string | null, requestedGoals: string[]) {
  if (!recordGoal) return false;
  const normalizedRecordGoal = recordGoal.trim().toLowerCase();
  const inventoryGoals = requestedGoals.map(mapRequestedGoalToInventoryGoal);
  return inventoryGoals.includes(normalizedRecordGoal);
}

function buildGroupKey(item: MarketScanItem) {
  return [
    item.city,
    item.goal,
    item.propertyType ?? "unknown",
    item.bedrooms ?? "unknown",
  ].join("|");
}

function compareNullableString(left: string | null | undefined, right: string | null | undefined) {
  return (left ?? "").localeCompare(right ?? "");
}

function compareNullableNumber(left: number | null | undefined, right: number | null | undefined) {
  return (left ?? 0) - (right ?? 0);
}

export class InternalCrmMarketScanProvider implements MarketScanProvider {
  readonly providerId = "internal_crm";

  constructor(private readonly source: InternalCrmMarketScanSource) {}

  async search(
    query: MarketScanQuery,
    context: MarketScanExecutionContext,
  ): Promise<MarketScanResult> {
    const records = await this.source.listProperties({
      tenantId: context.tenantId,
      workspaceId: context.workspaceId,
    });

    const filtered = records.filter((record) => {
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
    });

    const retrievedAt = new Date().toISOString();
    const items = filtered
      .map((record) => ({
        source: "internal_crm",
        sourceId: record.id,
        providerId: this.providerId,
        retrievedAt,
        city: record.city ?? "sem-cidade",
        uf: context.marketScanContext?.uf ?? null,
        goal: mapRequestedGoalToInventoryGoal(record.goal ?? "") === "locacao" ? "locacao" : "venda",
        propertyType: record.propertyType ?? null,
        bedrooms: record.bedrooms ?? null,
        price: typeof record.askingPriceCents === "number" ? Math.round(record.askingPriceCents / 100) : null,
        currency: "BRL" as const,
        neighborhood: record.neighborhood ?? null,
        address: record.address ?? null,
        title: record.address ?? record.id,
        url: null,
      } satisfies MarketScanItem))
      .sort((left, right) =>
        compareNullableString(left.city, right.city)
        || compareNullableString(left.goal, right.goal)
        || compareNullableString(left.propertyType, right.propertyType)
        || compareNullableNumber(left.bedrooms, right.bedrooms)
        || compareNullableNumber(left.price, right.price)
      );

    const groups = new Map<string, MarketScanGroup>();
    for (const item of items) {
      const key = buildGroupKey(item);
      const current = groups.get(key) ?? {
        city: item.city,
        goal: item.goal,
        propertyType: item.propertyType ?? null,
        bedrooms: item.bedrooms ?? null,
        items: [],
      };
      if (current.items.length < query.limitPerGroup) {
        current.items.push(item);
      }
      groups.set(key, current);
    }

    const groupedResults = Array.from(groups.values());
    return {
      providerId: this.providerId,
      sourceStatus: groupedResults.length > 0 ? "completed" : "empty",
      totalItems: items.length,
      groups: groupedResults,
    } satisfies MarketScanResult;
  }
}

