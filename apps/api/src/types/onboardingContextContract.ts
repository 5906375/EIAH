import { z } from "zod";

// Source of truth operacional do Onboarding Context Contract.
// Referência: docs/architecture/adr-experience-surface-contract-source-of-truth.md

export const onboardingRoleProfileSchema = z.enum([
  "workspace_member",
  "workspace_admin",
  "tenant_admin",
  "founder_global",
]);

export const onboardingActiveDomainSchema = z.enum(["general", "imob"]);

export const onboardingRecipeRefSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  agentId: z.string().min(1),
});

export const onboardingContextContractSchema = z.object({
  roleProfile: onboardingRoleProfileSchema,
  activeDomain: onboardingActiveDomainSchema,
  workspaceId: z.string().min(1),
  tenantId: z.string().min(1),
  installedProducts: z.array(z.string().min(1)),
  visibleRecipes: z.array(onboardingRecipeRefSchema),
  nextSteps: z.array(z.string().min(1)).min(1),
  constraints: z.array(z.string().min(1)),
  summary: z.string().min(1),
});

export type OnboardingContextContract = z.infer<typeof onboardingContextContractSchema>;

export function buildOnboardingContextContract(input: unknown): OnboardingContextContract {
  return onboardingContextContractSchema.parse(input);
}
