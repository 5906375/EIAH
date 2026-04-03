export type TenantRecipeStatus = "draft" | "homologated" | "deprecated";

export type TenantRecipeWorkspaceScope = {
  mode: "all_workspaces" | "selected_workspaces";
  workspaceIds: string[];
};

export type TenantRecipe = {
  id: string;
  tenantId: string;
  agentId: string;
  title: string;
  summary: string;
  instructions?: string | null;
  status: TenantRecipeStatus;
  workspaceScope: TenantRecipeWorkspaceScope;
  tags: string[];
  createdByUserId?: string | null;
  updatedByUserId?: string | null;
  homologatedAt?: string | null;
  deprecatedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};
