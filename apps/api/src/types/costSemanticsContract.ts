import { z } from "zod";

// Source of truth operacional da semântica de custo da plataforma.
// Referência: docs/architecture/platform-experience-optimization.md (PX-103)

export const costSemanticKindSchema = z.enum([
  "execution_cost",
  "workspace_consumption",
  "auditable_cost",
]);

export const costSemanticStatusSchema = z.enum([
  "estimated",
  "actual",
  "reconciled",
  "attention_required",
]);

export const costSemanticScopeSchema = z.object({
  tenantId: z.string().min(1).optional(),
  workspaceId: z.string().min(1).optional(),
  runId: z.string().min(1).optional(),
  cycleStart: z.coerce.date().optional(),
  cycleEnd: z.coerce.date().optional(),
});

export const costSemanticSnapshotSchema = z.object({
  kind: costSemanticKindSchema,
  title: z.string().min(1),
  summary: z.string().min(1),
  amountCents: z.number().int().min(0),
  currency: z.literal("BRL"),
  status: costSemanticStatusSchema,
  scope: costSemanticScopeSchema,
  sourceOfTruth: z.enum(["run", "usage_ledger", "billing_reconciliation"]),
});

export const costOverviewBlockSchema = z.object({
  executionCost: costSemanticSnapshotSchema.optional(),
  workspaceConsumption: costSemanticSnapshotSchema.optional(),
  auditableCost: costSemanticSnapshotSchema.optional(),
});

export type CostSemanticKind = z.infer<typeof costSemanticKindSchema>;
export type CostSemanticStatus = z.infer<typeof costSemanticStatusSchema>;
export type CostSemanticScope = z.infer<typeof costSemanticScopeSchema>;
export type CostSemanticSnapshot = z.infer<typeof costSemanticSnapshotSchema>;
export type CostOverviewBlock = z.infer<typeof costOverviewBlockSchema>;

export function buildCostSemanticSnapshot(input: CostSemanticSnapshot): CostSemanticSnapshot {
  return costSemanticSnapshotSchema.parse(input);
}

export function buildCostOverviewBlock(input: CostOverviewBlock): CostOverviewBlock {
  return costOverviewBlockSchema.parse(input);
}

export function resolveCostSemanticLabel(kind: CostSemanticKind) {
  switch (kind) {
    case "execution_cost":
      return "Custo desta execução";
    case "workspace_consumption":
      return "Consumo do workspace";
    case "auditable_cost":
      return "Custo auditável";
  }
}
