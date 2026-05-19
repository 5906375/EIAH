import type { MarketComparable } from "./comparableMatcher";

export type MarketPriceIntelligence = {
  comparableCount: number;
  priceRange: {
    min: number;
    max: number;
    currency: "BRL";
  } | null;
  pricingRisk: "low" | "medium" | "high" | "unknown";
};

function percentile(sorted: number[], ratio: number) {
  if (sorted.length === 0) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * ratio)));
  return sorted[index] ?? null;
}

export function computePriceIntelligence(comparables: MarketComparable[]): MarketPriceIntelligence {
  const prices = comparables
    .map((item) => item.price)
    .filter((price): price is number => typeof price === "number" && Number.isFinite(price) && price > 0)
    .sort((left, right) => left - right);

  if (prices.length === 0) {
    return {
      comparableCount: comparables.length,
      priceRange: null,
      pricingRisk: "unknown",
    };
  }

  const low = percentile(prices, 0.25) ?? prices[0]!;
  const high = percentile(prices, 0.75) ?? prices.at(-1)!;
  const spread = high > 0 ? (high - low) / high : 0;
  const pricingRisk = prices.length < 2
    ? "high"
    : spread <= 0.25
      ? "low"
      : spread <= 0.45
        ? "medium"
        : "high";

  return {
    comparableCount: comparables.length,
    priceRange: {
      min: low,
      max: high,
      currency: "BRL",
    },
    pricingRisk,
  };
}
