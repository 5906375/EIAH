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

test("IMOB conversation state sanitizes market scan address before turning selection into property draft", () => {
  const result = createNextImobOperationalState(
    {
      flow: "property.market_scan",
      status: "ready_for_review",
      pendingFields: [],
      propertyDraft: {
        propertyId: "prop-1",
        propertyType: "apartamento",
        goal: "venda",
        cep: null,
        city: "Itapema",
        neighborhood: "Centro",
        bedrooms: 2,
        bathrooms: null,
        address: null,
        origin: null,
      },
      marketScanSelection: {
        status: "pending_confirmation",
        scanId: "market-scan-1",
        source: "internal_crm",
        sourceId: "prop-1",
        providerId: "internal_crm",
        retrievedAt: "2026-05-23T17:53:12.200Z",
        city: "Itapema",
        goal: "venda",
        propertyType: "apartamento",
        bedrooms: 2,
        price: 700000,
        currency: "BRL",
        neighborhood: "Centro",
        address: "Rua Batch 101 proprietario Joana Batch valor 700000",
        title: "Apartamento 2 quartos",
        url: null,
      },
    } as any,
    "capture",
    "confirmar seleção do scan prop-1",
    {
      goal: null,
      city: null,
      region: null,
      neighborhood: null,
      budgetMax: null,
      bedrooms: null,
      bathrooms: null,
      propertyType: null,
    },
  );

  assert.equal(result?.flow, "property.create");
  assert.equal((result as any)?.propertyDraft?.address, "Rua Batch 101");
});

test("IMOB conversation state normalizes owner phone and preserves informed owner document", () => {
  const result = createNextImobOperationalState(
    null,
    "capture",
    "cadastrar proprietário joao da silva telefone do proprietário 47996635092 documento do proprietário 12345678901",
    {
      goal: null,
      city: null,
      region: null,
      neighborhood: null,
      budgetMax: null,
      bedrooms: null,
      bathrooms: null,
      propertyType: null,
    },
  );

  assert.equal(result?.flow, "owner.create");
  assert.equal((result as any)?.ownerDraft?.ownerName, "Joao da Silva");
  assert.equal((result as any)?.ownerDraft?.ownerPhone, "(47) 99663-5092");
  assert.equal((result as any)?.ownerDraft?.ownerDocument, "12345678901");
});

test("IMOB conversation state structures property address and keeps address pending when number is missing", () => {
  const result = createNextImobOperationalState(
    null,
    "capture",
    "cadastrar imóvel apartamento para locação em Itajaí endereço Rua Barao do Rio Branco, Centro",
    {
      goal: "locacao",
      city: "Itajaí",
      region: null,
      neighborhood: null,
      budgetMax: null,
      bedrooms: null,
      bathrooms: null,
      propertyType: "apartamento",
    },
  );

  assert.equal(result?.flow, "property.create");
  assert.equal((result as any)?.propertyDraft?.address, "Rua Barao do Rio Branco");
  assert.equal((result as any)?.propertyDraft?.city, "Itajaí");
  assert.ok((result as any)?.pendingFields.includes("address"));
});

test("IMOB conversation state structures complete property address from free text", () => {
  const result = createNextImobOperationalState(
    null,
    "capture",
    "cadastrar imóvel apartamento para venda em Itajaí endereço Rua Barao do Rio Branco, 100, Centro, Itajai",
    {
      goal: "venda",
      city: "Itajaí",
      region: null,
      neighborhood: null,
      budgetMax: null,
      bedrooms: null,
      bathrooms: null,
      propertyType: "apartamento",
    },
  );

  assert.equal(result?.flow, "property.create");
  assert.equal((result as any)?.propertyDraft?.address, "Rua Barao do Rio Branco, 100");
  assert.equal((result as any)?.propertyDraft?.city, "Itajaí");
  assert.ok(!(result as any)?.pendingFields.includes("address"));
});

test("IMOB conversation state normalizes lead phone and preserves explicit lead identity", () => {
  const result = createNextImobOperationalState(
    null,
    "lead",
    "qualificar lead maria telefone 47999998888 email maria@imob.com para alugar em Itapema até 3500",
    {
      goal: "locacao",
      city: "Itapema",
      region: null,
      neighborhood: null,
      budgetMax: 3500,
      bedrooms: null,
      bathrooms: null,
      propertyType: null,
    },
  );

  assert.equal(result?.flow, "lead.qualify");
  assert.equal((result as any)?.leadDraft?.leadName, "Maria");
  assert.equal((result as any)?.leadDraft?.leadPhone, "(47) 99999-8888");
  assert.equal((result as any)?.leadDraft?.leadEmail, "maria@imob.com");
});

test("IMOB conversation state infers cpf document type during document collection", () => {
  const result = createNextImobOperationalState(
    null,
    "documents",
    "coletar documento do proprietário do imóvel 4455 via upload documento 529.982.247-25",
    {
      goal: null,
      city: null,
      region: null,
      neighborhood: null,
      budgetMax: null,
      bedrooms: null,
      bathrooms: null,
      propertyType: null,
    },
  );

  assert.equal(result?.flow, "documents.collect");
  assert.equal((result as any)?.documentDraft?.referenceId, "property-4455");
  assert.equal((result as any)?.documentDraft?.subjectType, "owner");
  assert.deepEqual((result as any)?.documentDraft?.documentTypes, ["cpf"]);
  assert.equal((result as any)?.documentDraft?.deliveryChannel, "upload");
});
