import test from "node:test";
import assert from "node:assert/strict";

import { InternalCrmMarketScanProvider } from "../services/imob/marketScan/InternalCrmMarketScanProvider";
import { TenantInventoryImportProvider } from "../services/imob/marketScan/TenantInventoryImportProvider";

function createInternalSource() {
  const properties = [
    {
      id: "property-1",
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      propertyType: "apartamento" as const,
      goal: "locacao",
      city: "Itajaí",
      neighborhood: "Centro",
      address: "Rua 1000",
      bedrooms: 2,
      askingPriceCents: 320000,
      status: "active",
    },
    {
      id: "property-2",
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      propertyType: "kitnet" as const,
      goal: "locacao",
      city: "Camboriú",
      neighborhood: "Centro",
      address: "Rua 2000",
      bedrooms: 1,
      askingPriceCents: 210000,
      status: "active",
    },
    {
      id: "property-3",
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      propertyType: "apartamento" as const,
      goal: "venda",
      city: "Itajaí",
      neighborhood: "Fazenda",
      address: "Rua 3000",
      bedrooms: 2,
      askingPriceCents: 70000000,
      status: "active",
    },
    {
      id: "property-4",
      tenantId: "tenant-1",
      workspaceId: "workspace-2",
      propertyType: "casa" as const,
      goal: "locacao",
      city: "Itajaí",
      neighborhood: "Praia Brava",
      address: "Rua 4000",
      bedrooms: 3,
      askingPriceCents: 500000,
      status: "active",
    },
    {
      id: "property-5",
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      propertyType: "casa" as const,
      goal: "locacao",
      city: "Itajaí",
      neighborhood: "Centro",
      address: "Rua 5000",
      bedrooms: 3,
      askingPriceCents: 480000,
      status: "archived",
    },
  ];

  return {
    listProperties(scope: { tenantId: string; workspaceId: string }) {
      return properties.filter((item) => item.tenantId === scope.tenantId && item.workspaceId === scope.workspaceId);
    },
  };
}

test("internal CRM market scan provider filters by tenant, workspace, city and goal", async () => {
  const provider = new InternalCrmMarketScanProvider(createInternalSource());
  const result = await provider.search({
    cities: ["Itajaí"],
    goals: ["locacao"],
    propertyTypes: [],
    bedrooms: [],
    priceRange: null,
    limitPerGroup: 10,
  }, {
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    marketScanContext: null,
  });

  assert.equal(result.providerId, "internal_crm");
  assert.equal(result.sourceStatus, "completed");
  assert.equal(result.totalItems, 1);
  assert.equal(result.groups[0]?.items.every((item) => item.city === "Itajaí"), true);
  assert.equal(result.groups[0]?.items.every((item) => item.goal === "locacao"), true);
  assert.equal(result.groups[0]?.items.every((item) => item.source === "internal_crm"), true);
});

test("internal CRM market scan provider applies property type, bedrooms and price range filters", async () => {
  const provider = new InternalCrmMarketScanProvider(createInternalSource());
  const result = await provider.search({
    cities: ["Camboriú", "Itajaí"],
    goals: ["locacao"],
    propertyTypes: ["kitnet", "apartamento"],
    bedrooms: [1],
    priceRange: {
      min: null,
      max: 3500,
      currency: "BRL",
      period: "monthly",
      confidence: "high",
      ambiguityReason: null,
    },
    limitPerGroup: 10,
  }, {
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    marketScanContext: null,
  });

  assert.equal(result.totalItems, 1);
  assert.equal(result.groups[0]?.propertyType, "kitnet");
  assert.equal(result.groups[0]?.bedrooms, 1);
  assert.equal(result.groups[0]?.items[0]?.price, 2100);
});

test("internal CRM market scan provider keeps sourceId on every result and respects group limits", async () => {
  const provider = new InternalCrmMarketScanProvider({
    listProperties() {
      return Array.from({ length: 12 }, (_, index) => ({
        id: `property-${index + 1}`,
        tenantId: "tenant-1",
        workspaceId: "workspace-1",
        propertyType: "apartamento" as const,
        goal: "locacao",
        city: "Itajaí",
        neighborhood: "Centro",
        address: `Rua ${index + 1}`,
        bedrooms: 2,
        askingPriceCents: 300000 + index * 1000,
        status: "active",
      }));
    },
  });

  const result = await provider.search({
    cities: ["Itajaí"],
    goals: ["locacao"],
    propertyTypes: ["apartamento"],
    bedrooms: [2],
    priceRange: null,
    limitPerGroup: 10,
  }, {
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    marketScanContext: null,
  });

  assert.equal(result.totalItems, 12);
  assert.equal(result.groups[0]?.items.length, 10);
  assert.equal(result.groups[0]?.items.every((item) => item.sourceId.length > 0), true);
});

test("internal CRM market scan provider returns empty when there is no eligible source data", async () => {
  const provider = new InternalCrmMarketScanProvider(createInternalSource());
  const result = await provider.search({
    cities: ["Florianópolis"],
    goals: ["locacao"],
    propertyTypes: ["casa"],
    bedrooms: [4],
    priceRange: null,
    limitPerGroup: 10,
  }, {
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    marketScanContext: null,
  });

  assert.equal(result.sourceStatus, "empty");
  assert.equal(result.totalItems, 0);
  assert.deepEqual(result.groups, []);
});

test("tenant inventory import provider stays unavailable until a real import source is wired", async () => {
  const provider = new TenantInventoryImportProvider();
  const result = await provider.search({
    cities: ["Itajaí"],
    goals: ["locacao"],
    propertyTypes: [],
    bedrooms: [],
    priceRange: null,
    limitPerGroup: 10,
  }, {
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    marketScanContext: null,
  });

  assert.equal(result.providerId, "tenant_inventory_import");
  assert.equal(result.sourceStatus, "unavailable");
  assert.equal(result.totalItems, 0);
});
