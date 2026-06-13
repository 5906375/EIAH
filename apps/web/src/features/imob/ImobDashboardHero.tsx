import React from "react";
import { Link } from "react-router-dom";
import { formatPct } from "@/lib/formatters";
import {
  resolveKpiRefreshState,
  shouldShowKpiPlaceholder,
} from "@/features/imob/kpiRefreshState";

function heroCurrencyFromCents(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(
    value / 100,
  );
}

export type DashTab =
  | "funil"
  | "equipe"
  | "casos"
  | "solucoes"
  | "imoveis"
  | "processos"
  | "parceiros";

export type PriorityChip = { key: string; label: string; href: string; tone: string };

type Props = {
  brandName: string;
  workspaceLabel: string;
  /** From kpiFunnel / command-center */
  blockedTotal: number;
  overdueFollowUpCount: number;
  followUpLoading: boolean;
  conversionPct: number | null | undefined;
  totalRunCostCents: number;
  hasKpiSnapshot?: boolean;
  kpiLoading: boolean;
  /** From local cases state */
  activeProcessCount: number;
  evidencedProcessCount: number;
  priorityChips: PriorityChip[];
  backToChatHref: string;
  activeTab: DashTab;
  onTabChange: (tab: DashTab) => void;
};

const ANALYTICS_TABS: { id: DashTab; label: string }[] = [
  { id: "funil", label: "Funil" },
  { id: "equipe", label: "Equipe" },
  { id: "casos", label: "Command Center" },
  { id: "solucoes", label: "Soluções" },
];

const DATA_TABS: { id: DashTab; label: string }[] = [
  { id: "imoveis", label: "Imóveis" },
  { id: "parceiros", label: "Parceiros" },
];

function KpiDot({ value, label, tone }: { value: React.ReactNode; label: string; tone?: string }) {
  return (
    <span className="flex items-baseline gap-1">
      <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
      <span className={`text-[13px] font-semibold tabular-nums ${tone ?? "text-foreground"}`}>{value}</span>
    </span>
  );
}

function Sep() {
  return <span className="text-white/20 select-none">·</span>;
}

export function ImobDashboardHero({
  brandName,
  workspaceLabel,
  blockedTotal,
  overdueFollowUpCount,
  followUpLoading,
  conversionPct,
  totalRunCostCents,
  hasKpiSnapshot = false,
  kpiLoading,
  activeProcessCount,
  evidencedProcessCount,
  priorityChips,
  backToChatHref,
  activeTab,
  onTabChange,
}: Props) {
  const loading = kpiLoading || followUpLoading;
  const conversionValue = conversionPct != null ? formatPct(conversionPct) : "—";
  const costValue = heroCurrencyFromCents(totalRunCostCents);
  const kpiRefreshState = resolveKpiRefreshState({ loading: kpiLoading, hasSnapshot: hasKpiSnapshot });

  return (
    <header className="rounded-2xl border border-white/10 bg-gradient-to-r from-accent/10 via-surface/80 to-transparent px-4 py-3 sm:px-5 sm:py-4">
      {/* ── Row 1: title + Voltar ── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="shrink-0 text-[9px] uppercase tracking-[0.35em] text-accent">IMOB</span>
          <span className="text-sm font-semibold text-foreground">Dashboard</span>
          <span className="truncate text-[9px] uppercase tracking-[0.18em] text-muted-foreground/60">
            {brandName} · {workspaceLabel}
          </span>
        </div>
        <Link
          to={backToChatHref}
          className="shrink-0 rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5 text-[9px] uppercase tracking-[0.18em] text-foreground hover:border-accent/40"
        >
          ↗ Chat
        </Link>
      </div>

      {/* ── Row 2: KPI strip ── */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-white/8 pt-2">
        <KpiDot label="ativos" value={activeProcessCount} />
        <Sep />
        <KpiDot
          label="bloqueados"
          value={loading ? "…" : blockedTotal}
          tone={blockedTotal > 0 ? "text-rose-300" : "text-foreground"}
        />
        <Sep />
        <KpiDot label="evidências" value={evidencedProcessCount} />
        <Sep />
        <KpiDot
          label="SLA"
          value={followUpLoading ? "…" : overdueFollowUpCount}
          tone={overdueFollowUpCount > 0 ? "text-amber-200" : "text-foreground"}
        />
        <Sep />
        <KpiDot label="conv global" value={shouldShowKpiPlaceholder(kpiRefreshState) ? "…" : conversionValue} />
        <Sep />
        <KpiDot label="custo" value={shouldShowKpiPlaceholder(kpiRefreshState) ? "…" : costValue} />
      </div>

      {/* ── Row 3: priority chips ── */}
      {priorityChips.length > 0 ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {priorityChips.map((chip) => (
            <Link
              key={chip.key}
              to={chip.href}
              className={`rounded-full border px-2.5 py-0.5 text-[9px] uppercase tracking-[0.13em] transition ${chip.tone}`}
            >
              {chip.label}
            </Link>
          ))}
        </div>
      ) : null}

      {/* ── Row 4: unified tab nav ── */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {ANALYTICS_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={`rounded-full border px-2.5 py-0.5 text-[9px] uppercase tracking-[0.14em] transition ${
              activeTab === tab.id
                ? "border-accent/50 bg-accent/20 text-accent"
                : "border-white/20 bg-white/10 text-foreground hover:border-accent/40"
            }`}
          >
            {tab.label}
          </button>
        ))}
        {DATA_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={`rounded-full border px-2.5 py-0.5 text-[9px] uppercase tracking-[0.14em] transition ${
              activeTab === tab.id
                ? "border-accent/50 bg-accent/20 text-accent"
                : "border-white/20 bg-white/10 text-foreground hover:border-accent/40"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </header>
  );
}
