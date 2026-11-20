import { llmRegistry } from "@eiah/core/llm/LLMRegistry";
import { runCompletion } from "@eiah/core/llm/completionEngine";
import test, { before, after, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import https from "node:https";
import ts from "typescript";
import { Response } from "node-fetch";
import { OpenAIProvider } from "../src/OpenAIProvider";
import { isLLMProviderError } from "@eiah/core/llm/LLMProviderError";
import { getRootStructuredLogger } from "@eiah/core/logging/logger";

type Transport = NonNullable<ConstructorParameters<typeof OpenAIProvider>[1]>;
// Minimal sanitized real-error fixture, owned by the adapter package. No live call.
const quota = JSON.parse(readFileSync(new URL("./fixtures/openai-credit-balance-exhausted.json", import.meta.url), "utf8"));
const success = { id: "completion_synthetic", choices: [{ message: { content: "conteúdo sintético" }, finish_reason: "stop" }],
  usage: { prompt_tokens: 12, completion_tokens: 7, total_tokens: 19 } };
const request = { model: "openai:gpt-4.1", messages: [{ role: "user" as const, content: "dados sintéticos" }], metadata: { traceId: "diagnostic-test-correlation" } };
const response = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers });
const adapter = (transport: Transport) => new OpenAIProvider("synthetic-test-only", transport);

const originalEnv = new Map(["OPENAI_API_KEY", "NODE_ENV"].map((key) => [key, process.env[key]]));
let restoreNetwork: (() => void) | undefined;
before(() => {
  delete process.env.OPENAI_API_KEY;
  const original = https.request;
  https.request = (() => { throw new Error("Real provider transport forbidden in this suite"); }) as typeof https.request;
  restoreNetwork = () => { https.request = original; };
});
after(() => {
  restoreNetwork?.();
  for (const [key, value] of originalEnv) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
});

test("OpenAI: erro real estruturado lança falha sanitizada antes de extrair conteúdo", async () => {
  const provider = adapter(async () => response({ ...quota, error: { ...quota.error, message: "Bearer synthetic-secret; raw private provider message" } }, 429, { "x-request-id": "req_synthetic_quota" }));
  await assert.rejects(provider.chatCompletion(request), (error) => {
    assert.ok(isLLMProviderError(error));
    assert.deepEqual(error.diagnostic, { provider: "openai", model: "gpt-4.1", category: "financial_quota", retryable: false,
      interventionRequired: true, code: "credit_balance_exhausted", providerType: "insufficient_quota", httpStatus: 429,
      providerRequestId: "req_synthetic_quota", traceId: "diagnostic-test-correlation" });
    assert.doesNotMatch(JSON.stringify(error), /synthetic-secret|raw private|output|usage/);
    return true;
  });
});

test("OpenAI: campos estruturados distinguem saldo, rate limit, autorização e indisponibilidade", async () => {
  for (const [body, status, category, retryable] of [
    [quota, 200, "financial_quota", false],
    [{ error: { type: "insufficient_quota" } }, 429, "financial_quota", false],
    [{ error: { code: "rate_limit_exceeded" } }, 429, "rate_limit", true],
    [{ error: { type: "authentication_error" } }, 429, "authentication_permission", false],
    [{ error: {} }, 403, "authentication_permission", false],
    [{ error: { type: "server_error" } }, 503, "transient", true],
    [{ error: { code: "bad_request" } }, 400, "invalid_response", false],
  ] as const) {
    await assert.rejects(adapter(async () => response(body, status)).chatCompletion(request), (error) => {
      assert.ok(isLLMProviderError(error)); assert.equal(error.diagnostic.category, category); assert.equal(error.diagnostic.retryable, retryable);
      assert.equal(Object.hasOwn(error.diagnostic, "providerRequestId"), false, "nenhum ID literal é fabricado");
      return true;
    });
  }
});

test("OpenAI: transporte, JSON inválido e conteúdo ausente nunca viram sucesso vazio", async () => {
  const cases: Array<[Transport, string]> = [
    [async () => { throw Object.assign(new Error("Bearer synthetic-secret"), { code: "ECONNRESET" }); }, "transient"],
    [async () => new Response("not JSON", { status: 200 }), "invalid_response"],
    [async () => new Response("unavailable", { status: 503 }), "transient"],
    [async () => response(null), "invalid_response"],
    [async () => response({ choices: [] }), "invalid_response"],
    [async () => response({ choices: [{ message: { content: "  " } }] }), "invalid_response"],
  ];
  for (const [transport, category] of cases) await assert.rejects(adapter(transport).chatCompletion(request), (error) => {
    assert.ok(isLLMProviderError(error)); assert.equal(error.diagnostic.category, category);
    assert.doesNotMatch(JSON.stringify(error), /synthetic-secret|not JSON|output|usage/); return true;
  });
  await assert.rejects(adapter(cases[0][0]).chatCompletion({ ...request, metadata: {} }), (error) => {
    assert.ok(isLLMProviderError(error)); assert.equal(error.diagnostic.code, "ECONNRESET");
    for (const absent of ["traceId", "providerRequestId", "httpStatus", "providerType"]) assert.equal(Object.hasOwn(error.diagnostic, absent), false);
    return true;
  });
});

test("diagnóstico OpenAI: distingue tentativa, resposta, parsing e validação sem conteúdo sensível", async (t: TestContext) => {
  const root = getRootStructuredLogger();
  const streamSymbol = Object.getOwnPropertySymbols(root).find((key) => key.description === "pino.stream");
  assert.ok(streamSymbol);
  const stream: { write: (line: string) => unknown } = Reflect.get(root, streamSymbol);
  const events: Array<Record<string, unknown>> = [];
  t.mock.method(stream, "write", (line: string) => events.push(JSON.parse(line)));
  const secret = "Bearer synthetic-private-transport-secret";
  const diagnosticRequest = { ...request, metadata: { ...request.metadata, source: "imob-property-capture-intake", llmAttempt: 1 } };
  const cases: Array<{ transport: Transport; stage?: string; status?: number; requestId?: string }> = [
    { transport: async () => { throw new Error(secret); }, stage: "transport_failure" },
    { transport: async () => response({ error: { ...quota.error, message: secret } }, 429, { "x-request-id": "req_synthetic_header" }),
      stage: "response_validation", status: 429, requestId: "req_synthetic_header" },
    { transport: async () => new Response(secret, { status: 200 }), stage: "response_parsing", status: 200 },
    { transport: async () => response({ private: secret }), stage: "response_validation", status: 200 },
    { transport: async () => response({ ...success, choices: [{ message: { content: secret }, finish_reason: "stop" }] }), status: 200 },
  ];
  for (const item of cases) {
    events.length = 0;
    const promise = adapter(item.transport).chatCompletion(diagnosticRequest);
    if (item.stage) await assert.rejects(promise, isLLMProviderError); else await promise;
    assert.equal(events.filter((event) => event.stage === "transport_attempt").length, 1);
    const receipts = events.filter((event) => event.stage === "response_received");
    assert.equal(receipts.length, item.status === undefined ? 0 : 1);
    if (receipts[0]) {
      assert.equal(receipts[0].providerHttpStatus, item.status);
      assert.equal(receipts[0].providerRequestId, item.requestId);
      assert.equal(Object.hasOwn(receipts[0], "statusCode"), false, "provider HTTP is not application HTTP");
    }
    const failures = events.filter((event) => Object.hasOwn(event, "failure"));
    assert.equal(failures.length, item.stage ? 1 : 0);
    if (item.stage) assert.equal(failures[0].stage, item.stage);
    for (const event of events) {
      assert.equal(event.traceId, request.metadata.traceId);
      assert.equal(event.attempt, 1);
      assert.equal(Object.hasOwn(event, "modelUsed"), false);
      if (!item.requestId) assert.equal(Object.hasOwn(event, "providerRequestId"), false);
    }
    assert.doesNotMatch(JSON.stringify(events), /synthetic-private-transport-secret|Bearer|"stack"|"headers"|"messages"|"output"/);
  }
});

/** Real consumer source, only imports replaced. No DB import, network, or financial write. */
function loadConsumer(url: URL, bindings: Record<string, unknown>) {
  const module = { exports: {} as Record<string, unknown> };
  const code = ts.transpileModule(readFileSync(url, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const require = (name: string) => {
    assert.ok(Object.hasOwn(bindings, name), `Unexpected consumer import: ${name}`);
    return bindings[name];
  };
  new Function("require", "module", "exports", code)(require, module, module.exports);
  return module.exports;
}

test("IDs: generateText mantém completion e referência legada, sem inventar request ID do provider", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousMode = process.env.NODE_ENV;
  process.env.OPENAI_API_KEY = "synthetic-test-only";
  process.env.NODE_ENV = "development"; // Exercise the actual wrapper, not its NODE_ENV=test canned response.
  let body: unknown = { ...success, model: "synthetic-confirmed-model" };
  let headers: Record<string, string> = { "x-request-id": "req_synthetic_transport" };
  let calls = 0;
  class SyntheticTransportProvider extends OpenAIProvider {
    constructor(key: string) { super(key, async () => { calls++; return response(body, 200, headers); }); }
  }
  const consumer = loadConsumer(new URL("../src/index.ts", import.meta.url), {
    "node-fetch": { default: () => { throw new Error("embedding not allowed"); } },
    "./OpenAIProvider": { OpenAIProvider: SyntheticTransportProvider },
    "./AnthropicProvider": {}, "./GeminiProvider": {}, "./DeepSeekProvider": {},
  });
  const generate = consumer.generateText;
  assert.ok(typeof generate === "function");
  try {
    const both = await generate({ ...request, provider: "openai" });
    assert.equal(both.completionId, success.id); assert.equal(both.requestId, success.id);
    assert.equal(both.providerRequestId, "req_synthetic_transport"); assert.equal(both.modelUsed, "synthetic-confirmed-model");
    headers = { "x-request-id": "req_synthetic_second" };
    const sameCompletion = await generate({ ...request, provider: "openai" });
    assert.equal(sameCompletion.requestId, success.id, "completion-based accounting reference survives a new transport ID");
    assert.equal(sameCompletion.providerRequestId, "req_synthetic_second");
    body = { choices: success.choices };
    const headerOnly = await generate({ ...request, provider: "openai" });
    assert.equal(headerOnly.completionId, undefined); assert.equal(headerOnly.id, "");
    assert.equal(headerOnly.requestId, "req_synthetic_second"); assert.equal(headerOnly.providerRequestId, "req_synthetic_second");
    assert.equal(headerOnly.modelUsed, undefined); assert.equal(headerOnly.usage, null);
    headers = {};
    const absent = await generate({ ...request, provider: "openai" });
    for (const key of ["completionId", "providerRequestId", "requestId", "modelUsed"]) assert.equal(absent[key], undefined, key);
    assert.equal(absent.usage, null);
    body = quota;
    await assert.rejects(generate({ ...request, provider: "openai" }), isLLMProviderError);
    assert.equal(calls, 5);
  } finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey;
    if (previousMode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousMode;
  }
});

test("OpenAI guiado: uma chamada de transporte, sem retry de adaptador/SDK e sem seguir redirect", async () => {
  for (const status of [302, 503]) {
    let transports = 0;
    const provider = adapter(async (_url, options) => {
      transports++; assert.equal(options?.redirect, "error");
      return response({ error: { type: "server_error" } }, status, { location: "https://synthetic.invalid/another-provider" });
    });
    llmRegistry.register(provider);
    await assert.rejects(runCompletion({ ...request, transportPolicy: "imob_guided_single_attempt" }));
    assert.equal(transports, 1);
  }
});

import { AnthropicProvider } from "../src/AnthropicProvider";
import { GeminiProvider } from "../src/GeminiProvider";
import { DeepSeekProvider } from "../src/DeepSeekProvider";

test("adapters guiados: Anthropic/Gemini/DeepSeek fazem um transporte direto sem SDK/retry/redirect", async () => {
  for (const Provider of [AnthropicProvider, GeminiProvider, DeepSeekProvider]) {
    let transports = 0;
    const provider = new Provider("synthetic-test-only", async (_url, options) => {
      transports++; assert.equal(options?.redirect, "error"); return response({ error: { type: "server_error" } }, 503);
    });
    llmRegistry.register(provider);
    // Legacy adapters can return empty content on HTTP failure. Guided intake rejects it; the admission remains consumed.
    const result = await runCompletion({ ...request, model: `${provider.name}:synthetic-model`, transportPolicy: "imob_guided_single_attempt" });
    assert.equal(result.output, ""); assert.equal(transports, 1);
  }
});
