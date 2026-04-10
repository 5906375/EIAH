import test from "node:test";
import assert from "node:assert/strict";

import { resolveImobSemanticIntent } from "../services/imob/imobSemanticIntentResolver";

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
