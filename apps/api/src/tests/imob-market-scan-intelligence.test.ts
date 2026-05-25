import test from "node:test";
import assert from "node:assert/strict";
import type { ImobMarketScanResultSnapshot } from "../services/imob/imobConversationContract";
import { matchComparables, summarizeComparableSources } from "../services/imob/marketScan/comparableMatcher";
import { classifyMarketConfidenceBand, computeLiquidityCompetitionScore } from "../services/imob/marketScan/liquidityCompetitionScorer";
import { recommendOperationalOpportunity } from "../services/imob/marketScan/opportunityRecommender";
import { computePriceIntelligence } from "../services/imob/marketScan/priceIntelligenceEngine";

const snapshot: ImobMarketScanResultSnapshot = {
  scanId: "scan-1",
  providerId: "internal_crm",
  sourceStatus: "completed",
  totalItems: 4,
  readOnly: true,
  generatedAt: "2026-05-18T12:00:00.000Z",
  groups: [
    {
      city: "Itajaí",
      goal: "venda",
      propertyType: "apartamento",
      bedrooms: 2,
      items: [
        {
          source: "internal_crm",
          sourceId: "prop-1",
          providerId: "internal_crm",
          retrievedAt: "2026-05-18T12:00:00.000Z",
          city: "Itajaí",
          goal: "venda",
          propertyType: "apartamento",
          bedrooms: 2,
          price: 600000,
          currency: "BRL",
        },
        {
          source: "internal_crm",
          sourceId: "prop-2",
          providerId: "internal_crm",
          retrievedAt: "2026-05-18T12:00:00.000Z",
          city: "Itajaí",
          goal: "venda",
          propertyType: "apartamento",
          bedrooms: 2,
          price: 640000,
          currency: "BRL",
        },
        {
          source: "internal_crm",
          sourceId: "prop-3",
          providerId: "internal_crm",
          retrievedAt: "2026-05-18T12:00:00.000Z",
          city: "Itajaí",
          goal: "venda",
          propertyType: "apartamento",
          bedrooms: 2,
          price: 690000,
          currency: "BRL",
        },
      ],
    },
  ],
};

test("market scan intelligence computes comparables, price range, liquidity and opportunity draft", () => {
  const comparables = matchComparables({
    snapshot,
    query: {
      cities: ["Itajaí"],
      goals: ["venda"],
      propertyTypes: ["apartamento"],
      bedrooms: [2],
      priceRange: null,
      limitPerGroup: 10,
    },
  });
  const comparableSources = summarizeComparableSources(comparables);
  const price = computePriceIntelligence(comparables);
  const scoring = computeLiquidityCompetitionScore({
    comparables,
    priceIntelligence: price,
    sourceAccessDecision: {
      allowed: true,
      decision: "allowed_authorized",
      sourceId: "internal_crm",
      accessMode: "internal_crm",
      confidenceCap: 0.95,
      piiPolicy: "mask",
      rateLimitProfile: "standard",
      termsMode: "accepted",
    },
  });
  const opportunity = recommendOperationalOpportunity({
    runId: "run-1",
    priceIntelligence: price,
    liquidityScore: scoring.liquidityScore,
    sourceCoverageScore: scoring.sourceCoverageScore,
    confidenceScore: scoring.confidenceScore,
  });

  assert.equal(comparables.length, 3);
  assert.deepEqual(comparableSources, [
    {
      providerId: "internal_crm",
      source: "internal_crm",
      count: 3,
    },
  ]);
  assert.deepEqual(price.priceRange, { min: 640000, max: 690000, currency: "BRL" });
  assert.equal(price.pricingRisk, "low");
  assert.ok(scoring.liquidityScore > 0);
  assert.ok(scoring.confidenceScore > 0);
  assert.equal(classifyMarketConfidenceBand(scoring.confidenceScore), "low");
  assert.equal(opportunity.requiresHumanApproval, true);
  assert.equal(opportunity.priceRange?.currency, "BRL");
});
