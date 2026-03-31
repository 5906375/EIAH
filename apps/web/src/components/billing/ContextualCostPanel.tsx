import React from "react";
import { Link } from "react-router-dom";

type RunFinanceContext = {
  runId?: string | null;
  actualCostCents?: number | null;
  estimatedCostCents?: number | null;
  tokens?: number | null;
  issueLabel?: string | null;
  hasGap?: boolean;
  runHref?: string | null;
  billingHref?: string | null;
};

type WorkspaceFinanceContext = {
  monthUsageCents: number;
  workspaceRuns: number;
  quotaPercent: number;
  softLimitCents: number;
  hardLimitCents: number;
};

function formatCurrencyCents(amountCents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format((amountCents ?? 0) / 100);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value ?? 0);
}

function classifyCostCents(amountCents: number | null | undefined) {
  if (amountCents == null || amountCents <= 0) return "Sem custo";
  if (amountCents < 100) return "Baixo custo";
  if (amountCents < 1000) return "Custo moderado";
  return "Custo alto";
}

function resolveQuotaTone(quotaPercent: number) {
  if (quotaPercent >= 100) return "border-rose-300/30 bg-rose-500/10 text-rose-100";
  if (quotaPercent >= 70) return "border-amber-300/30 bg-amber-500/10 text-amber-100";
  return "border-emerald-300/30 bg-emerald-500/10 text-emerald-100";
}

type ContextualCostPanelProps = {
  run?: RunFinanceContext | null;
  workspace?: WorkspaceFinanceContext | null;
  compact?: boolean;
  className?: string;
};

export function ContextualCostPanel({
  run,
  workspace,
  compact = false,
  className = "",
}: ContextualCostPanelProps) {
  const displayedCostCents = run?.actualCostCents ?? run?.estimatedCostCents ?? null;
  const varianceLabel =
    run?.estimatedCostCents != null && run?.actualCostCents != null
      ? run.actualCostCents === run.estimatedCostCents
        ? "Estimativa alinhada"
        : run.actualCostCents > run.estimatedCostCents
        ? `Real acima em ${formatCurrencyCents(run.actualCostCents - run.estimatedCostCents)}`
        : `Real abaixo em ${formatCurrencyCents(run.estimatedCostCents - run.actualCostCents)}`
      : null;

  return (
    <div className={`space-y-3 ${className}`.trim()}>
      {(run || workspace) ? (
        <div className="flex flex-wrap items-center gap-2">
          {run?.runId ? (
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Run: {run.runId}
            </span>
          ) : null}
          {displayedCostCents != null ? (
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              {run?.actualCostCents != null ? "Custo real" : "Estimativa"}: {formatCurrencyCents(displayedCostCents)}
            </span>
          ) : null}
          {run?.estimatedCostCents != null && run.actualCostCents != null ? (
            <span className="rounded-full border border-sky-300/30 bg-sky-500/10 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-sky-100">
              Estimado: {formatCurrencyCents(run.estimatedCostCents)}
            </span>
          ) : null}
          {run?.tokens != null ? (
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Tokens: {formatNumber(run.tokens)}
            </span>
          ) : null}
          {run?.issueLabel ? (
            <span
              className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.2em] ${
                run.hasGap
                  ? "border-amber-300/30 bg-amber-500/10 text-amber-100"
                  : "border-emerald-300/30 bg-emerald-500/10 text-emerald-100"
              }`}
            >
              {run.issueLabel}
            </span>
          ) : null}
          {displayedCostCents != null ? (
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              {classifyCostCents(displayedCostCents)}
            </span>
          ) : null}
          {workspace ? (
            <>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Workspace no mês: {formatCurrencyCents(workspace.monthUsageCents)}
              </span>
              <span className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.2em] ${resolveQuotaTone(workspace.quotaPercent)}`}>
                Quota: {workspace.quotaPercent.toFixed(0)}%
              </span>
            </>
          ) : null}
        </div>
      ) : null}

      {varianceLabel || run?.runHref || run?.billingHref ? (
        <div className="flex flex-wrap items-center gap-3">
          {varianceLabel ? <span className="text-[11px] text-muted-foreground">{varianceLabel}</span> : null}
          {run?.runHref ? (
            <Link
              to={run.runHref}
              className="text-[10px] normal-case tracking-normal text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Ver execução
            </Link>
          ) : null}
          {run?.billingHref ? (
            <Link
              to={run.billingHref}
              className="text-[10px] normal-case tracking-normal text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Abrir reconciliação
            </Link>
          ) : null}
        </div>
      ) : null}

      {!compact && workspace ? (
        <div className="grid gap-2 md:grid-cols-4">
          <div className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Consumo do workspace</p>
            <p className="mt-1 text-sm font-semibold text-foreground">{formatCurrencyCents(workspace.monthUsageCents)}</p>
          </div>
          <div className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Runs no mês</p>
            <p className="mt-1 text-sm font-semibold text-foreground">{formatNumber(workspace.workspaceRuns)}</p>
          </div>
          <div className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Limite suave</p>
            <p className="mt-1 text-sm font-semibold text-foreground">
              {workspace.softLimitCents > 0 ? formatCurrencyCents(workspace.softLimitCents) : "-"}
            </p>
          </div>
          <div className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Limite rígido</p>
            <p className="mt-1 text-sm font-semibold text-foreground">
              {workspace.hardLimitCents > 0 ? formatCurrencyCents(workspace.hardLimitCents) : "-"}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
