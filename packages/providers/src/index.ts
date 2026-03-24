import fetch from "node-fetch";
import type { ChatCompletionRequest, ChatCompletionResponse } from "@eiah/core/llm/types";
import { OpenAIProvider } from "./OpenAIProvider";
import { AnthropicProvider } from "./AnthropicProvider";
import { GeminiProvider } from "./GeminiProvider";
import { DeepSeekProvider } from "./DeepSeekProvider";

type ProviderName = "openai" | "anthropic" | "gemini" | "deepseek";

const llmInstances: Partial<
  Record<ProviderName, OpenAIProvider | AnthropicProvider | GeminiProvider | DeepSeekProvider>
> = {};

function getApiKey(name: ProviderName) {
  const envKey =
    name === "openai"
      ? process.env.OPENAI_API_KEY
      : name === "anthropic"
      ? process.env.ANTHROPIC_API_KEY
      : name === "gemini"
      ? process.env.GEMINI_API_KEY
      : process.env.DEEPSEEK_API_KEY;

  if (!envKey) throw new Error(`Missing API key for provider ${name}`);
  return envKey;
}

function getProvider(name: ProviderName) {
  if (!llmInstances[name]) {
    const key = getApiKey(name);
    if (name === "openai") llmInstances[name] = new OpenAIProvider(key);
    else if (name === "anthropic") llmInstances[name] = new AnthropicProvider(key);
    else if (name === "gemini") llmInstances[name] = new GeminiProvider(key);
    else llmInstances[name] = new DeepSeekProvider(key);
  }
  return llmInstances[name]!;
}

export async function generateText(
  input: Omit<ChatCompletionRequest, "model"> & { provider: ProviderName; model: string },
  opts?: { onToken?: (token: string) => void }
): Promise<ChatCompletionResponse> {
  if (process.env.NODE_ENV === "test") {
    const mock: ChatCompletionResponse = {
      id: "mock-id",
      output: "Resposta mockada pelo provider",
      raw: null,
      finishReason: "stop",
      provider: input.provider,
      model: input.model,
    };
    if (opts?.onToken) opts.onToken(mock.output);
    return mock;
  }

  const { provider, ...rest } = input;
  const providerInstance = getProvider(provider);
  const result = await providerInstance.chatCompletion({ ...rest, model: `${provider}:${rest.model}` });
  if (opts?.onToken) {
    opts.onToken(result.output);
  }
  return result;
}

export interface GenerateEmbeddingInput {
  provider: "openai" | "gemini" | "deepseek";
  model: string;
  input: string;
}

export async function generateEmbedding(input: GenerateEmbeddingInput) {
  if (process.env.NODE_ENV === "test") {
    return Array(8).fill(0.5) as number[];
  }

  const key =
    input.provider === "openai"
      ? process.env.OPENAI_API_KEY
      : input.provider === "gemini"
      ? process.env.GEMINI_API_KEY
      : process.env.DEEPSEEK_API_KEY;

  if (!key) throw new Error(`Missing API key for ${input.provider}`);

  if (input.provider === "openai") {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: input.input,
        model: input.model,
      }),
    });

    if (!res.ok) throw new Error(await res.text());
    const data = (await res.json()) as any;
    return data.data?.[0]?.embedding as number[];
  }

  if (input.provider === "gemini") {
    const url = `https://generativelanguage.googleapis.com/v1beta2/models/${input.model}:embedText?key=${key}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: input.input }),
    });

    if (!res.ok) throw new Error(await res.text());
    const data = (await res.json()) as any;
    return data.embedding?.values as number[];
  }

  const res = await fetch("https://api.deepseek.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      input: input.input,
    }),
  });

  if (!res.ok) throw new Error(await res.text());
  const data = (await res.json()) as any;
  return data.data?.[0]?.embedding as number[];
}

export { OpenAIProvider, AnthropicProvider, GeminiProvider, DeepSeekProvider };
