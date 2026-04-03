export type OperationalInsightSnapshot = {
  scope: {
    tenantId: string;
    workspaceId: string;
    window: "7d" | "30d";
  };
  frictionTotal: number;
  optimizationTotal: number;
  topFrictionKind: string | null;
  topFrictionSurface: string | null;
  topOptimizationType: string | null;
  topOptimizationWorkspace: string | null;
  priority: "observe" | "friction_first" | "efficiency_first" | "balanced";
  summary: string;
  recommendedFocus: string;
};
