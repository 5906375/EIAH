import test from "node:test";
import assert from "node:assert/strict";

import {
  createNextImobOperationalState,
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

test("IMOB conversation state canonicalizes malformed accented city names", () => {
  const result = createNextImobOperationalState(
    {
      flow: "property.create",
      status: "collecting",
      pendingFields: ["address"],
      propertyDraft: {
        propertyId: "prop-1",
        propertyType: "apartamento",
        goal: "locacao",
        cep: null,
        city: "Itajái",
        neighborhood: null,
        bedrooms: 2,
        bathrooms: null,
        address: null,
        origin: null,
      },
    } as any,
    "capture",
    "salvar cadastro",
    {
      goal: "locacao",
      city: "Itajái",
      region: null,
      neighborhood: null,
      budgetMax: null,
      bedrooms: 2,
      bathrooms: null,
      propertyType: "apartamento",
    },
  );

  assert.equal(result?.flow, "property.create");
  assert.equal((result as any)?.propertyDraft?.city, "Itajaí");
  assert.equal((result as any)?.propertyDraft?.cityCanonical?.canonicalName, "Itajaí");
  assert.equal((result as any)?.propertyDraft?.cityCanonical?.locked, false);
});

test("IMOB conversation state preserves resolved scan city when completing property data after confirmation", () => {
  const result = createNextImobOperationalState(
    {
      flow: "property.create",
      status: "collecting",
      pendingFields: ["cep", "address"],
      propertyDraft: {
        propertyId: "prop-1",
        propertyType: "apartamento",
        goal: "locacao",
        cep: null,
        city: "Itajaí",
        neighborhood: "Centro",
        bedrooms: 2,
        bathrooms: null,
        address: null,
        origin: {
          source: "internal_crm",
          sourceId: "prop-1",
          providerId: "internal_crm",
          retrievedAt: "2026-05-09T12:00:00.000Z",
          scanId: "market-scan-1",
        },
      },
    } as any,
    "capture",
    "salvar cadastro",
    {
      goal: "locacao",
      city: "Itajái",
      region: null,
      neighborhood: null,
      budgetMax: null,
      bedrooms: 2,
      bathrooms: null,
      propertyType: "apartamento",
    },
  );

  assert.equal(result?.flow, "property.create");
  assert.equal((result as any)?.propertyDraft?.city, "Itajaí");
  assert.equal((result as any)?.propertyDraft?.goal, "locacao");
  assert.equal((result as any)?.propertyDraft?.origin?.sourceId, "prop-1");
  assert.equal((result as any)?.propertyDraft?.cityCanonical?.canonicalName, "Itajaí");
  assert.equal((result as any)?.propertyDraft?.cityCanonical?.locked, true);
  assert.deepEqual((result as any)?.pendingFields, ["address"]);
});
