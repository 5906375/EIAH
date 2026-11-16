import fetch from "node-fetch";
import { LLMProvider } from "@eiah/core/llm/LLMProvider";
import type { ChatCompletionRequest, ChatCompletionResponse } from "@eiah/core/llm/types";
import { LLMProviderError } from "@eiah/core/llm/LLMProviderError";

export class OpenAIProvider extends LLMProvider {
  readonly name = "openai";

  constructor(private apiKey: string, private transport: typeof fetch = fetch) {
    super();
  }

  async chatCompletion(req: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const model = req.model.includes(":") ? req.model.split(":")[1] : req.model;

    const failureContext = { provider: this.name, model, traceId: req.metadata?.traceId };
    let response;
    try {
      response = await this.transport("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: req.messages,
          temperature: req.temperature ?? 0.7,
          max_tokens: req.maxTokens ?? 1024,
          top_p: req.topP,
        }),
      });
    } catch (error) {
      throw new LLMProviderError({ ...failureContext, failure: "transport",
        code: error && typeof error === "object" && "code" in error ? error.code : undefined });
    }
    const responseContext = { ...failureContext, httpStatus: response.status,
      providerRequestId: response.headers.get("x-request-id")?.trim() || undefined };
    let json: any;
    try { json = await response.json(); }
    catch { throw new LLMProviderError({ ...responseContext, failure: "invalid_response" }); }
    if (!response.ok || json?.error != null) {
      throw new LLMProviderError({ ...responseContext, code: json?.error?.code, providerType: json?.error?.type });
    }
    const msg = json?.choices?.[0]?.message?.content;
    if (typeof msg !== "string" || !msg.trim()) {
      throw new LLMProviderError({ ...responseContext, failure: "invalid_response" });
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
