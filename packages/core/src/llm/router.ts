import type { ChatCompletionRequest, ChatCompletionResponse } from "./types";
import { stripProviderPrefix } from "./LLMRouter";
import { runCompletion } from "./completionEngine";

export type LLMTask =
  | "intent_classify"
  | "contract_extract"
  | "tenant_faq"
  | "collections_message"
  | "judge_policy";

export type LLMTaskRoute = {
  task: LLMTask;
  model: string;
  primaryProvider: string;
  fallbackProviders: string[];
  outputMode: "json" | "text";
  timeoutMs?: number;
};

export type TaskRouterOptions = {
  routes?: Partial<Record<LLMTask, Omit<LLMTaskRoute, "task">>>;
};

export type TaskExecutionDeps = {
  executor?: (request: ChatCompletionRequest) => Promise<ChatCompletionResponse>;
};

const DEFAULT_TASK_ROUTES: Record<LLMTask, Omit<LLMTaskRoute, "task">> = {
  intent_classify: {
    model: "openai:gpt-4o-mini",
    primaryProvider: "openai",
    fallbackProviders: ["gemini", "anthropic"],
    outputMode: "json",
    timeoutMs: 8000,
  },
  contract_extract: {
    model: "openai:gpt-4.1",
    primaryProvider: "openai",
    fallbackProviders: ["anthropic", "gemini"],
    outputMode: "json",
    timeoutMs: 12000,
  },
  tenant_faq: {
    model: "openai:gpt-4o-mini",
    primaryProvider: "openai",
    fallbackProviders: ["gemini"],
    outputMode: "text",
    timeoutMs: 8000,
  },
  collections_message: {
    model: "openai:gpt-4o-mini",
    primaryProvider: "openai",
    fallbackProviders: ["gemini"],
    outputMode: "text",
    timeoutMs: 6000,
  },
  judge_policy: {
    model: "openai:gpt-4o-mini",
    primaryProvider: "openai",
    fallbackProviders: ["anthropic"],
    outputMode: "json",
    timeoutMs: 5000,
  },
};

function envBool(value: string | undefined, fallback: boolean) {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "on", "yes"].includes(normalized)) return true;
  if (["0", "false", "off", "no"].includes(normalized)) return false;
  return fallback;
}

export function isTaskRouterEnabled() {
  return envBool(process.env.LLM_TASK_ROUTER_ENABLED, false);
}

export function resolveTaskRoute(task: LLMTask, options?: TaskRouterOptions): LLMTaskRoute {
  const override = options?.routes?.[task];
  const base = DEFAULT_TASK_ROUTES[task];
  return {
    task,
    model: override?.model ?? base.model,
    primaryProvider: override?.primaryProvider ?? base.primaryProvider,
    fallbackProviders: override?.fallbackProviders ?? base.fallbackProviders,
    outputMode: override?.outputMode ?? base.outputMode,
    timeoutMs: override?.timeoutMs ?? base.timeoutMs,
  };
}

export async function runTaskWithFallback(
  task: LLMTask,
  request: ChatCompletionRequest,
  options?: TaskRouterOptions,
  deps?: TaskExecutionDeps
): Promise<ChatCompletionResponse> {
  if (!isTaskRouterEnabled()) {
    return runCompletion(request);
  }

  const route = resolveTaskRoute(task, options);
  const baseModel = stripProviderPrefix(route.model || request.model);
  const providers = [route.primaryProvider, ...route.fallbackProviders].filter(Boolean);
  const execute = deps?.executor ?? runCompletion;

  let lastError: unknown = null;
  for (let index = 0; index < providers.length; index += 1) {
    const provider = providers[index];
    try {
      return await execute({
        ...request,
        model: `${provider}:${baseModel}`,
        metadata: {
          ...(request.metadata ?? {}),
          llmTask: task,
          provider,
          fallbackAttempt: index,
        },
      });
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    `LLM_TASK_ROUTER_ALL_PROVIDERS_FAILED:${task}:${lastError instanceof Error ? lastError.message : String(lastError)}`
  );
}

