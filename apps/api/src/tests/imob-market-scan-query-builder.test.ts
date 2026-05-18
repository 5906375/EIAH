import test from "node:test";
import assert from "node:assert/strict";

import { buildMarketScanStructuredQuery } from "../services/imob/marketScan/marketScanQueryBuilder";

test("market scan query builder extracts structured filters without fetching sources", () => {
  const built = buildMarketScanStructuredQuery("Analise apartamentos em São Paulo, Pinheiros, venda até 900 mil com 2 quartos");

  assert.equal(built.version, "1.0");
  assert.equal(built.query.region, "São Paulo");
  assert.equal(built.query.uf, "SP");
  assert.equal(built.query.neighborhood, "Pinheiros");
  assert.equal(built.query.operation, "sale");
  assert.deepEqual(built.query.goals, ["venda"]);
  assert.deepEqual(built.query.propertyTypes, ["apartamento"]);
  assert.deepEqual(built.query.bedrooms, [2]);
  assert.equal(built.query.priceRange?.max, 900000);
  assert.deepEqual(built.missingRequiredFilters, []);
});

test("market scan query builder exposes missing required filters for clarification", () => {
  const built = buildMarketScanStructuredQuery("Quero entender se está caro");

  assert.equal(built.query.operation, "unknown");
  assert.ok(built.missingRequiredFilters.includes("city_or_region"));
  assert.ok(built.missingRequiredFilters.includes("operation"));
  assert.ok(built.confidence < 0.7);
});

