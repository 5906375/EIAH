import { createLogger } from "../logging";
import { retry, RetryExhaustedError } from "../utils/retry";
import { isLLMProviderError, llmFailureDiagnostic, llmDiagnosticIdentifier, type LLMInternalStage } from "./LLMProviderError";
import { withTimeout } from "../utils/timeout";
import { normalizeMessages } from "../utils/normalizeMessages";
import { resolveProvider, stripProviderPrefix } from "./LLMRouter";
import type { ChatCompletionRequest, ChatCompletionResponse } from "./types";

const logger = createLogger({ component: "llm" });

function readNumberFromEnv(key: string, fallback: number) {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function runCompletion(req: ChatCompletionRequest): Promise<ChatCompletionResponse> {
  const startedAt = Date.now();
  const traceId = llmDiagnosticIdentifier(req.metadata?.traceId);
  const diagnostic = req.metadata?.source === "imob-property-capture-intake";
  let stage: LLMInternalStage = "provider_resolution";
  let selectedProvider: string | undefined;
  let attempt = 0;

  try {
    if (diagnostic) logger.info({ stage, traceId, modelRequested: llmDiagnosticIdentifier(req.model),
      providerRequested: llmDiagnosticIdentifier(req.metadata?.provider) }, "llm.completion.resolve");
    const provider = resolveProvider(req);
    selectedProvider = provider.name;
    const model = stripProviderPrefix(req.model);
    const messages = normalizeMessages(req.messages);
    stage = "provider_execution";
    logger.info({ provider: provider.name, model, traceId }, "llm.completion.start");
    const timeoutMs = readNumberFromEnv("LLM_TIMEOUT_MS", 15000);
    const retries = req.transportPolicy === "imob_guided_single_attempt" ? 1 : readNumberFromEnv("LLM_RETRIES", 3);
    const baseDelayMs = readNumberFromEnv("LLM_RETRY_DELAY_MS", 150);
    const maxDelayMs = readNumberFromEnv("LLM_RETRY_MAX_DELAY_MS", 2000);
    const backoffFactor = readNumberFromEnv("LLM_RETRY_BACKOFF_FACTOR", 1.6);
    const jitterRatio = readNumberFromEnv("LLM_RETRY_JITTER_RATIO", 0.3);

    logger.info(
      {
        provider: provider.name,
        model,
        timeoutMs,
        traceId,
        retries,
        baseDelayMs,
        maxDelayMs,
        backoffFactor,
        jitterRatio,
      },
      "llm.completion.retry_config"
    );

    const result = await retry(
      () => {
        attempt++;
        // Adapter dispatch is not evidence of a physical network attempt.
        if (diagnostic) logger.info({ stage: "adapter_dispatch", provider: provider.name, model, traceId, attempt }, "llm.completion.attempt");
        return withTimeout(provider.chatCompletion({ ...req, model, messages,
          ...(diagnostic ? { metadata: { ...req.metadata, llmAttempt: attempt } } : {}) }), timeoutMs);
      },
      {
        retries,
        delayMs: baseDelayMs,
        maxDelayMs,
        backoffFactor,
        jitterRatio,
        shouldRetry: (error) => !isLLMProviderError(error) || error.diagnostic.retryable,
      }
    );

    logger.info(
      {
        provider: provider.name,
        model,
        latencyMs: Date.now() - startedAt,
        traceId,
        completionId: result.completionId,
        providerRequestId: result.providerRequestId,
        ...(diagnostic ? { stage: "completion", attempt, modelUsed: result.modelUsed } : {}),
      },
      "llm.completion.success"
    );

    return result;
  } catch (err) {
    const failure = err instanceof RetryExhaustedError && isLLMProviderError(err.cause) ? err.cause : err;
    logger.error(
      {
        provider: selectedProvider,
        modelRequested: llmDiagnosticIdentifier(req.model),
        latencyMs: Date.now() - startedAt,
        traceId,
        stage,
        attempt,
        failure: llmFailureDiagnostic(failure, stage),
      },
      "llm.completion.error"
    );
    throw failure;
  }
}
