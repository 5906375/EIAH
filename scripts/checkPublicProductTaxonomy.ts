import fs from "node:fs";
import path from "node:path";

import {
  getPublicProductTaxonomyEntryByPublicName,
  publicProductTaxonomyContract,
  publicProductTaxonomyVerticalRoadmapOrder,
} from "../apps/api/src/types/publicProductTaxonomyContract.ts";

const controlledFiles = [
  "apps/web/src/components/agents/helpDictionary.agents.ts",
  "apps/web/src/components/agents/platformHelpResolver.ts",
  "apps/web/src/pages/app/agents/index.tsx",
];

const legacyDriftPhrases = [
  "agentes mais operacionais ou internos",
  "agentes operacionais ou internos",
];

function fail(message: string, details?: unknown): never {
  const payload = {
    ok: false,
    check: "check:public-product-taxonomy",
    message,
    details: details ?? null,
  };
  console.error(JSON.stringify(payload, null, 2));
  process.exit(1);
}

function ensure(condition: unknown, message: string, details?: unknown) {
  if (!condition) fail(message, details);
}

ensure(
  publicProductTaxonomyVerticalRoadmapOrder.join("|") === ["LEGAL", "MKT", "Financeiro", "URBAN", "Logística"].join("|"),
  "invalid_vertical_roadmap_order",
  { verticalRoadmapOrder: publicProductTaxonomyVerticalRoadmapOrder }
);

const eiah = getPublicProductTaxonomyEntryByPublicName("EIAH");
const imob = getPublicProductTaxonomyEntryByPublicName("IMOB");
const legal = getPublicProductTaxonomyEntryByPublicName("LEGAL");
const billing = getPublicProductTaxonomyEntryByPublicName("Billing");
const economy = getPublicProductTaxonomyEntryByPublicName("Economy");
const runViewer = getPublicProductTaxonomyEntryByPublicName("RunViewer");
const imobCrm = getPublicProductTaxonomyEntryByPublicName("IMOB_CRM");
const vera = getPublicProductTaxonomyEntryByPublicName("VERA");
const revenue = getPublicProductTaxonomyEntryByPublicName("Revenue");

ensure(eiah?.taxonomyClass === "assistant_main", "invalid_eiah_class", eiah);
ensure(imob?.taxonomyClass === "vertical", "invalid_imob_class", imob);
ensure(legal?.taxonomyClass === "vertical" && legal?.commercialStatus === "preview", "invalid_legal_status", legal);
ensure(billing?.taxonomyClass === "operational_surface", "invalid_billing_class", billing);
ensure(economy?.taxonomyClass === "operational_surface", "invalid_economy_class", economy);
ensure(runViewer?.taxonomyClass === "operational_surface", "invalid_runviewer_class", runViewer);
ensure(imobCrm?.taxonomyClass === "internal_component", "invalid_imob_crm_class", imobCrm);
ensure(vera?.commercialStatus !== "available", "vera_must_not_be_available", vera);
ensure(revenue?.commercialStatus !== "available", "revenue_must_not_be_available", revenue);

const availableWithoutSource = publicProductTaxonomyContract.entries
  .filter((entry) => entry.commercialStatus === "available" && entry.sourceOfTruth.length === 0)
  .map((entry) => entry.publicName);

ensure(availableWithoutSource.length === 0, "available_without_source_of_truth", availableWithoutSource);

const forbiddenLabels = publicProductTaxonomyContract.entries.flatMap((entry) =>
  entry.forbiddenLabels.map((label) => ({ entry: entry.publicName, label }))
);

const forbiddenHits: Array<{ file: string; entry: string; label: string }> = [];
const legacyHits: Array<{ file: string; phrase: string }> = [];

for (const relativeFile of controlledFiles) {
  const absoluteFile = path.resolve(relativeFile);
  const content = fs.readFileSync(absoluteFile, "utf8");

  for (const forbidden of forbiddenLabels) {
    if (forbidden.label && content.includes(forbidden.label)) {
      forbiddenHits.push({ file: relativeFile, entry: forbidden.entry, label: forbidden.label });
    }
  }

  for (const phrase of legacyDriftPhrases) {
    if (content.includes(phrase)) {
      legacyHits.push({ file: relativeFile, phrase });
    }
  }
}

ensure(forbiddenHits.length === 0, "forbidden_labels_found_in_controlled_copy", forbiddenHits);
ensure(legacyHits.length === 0, "legacy_taxonomy_phrases_found", legacyHits);

console.log(
  JSON.stringify(
    {
      ok: true,
      check: "check:public-product-taxonomy",
      entries: publicProductTaxonomyContract.entries.length,
      verticalRoadmapOrder: publicProductTaxonomyVerticalRoadmapOrder,
      controlledFiles,
    },
    null,
    2
  )
);
