import type { ImobMarketScanResultItem, ImobMarketScanResultSnapshot } from "../imobConversationContract";
import type { MarketScanQuery } from "./MarketScanProvider";

export type MarketComparable = ImobMarketScanResultItem & {
  comparableScore: number;
};

export type MarketComparableSourceSummary = {
  providerId: string;
  source: string;
  count: number;
};

export function flattenMarketScanItems(snapshot: ImobMarketScanResultSnapshot | null | undefined) {
  return snapshot?.groups.flatMap((group) => group.items) ?? [];
}

export function matchComparables(params: {
  snapshot: ImobMarketScanResultSnapshot;
  query: MarketScanQuery;
  maxComparables?: number;
}): MarketComparable[] {
  const cities = new Set(params.query.cities.map((city) => city.toLocaleLowerCase("pt-BR")));
  const goals = new Set(params.query.goals.map((goal) => goal.toLocaleLowerCase("pt-BR")));
  const propertyTypes = new Set(params.query.propertyTypes);
  const bedrooms = new Set(params.query.bedrooms);

  return flattenMarketScanItems(params.snapshot)
    .map((item) => {
      let score = 0;
      if (cities.size === 0 || cities.has(item.city.toLocaleLowerCase("pt-BR"))) score += 0.25;
      if (goals.size === 0 || goals.has(item.goal.toLocaleLowerCase("pt-BR"))) score += 0.25;
      if (propertyTypes.size === 0 || (item.propertyType && propertyTypes.has(item.propertyType))) score += 0.25;
      if (bedrooms.size === 0 || (typeof item.bedrooms === "number" && bedrooms.has(item.bedrooms))) score += 0.15;
      if (typeof item.price === "number" && item.price > 0) score += 0.1;
      return { ...item, comparableScore: Number(score.toFixed(2)) };
    })
    .filter((item) => item.comparableScore >= 0.6)
    .sort((left, right) => right.comparableScore - left.comparableScore || (left.price ?? 0) - (right.price ?? 0))
    .slice(0, params.maxComparables ?? 30);
}

export function summarizeComparableSources(comparables: MarketComparable[]): MarketComparableSourceSummary[] {
  const counts = new Map<string, MarketComparableSourceSummary>();
  for (const item of comparables) {
    const key = `${item.providerId}::${item.source}`;
    const current = counts.get(key);
    if (current) current.count += 1;
    else {
      counts.set(key, {
        providerId: item.providerId,
        source: item.source,
        count: 1,
      });
    }
  }
  return [...counts.values()].sort((left, right) => right.count - left.count || left.providerId.localeCompare(right.providerId));
}
