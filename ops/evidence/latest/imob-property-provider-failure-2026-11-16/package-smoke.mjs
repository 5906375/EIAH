// Explicitly validates formal dist outputs after the official core/providers builds.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import https from "node:https";
const root = new URL("../../../../", import.meta.url);
const core = new URL("packages/core/dist/llm/LLMProviderError.js", root);
const { LLMProviderError, isLLMProviderError } = await import(core.href);
const secondEntry = await import(core.href + "?separate-entry");
const distinct = new secondEntry.LLMProviderError({ provider: "openai", model: "synthetic", code: "credit_balance_exhausted" });
assert.equal(distinct instanceof LLMProviderError, false);
assert.equal(isLLMProviderError(distinct), true, "failure branding survives separate bundled class identities");
const { runCompletion } = await import(new URL("packages/core/dist/llm/completionEngine.js", root));
assert.equal(typeof runCompletion, "function");
const { OpenAIProvider } = await import(new URL("packages/providers/dist/OpenAIProvider.js", root));
const require = createRequire(new URL("packages/providers/package.json", root));
const { Response } = await import(require.resolve("node-fetch"));
const quota = JSON.parse(readFileSync(new URL("apps/api/src/tests/fixtures/openai-credit-balance-exhausted.json", root), "utf8"));
let calls = 0;
const original = https.request;
https.request = () => { throw new Error("Real transport forbidden in package smoke"); };
try {
  const provider = new OpenAIProvider("synthetic-test-only", async () => {
    calls++; return new Response(JSON.stringify(quota), { status: 429 });
  });
  await assert.rejects(provider.chatCompletion({ model: "gpt-4.1", messages: [] }), (error) => {
    assert.ok(isLLMProviderError(error)); assert.equal(error.diagnostic.retryable, false);
    assert.equal(error.diagnostic.category, "financial_quota");
    assert.equal(Object.hasOwn(error.diagnostic, "providerRequestId"), false); return true;
  });
  assert.equal(calls, 1);
  const ids = new OpenAIProvider("synthetic-test-only", async () => new Response(JSON.stringify({
    id: "completion_synthetic_package", choices: [{ message: { content: "synthetic success" } }],
  }), { status: 200, headers: { "x-request-id": "req_synthetic_package" } }));
  const result = await ids.chatCompletion({ model: "gpt-4.1", messages: [] });
  assert.equal(result.requestId, "completion_synthetic_package");
  assert.equal(result.providerRequestId, "req_synthetic_package"); assert.equal(result.modelUsed, undefined);
  assert.equal(result.usage, null);
} finally { https.request = original; }
for (const file of ["packages/core/dist/llm/LLMProviderError.d.ts", "packages/core/dist/llm/types.d.ts", "packages/providers/dist/OpenAIProvider.d.ts"]) {
  assert.ok(readFileSync(new URL(file, root), "utf8").length);
}
console.log(JSON.stringify({ ok: true, scope: "official dist outputs only; no HTTP/DB or full packaged application run", coreAndProviderImports: true,
  declarationsPresent: true, crossEntryFailureIdentity: true, syntheticQuotaInvocations: calls, idsSeparated: true, realProviderCalls: 0 }));
