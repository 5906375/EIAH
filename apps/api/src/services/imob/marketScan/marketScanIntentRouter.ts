import { normalizeImobText } from "../imobConversationState";

export type MarketScanMissionType =
  | "market_scan_region"
  | "compare_properties"
  | "public_web_assisted_scan"
  | "full_capture"
  | "unknown";

export type MarketScanRouterOutput = {
  version: "1.0";
  missionType: MarketScanMissionType;
  confidence: number;
  requiresMarketScanRun: boolean;
  requiresSourceAccessGate: boolean;
  extractedFilters: Record<string, unknown>;
  blocked: boolean;
  reasonCode: string | null;
};

export function routeMarketScanIntent(message: string): MarketScanRouterOutput {
  const normalized = normalizeImobText(message);
  const wantsPublicWeb =
    normalized.includes("publica")
    || normalized.includes("publico")
    || normalized.includes("internet")
    || normalized.includes("web")
    || normalized.includes("ofertas publicas");
  const wantsComparison =
    normalized.includes("compar")
    || normalized.includes("parecid")
    || normalized.includes("similar");
  const wantsScan =
    normalized.includes("market scan")
    || normalized.includes("scan de mercado")
    || normalized.includes("varredura")
    || normalized.includes("analise")
    || normalized.includes("analisar");
  const wantsCapture =
    normalized.includes("captar")
    || normalized.includes("cadastrar imovel")
    || normalized.includes("cadastrar imóvel");

  const missionType: MarketScanMissionType = wantsPublicWeb
    ? "public_web_assisted_scan"
    : wantsScan
      ? "market_scan_region"
      : wantsComparison
        ? "compare_properties"
        : wantsCapture
          ? "full_capture"
          : "unknown";

  const requiresMarketScanRun =
    missionType === "market_scan_region"
    || missionType === "compare_properties"
    || missionType === "public_web_assisted_scan";

  return {
    version: "1.0",
    missionType,
    confidence: missionType === "unknown" ? 0.25 : wantsPublicWeb || wantsScan ? 0.9 : 0.72,
    requiresMarketScanRun,
    requiresSourceAccessGate: requiresMarketScanRun,
    extractedFilters: {},
    blocked: false,
    reasonCode: null,
  };
}

