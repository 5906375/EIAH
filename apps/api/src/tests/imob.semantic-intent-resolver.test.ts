import test from "node:test";
import assert from "node:assert/strict";

import { resolveImobPropertyUnitIntake, resolveImobSemanticIntent } from "../services/imob/imobSemanticIntentResolver";

const unitPayload = (kindText: string, identifiersText: string, overrides: Record<string, unknown> = {}) => ({
  entity: "imovel", action: "create", confidence: 0.96, needsClarification: false, composedIntents: [],
  propertyUnits: { status: "resolved", confidence: 0.96, expressions: [{ kindText, identifiersText }], singleLabel: null, ...overrides },
});

test("intake existente interpreta frases equivalentes e normaliza apenas os trechos fornecidos", async (t) => {
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "synthetic-test-only";
  t.after(() => { if (previous === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previous; });
  let payload = unitPayload("kitnets", "102 à 104");
  let requests = 0;
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.equal(url, "https://api.openai.com/v1/responses");
    const request = JSON.parse(String(init.body));
    assert.ok(request.model);
    assert.ok(request.text.format.schema.properties.propertyUnits);
    requests += 1;
    return new Response(JSON.stringify({ output_text: JSON.stringify(payload) }));
  });
  const expected = ["Kitnet 102", "Kitnet 103", "Kitnet 104"];
  for (const [message, kind, identifiers] of [
    ["Tenho três kitnets de teste, da 102 à 104.", "kitnets", "102 à 104"],
    ["Nesse endereço, quero registrar as kitnets 102, 103 e 104.", "kitnets", "102, 103 e 104"],
    ["As kitnets de teste são 102 até 104.", "kitnets", "102 até 104"],
  ]) {
    payload = unitPayload(kind, identifiers);
    const result = await resolveImobPropertyUnitIntake(message);
    assert.equal(result.status, "resolved");
    assert.equal(result.status === "resolved" && result.confidence, 0.96);
    assert.deepEqual(result.unitLabels, expected);
    const turn = await resolveImobSemanticIntent(message);
    assert.deepEqual(turn.propertyUnits?.unitLabels, expected, "mesmo intake no turno normal");
  }
  const count = requests;
  const canonical = await resolveImobPropertyUnitIntake("Kitnets 102 a 104");
  assert.equal(canonical.status === "resolved" && canonical.source, "canonical");
  assert.deepEqual(canonical.unitLabels, expected);
  assert.equal(requests, count, "expressão canônica não exige interpretação adicional");
  for (const message of ["Kitnets TESTE 102 a 104", "Tenho três kitnets de teste, da 102 à 104"]) {
    const identifiers = message.includes("à") ? "102 à 104" : "102 a 104";
    payload = unitPayload("kitnets", identifiers);
    const before = requests;
    const result = await resolveImobPropertyUnitIntake(message);
    assert.equal(result.status === "resolved" && result.source, "openai");
    assert.deepEqual(result.unitLabels, expected);
    assert.equal(requests, before + 1, "frase não canônica deve passar pelo provider");
  }
  for (const [message, kind, identifiers, expectedLabels] of [
    ["São as salas 1, 2 e 3 desse endereço.", "salas", "1, 2 e 3", ["Sala 1", "Sala 2", "Sala 3"]],
    ["Cadastre os apartamentos 301 até 305.", "apartamentos", "301 até 305", ["Apto 301", "Apto 302", "Apto 303", "Apto 304", "Apto 305"]],
  ] as const) {
    payload = unitPayload(kind, identifiers);
    assert.deepEqual((await resolveImobPropertyUnitIntake(message)).unitLabels, expectedLabels);
  }
});

test("intake exige clarificação para baixa confiança, ambiguidade e identificadores sem fonte", async (t) => {
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "synthetic-test-only";
  t.after(() => { if (previous === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previous; });
  let payload = unitPayload("kitnets", "102 a 104");
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ output_text: JSON.stringify(payload) })));
  for (const override of [{ confidence: 0.4 }, { status: "needs_clarification" }, { expressions: [{ kindText: "kitnets", identifiersText: "102 a 105" }] }]) {
    payload = unitPayload("kitnets", "102 a 104", override);
    const result = await resolveImobPropertyUnitIntake("Tenho kitnets de teste 102 a 104.");
    assert.equal(result.status, "needs_clarification");
    assert.deepEqual(result.unitLabels, []);
  }
  for (const [message, override] of [
    ["Tenho kitnets de teste 102 e 104.", { expressions: [{ kindText: "kitnets", identifiersText: "102 a 104" }] }],
    ["Tenho kitnets de teste 102.", { expressions: [{ kindText: "kitnets", identifiersText: "10" }] }],
    ["Tenho kitnets de teste 102 a 104.", { expressions: [], singleLabel: "102" }],
    ["Tenho kitnets de teste 102 a 104.", { status: "not_mentioned" }],
  ] as const) {
    payload = unitPayload("kitnets", "102 a 104", override);
    assert.equal((await resolveImobPropertyUnitIntake(message)).status, "needs_clarification", "não criar faixa, truncar identificador ou omitir lote");
  }
  payload = unitPayload("salas", "301 a 303", { status: "needs_clarification", expressions: [] });
  assert.equal((await resolveImobPropertyUnitIntake("São três salas, mas não sei quais.")).status, "needs_clarification");
  delete process.env.OPENAI_API_KEY;
  assert.equal((await resolveImobPropertyUnitIntake("Tenho três kitnets de teste.")).status, "needs_clarification");
  assert.equal((await resolveImobPropertyUnitIntake("Kitnets 105 a 102")).status, "needs_clarification");
  assert.equal((await resolveImobPropertyUnitIntake("Kitnets 1 a 201")).status, "needs_clarification");
});

test("intake singular preserva a identificação humana sem inventar número", async (t) => {
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "synthetic-test-only";
  t.after(() => { if (previous === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previous; });
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ output_text: JSON.stringify(unitPayload("", "", { expressions: [], singleLabel: "unidade do fundo" })) })));
  assert.deepEqual((await resolveImobPropertyUnitIntake("É só a unidade do fundo.")).unitLabels, ["unidade do fundo"]);
});

test("intake falha fechado quando provider é negado, aborta ou retorna payload inválido; canônico continua disponível", async (t) => {
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "synthetic-test-only";
  t.after(() => { if (previous === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previous; });
  let scenario = "denied";
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => {
    requests++;
    if (scenario === "denied") return new Response("", { status: 403 });
    if (scenario === "abort") throw new DOMException("Timeout", "AbortError");
    if (scenario === "invalid_json") return new Response("invalid json");
    return new Response(JSON.stringify({ output_text: JSON.stringify({ propertyUnits: { status: "resolved", confidence: 1, unitLabels: ["Kitnet 999"] } }) }));
  });
  for (scenario of ["denied", "abort", "invalid_json", "invalid_schema"]) {
    const result = await resolveImobPropertyUnitIntake("Tenho aproximadamente 100 kitnets, sem identificações definidas.");
    assert.equal(result.status, "needs_clarification", scenario);
    assert.deepEqual(result.unitLabels, []);
  }
  delete process.env.OPENAI_API_KEY;
  assert.deepEqual((await resolveImobPropertyUnitIntake("Kitnets 102 a 104")).unitLabels, ["Kitnet 102", "Kitnet 103", "Kitnet 104"]);
  assert.equal(requests, 4, "canônico seguro não consulta provider indisponível");
});

test("semantic resolver falls back to parser when OPENAI_API_KEY is missing", async () => {
  const original = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;

  try {
    const result = await resolveImobSemanticIntent("quero cadastrar comprador");
    assert.equal(result.source, "parser_fallback");
    assert.equal(result.parsedIntent.entity, "comprador");
    assert.equal(result.parsedIntent.action, "create");
  } finally {
    if (original) process.env.OPENAI_API_KEY = original;
  }
});

test("semantic resolver uses OpenAI structured intent when response is valid and confident", async () => {
  const originalApiKey = process.env.OPENAI_API_KEY;
  const originalFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "test-key";

  globalThis.fetch = (async () => ({
    ok: true,
    json: async () => ({
      output_text: JSON.stringify({
        entity: "anuncio",
        action: "publish",
        confidence: 0.93,
        needsClarification: false,
        composedIntents: [],
      }),
    }),
  })) as typeof fetch;

  try {
    const result = await resolveImobSemanticIntent("preciso publicar um novo anúncio nos portais");
    assert.equal(result.source, "openai");
    assert.equal(result.parsedIntent.entity, "anuncio");
    assert.equal(result.parsedIntent.action, "publish");
    assert.equal(result.parsedIntent.canonicalLabel, "Publicar anúncio");
    assert.equal(result.confidence, 0.93);
    assert.deepEqual(result.composedIntents, []);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey) process.env.OPENAI_API_KEY = originalApiKey;
    else delete process.env.OPENAI_API_KEY;
  }
});

test("semantic resolver falls back when OpenAI returns unsupported entity-action pair", async () => {
  const originalApiKey = process.env.OPENAI_API_KEY;
  const originalFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "test-key";

  globalThis.fetch = (async () => ({
    ok: true,
    json: async () => ({
      output_text: JSON.stringify({
        entity: "contrato",
        action: "publish",
        confidence: 0.95,
        needsClarification: false,
        composedIntents: [],
      }),
    }),
  })) as typeof fetch;

  try {
    const result = await resolveImobSemanticIntent("publicar contrato");
    assert.equal(result.source, "parser_fallback");
    assert.notEqual(result.parsedIntent.action, "publish");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey) process.env.OPENAI_API_KEY = originalApiKey;
    else delete process.env.OPENAI_API_KEY;
  }
});

test("semantic resolver maps composed intents for multi-action phrase", async () => {
  const originalApiKey = process.env.OPENAI_API_KEY;
  const originalFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "test-key";

  globalThis.fetch = (async () => ({
    ok: true,
    json: async () => ({
      output_text: JSON.stringify({
        entity: "proprietario",
        action: "create",
        confidence: 0.96,
        needsClarification: false,
        composedIntents: [
          { entity: "proprietario", action: "create" },
          { entity: "lead", action: "create" },
        ],
      }),
    }),
  })) as typeof fetch;

  try {
    const result = await resolveImobSemanticIntent("cadstrar o proprietário deste imóvel e qualificar a lead");
    assert.equal(result.source, "openai");
    assert.equal(result.parsedIntent.entity, "proprietario");
    assert.equal(result.parsedIntent.action, "create");
    assert.equal(result.composedIntents.length, 2);
    assert.equal(result.composedIntents[0]?.entity, "proprietario");
    assert.equal(result.composedIntents[0]?.action, "create");
    assert.equal(result.composedIntents[1]?.entity, "lead");
    assert.equal(result.composedIntents[1]?.action, "create");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey) process.env.OPENAI_API_KEY = originalApiKey;
    else delete process.env.OPENAI_API_KEY;
  }
});


test("semantic resolver recognizes colloquial listing activation phrase without needing model output", async () => {
  const original = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;

  try {
    const result = await resolveImobSemanticIntent("quero botar esse imóvel pra rodar");
    assert.equal(result.source, "parser_fallback");
    assert.equal(result.parsedIntent.entity, "anuncio");
    assert.equal(result.parsedIntent.action, "publish");
    assert.equal(result.parsedIntent.canonicalLabel, "Publicar anúncio");
  } finally {
    if (original) process.env.OPENAI_API_KEY = original;
  }
});
