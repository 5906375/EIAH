import type { ImobMarketSourceAccessMode } from "../imobConversationContract";

export type MarketSourceOperation =
  | "market_scan_region"
  | "compare_properties"
  | "public_web_assisted_scan"
  | "manual_listing_input";

export type MarketSourceRegistryEntry = {
  sourceId: string;
  provider: string;
  accessMode: ImobMarketSourceAccessMode;
  status: "enabled" | "disabled" | "terms_denied";
  termsAccepted: boolean;
  requiresTenantCredential: boolean;
  allowedOperations: MarketSourceOperation[];
  blockedOperations?: string[];
  piiPolicy: "mask" | "exclude";
  rateLimitProfile: "strict" | "standard";
  confidenceCap: number;
};

export const DEFAULT_MARKET_SOURCE_REGISTRY: MarketSourceRegistryEntry[] = [
  {
    sourceId: "internal_crm",
    provider: "EIAH IMOB CRM",
    accessMode: "internal_crm",
    status: "enabled",
    termsAccepted: true,
    requiresTenantCredential: false,
    allowedOperations: ["market_scan_region", "compare_properties"],
    piiPolicy: "mask",
    rateLimitProfile: "standard",
    confidenceCap: 0.95,
  },
  {
    sourceId: "tenant_inventory_import",
    provider: "Tenant Inventory Import",
    accessMode: "tenant_inventory_import",
    status: "enabled",
    termsAccepted: true,
    requiresTenantCredential: false,
    allowedOperations: ["market_scan_region", "compare_properties"],
    piiPolicy: "mask",
    rateLimitProfile: "standard",
    confidenceCap: 0.9,
  },
  {
    sourceId: "manual_input",
    provider: "Manual Input",
    accessMode: "manual_input",
    status: "enabled",
    termsAccepted: true,
    requiresTenantCredential: false,
    allowedOperations: ["manual_listing_input", "market_scan_region", "compare_properties"],
    piiPolicy: "mask",
    rateLimitProfile: "standard",
    confidenceCap: 0.75,
  },
  {
    sourceId: "public_web_assisted",
    provider: "Public Web Assisted",
    accessMode: "public_web_assisted",
    status: "enabled",
    termsAccepted: true,
    requiresTenantCredential: false,
    allowedOperations: ["public_web_assisted_scan", "market_scan_region", "compare_properties"],
    blockedOperations: [
      "unauthorized_bulk_scraping",
      "login_required_scraping",
      "captcha_bypass",
      "paywall_bypass",
      "pii_harvesting",
    ],
    piiPolicy: "exclude",
    rateLimitProfile: "strict",
    confidenceCap: 0.55,
  },
];

export function findMarketSource(
  sourceId: string,
  registry: readonly MarketSourceRegistryEntry[] = DEFAULT_MARKET_SOURCE_REGISTRY,
) {
  return registry.find((entry) => entry.sourceId === sourceId) ?? null;
}

