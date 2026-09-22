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
        ...toSafeErrorFields(err),
      },
      "llm.completion.error"
    );
    throw err;
  }
}
