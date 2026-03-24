import fetch from "node-fetch";
import { LLMProvider } from "@eiah/core/llm/LLMProvider";
import type { ChatCompletionRequest, ChatCompletionResponse } from "@eiah/core/llm/types";

export class GeminiProvider extends LLMProvider {
  readonly name = "gemini";

  constructor(private apiKey: string) {
    super();
  }

  async chatCompletion(req: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const model = req.model.includes(":") ? req.model.split(":")[1] : req.model;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;

    const payload = {
      contents: req.messages.map((m) => ({
        role: m.role === "user" ? "user" : "model",
        parts: [{ text: m.content }],
      })),
    };

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = (await response.json()) as any;

    const output = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    return {
      id: json.candidates?.[0]?.index?.toString() ?? "gemini",
      output,
      raw: json,
      finishReason: json.candidates?.[0]?.finishReason ?? "stop",
      provider: this.name,
      model,
    };
  }
}
