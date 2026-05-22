import type {
  ImobMarketScanResultSnapshot,
  ImobMarketScanRunSnapshot,
  ImobOperationalOpportunity,
} from "../imobConversationContract";
import { judgeMarketScanPolicy } from "./marketScanPolicyJudge";

export type MarketScanWrittenResponse =
  | {
      blocked: false;
      text: string;
      lines: string[];
      evidenceBundleId: string;
    }
  | {
      blocked: true;
      reasonCode:
        | "MARKET_SCAN_EVIDENCE_REQUIRED"
        | "MARKET_SCAN_RESULT_REQUIRED"
        | "MARKET_SCAN_PII_BLOCKED"
        | "MARKET_SCAN_LISTING_NOT_IN_RUN"
        | "MARKET_SCAN_INTERNAL_ID_LEAK"
        | "MARKET_SCAN_HUMAN_APPROVAL_REQUIRED";
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

function formatListingLine(item: ImobMarketScanResultSnapshot["groups"][number]["items"][number], index: number) {
  const parts = [
    `Imóvel ${index + 1}`,
    item.neighborhood ?? item.city,
    item.propertyType ?? null,
    typeof item.bedrooms === "number" ? `${item.bedrooms} quarto${item.bedrooms === 1 ? "" : "s"}` : null,
    typeof item.price === "number" ? `R$ ${item.price}` : null,
  ].filter(Boolean);
  return parts.join(" · ");
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

  const policyDecision = judgeMarketScanPolicy({
    run: params.run,
    resultSnapshot: params.resultSnapshot,
    opportunity: params.opportunity ?? null,
  });

  if (!policyDecision.allowed) {
    return {
      blocked: true,
      reasonCode: policyDecision.reasonCode,
      text: "Dados insuficientes para recomendação forte.",
      lines: [
        "A recomendação comercial foi degradada porque a política do Market Scan não foi atendida.",
        "Refine a busca ou consulte a evidência governada antes de executar ação comercial.",
      ],
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
  ].filter((line): line is string => Boolean(line));

  const listings = params.resultSnapshot.groups
    .flatMap((group) => group.items)
    .slice(0, 5)
    .map((item, index) => `- ${formatListingLine(item, index)}`);

  const text = [
    "Inteligência de mercado gerada a partir do MarketScanRun auditável.",
    ...lines,
    ...(listings.length > 0 ? ["Imóveis usados no run:", ...listings] : []),
  ].join("\n");
  const visibleLines = [...lines, ...listings];
  const visibleDecision = judgeMarketScanPolicy({
    run: params.run,
    resultSnapshot: params.resultSnapshot,
    opportunity: params.opportunity ?? null,
    visibleText: text,
    visibleLines,
  });
  if (!visibleDecision.allowed) {
    return {
      blocked: true,
      reasonCode: visibleDecision.reasonCode,
      text: "Dados insuficientes para recomendação forte.",
      lines: [
        "A recomendação comercial foi degradada porque a política do Market Scan não foi atendida.",
        "Refine a busca ou consulte a evidência governada antes de executar ação comercial.",
      ],
    };
  }

  const evidenceBundleId = params.run.evidenceBundleId;
  if (!evidenceBundleId) {
    return {
      blocked: true,
      reasonCode: "MARKET_SCAN_EVIDENCE_REQUIRED",
      text: "Dados insuficientes para recomendação forte.",
      lines: [
        "A recomendação comercial foi degradada porque a política do Market Scan não foi atendida.",
        "Refine a busca ou consulte a evidência governada antes de executar ação comercial.",
      ],
    };
  }

  return {
    blocked: false,
    evidenceBundleId,
    text,
    lines: visibleLines,
  };
}
