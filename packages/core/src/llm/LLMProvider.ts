import type { ChatCompletionRequest, ChatCompletionResponse } from "./types";

export abstract class LLMProvider {
  abstract readonly name: string;

  abstract chatCompletion(req: ChatCompletionRequest): Promise<ChatCompletionResponse>;
}
