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
  // Total de tentativas de ENVIO (não "retries além da primeira") repassadas
  // a packages/core/src/utils/retry.ts — preserva o default global
  // (LLM_RETRIES) quando ausente. Ver
  // docs/architecture/radar-social-construction-plan-v1.md, Atualização
  // 1.31/1.32: `retries: 1` significa exatamente um envio, nunca `0`
  // (`0` nunca chamaria a função protegida nem uma vez).
  retries?: number;
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
