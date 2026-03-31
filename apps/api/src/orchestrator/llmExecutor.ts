import { runCompletion } from "@eiah/core/llm/completionEngine";
import { llmRegistry } from "@eiah/core/llm/LLMRegistry";
import type { ChatMessage, ChatCompletionUsage } from "@eiah/core/llm/types";
import { OpenAIProvider, AnthropicProvider, GeminiProvider, DeepSeekProvider } from "@eiah/providers";
import { fullMask, maskText } from "../services/masker";

export type LlmExecutorParams = {
  profile: {
    model: string;
    systemPrompt: string;
    knowledgePolicy?: {
      llmUsageMode?:
        | "none"
        | "format_only"
        | "grounded_reasoning"
        | "open_reasoning_restricted"
        | "disallowed_for_critical_execution";
      provenancePolicy?: "required" | "recommended" | "none";
      maskingPolicy?: "required" | "conditional" | "none";
    };
  };
  userPrompt: string;
  metadata?: Record<string, unknown>;
};

export type LlmExecutorResult = {
  outputText: string;
  rawResponse: unknown;
  traceId?: string;
  tookMs?: number;
  provider?: string;
  model?: string;
  requestId?: string;
  usage?: ChatCompletionUsage | null;
};

let providersRegistered = false;

const PII_RULES = [
  { regex: /\b\d{3}\.\d{3}\.\d{3}\-\d{2}\b/g, label: "CPF" },
  { regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z]{2,}\b/gi, label: "EMAIL" },
  { regex: /\b\d{2}\s?\d{4,5}\-?\d{4}\b/g, label: "PHONE" },
  { regex: /token|secret|password|key/gi, label: "SECRET" },
] as const;

function shouldMask(policy: LlmExecutorParams["profile"]["knowledgePolicy"], metadata?: Record<string, unknown>) {
  if (!policy || policy.maskingPolicy === "none") return false;
  if (policy.maskingPolicy === "required") return true;
  if (!metadata) return false;
  return (
    isCriticalExecution(metadata) ||
    metadata.containsSensitiveData === true ||
    metadata.maskSensitiveBeforeLlm === true
  );
}

function sanitizeTextForLlm(text: string) {
  let next = text;
  const flags = new Set<string>();
  for (const { regex, label } of PII_RULES) {
    regex.lastIndex = 0;
    if (regex.test(next)) {
      regex.lastIndex = 0;
      next = maskText(next, regex);
      flags.add(label);
    }
  }
  return { text: next, flags: Array.from(flags) };
}

function sanitizeMetadataForLlm(value: unknown, keyPath = ""): { value: unknown; flags: string[] } {
  const keyLower = keyPath.toLowerCase();
  if (typeof value === "string") {
    if (
      keyLower.includes("token") ||
      keyLower.includes("secret") ||
      keyLower.includes("password") ||
      keyLower.endsWith("key")
    ) {
      return { value: fullMask(value), flags: ["SECRET_KEY"] };
    }
    const sanitized = sanitizeTextForLlm(value);
    return { value: sanitized.text, flags: sanitized.flags };
  }

  if (Array.isArray(value)) {
    const flags = new Set<string>();
    const sanitizedItems = value.map((item, index) => {
      const sanitized = sanitizeMetadataForLlm(item, `${keyPath}[${index}]`);
      sanitized.flags.forEach((flag) => flags.add(flag));
      return sanitized.value;
    });
    return { value: sanitizedItems, flags: Array.from(flags) };
  }

  if (value && typeof value === "object") {
    const flags = new Set<string>();
    const sanitizedObject: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      const sanitized = sanitizeMetadataForLlm(entry, keyPath ? `${keyPath}.${key}` : key);
      sanitized.flags.forEach((flag) => flags.add(flag));
      sanitizedObject[key] = sanitized.value;
    }
    return { value: sanitizedObject, flags: Array.from(flags) };
  }

  return { value, flags: [] };
}

function isGroundedMetadata(metadata?: Record<string, unknown>) {
  if (!metadata) return false;
  const groundingKeys = [
    "groundedFacts",
    "groundedContext",
    "deterministicResponse",
    "knowledgeSources",
    "resolvedSources",
    "provenance",
  ] as const;

  return groundingKeys.some((key) => {
    const value = metadata[key];
    if (typeof value === "string") return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    return Boolean(value && typeof value === "object");
  });
}

function isCriticalExecution(metadata?: Record<string, unknown>) {
  if (!metadata) return false;
  if (metadata.txIdRequired === true) return true;
  if (metadata.approvalRequired === true) return true;
  if (metadata.criticalExecution === true) return true;
  return metadata.tier === "HIGH";
}

function getDeterministicResponse(metadata?: Record<string, unknown>) {
  if (!metadata) return null;
  const value = metadata.deterministicResponse;
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function assertKnowledgePolicy(params: LlmExecutorParams) {
  const policy = params.profile.knowledgePolicy;
  if (!policy) return;

  const grounded = isGroundedMetadata(params.metadata);
  const critical = isCriticalExecution(params.metadata);
  const deterministicResponse = getDeterministicResponse(params.metadata);

  if (policy.llmUsageMode === "none") {
    if (deterministicResponse) return;
    throw new Error("knowledge_policy.blocked: deterministic-only agent requires deterministicResponse");
  }

  if (policy.llmUsageMode === "disallowed_for_critical_execution" && critical) {
    throw new Error("knowledge_policy.blocked: external LLM disallowed for critical execution");
  }

  if (
    critical &&
    (policy.llmUsageMode === "grounded_reasoning" || policy.llmUsageMode === "format_only") &&
    policy.provenancePolicy === "required" &&
    !grounded
  ) {
    throw new Error("knowledge_policy.blocked: grounded provenance required before LLM");
  }
}

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
  assertKnowledgePolicy({ profile, userPrompt, metadata });

  const deterministicResponse = getDeterministicResponse(metadata);
  if (profile.knowledgePolicy?.llmUsageMode === "none" && deterministicResponse) {
    return {
      outputText: deterministicResponse,
      rawResponse: {
        mode: "deterministic_only",
        source: "metadata.deterministicResponse",
      },
      tookMs: 0,
      provider: profile.model.includes(":") ? profile.model.split(":")[0] : undefined,
      model: profile.model.includes(":") ? profile.model.split(":").slice(1).join(":") : profile.model,
      requestId: undefined,
      usage: null,
    };
  }

  ensureProvidersRegistered();

  const maskingEnabled = shouldMask(profile.knowledgePolicy, metadata);
  const sanitizedPrompt = maskingEnabled ? sanitizeTextForLlm(userPrompt) : { text: userPrompt, flags: [] };
  const sanitizedMetadataResult = maskingEnabled
    ? sanitizeMetadataForLlm(metadata ?? {})
    : { value: metadata, flags: [] as string[] };
  const sanitizedMetadata = (() => {
    const base =
      sanitizedMetadataResult.value && typeof sanitizedMetadataResult.value === "object"
        ? { ...(sanitizedMetadataResult.value as Record<string, unknown>) }
        : {};
    if (maskingEnabled) {
      base.llmMasking = {
        applied: true,
        policy: profile.knowledgePolicy?.maskingPolicy ?? "none",
        flags: Array.from(new Set([...sanitizedPrompt.flags, ...sanitizedMetadataResult.flags])),
      };
    }
    return base;
  })();

  const startedAt = Date.now();
  const messages: ChatMessage[] = [
    { role: "system", content: profile.systemPrompt },
    { role: "user", content: sanitizedPrompt.text },
  ];

  const response = await runCompletion({
    model: profile.model,
    messages,
    temperature: undefined,
    metadata: sanitizedMetadata,
  });

  return {
    outputText: response.output,
    rawResponse: response.raw,
    traceId: response.id,
    tookMs: Date.now() - startedAt,
    provider: response.provider,
    model: response.model,
    requestId: response.requestId ?? response.id,
    usage: response.usage ?? null,
  };
}
