import { z } from "zod";

// Source of truth operacional do cruzamento entre fricção e eficiência.
// Referência: docs/architecture/adr-experience-surface-contract-source-of-truth.md

export const operationalInsightPrioritySchema = z.enum([
  "observe",
  "friction_first",
  "efficiency_first",
  "balanced",
]);

export const operationalInsightSnapshotSchema = z.object({
  scope: z.object({
    tenantId: z.string().min(1),
    workspaceId: z.string().min(1),
    window: z.enum(["7d", "30d"]),
  }),
  frictionTotal: z.number().int().min(0),
  optimizationTotal: z.number().int().min(0),
  topFrictionKind: z.string().min(1).nullable(),
  topFrictionSurface: z.string().min(1).nullable(),
  topOptimizationType: z.string().min(1).nullable(),
  topOptimizationWorkspace: z.string().min(1).nullable(),
  priority: operationalInsightPrioritySchema,
  summary: z.string().min(1),
  recommendedFocus: z.string().min(1),
});

export type OperationalInsightPriority = z.infer<typeof operationalInsightPrioritySchema>;
export type OperationalInsightSnapshot = z.infer<typeof operationalInsightSnapshotSchema>;

export function buildOperationalInsightSnapshot(
  input: OperationalInsightSnapshot
): OperationalInsightSnapshot {
  return operationalInsightSnapshotSchema.parse(input);
}
