export type OptimizationRecommendationSnapshotItem = {
  id: string;
  title: string;
  recommendationType: string;
  subjectType: string;
  subjectId: string;
  workspaceId?: string;
  estimatedSavingsCents: number;
  confidence: number;
};

export type FleetPolicyOpportunity = {
  subjectId: string;
  label: string;
  workspaceId: string | null;
  model: string | null;
  cycleStart: string;
  cycleEnd: string;
  priority: "high" | "medium" | "low";
  currentCostCents: number;
  estimatedSavingsCents: number;
  confidence: number;
  recommendationType: string;
  suggestedAction: {
    actionType: "review_model_default" | "rebalance_workspace_policy" | "review_agent_model_mix";
    label: string;
  };
};

export type OptimizationRecommendationSnapshot = {
  scope: {
    tenantId: string;
    workspaceId?: string;
    cycleStart: string;
    cycleEnd: string;
  };
  generatedAt: string;
  total: number;
  totalEstimatedSavingsCents: number;
  sourceOfTruth: {
    cost: "billing_ledger";
    usage: "run_usage_breakdown";
    agents: "agent_billing_summary";
  };
  byType: Record<string, number>;
  byWorkspace: Record<string, number>;
  byWorkspaceSavings: Record<string, number>;
  topType: string | null;
  topWorkspace: string | null;
  topRecommendation: OptimizationRecommendationSnapshotItem | null;
  fleetPolicyCandidates: FleetPolicyOpportunity[];
  summary: string;
  items: OptimizationRecommendationSnapshotItem[];
};
