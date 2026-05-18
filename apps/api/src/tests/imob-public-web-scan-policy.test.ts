import test from "node:test";
import assert from "node:assert/strict";
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
