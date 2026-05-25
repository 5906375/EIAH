import type { ImobSourceAccessDecisionSnapshot } from "../imobConversationContract";
import type { MarketComparable } from "./comparableMatcher";
import type { MarketPriceIntelligence } from "./priceIntelligenceEngine";

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function classifyMarketConfidenceBand(score: number | null | undefined) {
  if (typeof score !== "number" || !Number.isFinite(score)) return "unknown" as const;
  if (score >= 0.7) return "high" as const;
  if (score >= 0.45) return "medium" as const;
  return "low" as const;
}

export function computeLiquidityCompetitionScore(params: {
  comparables: MarketComparable[];
  priceIntelligence: MarketPriceIntelligence;
  sourceAccessDecision: ImobSourceAccessDecisionSnapshot;
}) {
  const confidenceCap = params.sourceAccessDecision.allowed ? params.sourceAccessDecision.confidenceCap : 0;
  const pricedComparables = params.comparables.filter((item) => typeof item.price === "number" && item.price > 0).length;
  const sourceCoverageScore = clamp01(params.comparables.length / 12) * confidenceCap;
  const pricedCoverage = clamp01(pricedComparables / 8);
  const liquidityScore = clamp01((sourceCoverageScore * 0.65) + (pricedCoverage * 0.35));
  const riskPenalty = params.priceIntelligence.pricingRisk === "low"
    ? 0
    : params.priceIntelligence.pricingRisk === "medium"
      ? 0.12
      : params.priceIntelligence.pricingRisk === "high"
        ? 0.24
        : 0.3;
  const confidenceScore = clamp01(Math.min(confidenceCap, 0.25 + liquidityScore * 0.65 - riskPenalty));

  return {
    liquidityScore: Number(liquidityScore.toFixed(2)),
    sourceCoverageScore: Number(sourceCoverageScore.toFixed(2)),
    confidenceScore: Number(confidenceScore.toFixed(2)),
  };
}
