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

// Lista fechada de campos seguros para log de erro — nunca a mensagem, a
// stack ou o objeto bruto do provedor, que podem ecoar corpo de
// requisição/resposta. Cada campo é validado por FORMATO antes de ser
// aceito; fora do formato esperado vira `null`, nunca repassado como está
// (docs/architecture/radar-social-construction-plan-v1.md, Atualização
// 1.32, seção "Proteção de erros" — não confiar em campo pelo nome).
const ERROR_NAME_RE = /^[A-Za-z][A-Za-z0-9_.]{0,99}$/;
const PROVIDER_ERROR_CODE_RE = /^[a-z][a-z0-9_]{0,99}$/;
const PROVIDER_REQUEST_ID_RE = /^[A-Za-z0-9_-]{1,200}$/;

export interface SafeErrorFields {
  errorName: string | null;
  httpStatus: number | null;
  providerErrorCode: string | null;
  providerRequestId: string | null;
}

export function toSafeErrorFields(err: unknown): SafeErrorFields {
  const candidate = (err ?? {}) as Record<string, unknown>;
  const rawName = typeof candidate.name === "string" ? candidate.name : null;
  const rawStatus =
    typeof candidate.status === "number"
      ? candidate.status
      : typeof candidate.statusCode === "number"
        ? candidate.statusCode
        : null;
  const rawCode = typeof candidate.code === "string" ? candidate.code : null;
  const rawRequestId =
    typeof candidate.requestId === "string"
      ? candidate.requestId
      : typeof candidate.request_id === "string"
        ? (candidate.request_id as string)
        : null;

  return {
    errorName: rawName && ERROR_NAME_RE.test(rawName) ? rawName : null,
    httpStatus: rawStatus !== null && Number.isInteger(rawStatus) && rawStatus >= 100 && rawStatus <= 599 ? rawStatus : null,
    providerErrorCode: rawCode && PROVIDER_ERROR_CODE_RE.test(rawCode) ? rawCode : null,
    providerRequestId: rawRequestId && PROVIDER_REQUEST_ID_RE.test(rawRequestId) ? rawRequestId : null,
  };
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
    const retries = req.retries ?? readNumberFromEnv("LLM_RETRIES", 3);
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
        ...toSafeErrorFields(failure),
      },
      "llm.completion.error"
    );
    throw failure;
  }
}
