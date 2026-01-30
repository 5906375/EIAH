import { llmRegistry } from "./LLMRegistry";
import type { ChatCompletionRequest } from "./types";

function resolveProviderName(req: ChatCompletionRequest): string {
  if (typeof req.metadata?.provider === "string" && req.metadata.provider.trim()) {
    return req.metadata.provider.trim();
  }

  if (req.model.includes(":")) {
    return req.model.split(":")[0];
  }

  return "openai";
}

export function stripProviderPrefix(model: string) {
  if (!model.includes(":")) return model;
  return model.split(":").slice(1).join(":");
}

export function resolveProvider(req: ChatCompletionRequest) {
  const providerName = resolveProviderName(req);
  return llmRegistry.get(providerName);
}
