import test from "node:test";
import assert from "node:assert/strict";
import type { ImobMarketScanResultSnapshot, ImobMarketScanRunSnapshot } from "../services/imob/imobConversationContract";
import { writeMarketScanResponse } from "../services/imob/marketScan/marketScanResponseWriter";

const resultSnapshot: ImobMarketScanResultSnapshot = {
  scanId: "scan-1",
  providerId: "internal_crm",
  sourceStatus: "completed",
  totalItems: 1,
  readOnly: true,
  generatedAt: "2026-05-18T12:00:00.000Z",
  intelligence: {
    comparableCount: 1,
    priceRange: { min: 600000, max: 650000, currency: "BRL" },
    liquidityScore: 0.52,
    pricingRisk: "high",
    sourceCoverageScore: 0.2,
    confidenceScore: 0.41,
  },
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
          price: 620000,
          currency: "BRL",
          title: "Apartamento 2 quartos",
        },
      ],
    },
  ],
};

function run(evidenceBundleId?: string | null): ImobMarketScanRunSnapshot {
  return {
    runId: "run-1",
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    status: "completed",
    accessMode: "internal_crm",
    sourceIds: ["internal_crm"],
    queryHash: "query-hash",
    evidenceBundleId: evidenceBundleId ?? null,
  };
}

test("market scan response writer blocks strong response without evidence", () => {
  const written = writeMarketScanResponse({
    run: run(null),
    resultSnapshot,
  });

  assert.equal(written.blocked, true);
  assert.equal(written.reasonCode, "MARKET_SCAN_EVIDENCE_REQUIRED");
  assert.doesNotMatch(written.text, /Apartamento 2 quartos/);
});

test("market scan response writer only uses listings from resultSnapshot when evidence exists", () => {
  const written = writeMarketScanResponse({
    run: run("evidence-1"),
    resultSnapshot,
  });

  assert.equal(written.blocked, false);
  assert.match(written.text, /Imóvel 1 · Itajaí · apartamento · 2 quartos/i);
  assert.doesNotMatch(written.text, /prop-1|sourceId|evidenceBundleId/i);
  assert.doesNotMatch(written.text, /prop-inventado/);
});
