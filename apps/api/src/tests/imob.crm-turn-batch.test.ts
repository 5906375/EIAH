import test from "node:test";
import assert from "node:assert/strict";

import { extractImobOperationalBatches } from "../services/imob/crm/imobCrmTurnBatch";
import type { ParsedImobIntent } from "../services/imob/imobIntentCatalog";

function normalizeImobRouteText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

test("extracts owner + lead from composed phrase with typo", () => {
  const batches = extractImobOperationalBatches(
    "cadstrar o proprietário deste imóvel e qualificar a lead",
    normalizeImobRouteText,
  );

  assert.equal(batches.length, 1);
  assert.deepEqual(batches[0], ["cadastrar proprietário", "qualificar lead"]);
});

test("does not re-open property.create for reference to current property in composed phrase", () => {
  const batches = extractImobOperationalBatches(
    "cadastrar o proprietário deste imóvel e qualificar a lead",
    normalizeImobRouteText,
  );

  assert.equal(batches.length, 1);
  assert.deepEqual(batches[0], ["cadastrar proprietário", "qualificar lead"]);
});

test("keeps explicit new-property command when user asks for novo imóvel", () => {
  const batches = extractImobOperationalBatches(
    "cadastrar novo imóvel e qualificar lead",
    normalizeImobRouteText,
  );

  assert.equal(batches.length, 1);
  assert.deepEqual(batches[0], ["cadastrar imóvel", "qualificar lead"]);
});

test("does not promote a single ambiguous market scan capture phrase to batch from composed intents alone", () => {
  const semanticComposedIntents: ParsedImobIntent[] = [
    {
      entity: "comprador",
      action: "create",
      matchedEntityAlias: null,
      matchedActionAlias: null,
      entityScore: 120,
      actionScore: 120,
      pluralityHint: null,
      canonicalLabel: null,
    },
    {
      entity: "vendedor",
      action: "create",
      matchedEntityAlias: null,
      matchedActionAlias: null,
      entityScore: 120,
      actionScore: 120,
      pluralityHint: null,
      canonicalLabel: null,
    },
    {
      entity: "locatario",
      action: "create",
      matchedEntityAlias: null,
      matchedActionAlias: null,
      entityScore: 120,
      actionScore: 120,
      pluralityHint: null,
      canonicalLabel: null,
    },
  ];

  const batches = extractImobOperationalBatches(
    "Quero captar um imóvel para comprar, vender, locação em Itajaí e Camboriú em Santa Catarina",
    normalizeImobRouteText,
    semanticComposedIntents,
  );

  assert.deepEqual(batches, []);
});

test("still accepts semantic composed intents when the text carries a real structural batch signal", () => {
  const semanticComposedIntents: ParsedImobIntent[] = [
    {
      entity: "proprietario",
      action: "create",
      matchedEntityAlias: null,
      matchedActionAlias: null,
      entityScore: 120,
      actionScore: 120,
      pluralityHint: null,
      canonicalLabel: null,
    },
    {
      entity: "lead",
      action: "create",
      matchedEntityAlias: null,
      matchedActionAlias: null,
      entityScore: 120,
      actionScore: 120,
      pluralityHint: null,
      canonicalLabel: null,
    },
  ];

  const batches = extractImobOperationalBatches(
    "1. Proprietário novo\n2. Lead novo",
    normalizeImobRouteText,
    semanticComposedIntents,
  );

  assert.equal(batches.length, 1);
  assert.deepEqual(batches[0], ["cadastrar proprietário", "qualificar lead"]);
});
