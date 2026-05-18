import type { MarketScanItem, MarketScanResult } from "./MarketScanProvider";

function normalizeText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function normalizeItem(item: MarketScanItem): MarketScanItem {
  return {
    ...item,
    source: normalizeText(item.source) ?? "unknown",
    sourceId: normalizeText(item.sourceId) ?? "unknown",
    providerId: normalizeText(item.providerId) ?? "unknown",
    city: normalizeText(item.city) ?? "sem-cidade",
    uf: normalizeText(item.uf),
    goal: normalizeText(item.goal) ?? "sem-finalidade",
    neighborhood: normalizeText(item.neighborhood),
    address: normalizeText(item.address),
    title: normalizeText(item.title),
    url: normalizeText(item.url),
    price: typeof item.price === "number" && Number.isFinite(item.price) ? item.price : null,
    bedrooms: typeof item.bedrooms === "number" && Number.isFinite(item.bedrooms) ? item.bedrooms : null,
    currency: item.currency === "BRL" ? "BRL" : null,
  };
}

export function normalizeMarketScanListings(result: MarketScanResult): MarketScanResult {
  const groups = result.groups.map((group) => ({
    ...group,
    city: normalizeText(group.city) ?? "sem-cidade",
    goal: normalizeText(group.goal) ?? "sem-finalidade",
    items: group.items.map(normalizeItem),
  }));
  return {
    ...result,
    groups,
    totalItems: groups.reduce((total, group) => total + group.items.length, 0),
  };
}
