import React from "react";
import type {
  ImobApprovalContextItem,
  ImobKpiFunnel,
  ImobKpiPerformance,
  ImobRescueMetric,
  ImobSpecialistLoadMetric,
} from "@/lib/api";
import { ImobFunnelStepsChart } from "@/features/imob/charts/ImobFunnelStepsChart";
import { ImobJourneyCostChart } from "@/features/imob/charts/ImobJourneyCostChart";
import { ImobCycleTimePanel } from "@/features/imob/charts/ImobCycleTimePanel";
import { ImobFunnelTeamSection } from "@/features/imob/funnel/ImobFunnelTeamSection";
import { resolveKpiRefreshState, shouldShowKpiPlaceholder, shouldShowKpiRefreshingHint } from "@/features/imob/kpiRefreshState";
import { formatPct } from "@/lib/formatters";

export type ImobFunnelTabProps = {
  kpiFunnel: ImobKpiFunnel | null;
  kpiPerformance: ImobKpiPerformance | null;
  kpiLoading: boolean;
  kpiWindowDays: 7 | 15 | 30;
  onWindowChange: (days: 7 | 15 | 30) => void;
  specialistLoad: ImobSpecialistLoadMetric[];
  rescueIndex: ImobRescueMetric[];
  approvalContext: ImobApprovalContextItem[];
  telemetryMetrics?: React.ComponentProps<typeof ImobFunnelTeamSection>["telemetryMetrics"];
  buildApprovalHref: (item: ImobApprovalContextItem) => string;
  onApprovalAction: (item: ImobApprovalContextItem, action: "approve" | "delegate" | "escalate") => Promise<void> | void;
};

/** Funil, custo por jornada, ciclo operacional e equipe do IMOB — o mesmo conteúdo, hospedado pelo Front Door (cartão "Gestão IMOB"). */
export function ImobFunnelTab({
  kpiFunnel, kpiPerformance, kpiLoading, kpiWindowDays, onWindowChange, specialistLoad, rescueIndex, approvalContext,
  telemetryMetrics = null, buildApprovalHref, onApprovalAction,
}: ImobFunnelTabProps) {
  const totalImobRunCostCents = kpiFunnel?.totalRunCostCents ?? 0;
  const durationSampleSize = kpiFunnel?.coverage.durationSampleSize ?? 0;
  const resolutionSampleSize = kpiFunnel?.coverage.resolutionSampleSize ?? 0;
  const hasDurationCoverage = durationSampleSize > 0 && kpiFunnel?.averageDurationHours != null;
  const hasResolutionCoverage = resolutionSampleSize > 0;
  const globalClosingPct = React.useMemo(() => {
    const opened = kpiFunnel?.totals.cases ?? 0;
    const closings = kpiFunnel?.totals.closings ?? 0;
    if (opened <= 0) return null;
    return (closings / opened) * 100;
  }, [kpiFunnel]);
  const kpiRefreshState = resolveKpiRefreshState({ loading: kpiLoading, hasSnapshot: kpiFunnel != null });
  const performanceRefreshState = resolveKpiRefreshState({ loading: kpiLoading, hasSnapshot: kpiPerformance != null });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-surface/40 px-4 py-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Janela analítica</p>
          <p className="mt-1 text-sm text-foreground">O recorte abaixo vale para funil, custo por jornada e ciclo operacional.</p>
        </div>
        <div className="flex gap-1">
          {([7, 15, 30] as const).map((days) => (
            <button
              key={days}
              type="button"
              onClick={() => onWindowChange(days)}
              className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] transition ${
                kpiWindowDays === days
                  ? "border-accent/60 bg-accent/20 text-accent"
                  : "border-white/15 bg-white/5 text-muted-foreground hover:border-white/30"
              }`}
            >
              {days}d
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <article className="rounded-2xl border border-white/10 bg-surface/60 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Conversão global do funil</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">
            {globalClosingPct != null ? formatPct(globalClosingPct) : shouldShowKpiPlaceholder(kpiRefreshState) ? "..." : "—"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {shouldShowKpiRefreshingHint(kpiRefreshState) ? "Atualizando recorte..." : `${kpiFunnel?.totals.closings ?? 0} fechamento(s) de ${kpiFunnel?.totals.cases ?? 0} caso(s)`}
          </p>
        </article>
        <article className="rounded-2xl border border-white/10 bg-surface/60 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Conversão proposta → fechamento</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">
            {kpiFunnel?.conversions.proposalToClosingPct != null ? formatPct(kpiFunnel?.conversions.proposalToClosingPct) : shouldShowKpiPlaceholder(kpiRefreshState) ? "..." : "—"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {shouldShowKpiRefreshingHint(kpiRefreshState) ? "Atualizando recorte..." : `${kpiFunnel?.totals.closings ?? 0} fechamento(s) de ${kpiFunnel?.totals.proposals ?? 0} proposta(s)`}
          </p>
        </article>
        <article className="rounded-2xl border border-white/10 bg-surface/60 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Tempo médio até fechamento</p>
          {shouldShowKpiPlaceholder(kpiRefreshState) ? (
            <p className="mt-2 text-2xl font-semibold text-foreground">...</p>
          ) : hasDurationCoverage ? (
            <p className="mt-2 text-2xl font-semibold text-foreground">
              {`${kpiFunnel.averageDurationHours.toFixed(1)}h`}
            </p>
          ) : (
            <p className="mt-2 text-sm font-semibold text-muted-foreground">Sem dados suficientes</p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            {shouldShowKpiRefreshingHint(kpiRefreshState) ? "Atualizando recorte..." : hasDurationCoverage ? `${durationSampleSize} fechamento(s) medidos` : "Nenhum fechamento medido no recorte"}
          </p>
        </article>
        <article className="rounded-2xl border border-white/10 bg-surface/60 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Pendências resolvidas em 48h</p>
          {shouldShowKpiPlaceholder(kpiRefreshState) ? (
            <p className="mt-2 text-2xl font-semibold text-foreground">...</p>
          ) : hasResolutionCoverage ? (
            <p className="mt-2 text-2xl font-semibold text-foreground">
              {formatPct(kpiFunnel?.docsResolved48hPct)}
            </p>
          ) : (
            <p className="mt-2 text-sm font-semibold text-muted-foreground">Sem dados suficientes</p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            {shouldShowKpiRefreshingHint(kpiRefreshState) ? "Atualizando recorte..." : hasResolutionCoverage ? `${resolutionSampleSize} fechamento(s) medidos` : "Nenhum fechamento elegível no recorte"}
          </p>
        </article>
        <article className="rounded-2xl border border-white/10 bg-surface/60 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Casos sem broker canônico</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">
            {shouldShowKpiPlaceholder(performanceRefreshState) ? "..." : kpiPerformance?.unassigned?.cases ?? 0}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {shouldShowKpiRefreshingHint(performanceRefreshState)
              ? "Atualizando recorte..."
              : `${kpiPerformance?.unassigned?.label ?? "Pendência operacional"} • ${kpiWindowDays}d`}
          </p>
        </article>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <ImobFunnelStepsChart steps={kpiFunnel?.steps ?? []} loading={kpiLoading} windowDays={kpiWindowDays} />
        <ImobJourneyCostChart
          items={kpiFunnel?.costByJourney ?? []}
          totalCostCents={totalImobRunCostCents}
          costCoverage={kpiFunnel?.costCoverage ?? null}
          loading={kpiLoading}
        />
      </div>
      <ImobCycleTimePanel
        docsResolved48hPct={kpiFunnel?.docsResolved48hPct ?? 0}
        averageDurationHours={kpiFunnel?.averageDurationHours ?? null}
        durationSampleSize={durationSampleSize}
        resolutionSampleSize={resolutionSampleSize}
        loading={kpiLoading}
        windowDays={kpiWindowDays}
      />
      <ImobFunnelTeamSection
        specialistLoad={specialistLoad}
        rescueIndex={rescueIndex}
        approvalContext={approvalContext}
        kpiPerformance={kpiPerformance}
        kpiLoading={kpiLoading}
        kpiWindowDays={kpiWindowDays}
        telemetryMetrics={telemetryMetrics}
        buildApprovalHref={buildApprovalHref}
        onApprovalAction={onApprovalAction}
      />
    </div>
  );
}
