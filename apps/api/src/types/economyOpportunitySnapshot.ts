import { z } from "zod";
import { fleetPolicyOpportunityContractSchema } from "./fleetPolicyOpportunityContract";

// Source of truth operacional do Economy Opportunity Snapshot.
// Referência: docs/architecture/adr-experience-surface-contract-source-of-truth.md

export const economyCostOpportunitySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  workspaceId: z.string().min(1).nullable(),
  estimatedSavingsCents: z.number().int().min(0),
  confidence: z.number().min(0).max(1),
});

export const economyAuditableCostAttentionSchema = z.object({
  status: z.enum(["clear", "attention_required"]),
  classification: z.enum(["healthy", "watch", "critical"]),
  summary: z.string().min(1),
  amountCents: z.number().int().min(0),
  reasonCodes: z.array(z.string().min(1)),
});

export const economyOpportunitySnapshotSchema = z.object({
  scope: z.object({
    tenantId: z.string().min(1),
    workspaceId: z.string().min(1).optional(),
    cycleStart: z.coerce.date(),
    cycleEnd: z.coerce.date(),
  }),
  sourceOfTruth: z.object({
    cost: z.enum(["billing_ledger"]),
    usage: z.enum(["run_usage_breakdown"]),
    audit: z.enum(["billing_reconciliation"]),
  }),
  generatedAt: z.coerce.date(),
  total: z.number().int().min(0),
  topStatus: z.enum(["healthy", "watch", "critical"]),
  topPriority: z.enum(["auditable_cost_attention", "fleet_policy", "cost_opportunity"]).nullable(),
  consolidatedClassification: z.enum(["healthy", "watch", "critical"]),
  tenantRecommendation: z.string().min(1),
  consolidatedSummary: z.string().min(1),
  summary: z.string().min(1),
  costOpportunities: z.array(economyCostOpportunitySchema),
  fleetPolicyOpportunities: z.array(fleetPolicyOpportunityContractSchema),
  auditableCostAttention: economyAuditableCostAttentionSchema,
});

export type EconomyCostOpportunity = z.infer<typeof economyCostOpportunitySchema>;
export type EconomyAuditableCostAttention = z.infer<typeof economyAuditableCostAttentionSchema>;
export type EconomyOpportunitySnapshot = z.infer<typeof economyOpportunitySnapshotSchema>;

export function buildEconomyOpportunitySnapshot(
  input: EconomyOpportunitySnapshot
): EconomyOpportunitySnapshot {
  return economyOpportunitySnapshotSchema.parse(input);
}
