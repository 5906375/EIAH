import { createLogger } from "../logging";
import { retry } from "../utils/retry";
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
  const provider = resolveProvider(req);
  const model = stripProviderPrefix(req.model);
  const messages = normalizeMessages(req.messages);
  const startedAt = Date.now();
  const traceId =
    typeof req.metadata?.traceId === "string" && req.metadata.traceId.trim()
      ? req.metadata.traceId.trim()
      : undefined;

  logger.info(
    {
      provider: provider.name,
      model,
    },
    "llm.completion.start"
  );

  try {
    const timeoutMs = readNumberFromEnv("LLM_TIMEOUT_MS", 15000);
    const retries = readNumberFromEnv("LLM_RETRIES", 3);
    const baseDelayMs = readNumberFromEnv("LLM_RETRY_DELAY_MS", 150);
    const maxDelayMs = readNumberFromEnv("LLM_RETRY_MAX_DELAY_MS", 2000);
    const backoffFactor = readNumberFromEnv("LLM_RETRY_BACKOFF_FACTOR", 1.6);
    const jitterRatio = readNumberFromEnv("LLM_RETRY_JITTER_RATIO", 0.3);

    logger.info(
      {
        provider: provider.name,
        model,
        timeoutMs,
        retries,
        baseDelayMs,
        maxDelayMs,
        backoffFactor,
        jitterRatio,
      },
      "llm.completion.retry_config"
    );

    const result = await retry(
      () => withTimeout(provider.chatCompletion({ ...req, model, messages }), timeoutMs),
      {
        retries,
        delayMs: baseDelayMs,
        maxDelayMs,
        backoffFactor,
        jitterRatio,
      }
    );

    logger.info(
      {
        provider: provider.name,
        model,
        latencyMs: Date.now() - startedAt,
        traceId: traceId ?? result.id,
      },
      "llm.completion.success"
    );

    return result;
  } catch (err) {
    logger.error(
      {
        provider: provider.name,
        model,
        latencyMs: Date.now() - startedAt,
        traceId,
        err,
      },
      "llm.completion.error"
    );
    throw err;
  }
}
