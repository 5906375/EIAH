export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  role: ChatRole;
  content: string;
  name?: string;
  tool_call_id?: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  metadata?: Record<string, any>;
}

export interface ChatCompletionUsage {
  promptTokens?: number;
  completionTokens?: number;
  cachedTokens?: number;
  totalTokens?: number;
}

export interface ChatCompletionResponse {
  /** Legacy completion identity; empty when the provider did not supply one. */
  id: string;
  output: string;
  raw: any;
  finishReason: string;
  provider: string;
  /** Requested model; does not prove generation by this model. */
  model: string;
  completionId?: string;
  providerRequestId?: string;
  modelUsed?: string;
  /** Existing accounting reference (completion ID preferred). Not a provider request ID. */
  requestId?: string;
  usage?: ChatCompletionUsage | null;
}
