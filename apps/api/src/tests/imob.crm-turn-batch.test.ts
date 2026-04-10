import test from "node:test";
import assert from "node:assert/strict";

import { extractImobOperationalBatches } from "../services/imob/crm/imobCrmTurnBatch";

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

