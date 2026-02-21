import crypto from "node:crypto";

export type LLMAuditMetadata = {
  task?: string;
  provider: string;
  model: string;
  traceId?: string;
  promptHash: string;
  outputHash: string;
  latencyMs: number;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  costCents?: number;
  fallbackAttempt?: number;
  cacheHit?: boolean;
  timestamp: string;
};

function hashText(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function buildLLMAuditMetadata(params: {
  task?: string;
  provider: string;
  model: string;
  prompt: string;
  output: string;
  latencyMs: number;
  traceId?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  costCents?: number;
  fallbackAttempt?: number;
  cacheHit?: boolean;
}): LLMAuditMetadata {
  return {
    task: params.task,
    provider: params.provider,
    model: params.model,
    traceId: params.traceId,
    promptHash: hashText(params.prompt),
    outputHash: hashText(params.output),
    latencyMs: params.latencyMs,
    usage: params.usage,
    costCents: params.costCents,
    fallbackAttempt: params.fallbackAttempt,
    cacheHit: params.cacheHit,
    timestamp: new Date().toISOString(),
  };
}

