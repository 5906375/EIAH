import type { ImobMarketScanResultSnapshot } from "../imobConversationContract";

export type MarketScanSourceDataQuality = NonNullable<ImobMarketScanResultSnapshot["sourceDataQuality"]>;

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function roundRate(value: number) {
  return Number(clamp01(value).toFixed(2));
}

export function evaluateMarketScanSourceDataQuality(
  snapshot: ImobMarketScanResultSnapshot | null | undefined,
): MarketScanSourceDataQuality {
  const items = snapshot?.groups.flatMap((group) => group.items) ?? [];
  const total = items.length;
  if (total === 0) {
    return {
      status: "degraded",
      fillRate: { price: 0, areaM2: 0, priceAreaM2: 0 },
      confidencePenalty: 0.12,
      reasonCodes: ["MARKET_SOURCE_EMPTY_SAMPLE"],
      message: "Amostra sem imóveis para medir qualidade de dados.",
    };
  }

  const priceCount = items.filter((item) => typeof item.price === "number" && item.price > 0).length;
  const areaCount = items.filter((item) => typeof item.areaM2 === "number" && item.areaM2 > 0).length;
  const priceAreaCount = items.filter((item) => typeof item.priceAreaM2 === "number" && item.priceAreaM2 > 0).length;
  const fillRate = {
    price: roundRate(priceCount / total),
    areaM2: roundRate(areaCount / total),
    priceAreaM2: roundRate(priceAreaCount / total),
  };
  const reasonCodes: string[] = [];
  if (fillRate.price < 0.7) reasonCodes.push("MARKET_PRICE_FILL_RATE_LOW");
  if (fillRate.areaM2 < 0.5) reasonCodes.push("MARKET_AREA_FILL_RATE_LOW");
  if (fillRate.priceAreaM2 < 0.5) reasonCodes.push("MARKET_PRICE_AREA_FILL_RATE_LOW");

  const hasNoCorePricingSignal = fillRate.price < 0.2 && fillRate.areaM2 < 0.2 && fillRate.priceAreaM2 < 0.2;
  if (hasNoCorePricingSignal) {
    return {
      status: "blocked",
      fillRate,
      confidencePenalty: 1,
      reasonCodes: ["MARKET_SOURCE_QUALITY_BLOCKED", ...reasonCodes],
      message: `${total} imóvel(is) encontrado(s), mas sem dados suficientes de preço/área para scoring governado.`,
    };
  }

  const status = reasonCodes.length > 0 ? "degraded" : "pass";
  const confidencePenalty = status === "pass"
    ? 0
    : Math.min(0.35, Number(((1 - fillRate.price) * 0.18 + (1 - Math.max(fillRate.areaM2, fillRate.priceAreaM2)) * 0.12).toFixed(2)));

  return {
    status,
    fillRate,
    confidencePenalty,
    reasonCodes,
    message: status === "pass"
      ? "Qualidade de dados suficiente para scoring."
      : "Qualidade de dados reduzida; confiança penalizada antes da recomendação.",
  };
}

