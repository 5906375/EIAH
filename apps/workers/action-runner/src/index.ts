import "dotenv/config";
import {
  consumeActions,
  createLogger,
  bindLogger,
  rateLimit,
  createFixedWindowRateLimiter,
  tenantRateLimitKey,
  recordGuardrailAudit,
  appendSignedHash,
} from "@eiah/core";
import { getPrismaForTenant } from "@repo/db";
import { tenantActionResolver } from "../../../api/src/actions/tenantActionRegistry";
import { pathToFileURL } from "node:url";
import crypto from "node:crypto";
import { executeWithMCP } from "./services/mcpAdapter";
import { mcpEnforcementConfigFromEnv, resolveMcpToolVersion } from "./services/mcpEnforcement";
import { evaluateTrustScore, trustScoreAllowsExecution } from "../../../api/src/services/trustScore";
import { evaluateIntent } from "../../../api/src/services/intentValidator";
import { evaluateHallucination } from "../../../api/src/services/judgeGate";

const runnerLogger = createLogger({ component: "action-runner" });
const judgeCache = new Map<string, { ts: number; result: { confidence: number; reasons: string[]; modelVersion?: string } }>();

function isNonRetryableMcpError(message: string) {
  return (
    message.startsWith("ToolContract missing:") ||
    message.startsWith("Invalid payload:") ||
    message.startsWith("Intent signature")
  );
}

function buildIntentSignature(params: {
  tenantId: string;
  workspaceId: string;
  runId: string;
  secret: string;
}) {
  const payload = `${params.tenantId}:${params.workspaceId}:${params.runId}`;
  return crypto.createHmac("sha256", params.secret).update(payload).digest("hex");
}

function verifyIntentSignature(params: {
  tenantId: string;
  workspaceId: string;
  runId?: string;
  metadata?: unknown;
}) {
  const secret = process.env.INTENT_SIGNATURE_SECRET;
  if (!secret) {
    throw new Error("Intent signature secret not configured");
  }
  if (!params.runId) {
    throw new Error("Intent signature missing runId");
  }

  const intentSignature =
    params.metadata && typeof params.metadata === "object" && !Array.isArray(params.metadata)
      ? String((params.metadata as Record<string, unknown>).intentSignature ?? "")
      : "";
  if (!intentSignature) {
    throw new Error("Intent signature missing");
  }

  const expected = buildIntentSignature({
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    runId: params.runId,
    secret,
  });

  const receivedBuffer = Buffer.from(intentSignature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  if (
    receivedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(receivedBuffer, expectedBuffer)
  ) {
    throw new Error("Intent signature invalid");
  }
}

type ActionRunnerDeps = {
  consumeActions: typeof consumeActions;
  getPrismaForTenant: typeof getPrismaForTenant;
  tenantActionResolver: typeof tenantActionResolver;
  executeWithMCP: typeof executeWithMCP;
  mcpEnforcementConfigFromEnv: typeof mcpEnforcementConfigFromEnv;
  resolveMcpToolVersion: typeof resolveMcpToolVersion;
  evaluateTrustScore: typeof evaluateTrustScore;
  trustScoreAllowsExecution: typeof trustScoreAllowsExecution;
  evaluateIntent: typeof evaluateIntent;
  evaluateHallucination: typeof evaluateHallucination;
  rateLimit: typeof rateLimit;
  createFixedWindowRateLimiter: typeof createFixedWindowRateLimiter;
  tenantRateLimitKey: typeof tenantRateLimitKey;
  recordGuardrailAudit: typeof recordGuardrailAudit;
  appendSignedHash: typeof appendSignedHash;
};

const defaultDeps: ActionRunnerDeps = {
  consumeActions,
  getPrismaForTenant,
  tenantActionResolver,
  executeWithMCP,
  mcpEnforcementConfigFromEnv,
  resolveMcpToolVersion,
  evaluateTrustScore,
  trustScoreAllowsExecution,
  evaluateIntent,
  evaluateHallucination,
  rateLimit,
  createFixedWindowRateLimiter,
  tenantRateLimitKey,
  recordGuardrailAudit,
  appendSignedHash,
};

async function enforceTrustGateBeforeMcp(
  deps: Pick<ActionRunnerDeps, "evaluateTrustScore" | "trustScoreAllowsExecution" | "recordGuardrailAudit">,
  params: {
    prisma: ReturnType<typeof getPrismaForTenant>;
    tenantId: string;
    workspaceId: string;
    runId?: string;
    action: string;
    version: string;
    stepId?: string;
  }
) {
  const thresholdRaw = process.env.TRUST_SCORE_THRESHOLD;
  const threshold = thresholdRaw ? Number(thresholdRaw) : 40;
  const trustReport = await deps.evaluateTrustScore(params.prisma, params.tenantId, params.workspaceId);

  if (deps.trustScoreAllowsExecution(trustReport, Number.isFinite(threshold) ? threshold : 40)) {
    return null;
  }

  const message = `Trust score too low (${trustReport.score} < ${Number.isFinite(threshold) ? threshold : 40})`;
  await deps.recordGuardrailAudit({
    prisma: params.prisma as any,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    runId: params.runId ?? null,
    eventType: "trust.gate.blocked",
    severity: "warn",
    message,
    metadata: {
      action: params.action,
      version: params.version,
      stepId: params.stepId,
      trustScore: trustReport.score,
      trustLevel: trustReport.level,
    },
  });

  return { status: "error" as const, error: message, retryable: false as const };
}

function getIntentPrompt(payload: { action?: string; metadata?: unknown; input?: unknown }) {
  if (payload.metadata && typeof payload.metadata === "object" && !Array.isArray(payload.metadata)) {
    const metadata = payload.metadata as Record<string, unknown>;
    const intent = metadata.intent as Record<string, unknown> | undefined;
    if (intent && typeof intent.purpose === "string" && intent.purpose.trim()) {
      return intent.purpose.trim();
    }
  }

  if (payload.input && typeof payload.input === "object" && !Array.isArray(payload.input)) {
    const input = payload.input as Record<string, unknown>;
    if (typeof input.prompt === "string" && input.prompt.trim()) {
      return input.prompt.trim();
    }
  }

  return payload.action ?? "action";
}

async function enforceIntentGateBeforeMcp(
  deps: Pick<ActionRunnerDeps, "evaluateIntent" | "recordGuardrailAudit">,
  params: {
    prisma: ReturnType<typeof getPrismaForTenant>;
    tenantId: string;
    workspaceId: string;
    runId?: string;
    action: string;
    version: string;
    stepId?: string;
    metadata?: Record<string, unknown>;
    input?: unknown;
  }
) {
  const modeRaw = (process.env.INTENT_VALIDATOR_MODE ?? "enforce").trim().toLowerCase();
  const mode = modeRaw === "enforce" ? "enforce" : "observe";
  const thresholdRaw = process.env.INTENT_VALIDATION_THRESHOLD;
  const threshold = thresholdRaw ? Number(thresholdRaw) : undefined;
  const prompt = getIntentPrompt({ action: params.action, metadata: params.metadata, input: params.input });
  const result = await deps.evaluateIntent({
    prompt,
    metadata: params.metadata ?? {},
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    runId: params.runId,
    prisma: params.prisma as any,
    mode,
    threshold,
  });

  if (mode === "observe") {
    await deps.recordGuardrailAudit({
      prisma: params.prisma as any,
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      runId: params.runId ?? null,
      eventType: "intent.validation.observe",
      severity: "info",
      message: "Intent evaluated in observe mode.",
      metadata: {
        action: params.action,
        version: params.version,
        stepId: params.stepId,
        score: result.score,
        flags: result.flags,
      },
    });
    return null;
  }

  if (result.verdict !== "block") {
    await deps.recordGuardrailAudit({
      prisma: params.prisma as any,
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      runId: params.runId ?? null,
      eventType: "intent.validation.allowed",
      severity: "info",
      message: "Intent validated in enforce mode.",
      metadata: {
        action: params.action,
        version: params.version,
        stepId: params.stepId,
        score: result.score,
        flags: result.flags,
      },
    });
    return null;
  }

  const message = `Intent blocked (score ${result.score})`;
  await deps.recordGuardrailAudit({
    prisma: params.prisma as any,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    runId: params.runId ?? null,
    eventType: "intent.validation.blocked",
    severity: "warn",
    message,
    metadata: {
      action: params.action,
      version: params.version,
      stepId: params.stepId,
      score: result.score,
      flags: result.flags,
    },
  });

  return { status: "error" as const, error: message, retryable: false as const };
}

async function enforceJudgeGateBeforeMcp(
  deps: Pick<ActionRunnerDeps, "evaluateHallucination" | "recordGuardrailAudit">,
  params: {
    prisma: ReturnType<typeof getPrismaForTenant>;
    tenantId: string;
    workspaceId: string;
    runId?: string;
    action: string;
    version: string;
    stepId?: string;
    trustLevel: number;
    metadata?: Record<string, unknown>;
    input?: unknown;
  }
) {
  const modeRaw = (process.env.JUDGE_MODE ?? "shadow").trim().toLowerCase();
  const mode = modeRaw === "enforce" ? "enforce" : "shadow";
  const thresholdRaw = process.env.JUDGE_THRESHOLD;
  const threshold = thresholdRaw ? Number(thresholdRaw) : 0.8;
  const timeoutRaw = process.env.JUDGE_TIMEOUT_MS;
  const timeoutMs = timeoutRaw ? Number(timeoutRaw) : 1000;
  const minTrustRaw = process.env.JUDGE_MIN_TRUST_LEVEL;
  const minTrustLevel = minTrustRaw ? Number(minTrustRaw) : 80;
  const sampleRaw = process.env.JUDGE_SAMPLE_RATE;
  const sampleRate = sampleRaw ? Number(sampleRaw) : 1;
  const cacheTtlRaw = process.env.JUDGE_CACHE_TTL_MS;
  const cacheTtlMs = cacheTtlRaw ? Number(cacheTtlRaw) : 300000;

  if (params.trustLevel < (Number.isFinite(minTrustLevel) ? minTrustLevel : 80)) {
    await deps.recordGuardrailAudit({
      prisma: params.prisma as any,
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      runId: params.runId ?? null,
      eventType: "judge.shadow.skipped",
      severity: "info",
      message: "Judge skipped for low-trust tool.",
      metadata: {
        action: params.action,
        version: params.version,
        stepId: params.stepId,
        trustLevel: params.trustLevel,
        minTrustLevel: Number.isFinite(minTrustLevel) ? minTrustLevel : 80,
        mode,
      },
    });
    return null;
  }

  if (sampleRate < 1 && Math.random() > sampleRate) {
    await deps.recordGuardrailAudit({
      prisma: params.prisma as any,
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      runId: params.runId ?? null,
      eventType: "judge.shadow.skipped",
      severity: "info",
      message: "Judge skipped by sampling.",
      metadata: {
        action: params.action,
        version: params.version,
        stepId: params.stepId,
        sampleRate,
        mode,
      },
    });
    return null;
  }

  try {
    const cacheKey = `${params.runId ?? "run"}:${params.stepId ?? "step"}:${params.action}:${params.version}`;
    const cached = judgeCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < (Number.isFinite(cacheTtlMs) ? cacheTtlMs : 300000)) {
      const evaluation = cached.result;
      if (mode === "shadow") {
        await deps.recordGuardrailAudit({
          prisma: params.prisma as any,
          tenantId: params.tenantId,
          workspaceId: params.workspaceId,
          runId: params.runId ?? null,
          eventType: "judge.shadow.observed",
          severity: "info",
          message: "Judge evaluated in shadow mode (cache).",
          metadata: {
            action: params.action,
            version: params.version,
            stepId: params.stepId,
            confidence: evaluation.confidence,
            threshold: Number.isFinite(threshold) ? threshold : 0.8,
            mode,
            reasons: evaluation.reasons,
            modelVersion: evaluation.modelVersion ?? null,
            cached: true,
          },
        });
        return null;
      }

      if (evaluation.confidence > (Number.isFinite(threshold) ? threshold : 0.8)) {
        await deps.recordGuardrailAudit({
          prisma: params.prisma as any,
          tenantId: params.tenantId,
          workspaceId: params.workspaceId,
          runId: params.runId ?? null,
          eventType: "judge.execution.allowed",
          severity: "info",
          message: "Judge allowed execution (cache).",
          metadata: {
            action: params.action,
            version: params.version,
            stepId: params.stepId,
            confidence: evaluation.confidence,
            threshold: Number.isFinite(threshold) ? threshold : 0.8,
            mode,
            reasons: evaluation.reasons,
            modelVersion: evaluation.modelVersion ?? null,
            cached: true,
          },
        });
        return null;
      }

      const message = `Judge blocked (confidence ${evaluation.confidence} <= ${Number.isFinite(threshold) ? threshold : 0.8})`;
      await deps.recordGuardrailAudit({
        prisma: params.prisma as any,
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        runId: params.runId ?? null,
        eventType: "judge.execution.blocked",
        severity: "warn",
        message,
        metadata: {
          action: params.action,
          version: params.version,
          stepId: params.stepId,
          confidence: evaluation.confidence,
          threshold: Number.isFinite(threshold) ? threshold : 0.8,
          mode,
          reasons: evaluation.reasons,
          modelVersion: evaluation.modelVersion ?? null,
          cached: true,
        },
      });

      return { status: "error" as const, error: message, retryable: false as const };
    }

    const evaluation = await Promise.race([
      deps.evaluateHallucination({
        action: params.action,
        input: params.input,
        metadata: params.metadata ?? {},
        toolVersion: params.version,
      }),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Judge timeout")), Number.isFinite(timeoutMs) ? timeoutMs : 1000);
      }),
    ]);

    judgeCache.set(cacheKey, { ts: Date.now(), result: evaluation });

    if (mode === "shadow") {
      await deps.recordGuardrailAudit({
        prisma: params.prisma as any,
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        runId: params.runId ?? null,
        eventType: "judge.shadow.observed",
        severity: "info",
        message: "Judge evaluated in shadow mode.",
        metadata: {
          action: params.action,
          version: params.version,
          stepId: params.stepId,
          confidence: evaluation.confidence,
          threshold: Number.isFinite(threshold) ? threshold : 0.8,
          mode,
          reasons: evaluation.reasons,
          modelVersion: evaluation.modelVersion ?? null,
          cached: false,
        },
      });
      return null;
    }

    if (evaluation.confidence > (Number.isFinite(threshold) ? threshold : 0.8)) {
      await deps.recordGuardrailAudit({
        prisma: params.prisma as any,
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        runId: params.runId ?? null,
        eventType: "judge.execution.allowed",
        severity: "info",
        message: "Judge allowed execution.",
        metadata: {
          action: params.action,
          version: params.version,
          stepId: params.stepId,
          confidence: evaluation.confidence,
        threshold: Number.isFinite(threshold) ? threshold : 0.8,
        mode,
        reasons: evaluation.reasons,
        modelVersion: evaluation.modelVersion ?? null,
        cached: false,
      },
    });
    return null;
  }

    const message = `Judge blocked (confidence ${evaluation.confidence} <= ${
      Number.isFinite(threshold) ? threshold : 0.8
    })`;
    await deps.recordGuardrailAudit({
      prisma: params.prisma as any,
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      runId: params.runId ?? null,
      eventType: "judge.execution.blocked",
      severity: "warn",
      message,
      metadata: {
        action: params.action,
        version: params.version,
        stepId: params.stepId,
        confidence: evaluation.confidence,
      threshold: Number.isFinite(threshold) ? threshold : 0.8,
      mode,
      reasons: evaluation.reasons,
      modelVersion: evaluation.modelVersion ?? null,
      cached: false,
    },
  });

    return { status: "error" as const, error: message, retryable: false as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await deps.recordGuardrailAudit({
      prisma: params.prisma as any,
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      runId: params.runId ?? null,
      eventType: "judge.error",
      severity: "error",
      message,
      metadata: {
        action: params.action,
        version: params.version,
        stepId: params.stepId,
        trustLevel: params.trustLevel,
        mode,
      },
    });

    const failClosedLevelRaw = process.env.JUDGE_FAIL_CLOSED_TRUST_LEVEL;
    const failClosedLevel = failClosedLevelRaw ? Number(failClosedLevelRaw) : 80;
    if (mode === "enforce" && params.trustLevel >= (Number.isFinite(failClosedLevel) ? failClosedLevel : 80)) {
      return {
        status: "error" as const,
        error: "Judge failed; execution blocked for high-trust tool.",
        retryable: false as const,
      };
    }

    return null;
  }
}

export function createActionRunnerHandler(deps: ActionRunnerDeps = defaultDeps) {
  return async (payload: any, job: any) => {
    const tenantId = payload.tenantId;
    const workspaceId = payload.workspaceId;

    if (!tenantId || !workspaceId) {
      runnerLogger.error({ payload }, "action.missing_tenant_or_workspace");
      throw new Error(`Tenant or workspace missing for action ${payload.action}`);
    }

    const jobLogger = bindLogger(runnerLogger, {
      jobId: job.id,
      actionKind: payload.action,
      runId: payload.runId,
      tenantId,
      workspaceId,
      stepId: payload.stepId,
    });

    jobLogger.info("action.received");

    const allowedActions = deps.tenantActionResolver(tenantId);
    if (!allowedActions[payload.action]) {
      const errorResult = {
        status: "error" as const,
        error: `Action "${payload.action}" is not allowed for tenant ${tenantId}`,
        retryable: false as const,
      };
      jobLogger.error({ error: errorResult.error }, "action.rejected");
      return errorResult;
    }

    try {
      verifyIntentSignature({
        tenantId,
        workspaceId,
        runId: payload.runId,
        metadata: payload.metadata,
      });
    } catch (signatureError) {
      const message =
        signatureError instanceof Error ? signatureError.message : String(signatureError);
      jobLogger.error({ message }, "action.intent_signature.rejected");
      return { status: "error" as const, error: message, retryable: false as const };
    }

    let prisma;
    try {
      prisma = deps.getPrismaForTenant(tenantId, workspaceId);
    } catch (err) {
      jobLogger.error({ err }, "action.prisma_init_failed");
      throw err;
    }

    const mcpConfig = deps.mcpEnforcementConfigFromEnv();
    const toolVersion = deps.resolveMcpToolVersion(payload.metadata, mcpConfig.defaultVersion);

    try {
      const rateLimitGuard = deps.rateLimit({
        limiter: deps.createFixedWindowRateLimiter({
          limit: 50,
          windowMs: 1_000,
        }),
        keyResolver: (context) => deps.tenantRateLimitKey(context.tenantId, context.workspaceId, context.action),
      });
      if (rateLimitGuard.before) {
        await rateLimitGuard.before({
        action: payload.action,
        tenantId,
        workspaceId: payload.workspaceId,
        runId: payload.runId,
        stepId: payload.stepId,
        logger: (event, data) => jobLogger.info({ event, payload: data }, "action.rateLimit"),
      });
      }

      if (!mcpConfig.enabled) {
        const message = "MCP enforcement disabled (MCP_ENFORCE_CONTRACTS=false)";
        jobLogger.error({ message }, "action.mcp.disabled");
        return {
          status: "error" as const,
          error: message,
          retryable: false as const,
        };
      }

      const toolContract = await prisma.toolContract.findFirst({
        where: {
          tenantId,
          name: payload.action,
          version: toolVersion,
          status: "active",
        },
      });
      if (!toolContract) {
        const message = `ToolContract missing: ${payload.action}@${toolVersion}`;
        jobLogger.error({ message }, "action.mcp.contract_missing");
        await recordGuardrailAudit({
          prisma: prisma as any,
          tenantId,
          workspaceId,
          runId: payload.runId ?? null,
          eventType: "mcp.tool.missing_contract",
          severity: "warn",
          message,
          metadata: {
            action: payload.action,
            version: toolVersion,
            stepId: payload.stepId,
          },
        });
        return { status: "error" as const, error: message, retryable: false as const };
      }

      const intentGateResult = await enforceIntentGateBeforeMcp(
        {
          evaluateIntent: deps.evaluateIntent,
          recordGuardrailAudit: deps.recordGuardrailAudit,
        },
        {
          prisma,
          tenantId,
          workspaceId,
          runId: payload.runId,
          action: payload.action,
          version: toolVersion,
          stepId: payload.stepId,
          metadata: payload.metadata ?? {},
          input: payload.input,
        }
      );
      if (intentGateResult) {
        jobLogger.warn({ message: intentGateResult.error }, "action.intent_gate.blocked");
        return intentGateResult;
      }

      const trustGateResult = await enforceTrustGateBeforeMcp(
        {
          evaluateTrustScore: deps.evaluateTrustScore,
          trustScoreAllowsExecution: deps.trustScoreAllowsExecution,
          recordGuardrailAudit: deps.recordGuardrailAudit,
        },
        {
          prisma,
          tenantId,
          workspaceId,
          runId: payload.runId,
          action: payload.action,
          version: toolVersion,
          stepId: payload.stepId,
        }
      );
      if (trustGateResult) {
        jobLogger.warn({ message: trustGateResult.error }, "action.trust_gate.blocked");
        return trustGateResult;
      }

      const judgeGateResult = await enforceJudgeGateBeforeMcp(
        {
          evaluateHallucination: deps.evaluateHallucination,
          recordGuardrailAudit: deps.recordGuardrailAudit,
        },
        {
          prisma,
          tenantId,
          workspaceId,
          runId: payload.runId,
          action: payload.action,
          version: toolVersion,
          stepId: payload.stepId,
          trustLevel: toolContract.trustLevel,
          metadata: payload.metadata ?? {},
          input: payload.input,
        }
      );
      if (judgeGateResult) {
        jobLogger.warn({ message: judgeGateResult.error }, "action.judge_gate.blocked");
        return judgeGateResult;
      }

      const { result: mcpResult, tool, hash } = await deps.executeWithMCP({
        prisma: prisma as any,
        tenantId,
        workspaceId,
        runId: payload.runId,
        actionName: payload.action,
        version: toolVersion,
        payload: payload.input ?? {},
      });

      jobLogger.info(
        {
          action: payload.action,
          version: toolVersion,
          trustLevel: tool.trustLevel,
          hash,
        },
        "action.mcp.executed"
      );

      const actionDefinition = allowedActions[payload.action];
      const criticality = actionDefinition?.criticality ?? "low";
      if ((criticality === "high" || criticality === "critical") && payload.runId) {
        try {
          await deps.appendSignedHash({
            prisma: prisma as any,
            tenantId,
            workspaceId,
            runId: payload.runId,
            payload: {
              action: payload.action,
              version: toolVersion,
              input: payload.input ?? null,
              output: mcpResult ?? null,
              mcpHash: hash,
              toolTrustLevel: tool.trustLevel,
            },
            riskLevel: criticality,
          });
          jobLogger.info({ action: payload.action, criticality }, "action.scl.recorded");
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          jobLogger.warn({ message, action: payload.action, criticality }, "action.scl.failed");
        }
      }

      jobLogger.info("action.completed");
      return { status: "success" as const, output: mcpResult };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const retryable = !isNonRetryableMcpError(message);

      jobLogger.error({ err: error, message, retryable }, "action.mcp.failed");

      try {
        await deps.recordGuardrailAudit({
          prisma: prisma as any,
          tenantId,
          workspaceId,
          runId: payload.runId ?? null,
          eventType: message.startsWith("ToolContract missing:") ? "mcp.tool.missing_contract" : "mcp.tool.failed",
          severity: retryable ? "error" : "warn",
          message,
          metadata: {
            action: payload.action,
            version: toolVersion,
            stepId: payload.stepId,
          },
        });
      } catch (auditError) {
        jobLogger.warn({ err: auditError }, "action.mcp.audit_failed");
      }

      if (retryable) {
        throw new Error(message);
      }

      return { status: "error" as const, error: message, retryable: false as const };
    } finally {
      await prisma.$disconnect();
    }
  };
}

export async function startActionRunner() {
  runnerLogger.info("action-runner.starting");
  const handler = createActionRunnerHandler(defaultDeps);
  return defaultDeps.consumeActions(handler);
}

function isMainModule() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    const entryUrl = pathToFileURL(entry);
    return import.meta.url === entryUrl.href;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  startActionRunner().catch((error) => {
    runnerLogger.error(
      {
        err: error,
      },
      "action-runner.failed"
    );
    process.exit(1);
  });
}
