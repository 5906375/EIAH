import test from "node:test";
import assert from "node:assert/strict";
import {
  attachMarketScanSnapshotToOperationalState,
  loadLatestImobMarketScanSnapshot,
  persistImobMarketScanSnapshot,
} from "../services/imob/marketScan/imobMarketScanSnapshot";

const snapshot = {
  scanId: "market-scan-1",
  providerId: "internal_crm",
  sourceStatus: "completed" as const,
  totalItems: 1,
  groups: [
    {
      city: "Itajaí",
      goal: "locacao",
      propertyType: "apartamento" as const,
      bedrooms: 2,
      items: [
        {
          source: "internal_crm",
          sourceId: "prop-1",
          providerId: "internal_crm",
          retrievedAt: "2026-05-09T12:00:00.000Z",
          city: "Itajaí",
          uf: "SC",
          goal: "locacao",
          propertyType: "apartamento" as const,
          bedrooms: 2,
          price: 3200,
          currency: "BRL" as const,
          neighborhood: "Centro",
          address: "Rua 1500",
          title: "Apartamento 2 quartos",
          url: null,
        },
      ],
    },
  ],
  readOnly: true as const,
  generatedAt: "2026-05-09T12:00:00.000Z",
};

test("market scan snapshot persists as read-only case history by tenant/workspace/case", async () => {
  const events: any[] = [];
  const persisted = await persistImobMarketScanSnapshot({
    prisma: {
      imobCaseEvent: {
        async create(args: any) {
          events.push(args.data);
          return { id: "event-1" };
        },
      },
    },
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    caseId: "case-1",
    marketScanContext: {
      cities: ["Itajaí"],
      cityCandidates: ["Itajaí"],
      uf: "SC",
      goals: ["locacao"],
      goalCandidates: ["locacao"],
      propertyTypes: ["apartamento"],
      bedrooms: [2],
      priceRange: { min: null, max: 3500, currency: "BRL", period: "monthly", confidence: "high", ambiguityReason: null },
      readOnly: true,
      limitPerGroup: 10,
    },
    snapshot,
  });

  assert.equal(persisted, true);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "market_scan.snapshot");
  assert.equal(events[0].payload.scanId, "market-scan-1");
  assert.equal(events[0].payload.context.limitPerGroup, 10);
});

test("market scan snapshot loads latest persisted payload for resume", async () => {
  const loaded = await loadLatestImobMarketScanSnapshot({
    prisma: {
      imobCaseEvent: {
        async findFirst() {
          return { payload: snapshot };
        },
      },
    },
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    caseId: "case-1",
  });

  assert.equal(loaded?.scanId, "market-scan-1");
  assert.equal(loaded?.groups[0]?.items[0]?.sourceId, "prop-1");
  assert.equal(loaded?.readOnly, true);
});

test("market scan snapshot attaches to property.market_scan operational state only", () => {
  const operational = attachMarketScanSnapshotToOperationalState({
    flow: "property.market_scan",
    status: "collecting",
    pendingFields: ["city"],
    propertyDraft: {
      propertyId: null,
      propertyType: null,
      goal: null,
      cep: null,
      city: null,
      neighborhood: null,
      bedrooms: null,
      bathrooms: null,
      address: null,
    },
  }, snapshot);

  assert.equal(operational?.marketScanSnapshot?.scanId, "market-scan-1");
});
