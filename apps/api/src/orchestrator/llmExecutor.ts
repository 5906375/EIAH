import { runCompletion, llmRegistry } from "@eiah/core";
import { OpenAIProvider, AnthropicProvider, GeminiProvider, DeepSeekProvider } from "@eiah/providers";
import type { ChatMessage } from "@eiah/core";

export type LlmExecutorParams = {
  profile: {
    model: string;
    systemPrompt: string;
  };
  userPrompt: string;
  metadata?: Record<string, unknown>;
};

export type LlmExecutorResult = {
  outputText: string;
  rawResponse: unknown;
  traceId?: string;
  tookMs?: number;
};

let providersRegistered = false;

function ensureProvidersRegistered() {
  if (providersRegistered) return;

  if (process.env.OPENAI_API_KEY) {
    llmRegistry.register(new OpenAIProvider(process.env.OPENAI_API_KEY));
  }
  if (process.env.ANTHROPIC_API_KEY) {
    llmRegistry.register(new AnthropicProvider(process.env.ANTHROPIC_API_KEY));
  }
  if (process.env.GEMINI_API_KEY) {
    llmRegistry.register(new GeminiProvider(process.env.GEMINI_API_KEY));
  }
  if (process.env.DEEPSEEK_API_KEY) {
    llmRegistry.register(new DeepSeekProvider(process.env.DEEPSEEK_API_KEY));
  }

  providersRegistered = true;

  if (!llmRegistry.has("openai") && !llmRegistry.has("anthropic") && !llmRegistry.has("gemini") && !llmRegistry.has("deepseek")) {
    throw new Error("No LLM providers configured. Set at least one API key (OPENAI/ANTHROPIC/GEMINI/DEEPSEEK).");
  }
}

/** Small wrapper to execute an agent prompt using the provider registry. */
export async function executeLlmStep({
  profile,
  userPrompt,
  metadata,
}: LlmExecutorParams): Promise<LlmExecutorResult> {
  ensureProvidersRegistered();

  const startedAt = Date.now();
  const messages: ChatMessage[] = [
    { role: "system", content: profile.systemPrompt },
    { role: "user", content: userPrompt },
  ];

  const response = await runCompletion({
    model: profile.model,
    messages,
    temperature: undefined,
    metadata,
  });

  return {
    outputText: response.output,
    rawResponse: response.raw,
    traceId: response.id,
    tookMs: Date.now() - startedAt,
  };
}
