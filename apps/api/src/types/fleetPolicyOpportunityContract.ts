import { z } from "zod";

// Source of truth operacional do Fleet Policy Opportunity Contract.
// Referência: docs/architecture/adr-experience-surface-contract-source-of-truth.md

export const fleetPolicyOpportunityPrioritySchema = z.enum(["high", "medium", "low"]);

export const fleetPolicyOpportunityActionSchema = z.object({
  actionType: z.enum(["review_model_default", "rebalance_workspace_policy", "review_agent_model_mix"]),
  label: z.string().min(1),
});

export const fleetPolicyOpportunityContractSchema = z.object({
  subjectId: z.string().min(1),
  label: z.string().min(1),
  workspaceId: z.string().min(1).nullable(),
  model: z.string().min(1).nullable(),
  cycleStart: z.coerce.date(),
  cycleEnd: z.coerce.date(),
  priority: fleetPolicyOpportunityPrioritySchema,
  currentCostCents: z.number().int().min(0),
  estimatedSavingsCents: z.number().int().min(0),
  confidence: z.number().min(0).max(1),
  recommendationType: z.string().min(1),
  suggestedAction: fleetPolicyOpportunityActionSchema,
});

export type FleetPolicyOpportunityContract = z.infer<typeof fleetPolicyOpportunityContractSchema>;
export type FleetPolicyOpportunityPriority = z.infer<typeof fleetPolicyOpportunityPrioritySchema>;

export function buildFleetPolicyOpportunityContract(
  input: FleetPolicyOpportunityContract
): FleetPolicyOpportunityContract {
  return fleetPolicyOpportunityContractSchema.parse(input);
}
