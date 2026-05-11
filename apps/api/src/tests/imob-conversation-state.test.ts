import test from "node:test";
import assert from "node:assert/strict";

import {
  extractCityCandidates,
  extractGoalCandidates,
  extractMarketScanBedrooms,
  extractMarketScanPriceRange,
  extractMarketScanPropertyTypes,
  normalizeMarketScanGoalCandidates,
} from "../services/imob/imobConversationState";

test("IMOB conversation state extracts structured market scan property types and bedrooms", () => {
  const message = "Quero buscar kitnet, apto 1 quarto, apto 2 quartos e casa para locação em Itajaí e Camboriú";

  assert.deepEqual(extractMarketScanPropertyTypes(message), ["apartamento", "casa", "kitnet"]);
  assert.deepEqual(extractMarketScanBedrooms(message), [1, 2]);
});

test("IMOB conversation state extracts structured market scan price range for locação", () => {
  const message = "Quero buscar kitnet para locação em Itajaí até R$ 3.500";
  const range = extractMarketScanPriceRange(message, ["locacao"]);

  assert.equal(range?.min, null);
  assert.equal(range?.max, 3500);
  assert.equal(range?.currency, "BRL");
  assert.equal(range?.period, "monthly");
});

test("IMOB conversation state extracts structured market scan price range for compra", () => {
  const message = "Quero imóveis para comprar em Itajaí, apartamento 2 quartos até 700 mil";
  const range = extractMarketScanPriceRange(message, ["compra"]);

  assert.equal(range?.max, 700000);
  assert.equal(range?.period, "total");
});

test("IMOB conversation state normalizes city and goal candidates for market scan", () => {
  const message = "Quero comprar, vender e locar kitnets e terrenos em Itajaí e Camboriú";

  assert.deepEqual(extractCityCandidates(message), ["Camboriú", "Itajaí"]);
  assert.deepEqual(normalizeMarketScanGoalCandidates(extractGoalCandidates(message)), ["compra", "locacao", "venda"]);
});
