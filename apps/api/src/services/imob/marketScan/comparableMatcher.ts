import type { ImobMarketScanResultItem, ImobMarketScanResultSnapshot } from "../imobConversationContract";
import type { MarketScanQuery } from "./MarketScanProvider";

export type MarketComparable = ImobMarketScanResultItem & {
  comparableScore: number;
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
