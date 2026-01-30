import fetch from "node-fetch";
import { LLMProvider, type ChatCompletionRequest, type ChatCompletionResponse } from "@eiah/core";

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

    return {
      id: json.id ?? "deepseek",
      output: msg,
      raw: json,
      finishReason: json.choices?.[0]?.finish_reason ?? "stop",
      provider: this.name,
      model,
    };
  }
}
