import { z } from "zod";

// Source of truth operacional do contrato de execução shadow.
// Referência: docs/architecture/adr-experience-surface-contract-source-of-truth.md

export const shadowExecutionStageSchema = z.enum([
  "sandbox",
  "preview",
  "approval",
  "promotion",
  "production",
]);

export const shadowExecutionSideEffectModeSchema = z.enum([
  "zero_side_effect",
  "simulated_external_write",
  "preview_only",
  "production_write",
]);

export const shadowExecutionApprovalStatusSchema = z.enum([
  "not_required",
  "pending",
  "approved",
  "rejected",
]);

export const shadowExecutionPromotionTargetSchema = z.enum([
  "none",
  "workspace_production",
  "tenant_production",
]);

export const shadowExecutionEvidenceRefSchema = z.object({
  source: z.enum([
    "run",
    "run_receipt",
    "billing_estimate",
    "guardrail_audit",
    "governance_ledger",
  ]),
  refId: z.string().min(1),
  label: z.string().min(1),
});

export const shadowExecutionPreviewSchema = z.object({
  summary: z.string().min(1),
  estimatedCostCents: z.number().int().min(0),
  currency: z.string().min(1).default("BRL"),
  warnings: z.array(z.string().min(1)).default([]),
  nextActions: z.array(z.string().min(1)).default([]),
});

export const shadowExecutionPromotionSchema = z.object({
  target: shadowExecutionPromotionTargetSchema,
  promotedByUserId: z.string().min(1).nullable(),
  promotedAt: z.coerce.date().nullable(),
  productionRunId: z.string().min(1).nullable(),
});

export const shadowExecutionContractSchema = z.object({
  shadowExecutionId: z.string().min(1),
  tenantId: z.string().min(1),
  workspaceId: z.string().min(1),
  agentId: z.string().min(1),
  inputRef: z.string().min(1),
  currentStage: shadowExecutionStageSchema,
  sideEffectMode: shadowExecutionSideEffectModeSchema,
  approvalStatus: shadowExecutionApprovalStatusSchema,
  preview: shadowExecutionPreviewSchema,
  promotion: shadowExecutionPromotionSchema,
  evidenceRefs: z.array(shadowExecutionEvidenceRefSchema).min(1),
});

export type ShadowExecutionStage = z.infer<typeof shadowExecutionStageSchema>;
export type ShadowExecutionSideEffectMode = z.infer<typeof shadowExecutionSideEffectModeSchema>;
export type ShadowExecutionApprovalStatus = z.infer<typeof shadowExecutionApprovalStatusSchema>;
export type ShadowExecutionPromotionTarget = z.infer<typeof shadowExecutionPromotionTargetSchema>;
export type ShadowExecutionEvidenceRef = z.infer<typeof shadowExecutionEvidenceRefSchema>;
export type ShadowExecutionPreview = z.infer<typeof shadowExecutionPreviewSchema>;
export type ShadowExecutionPromotion = z.infer<typeof shadowExecutionPromotionSchema>;
export type ShadowExecutionContract = z.infer<typeof shadowExecutionContractSchema>;

export function buildShadowExecutionContract(input: ShadowExecutionContract): ShadowExecutionContract {
  return shadowExecutionContractSchema.parse(input);
}
