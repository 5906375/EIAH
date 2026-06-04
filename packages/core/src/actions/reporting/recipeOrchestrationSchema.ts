import { z } from "zod";

export const RecipeOrchestrationIntentSchema = z.enum([
  "go_live_validation",
  "evidence_collection",
  "imob_task",
  "legal_review",
  "report_generation",
  "pitch_creation",
  "financial_analysis",
  "urban_service",
  "general_task",
  "unknown",
]);

export const RecipeOrchestrationDomainSchema = z.enum([
  "guardian",
  "imob",
  "legal",
  "finance",
  "urban",
  "pitch",
  "general",
  "unknown",
]);

export const RecipeOrchestrationRiskLevelSchema = z.enum(["low", "medium", "high", "critical"]);
export const RecipeOrchestrationAgentKeySchema = z.enum([
  "guardian",
  "eiah",
  "j_360",
  "pitch",
  "imob",
  "legal",
  "finance",
  "urban",
  "other",
]);

export const RecipeOrchestrationSupportModeSchema = z.enum([
  "none",
  "suggest_only",
  "delegate_assisted",
  "external_handoff",
]);

export const RecipeOrchestrationAgentSelectionSchema = z.object({
  key: RecipeOrchestrationAgentKeySchema,
  displayName: z.string().min(1),
  selectionReason: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

export const RecipeOrchestrationSuggestedAgentSchema = z.object({
  key: RecipeOrchestrationAgentKeySchema,
  displayName: z.string().min(1),
  purpose: z.string().min(1),
  canExecute: z.boolean(),
  canAdvise: z.boolean(),
  requiresApproval: z.boolean(),
  requiredScope: z.string().nullable(),
  estimatedCostStatus: z.enum(["calculated", "not_calculated", "not_reported"]),
});

export const RecipeOrchestrationGovernanceSchema = z.object({
  tenantIdPresent: z.boolean(),
  workspaceIdPresent: z.boolean(),
  rbacEvaluated: z.boolean(),
  entitlementEvaluated: z.boolean(),
  trustScoreEvaluated: z.boolean(),
  costGuardEvaluated: z.boolean(),
  policyDecision: z.enum(["allowed", "denied", "approval_required", "not_evaluated"]),
  reasonCode: z.string().nullable(),
});

export const RecipeOrchestrationAuditSchema = z.object({
  orchestrationDecisionId: z.string().nullable(),
  selectedAt: z.string().nullable(),
  basedOnPattern: z.literal("chat_imob_orchestrator"),
});

export const RecipeOrchestrationRecipeStepSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  objective: z.string().default(""),
  checks: z.array(z.string()).default([]),
  evidence: z.array(z.string()).default([]),
  blocking: z.boolean().default(true),
});

export const RecipeOrchestrationRecommendedRecipeSchema = z.object({
  order: z.number().int().positive(),
  title: z.string().min(1),
  objective: z.string().min(1),
  externalPlatform: z.string().nullable().default(null),
});

export const RecipeOrchestrationSchema = z.object({
  schemaVersion: z.literal("recipe_orchestration.v1"),
  source: z.literal("recipe_run"),
  recipeId: z.string().nullable(),
  recipeTitle: z.string().nullable(),
  recipeGoal: z.string().nullable().default(null),
  recipeExpectedOutcome: z.string().nullable().default(null),
  recipeSteps: z.array(RecipeOrchestrationRecipeStepSchema).default([]),
  intent: RecipeOrchestrationIntentSchema,
  domain: RecipeOrchestrationDomainSchema,
  riskLevel: RecipeOrchestrationRiskLevelSchema,
  primaryAgent: RecipeOrchestrationAgentSelectionSchema,
  requiresGuardianReview: z.boolean(),
  guardianReviewReason: z.array(z.string()).default([]),
  supportMode: RecipeOrchestrationSupportModeSchema,
  allowedSelfServiceAgents: z.array(RecipeOrchestrationAgentKeySchema).default([]),
  suggestedSelfServiceAgents: z.array(RecipeOrchestrationSuggestedAgentSchema).default([]),
  limitations: z.array(z.string()).default([]),
  howToProceedNow: z.array(z.string()).default([]),
  recommendedRecipes: z.array(RecipeOrchestrationRecommendedRecipeSchema).default([]),
  externalPlatformsInvolved: z.array(z.string()).default([]),
  nextBestImplementationAction: z.string().nullable().default(null),
  practicalSteps: z.array(z.string()).default([]),
  readyForRerunWhen: z.array(z.string()).default([]),
  governance: RecipeOrchestrationGovernanceSchema,
  audit: RecipeOrchestrationAuditSchema,
});

export type RecipeOrchestration = z.infer<typeof RecipeOrchestrationSchema>;
export type RecipeOrchestrationAgentKey = z.infer<typeof RecipeOrchestrationAgentKeySchema>;
