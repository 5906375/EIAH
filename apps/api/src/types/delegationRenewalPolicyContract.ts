import { z } from "zod";

// Source of truth operacional do Delegation Renewal Policy Contract.
// Referência: docs/architecture/adr-experience-surface-contract-source-of-truth.md

export const delegationRenewalModeSchema = z.enum(["manual_only", "assisted", "auto_eligible"]);
export const delegationRenewalEvaluationSchema = z.enum([
  "eligible",
  "review_required",
  "too_early",
  "blocked",
]);

export const delegationRenewalPolicyContractSchema = z.object({
  renewalMode: delegationRenewalModeSchema,
  renewalWindowDays: z.number().int().min(1).max(90),
  extensionDays: z.number().int().min(1).max(180),
  minTrustToAutoRenew: z.number().int().min(0).max(100),
  failClosed: z.boolean(),
  allowedScopes: z.array(z.enum(["read", "execute", "admin"])).min(1),
});

export const delegationRenewalPreviewSchema = z.object({
  policy: delegationRenewalPolicyContractSchema,
  evaluation: delegationRenewalEvaluationSchema,
  summary: z.string().min(1),
  recommendedValidUntil: z.string().datetime().nullable(),
  daysUntilExpiry: z.number().int(),
  canApplyRenewal: z.boolean(),
  autoEligible: z.boolean(),
});

export type DelegationRenewalPolicyContract = z.infer<typeof delegationRenewalPolicyContractSchema>;
export type DelegationRenewalPreview = z.infer<typeof delegationRenewalPreviewSchema>;

export function buildDelegationRenewalPolicyContract(input: unknown): DelegationRenewalPolicyContract {
  return delegationRenewalPolicyContractSchema.parse(input);
}

export function buildDelegationRenewalPreview(input: unknown): DelegationRenewalPreview {
  return delegationRenewalPreviewSchema.parse(input);
}
