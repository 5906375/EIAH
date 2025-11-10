import { z } from "zod";
import { registerAction } from "./actionRegistry";
import {
  PlanSpecSchema,
  NeedMoreInfoPayloadSchema,
  evaluatePlanSpecAdditionalInfo
} from "../types";
import { publishAction } from "../queue/actionQueue";

const CreateWhiteLabelPlanInputSchema = z.object({
  spec: PlanSpecSchema,
  tenantId: z.string(),
  workspaceId: z.string(),
  userId: z.string().optional(),
  idempotencyKey: z.string().optional(),
});
type CreateWhiteLabelPlanInput = z.infer<typeof CreateWhiteLabelPlanInputSchema>;

const CreateWhiteLabelPlanOutputSchema = z.object({
  planId: z.string(),
  status: z.enum(["created", "pending_more_info"]),
  auditLogReference: z
    .object({
      event: z.string(),
      traceId: z.string().optional(),
      runId: z.string().optional(),
    })
    .optional(),
  needMoreInfo: NeedMoreInfoPayloadSchema.optional(),
});

const EmitAuditLogInputSchema = z.object({
  tenantId: z.string(),
  workspaceId: z.string(),
  runId: z.string().optional(),
  traceId: z.string().optional(),
  userId: z.string().optional(),
  event: z.string(),
  severity: z.enum(["INFO", "WARNING", "CRITICAL"]).default("INFO"),
  details: z.record(z.unknown()).optional(),
});

type EmitAuditLogInput = z.infer<typeof EmitAuditLogInputSchema>;

async function tryEmitAuditLog(input: EmitAuditLogInput, logger?: (event: string, payload?: Record<string, unknown>) => void) {
  try {
    await publishAction(
      {
        action: "billing.emit_audit_log",
        input,
        tenantId: input.tenantId,
        workspaceId: input.workspaceId,
      },
      {
        removeOnComplete: true,
        jobId: `audit:${input.workspaceId}:${Date.now()}`,
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger?.("billing.audit.enqueue_failed", { message });
  }
}

registerAction({
  name: "billing.emit_audit_log",
  description: "Persist a billing audit log entry.",
  contract: {
    input: EmitAuditLogInputSchema,
  },
  handler: async (context) => {
    const input = context.input as EmitAuditLogInput;

    context.logger?.("billing.audit_log.emitted", {
      event: input.event,
      severity: input.severity,
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      runId: input.runId,
      traceId: input.traceId,
    });

    return {
      status: "success",
      output: {
        acknowledged: true,
      },
    };
  },
});

registerAction({
  name: "billing.create_white_label_plan",
  description: "Create a billing plan on the white-label gateway and emit audit logs.",
  contract: {
    input: CreateWhiteLabelPlanInputSchema,
    output: CreateWhiteLabelPlanOutputSchema,
  },
  handler: async (context) => {
    const input = context.input as CreateWhiteLabelPlanInput;
    const { spec } = input;

    context.logger?.("billing.plan.create.start", {
      planId: spec.plan_id,
      workspaceId: input.workspaceId,
    });

    const needMoreInfo = evaluatePlanSpecAdditionalInfo(spec);
    if (needMoreInfo) {
      context.logger?.("billing.plan.create.blocked", {
        planId: spec.plan_id,
        reason: "need_more_info",
      });
      return {
        status: "error",
        error: "Additional financial information required before plan creation.",
        retryable: false,
        output: needMoreInfo,
      };
    }

    await new Promise((resolve) => setTimeout(resolve, 150));

    const traceId =
      typeof context.metadata?.traceId === "string"
        ? context.metadata.traceId
        : typeof context.stepId === "string"
        ? context.stepId
        : undefined;

    const auditEvent = {
      event: "billing.plan_created",
      traceId,
      runId: context.runId,
    };

    context.logger?.("billing.plan.create.success", {
      planId: spec.plan_id,
      workspaceId: input.workspaceId,
    });

    await tryEmitAuditLog(
      {
        tenantId: input.tenantId,
        workspaceId: input.workspaceId,
        runId: context.runId,
        traceId,
        userId: input.userId,
        event: "billing.plan_created",
        severity: "INFO",
        details: {
          planId: spec.plan_id,
          amount: spec.amount,
          currency: spec.currency,
        },
      },
      context.logger
    );

    return {
      status: "success",
      output: {
        planId: spec.plan_id,
        status: "created",
        auditLogReference: auditEvent,
      },
    };
  },
});

export function registerBillingActions() {
  // Actions are registered on import.
  return true;
}
