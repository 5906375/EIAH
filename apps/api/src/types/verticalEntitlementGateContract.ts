import { z } from "zod";

export const verticalEntitlementStatusSchema = z.enum([
  "active",
  "suspended",
  "past_due",
  "inactive",
]);

export const verticalEntitlementActionSchema = z.enum([
  "read_history",
  "assign_responsible",
  "start_new_execution",
  "expand_activation",
]);

export const tenantProductInstallationLikeSchema = z.object({
  tenantId: z.string().min(1),
  workspaceId: z.string().min(1),
  product: z.string().min(1),
  status: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const verticalEntitlementGateInputSchema = z.object({
  installation: tenantProductInstallationLikeSchema.nullable(),
  action: verticalEntitlementActionSchema,
  billingPastDue: z.boolean().default(false),
  gracePeriodActive: z.boolean().default(false),
});

export type VerticalEntitlementStatus = z.infer<typeof verticalEntitlementStatusSchema>;
export type VerticalEntitlementAction = z.infer<typeof verticalEntitlementActionSchema>;
export type TenantProductInstallationLike = z.infer<typeof tenantProductInstallationLikeSchema>;
export type VerticalEntitlementGateInput = z.infer<typeof verticalEntitlementGateInputSchema>;

export function resolveOperationalEntitlementStatus(input: {
  installation: TenantProductInstallationLike | null;
  billingPastDue?: boolean;
  gracePeriodActive?: boolean;
}): VerticalEntitlementStatus {
  if (!input.installation) return "inactive";

  const installationStatus = input.installation.status.trim().toLowerCase();
  if (installationStatus !== "active") {
    if (installationStatus === "suspended") return "suspended";
    return "inactive";
  }

  if (input.billingPastDue && !input.gracePeriodActive) return "past_due";
  return "active";
}

export function evaluateVerticalEntitlementGate(rawInput: unknown) {
  const input = verticalEntitlementGateInputSchema.parse(rawInput);
  const status = resolveOperationalEntitlementStatus({
    installation: input.installation,
    billingPastDue: input.billingPastDue,
    gracePeriodActive: input.gracePeriodActive,
  });

  switch (status) {
    case "active":
      return { allowed: true, status, reason: "enabled" as const };
    case "suspended":
      return {
        allowed: input.action === "read_history",
        status,
        reason: input.action === "read_history" ? "read_only" as const : "suspended_block" as const,
      };
    case "past_due":
      if (input.action === "read_history") {
        return { allowed: true, status, reason: "read_only" as const };
      }
      return {
        allowed: false,
        status,
        reason: "past_due_block" as const,
      };
    case "inactive":
    default:
      return {
        allowed: input.action === "read_history",
        status: "inactive" as const,
        reason: input.action === "read_history" ? "read_only" as const : "inactive_block" as const,
      };
  }
}

