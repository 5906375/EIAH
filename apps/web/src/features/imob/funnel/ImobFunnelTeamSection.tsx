import React from "react";

import type {
  ImobApprovalContextItem,
  ImobKpiPerformance,
  ImobRescueMetric,
  ImobSpecialistLoadMetric,
} from "@/lib/api";
import { ImobApprovalContextCard } from "@/features/imob/ImobApprovalContextCard";
import { ImobRescueIndex } from "@/features/imob/ImobRescueIndex";
import { ImobSpecialistLoadBoard } from "@/features/imob/ImobSpecialistLoadBoard";
import { ImobBrokerChart } from "@/features/imob/charts/ImobBrokerChart";

type ApprovalAction = "approve" | "delegate" | "escalate";

type Props = {
  specialistLoad: ImobSpecialistLoadMetric[];
  rescueIndex: ImobRescueMetric[];
  approvalContext: ImobApprovalContextItem[];
  kpiPerformance: ImobKpiPerformance | null;
  kpiLoading: boolean;
  kpiWindowDays: 7 | 15 | 30;
  telemetryMetrics?: {
    messageToPlanAvgMs: number | null;
    planToExecuteAvgMs: number | null;
    chatToRunCoveragePct: number;
    persistSuccessRatePct: number;
  } | null;
  buildApprovalHref: (item: ImobApprovalContextItem) => string;
  onApprovalAction: (item: ImobApprovalContextItem, action: ApprovalAction) => Promise<void> | void;
};

function formatLatencyMs(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  if (value >= 1000) return `${(value / 1000).toFixed(1)} s`;
  return `${Math.round(value)} ms`;
}

function formatPct(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${Math.round(value)}%`;
}

export function ImobFunnelTeamSection({
  specialistLoad,
  rescueIndex,
  approvalContext,
  kpiPerformance,
  kpiLoading,
  kpiWindowDays,
  telemetryMetrics = null,
  buildApprovalHref,
  onApprovalAction,
}: Props) {
  return (
    <section id="equipe" className="space-y-4">
      <section className="rounded-3xl border border-white/10 bg-surface/60 p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-accent">Equipe</p>
            <h2 className="mt-1 text-lg font-semibold text-foreground">Equipe no Funil</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Performance, carga, approvals e resgates no contexto comercial.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1">
              janela {kpiPerformance?.windowDays ?? kpiWindowDays}d
            </span>
            <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1">
              fonte {kpiPerformance?.metricSource ?? "unavailable"}
            </span>
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <ImobBrokerChart
          ranking={kpiPerformance?.ranking ?? []}
          loading={kpiLoading}
          windowDays={kpiPerformance?.windowDays ?? kpiWindowDays}
          metricSource={kpiPerformance?.metricSource ?? "unavailable"}
          unassigned={kpiPerformance?.unassigned ?? null}
        />
        <section className="rounded-3xl border border-white/10 bg-surface/60 p-4 sm:p-6">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Telemetria operacional
            </h2>
            <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              {telemetryMetrics ? "Real" : "Sem dados"}
            </span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <article className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">msg→plan</p>
              <p className="mt-2 text-lg font-semibold text-foreground">
                {formatLatencyMs(telemetryMetrics?.messageToPlanAvgMs)}
              </p>
            </article>
            <article className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">plan→execute</p>
              <p className="mt-2 text-lg font-semibold text-foreground">
                {formatLatencyMs(telemetryMetrics?.planToExecuteAvgMs)}
              </p>
            </article>
            <article className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">chat→run</p>
              <p className="mt-2 text-lg font-semibold text-foreground">
                {formatPct(telemetryMetrics?.chatToRunCoveragePct)}
              </p>
            </article>
            <article className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">persistência</p>
              <p className="mt-2 text-lg font-semibold text-foreground">
                {formatPct(telemetryMetrics?.persistSuccessRatePct)}
              </p>
            </article>
          </div>
          {!telemetryMetrics ? (
            <p className="mt-4 text-xs text-muted-foreground">
              Sem telemetria real suficiente neste contexto. A seção continua visível, mas não preenche valores sintéticos.
            </p>
          ) : null}
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ImobSpecialistLoadBoard items={specialistLoad} />
        <ImobRescueIndex items={rescueIndex} />
      </div>

      <ImobApprovalContextCard
        items={approvalContext}
        buildHref={buildApprovalHref}
        onAction={onApprovalAction}
      />
    </section>
  );
}
