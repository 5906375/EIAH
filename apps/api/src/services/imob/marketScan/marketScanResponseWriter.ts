import type {
  ImobMarketScanResultSnapshot,
  ImobMarketScanRunSnapshot,
  ImobOperationalOpportunity,
} from "../imobConversationContract";

export type MarketScanWrittenResponse =
  | {
      blocked: false;
      text: string;
      lines: string[];
      evidenceBundleId: string;
    }
  | {
      blocked: true;
      reasonCode: "MARKET_SCAN_EVIDENCE_REQUIRED" | "MARKET_SCAN_RESULT_REQUIRED";
      text: string;
      lines: string[];
    };

function formatPriceRange(range: ImobOperationalOpportunity["priceRange"]) {
  if (!range) return null;
  return `R$ ${range.min} a R$ ${range.max}`;
}

function formatRisk(risk: ImobOperationalOpportunity["pricingRisk"]) {
  if (risk === "low") return "baixo";
  if (risk === "medium") return "médio";
  if (risk === "high") return "alto";
  return "indefinido";
}

function formatListingLine(item: ImobMarketScanResultSnapshot["groups"][number]["items"][number]) {
  const parts = [
    item.title ?? item.address ?? item.sourceId,
    item.neighborhood ? `bairro ${item.neighborhood}` : null,
    typeof item.price === "number" ? `R$ ${item.price}` : null,
    `origem ${item.sourceId}`,
  ].filter(Boolean);
  return parts.join(" | ");
}

export function writeMarketScanResponse(params: {
  run: ImobMarketScanRunSnapshot;
  resultSnapshot?: ImobMarketScanResultSnapshot | null;
  opportunity?: ImobOperationalOpportunity | null;
}): MarketScanWrittenResponse {
  if (!params.resultSnapshot) {
    return {
      blocked: true,
      reasonCode: "MARKET_SCAN_RESULT_REQUIRED",
      text: "Não posso recomendar ação comercial porque o MarketScanRun ainda não possui resultSnapshot.",
      lines: ["Resultado auditável ausente."],
    };
  }

  if (!params.run.evidenceBundleId) {
    return {
      blocked: true,
      reasonCode: "MARKET_SCAN_EVIDENCE_REQUIRED",
      text: "Não posso recomendar ação comercial forte sem evidenceBundleId ligado ao MarketScanRun.",
      lines: ["Evidência Guardian obrigatória antes da recomendação forte."],
    };
  }

  const intelligence = params.resultSnapshot.intelligence ?? null;
  const opportunity = params.opportunity ?? null;
  const priceRange = formatPriceRange(opportunity?.priceRange ?? intelligence?.priceRange ?? null);
  const lines = [
    `Status: ${params.resultSnapshot.sourceStatus}`,
    `Amostra: ${params.resultSnapshot.totalItems} anúncio(s) em ${params.resultSnapshot.groups.length} grupo(s).`,
    intelligence ? `Comparáveis: ${intelligence.comparableCount}` : null,
    priceRange ? `Faixa observada: ${priceRange}` : null,
    intelligence ? `Liquidez: ${intelligence.liquidityScore}` : null,
    intelligence ? `Risco de preço: ${formatRisk(intelligence.pricingRisk)}` : null,
    opportunity ? `Ação recomendada: ${opportunity.recommendedAction}` : null,
    opportunity ? `Próximo passo: ${opportunity.nextStep}` : null,
    `Evidência: ${params.run.evidenceBundleId}`,
  ].filter((line): line is string => Boolean(line));

  const listings = params.resultSnapshot.groups
    .flatMap((group) => group.items)
    .slice(0, 5)
    .map((item) => `- ${formatListingLine(item)}`);

  return {
    blocked: false,
    evidenceBundleId: params.run.evidenceBundleId,
    text: [
      "Inteligência de mercado gerada a partir do MarketScanRun auditável.",
      ...lines,
      ...(listings.length > 0 ? ["Anúncios usados no run:", ...listings] : []),
    ].join("\n"),
    lines: [...lines, ...listings],
  };
}
