import { z } from "zod";
import {
  shadowExecutionApprovalStatusSchema,
  shadowExecutionPromotionTargetSchema,
  shadowExecutionStageSchema,
} from "./shadowExecutionContract";

// Source of truth operacional da auditoria de promoção shadow -> production.
// Referência: docs/architecture/adr-experience-surface-contract-source-of-truth.md

export const shadowPromotionAuditActionSchema = z.enum([
  "promotion_blocked",
  "promotion_completed",
]);

export const shadowPromotionAuditEventSchema = z.object({
  auditType: z.literal("shadow_promotion"),
  action: shadowPromotionAuditActionSchema,
  shadowExecutionId: z.string().min(1),
  tenantId: z.string().min(1),
  workspaceId: z.string().min(1),
  agentId: z.string().min(1),
  sourceStage: shadowExecutionStageSchema,
  target: shadowExecutionPromotionTargetSchema,
  approvalStatus: shadowExecutionApprovalStatusSchema,
  productionRunId: z.string().min(1).nullable(),
  reasonCode: z.string().min(1).nullable(),
  summary: z.string().min(1),
  occurredAt: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

export type ShadowPromotionAuditAction = z.infer<typeof shadowPromotionAuditActionSchema>;
export type ShadowPromotionAuditEvent = z.infer<typeof shadowPromotionAuditEventSchema>;

export function buildShadowPromotionAuditEvent(
  input: ShadowPromotionAuditEvent
): ShadowPromotionAuditEvent {
  return shadowPromotionAuditEventSchema.parse(input);
}
