import test from "node:test";
import assert from "node:assert/strict";

import {
  getPublicProductTaxonomyEntryByPublicName,
  publicProductTaxonomyContract,
  publicProductTaxonomyReservedInternalPrefixes,
  publicProductTaxonomyVerticalRoadmapOrder,
} from "../types/publicProductTaxonomyContract";

test("public product taxonomy keeps canonical vertical roadmap order", () => {
  assert.deepEqual(publicProductTaxonomyVerticalRoadmapOrder, ["LEGAL", "MKT", "Financeiro", "URBAN", "Logística"]);
});

test("public product taxonomy keeps required classifications", () => {
  assert.equal(getPublicProductTaxonomyEntryByPublicName("EIAH")?.taxonomyClass, "assistant_main");
  assert.equal(getPublicProductTaxonomyEntryByPublicName("IMOB")?.taxonomyClass, "vertical");
  assert.equal(getPublicProductTaxonomyEntryByPublicName("LEGAL")?.commercialStatus, "preview");
  assert.equal(getPublicProductTaxonomyEntryByPublicName("Billing")?.taxonomyClass, "operational_surface");
  assert.equal(getPublicProductTaxonomyEntryByPublicName("Economy")?.taxonomyClass, "operational_surface");
  assert.equal(getPublicProductTaxonomyEntryByPublicName("RunViewer")?.taxonomyClass, "operational_surface");
  assert.equal(getPublicProductTaxonomyEntryByPublicName("IMOB_CRM")?.taxonomyClass, "internal_component");
  assert.equal(getPublicProductTaxonomyEntryByPublicName("VERA")?.commercialStatus, "proposal");
  assert.equal(getPublicProductTaxonomyEntryByPublicName("Revenue")?.commercialStatus, "proposal");
});

test("available entries always have canonical sourceOfTruth", () => {
  for (const entry of publicProductTaxonomyContract.entries) {
    if (entry.commercialStatus === "available") {
      assert.ok(entry.sourceOfTruth.length > 0, `${entry.publicName} must declare sourceOfTruth`);
    }
  }
});

test("reserved internal prefixes keep IMOB runtime namespace out of public naming", () => {
  assert.ok(publicProductTaxonomyReservedInternalPrefixes.includes("IMOB_"));
});
