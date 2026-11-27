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

/** Access to a product capability, never authorization of an Agent Protocol action.
 * Additive to the legacy assignment/history gate below; not wired to runtime.
 */
const accessIdSchema = z.string().trim().min(1);
export const verticalAccessContractV1Schema = z.object({
  version: z.literal("vertical.access.v1"),
  verticalId: accessIdSchema,
  productId: accessIdSchema,
  installationRequired: z.boolean(),
  // Identifies the product entitlement derived from TenantProductInstallation.
  // It is not a key looked up in TenantActionPolicy or an arbitrary boolean map.
  entitlementKey: accessIdSchema.nullable(),
  workspacePermission: accessIdSchema,
  stagePolicy: z.enum(["not_required", "required"]),
  // Existing ADR-011 usage is resolved by resolveVerticalUsage at the read boundary.
  revocationPolicy: z.literal("resolved_usage"),
  capabilities: z.array(z.object({
    id: accessIdSchema,
    allowedModes: z.array(z.enum(["read_only", "requires_write"])).min(1),
  }).strict()).min(1),
}).strict().superRefine((contract, ctx) => {
  if (contract.installationRequired !== (contract.entitlementKey !== null)) {
    ctx.addIssue({ code: "custom", message: "Product entitlement requires installation", path: ["entitlementKey"] });
  }
  if (new Set(contract.capabilities.map((entry) => entry.id)).size !== contract.capabilities.length) {
    ctx.addIssue({ code: "custom", message: "Duplicate capability", path: ["capabilities"] });
  }
});

export type VerticalAccessContractV1 = z.infer<typeof verticalAccessContractV1Schema>;

const accessScopeSchema = z.object({ tenantId: accessIdSchema, workspaceId: accessIdSchema }).strict();
export const verticalAccessRequestV1Schema = z.object({
  scope: accessScopeSchema,
  verticalId: accessIdSchema,
  capabilityId: accessIdSchema,
  mode: z.enum(["read_only", "requires_write"]),
  stage: accessIdSchema.optional(),
}).strict();

/** Server-read facts. The caller must validate identity/membership and freshness.
 * Missing facts never acquire defaults that grant access.
 */
export const verticalAccessFactsV1Schema = z.object({
  scope: accessScopeSchema,
  verticalId: accessIdSchema,
  installation: tenantProductInstallationLikeSchema.nullable(),
  workspacePermission: z.object({ key: accessIdSchema, allowed: z.boolean() }).strict(),
  stagePermission: z.object({ stage: accessIdSchema, allowed: z.boolean() }).strict().nullable(),
  usage: z.enum(["full", "read_only", "blocked"]),
}).strict();

export type VerticalAccessRequestV1 = z.infer<typeof verticalAccessRequestV1Schema>;
export type VerticalAccessFactsV1 = z.infer<typeof verticalAccessFactsV1Schema>;

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

