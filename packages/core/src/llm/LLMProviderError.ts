/** Internal failure contract shared by provider adapters, completion runtime and intake.
 * Never carries a raw response, provider message, prompt or authentication header.
 */
export type LLMFailureCategory = "financial_quota" | "rate_limit" | "authentication_permission" | "transient" | "invalid_response";

export type LLMFailureDiagnostic = {
  provider: string;
  model: string;
  category: LLMFailureCategory;
  retryable: boolean;
  interventionRequired: boolean;
  code?: string;
  providerType?: string;
  httpStatus?: number;
  providerRequestId?: string;
  traceId?: string;
};

// Only bounded identifiers belong in operator diagnostics; free text never does.
const identifier = (value: unknown) => typeof value === "string" && /^[\w.:-]{1,200}$/.test(value)
  && !/^(?:sk-|Bearer|gh[pousr]_)/i.test(value) ? value : undefined;

/** Operator-only diagnostics. Generic errors are classified by controlled execution stage,
 * never by copying their message, stack, arbitrary code or enumerable properties.
 * These codes do not change retry eligibility or public domain reason codes.
 */
export type LLMInternalStage = "profile_resolution" | "policy_check" | "provider_registration"
  | "provider_resolution" | "prompt_preparation" | "provider_execution" | "interpretation";
export function llmFailureDiagnostic(error: unknown, stage: LLMInternalStage) {
  return isLLMProviderError(error) ? error.diagnostic
    : { category: "internal" as const, code: `${stage}_failed` };
}

export const llmDiagnosticIdentifier = identifier;
const failureBrand = Symbol.for("eiah.llm.provider.failure.v1");

// Core entries are bundled separately; instanceof alone loses identity across entries.
export function isLLMProviderError(error: unknown): error is LLMProviderError {
  return error instanceof Error && (error as LLMProviderError)[failureBrand] === true;
}

export class LLMProviderError extends Error {
  readonly [failureBrand] = true;
  readonly diagnostic: Readonly<LLMFailureDiagnostic>;

  constructor(input: {
    provider: string; model: string; code?: unknown; providerType?: unknown;
    httpStatus?: number; providerRequestId?: unknown; traceId?: unknown;
    failure?: "transport" | "invalid_response";
  }) {
    const code = identifier(input.code);
    const providerType = identifier(input.providerType);
    const signals = [code, providerType];
    const status = input.httpStatus;
    // Structured financial/auth failures take precedence over the HTTP status (including 429).
    const category: LLMFailureCategory = signals.some((v) => v === "insufficient_quota" || v === "credit_balance_exhausted" || v === "billing_hard_limit_reached")
      ? "financial_quota"
      : signals.some((v) => v === "invalid_api_key" || v === "authentication_error" || v === "permission_denied" || v === "permission_error")
        || status === 401 || status === 403 ? "authentication_permission"
      : signals.some((v) => v === "rate_limit_exceeded" || v === "rate_limit_error") || status === 429 ? "rate_limit"
      : input.failure === "transport" || signals.some((v) => v === "server_error" || v === "overloaded_error")
        || status === 408 || (status !== undefined && status >= 500) ? "transient"
      : "invalid_response";
    super(`LLM provider failure: ${category}`);
    this.name = "LLMProviderError";
    this.diagnostic = Object.freeze({
      provider: input.provider, model: input.model, category,
      retryable: category === "transient" || category === "rate_limit",
      interventionRequired: category === "financial_quota" || category === "authentication_permission",
      ...(code ? { code } : {}), ...(providerType ? { providerType } : {}),
      ...(status !== undefined ? { httpStatus: status } : {}),
      ...(identifier(input.providerRequestId) ? { providerRequestId: identifier(input.providerRequestId) } : {}),
      ...(identifier(input.traceId) ? { traceId: identifier(input.traceId) } : {}),
    });
  }
}
