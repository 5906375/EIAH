import test from "node:test";
import assert from "node:assert/strict";
import { buildLLMAuditMetadata } from "./audit";

test("audit metadata includes prompt/output hash and execution attributes", () => {
  const metadata = buildLLMAuditMetadata({
    task: "intent_classify",
    provider: "openai",
    model: "gpt-4o-mini",
    prompt: "classifique o intento",
    output: "{\"intent\":\"consulta\"}",
    latencyMs: 123,
    traceId: "trace_123",
    usage: {
      promptTokens: 10,
      completionTokens: 20,
      totalTokens: 30,
    },
    costCents: 7,
    fallbackAttempt: 1,
    cacheHit: false,
  });

  assert.equal(metadata.provider, "openai");
  assert.equal(metadata.model, "gpt-4o-mini");
  assert.equal(metadata.latencyMs, 123);
  assert.equal(metadata.traceId, "trace_123");
  assert.equal(metadata.costCents, 7);
  assert.equal(metadata.fallbackAttempt, 1);
  assert.equal(metadata.cacheHit, false);
  assert.ok(metadata.promptHash.length > 0);
  assert.ok(metadata.outputHash.length > 0);
  assert.ok(metadata.timestamp.length > 0);
});

