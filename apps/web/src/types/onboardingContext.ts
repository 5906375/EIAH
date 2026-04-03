export type OnboardingContext = {
  roleProfile: "workspace_member" | "workspace_admin" | "tenant_admin" | "founder_global";
  activeDomain: "general" | "imob";
  workspaceId: string;
  tenantId: string;
  installedProducts: string[];
  visibleRecipes: Array<{
    id: string;
    title: string;
    agentId: string;
  }>;
  nextSteps: string[];
  constraints: string[];
  summary: string;
};
