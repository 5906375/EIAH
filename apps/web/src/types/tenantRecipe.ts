export type TenantRecipeStatus = "draft" | "homologated" | "deprecated";

export type TenantRecipeWorkspaceScope = {
  mode: "all_workspaces" | "selected_workspaces";
  workspaceIds: string[];
};

export type TenantRecipeContentStep = {
  id: string;
  title: string;
  objective: string;
  checks: string[];
  evidence: string[];
  blocking: boolean;
};

export type TenantRecipeContent = {
  schemaVersion: "v2";
  mode: "simple" | "staged";
  goal: string;
  expectedOutcome: string;
  goCondition: string;
  blockCondition: string;
  steps: TenantRecipeContentStep[];
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
  content?: TenantRecipeContent | null;
  createdByUserId?: string | null;
  updatedByUserId?: string | null;
  homologatedAt?: string | null;
  deprecatedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};
