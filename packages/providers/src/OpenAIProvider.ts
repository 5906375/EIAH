import fetch from "node-fetch";
import { LLMProvider } from "@eiah/core/llm/LLMProvider";
import type { ChatCompletionRequest, ChatCompletionResponse } from "@eiah/core/llm/types";
import { LLMProviderError, llmDiagnosticIdentifier } from "@eiah/core/llm/LLMProviderError";
import { createLogger } from "@eiah/core/logging/logger";

export class OpenAIProvider extends LLMProvider {
  readonly name = "openai";

  constructor(private apiKey: string, private transport: typeof fetch = fetch) {
    super();
  }

  async chatCompletion(req: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const model = req.model.includes(":") ? req.model.split(":")[1] : req.model;
    const diagnosticLogger = req.metadata?.source === "imob-property-capture-intake"
      ? createLogger({ component: "llm-transport", traceId: llmDiagnosticIdentifier(req.metadata?.traceId) }) : undefined;
    const startedAt = Date.now();
    const observe = (stage: string, fields: Record<string, unknown> = {}) => {
      try { diagnosticLogger?.info({ stage, provider: this.name, modelRequested: llmDiagnosticIdentifier(model),
        attempt: req.metadata?.llmAttempt, durationMs: Date.now() - startedAt, ...fields }, "llm.transport"); }
      catch { /* Diagnostics cannot change provider behavior. */ }
    };
    const reject = (input: ConstructorParameters<typeof LLMProviderError>[0], stage: string) => {
      const failure = new LLMProviderError(input);
      observe(stage, { failure: failure.diagnostic });
      return failure;
    };

    const failureContext = { provider: this.name, model, traceId: req.metadata?.traceId };
    let response;
    try {
      const body = JSON.stringify({
        model,
        messages: req.messages,
        temperature: req.temperature ?? 0.7,
        max_tokens: req.maxTokens ?? 1024,
        top_p: req.topP,
      });
      observe("transport_attempt");
      response = await this.transport("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body,
      });
    } catch (error) {
      throw reject({ ...failureContext, failure: "transport",
        code: error && typeof error === "object" && "code" in error ? error.code : undefined }, "transport_failure");
    }
    const responseContext = { ...failureContext, httpStatus: response.status,
      providerRequestId: response.headers.get("x-request-id")?.trim() || undefined };
    observe("response_received", { providerHttpStatus: response.status,
      providerRequestId: llmDiagnosticIdentifier(responseContext.providerRequestId) });
    let json: any;
    try { json = await response.json(); }
    catch { throw reject({ ...responseContext, failure: "invalid_response" }, "response_parsing"); }
    if (!response.ok || json?.error != null) {
      throw reject({ ...responseContext, code: json?.error?.code, providerType: json?.error?.type }, "response_validation");
    }
    const msg = json?.choices?.[0]?.message?.content;
    if (typeof msg !== "string" || !msg.trim()) {
      throw reject({ ...responseContext, failure: "invalid_response" }, "response_validation");
    }
    const finish = json.choices[0].finish_reason;
    const completionId = typeof json.id === "string" && json.id.trim() ? json.id : undefined;
    const usage = json.usage
      ? {
          promptTokens: json.usage.prompt_tokens ?? undefined,
          completionTokens: json.usage.completion_tokens ?? undefined,
          cachedTokens: json.usage.prompt_tokens_details?.cached_tokens ?? undefined,
          totalTokens: json.usage.total_tokens ?? undefined,
        }
      : null;

    return {
      id: completionId ?? "",
      output: msg,
      raw: json,
      finishReason: typeof finish === "string" ? finish : "",
      provider: this.name,
      model,
      completionId,
      providerRequestId: responseContext.providerRequestId,
      modelUsed: typeof json.model === "string" && json.model.trim() ? json.model : undefined,
      // Preserve the existing completion-based metering key when present. No literal fallback.
      requestId: completionId ?? responseContext.providerRequestId,
      usage,
    };
  }
}
