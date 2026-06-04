import { Buffer } from "node:buffer";
import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { enforceTenant, TenantAwareRequest } from "../middlewares/enforceTenant";
import { getAgentProfile, resolveAgentId } from "../services/agents";
import { publishRun } from "@eiah/core";
import { evaluateTrustScore, trustScoreAllowsExecution } from "../services/trustScore";
import { evaluateIntent } from "../services/intentValidator";
import { createGuardrailLedgerStore } from "../services/guardrailLedgerStore";
import { estimateCostCents } from "../services/billing";
import { createRunRecord, getRun, listRuns } from "../services/runs";
import { getAgentRecommendationState, saveAgentRecommendationState } from "../services/recommendations";
import { listRunEvents } from "../services/runEvents";
import { emitRunEvent } from "../services/runEventEmitter";
import { subscribeToRunEventStream } from "../services/runEventStream";
import { buildRunEvidenceBundle } from "../services/evidenceBundle";
import { requireScope } from "../middlewares/requireScope";
import { evaluateTenantBillingExecutionGuard } from "../services/tenantBilling";
import { WorkspaceAgentAssignmentError } from "../services/workspaceAgentAssignments";
import { inferApprovalStatusFromMetadata, isSimulateMode } from "../services/runApprovalPolicy";
import {
  createShadowExecutionSnapshot,
  updateShadowExecutionApprovalByRunId,
} from "../services/shadowExecutionStore";

export const runsRouter = Router();
runsRouter.use(enforceTenant);

const serializeRun = (run: any) => ({
  ...run,
  projectId: run?.workspaceId,
});

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const serializeRunEvent = (event: any) => ({
  id: event.id,
  runId: event.runId,
  type: event.type,
  payload: event.payload ?? null,
  criticalHash: event.criticalHash ?? null,
  sclTxId: event.sclTxId ?? null,
  createdAt: event.createdAt,
  userId: event.userId ?? undefined,
});

runsRouter.get("/runs", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const agent = req.query.agent as string | undefined;
  const status = req.query.status as string | undefined;
  const from = req.query.from ? new Date(String(req.query.from)) : undefined;
  const to = req.query.to ? new Date(String(req.query.to)) : undefined;
  const page = Number(req.query.page ?? 1);
  const size = Number(req.query.size ?? 50);

  const output = await listRuns({
    prisma,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    agent,
    status: status as any,
    from,
    to,
    page,
    size,
  });

  return res.json({
    items: output.items.map(serializeRun),
    total: output.total,
  });
});

runsRouter.get("/runs/:id", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const run = await getRun({
    prisma,
    id: req.params.id,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
  });
  if (!run) {
    return res.status(404).json({
      ok: false,
      error: { code: "NOT_FOUND", message: "run" },
    });
  }

  return res.json(serializeRun(run));
});

runsRouter.get("/runs/:id/events", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const events = await listRunEvents({
    prisma,
    runId: req.params.id,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    cursor: typeof req.query.cursor === "string" ? req.query.cursor : null,
  });

  return res.json({
    items: events.map(serializeRunEvent),
  });
});

runsRouter.get("/runs/:id/critical-log", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const entries = await prisma.sclLedger.findMany({
    where: { runId: req.params.id, tenantId: authContext.tenantId },
    orderBy: { createdAt: "asc" },
  });

  return res.json({ ok: true, items: entries });
});

runsRouter.get("/runs/:id/stream", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  let initialEvents: unknown[] = [];
  try {
    initialEvents = await listRunEvents({
      prisma,
      runId: req.params.id,
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      cursor: typeof req.query.cursor === "string" ? req.query.cursor : null,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: {
        code: "RUN_EVENT_STREAM_INIT_FAILED",
        message: "Unable to init event stream",
        details: error instanceof Error ? error.message : String(error),
      },
    });
  }

  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.flushHeaders?.();

  const sendEvent = (event: any) => {
    res.write(`event: run-event\n`);
    res.write(`data: ${JSON.stringify(serializeRunEvent(event))}\n\n`);
  };

  const sendHeartbeat = () => {
    res.write(`event: heartbeat\n`);
    res.write(`data: {}\n\n`);
  };

  const heartbeatTimer = setInterval(sendHeartbeat, 15000);

  initialEvents.forEach(sendEvent);

  const unsubscribe = subscribeToRunEventStream(
    {
      runId: req.params.id,
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
    },
    (event) => {
      sendEvent(event);
    }
  );

  const closeConnection = () => {
    clearInterval(heartbeatTimer);
    unsubscribe();
    res.end();
  };

  req.on("close", closeConnection);
  req.on("error", closeConnection);
});

const RunExecutionSchema = z.object({
  agent: z.string().min(1),
  prompt: z.string().min(1),
  metadata: z.record(z.any()).optional(),
});

const RecommendationAdoptSchema = z
  .object({
    key: z.string().min(1).optional(),
    tatica: z.string().min(1).optional(),
    adopted: z.boolean().optional(),
  })
  .refine((data) => data.key || data.tatica, {
    message: "key_or_tatica_required",
  });

const RecommendationRejectSchema = z
  .object({
    key: z.string().min(1).optional(),
    tatica: z.string().min(1).optional(),
    reason: z.string().min(1).optional(),
  })
  .refine((data) => data.key || data.tatica, {
    message: "key_or_tatica_required",
  });

const RunFeedbackSchema = z.object({
  rating: z.number().int().min(1).max(5),
  tags: z.array(z.string()).optional(),
});

const ConversationFinalizeSchema = z.object({
  document: z.string().min(1),
  runIds: z.array(z.string()).optional(),
  policySnapshot: z.record(z.any()).optional(),
});

function createGovernanceLedgerHash(params: {
  tenantId: string;
  actionType: string;
  idempotencyKey: string;
  usageCount?: number;
}) {
  const usageCount = params.usageCount ?? 1;
  const criticalHash = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        event: "guardrail.ledger.insert",
        tenantId: params.tenantId,
        actionType: params.actionType,
        idempotencyKey: params.idempotencyKey,
        usageCount,
      })
    )
    .digest("hex");
  const payloadHash = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        idempotencyKey: params.idempotencyKey,
        usageCount,
      })
    )
    .digest("hex");
  return { criticalHash, payloadHash };
}

async function recordGovernanceLedger(params: {
  prisma: TenantAwareRequest["prisma"];
  tenantId: string;
  runId: string;
  actionType: string;
  idempotencyKey: string;
}) {
  if (!params.prisma) return null;
  const { criticalHash, payloadHash } = createGovernanceLedgerHash({
    tenantId: params.tenantId,
    actionType: params.actionType,
    idempotencyKey: params.idempotencyKey,
  });
  await params.prisma.guardrailLedger.create({
    data: {
      tenantId: params.tenantId,
      runId: params.runId,
      actionType: params.actionType,
      criticalHash,
      payloadHash,
    },
  });
  return criticalHash;
}

function normalizeRecommendationKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function matchRecommendation(
  record: Record<string, unknown>,
  key?: string | null,
  tatica?: string | null
) {
  const recordKey = typeof record.key === "string" ? record.key : null;
  const recordTatica = typeof record.tatica === "string" ? record.tatica : null;
  if (key && recordKey && recordKey.toLowerCase() === key.toLowerCase()) return true;
  if (tatica && recordTatica && recordTatica.toLowerCase() === tatica.toLowerCase()) return true;
  return false;
}

function updateRecommendationInResponse(params: {
  response: unknown;
  key?: string | null;
  tatica?: string | null;
  adopted?: boolean;
  status?: string | null;
  feedback?: Record<string, unknown> | null;
}) {
  const { response, key, tatica, adopted, status, feedback } = params;
  if (!response) return { updated: false, response, matched: null };

  let root: unknown = response;
  let parsedFromString = false;

  if (typeof response === "string") {
    try {
      root = JSON.parse(response);
      parsedFromString = true;
    } catch {
      return { updated: false, response, matched: null };
    }
  }

  const visited = new WeakSet<object>();
  let updated = false;
  let matched: { key?: string; tatica?: string; score?: number } | null = null;

  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    if (visited.has(node as object)) return;
    visited.add(node as object);

    if (Array.isArray(node)) {
      node.forEach((item) => walk(item));
      return;
    }

    const record = node as Record<string, unknown>;
    const list =
      (Array.isArray(record.recomendacoes) && record.recomendacoes) ||
      (Array.isArray(record.recommendations) && record.recommendations);

    if (Array.isArray(list)) {
      list.forEach((item) => {
        if (!item || typeof item !== "object") return;
        const entry = item as Record<string, unknown>;
        if (!matchRecommendation(entry, key, tatica)) return;
        if (adopted !== undefined) {
          entry.adopted = adopted;
        }
        if (status) {
          entry.status = status;
        }
        if (feedback) {
          entry.feedback = {
            ...(isPlainObject(entry.feedback) ? entry.feedback : {}),
            ...feedback,
          };
        }
        updated = true;
        matched = {
          key: typeof entry.key === "string" ? entry.key : matched?.key,
          tatica: typeof entry.tatica === "string" ? entry.tatica : matched?.tatica,
          score: typeof entry.score === "number" ? entry.score : matched?.score,
        };
      });
    }

    Object.values(record).forEach((value) => walk(value));
  };

  walk(root);

  if (!updated) {
    return { updated: false, response, matched: null };
  }

  const updatedResponse = parsedFromString ? JSON.stringify(root) : root;
  return { updated: true, response: updatedResponse, matched };
}

runsRouter.post("/runs", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const parse = RunExecutionSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid payload",
        details: parse.error.flatten(),
      },
    });
  }

  const { agent: rawAgent, prompt, metadata } = parse.data;
  let resolvedMetadata = metadata;
  const agent = resolveAgentId(rawAgent);
  const delegationPolicy = (req as TenantAwareRequest).delegationPolicy;

  if (delegationPolicy) {
    const delegationPayload = {
      id: delegationPolicy.id,
      delegatorId: delegationPolicy.delegatorId,
      marketplaceId: delegationPolicy.marketplaceId ?? null,
      scope: delegationPolicy.scope,
      trustMin: delegationPolicy.trustMin,
      validUntil: delegationPolicy.validUntil.toISOString(),
    };

    const hasDelegation =
      resolvedMetadata &&
      typeof resolvedMetadata === "object" &&
      !Array.isArray(resolvedMetadata) &&
      "delegation" in (resolvedMetadata as Record<string, unknown>);

    if (!hasDelegation) {
      resolvedMetadata = {
        ...(resolvedMetadata ?? {}),
        delegation: delegationPayload,
      };
    }
  }

  const profile = await getAgentProfile(authContext.tenantId, authContext.workspaceId, agent, prisma);
  if (!profile) {
    return res.status(404).json({
      ok: false,
      error: { code: "AGENT_NOT_FOUND", message: `Agent ${rawAgent} was not found` },
    });
  }

  const requestPayload = { prompt, metadata: resolvedMetadata };

  const inputBytes = Buffer.byteLength(prompt, "utf8");
  const toolIdentifiers = Array.isArray(profile.tools)
    ? (profile.tools as Array<unknown>)
        .map((entry) => {
          if (typeof entry === "string") {
            return entry;
          }
          if (
            entry &&
            typeof entry === "object" &&
            "name" in entry &&
            typeof (entry as { name?: unknown }).name === "string"
          ) {
            return (entry as { name: string }).name;
          }
          return undefined;
        })
        .filter((value): value is string => Boolean(value))
    : undefined;

  const estimate = await estimateCostCents({
    agent,
    inputBytes,
    tools: toolIdentifiers,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    prisma,
  });

  if (estimate === null) {
    return res.status(404).json({
      ok: false,
      error: { code: "WORKSPACE_NOT_FOUND", message: "Workspace not found for tenant" },
    });
  }

  const billingGuard = await evaluateTenantBillingExecutionGuard({
    prisma,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    estimatedRunCostCents: estimate,
  });

  if (billingGuard.block) {
    const blockedRun = await createRunRecord({
      prisma,
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      userId: authContext.userId,
      agent,
      status: "blocked",
      request: requestPayload,
      traceId: null,
      finishedAt: new Date(),
      errorCode: "BILLING_GUARD_BLOCKED",
    });

    await emitRunEvent({
      prisma,
      runId: blockedRun.id,
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      userId: authContext.userId,
      type: "run.billing.blocked",
      payload: {
        mode: billingGuard.mode,
        reasons: billingGuard.reasons,
        cycleStart: billingGuard.cycle.cycleStart.toISOString(),
        cycleEnd: billingGuard.cycle.cycleEnd.toISOString(),
      },
    });

    return res.status(403).json({
      ok: false,
      error: {
        code: "BILLING_GUARD_BLOCKED",
        message: "Execucao bloqueada por quota/grant do workspace.",
        details: {
          mode: billingGuard.mode,
          reasons: billingGuard.reasons,
          cycleStart: billingGuard.cycle.cycleStart.toISOString(),
          cycleEnd: billingGuard.cycle.cycleEnd.toISOString(),
        },
      },
      data: serializeRun(blockedRun),
    });
  }

  const hasGuardReasons = billingGuard.reasons.length > 0;
  const shouldWarnWithoutBlock =
    hasGuardReasons && (billingGuard.mode === "soft" || billingGuard.mode === "shadow");

  const trust = await evaluateTrustScore(prisma, authContext.tenantId, authContext.workspaceId);

  if (!trustScoreAllowsExecution(trust)) {
    const blockedRun = await createRunRecord({
      prisma,
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      userId: authContext.userId,
      agent,
      status: "blocked",
      request: requestPayload,
      traceId: null,
      finishedAt: new Date(),
    });

    await emitRunEvent({
      prisma,
      runId: blockedRun.id,
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      userId: authContext.userId,
      type: "run.trustscore.blocked",
      payload: trust,
    });

    const ledger = createGuardrailLedgerStore(authContext.tenantId, authContext.workspaceId, prisma);
    await ledger.register(
      JSON.stringify({
        tenantId: authContext.tenantId,
        actionType: "blocked.trustscore",
        runId: blockedRun.id,
        idempotencyKey: blockedRun.id,
      }),
      0
    );

    return res.status(403).json({
      ok: false,
      error: { code: "TRUST_BLOCKED", message: "Trust score too low" },
      data: serializeRun(blockedRun),
    });
  }

  resolvedMetadata = {
    ...(resolvedMetadata ?? {}),
    governanceContext: {
      tenantIdPresent: true,
      workspaceIdPresent: true,
      rbacEvaluated: true,
      entitlementEvaluated: true,
      trustScoreEvaluated: true,
      trustScore: trust.score,
      trustLevel: trust.level,
      costGuardEvaluated: true,
      policyDecision: "allowed",
      reasonCode: null,
    },
  };

  let run;
  try {
    run = await createRunRecord({
      prisma,
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      userId: authContext.userId,
      agent,
      status: "pending",
      request: requestPayload,
      traceId: null,
      finishedAt: null,
      approvalStatus: inferApprovalStatusFromMetadata(resolvedMetadata),
    });
  } catch (error) {
    if (error instanceof WorkspaceAgentAssignmentError) {
      return res.status(403).json({
        ok: false,
        error: {
          code: error.reasonCode,
          reasonCode: error.reasonCode,
          message: error.message,
          context: error.context,
        },
      });
    }
    throw error;
  }

  await emitRunEvent({
    prisma,
    runId: run.id,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    userId: authContext.userId,
    type: "run.requested",
      payload: {
        agent,
        promptPreview: prompt.slice(0, 200),
        metadata: resolvedMetadata,
        billingGuardMode: billingGuard.mode,
        billingGuardReasons: billingGuard.reasons,
      },
  });

  let shadowExecution = null;
  if (isSimulateMode(resolvedMetadata)) {
    shadowExecution = await createShadowExecutionSnapshot({
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      agentId: agent,
      inputRef: run.id,
      runId: run.id,
      approvalStatus: inferApprovalStatusFromMetadata(resolvedMetadata),
      preview: {
        summary: "Run enfileirado a partir de fluxo de simulação.",
        estimatedCostCents: 0,
        currency: "BRL",
        warnings: shouldWarnWithoutBlock
          ? [billingGuard.reasons[0]?.message ?? "Run em modo shadow com alerta."]
          : [],
        nextActions:
          inferApprovalStatusFromMetadata(resolvedMetadata) === "pending"
            ? ["Aguardar ou registrar aprovação antes da promoção para produção."]
            : ["Revisar preview e decidir promoção para produção."],
      },
      evidenceRefs: [
        { source: "run", refId: run.id, label: `run:${run.id}` },
      ],
      executionPayload: {
        prompt,
        metadata: resolvedMetadata ?? undefined,
      },
    });
  }

  if (shouldWarnWithoutBlock) {
    await emitRunEvent({
      prisma,
      runId: run.id,
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      userId: authContext.userId,
      type: billingGuard.mode === "soft" ? "run.billing.soft_limit" : "run.billing.shadow",
      payload: {
        mode: billingGuard.mode,
        reasons: billingGuard.reasons,
        cycleStart: billingGuard.cycle.cycleStart.toISOString(),
        cycleEnd: billingGuard.cycle.cycleEnd.toISOString(),
      },
    });
  }

  // Modo observação: avalia intenção, mas não bloqueia a execução
  try {
    const modeRaw = (process.env.INTENT_VALIDATOR_MODE ?? "enforce").trim().toLowerCase();
    const mode = modeRaw === "observe" ? "observe" : "enforce";
    const intent = await evaluateIntent({
      prompt,
      metadata,
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      runId: run.id,
      prisma,
      mode,
    });

    if (intent.signature) {
      resolvedMetadata = {
        ...(resolvedMetadata ?? {}),
        intentSignature: intent.signature,
      };

      await prisma.run.update({
        where: {
          id: run.id,
          tenantId: authContext.tenantId,
          workspaceId: authContext.workspaceId,
        },
        data: {
          request: {
            prompt,
            metadata: resolvedMetadata,
          },
        },
      });
    }

    await emitRunEvent({
      prisma,
      runId: run.id,
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      userId: authContext.userId,
      type: "run.intent.evaluated",
      payload: intent,
    });
  } catch (intentError) {
    if (req.logger) {
      req.logger.warn({ err: intentError, runId: run.id }, "run.intent_evaluation_failed");
    }
  }

  try {
    await emitRunEvent({
      prisma,
      runId: run.id,
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      userId: authContext.userId,
      type: "run.enqueued",
      payload: { agent, metadata: resolvedMetadata },
    });

    await publishRun({
      runId: run.id,
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      userId: authContext.userId,
      agent,
      prompt,
      metadata: resolvedMetadata,
    });

    if (req.logger) {
      req.logger.info(
        {
          runId: run.id,
          agent,
          metadataKeys:
            resolvedMetadata && typeof resolvedMetadata === "object"
              ? Object.keys(resolvedMetadata)
              : [],
        },
        "run.enqueued"
      );
    }

    return res.status(202).json({
      ok: true,
      data: serializeRun(run),
      ...(shadowExecution ? { shadowExecutionId: shadowExecution.shadowExecutionId } : {}),
      queued: true,
      ...(shouldWarnWithoutBlock
        ? {
            warnings: [
              {
                code: billingGuard.mode === "soft" ? "BILLING_SOFT_LIMIT" : "BILLING_GUARD_SHADOW",
                message:
                  billingGuard.mode === "soft"
                    ? "Run enfileirado com alerta de limite soft de billing."
                    : "Run enfileirado em modo shadow de billing guard.",
                details: {
                  mode: billingGuard.mode,
                  reasons: billingGuard.reasons,
                  shadowExecutionId: shadowExecution?.shadowExecutionId ?? null,
                },
              },
            ],
          }
        : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Execution failed";
    if (req.logger) {
      req.logger.error({ err: error, runId: run.id }, "run.enqueue_failed");
    }

    return res.status(500).json({
      ok: false,
      error: { code: "ENQUEUE_FAILED", message },
      data: serializeRun(run),
    });
  }
});

runsRouter.post("/runs/:id/approve", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING" } });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const parentRunId = typeof body.parentRunId === "string" ? body.parentRunId : null;

  const existing = await getRun({
    prisma,
    id: req.params.id,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
  });

  if (!existing) {
    return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "run" } });
  }

  const approvalPayload = {
    approvedBy: authContext.userId ?? null,
    approvedAt: new Date().toISOString(),
    agent: existing.agent,
    parentRunId,
  };

  await (prisma as any).run.update({
    where: { id: existing.id },
    data: {
      approvalStatus: "approved",
      approvedBy: authContext.userId ?? null,
      approvedAt: new Date(approvalPayload.approvedAt),
    },
  });

  const approvalIdempotencyKey = `run.approved:${existing.id}:${Date.now()}`;
  const approvalLedgerHash = await recordGovernanceLedger({
    prisma,
    tenantId: authContext.tenantId,
    runId: existing.id,
    actionType: "run.approved",
    idempotencyKey: approvalIdempotencyKey,
  });

  const event = await emitRunEvent({
    prisma,
    runId: existing.id,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    userId: authContext.userId,
    type: "run.approved",
    payload: approvalPayload,
    criticalHash: approvalLedgerHash ?? undefined,
  });

  const ledger = createGuardrailLedgerStore(authContext.tenantId, authContext.workspaceId, prisma);
  await ledger.register(
    JSON.stringify({
      tenantId: authContext.tenantId,
      actionType: "run.approved",
      runId: existing.id,
      parentRunId,
      idempotencyKey: event.id,
    }),
    0
  );

  await updateShadowExecutionApprovalByRunId({
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    runId: existing.id,
    approvedByUserId: authContext.userId ?? null,
    productionRunId: existing.id,
  });

  return res.status(200).json({ ok: true, event: serializeRunEvent(event) });
});

runsRouter.post("/runs/:id/cancel", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING" } });
  }

  const existing = await getRun({
    prisma,
    id: req.params.id,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
  });

  if (!existing) {
    return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "run" } });
  }

  const existingResponse = isPlainObject(existing.response) ? existing.response : {};
  const cancellationRequested =
    (existing.status === "blocked" && existing.errorCode === "USER_CANCELLED") ||
    typeof existingResponse.cancelRequestedAt === "string";
  const alreadyCancelled = existing.status === "blocked" && existing.errorCode === "USER_CANCELLED";
  if (alreadyCancelled) {
    return res.status(200).json({ ok: true, data: serializeRun(existing) });
  }
  if (cancellationRequested) {
    return res.status(202).json({ ok: true, data: serializeRun(existing) });
  }

  if (existing.status === "success" || existing.status === "error") {
    return res.status(409).json({
      ok: false,
      error: {
        code: "RUN_ALREADY_FINISHED",
        message: "Run já finalizado; cancelamento não aplicado.",
      },
    });
  }

  const cancelledAt = new Date();
  const cancelledResponse = {
    ...existingResponse,
    cancelRequestedAt: cancelledAt.toISOString(),
    cancelRequestedBy: authContext.userId ?? null,
  };

  const updated = await (prisma as any).run.update({
    where: {
      id: existing.id,
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
    },
    data: {
      response: cancelledResponse,
    },
  });

  const event = await emitRunEvent({
    prisma,
    runId: existing.id,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    userId: authContext.userId,
    type: "run.cancel_requested",
    payload: {
      status: updated.status,
      reasonCode: "USER_CANCELLED",
      cancelRequestedAt: cancelledAt.toISOString(),
    },
  });

  return res.status(200).json({
    ok: true,
    data: serializeRun(updated),
    event: serializeRunEvent(event),
  });
});

runsRouter.post("/runs/:id/recommendations/adopt", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING" } });
  }

  const parse = RecommendationAdoptSchema.safeParse(req.body ?? {});
  if (!parse.success) {
    return res.status(400).json({
      ok: false,
      error: { code: "INVALID_PAYLOAD", message: "key or tatica required" },
    });
  }

  const existing = await getRun({
    prisma,
    id: req.params.id,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
  });

  if (!existing) {
    return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "run" } });
  }

  const adopted = parse.data.adopted ?? true;
  const key = parse.data.key?.trim() ?? null;
  const tatica = parse.data.tatica?.trim() ?? null;
  const actionType = "run.recommendation.adopted";

  const responseUpdate = updateRecommendationInResponse({
    response: existing.response,
    key,
    tatica,
    adopted,
  });

  if (responseUpdate.updated) {
    await prisma.run.update({
      where: {
        id: existing.id,
        tenantId: authContext.tenantId,
        workspaceId: authContext.workspaceId,
      },
      data: { response: responseUpdate.response as unknown },
    });
  }

  const nowIso = new Date().toISOString();
  const resolvedKeyRaw =
    key ??
    responseUpdate.matched?.key ??
    responseUpdate.matched?.tatica ??
    tatica ??
    "recomendacao";
  const resolvedKey = normalizeRecommendationKey(resolvedKeyRaw);

  const existingState = await getAgentRecommendationState({
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    agentId: existing.agent,
  });

  const state = existingState?.state ?? { recommendations: {}, version: 1 };
  const current = state.recommendations[resolvedKey] ?? {
    adopted: false,
    accepts: 0,
    rejects: 0,
    lastAcceptedAt: null,
    lastSuggestedAt: null,
    score: responseUpdate.matched?.score ?? 0,
    status: "PENDENTE",
  };

  const next = {
    ...current,
    adopted,
    accepts: adopted ? current.accepts + 1 : current.accepts,
    lastAcceptedAt: adopted ? nowIso : current.lastAcceptedAt,
    lastSuggestedAt: current.lastSuggestedAt ?? nowIso,
    score:
      typeof responseUpdate.matched?.score === "number"
        ? responseUpdate.matched.score
        : current.score,
    status: adopted ? "ADOTADO" : current.status,
  };

  state.recommendations[resolvedKey] = next;
  state.version = typeof state.version === "number" ? state.version : 1;

  await saveAgentRecommendationState({
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    agentId: existing.agent,
    state,
    lastRunId: existing.id,
  });

  const adoptIdempotencyKey = `${actionType}:${existing.id}:${Date.now()}`;
  const adoptLedgerHash = await recordGovernanceLedger({
    prisma,
    tenantId: authContext.tenantId,
    runId: existing.id,
    actionType,
    idempotencyKey: adoptIdempotencyKey,
  });

  const event = await emitRunEvent({
    prisma,
    runId: existing.id,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    userId: authContext.userId,
    type: actionType,
    payload: {
      key: resolvedKeyRaw,
      tatica,
      adopted,
    },
    criticalHash: adoptLedgerHash ?? undefined,
  });

  return res.status(200).json({
    ok: true,
    updatedResponse: responseUpdate.updated,
    recommendation: {
      key: resolvedKeyRaw,
      adopted,
      status: next.status,
    },
    event: serializeRunEvent(event),
  });
});

runsRouter.post("/runs/:id/recommendations/reject", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING" } });
  }

  const parse = RecommendationRejectSchema.safeParse(req.body ?? {});
  if (!parse.success) {
    return res.status(400).json({
      ok: false,
      error: { code: "INVALID_PAYLOAD", message: "key or tatica required" },
    });
  }

  const existing = await getRun({
    prisma,
    id: req.params.id,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
  });

  if (!existing) {
    return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "run" } });
  }

  const key = parse.data.key?.trim() ?? null;
  const tatica = parse.data.tatica?.trim() ?? null;
  const reason = parse.data.reason?.trim() ?? null;
  const actionType = "run.recommendation.rejected";

  const responseUpdate = updateRecommendationInResponse({
    response: existing.response,
    key,
    tatica,
    adopted: false,
    status: "REJEITADO",
    feedback: reason ? { explicit: reason, status: "rejeitado" } : { status: "rejeitado" },
  });

  if (responseUpdate.updated) {
    await prisma.run.update({
      where: {
        id: existing.id,
        tenantId: authContext.tenantId,
        workspaceId: authContext.workspaceId,
      },
      data: { response: responseUpdate.response as unknown },
    });
  }

  const nowIso = new Date().toISOString();
  const resolvedKeyRaw =
    key ??
    responseUpdate.matched?.key ??
    responseUpdate.matched?.tatica ??
    tatica ??
    "recomendacao";
  const resolvedKey = normalizeRecommendationKey(resolvedKeyRaw);

  const existingState = await getAgentRecommendationState({
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    agentId: existing.agent,
  });

  const state = existingState?.state ?? { recommendations: {}, version: 1 };
  const current = state.recommendations[resolvedKey] ?? {
    adopted: false,
    accepts: 0,
    rejects: 0,
    lastAcceptedAt: null,
    lastRejectedAt: null,
    lastSuggestedAt: null,
    score: responseUpdate.matched?.score ?? 0,
    status: "PENDENTE",
  };

  const next = {
    ...current,
    adopted: false,
    rejects: current.rejects + 1,
    lastRejectedAt: nowIso,
    lastSuggestedAt: current.lastSuggestedAt ?? nowIso,
    score:
      typeof responseUpdate.matched?.score === "number"
        ? responseUpdate.matched.score
        : current.score,
    status: "REJEITADO" as const,
  };

  state.recommendations[resolvedKey] = next;
  state.version = typeof state.version === "number" ? state.version : 1;

  await saveAgentRecommendationState({
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    agentId: existing.agent,
    state,
    lastRunId: existing.id,
  });

  const rejectIdempotencyKey = `${actionType}:${existing.id}:${Date.now()}`;
  const rejectLedgerHash = await recordGovernanceLedger({
    prisma,
    tenantId: authContext.tenantId,
    runId: existing.id,
    actionType,
    idempotencyKey: rejectIdempotencyKey,
  });

  const event = await emitRunEvent({
    prisma,
    runId: existing.id,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    userId: authContext.userId,
    type: actionType,
    payload: {
      key: resolvedKeyRaw,
      tatica,
      reason,
    },
    criticalHash: rejectLedgerHash ?? undefined,
  });

  return res.status(200).json({
    ok: true,
    updatedResponse: responseUpdate.updated,
    recommendation: {
      key: resolvedKeyRaw,
      adopted: false,
      status: next.status,
    },
    event: serializeRunEvent(event),
  });
});

runsRouter.post("/runs/:id/feedback", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING" } });
  }

  const parse = RunFeedbackSchema.safeParse(req.body ?? {});
  if (!parse.success) {
    return res.status(400).json({ ok: false, error: { code: "INVALID_PAYLOAD" } });
  }

  const existing = await getRun({
    prisma,
    id: req.params.id,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
  });

  if (!existing) {
    return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "run" } });
  }

  const rating = parse.data.rating;
  const tags = parse.data.tags ?? [];
  const actionType = "run.feedback.submitted";
  const nowIso = new Date().toISOString();

  const responseText = typeof existing.response === "string" ? existing.response : JSON.stringify(existing.response ?? "");
  let parsed: any = null;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    parsed = null;
  }

  const recommendations = Array.isArray(parsed?.recomendacoes) ? parsed.recomendacoes : [];

  const existingState = await getAgentRecommendationState({
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    agentId: existing.agent,
  });
  const state = existingState?.state ?? { recommendations: {}, version: 1 };

  recommendations.forEach((item: Record<string, unknown>) => {
    const recKey = normalizeRecommendationKey(String(item.key ?? item.tatica ?? "recomendacao"));
    const current = state.recommendations[recKey] ?? {
      adopted: false,
      accepts: 0,
      rejects: 0,
      lastAcceptedAt: null,
      lastRejectedAt: null,
      lastSuggestedAt: null,
      score: typeof item.score === "number" ? item.score : 0.5,
      status: "PENDENTE",
    };

    if (rating >= 4) {
      current.accepts += 1;
      current.lastAcceptedAt = nowIso;
    } else if (rating <= 2) {
      current.rejects += 1;
      current.lastRejectedAt = nowIso;
      current.status = "REJEITADO";
    }

    state.recommendations[recKey] = current;
  });

  state.version = typeof state.version === "number" ? state.version : 1;
  await saveAgentRecommendationState({
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    agentId: existing.agent,
    state,
    lastRunId: existing.id,
  });

  const feedbackIdempotencyKey = `${actionType}:${existing.id}:${Date.now()}`;
  const feedbackLedgerHash = await recordGovernanceLedger({
    prisma,
    tenantId: authContext.tenantId,
    runId: existing.id,
    actionType,
    idempotencyKey: feedbackIdempotencyKey,
  });

  const event = await emitRunEvent({
    prisma,
    runId: existing.id,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    userId: authContext.userId,
    type: actionType,
    payload: { rating, tags },
    criticalHash: feedbackLedgerHash ?? undefined,
  });

  return res.status(200).json({ ok: true, event: serializeRunEvent(event) });
});

runsRouter.get("/governance/report", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING" } });
  }

  const limit = Math.min(Number(req.query.limit ?? 200), 500);
  const types = ["run.approved", "run.recommendation.adopted", "conversation.finalized"];

  const events = await prisma.runEvent.findMany({
    where: {
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      type: { in: types },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      run: { select: { agent: true } },
    },
  });

  const items = events.map((event) => {
    const payload = (event.payload ?? {}) as Record<string, unknown>;
    return {
      id: event.id,
      runId: event.runId,
      agent: event.run?.agent ?? null,
      type: event.type,
      createdAt: event.createdAt,
      ledgerHash: event.criticalHash ?? null,
      payload: {
        key: typeof payload.key === "string" ? payload.key : null,
        tatica: typeof payload.tatica === "string" ? payload.tatica : null,
        adopted: typeof payload.adopted === "boolean" ? payload.adopted : null,
        approvedBy: typeof payload.approvedBy === "string" ? payload.approvedBy : null,
        approvedAt: typeof payload.approvedAt === "string" ? payload.approvedAt : null,
        document: typeof payload.document === "string" ? payload.document : null,
        runIds: Array.isArray(payload.runIds) ? payload.runIds : null,
      },
    };
  });

  return res.json({ ok: true, items });
});

runsRouter.get("/runs/:id/bundle", requireScope("reports.view"), async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING" } });
  }

  const bundle = await buildRunEvidenceBundle({
    prisma,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    runId: req.params.id,
  });
  if (!bundle) {
    return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "run" } });
  }

  const { run, bundleHash, files, hashes } = bundle;
  await recordGovernanceLedger({
    prisma,
    tenantId: authContext.tenantId,
    runId: run.id,
    actionType: "bundle.exported.v1",
    idempotencyKey: `bundle:${run.id}:${bundleHash}`,
  });

  return res.json({
    ok: true,
    runId: run.id,
    bundleHash,
    hashes,
    files,
  });
});

runsRouter.post("/runs/:id/conversation/finalize", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING" } });
  }

  const parse = ConversationFinalizeSchema.safeParse(req.body ?? {});
  if (!parse.success) {
    return res.status(400).json({ ok: false, error: { code: "INVALID_PAYLOAD" } });
  }

  const existing = await getRun({
    prisma,
    id: req.params.id,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
  });

  if (!existing) {
    return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "run" } });
  }

  const actionType = "conversation.finalized";
  const idempotencyKey = `${actionType}:${existing.id}:${Date.now()}`;
  const ledgerHash = await recordGovernanceLedger({
    prisma,
    tenantId: authContext.tenantId,
    runId: existing.id,
    actionType,
    idempotencyKey,
  });

  const event = await emitRunEvent({
    prisma,
    runId: existing.id,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    userId: authContext.userId,
    type: actionType,
    payload: {
      document: parse.data.document,
      runIds: parse.data.runIds ?? [existing.id],
      policySnapshot: parse.data.policySnapshot ?? null,
    },
    criticalHash: ledgerHash ?? undefined,
  });

  return res.status(200).json({ ok: true, event: serializeRunEvent(event) });
});


runsRouter.post("/runs/:id/replay", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING" } });
  }

  const existing = await getRun({
    prisma,
    id: req.params.id,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
  });

  if (!existing) {
    return res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "run" } });
  }

  await emitRunEvent({
    prisma,
    runId: existing.id,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    userId: authContext.userId,
    type: "run.replay.requested",
    payload: { agent: existing.agent },
  });

  const requestMetadata =
    typeof existing.request === "object" && existing.request !== null
      ? ((existing.request as Record<string, unknown>).metadata as Record<string, unknown> | undefined)
      : undefined;
  const replayMetadata = {
    ...(requestMetadata ?? {}),
    replay: {
      sourceRunId: existing.id,
      requestedAt: new Date().toISOString(),
    },
  };

  await publishRun({
    runId: existing.id,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    userId: authContext.userId,
    agent: existing.agent,
    prompt: typeof existing.request === "object" && existing.request !== null && "prompt" in (existing.request as Record<string, unknown>)
      ? String((existing.request as Record<string, unknown>).prompt ?? "")
      : "",
    metadata: replayMetadata,
  });

  await prisma.run.update({
    where: {
      id: existing.id,
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
    },
    data: { status: "pending", updatedAt: new Date() },
  });

  await emitRunEvent({
    prisma,
    runId: existing.id,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    userId: authContext.userId,
    type: "run.replay.enqueued",
    payload: {},
  });

  return res.json({ ok: true, data: serializeRun({ ...existing, status: "pending" }), replayed: true });
});
