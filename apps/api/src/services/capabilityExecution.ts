import type { ChatCompletionUsage } from "@eiah/core/llm/types";
import { executeLlmStep, type LlmExecutorParams, type LlmExecutorResult } from "../orchestrator/llmExecutor";
import { recordRunUsageBreakdown } from "./billing";

export const CANONICAL_CAPABILITIES = [
  "chat_response",
  "history_summary",
  "document_classification",
  "property_extraction",
  "hallucination_judgment",
] as const;

export type CanonicalCapability = (typeof CANONICAL_CAPABILITIES)[number];
export type CapabilityVertical = "imob" | "legal" | "core" | "governance";
export type CapabilityExecutionStatus = "ok" | "fallback_used" | "blocked" | "error";
export type CapabilityProvider = "openai" | "anthropic" | "gemini" | "deepseek";

export type CapabilityPolicyContext = {
  tenantId?: string;
  workspaceId?: string;
  trustLevel?: string;
  costTier?: string;
  purpose?: string;
};

export type CapabilityRequest = {
  capability: CanonicalCapability;
  vertical: CapabilityVertical;
  context: Record<string, unknown>;
  policyContext?: CapabilityPolicyContext;
};

export type CapabilityResult = {
  status: CapabilityExecutionStatus;
  output: Record<string, unknown>;
  providerUsed?: string;
  modelUsed?: string;
  requestId?: string;
  usage?: ChatCompletionUsage | null;
  normalized: boolean;
  telemetryRef?: string;
  rawResponse?: unknown;
  tookMs?: number;
  routeAttempted: CapabilityExecutionRoute[];
};

export type CapabilityExecutionParams = {
  request: CapabilityRequest;
  profile: LlmExecutorParams["profile"];
  userPrompt: string;
  metadata?: Record<string, unknown>;
};

export type CapabilityExecutionRoute = {
  provider: CapabilityProvider;
  model: string;
  reason: "profile_override" | "capability_default" | "capability_fallback";
};

export type CapabilityExecutionPlan = {
  capability: CanonicalCapability;
  routes: CapabilityExecutionRoute[];
  routingPolicy: {
    fallbackEnabled: boolean;
    defaultProvider: CapabilityProvider;
    fallbackProvider?: CapabilityProvider;
  };
};

type CapabilityRoutingPolicyDefinition = {
  defaultProvider: CapabilityProvider;
  defaultModelEnv?: string;
  defaultModelFallback: string;
  fallbackProvider?: CapabilityProvider;
  fallbackModelEnv?: string;
  fallbackModelFallback?: string;
};

const CAPABILITY_POLICY: Record<CanonicalCapability, CapabilityRoutingPolicyDefinition> = {
  chat_response: {
    defaultProvider: "openai",
    defaultModelEnv: "CAPABILITY_CHAT_RESPONSE_MODEL",
    defaultModelFallback: "gpt-4o-mini",
    fallbackProvider: "gemini",
    fallbackModelEnv: "CAPABILITY_CHAT_RESPONSE_FALLBACK_MODEL",
    fallbackModelFallback: "gemini-1.5-flash",
  },
  history_summary: {
    defaultProvider: "openai",
    defaultModelEnv: "CAPABILITY_HISTORY_SUMMARY_MODEL",
    defaultModelFallback: "gpt-4o-mini",
    fallbackProvider: "gemini",
    fallbackModelEnv: "CAPABILITY_HISTORY_SUMMARY_FALLBACK_MODEL",
    fallbackModelFallback: "gemini-1.5-flash",
  },
  document_classification: {
    defaultProvider: "openai",
    defaultModelEnv: "CAPABILITY_DOCUMENT_CLASSIFICATION_MODEL",
    defaultModelFallback: "gpt-4o-mini",
    fallbackProvider: "gemini",
    fallbackModelEnv: "CAPABILITY_DOCUMENT_CLASSIFICATION_FALLBACK_MODEL",
    fallbackModelFallback: "gemini-1.5-flash",
  },
  property_extraction: {
    defaultProvider: "openai",
    defaultModelEnv: "CAPABILITY_PROPERTY_EXTRACTION_MODEL",
    defaultModelFallback: "gpt-4o-mini",
    fallbackProvider: "gemini",
    fallbackModelEnv: "CAPABILITY_PROPERTY_EXTRACTION_FALLBACK_MODEL",
    fallbackModelFallback: "gemini-1.5-flash",
  },
  hallucination_judgment: {
    defaultProvider: "openai",
    defaultModelEnv: "JUDGE_MODEL",
    defaultModelFallback: "gpt-4o-mini",
    fallbackProvider: "anthropic",
    fallbackModelEnv: "CAPABILITY_HALLUCINATION_JUDGMENT_FALLBACK_MODEL",
    fallbackModelFallback: "claude-3-5-haiku-latest",
  },
};

function withProviderPrefix(provider: CapabilityProvider, model: string) {
  return model.includes(":") ? model : `${provider}:${model}`;
}

function stripProviderPrefix(model: string) {
  return model.includes(":") ? model.split(":").slice(1).join(":") : model;
}

function resolveProviderFromModel(model: string, fallback: CapabilityProvider): CapabilityProvider {
  if (!model.includes(":")) return fallback;
  const provider = model.split(":")[0];
  if (provider === "openai" || provider === "anthropic" || provider === "gemini" || provider === "deepseek") {
    return provider;
  }
  return fallback;
}

function buildCapabilityMetadata(
  params: CapabilityExecutionParams,
  route: CapabilityExecutionRoute,
  plan: CapabilityExecutionPlan,
  attempt: number
): Record<string, unknown> {
  const { request, metadata } = params;
  return {
    ...(metadata ?? {}),
    provider: route.provider,
    capability: request.capability,
    capabilityVertical: request.vertical,
    capabilityContext: request.context,
    capabilityPolicyContext: request.policyContext ?? null,
    capabilityRoutingPolicy: plan.routingPolicy,
    capabilityRouteReason: route.reason,
    capabilityRouteIndex: attempt,
  };
}

function normalizeCapabilityResult(
  route: CapabilityExecutionRoute,
  attemptedRoutes: CapabilityExecutionRoute[],
  llmResult: LlmExecutorResult,
  fallbackUsed: boolean
): CapabilityResult {
  const providerUsed =
    typeof llmResult.rawResponse === "object" &&
    llmResult.rawResponse !== null &&
    "provider" in llmResult.rawResponse &&
    typeof (llmResult.rawResponse as { provider?: unknown }).provider === "string"
      ? ((llmResult.rawResponse as { provider: string }).provider as string)
      : route.provider;

  const modelUsed =
    typeof llmResult.rawResponse === "object" &&
    llmResult.rawResponse !== null &&
    "model" in llmResult.rawResponse &&
    typeof (llmResult.rawResponse as { model?: unknown }).model === "string"
      ? ((llmResult.rawResponse as { model: string }).model as string)
      : stripProviderPrefix(route.model);

  return {
    status: fallbackUsed ? "fallback_used" : "ok",
    output: {
      text: llmResult.outputText,
    },
    providerUsed,
    modelUsed,
    requestId: llmResult.requestId,
    usage: llmResult.usage ?? null,
    normalized: true,
    telemetryRef: llmResult.traceId,
    rawResponse: llmResult.rawResponse,
    tookMs: llmResult.tookMs,
    routeAttempted: attemptedRoutes,
  };
}

async function recordCapabilityUsage(
  params: CapabilityExecutionParams,
  route: CapabilityExecutionRoute,
  llmResult: LlmExecutorResult
) {
  const runId =
    params.request.context && typeof params.request.context.runId === "string"
      ? params.request.context.runId
      : null;
  const tenantId = params.request.policyContext?.tenantId ?? null;
  const workspaceId = params.request.policyContext?.workspaceId ?? null;
  const requestId = llmResult.requestId?.trim();
  if (!runId || !tenantId || !workspaceId || !requestId) {
    return;
  }

  const usage = llmResult.usage ?? null;
  const totalTokens =
    usage?.totalTokens ??
    (usage?.promptTokens ?? 0) + (usage?.completionTokens ?? 0) + (usage?.cachedTokens ?? 0);

  await recordRunUsageBreakdown({
    tenantId,
    workspaceId,
    runId,
    agent:
      typeof params.metadata?.agentId === "string" && params.metadata.agentId.trim().length > 0
        ? params.metadata.agentId.trim()
        : params.request.capability,
    agentVersion:
      typeof params.metadata?.agentVersion === "string" && params.metadata.agentVersion.trim().length > 0
        ? params.metadata.agentVersion.trim()
        : null,
    provider: llmResult.provider ?? route.provider,
    model: llmResult.model ?? stripProviderPrefix(route.model),
    pricingVersion: "provider-usage.v1",
    requestId,
    traceId: llmResult.traceId ?? null,
    meterType: "llm_completion",
    requestClass: params.request.capability,
    promptTokens: usage?.promptTokens ?? 0,
    completionTokens: usage?.completionTokens ?? 0,
    cachedTokens: usage?.cachedTokens ?? 0,
    totalTokens,
    amountCents: 0,
    currency: "BRL",
    estimated: true,
  });
}

export function buildCapabilityExecutionPlan(params: CapabilityExecutionParams): CapabilityExecutionPlan {
  const policy = CAPABILITY_POLICY[params.request.capability];
  const explicitModel = params.profile.model?.trim();

  if (explicitModel) {
    const explicitProvider = resolveProviderFromModel(explicitModel, policy.defaultProvider);
    return {
      capability: params.request.capability,
      routes: [
        {
          provider: explicitProvider,
          model: withProviderPrefix(explicitProvider, explicitModel),
          reason: "profile_override",
        },
      ],
      routingPolicy: {
        fallbackEnabled: false,
        defaultProvider: explicitProvider,
      },
    };
  }

  const defaultModel = process.env[policy.defaultModelEnv ?? ""]?.trim() || policy.defaultModelFallback;
  const routes: CapabilityExecutionRoute[] = [
    {
      provider: policy.defaultProvider,
      model: withProviderPrefix(policy.defaultProvider, defaultModel),
      reason: "capability_default",
    },
  ];

  const fallbackModel = process.env[policy.fallbackModelEnv ?? ""]?.trim() || policy.fallbackModelFallback;
  if (policy.fallbackProvider && fallbackModel) {
    routes.push({
      provider: policy.fallbackProvider,
      model: withProviderPrefix(policy.fallbackProvider, fallbackModel),
      reason: "capability_fallback",
    });
  }

  return {
    capability: params.request.capability,
    routes,
    routingPolicy: {
      fallbackEnabled: routes.length > 1,
      defaultProvider: policy.defaultProvider,
      fallbackProvider: policy.fallbackProvider,
    },
  };
}

export async function executeCapability(params: CapabilityExecutionParams): Promise<CapabilityResult> {
  const plan = buildCapabilityExecutionPlan(params);
  const attemptedRoutes: CapabilityExecutionRoute[] = [];
  let lastError: unknown = null;

  for (const [index, route] of plan.routes.entries()) {
    attemptedRoutes.push(route);
    try {
      const result = await executeLlmStep({
        profile: {
          ...params.profile,
          model: route.model,
        },
        userPrompt: params.userPrompt,
        metadata: buildCapabilityMetadata(params, route, plan, index),
      });

      await recordCapabilityUsage(params, route, result);

      return normalizeCapabilityResult(route, attemptedRoutes, result, index > 0);
    } catch (error) {
      lastError = error;
      if (index === plan.routes.length - 1) {
        throw error;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("capability_execution.failed_without_result");
}
