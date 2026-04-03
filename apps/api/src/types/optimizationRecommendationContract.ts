import { z } from "zod";

// Source of truth operacional do contrato de recomendação de eficiência.
// Referência: docs/architecture/platform-experience-optimization.md (PX-110)

export const optimizationRecommendationTypeSchema = z.enum([
  "fleet_policy_change",
  "model_switch",
  "workspace_rebalance",
  "agent_efficiency_review",
  "cost_opportunity",
]);

export const optimizationSubjectTypeSchema = z.enum([
  "tenant",
  "workspace",
  "agent",
  "model",
]);

export const optimizationRecommendationStatusSchema = z.enum([
  "proposed",
  "accepted",
  "rejected",
  "applied",
  "expired",
]);

export const optimizationApplyModeSchema = z.enum([
  "manual_review",
  "one_click_apply",
  "policy_backed",
]);

export const optimizationTimeWindowSchema = z.object({
  label: z.string().min(1),
  from: z.coerce.date(),
  to: z.coerce.date(),
});

export const optimizationEvidenceRefSchema = z.object({
  source: z.enum([
    "tenant_billing_summary",
    "agent_billing_summary",
    "run_cost_breakdown",
    "billing_reconciliation",
    "usage_ledger",
  ]),
  refId: z.string().min(1),
  label: z.string().min(1),
});

export const optimizationRecommendationSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  workspaceId: z.string().min(1).optional(),
  recommendationType: optimizationRecommendationTypeSchema,
  subjectType: optimizationSubjectTypeSchema,
  subjectId: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  timeWindow: optimizationTimeWindowSchema,
  currentCostCents: z.number().int().min(0),
  projectedCostCents: z.number().int().min(0),
  estimatedSavingsCents: z.number().int().min(0),
  confidence: z.number().min(0).max(1),
  evidenceRefs: z.array(optimizationEvidenceRefSchema),
  status: optimizationRecommendationStatusSchema,
  applyMode: optimizationApplyModeSchema,
});

export const optimizationRecommendationBundleSchema = z.object({
  tenantId: z.string().min(1),
  workspaceId: z.string().min(1).optional(),
  generatedAt: z.coerce.date(),
  items: z.array(optimizationRecommendationSchema),
});

export type OptimizationRecommendationType = z.infer<typeof optimizationRecommendationTypeSchema>;
export type OptimizationSubjectType = z.infer<typeof optimizationSubjectTypeSchema>;
export type OptimizationRecommendationStatus = z.infer<typeof optimizationRecommendationStatusSchema>;
export type OptimizationApplyMode = z.infer<typeof optimizationApplyModeSchema>;
export type OptimizationTimeWindow = z.infer<typeof optimizationTimeWindowSchema>;
export type OptimizationEvidenceRef = z.infer<typeof optimizationEvidenceRefSchema>;
export type OptimizationRecommendation = z.infer<typeof optimizationRecommendationSchema>;
export type OptimizationRecommendationBundle = z.infer<typeof optimizationRecommendationBundleSchema>;

export function buildOptimizationRecommendation(
  input: OptimizationRecommendation
): OptimizationRecommendation {
  return optimizationRecommendationSchema.parse(input);
}

export function buildOptimizationRecommendationBundle(
  input: OptimizationRecommendationBundle
): OptimizationRecommendationBundle {
  return optimizationRecommendationBundleSchema.parse(input);
}
