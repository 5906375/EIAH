import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import https from "node:https";
import ts from "typescript";
import { OpenAIProvider } from "../../../../packages/providers/src/OpenAIProvider";
import { LLMProviderError, isLLMProviderError } from "@eiah/core/llm/LLMProviderError";
import { llmRegistry } from "@eiah/core/llm/LLMRegistry";
import { getRootStructuredLogger } from "@eiah/core/logging/logger";
import { executeLlmStep } from "../orchestrator/llmExecutor";
import { resolveImobPropertyCaptureTurn } from "../services/imob/crm/imobCrmTurnEngine";
import { IMOB_PROPERTY_CAPTURE_POLICY, type ImobPropertyCaptureRequest } from "@eiah/contracts";

type Transport = NonNullable<ConstructorParameters<typeof OpenAIProvider>[1]>;
// node-fetch belongs to providers, not API; resolve the fixture Response through its owner.
const providerRequire = createRequire(new URL("../../../../packages/providers/package.json", import.meta.url));
const { Response } = await import(providerRequire.resolve("node-fetch"));

// Derived from the real diagnostic, with message/param omitted. No credential or live call.
const quota = JSON.parse(readFileSync(new URL("./fixtures/openai-credit-balance-exhausted.json", import.meta.url), "utf8"));
const success = { id: "completion_synthetic", choices: [{ message: { content: "conteúdo sintético" }, finish_reason: "stop" }],
  usage: { prompt_tokens: 12, completion_tokens: 7, total_tokens: 19 } };
const request = { model: "openai:gpt-4.1", messages: [{ role: "user" as const, content: "dados sintéticos" }], metadata: { traceId: "diagnostic-test-correlation" } };
const response = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers });
const adapter = (transport: Transport) => new OpenAIProvider("synthetic-test-only", transport);
const profile = { model: "openai:gpt-4.1", systemPrompt: "fixture", knowledgePolicy: { llmUsageMode: "grounded_reasoning" as const, maskingPolicy: "required" as const } };
const execute = () => executeLlmStep({ profile, userPrompt: "dados sintéticos", metadata: request.metadata });
const draft: ImobPropertyCaptureRequest = { message: "São dois quartos e uma vaga. Pode me orientar no restante?", operation: "property.create", step: "editing_form",
  draft: { propertyType: "apartamento", goal: "locacao", city: "Balneário Camboriú", bedrooms: "", garageSpots: "" },
  origin: { formId: "synthetic-form", contextRef: "synthetic-context", draftVersion: 0, threadId: "synthetic-thread", caseId: null }, pendingProposal: null, history: [] };

const envKeys = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "DEEPSEEK_API_KEY", "LLM_RETRIES", "LLM_RETRY_DELAY_MS", "LLM_RETRY_MAX_DELAY_MS", "LLM_RETRY_JITTER_RATIO"];
const originalEnv = new Map(envKeys.map((key) => [key, process.env[key]]));
let restoreNetwork: (() => void) | undefined;
before(() => {
  for (const key of envKeys) delete process.env[key];
  process.env.LLM_RETRIES = "3";
  process.env.LLM_RETRY_DELAY_MS = "0";
  process.env.LLM_RETRY_MAX_DELAY_MS = "0";
  process.env.LLM_RETRY_JITTER_RATIO = "0";
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

test("runtime: quota não sofre retry nem emite sucesso ou uso; executor preserva diagnóstico", async (t) => {
  let calls = 0;
  const events: Array<any> = [];
  const root = getRootStructuredLogger();
  const streamSymbol = Object.getOwnPropertySymbols(root).find((key) => key.description === "pino.stream");
  assert.ok(streamSymbol);
  // The existing completion child owns its methods, but shares this actual output stream.
  t.mock.method((root as any)[streamSymbol], "write", (line: string) => events.push(JSON.parse(line)));
  llmRegistry.register(adapter(async () => { calls++; return response(quota, 429); }));
  await assert.rejects(execute(), (error) => {
    assert.ok(isLLMProviderError(error)); assert.equal(error.diagnostic.category, "financial_quota");
    assert.equal(error.diagnostic.traceId, request.metadata.traceId); return true;
  });
  assert.equal(calls, 1);
  assert.equal(events.filter((event) => event.msg === "llm.completion.success").length, 0);
  const failure = events.find((event) => event.msg === "llm.completion.error");
  assert.ok(failure); assert.equal(failure.failure.interventionRequired, true);
  assert.equal(Object.hasOwn(failure, "usage"), false);
});

test("runtime: transitório esgota somente o limite existente e preserva a falha tipada final", async () => {
  let calls = 0;
  llmRegistry.register(adapter(async () => { calls++; return response({ error: { type: "server_error" } }, 503, { "x-request-id": `req_synthetic_${calls}` }); }));
  await assert.rejects(execute(), (error) => {
    assert.ok(isLLMProviderError(error)); assert.equal(error.diagnostic.category, "transient");
    assert.equal(error.diagnostic.providerRequestId, "req_synthetic_3"); return true;
  });
  assert.equal(calls, 3);
});

test("runtime: rate limit e transitório podem recuperar com a mesma policy; sucesso mantém conteúdo e uso", async () => {
  for (const [body, status] of [[{ error: { code: "rate_limit_exceeded" } }, 429], [{ error: { type: "server_error" } }, 503]] as const) {
    let calls = 0;
    llmRegistry.register(adapter(async () => ++calls === 1 ? response(body, status) : response(success, 200, { "x-request-id": "req_synthetic_success" })));
    const result = await execute();
    assert.equal(calls, 2); assert.equal(result.outputText, success.choices[0].message.content);
    assert.equal(result.requestId, success.id); assert.equal(result.completionId, success.id);
    assert.equal(result.providerRequestId, "req_synthetic_success"); assert.equal(result.traceId, request.metadata.traceId);
    assert.equal(result.modelUsed, undefined);
    assert.deepEqual(result.usage, { promptTokens: 12, completionTokens: 7, totalTokens: 19, cachedTokens: undefined });
  }
  llmRegistry.register(adapter(async () => response({ choices: success.choices })));
  const absent = await execute();
  assert.equal(absent.requestId, undefined); assert.equal(absent.usage, null); assert.equal(absent.traceId, request.metadata.traceId);
});

test("engine/intake: quota não alcança parser/schema, preserva draft/proposta e não produz execução", async () => {
  const scope = { tenantId: "synthetic-tenant", workspaceId: "synthetic-workspace" };
  const interpretation = JSON.stringify({ intent: "continue", confidence: 0.98, changes: [{ field: "bedrooms", value: "2", evidence: "dois quartos", correction: false }] });
  llmRegistry.register(adapter(async () => response({ choices: [{ message: { content: interpretation } }] })));
  const proposed = await resolveImobPropertyCaptureTurn(draft, { scope, interpret: async () => (await execute()).outputText });
  assert.equal(proposed.propertyCapture.outcome, "proposed");
  const input = { ...draft, pendingProposal: proposed.propertyCapture.proposal };
  const snapshot = JSON.stringify(input);
  let calls = 0;
  llmRegistry.register(adapter(async () => { calls++; return response(quota, 429); }));
  const diagnostics: any[] = [];
  const result = await resolveImobPropertyCaptureTurn(input, { scope, interpret: async () => (await execute()).outputText, observe: (event) => diagnostics.push(event) });
  assert.equal(calls, 1); assert.equal(result.mode, "consult"); assert.equal(result.action, "property.draft.intake");
  assert.equal(result.propertyCapture.outcome, "unavailable"); assert.equal(result.presentation.text, IMOB_PROPERTY_CAPTURE_POLICY.unavailable);
  assert.deepEqual(result.propertyCapture.patch, {}); assert.deepEqual(result.propertyCapture.proposal, input.pendingProposal);
  assert.equal("executionRequest" in result, false); assert.equal(JSON.stringify(input), snapshot);
  assert.deepEqual(diagnostics.map((event) => event.stage), ["provider_unavailable"], "parser e schema não recebem conteúdo de falha");
  assert.equal(diagnostics[0].providerFailure.category, "financial_quota");
  assert.equal(diagnostics[0].providerFailure.interventionRequired, true);
  assert.equal(Object.hasOwn(diagnostics[0].providerFailure, "providerRequestId"), false);
  assert.doesNotMatch(result.presentation.text, /credit_balance|insufficient_quota|comprar|créditos|interpretação inválida/);
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
  const consumer = loadConsumer(new URL("../../../../packages/providers/src/index.ts", import.meta.url), {
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
    body = { choices: success.choices }; headers = {};
    const absent = await generate({ ...request, provider: "openai" });
    for (const key of ["completionId", "providerRequestId", "requestId", "modelUsed"]) assert.equal(absent[key], undefined, key);
    assert.equal(absent.usage, null);
    body = quota;
    await assert.rejects(generate({ ...request, provider: "openai" }), isLLMProviderError);
    assert.equal(calls, 3);
  } finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey;
    if (previousMode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousMode;
  }
});

test("IDs: executor e capacidade preservam chave do breakdown; ausência bloqueia medição explicitamente sem fallback", async () => {
  const writes: Array<Record<string, unknown>> = [];
  const ledgerKeys = new Set<string>();
  const consumer = loadConsumer(new URL("../services/capabilityExecution.ts", import.meta.url), {
    "../orchestrator/llmExecutor": { executeLlmStep },
    "./billing": { recordRunUsageBreakdown: async (value: Record<string, unknown>) => {
      writes.push(value); const key = JSON.stringify([value.runId, value.requestId, value.meterType]);
      const inserted = !ledgerKeys.has(key); ledgerKeys.add(key); return { inserted, item: value };
    } },
  });
  const capability = consumer.executeCapability;
  assert.ok(typeof capability === "function");
  const params = { request: { capability: "history_summary", vertical: "imob", context: { runId: "synthetic-run" },
    policyContext: { tenantId: "synthetic-tenant", workspaceId: "synthetic-workspace" } }, profile, userPrompt: "synthetic", metadata: request.metadata };
  let body: unknown = { ...success, model: "synthetic-confirmed-model" };
  let headers = { "x-request-id": "req_synthetic_first" };
  let calls = 0;
  llmRegistry.register(adapter(async () => { calls++; return response(body, 200, headers); }));
  const first = await capability(params);
  assert.equal(first.status, "ok"); assert.equal(first.requestId, success.id); assert.equal(first.completionId, success.id);
  assert.equal(first.providerRequestId, "req_synthetic_first"); assert.equal(first.telemetryRef, request.metadata.traceId);
  assert.equal(first.modelRequested, "gpt-4.1"); assert.equal(first.modelUsed, "synthetic-confirmed-model");
  headers = { "x-request-id": "req_synthetic_second" };
  await capability(params);
  assert.equal(writes.length, 2); assert.equal(ledgerKeys.size, 1, "the existing completion-based idempotency key is retained");
  assert.equal(writes[0].requestId, success.id); assert.equal(writes[0].totalTokens, 19);
  body = { choices: success.choices };
  const headerOnly = await capability(params);
  assert.equal(headerOnly.completionId, undefined); assert.equal(headerOnly.requestId, "req_synthetic_second");
  assert.equal(headerOnly.providerRequestId, "req_synthetic_second"); assert.equal(headerOnly.modelUsed, undefined);
  const before = writes.length;
  headers = { "x-request-id": "" };
  const missing = await executeLlmStep({ profile, userPrompt: "synthetic" });
  for (const key of ["traceId", "completionId", "providerRequestId", "requestId", "modelUsed"] as const) assert.equal(missing[key], undefined);
  const count = calls;
  await assert.rejects(capability({ ...params, profile: { ...profile, model: "" } }), {
    name: "CapabilityUsageIdentityUnavailableError", retryable: false, generationCompleted: true,
  });
  assert.equal(calls, count + 1, "missing identity never triggers a fallback generation");
  assert.equal(writes.length, before, "no fabricated metering key or success record");
  body = quota;
  await assert.rejects(capability(params), isLLMProviderError);
  assert.equal(writes.length, before, "a provider refusal never enters the breakdown writer");
});
