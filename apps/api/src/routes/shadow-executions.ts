import { Buffer } from "node:buffer";
import { Router } from "express";
import { z } from "zod";
import { publishRun } from "@eiah/core";
import { recordGuardrailAudit } from "@eiah/core/services/guardrailLedgerStore";
import { enforceTenant, type TenantAwareRequest } from "../middlewares/enforceTenant";
import { estimateCostCents } from "../services/billing";
import { inferApprovalStatusFromMetadata } from "../services/runApprovalPolicy";
import {
  createShadowExecutionPreview,
  getShadowExecutionSnapshot,
  getShadowExecutionRuntime,
  listShadowExecutionSnapshots,
  promoteShadowExecution,
} from "../services/shadowExecutionStore";
import { evaluateTrustScore, trustScoreAllowsExecution } from "../services/trustScore";
import { evaluateTenantBillingExecutionGuard } from "../services/tenantBilling";
import { prepareRunRequestAction, RunActionValidationError } from "../services/imob/control/imobRunActionCatalog";
import { createRunRecord } from "../services/runs";
import { emitRunEvent } from "../services/runEventEmitter";
import { WorkspaceAgentAssignmentError } from "../services/workspaceAgentAssignments";
import { buildShadowPromotionAuditEvent } from "../types/shadowPromotionAuditEvent";
import {
  shadowExecutionApprovalStatusSchema,
  shadowExecutionStageSchema,
} from "../types/shadowExecutionContract";

export const shadowExecutionsRouter = Router();
shadowExecutionsRouter.use(enforceTenant);

const previewSchema = z.object({
  agent: z.string().min(1),
  prompt: z.string().min(1),
  workspaceId: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  tools: z.array(z.string().min(1)).optional(),
  inputRef: z.string().min(1).optional(),
});

const promoteSchema = z.object({
  target: z.enum(["workspace_production"]).optional(),
});

const listSchema = z.object({
  workspaceId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  currentStage: shadowExecutionStageSchema.optional(),
  approvalStatus: shadowExecutionApprovalStatusSchema.optional(),
  agentId: z.string().min(1).optional(),
});

function extractTools(metadata: Record<string, unknown> | undefined, explicit: string[] | undefined) {
  if (Array.isArray(explicit) && explicit.length > 0) return explicit;
  const value = metadata?.tools;
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

async function recordShadowPromotionAudit(params: {
  prisma: TenantAwareRequest["prisma"];
  tenantId: string;
  workspaceId: string;
  runId?: string | null;
  shadowExecutionId: string;
  agentId: string;
  sourceStage: "sandbox" | "preview" | "approval" | "promotion" | "production";
  target: "none" | "workspace_production" | "tenant_production";
  approvalStatus: "not_required" | "pending" | "approved" | "rejected";
  action: "promotion_blocked" | "promotion_completed";
  summary: string;
  reasonCode?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  if (!params.prisma) return `${params.shadowExecutionId}:${params.action}`;
  const auditEvent = buildShadowPromotionAuditEvent({
    auditType: "shadow_promotion",
    action: params.action,
    shadowExecutionId: params.shadowExecutionId,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    agentId: params.agentId,
    sourceStage: params.sourceStage,
    target: params.target,
    approvalStatus: params.approvalStatus,
    productionRunId: params.runId ?? null,
    reasonCode: params.reasonCode ?? null,
    summary: params.summary,
    occurredAt: new Date().toISOString(),
    metadata: params.metadata ?? null,
  });
  const auditRefId = `${params.shadowExecutionId}:${params.action}:${params.runId ?? "no-run"}`;
  await recordGuardrailAudit({
    prisma: params.prisma,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    runId: params.runId ?? null,
    eventType: `shadow.promotion.${params.action}`,
    severity: params.action === "promotion_completed" ? "info" : "warn",
    message: params.summary,
    metadata: {
      shadowPromotionAuditEvent: auditEvent,
    },
  });
  return auditRefId;
}

shadowExecutionsRouter.post("/shadow-executions/preview", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const parsed = previewSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: { code: "INVALID_PAYLOAD", details: parsed.error.flatten() },
    });
  }

  const workspaceId = parsed.data.workspaceId ?? authContext.workspaceId;
  const metadata = parsed.data.metadata ?? {};
  try {
    prepareRunRequestAction({
      request: {
        prompt: parsed.data.prompt,
        metadata,
      },
      requireCanonicalImobAction: String(metadata.domain ?? "").trim().toLowerCase() === "imob",
    });
  } catch (error) {
    if (error instanceof RunActionValidationError) {
      return res.status(400).json({
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
  const tools = extractTools(metadata, parsed.data.tools);
  const inputBytes = Buffer.byteLength(
    JSON.stringify({
      prompt: parsed.data.prompt,
      metadata,
    }),
    "utf8"
  );

  const estimateCents = await estimateCostCents({
    agent: parsed.data.agent,
    inputBytes,
    tools,
    tenantId: authContext.tenantId,
    workspaceId,
    prisma,
  });

  if (estimateCents === null) {
    return res.status(404).json({
      ok: false,
      error: { code: "WORKSPACE_NOT_FOUND", message: "Workspace not found for tenant" },
    });
  }

  const approvalStatus = inferApprovalStatusFromMetadata(metadata);
  const snapshot = await createShadowExecutionPreview({
    tenantId: authContext.tenantId,
    workspaceId,
    agentId: parsed.data.agent,
    inputRef: parsed.data.inputRef ?? `preview:${parsed.data.agent}:${Date.now()}`,
    approvalStatus,
    preview: {
      summary: `Preview gerado para ${parsed.data.agent} com ${inputBytes} bytes de entrada estimada.`,
      estimatedCostCents: estimateCents,
      currency: "BRL",
      warnings:
        approvalStatus === "pending"
          ? ["Fluxo com aprovação pendente antes de promoção para produção."]
          : [],
      nextActions:
        approvalStatus === "pending"
          ? ["Revisar preview", "Solicitar aprovação", "Promover após aprovação"]
          : ["Revisar preview", "Decidir promoção para produção"],
    },
    evidenceRefs: [
      {
        source: "billing_estimate",
        refId: `${parsed.data.agent}:${workspaceId}:${inputBytes}`,
        label: `estimate:${parsed.data.agent}`,
      },
    ],
    executionPayload: {
      prompt: parsed.data.prompt,
      metadata,
      tools,
    },
  });

  return res.status(201).json({ ok: true, data: snapshot });
});

shadowExecutionsRouter.get("/shadow-executions", async (req, res) => {
  const { authContext } = req as TenantAwareRequest;
  if (!authContext) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const parsed = listSchema.safeParse(req.query ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: { code: "INVALID_QUERY", details: parsed.error.flatten() },
    });
  }

  const items = await listShadowExecutionSnapshots({
    tenantId: authContext.tenantId,
    workspaceId: parsed.data.workspaceId ?? authContext.workspaceId,
    limit: parsed.data.limit ?? 20,
    currentStage: parsed.data.currentStage,
    approvalStatus: parsed.data.approvalStatus,
    agentId: parsed.data.agentId,
  });

  return res.json({
    ok: true,
    data: {
      items,
      count: items.length,
      workspaceId: parsed.data.workspaceId ?? authContext.workspaceId,
      filters: {
        currentStage: parsed.data.currentStage ?? null,
        approvalStatus: parsed.data.approvalStatus ?? null,
        agentId: parsed.data.agentId ?? null,
      },
    },
  });
});

shadowExecutionsRouter.get("/shadow-executions/:id", async (req, res) => {
  const { authContext } = req as TenantAwareRequest;
  if (!authContext) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const snapshot = await getShadowExecutionSnapshot({
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    shadowExecutionId: req.params.id,
  });

  if (!snapshot) {
    return res.status(404).json({
      ok: false,
      error: { code: "NOT_FOUND", message: "Shadow execution not found" },
    });
  }

  return res.json({ ok: true, data: snapshot });
});

shadowExecutionsRouter.post("/shadow-executions/:id/promote-to-production", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const parsed = promoteSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: { code: "INVALID_PAYLOAD", details: parsed.error.flatten() },
    });
  }

  const runtime = await getShadowExecutionRuntime({
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    shadowExecutionId: req.params.id,
  });

  if (!runtime) {
    return res.status(404).json({
      ok: false,
      error: { code: "NOT_FOUND", message: "Shadow execution not found" },
    });
  }

  if (!runtime.executionPayload?.prompt?.trim()) {
    return res.status(409).json({
      ok: false,
      error: {
        code: "SHADOW_EXECUTION_INPUT_MISSING",
        message: "Shadow execution does not have a promotable execution payload",
      },
    });
  }

  if (runtime.snapshot.approvalStatus === "pending") {
    await recordShadowPromotionAudit({
      prisma,
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      shadowExecutionId: runtime.snapshot.shadowExecutionId,
      agentId: runtime.snapshot.agentId,
      sourceStage: runtime.snapshot.currentStage,
      target: parsed.data.target ?? "workspace_production",
      approvalStatus: runtime.snapshot.approvalStatus,
      action: "promotion_blocked",
      summary: "Promotion blocked because approval is still pending.",
      reasonCode: "SHADOW_EXECUTION_APPROVAL_PENDING",
    });
    return res.status(409).json({
      ok: false,
      error: {
        code: "SHADOW_EXECUTION_APPROVAL_PENDING",
        message: "Approval is still pending before promotion to production",
      },
    });
  }

  const requestPayload = {
    prompt: runtime.executionPayload.prompt,
    metadata: {
      ...(runtime.executionPayload.metadata ?? {}),
      mode: "execute",
      promotedFromShadowExecutionId: runtime.snapshot.shadowExecutionId,
    },
  };

  const billingGuard = await evaluateTenantBillingExecutionGuard({
    prisma,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    estimatedRunCostCents: runtime.snapshot.preview.estimatedCostCents,
  });

  if (billingGuard.block) {
    await recordShadowPromotionAudit({
      prisma,
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      shadowExecutionId: runtime.snapshot.shadowExecutionId,
      agentId: runtime.snapshot.agentId,
      sourceStage: runtime.snapshot.currentStage,
      target: parsed.data.target ?? "workspace_production",
      approvalStatus: runtime.snapshot.approvalStatus,
      action: "promotion_blocked",
      summary: "Promotion blocked by billing guard.",
      reasonCode: "BILLING_GUARD_BLOCKED",
      metadata: {
        mode: billingGuard.mode,
        reasons: billingGuard.reasons,
      },
    });
    return res.status(403).json({
      ok: false,
      error: {
        code: "BILLING_GUARD_BLOCKED",
        message: "Promotion to production blocked by billing guard.",
        details: {
          mode: billingGuard.mode,
          reasons: billingGuard.reasons,
          cycleStart: billingGuard.cycle.cycleStart.toISOString(),
          cycleEnd: billingGuard.cycle.cycleEnd.toISOString(),
        },
      },
    });
  }

  const trust = await evaluateTrustScore(prisma, authContext.tenantId, authContext.workspaceId);
  if (!trustScoreAllowsExecution(trust)) {
    await recordShadowPromotionAudit({
      prisma,
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      shadowExecutionId: runtime.snapshot.shadowExecutionId,
      agentId: runtime.snapshot.agentId,
      sourceStage: runtime.snapshot.currentStage,
      target: parsed.data.target ?? "workspace_production",
      approvalStatus: runtime.snapshot.approvalStatus,
      action: "promotion_blocked",
      summary: "Promotion blocked by trust policy.",
      reasonCode: "TRUST_BLOCKED",
      metadata: {
        trust,
      },
    });
    return res.status(403).json({
      ok: false,
      error: { code: "TRUST_BLOCKED", message: "Trust score too low for production promotion" },
    });
  }

  let run;
  try {
    run = await createRunRecord({
      prisma,
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      userId: authContext.userId,
      agent: runtime.snapshot.agentId,
      status: "pending",
      request: requestPayload,
      traceId: null,
      finishedAt: null,
      approvalStatus: "approved",
      approvedBy: authContext.userId ?? null,
      approvedAt: new Date(),
      requireCanonicalImobAction:
        String((requestPayload.metadata as Record<string, unknown>)?.domain ?? "").trim().toLowerCase() === "imob",
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
    if (error instanceof RunActionValidationError) {
      return res.status(400).json({
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
    type: "run.shadow.promoted",
    payload: {
      shadowExecutionId: runtime.snapshot.shadowExecutionId,
      sourceStage: runtime.snapshot.currentStage,
      target: parsed.data.target ?? "workspace_production",
    },
  });

  await emitRunEvent({
    prisma,
    runId: run.id,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    userId: authContext.userId,
    type: "run.enqueued",
    payload: {
      agent: runtime.snapshot.agentId,
      metadata: requestPayload.metadata,
      promotedFromShadowExecutionId: runtime.snapshot.shadowExecutionId,
    },
  });

  await publishRun({
    runId: run.id,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    userId: authContext.userId,
    agent: runtime.snapshot.agentId,
    prompt: runtime.executionPayload.prompt,
    metadata: requestPayload.metadata,
  });

  const auditRefId = await recordShadowPromotionAudit({
    prisma,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    runId: run.id,
    shadowExecutionId: runtime.snapshot.shadowExecutionId,
    agentId: runtime.snapshot.agentId,
    sourceStage: runtime.snapshot.currentStage,
    target: parsed.data.target ?? "workspace_production",
    approvalStatus: runtime.snapshot.approvalStatus,
    action: "promotion_completed",
    summary: `Shadow execution promoted to production as run ${run.id}.`,
    metadata: {
      promotedByUserId: authContext.userId ?? null,
    },
  });

  const promoted = await promoteShadowExecution({
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    shadowExecutionId: runtime.snapshot.shadowExecutionId,
    promotedByUserId: authContext.userId ?? null,
    productionRunId: run.id,
    auditRefId,
  });

  return res.status(202).json({
    ok: true,
    data: {
      shadowExecution: promoted,
      productionRun: run,
    },
  });
});
