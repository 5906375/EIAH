import test from "node:test";
import assert from "node:assert/strict";
import {
  parsePublicWebAssistedListings,
  PublicWebAssistedMarketScanProvider,
} from "../services/imob/publicWebScan/PublicWebAssistedMarketScanProvider";
import { createPublicWebScanEvidence } from "../services/imob/publicWebScan/publicWebScanEvidence";
import { runPublicWebScanMockManual } from "../services/imob/publicWebScan/publicWebScanRuntime";

test("public web scan mock/manual excludes PII and applies confidence disclosure", () => {
  const scan = runPublicWebScanMockManual({
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    listings: [
      {
        sourceId: "public-1",
        city: "Itajaí",
        goal: "venda",
        propertyType: "apartamento",
        price: 620000,
        ownerName: "Nome Exposto",
        phone: "47999999999",
        email: "owner@example.com",
        whatsapp: "47999999999",
      },
    ],
  });

  assert.equal(scan.allowed, true);
  assert.equal(scan.result?.confidenceCap, 0.55);
  assert.equal(scan.result?.piiExcluded, true);
  assert.equal((scan.result?.listings[0] as any).phone, undefined);
  assert.equal((scan.result?.listings[0] as any).email, undefined);
  assert.equal((scan.result?.listings[0] as any).ownerName, undefined);
  assert.match(scan.result?.disclosure.limitations.join(" ") ?? "", /PII/);
});

test("public web scan mock/manual blocks excessive public sample", () => {
  const scan = runPublicWebScanMockManual({
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    requestedPages: 99,
    listings: [],
  });

  assert.equal(scan.allowed, false);
  assert.equal(scan.decision.allowed, false);
});

test("public web scan evidence summarizes sanitized sample", () => {
  const scan = runPublicWebScanMockManual({
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    listings: [{ sourceId: "public-1", city: "Itajaí", goal: "venda", price: 620000 }],
  });
  assert.equal(scan.allowed, true);
  const evidence = createPublicWebScanEvidence(scan.result!);
  assert.equal(evidence.piiExcluded, true);
  assert.equal(evidence.listingCount, 1);
  assert.match(evidence.resultHash, /^[a-f0-9]{64}$/);
});

test("public web assisted parser generates deterministic sourceId when omitted", () => {
  const payload = JSON.stringify([
    {
      city: "Itajaí",
      goal: "venda",
      propertyType: "apto",
      bedrooms: 2,
      price: 620000,
      title: "Apartamento público 2 quartos",
    },
  ]);

  const first = parsePublicWebAssistedListings(payload);
  const second = parsePublicWebAssistedListings(payload);

  assert.equal(first.length, 1);
  assert.equal(first[0]?.sourceId, second[0]?.sourceId);
  assert.match(first[0]?.sourceId ?? "", /^public_[a-f0-9]{16}$/);
  assert.equal(first[0]?.propertyType, "apartamento");
});

test("public web assisted provider maps sanitized public listings to market scan result", async () => {
  const provider = new PublicWebAssistedMarketScanProvider({
    listPublicListings: () => parsePublicWebAssistedListings(JSON.stringify([
      {
        sourceId: "public-1",
        city: "Itajaí",
        goal: "venda",
        propertyType: "apartamento",
        bedrooms: 2,
        price: 620000,
        phone: "47999999999",
        email: "owner@example.com",
      },
    ])),
  });

  const result = await provider.search({
    cities: ["Itajaí"],
    goals: ["venda"],
    propertyTypes: ["apartamento"],
    bedrooms: [2],
    priceRange: null,
    limitPerGroup: 10,
  }, { tenantId: "tenant-1", workspaceId: "workspace-1" });

  assert.equal(result.providerId, "public_web_assisted");
  assert.equal(result.sourceStatus, "completed");
  assert.equal(result.groups[0]?.items[0]?.sourceId, "public-1");
  assert.equal((result.groups[0]?.items[0] as any)?.phone, undefined);
});
