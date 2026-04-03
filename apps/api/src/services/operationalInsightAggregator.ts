import {
  buildOperationalInsightSnapshot,
  OperationalInsightSnapshot,
} from "../types/operationalInsightSnapshot";
import { type ExperienceDiagnosticsWindow } from "../types/experienceDiagnosticSnapshot";
import { type FrictionEventSummary } from "../types/frictionEventSummary";
import { type OptimizationRecommendationSnapshot } from "../types/optimizationRecommendationSnapshot";

function getTopEntry(record: Record<string, number>) {
  return Object.entries(record).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

export function buildOperationalInsight(params: {
  tenantId: string;
  workspaceId: string;
  window: ExperienceDiagnosticsWindow;
  frictionSummary: FrictionEventSummary;
  optimizationSnapshot: OptimizationRecommendationSnapshot;
}): OperationalInsightSnapshot {
  const topFrictionKind = getTopEntry(params.frictionSummary.byKind);
  const topFrictionSurface = getTopEntry(params.frictionSummary.bySurface);
  const topOptimizationType = params.optimizationSnapshot.topType;
  const topOptimizationWorkspace = params.optimizationSnapshot.topWorkspace;
  const priority =
    params.frictionSummary.total === 0 && params.optimizationSnapshot.total === 0
      ? "observe"
      : params.frictionSummary.total > 0 && params.optimizationSnapshot.total === 0
        ? "friction_first"
        : params.frictionSummary.total === 0 && params.optimizationSnapshot.total > 0
          ? "efficiency_first"
          : params.frictionSummary.total >= params.optimizationSnapshot.total
            ? "friction_first"
            : "balanced";
  const summary =
    params.frictionSummary.total === 0 && params.optimizationSnapshot.total === 0
      ? `Sem sinais relevantes de fricção ou eficiência na janela ${params.window}.`
      : params.frictionSummary.total > 0 && params.optimizationSnapshot.total === 0
        ? `A leitura operacional está concentrada em fricção, com destaque para ${topFrictionKind ?? "eventos não classificados"} em ${topFrictionSurface ?? "surface não definida"}.`
        : params.frictionSummary.total === 0 && params.optimizationSnapshot.total > 0
          ? `A leitura operacional está concentrada em eficiência, com foco em ${topOptimizationType ?? "recomendações gerais"} e economia potencial de ${(params.optimizationSnapshot.totalEstimatedSavingsCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.`
          : `Há sinais combinados de fricção e eficiência: top friction ${topFrictionKind ?? "—"} e top optimization ${topOptimizationType ?? "—"}.`;
  const recommendedFocus =
    priority === "observe"
      ? "Manter observação passiva até surgirem novos sinais auditáveis."
      : priority === "friction_first"
        ? `Priorizar redução de fricção em ${topFrictionSurface ?? "surface dominante"} antes de ampliar automações de eficiência.`
        : priority === "efficiency_first"
          ? `Priorizar revisão de custo/uso em ${topOptimizationWorkspace ?? "tenant_scope"} antes de expandir novas superfícies.`
          : `Tratar fricção e eficiência em paralelo, começando por ${topFrictionSurface ?? "surface dominante"} e ${topOptimizationWorkspace ?? "tenant_scope"}.`;

  return buildOperationalInsightSnapshot({
    scope: {
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      window: params.window,
    },
    frictionTotal: params.frictionSummary.total,
    optimizationTotal: params.optimizationSnapshot.total,
    topFrictionKind,
    topFrictionSurface,
    topOptimizationType,
    topOptimizationWorkspace,
    priority,
    summary,
    recommendedFocus,
  });
}
