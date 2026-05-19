import type { MarketScanItem, MarketScanProvider, MarketScanQuery, MarketScanResult } from "../marketScan/MarketScanProvider";
import { publicWebAssistedPolicy } from "../marketScan/publicWebAssistedPolicy";
import { extractManualPublicListings } from "./publicListingExtractor";
import type { PublicWebManualListingInput, PublicWebScanSource } from "./publicWebScanTypes";

function matchesText(candidate: string | null | undefined, allowed: string[]) {
  if (allowed.length === 0) return true;
  const normalized = candidate?.trim().toLocaleLowerCase("pt-BR");
  return Boolean(normalized && allowed.some((item) => item.trim().toLocaleLowerCase("pt-BR") === normalized));
}

function isSupportedPropertyType(value: string | null | undefined): MarketScanItem["propertyType"] {
  if (
    value === "apartamento"
    || value === "casa"
    || value === "kitnet"
    || value === "terreno"
    || value === "sala_comercial"
  ) return value;
  return null;
}

function toMarketScanItem(listing: PublicWebManualListingInput, retrievedAt: string): MarketScanItem {
  return {
    source: "public_web_assisted",
    sourceId: listing.sourceId,
    providerId: "public_web_assisted",
    retrievedAt,
    city: listing.city,
    goal: listing.goal,
    propertyType: isSupportedPropertyType(listing.propertyType),
    bedrooms: typeof listing.bedrooms === "number" ? listing.bedrooms : null,
    price: typeof listing.price === "number" ? listing.price : null,
    currency: "BRL",
    neighborhood: listing.neighborhood ?? null,
    address: null,
    title: listing.title ?? listing.sourceId,
    url: listing.sourceUrlHash ? `hash:${listing.sourceUrlHash}` : null,
  };
}

export class PublicWebAssistedMarketScanProvider implements MarketScanProvider {
  readonly providerId = "public_web_assisted";

  constructor(private readonly source: PublicWebScanSource) {}

  async search(query: MarketScanQuery, context: { tenantId: string; workspaceId: string }): Promise<MarketScanResult> {
    const rawListings = await this.source.listPublicListings({
      tenantId: context.tenantId,
      workspaceId: context.workspaceId,
      city: query.cities[0] ?? null,
      goal: query.goals[0] ?? null,
      propertyType: query.propertyTypes[0] ?? null,
    });
    const safeListings = extractManualPublicListings(rawListings)
      .filter((listing) => matchesText(listing.city, query.cities))
      .filter((listing) => matchesText(listing.goal, query.goals))
      .filter((listing) => matchesText(listing.propertyType, query.propertyTypes))
      .filter((listing) => query.bedrooms.length === 0 || (typeof listing.bedrooms === "number" && query.bedrooms.includes(listing.bedrooms)))
      .filter((listing) => {
        if (typeof listing.price !== "number") return true;
        if (query.priceRange?.min !== null && query.priceRange?.min !== undefined && listing.price < query.priceRange.min) return false;
        if (query.priceRange?.max !== null && query.priceRange?.max !== undefined && listing.price > query.priceRange.max) return false;
        return true;
      })
      .slice(0, publicWebAssistedPolicy.maxResultsPerSource);

    const retrievedAt = new Date().toISOString();
    const items = safeListings.map((listing) => toMarketScanItem(listing, retrievedAt));
    return {
      providerId: this.providerId,
      sourceStatus: items.length > 0 ? "completed" : "empty",
      totalItems: items.length,
      groups: items.length > 0
        ? [
            {
              city: query.cities[0] ?? items[0]?.city ?? "sem-cidade",
              goal: query.goals[0] ?? items[0]?.goal ?? "sem-finalidade",
              propertyType: query.propertyTypes[0] ?? items[0]?.propertyType ?? null,
              bedrooms: query.bedrooms[0] ?? null,
              items,
            },
          ]
        : [],
    };
  }
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function parsePublicWebAssistedListings(raw: string | undefined | null): PublicWebManualListingInput[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => {
        const obj = asObject(entry);
        if (!obj) return null;
        const sourceId = asString(obj.sourceId);
        const city = asString(obj.city);
        const goal = asString(obj.goal);
        if (!sourceId || !city || !goal) return null;
        return {
          sourceId,
          sourceUrlHash: asString(obj.sourceUrlHash),
          city,
          neighborhood: asString(obj.neighborhood),
          goal,
          propertyType: asString(obj.propertyType),
          bedrooms: asNumber(obj.bedrooms),
          bathrooms: asNumber(obj.bathrooms),
          garageSpots: asNumber(obj.garageSpots),
          areaM2: asNumber(obj.areaM2),
          price: asNumber(obj.price),
          condominium: asNumber(obj.condominium),
          iptu: asNumber(obj.iptu),
          title: asString(obj.title),
          ownerName: asString(obj.ownerName),
          phone: asString(obj.phone),
          email: asString(obj.email),
          whatsapp: asString(obj.whatsapp),
        } satisfies PublicWebManualListingInput;
      })
      .filter((entry): entry is PublicWebManualListingInput => entry !== null);
  } catch {
    return [];
  }
}
