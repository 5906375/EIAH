import fetch from "node-fetch";
import { LLMProvider } from "@eiah/core/llm/LLMProvider";
import type { ChatCompletionRequest, ChatCompletionResponse } from "@eiah/core/llm/types";

export class AnthropicProvider extends LLMProvider {
  readonly name = "anthropic";

  constructor(private apiKey: string) {
    super();
  }

  async chatCompletion(req: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const model = req.model.includes(":") ? req.model.split(":")[1] : req.model;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: req.maxTokens ?? 1024,
        messages: req.messages,
      }),
    });

    const json = (await response.json()) as any;

    const output = json.content?.[0]?.text ?? "";
    const finish = json.stop_reason ?? "stop";
    const promptTokens = json.usage?.input_tokens ?? undefined;
    const completionTokens = json.usage?.output_tokens ?? undefined;
    const cachedTokens = json.usage?.cache_read_input_tokens ?? undefined;
    const hasTokenUsage =
      promptTokens !== undefined || completionTokens !== undefined || cachedTokens !== undefined;
    const usage = json.usage
      ? {
          promptTokens,
          completionTokens,
          cachedTokens,
          totalTokens: hasTokenUsage ? (promptTokens ?? 0) + (completionTokens ?? 0) + (cachedTokens ?? 0) : undefined,
        }
      : null;

    return {
      id: json.id ?? "anthropic",
      output,
      raw: json,
      finishReason: finish,
      provider: this.name,
      model,
      requestId: json.id ?? "anthropic",
      usage,
    };
  }
}
