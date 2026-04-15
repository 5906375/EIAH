import type { Run } from "./api";

export type ImobRunContext = {
  caseId: string | null;
  threadId: string | null;
  conversationId: string | null;
};

export function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function getStringValue(
  value: unknown,
  options?: {
    treatLiteralNullish?: boolean;
  }
): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (options?.treatLiteralNullish) {
    const lower = normalized.toLowerCase();
    if (lower === "null" || lower === "undefined") return null;
  }
  return normalized;
}

export function extractImobContextFromRun(
  run: Run | null,
  options?: {
    treatLiteralNullish?: boolean;
  }
): ImobRunContext {
  const readString = (value: unknown) => getStringValue(value, options);
  const explicitCaseId = readString(run?.caseId);
  const explicitThreadId = readString(run?.threadId);
  const request = getRecord(run?.request);
  const requestMetadata = getRecord(request?.metadata);
  const requestInput = getRecord(request?.input);
  const meta = getRecord(run?.meta);
  const nestedMeta = getRecord(meta?.metadata);
  const caseId =
    explicitCaseId ??
    readString(request?.caseId) ??
    readString(requestInput?.caseId) ??
    readString(requestMetadata?.caseId) ??
    readString(meta?.caseId) ??
    readString(nestedMeta?.caseId) ??
    null;
  const threadId =
    explicitThreadId ??
    readString(request?.threadId) ??
    readString(requestInput?.threadId) ??
    readString(requestMetadata?.threadId) ??
    readString(meta?.threadId) ??
    readString(nestedMeta?.threadId) ??
    null;
  const conversationId =
    readString(request?.conversationId) ??
    readString(requestMetadata?.conversationId) ??
    readString(meta?.conversationId) ??
    readString(nestedMeta?.conversationId) ??
    null;
  return { caseId, threadId, conversationId };
}
