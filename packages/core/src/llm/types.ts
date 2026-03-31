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
  id: string;
  output: string;
  raw: any;
  finishReason: string;
  provider: string;
  model: string;
  requestId?: string;
  usage?: ChatCompletionUsage | null;
}
