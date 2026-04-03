import {
  buildOptimizationRecommendation,
  buildOptimizationRecommendationBundle,
  OptimizationRecommendation,
  OptimizationRecommendationBundle,
} from "../types/optimizationRecommendationContract";

type EfficiencyWorkspaceItem = {
  workspaceId: string;
  workspaceName: string;
  runs: number;
  costCents: number;
};

type EfficiencyAgentItem = {
  agent: string;
  agentVersion?: string | null;
  runs: number;
  costCents: number;
  tokens: number;
};

type EfficiencyModelItem = {
  provider: string;
  model: string;
  costCents: number;
  tokens: number;
};

type BuildEfficiencyRecommendationBundleParams = {
  tenantId: string;
  workspaceId?: string;
  cycleStart: Date;
  cycleEnd: Date;
  totalCostCents: number;
  byWorkspace: EfficiencyWorkspaceItem[];
  byAgent: EfficiencyAgentItem[];
  byModel: EfficiencyModelItem[];
};

function buildRecommendationId(
  tenantId: string,
  type: OptimizationRecommendation["recommendationType"],
  subjectId: string
) {
  return `optrec:${tenantId}:${type}:${subjectId}`;
}

function buildSavingsProjection(currentCostCents: number, savingsRatio: number) {
  const estimatedSavingsCents = Math.max(0, Math.round(currentCostCents * savingsRatio));
  const projectedCostCents = Math.max(0, currentCostCents - estimatedSavingsCents);
  return {
    estimatedSavingsCents,
    projectedCostCents,
  };
}

export function buildEfficiencyRecommendationBundle(
  params: BuildEfficiencyRecommendationBundleParams
): OptimizationRecommendationBundle {
  const items: OptimizationRecommendation[] = [];

  if (params.totalCostCents <= 0) {
    return buildOptimizationRecommendationBundle({
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      generatedAt: new Date(),
      items: [],
    });
  }

  const byWorkspace = [...params.byWorkspace].sort((a, b) => b.costCents - a.costCents);
  const byAgent = [...params.byAgent].sort((a, b) => b.costCents - a.costCents);
  const byModel = [...params.byModel].sort((a, b) => b.costCents - a.costCents);

  const topWorkspace = byWorkspace[0] ?? null;
  if (topWorkspace && topWorkspace.costCents > 0 && byWorkspace.length > 1) {
    const workspaceShare = topWorkspace.costCents / params.totalCostCents;
    if (workspaceShare >= 0.6) {
      const projection = buildSavingsProjection(topWorkspace.costCents, 0.12);
      items.push(
        buildOptimizationRecommendation({
          id: buildRecommendationId(params.tenantId, "workspace_rebalance", topWorkspace.workspaceId),
          tenantId: params.tenantId,
          workspaceId: topWorkspace.workspaceId,
          recommendationType: "workspace_rebalance",
          subjectType: "workspace",
          subjectId: topWorkspace.workspaceId,
          title: `Rebalancear custo do workspace ${topWorkspace.workspaceName}`,
          summary: `${topWorkspace.workspaceName} concentra ${Math.round(
            workspaceShare * 100
          )}% do custo do tenant no ciclo atual. Vale revisar volume, modelo padrão e distribuição de runs.`,
          timeWindow: {
            label: "current_cycle",
            from: params.cycleStart,
            to: params.cycleEnd,
          },
          currentCostCents: topWorkspace.costCents,
          projectedCostCents: projection.projectedCostCents,
          estimatedSavingsCents: projection.estimatedSavingsCents,
          confidence: 0.72,
          evidenceRefs: [
            {
              source: "tenant_billing_summary",
              refId: topWorkspace.workspaceId,
              label: `workspace:${topWorkspace.workspaceName}`,
            },
          ],
          status: "proposed",
          applyMode: "manual_review",
        })
      );
    }
  }

  const topAgent = byAgent[0] ?? null;
  if (topAgent && topAgent.costCents > 0) {
    const agentShare = topAgent.costCents / params.totalCostCents;
    if (agentShare >= 0.5) {
      const projection = buildSavingsProjection(topAgent.costCents, 0.15);
      items.push(
        buildOptimizationRecommendation({
          id: buildRecommendationId(params.tenantId, "agent_efficiency_review", topAgent.agent),
          tenantId: params.tenantId,
          workspaceId: params.workspaceId,
          recommendationType: "agent_efficiency_review",
          subjectType: "agent",
          subjectId: topAgent.agent,
          title: `Revisar eficiência do agente ${topAgent.agent}`,
          summary: `${topAgent.agent} responde por ${Math.round(
            agentShare * 100
          )}% do custo do tenant no ciclo atual. Vale revisar prompt, frequência e mix de modelo.`,
          timeWindow: {
            label: "current_cycle",
            from: params.cycleStart,
            to: params.cycleEnd,
          },
          currentCostCents: topAgent.costCents,
          projectedCostCents: projection.projectedCostCents,
          estimatedSavingsCents: projection.estimatedSavingsCents,
          confidence: 0.69,
          evidenceRefs: [
            {
              source: "agent_billing_summary",
              refId: `${topAgent.agent}::${topAgent.agentVersion ?? "latest"}`,
              label: `agent:${topAgent.agent}`,
            },
          ],
          status: "proposed",
          applyMode: "manual_review",
        })
      );
    }
  }

  const topModel = byModel[0] ?? null;
  if (topModel && topModel.costCents > 0) {
    const modelShare = topModel.costCents / params.totalCostCents;
    if (modelShare >= 0.45) {
      const projection = buildSavingsProjection(topModel.costCents, 0.18);
      items.push(
        buildOptimizationRecommendation({
          id: buildRecommendationId(
            params.tenantId,
            "model_switch",
            `${topModel.provider}:${topModel.model}`
          ),
          tenantId: params.tenantId,
          workspaceId: params.workspaceId,
          recommendationType: "model_switch",
          subjectType: "model",
          subjectId: `${topModel.provider}:${topModel.model}`,
          title: `Revisar uso dominante de ${topModel.model}`,
          summary: `${topModel.provider}/${topModel.model} concentra ${Math.round(
            modelShare * 100
          )}% do custo do tenant no ciclo atual. Vale avaliar fallback para modelo mais leve em tarefas simples.`,
          timeWindow: {
            label: "current_cycle",
            from: params.cycleStart,
            to: params.cycleEnd,
          },
          currentCostCents: topModel.costCents,
          projectedCostCents: projection.projectedCostCents,
          estimatedSavingsCents: projection.estimatedSavingsCents,
          confidence: 0.66,
          evidenceRefs: [
            {
              source: "run_cost_breakdown",
              refId: `${topModel.provider}:${topModel.model}`,
              label: `model:${topModel.provider}/${topModel.model}`,
            },
            {
              source: "tenant_billing_summary",
              refId: params.tenantId,
              label: "tenant_summary",
            },
          ],
          status: "proposed",
          applyMode: "manual_review",
        })
      );
    }
  }

  return buildOptimizationRecommendationBundle({
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    generatedAt: new Date(),
    items,
  });
}
