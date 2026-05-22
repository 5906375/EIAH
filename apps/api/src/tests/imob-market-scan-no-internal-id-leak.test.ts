import test from "node:test";
import assert from "node:assert/strict";
import { resolveImobTurn } from "../services/imob/imobTurnResolver";
import type {
  ImobMarketScanResultSnapshot,
  ImobMarketScanRunSnapshot,
  ImobOperationalOpportunity,
  ImobThreadConversationState,
} from "../services/imob/imobConversationContract";

const internalIds = [
  "cmpfersco00141coa5b0reht9",
  "prop-1",
  "public_abcd1234",
  "sourceUrlHash",
  "scanId",
  "sourceId",
  "dedupeKey",
  "clusterHash",
  "evidenceBundleId",
] as const;

function marketScanRun(evidenceBundleId = "evidence-1"): ImobMarketScanRunSnapshot {
  return {
    runId: "market-scan-run-1",
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    caseId: null,
    status: "completed",
    accessMode: "internal_crm",
    sourceIds: ["internal_crm"],
    queryHash: "query-hash-1",
    evidenceBundleId,
  };
}

function marketScanResult(): ImobMarketScanResultSnapshot {
  return {
    scanId: "scanId-should-stay-in-metadata",
    providerId: "internal_crm",
    sourceStatus: "completed",
    totalItems: 3,
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
            price: null,
            currency: "BRL",
            neighborhood: "Centro",
            address: "Rua sourceId 10",
            title: "cmpfersco00141coa5b0reht9",
            url: "hash:sourceUrlHash",
          },
          {
            source: "internal_crm",
            sourceId: "prop-1",
            providerId: "internal_crm",
            retrievedAt: "2026-05-22T12:00:00.000Z",
            city: "Itajaí",
            goal: "venda",
            propertyType: "apartamento",
            bedrooms: 2,
            price: null,
            currency: "BRL",
            neighborhood: "Centro",
            address: "Rua clusterHash 20",
            title: "prop-1",
            url: null,
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
            price: null,
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
      comparableCount: 3,
      priceRange: null,
      liquidityScore: 0.1,
      pricingRisk: "unknown",
      sourceCoverageScore: 0.25,
      confidenceScore: 0.04,
    },
  };
}

function opportunity(evidenceBundleId = "evidence-1"): ImobOperationalOpportunity {
  return {
    opportunityId: "opp-1",
    recommendedAction: "nao_seguir",
    confidenceScore: 0.04,
    sourceCoverageScore: 0.25,
    priceRange: null,
    liquidityScore: 0.1,
    pricingRisk: "unknown",
    nextStep: "Não seguir agora; faltam comparáveis suficientes para recomendação comercial forte.",
    requiresHumanApproval: true,
    evidenceBundleId,
  };
}

function threadState(): ImobThreadConversationState {
  return {
    slots: {
      goal: null,
      city: null,
      region: null,
      neighborhood: null,
      budgetMax: null,
      bedrooms: null,
      bathrooms: null,
      propertyType: null,
    },
    mode: "consult",
    pendingSlot: "none",
    resultOffset: 0,
    operational: {
      flow: "property.market_scan",
      status: "collecting",
      pendingFields: [],
      marketScanContext: {
        cities: ["Itajaí"],
        cityCandidates: ["Itajaí"],
        uf: "SC",
        goals: ["venda"],
        goalCandidates: ["venda"],
        propertyTypes: ["apartamento"],
        bedrooms: [2],
        priceRange: null,
        readOnly: true,
        limitPerGroup: 10,
      },
      marketScanRun: marketScanRun(),
    },
  };
}

test("Market Scan presentation hides internal ids while preserving CTA payload references", () => {
  const result = resolveImobTurn({
    message: "fazer varredura de mercado",
    threadState: threadState(),
    access: { tenantId: "tenant-A", workspaceId: "workspace-A", entitlements: { REAL_ESTATE_CORE: true } },
    marketScanResult: marketScanResult(),
    marketScanOpportunity: opportunity(),
  });

  const visible = [
    result.presentation.text ?? "",
    ...(result.presentation.card?.lines ?? []),
  ].join("\n");

  for (const id of internalIds) {
    assert.doesNotMatch(visible, new RegExp(id, "i"));
  }

  assert.match(visible, /Imóvel 1 · Centro · apartamento · 2 quartos/i);
  assert.match(visible, /Imóvel 2 · Centro · apartamento · 2 quartos/i);
  const ctas = result.presentation.card?.ctas ?? [];
  assert.equal(ctas[0]?.label, "Selecionar Imóvel 1");
  assert.equal(ctas[0]?.nextMessage, "selecionar imóvel 1 do scan");
  assert.equal((ctas[0]?.payload?.marketScan as { sourceId?: string } | undefined)?.sourceId, "cmpfersco00141coa5b0reht9");
});
