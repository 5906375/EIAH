import type {
  MarketScanExecutionContext,
  MarketScanProvider,
  MarketScanQuery,
  MarketScanResult,
} from "./MarketScanProvider";

export type MarketScanProviderId = "internal_crm" | "tenant_inventory_import";

export type MarketScanProviderRoute = {
  tenantId: string;
  workspaceId: string;
  providerId: MarketScanProviderId;
};

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function parseMarketScanProviderRoutes(raw: string | undefined | null) {
  if (!raw) return [] as MarketScanProviderRoute[];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => {
        const obj = asObject(entry);
        if (!obj) return null;
        const tenantId = asString(obj.tenantId);
        const workspaceId = asString(obj.workspaceId);
        const providerId = asString(obj.providerId);
        if (!tenantId || !workspaceId) return null;
        if (providerId !== "internal_crm" && providerId !== "tenant_inventory_import") return null;
        return {
          tenantId,
          workspaceId,
          providerId,
        } satisfies MarketScanProviderRoute;
      })
      .filter((entry): entry is MarketScanProviderRoute => entry !== null);
  } catch {
    return [];
  }
}

export class ImobMarketScanProviderRouter {
  constructor(
    private readonly providers: Record<MarketScanProviderId, MarketScanProvider>,
    private readonly routes: MarketScanProviderRoute[] = parseMarketScanProviderRoutes(
      process.env.IMOB_MARKET_SCAN_PROVIDER_ROUTING,
    ),
  ) {}

  private getExplicitRoute(context: MarketScanExecutionContext) {
    return this.routes.find(
      (entry) =>
        entry.tenantId === context.tenantId
        && entry.workspaceId === context.workspaceId,
    ) ?? null;
  }

  private buildSearchOrder(context: MarketScanExecutionContext) {
    const explicit = this.getExplicitRoute(context);
    if (explicit) {
      return {
        explicit: true,
        providerIds: [explicit.providerId],
      };
    }
    return {
      explicit: false,
      providerIds: ["tenant_inventory_import", "internal_crm"] as MarketScanProviderId[],
    };
  }

  async search(
    query: MarketScanQuery,
    context: MarketScanExecutionContext,
  ): Promise<MarketScanResult> {
    const order = this.buildSearchOrder(context);
    let lastNonUnavailable: MarketScanResult | null = null;

    for (const providerId of order.providerIds) {
      const provider = this.providers[providerId];
      if (!provider) continue;
      const result = await provider.search(query, context);
      if (result.sourceStatus === "completed") return result;
      if (result.sourceStatus !== "unavailable") {
        lastNonUnavailable = result;
        if (order.explicit) return result;
      }
    }

    if (lastNonUnavailable) return lastNonUnavailable;

    return {
      providerId: order.providerIds[0] ?? "internal_crm",
      sourceStatus: "unavailable",
      totalItems: 0,
      groups: [],
    };
  }
}
