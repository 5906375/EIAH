import {
  extractCityCandidates,
  extractGoalCandidates,
  extractMarketScanBedrooms,
  extractMarketScanPriceRange,
  extractMarketScanPropertyTypes,
  extractRegion,
  normalizeImobText,
  normalizeMarketScanGoalCandidates,
} from "../imobConversationState";
import type { ImobCrmPropertyType } from "../crm/imobCrmPropertyTypes";
import type { MarketScanQuery } from "./MarketScanProvider";

export type MarketScanQueryBuilderOutput = {
  version: "1.0";
  query: MarketScanQuery & {
    region: string | null;
    neighborhood: string | null;
    operation: "sale" | "rent" | "seasonal" | "unknown" | null;
  };
  confidence: number;
  missingRequiredFilters: string[];
};

function inferUf(region: string | null) {
  if (region === "Santa Catarina") return "SC";
  if (region === "São Paulo") return "SP";
  if (region === "Rio de Janeiro") return "RJ";
  return null;
}

function inferNeighborhood(normalized: string) {
  if (normalized.includes("pinheiros")) return "Pinheiros";
  if (normalized.includes("praia brava")) return "Praia Brava";
  if (normalized.includes("centro")) return "Centro";
  return null;
}

function inferOperation(goals: string[]) {
  if (goals.includes("aluguel_por_temporada")) return "seasonal" as const;
  if (goals.includes("locacao")) return "rent" as const;
  if (goals.includes("venda") || goals.includes("compra")) return "sale" as const;
  return "unknown" as const;
}

function inferPropertyTypes(message: string, normalized: string): ImobCrmPropertyType[] {
  const extracted = extractMarketScanPropertyTypes(message);
  if (extracted.length > 0) return extracted;
  if (normalized.includes("apartamentos")) return ["apartamento"];
  if (normalized.includes("casas")) return ["casa"];
  return [];
}

export function buildMarketScanStructuredQuery(message: string): MarketScanQueryBuilderOutput {
  const normalized = normalizeImobText(message);
  const cityCandidates = extractCityCandidates(message);
  const region = extractRegion(normalized);
  const goals = normalizeMarketScanGoalCandidates(extractGoalCandidates(message));
  const propertyTypes = inferPropertyTypes(message, normalized);
  const bedrooms = extractMarketScanBedrooms(message);
  const priceRange = extractMarketScanPriceRange(message, goals);
  const missingRequiredFilters = [
    cityCandidates.length === 0 && !region ? "city_or_region" : null,
    goals.length === 0 ? "operation" : null,
  ].filter((item): item is string => Boolean(item));

  return {
    version: "1.0",
    query: {
      cities: cityCandidates,
      uf: inferUf(region),
      region,
      neighborhood: inferNeighborhood(normalized),
      goals,
      operation: inferOperation(goals),
      propertyTypes,
      bedrooms,
      priceRange,
      limitPerGroup: 10,
    },
    confidence: missingRequiredFilters.length === 0 ? 0.88 : 0.62,
    missingRequiredFilters,
  };
}
