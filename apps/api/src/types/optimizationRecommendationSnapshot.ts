import { z } from "zod";
import { fleetPolicyOpportunityContractSchema } from "./fleetPolicyOpportunityContract";

// Source of truth operacional do snapshot agregado de recomendações de eficiência.
// Referência: docs/architecture/adr-experience-surface-contract-source-of-truth.md

export const optimizationRecommendationSnapshotEntrySchema = z.object({
  key: z.string().min(1),
  count: z.number().int().min(0),
  estimatedSavingsCents: z.number().int().min(0),
});

export const optimizationRecommendationSnapshotTopItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  recommendationType: z.string().min(1),
  subjectType: z.string().min(1),
  subjectId: z.string().min(1),
  workspaceId: z.string().min(1).optional(),
  estimatedSavingsCents: z.number().int().min(0),
  confidence: z.number().min(0).max(1),
});

export const optimizationRecommendationSourceOfTruthSchema = z.object({
  cost: z.enum(["billing_ledger"]),
  usage: z.enum(["run_usage_breakdown"]),
  agents: z.enum(["agent_billing_summary"]),
});

export const optimizationRecommendationSnapshotSchema = z.object({
  scope: z.object({
    tenantId: z.string().min(1),
    workspaceId: z.string().min(1).optional(),
    cycleStart: z.coerce.date(),
    cycleEnd: z.coerce.date(),
  }),
  generatedAt: z.coerce.date(),
  total: z.number().int().min(0),
  totalEstimatedSavingsCents: z.number().int().min(0),
  sourceOfTruth: optimizationRecommendationSourceOfTruthSchema,
  byType: z.record(z.string(), z.number().int().min(0)),
  byWorkspace: z.record(z.string(), z.number().int().min(0)),
  byWorkspaceSavings: z.record(z.string(), z.number().int().min(0)),
  topType: z.string().min(1).nullable(),
  topWorkspace: z.string().min(1).nullable(),
  topRecommendation: optimizationRecommendationSnapshotTopItemSchema.nullable(),
  fleetPolicyCandidates: z.array(fleetPolicyOpportunityContractSchema),
  summary: z.string().min(1),
  items: z.array(optimizationRecommendationSnapshotTopItemSchema),
});

export type OptimizationRecommendationSnapshotEntry = z.infer<
  typeof optimizationRecommendationSnapshotEntrySchema
>;
export type OptimizationRecommendationSnapshotTopItem = z.infer<
  typeof optimizationRecommendationSnapshotTopItemSchema
>;
export type OptimizationRecommendationSourceOfTruth = z.infer<
  typeof optimizationRecommendationSourceOfTruthSchema
>;
export type OptimizationRecommendationSnapshot = z.infer<
  typeof optimizationRecommendationSnapshotSchema
>;

export function buildOptimizationRecommendationSnapshot(
  input: OptimizationRecommendationSnapshot
): OptimizationRecommendationSnapshot {
  return optimizationRecommendationSnapshotSchema.parse(input);
}
