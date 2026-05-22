import type { ImobCrmPropertyType } from "../crm/imobCrmPropertyTypes";
import type { ImobMarketScanContext } from "../imobConversationContract";

export type MarketScanQuery = {
  cities: string[];
  uf?: string | null;
  goals: string[];
  propertyTypes: ImobCrmPropertyType[];
  bedrooms: number[];
  priceRange?: {
    min: number | null;
    max: number | null;
    currency: "BRL";
    period: "monthly" | "daily" | "total" | null;
    confidence: "high" | "medium" | "low";
    ambiguityReason?: string | null;
  } | null;
  limitPerGroup: number;
};

export type MarketScanExecutionContext = {
  tenantId: string;
  workspaceId: string;
  caseId?: string | null;
  marketScanContext?: ImobMarketScanContext | null;
};

export type MarketScanItem = {
  source: string;
  sourceId: string;
  providerId: string;
  retrievedAt: string;
  city: string;
  uf?: string | null;
  goal: string;
  propertyType?: ImobCrmPropertyType | null;
  bedrooms?: number | null;
  price?: number | null;
  areaM2?: number | null;
  priceAreaM2?: number | null;
  currency?: "BRL" | null;
  neighborhood?: string | null;
  address?: string | null;
  title?: string | null;
  url?: string | null;
};

export type MarketScanGroup = {
  city: string;
  goal: string;
  propertyType?: ImobCrmPropertyType | null;
  bedrooms?: number | null;
  items: MarketScanItem[];
};

export type MarketScanResult = {
  providerId: string;
  sourceStatus: "completed" | "empty" | "unavailable";
  totalItems: number;
  groups: MarketScanGroup[];
};

export interface MarketScanProvider {
  providerId: string;
  search(
    query: MarketScanQuery,
    context: MarketScanExecutionContext,
  ): Promise<MarketScanResult>;
}
