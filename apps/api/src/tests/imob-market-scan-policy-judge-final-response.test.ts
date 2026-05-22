import test from "node:test";
import assert from "node:assert/strict";
import { writeMarketScanResponse } from "../services/imob/marketScan/marketScanResponseWriter";
import { judgeMarketScanPolicy } from "../services/imob/marketScan/marketScanPolicyJudge";
import type {
  ImobMarketScanResultSnapshot,
  ImobMarketScanRunSnapshot,
  ImobOperationalOpportunity,
} from "../services/imob/imobConversationContract";

function run(evidenceBundleId: string | null): ImobMarketScanRunSnapshot {
  return {
    runId: "run-1",
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    caseId: null,
    status: "completed",
    accessMode: "internal_crm",
    sourceIds: ["internal_crm"],
    queryHash: "query-hash",
    evidenceBundleId,
  };
}

function resultSnapshot(): ImobMarketScanResultSnapshot {
  return {
    scanId: "scan-1",
    providerId: "internal_crm",
    sourceStatus: "completed",
    totalItems: 2,
    groups: [
      {
        city: "Itajaí",
        goal: "venda",
        propertyType: "apartamento",
        bedrooms: 2,
        items: [
          {
            source: "internal_crm",
            sourceId: "cmpfersco00141coa5b0reht9",
            providerId: "internal_crm",
            retrievedAt: "2026-05-22T12:00:00.000Z",
            city: "Itajaí",
            goal: "venda",
            propertyType: "apartamento",
            bedrooms: 2,
            price: 620000,
            currency: "BRL",
            neighborhood: "Centro",
            address: "Rua 100",
            title: "cmpfersco00141coa5b0reht9",
            url: "hash:sourceUrlHash",
          },
          {
            source: "public_web_assisted",
            sourceId: "public_abcd1234",
            providerId: "public_web_assisted",
            retrievedAt: "2026-05-22T12:00:00.000Z",
            city: "Itajaí",
            goal: "venda",
            propertyType: "apartamento",
            bedrooms: 2,
            price: 640000,
            currency: "BRL",
            neighborhood: "Centro",
            address: null,
            title: "public_abcd1234",
            url: "hash:sourceUrlHash",
          },
        ],
      },
    ],
    readOnly: true,
    generatedAt: "2026-05-22T12:00:00.000Z",
    intelligence: {
      comparableCount: 2,
      priceRange: { min: 620000, max: 640000, currency: "BRL" },
      liquidityScore: 0.2,
      pricingRisk: "high",
      sourceCoverageScore: 0.2,
      confidenceScore: 0.25,
    },
  };
}

function opportunity(): ImobOperationalOpportunity {
  return {
    opportunityId: "opp-1",
    recommendedAction: "pedir_autorizacao",
    confidenceScore: 0.25,
    sourceCoverageScore: 0.2,
    priceRange: { min: 620000, max: 640000, currency: "BRL" },
    liquidityScore: 0.2,
    pricingRisk: "high",
    nextStep: "Pedir autorização ou fonte adicional antes de executar ação comercial.",
    requiresHumanApproval: true,
    evidenceBundleId: "evidence-1",
  };
}

test("market scan writer runs policy judge before final response and blocks missing evidence", () => {
  const response = writeMarketScanResponse({
    run: run(null),
    resultSnapshot: resultSnapshot(),
    opportunity: opportunity(),
  });

  assert.equal(response.blocked, true);
  assert.equal(response.reasonCode, "MARKET_SCAN_EVIDENCE_REQUIRED");
  assert.match(response.text, /Dados insuficientes para recomendação forte/i);
  assert.doesNotMatch(response.text, /Ação recomendada|pedir_autorizacao/i);
});

test("market scan writer emits only human labels while preserving internal evidence out of visible lines", () => {
  const response = writeMarketScanResponse({
    run: run("evidence-1"),
    resultSnapshot: resultSnapshot(),
    opportunity: opportunity(),
  });

  assert.equal(response.blocked, false);
  assert.equal(response.evidenceBundleId, "evidence-1");
  const visible = [response.text, ...response.lines].join("\n");
  assert.match(visible, /Imóvel 1 · Centro · apartamento · 2 quartos/i);
  assert.match(visible, /Imóvel 2 · Centro · apartamento · 2 quartos/i);
  assert.doesNotMatch(visible, /cmpfersco00141coa5b0reht9|public_abcd1234|sourceUrlHash|sourceId|scanId|evidenceBundleId/i);
});

test("market scan policy judge blocks internal ids in visible final response", () => {
  const decision = judgeMarketScanPolicy({
    run: run("evidence-1"),
    resultSnapshot: resultSnapshot(),
    opportunity: opportunity(),
    visibleText: "Resultado para sourceId cmpfersco00141coa5b0reht9",
    visibleLines: ["- public_abcd1234"],
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.reasonCode, "MARKET_SCAN_INTERNAL_ID_LEAK");
});
