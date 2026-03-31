import fetch from "node-fetch";
import { LLMProvider } from "@eiah/core/llm/LLMProvider";
import type { ChatCompletionRequest, ChatCompletionResponse } from "@eiah/core/llm/types";

export class DeepSeekProvider extends LLMProvider {
  readonly name = "deepseek";

  constructor(private apiKey: string) {
    super();
  }

  async chatCompletion(req: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const model = req.model.includes(":") ? req.model.split(":")[1] : req.model;

    const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: req.messages,
        max_tokens: req.maxTokens ?? 1024,
        temperature: req.temperature ?? 0.7,
      }),
    });

    const json = (await response.json()) as any;

    const msg = json.choices?.[0]?.message?.content ?? "";
    const usage = json.usage
      ? {
          promptTokens: json.usage.prompt_tokens ?? undefined,
          completionTokens: json.usage.completion_tokens ?? undefined,
          cachedTokens: json.usage.prompt_tokens_details?.cached_tokens ?? undefined,
          totalTokens: json.usage.total_tokens ?? undefined,
        }
      : null;

    return {
      id: json.id ?? "deepseek",
      output: msg,
      raw: json,
      finishReason: json.choices?.[0]?.finish_reason ?? "stop",
      provider: this.name,
      model,
      requestId: json.id ?? "deepseek",
      usage,
    };
  }
}
