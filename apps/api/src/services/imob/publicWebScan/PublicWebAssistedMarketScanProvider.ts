import { createHash } from "node:crypto";
import type { MarketScanItem, MarketScanProvider, MarketScanQuery, MarketScanResult } from "../marketScan/MarketScanProvider";
import { publicWebAssistedPolicy } from "../marketScan/publicWebAssistedPolicy";
import { extractManualPublicListings } from "./publicListingExtractor";
import type { PublicWebManualListingInput, PublicWebScanSource } from "./publicWebScanTypes";
import { normalizeImobCrmPropertyType } from "../crm/imobCrmPropertyTypes";

function matchesText(candidate: string | null | undefined, allowed: string[]) {
  if (allowed.length === 0) return true;
  const normalized = candidate?.trim().toLocaleLowerCase("pt-BR");
  return Boolean(normalized && allowed.some((item) => item.trim().toLocaleLowerCase("pt-BR") === normalized));
}

function toSupportedPropertyType(value: string | null | undefined): import("../crm/imobCrmPropertyTypes").ImobCrmPropertyType | null {
  return normalizeImobCrmPropertyType(value);
}

function toMarketScanItem(listing: PublicWebManualListingInput, retrievedAt: string): MarketScanItem {
  return {
    source: "public_web_assisted",
    sourceId: listing.sourceId,
    providerId: "public_web_assisted",
    retrievedAt,
    city: listing.city,
    goal: listing.goal,
    propertyType: toSupportedPropertyType(listing.propertyType),
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

function buildDeterministicSourceId(params: {
  sourceUrlHash: string | null;
  city: string;
  goal: string;
  propertyType: string;
  neighborhood: string | null;
  bedrooms: number | null;
  price: number | null;
  title: string | null;
}) {
  if (params.sourceUrlHash) return `public_${params.sourceUrlHash}`;
  const basis = [
    params.city,
    params.goal,
    params.propertyType,
    params.neighborhood ?? "",
    params.bedrooms ?? "",
    params.price ?? "",
    params.title ?? "",
  ].join("|");
  const digest = createHash("sha256").update(basis).digest("hex").slice(0, 16);
  return `public_${digest}`;
}

export function parsePublicWebAssistedListings(raw: string | undefined | null): PublicWebManualListingInput[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    const rawEntries = parsed;
    const items = rawEntries.map((entry): PublicWebManualListingInput | null => {
      const obj = asObject(entry);
      if (!obj) return null;

      const sourceId = asString(obj.sourceId);
      const sourceUrlHash = asString(obj.sourceUrlHash);
      const city = asString(obj.city);
      const goal = asString(obj.goal);
      if (!city || !goal) return null;

      const propertyType = toSupportedPropertyType(asString(obj.propertyType));
      if (!propertyType) return null;

      const item: PublicWebManualListingInput = {
        sourceId: sourceId ?? buildDeterministicSourceId({
          sourceUrlHash,
          city,
          goal,
          propertyType,
          neighborhood: asString(obj.neighborhood),
          bedrooms: asNumber(obj.bedrooms),
          price: asNumber(obj.price),
          title: asString(obj.title),
        }),
        sourceUrlHash: sourceUrlHash ?? null,
        city,
        neighborhood: asString(obj.neighborhood) ?? null,
        goal,
        propertyType: propertyType ?? null,
        bedrooms: asNumber(obj.bedrooms),
        bathrooms: asNumber(obj.bathrooms),
        garageSpots: asNumber(obj.garageSpots),
        areaM2: asNumber(obj.areaM2),
        price: asNumber(obj.price),
        condominium: asNumber(obj.condominium),
        iptu: asNumber(obj.iptu),
        title: asString(obj.title) ?? null,
        ownerName: asString(obj.ownerName) ?? null,
        phone: asString(obj.phone) ?? null,
        email: asString(obj.email) ?? null,
        whatsapp: asString(obj.whatsapp) ?? null,
      };

      return item;
    });

    return items.filter((entry): entry is PublicWebManualListingInput => entry !== null);
  } catch {
    return [];
  }
}
