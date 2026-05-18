import type { ImobMarketScanContext } from "../imobConversationContract";
import type { MarketScanQuery } from "./MarketScanProvider";

export function buildRegionMarketScanQuery(input: {
  cities?: string[];
  uf?: string | null;
  goals?: string[];
  propertyTypes?: MarketScanQuery["propertyTypes"];
  bedrooms?: number[];
  priceRange?: MarketScanQuery["priceRange"];
  limitPerGroup?: number | null;
}): MarketScanQuery {
  return {
    cities: input.cities?.filter(Boolean) ?? [],
    uf: input.uf ?? null,
    goals: input.goals?.filter(Boolean) ?? [],
    propertyTypes: input.propertyTypes ?? [],
    bedrooms: input.bedrooms ?? [],
    priceRange: input.priceRange ?? null,
    limitPerGroup: Math.min(Math.max(input.limitPerGroup ?? 10, 1), 50),
  };
}

export function buildRegionMarketScanQueryFromContext(context: ImobMarketScanContext): MarketScanQuery {
  return buildRegionMarketScanQuery({
    cities: context.cities,
    uf: context.uf,
    goals: context.goals,
    propertyTypes: context.propertyTypes,
    bedrooms: context.bedrooms,
    priceRange: context.priceRange,
    limitPerGroup: context.limitPerGroup,
  });
}
