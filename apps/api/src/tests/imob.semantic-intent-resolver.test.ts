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
