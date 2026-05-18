import type { ImobOperationalOpportunity } from "../imobConversationContract";
import type { MarketPriceIntelligence } from "./priceIntelligenceEngine";

export function recommendOperationalOpportunity(params: {
  runId: string;
  priceIntelligence: MarketPriceIntelligence;
  liquidityScore: number;
  sourceCoverageScore: number;
  confidenceScore: number;
  evidenceBundleId?: string | null;
}): ImobOperationalOpportunity {
  const noPriceRange = !params.priceIntelligence.priceRange;
  const recommendedAction = noPriceRange
    ? "nao_seguir"
    : params.confidenceScore < 0.45
      ? "pedir_autorizacao"
      : params.priceIntelligence.pricingRisk === "high"
        ? "ajustar_preco"
        : params.liquidityScore >= 0.65
          ? "captar"
          : "campanha";

  const nextStepByAction: Record<ImobOperationalOpportunity["recommendedAction"], string> = {
    captar: "Preparar draft de captação e submeter para aprovação humana.",
    ajustar_preco: "Preparar sugestão de ajuste de preço com base nos comparáveis.",
    campanha: "Preparar campanha segmentada com aprovação humana antes de contato externo.",
    nao_seguir: "Não seguir agora; faltam comparáveis suficientes para recomendação comercial forte.",
    pedir_documento: "Pedir documentação pendente antes de avançar.",
    pedir_autorizacao: "Pedir autorização ou fonte adicional antes de executar ação comercial.",
  };

  return {
    opportunityId: `opp_${params.runId}`,
    recommendedAction,
    confidenceScore: params.confidenceScore,
    sourceCoverageScore: params.sourceCoverageScore,
    priceRange: params.priceIntelligence.priceRange,
    liquidityScore: params.liquidityScore,
    pricingRisk: params.priceIntelligence.pricingRisk,
    nextStep: nextStepByAction[recommendedAction],
    requiresHumanApproval: true,
    evidenceBundleId: params.evidenceBundleId ?? null,
  };
}
