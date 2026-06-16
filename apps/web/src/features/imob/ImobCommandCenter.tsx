import React from "react";
import { Link } from "react-router-dom";
import { formatRunId } from "@/components/runs/utils";
import type { ImobFunnelHealth, ImobHeatmapCell, ImobPriorityQueueItem, ImobWaitingOnBucket } from "@/lib/api";
import {
  buildImobChatRoute,
  formatImobCaseStatusLabel,
  type ImobCommandCenterCaseRow,
} from "./imobCommandCenterHelper";
import { ImobPriorityQueue } from "./ImobPriorityQueue";
import { ImobWaitingOnBoard } from "./ImobWaitingOnBoard";
import { ImobBottleneckHeatmap } from "./ImobBottleneckHeatmap";

function formatCents(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(
    value / 100,
  );
}

type ImobCommandCenterProps = {
  health: ImobFunnelHealth | null;
  cases: ImobCommandCenterCaseRow[];
  loading: boolean;
  error?: string | null;
  statusFilter: string;
  reasonFilter: string;
  totalCostLabel: string;
  caseCostMap?: Map<string, number>;
  caseCostWindowDays?: number;
  priorityQueue?: ImobPriorityQueueItem[];
  waitingOnBoard?: ImobWaitingOnBucket[];
  bottleneckHeatmap?: ImobHeatmapCell[];
  buildPriorityQueueHref?: (item: ImobPriorityQueueItem) => string;
  onStatusFilterChange: (value: string) => void;
  onReasonFilterChange: (value: string) => void;
  onRefresh: () => void;
  onDownloadArtifact: (type: "bundle" | "receipt", format: "pdf" | "html", caseId: string) => void | Promise<void>;
  conversationId?: string | null;
  receiptLabel?: string;
  riskLabel?: string;
};

export function ImobCommandCenter({
  health,
  cases,
  loading,
  error,
  statusFilter,
  reasonFilter,
  totalCostLabel,
  caseCostMap,
  caseCostWindowDays = 30,
  priorityQueue = [],
  waitingOnBoard = [],
  bottleneckHeatmap = [],
  buildPriorityQueueHref,
  onStatusFilterChange,
  onReasonFilterChange,
  onRefresh,
  onDownloadArtifact,
  conversationId = null,
  receiptLabel = "Comprovante",
  riskLabel = "Risco operacional",
}: ImobCommandCenterProps) {
  const noop = React.useCallback((_item: ImobPriorityQueueItem) => "#", []);
  const resolvedBuildHref = buildPriorityQueueHref ?? noop;
  return (
    <section id="command-center" className="glass-panel overflow-hidden p-4 sm:p-5">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.3em] text-accent">IMOB Command Center</p>
          <h2 className="text-base font-display font-semibold text-foreground">Central Operacional</h2>
          <p className="text-[11px] text-muted-foreground">Visão executiva de funil e bloqueios para operação imobiliária.</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full border border-white/15 bg-white/5 px-2.5 py-0.5 text-[9px] uppercase tracking-[0.16em] text-muted-foreground">Bloqueios recentes: {health?.summary.blockedTotal ?? 0} · 7d</span>
          <span className="rounded-full border border-white/15 bg-white/5 px-2.5 py-0.5 text-[9px] uppercase tracking-[0.16em] text-muted-foreground">Aprovações: {health?.summary.pendingApprovals ?? 0}</span>
          <span className="rounded-full border border-white/15 bg-white/5 px-2.5 py-0.5 text-[9px] uppercase tracking-[0.16em] text-muted-foreground">Custo: {totalCostLabel}</span>
        </div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-surface/60 px-3 py-2">
          <p className="text-[8px] uppercase tracking-[0.22em] text-muted-foreground">Bloqueios <span className="opacity-50">(7d)</span></p>
          <p className="mt-1 text-lg font-semibold text-foreground">{health?.summary.blockedTotal ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-surface/60 px-3 py-2">
          <p className="text-[8px] uppercase tracking-[0.22em] text-muted-foreground">Pendente revisão</p>
          <p className="mt-1 text-lg font-semibold text-foreground">{health?.summary.salesKitPendingReview ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-surface/60 px-3 py-2">
          <p className="text-[8px] uppercase tracking-[0.22em] text-muted-foreground">Pendências legais</p>
          <p className="mt-1 text-lg font-semibold text-foreground">{health?.summary.pendingLegal ?? 0}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-surface/60 px-3 py-2">
          <p className="text-[8px] uppercase tracking-[0.22em] text-muted-foreground">Settlements parciais</p>
          <p className="mt-1 text-lg font-semibold text-foreground">{health?.summary.partialSettlements ?? 0}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] text-foreground"
          value={statusFilter}
          onChange={(event) => onStatusFilterChange(event.target.value)}
        >
          <option value="all">Estado: todos</option>
          <option value="pending_data">Estado: pendente de dados</option>
          <option value="ready_for_review">Estado: pronto para revisão</option>
          <option value="blocked">Estado: bloqueado</option>
          <option value="done">Estado: concluído</option>
        </select>
        <select
          className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] text-foreground"
          value={reasonFilter}
          onChange={(event) => onReasonFilterChange(event.target.value)}
        >
          <option value="all">{riskLabel}: todos</option>
          {(health?.byReasonCode ?? []).map((item) => (
            <option key={item.reasonCode} value={item.reasonCode}>
              {item.reasonCode}
            </option>
          ))}
          <option value="__priority_queue__">Fila priorizada</option>
          <option value="__waiting_on__">Aguardando por área</option>
          <option value="__heatmap__">Heatmap de gargalos</option>
        </select>
        <button
          type="button"
          onClick={onRefresh}
          className="rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-accent transition hover:bg-accent/20"
        >
          {loading ? "Atualizando..." : "Atualizar casos"}
        </button>
      </div>
      {error ? (
        <p className="mt-4 rounded-xl border border-rose-400/20 bg-rose-500/5 p-4 text-sm text-rose-100">{error}</p>
      ) : null}

      {reasonFilter === "__priority_queue__" ? (
        <div className="mt-4">
          <ImobPriorityQueue items={priorityQueue} buildHref={resolvedBuildHref} />
        </div>
      ) : reasonFilter === "__waiting_on__" ? (
        <div className="mt-4">
          <ImobWaitingOnBoard items={waitingOnBoard} buildHref={resolvedBuildHref} />
        </div>
      ) : reasonFilter === "__heatmap__" ? (
        <div className="mt-4">
          <ImobBottleneckHeatmap items={bottleneckHeatmap} />
        </div>
      ) : (
      <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10">
        <table className="w-full min-w-[900px] text-left text-xs">
          {/* client-side waitingOn filter applied here after server-side status/reason filter */}
          <thead className="bg-white/5 text-[8px] uppercase tracking-[0.2em] text-muted-foreground/70">
            <tr>
              <th className="px-4 py-3">Processo</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Jornada</th>
              <th className="px-4 py-3">{riskLabel} · Idade</th>
              <th className="px-4 py-3">Responsável</th>
              <th className="px-4 py-3">Evidências</th>
              <th className="px-4 py-3">Sincronização</th>
              <th className="px-4 py-3">Comprovantes</th>
            </tr>
          </thead>
          <tbody>
            {cases.length === 0 ? (
              <tr>
                <td className="px-4 py-4 text-muted-foreground" colSpan={8}>
                  Nenhum caso para os filtros atuais.
                </td>
              </tr>
            ) : cases.map((item) => {
                const hasConsolidatedCost = caseCostMap?.has(item.caseId) ?? false;
                const costCents = caseCostMap?.get(item.caseId) ?? 0;
                const costLabel = hasConsolidatedCost ? `${formatCents(costCents)} (${caseCostWindowDays}d)` : null;
                return (
                  <tr key={item.processId} className="border-t border-white/10">
                    {/* Processo + contexto */}
                    <td className="px-4 py-3">
                      <p className="text-foreground/90">{item.processLabel}</p>
                      {item.context ? (
                        <p className="mt-0.5 text-[10px] text-muted-foreground">{item.context}</p>
                      ) : null}
                    </td>
                    {/* Estado + prioridade */}
                    <td className="px-4 py-3 text-foreground/90">
                      <div className="space-y-1">
                        <p>{formatImobCaseStatusLabel(item.status)}</p>
                        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                          prioridade {item.priorityLabel}
                        </p>
                      </div>
                    </td>
                    {/* Jornada + próxima ação */}
                    <td className="px-4 py-3 text-muted-foreground">
                      <div className="space-y-1">
                        <p>{item.journeyLabel}</p>
                        <p className="text-[10px] text-foreground/80">{item.nextAction}</p>
                      </div>
                    </td>
                    {/* Risco + idade */}
                    <td className="px-4 py-3 text-muted-foreground">
                      <div className="space-y-1">
                        <p>{item.riskLabel || "—"}</p>
                        <p className="text-[10px] text-muted-foreground/70">{item.ageHours.toFixed(1)}h</p>
                      </div>
                    </td>
                    {/* Responsável */}
                    <td className="px-4 py-3 text-muted-foreground">
                      {item.ownerResponsible || <span className="text-muted-foreground/40">—</span>}
                    </td>
                    {/* Evidências: eventos + custo */}
                    <td className="px-4 py-3 text-muted-foreground">
                      <div className="space-y-1">
                        <p>{item.eventCount} evento(s)</p>
                        {costLabel ? (
                          <p className="text-[10px] text-foreground/80">{costLabel}</p>
                        ) : (
                          <p className="text-[10px] text-muted-foreground/70">custo consolidado indisponível</p>
                        )}
                      </div>
                    </td>
                    {/* Sincronização */}
                    <td className="px-4 py-3 text-xs">
                      <div className="space-y-1">
                        <p className="font-mono text-foreground/90">case {formatRunId(item.caseId)}</p>
                        <p className="font-mono text-muted-foreground">
                          {item.threadId ? `thread ${formatRunId(item.threadId)}` : "thread não vinculado"}
                        </p>
                        <p className="font-mono text-[10px] text-muted-foreground/80">
                          processo {formatRunId(item.processId)}
                        </p>
                        <Link
                          to={buildImobChatRoute({
                            conversationId,
                            caseId: item.caseId,
                            threadId: item.threadId,
                            autoprompt: "consultar caso",
                          })}
                          className="text-[10px] text-accent underline-offset-2 hover:text-accent/80 hover:underline"
                        >
                          abrir no chat
                        </Link>
                      </div>
                    </td>
                    {/* Comprovantes */}
                    <td className="px-3 py-3">
                      <div className="flex flex-nowrap items-start justify-center gap-4">
                        <div className="space-y-1.5 text-center">
                          <p className="text-[8px] uppercase tracking-[0.18em] text-muted-foreground/70 leading-none">
                            Dossiê
                          </p>
                          <div className="flex flex-wrap justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => void onDownloadArtifact("bundle", "pdf", item.processId)}
                              className="rounded-full border border-white/15 bg-white/5 px-1.5 py-px text-[7px] font-medium uppercase tracking-[0.12em] text-foreground/90 transition hover:border-accent/40 hover:text-accent"
                            >
                              PDF
                            </button>
                            <button
                              type="button"
                              onClick={() => void onDownloadArtifact("bundle", "html", item.processId)}
                              className="rounded-full border border-white/15 bg-white/5 px-1.5 py-px text-[7px] font-medium uppercase tracking-[0.12em] text-foreground/90 transition hover:border-accent/40 hover:text-accent"
                            >
                              HTML
                            </button>
                          </div>
                        </div>
                        <div className="space-y-1.5 text-center">
                          <p className="text-[8px] uppercase tracking-[0.18em] text-muted-foreground/70 leading-none">
                            {receiptLabel}
                          </p>
                          <div className="flex flex-wrap justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => void onDownloadArtifact("receipt", "pdf", item.processId)}
                              className="rounded-full border border-white/15 bg-white/5 px-1.5 py-px text-[7px] font-medium uppercase tracking-[0.12em] text-foreground/90 transition hover:border-accent/40 hover:text-accent"
                            >
                              PDF
                            </button>
                            <button
                              type="button"
                              onClick={() => void onDownloadArtifact("receipt", "html", item.processId)}
                              className="rounded-full border border-white/15 bg-white/5 px-1.5 py-px text-[7px] font-medium uppercase tracking-[0.12em] text-foreground/90 transition hover:border-accent/40 hover:text-accent"
                            >
                              HTML
                            </button>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
      )}
    </section>
  );
}
