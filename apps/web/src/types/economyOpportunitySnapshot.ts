export type EconomyOpportunitySnapshot = {
  scope: {
    tenantId: string;
    workspaceId?: string;
    cycleStart: string;
    cycleEnd: string;
  };
  sourceOfTruth: {
    cost: "billing_ledger";
    usage: "run_usage_breakdown";
    audit: "billing_reconciliation";
  };
  generatedAt: string;
  total: number;
  topStatus: "healthy" | "watch" | "critical";
  topPriority: "auditable_cost_attention" | "fleet_policy" | "cost_opportunity" | null;
  consolidatedClassification: "healthy" | "watch" | "critical";
  tenantRecommendation: string;
  consolidatedSummary: string;
  summary: string;
  costOpportunities: Array<{
    id: string;
    title: string;
    workspaceId: string | null;
    estimatedSavingsCents: number;
    confidence: number;
  }>;
  fleetPolicyOpportunities: Array<{
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
  }>;
  auditableCostAttention: {
    status: "clear" | "attention_required";
    classification: "healthy" | "watch" | "critical";
    summary: string;
    amountCents: number;
    reasonCodes: string[];
  };
};
