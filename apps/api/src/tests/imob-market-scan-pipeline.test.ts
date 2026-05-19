import test from "node:test";
import assert from "node:assert/strict";
import type { MarketScanProvider } from "../services/imob/marketScan/MarketScanProvider";
import { executeMarketScanPipeline } from "../services/imob/marketScan/marketScanPipeline";
import { SourceConnectorRegistry } from "../services/imob/marketScan/sourceConnectorRegistry";
import { PublicWebAssistedMarketScanProvider } from "../services/imob/publicWebScan/PublicWebAssistedMarketScanProvider";

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

test("market scan pipeline creates run, gates source, then fetches internal CRM listings", async () => {
  const fake = createFakePrisma();
  const providerCalls: string[] = [];
  const provider: MarketScanProvider = {
    providerId: "internal_crm",
    async search(query, context) {
      providerCalls.push(`${context.tenantId}:${query.cities[0]}`);
      return {
        providerId: "internal_crm",
        sourceStatus: "completed",
        totalItems: 1,
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
                price: 650000,
                currency: "BRL",
              },
            ],
          },
        ],
      };
    },
  };

  const result = await executeMarketScanPipeline({
    prisma: fake.prisma,
    connectorRegistry: new SourceConnectorRegistry({ internal_crm: provider }),
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    query: {
      cities: ["Itajaí"],
      goals: ["venda"],
      propertyTypes: ["apartamento"],
      bedrooms: [2],
      priceRange: null,
      limitPerGroup: 10,
    },
    sourceId: "internal_crm",
  });

  assert.equal(fake.calls[0]?.op, "create");
  assert.deepEqual(
    fake.calls.filter((call) => call.op === "update").map((call) => call.data.status),
    ["authorization", "fetch", "normalization", "matching", "scoring", "recommendation", "completed"],
  );
  assert.deepEqual(providerCalls, ["tenant-1:Itajaí"]);
  assert.equal(result.sourceAccessDecision.allowed, true);
  assert.equal(result.run.status, "completed");
  assert.equal(result.resultSnapshot?.totalItems, 1);
  assert.equal(result.resultSnapshot?.groups[0]?.items[0]?.sourceId, "prop-1");
  assert.equal(result.resultSnapshot?.intelligence?.pricingRisk, "high");
  assert.equal(result.opportunity?.requiresHumanApproval, true);
  assert.equal(fake.calls.at(-1)?.data.opportunityId, result.opportunity?.opportunityId);
});

test("market scan pipeline blocks fail-closed before connector fetch", async () => {
  const fake = createFakePrisma();
  let providerCalled = false;
  const provider: MarketScanProvider = {
    providerId: "internal_crm",
    async search() {
      providerCalled = true;
      throw new Error("provider should not be called");
    },
  };

  const result = await executeMarketScanPipeline({
    prisma: fake.prisma,
    connectorRegistry: new SourceConnectorRegistry({ internal_crm: provider }),
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    query: {
      cities: ["Itajaí"],
      goals: ["venda"],
      propertyTypes: [],
      bedrooms: [],
      priceRange: null,
      limitPerGroup: 10,
    },
    sourceId: "internal_crm",
    sourceAccess: { collectsPii: true },
  });

  assert.equal(providerCalled, false);
  assert.equal(result.sourceAccessDecision.allowed, false);
  assert.equal(result.run.status, "blocked");
  assert.equal(fake.calls.at(-1)?.data.failureReason, "PII_EXPOSURE_RISK");
});

test("market scan pipeline falls back to public web assisted after empty authorized sources", async () => {
  const fake = createFakePrisma();
  const calls: string[] = [];
  const emptyProvider = (providerId: "tenant_inventory_import" | "internal_crm"): MarketScanProvider => ({
    providerId,
    async search() {
      calls.push(providerId);
      return { providerId, sourceStatus: "empty", totalItems: 0, groups: [] };
    },
  });
  const publicProvider = new PublicWebAssistedMarketScanProvider({
    listPublicListings() {
      calls.push("public_web_assisted");
      return [
        {
          sourceId: "public-1",
          city: "Itajaí",
          goal: "venda",
          propertyType: "apartamento",
          bedrooms: 2,
          price: 620000,
          title: "Apartamento público",
          phone: "47999999999",
          email: "owner@example.com",
          ownerName: "Anunciante",
        },
      ];
    },
  });

  const result = await executeMarketScanPipeline({
    prisma: fake.prisma,
    connectorRegistry: new SourceConnectorRegistry({
      tenant_inventory_import: emptyProvider("tenant_inventory_import"),
      internal_crm: emptyProvider("internal_crm"),
      public_web_assisted: publicProvider,
    }),
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    query: {
      cities: ["Itajaí"],
      goals: ["venda"],
      propertyTypes: ["apartamento"],
      bedrooms: [2],
      priceRange: null,
      limitPerGroup: 10,
    },
  });

  assert.deepEqual(calls, ["tenant_inventory_import", "internal_crm", "public_web_assisted"]);
  assert.equal(result.sourceAccessDecision.allowed, true);
  assert.equal(result.sourceAccessDecision.allowed ? result.sourceAccessDecision.accessMode : null, "public_web_assisted");
  assert.equal(result.run.disclosure?.coverage, "limited_public_web_sample");
  assert.equal(result.resultSnapshot?.providerId, "public_web_assisted");
  assert.equal(result.resultSnapshot?.groups[0]?.items[0]?.sourceId, "public-1");
  assert.equal((result.resultSnapshot?.groups[0]?.items[0] as any)?.phone, undefined);
});
