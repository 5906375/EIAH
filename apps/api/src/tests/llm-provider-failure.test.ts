import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import https from "node:https";
import ts from "typescript";
import { LLMProviderError, isLLMProviderError } from "@eiah/core/llm/LLMProviderError";
import type { LLMProvider } from "@eiah/core/llm/LLMProvider";
import type { ChatCompletionRequest, ChatCompletionResponse } from "@eiah/core/llm/types";
import { llmRegistry } from "@eiah/core/llm/LLMRegistry";
import { getRootStructuredLogger } from "@eiah/core/logging/logger";
import { executeLlmStep } from "../orchestrator/llmExecutor";
import { resolveImobPropertyCaptureTurn } from "../services/imob/crm/imobCrmTurnEngine";
import { IMOB_PROPERTY_CAPTURE_POLICY, type ImobPropertyCaptureRequest } from "@eiah/contracts";

// Inject the existing public provider contract through the central registry.
// Adapter-specific HTTP parsing and metadata extraction are tested by its owning package.
const register = (chatCompletion: LLMProvider["chatCompletion"]) => llmRegistry.register({ name: "openai", chatCompletion });
const quotaFailure = (req: ChatCompletionRequest) => new LLMProviderError({ provider: "openai", model: "gpt-4.1",
  code: "credit_balance_exhausted", providerType: "insufficient_quota", httpStatus: 429, traceId: req.metadata?.traceId });
const noIdentity: ChatCompletionResponse = { id: "", output: "conteúdo sintético", raw: {}, finishReason: "stop", provider: "openai", model: "gpt-4.1", usage: null };
const success: ChatCompletionResponse = { ...noIdentity, id: "completion_synthetic", completionId: "completion_synthetic", requestId: "completion_synthetic",
  usage: { promptTokens: 12, completionTokens: 7, totalTokens: 19, cachedTokens: undefined } };
const request = { model: "openai:gpt-4.1", messages: [{ role: "user" as const, content: "dados sintéticos" }], metadata: { traceId: "diagnostic-test-correlation" } };
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

test("runtime: quota não sofre retry nem emite sucesso ou uso; executor preserva diagnóstico", async (t) => {
  let calls = 0;
  const events: Array<any> = [];
  const root = getRootStructuredLogger();
  const streamSymbol = Object.getOwnPropertySymbols(root).find((key) => key.description === "pino.stream");
  assert.ok(streamSymbol);
  // The existing completion child owns its methods, but shares this actual output stream.
  t.mock.method((root as any)[streamSymbol], "write", (line: string) => events.push(JSON.parse(line)));
  register(async (req) => { calls++; throw quotaFailure(req); });
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
  register(async () => { calls++; throw new LLMProviderError({ provider: "openai", model: "gpt-4.1", providerType: "server_error", httpStatus: 503, providerRequestId: `req_synthetic_${calls}` }); });
  await assert.rejects(execute(), (error) => {
    assert.ok(isLLMProviderError(error)); assert.equal(error.diagnostic.category, "transient");
    assert.equal(error.diagnostic.providerRequestId, "req_synthetic_3"); return true;
  });
  assert.equal(calls, 3);
});

test("runtime: rate limit e transitório podem recuperar com a mesma policy; sucesso mantém conteúdo e uso", async () => {
  for (const signals of [{ code: "rate_limit_exceeded", httpStatus: 429 }, { providerType: "server_error", httpStatus: 503 }] as const) {
    let calls = 0;
    register(async () => { if (++calls === 1) throw new LLMProviderError({ provider: "openai", model: "gpt-4.1", ...signals }); return { ...success, providerRequestId: "req_synthetic_success" }; });
    const result = await execute();
    assert.equal(calls, 2); assert.equal(result.outputText, success.output);
    assert.equal(result.requestId, success.id); assert.equal(result.completionId, success.id);
    assert.equal(result.providerRequestId, "req_synthetic_success"); assert.equal(result.traceId, request.metadata.traceId);
    assert.equal(result.modelUsed, undefined);
    assert.deepEqual(result.usage, { promptTokens: 12, completionTokens: 7, totalTokens: 19, cachedTokens: undefined });
  }
  register(async () => noIdentity);
  const absent = await execute();
  assert.equal(absent.requestId, undefined); assert.equal(absent.usage, null); assert.equal(absent.traceId, request.metadata.traceId);
});

test("engine/intake: quota não alcança parser/schema, preserva draft/proposta e não produz execução", async () => {
  const scope = { tenantId: "synthetic-tenant", workspaceId: "synthetic-workspace" };
  const interpretation = JSON.stringify({ intent: "continue", confidence: 0.98, changes: [{ field: "bedrooms", value: "2", evidence: "dois quartos", correction: false }] });
  register(async () => ({ ...noIdentity, output: interpretation }));
  const proposed = await resolveImobPropertyCaptureTurn(draft, { scope, interpret: async () => (await execute()).outputText });
  assert.equal(proposed.propertyCapture.outcome, "proposed");
  const input = { ...draft, pendingProposal: proposed.propertyCapture.proposal };
  const snapshot = JSON.stringify(input);
  let calls = 0;
  register(async (req) => { calls++; throw quotaFailure(req); });
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
  let result: ChatCompletionResponse = { ...success, modelUsed: "synthetic-confirmed-model", raw: { model: "synthetic-confirmed-model" }, providerRequestId: "req_synthetic_first" };
  let calls = 0;
  let fail = false;
  register(async (req) => { calls++; if (fail) throw quotaFailure(req); return result; });
  const first = await capability(params);
  assert.equal(first.status, "ok"); assert.equal(first.requestId, success.id); assert.equal(first.completionId, success.id);
  assert.equal(first.providerRequestId, "req_synthetic_first"); assert.equal(first.telemetryRef, request.metadata.traceId);
  assert.equal(first.modelRequested, "gpt-4.1"); assert.equal(first.modelUsed, "synthetic-confirmed-model");
  result = { ...result, providerRequestId: "req_synthetic_second" };
  await capability(params);
  assert.equal(writes.length, 2); assert.equal(ledgerKeys.size, 1, "the existing completion-based idempotency key is retained");
  assert.equal(writes[0].requestId, success.id); assert.equal(writes[0].totalTokens, 19);
  result = { ...noIdentity, requestId: "req_synthetic_second", providerRequestId: "req_synthetic_second" };
  const headerOnly = await capability(params);
  assert.equal(headerOnly.completionId, undefined); assert.equal(headerOnly.requestId, "req_synthetic_second");
  assert.equal(headerOnly.providerRequestId, "req_synthetic_second"); assert.equal(headerOnly.modelUsed, undefined);
  const before = writes.length;
  result = noIdentity;
  const missing = await executeLlmStep({ profile, userPrompt: "synthetic" });
  for (const key of ["traceId", "completionId", "providerRequestId", "requestId", "modelUsed"] as const) assert.equal(missing[key], undefined);
  const count = calls;
  await assert.rejects(capability({ ...params, profile: { ...profile, model: "" } }), {
    name: "CapabilityUsageIdentityUnavailableError", retryable: false, generationCompleted: true,
  });
  assert.equal(calls, count + 1, "missing identity never triggers a fallback generation");
  assert.equal(writes.length, before, "no fabricated metering key or success record");
  fail = true;
  await assert.rejects(capability(params), isLLMProviderError);
  assert.equal(writes.length, before, "a provider refusal never enters the breakdown writer");
});
