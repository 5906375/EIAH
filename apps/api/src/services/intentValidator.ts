import { Prisma } from "@repo/db";
import type { PrismaClient } from "@repo/db/client";
import crypto from "node:crypto";
import { z } from "zod";

const IntentSchema = z.object({
  purpose: z.string().min(3).max(500),
  sensitivity: z.enum(["low", "medium", "high"]).optional().default("medium"),
  requiresPii: z.boolean().optional().default(false),
  channel: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

export type IntentEvaluation = {
  intent: z.infer<typeof IntentSchema> | null;
  score: number;
  flags: string[];
  verdict: "observe" | "allow" | "block";
  signature?: string | null;
};

export type IntentValidatorMode = "observe" | "enforce";

export function assertGovernanceEnv() {
  const missing: string[] = [];

  if (!process.env.INTENT_SIGNATURE_SECRET) {
    missing.push("INTENT_SIGNATURE_SECRET");
  }

  const enforceRaw = (process.env.MCP_ENFORCE_CONTRACTS ?? "true").trim().toLowerCase();
  const enforceEnabled = enforceRaw === "1" || enforceRaw === "true" || enforceRaw === "on";
  if (!enforceEnabled) {
    missing.push("MCP_ENFORCE_CONTRACTS");
  }

  const proxyRaw = (process.env.MCP_PROXY_ALL_ACTIONS ?? "false").trim().toLowerCase();
  const proxyEnabled = proxyRaw === "1" || proxyRaw === "true" || proxyRaw === "on";
  if (!proxyEnabled) {
    missing.push("MCP_PROXY_ALL_ACTIONS");
  }

  const outboxRaw = (process.env.RUN_EVENTS_USE_OUTBOX ?? "false").trim().toLowerCase();
  const outboxEnabled = outboxRaw === "1" || outboxRaw === "true" || outboxRaw === "on";
  if (!outboxEnabled) {
    missing.push("RUN_EVENTS_USE_OUTBOX");
  }

  const redisUrl = process.env.RUN_EVENTS_REDIS_URL || process.env.REDIS_URL;
  if (outboxEnabled && !redisUrl) {
    missing.push("REDIS_URL");
  }

  if (missing.length > 0) {
    throw new Error(`Governance envs missing/disabled: ${missing.join(", ")}`);
  }
}

type EvaluateIntentParams = {
  prompt: string;
  metadata?: Record<string, unknown>;
  tenantId: string;
  workspaceId: string;
  runId?: string;
  prisma: PrismaClient;
  mode?: IntentValidatorMode;
  threshold?: number;
};

export async function evaluateIntent(params: EvaluateIntentParams): Promise<IntentEvaluation> {
  const { prompt, metadata, prisma, tenantId, workspaceId, runId } = params;
  const mode = params.mode ?? "enforce";
  const threshold = Number.isFinite(params.threshold ?? NaN) ? (params.threshold as number) : 0.5;

  const parsed = IntentSchema.safeParse((metadata as any)?.intent ?? {});
  const intent: z.infer<typeof IntentSchema> = parsed.success
    ? parsed.data
    : { purpose: prompt.slice(0, 240), sensitivity: "medium", requiresPii: false, metadata: undefined, channel: undefined };

  const flags: string[] = [];
  const lowerPrompt = prompt.toLowerCase();

  if (lowerPrompt.includes("payment") || lowerPrompt.includes("transfer")) {
    flags.push("finance:payment_intent");
  }
  if (lowerPrompt.includes("password") || lowerPrompt.includes("secret")) {
    flags.push("security:secret_reference");
  }
  if (lowerPrompt.includes("pii") || intent.requiresPii) {
    flags.push("privacy:pii_possible");
  }

  const scoreBase = intent.sensitivity === "high" ? 0.3 : intent.sensitivity === "low" ? 0.8 : 0.6;
  const score = Math.max(0, Math.min(1, scoreBase - flags.length * 0.1));

  // Modo observação: nunca bloqueia, apenas registra no GuardrailLedger
  try {
    const criticalHash = crypto
      .createHash("sha256")
      .update(
        JSON.stringify({
          event: "intent.validation",
          tenantId,
          workspaceId,
          runId,
          timestamp: new Date().toISOString(),
        })
      )
      .digest("hex");
    await prisma.guardrailLedger.create({
      data: {
        tenantId,
        runId: runId ?? null,
        actionType: "intent.validation",
        criticalHash,
      },
    });
  } catch (error) {
    const code = (error as Prisma.PrismaClientKnownRequestError | null)?.code;
    if (code !== "P2002") {
      console.warn("intentValidator.guardrail_ledger_error", error);
    }
  }

  const verdict: IntentEvaluation["verdict"] =
    mode === "enforce" ? (score < threshold ? "block" : "allow") : "observe";

  return {
    intent,
    score,
    flags,
    verdict,
    signature: createIntentSignature({ tenantId, workspaceId, runId }),
  };
}

function createIntentSignature(params: {
  tenantId: string;
  workspaceId: string;
  runId?: string;
}) {
  if (!params.runId) return null;
  const secret = process.env.INTENT_SIGNATURE_SECRET;
  if (!secret) return null;
  const payload = `${params.tenantId}:${params.workspaceId}:${params.runId}`;
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}
