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

export const tenantRecipeContentStepSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(140),
  objective: z.string().max(1000).default(""),
  checks: z.array(z.string().min(1).max(280)).max(20).default([]),
  evidence: z.array(z.string().min(1).max(280)).max(20).default([]),
  blocking: z.boolean().default(true),
});

export const tenantRecipeContentSchema = z.object({
  schemaVersion: z.literal("v2").default("v2"),
  mode: z.enum(["simple", "staged"]),
  goal: z.string().max(2000).default(""),
  expectedOutcome: z.string().max(2000).default(""),
  goCondition: z.string().max(2000).default(""),
  blockCondition: z.string().max(2000).default(""),
  steps: z.array(tenantRecipeContentStepSchema).max(12).default([]),
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
  content: tenantRecipeContentSchema.nullable().default(null),
  createdByUserId: z.string().min(1).nullable().default(null),
  updatedByUserId: z.string().min(1).nullable().default(null),
  homologatedAt: z.string().datetime().nullable().default(null),
  deprecatedAt: z.string().datetime().nullable().default(null),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type TenantRecipeStatus = z.infer<typeof tenantRecipeStatusSchema>;
export type TenantRecipeWorkspaceScope = z.infer<typeof tenantRecipeWorkspaceScopeSchema>;
export type TenantRecipeContentStep = z.infer<typeof tenantRecipeContentStepSchema>;
export type TenantRecipeContent = z.infer<typeof tenantRecipeContentSchema>;
export type TenantRecipeContract = z.infer<typeof tenantRecipeContractSchema>;

export function buildTenantRecipeContract(input: unknown): TenantRecipeContract {
  return tenantRecipeContractSchema.parse(input);
}
