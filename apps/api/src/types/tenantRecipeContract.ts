import { z } from "zod";

// Source of truth operacional do Tenant Recipe Contract.
// Referência: docs/architecture/adr-experience-surface-contract-source-of-truth.md

export const tenantRecipeStatusSchema = z.enum(["draft", "homologated", "deprecated"]);

export const tenantRecipeWorkspaceScopeSchema = z
  .object({
    mode: z.enum(["all_workspaces", "selected_workspaces"]),
    workspaceIds: z.array(z.string().min(1)).default([]),
  })
  .superRefine((value, ctx) => {
    if (value.mode === "selected_workspaces" && value.workspaceIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["workspaceIds"],
        message: "selected_workspaces requires at least one workspace id",
      });
    }
    if (value.mode === "all_workspaces" && value.workspaceIds.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["workspaceIds"],
        message: "all_workspaces must not include explicit workspace ids",
      });
    }
  });

export const tenantRecipeContractSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  agentId: z.string().min(1),
  title: z.string().min(1).max(140),
  summary: z.string().min(1).max(500),
  instructions: z.string().max(4000).nullable().default(null),
  status: tenantRecipeStatusSchema,
  workspaceScope: tenantRecipeWorkspaceScopeSchema,
  tags: z.array(z.string().min(1).max(40)).max(12).default([]),
  createdByUserId: z.string().min(1).nullable().default(null),
  updatedByUserId: z.string().min(1).nullable().default(null),
  homologatedAt: z.string().datetime().nullable().default(null),
  deprecatedAt: z.string().datetime().nullable().default(null),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type TenantRecipeStatus = z.infer<typeof tenantRecipeStatusSchema>;
export type TenantRecipeWorkspaceScope = z.infer<typeof tenantRecipeWorkspaceScopeSchema>;
export type TenantRecipeContract = z.infer<typeof tenantRecipeContractSchema>;

export function buildTenantRecipeContract(input: unknown): TenantRecipeContract {
  return tenantRecipeContractSchema.parse(input);
}
