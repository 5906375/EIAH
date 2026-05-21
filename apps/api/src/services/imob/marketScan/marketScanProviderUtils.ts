import type { ImobCrmPropertyType } from "../crm/imobCrmPropertyTypes";
import type { MarketScanGroup, MarketScanItem } from "./MarketScanProvider";

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export type ImportedInventoryMetadata = {
  importedFrom: string | null;
  sourceId: string | null;
  sourceUrl: string | null;
  sourceLabel: string | null;
  title: string | null;
  retrievedAt: string | null;
};

export function extractImportedInventoryMetadata(metadata: unknown): ImportedInventoryMetadata | null {
  const obj = asObject(metadata);
  if (!obj) return null;

  const importedFrom = asString(obj.importedFrom)
    ?? asString(obj.inventorySource)
    ?? asString(obj.inventoryImportedFrom)
    ?? (asString(obj.source) === "tenant_inventory_import" ? "tenant_inventory_import" : null);
  const sourceUrl = asString(obj.sourceUrl)
    ?? asString(obj.inventorySourceUrl)
    ?? asString(obj.listingUrl)
    ?? null;

  if (!importedFrom && !sourceUrl) return null;

  return {
    importedFrom,
    sourceId: asString(obj.sourceId)
      ?? asString(obj.inventorySourceId)
      ?? asString(obj.externalId)
      ?? asString(obj.externalPropertyRef),
    sourceUrl,
    sourceLabel: asString(obj.sourceLabel)
      ?? asString(obj.inventorySourceLabel)
      ?? asString(obj.source)
      ?? null,
    title: asString(obj.title) ?? asString(obj.inventoryTitle) ?? null,
    retrievedAt: asString(obj.retrievedAt) ?? asString(obj.importedAt) ?? null,
  };
}

export function isImportedInventoryRecord(metadata: unknown) {
  return extractImportedInventoryMetadata(metadata) !== null;
}

export function mapRequestedGoalToInventoryGoal(goal: string) {
  return goal === "locacao" ? "locacao" : "venda";
}

export function matchesGoal(recordGoal: string | null, requestedGoals: string[]) {
  if (!recordGoal) return false;
  const normalizedRecordGoal = recordGoal.trim().toLowerCase();
  const inventoryGoals = requestedGoals.map(mapRequestedGoalToInventoryGoal);
  if (!isInventoryGoal(normalizedRecordGoal)) return false;
  return inventoryGoals.includes(normalizedRecordGoal);
}

export function isInventoryGoal(value: unknown): value is "locacao" | "venda" {
  return typeof value === "string" && (value === "locacao" || value === "venda");
}

export function buildGroupKey(item: MarketScanItem) {
  return [
    item.city,
    item.goal,
    item.propertyType ?? "unknown",
    item.bedrooms ?? "unknown",
  ].join("|");
}

export function compareNullableString(left: string | null | undefined, right: string | null | undefined) {
  return (left ?? "").localeCompare(right ?? "");
}

export function compareNullableNumber(left: number | null | undefined, right: number | null | undefined) {
  return (left ?? 0) - (right ?? 0);
}

export type MarketScanRecord = {
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
  metadata?: unknown;
};

export function buildGroupedMarketScanResult(params: {
  items: MarketScanItem[];
  limitPerGroup: number;
}) {
  const groups = new Map<string, MarketScanGroup>();
  for (const item of params.items) {
    const key = buildGroupKey(item);
    const current = groups.get(key) ?? {
      city: item.city,
      goal: item.goal,
      propertyType: item.propertyType ?? null,
      bedrooms: item.bedrooms ?? null,
      items: [],
    };
    if (current.items.length < params.limitPerGroup) {
      current.items.push(item);
    }
    groups.set(key, current);
  }
  return Array.from(groups.values());
}
