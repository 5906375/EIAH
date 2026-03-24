import fetch from "node-fetch";
import { LLMProvider } from "@eiah/core/llm/LLMProvider";
import type { ChatCompletionRequest, ChatCompletionResponse } from "@eiah/core/llm/types";

export class OpenAIProvider extends LLMProvider {
  readonly name = "openai";

  constructor(private apiKey: string) {
    super();
  }

  async chatCompletion(req: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const model = req.model.includes(":") ? req.model.split(":")[1] : req.model;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
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

    const json = (await response.json()) as any;

    const msg = json.choices?.[0]?.message?.content ?? "";
    const finish = json.choices?.[0]?.finish_reason ?? "stop";

    return {
      id: json.id ?? "openai",
      output: msg,
      raw: json,
      finishReason: finish,
      provider: this.name,
      model,
    };
  }
}
