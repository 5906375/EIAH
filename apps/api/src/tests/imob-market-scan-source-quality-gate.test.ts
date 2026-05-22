import test from "node:test";
import assert from "node:assert/strict";
import type { MarketScanProvider } from "../services/imob/marketScan/MarketScanProvider";
import { executeMarketScanPipeline } from "../services/imob/marketScan/marketScanPipeline";
import { evaluateMarketScanSourceDataQuality } from "../services/imob/marketScan/sourceDataQualityGate";
import { SourceConnectorRegistry } from "../services/imob/marketScan/sourceConnectorRegistry";
import { resolveImobTurn } from "../services/imob/imobTurnResolver";

function createFakePrisma() {
  const rows = new Map<string, any>();
  const calls: Array<{ op: "create" | "update"; data: any }> = [];
  return {
    calls,
    prisma: {
      imobMarketScanRun: {
        async create(args: any) {
          const row = { ...args.data };
          rows.set(row.id, row);
          calls.push({ op: "create", data: row });
          return row;
        },
        async update(args: any) {
          const current = rows.get(args.where.id);
          assert.ok(current, "run must exist before update");
          const row = { ...current, ...args.data };
          rows.set(args.where.id, row);
          calls.push({ op: "update", data: row });
          return row;
        },
      },
    },
  };
}

const query = {
  cities: ["Itajaí"],
  goals: ["venda"],
  propertyTypes: ["apartamento" as const],
  bedrooms: [2],
  priceRange: null,
  limitPerGroup: 10,
};

test("source data quality gate computes fill-rate for price, areaM2 and priceAreaM2", () => {
  const quality = evaluateMarketScanSourceDataQuality({
    scanId: "scan-1",
    providerId: "internal_crm",
    sourceStatus: "completed",
    totalItems: 2,
    readOnly: true,
    generatedAt: "2026-05-22T10:00:00.000Z",
    groups: [{
      city: "Itajaí",
      goal: "venda",
      propertyType: "apartamento",
      bedrooms: 2,
      items: [
        {
          source: "internal_crm",
          sourceId: "prop-1",
          providerId: "internal_crm",
          retrievedAt: "2026-05-22T10:00:00.000Z",
          city: "Itajaí",
          goal: "venda",
          propertyType: "apartamento",
          bedrooms: 2,
          price: 600000,
          areaM2: 60,
          priceAreaM2: 10000,
          currency: "BRL",
        },
        {
          source: "internal_crm",
          sourceId: "prop-2",
          providerId: "internal_crm",
          retrievedAt: "2026-05-22T10:00:00.000Z",
          city: "Itajaí",
          goal: "venda",
          propertyType: "apartamento",
          bedrooms: 2,
          price: null,
          areaM2: null,
          priceAreaM2: null,
          currency: "BRL",
        },
      ],
    }],
  });

  assert.equal(quality.status, "degraded");
  assert.deepEqual(quality.fillRate, { price: 0.5, areaM2: 0.5, priceAreaM2: 0.5 });
  assert.ok(quality.confidencePenalty > 0);
  assert.ok(quality.reasonCodes.includes("MARKET_PRICE_FILL_RATE_LOW"));
});

test("market scan pipeline blocks before scoring when source quality has no core pricing signal", async () => {
  const fake = createFakePrisma();
  const provider: MarketScanProvider = {
    providerId: "internal_crm",
    async search() {
      return {
        providerId: "internal_crm",
        sourceStatus: "completed",
        totalItems: 2,
        groups: [{
          city: "Itajaí",
          goal: "venda",
          propertyType: "apartamento",
          bedrooms: 2,
          items: [
            {
              source: "internal_crm",
              sourceId: "prop-1",
              providerId: "internal_crm",
              retrievedAt: "2026-05-22T10:00:00.000Z",
              city: "Itajaí",
              goal: "venda",
              propertyType: "apartamento",
              bedrooms: 2,
              price: null,
              currency: "BRL",
            },
            {
              source: "internal_crm",
              sourceId: "prop-2",
              providerId: "internal_crm",
              retrievedAt: "2026-05-22T10:00:00.000Z",
              city: "Itajaí",
              goal: "venda",
              propertyType: "apartamento",
              bedrooms: 2,
              price: null,
              currency: "BRL",
            },
          ],
        }],
      };
    },
  };

  const result = await executeMarketScanPipeline({
    prisma: fake.prisma,
    connectorRegistry: new SourceConnectorRegistry({ internal_crm: provider }),
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    query,
    sourceId: "internal_crm",
  });

  assert.deepEqual(
    fake.calls.filter((call) => call.op === "update").map((call) => call.data.status),
    ["authorization", "fetch", "normalization", "completed"],
  );
  assert.equal(result.resultSnapshot?.sourceDataQuality?.status, "blocked");
  assert.equal(result.resultSnapshot?.intelligence ?? null, null);
  assert.equal(result.opportunity, null);
  assert.ok(result.evidenceBundle?.evidenceBundleId);
  assert.equal(result.run.evidenceBundleId, result.evidenceBundle?.evidenceBundleId);
});

test("market scan pipeline applies confidence penalty for degraded source quality", async () => {
  const fake = createFakePrisma();
  const provider: MarketScanProvider = {
    providerId: "internal_crm",
    async search() {
      return {
        providerId: "internal_crm",
        sourceStatus: "completed",
        totalItems: 2,
        groups: [{
          city: "Itajaí",
          goal: "venda",
          propertyType: "apartamento",
          bedrooms: 2,
          items: [
            {
              source: "internal_crm",
              sourceId: "prop-1",
              providerId: "internal_crm",
              retrievedAt: "2026-05-22T10:00:00.000Z",
              city: "Itajaí",
              goal: "venda",
              propertyType: "apartamento",
              bedrooms: 2,
              price: 620000,
              currency: "BRL",
            },
            {
              source: "internal_crm",
              sourceId: "prop-2",
              providerId: "internal_crm",
              retrievedAt: "2026-05-22T10:00:00.000Z",
              city: "Itajaí",
              goal: "venda",
              propertyType: "apartamento",
              bedrooms: 2,
              price: 640000,
              currency: "BRL",
            },
          ],
        }],
      };
    },
  };

  const result = await executeMarketScanPipeline({
    prisma: fake.prisma,
    connectorRegistry: new SourceConnectorRegistry({ internal_crm: provider }),
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    query,
    sourceId: "internal_crm",
  });

  assert.equal(result.resultSnapshot?.sourceDataQuality?.status, "degraded");
  assert.ok((result.resultSnapshot?.sourceDataQuality?.confidencePenalty ?? 0) > 0);
  assert.ok((result.resultSnapshot?.intelligence?.confidenceScore ?? 1) < 0.4);
  assert.equal(result.opportunity?.confidenceScore, result.resultSnapshot?.intelligence?.confidenceScore);
});

test("market scan presentation shows compact source quality block without scoring details in text", () => {
  const result = resolveImobTurn({
    message: "fazer varredura de mercado em Itajaí para apartamentos de 2 quartos para venda",
    access: { tenantId: "tenant-1", workspaceId: "workspace-1", entitlements: {} },
    marketScanResult: {
      scanId: "scan-quality-blocked",
      providerId: "internal_crm",
      sourceStatus: "completed",
      totalItems: 2,
      readOnly: true,
      generatedAt: "2026-05-22T10:00:00.000Z",
      sourceDataQuality: {
        status: "blocked",
        fillRate: { price: 0, areaM2: 0, priceAreaM2: 0 },
        confidencePenalty: 1,
        reasonCodes: ["MARKET_SOURCE_QUALITY_BLOCKED"],
        message: "2 imóveis sem dados mínimos.",
      },
      groups: [{
        city: "Itajaí",
        goal: "venda",
        propertyType: "apartamento",
        bedrooms: 2,
        items: [
          {
            source: "internal_crm",
            sourceId: "prop-1",
            providerId: "internal_crm",
            retrievedAt: "2026-05-22T10:00:00.000Z",
            city: "Itajaí",
            goal: "venda",
            propertyType: "apartamento",
            bedrooms: 2,
            price: null,
            currency: "BRL",
            neighborhood: "Centro",
          },
        ],
      }],
    },
  });

  const text = result.presentation.text ?? "";
  const lines = result.presentation.card?.lines?.join("\n") ?? "";
  assert.match(text, /Varredura de mercado concluída/i);
  assert.doesNotMatch(text, /Qualidade dos dados|Scoring bloqueado|Liquidez|Confiança/i);
  assert.match(lines, /Qualidade dos dados: bloqueada/i);
  assert.match(lines, /Scoring bloqueado: faltam dados mínimos de preço\/área/i);
  assert.match(lines, /Imóvel 1 · Centro · apartamento · 2 quartos/i);
  assert.doesNotMatch(lines, /prop-1|scan-quality-blocked|sourceId/i);
  assert.equal(result.presentation.card?.ctas?.[0]?.label, "Selecionar Imóvel 1");
  assert.equal((result.presentation.card?.ctas?.[0]?.payload?.marketScan as { sourceId?: string } | undefined)?.sourceId, "prop-1");
});
