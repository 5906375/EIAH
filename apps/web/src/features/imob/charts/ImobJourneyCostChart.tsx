import React from "react";

type JourneyItem = { label: string; cases: number; costCents: number; runs: number };
type Props = {
  items: JourneyItem[];
  totalCostCents: number;
  costCoverage?: {
    runsCount: number;
    linkedRunsCount: number;
    unlinkedRunsCount: number;
  } | null;
  loading: boolean;
};

function normalizeJourneyLabel(raw: string): string {
  const key = raw.trim().toLowerCase().replace(/\./g, "_");
  if (key === "property_capture" || key === "property_create") return "Captação";
  if (key === "lead_qualification" || key === "lead_qualify") return "Qualificação";
  if (key === "proposal" || key === "proposal_create") return "Proposta";
  if (key === "visit_follow_up" || key === "visit_schedule") return "Visita";
  if (key === "negotiation" || key === "deal_review") return "Negociação";
  if (key === "documentation" || key === "documents_collect") return "Documentação";
  if (key === "contract" || key === "contract_prepare") return "Contrato";
  if (key === "commission" || key === "commission_settle") return "Comissão";
  if (key === "closing") return "Fechamento";
  if (key === "temporada_rules" || key === "rules_configure") return "Temp. / Regras";
  if (key === "property_market_scan") return "Varredura de mercado";
  return raw;
}

const COLORS = ["#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#f43f5e", "#94a3b8"];

function formatCents(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(
    value / 100,
  );
}

function DonutSvg({
  data,
  size = 156,
}: {
  data: Array<{ value: number; color: string }>;
  size?: number;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.34;
  const sw = size * 0.11;
  const gap = 2.5;
  const circ = 2 * Math.PI * r;
  const total = data.reduce((acc, d) => acc + d.value, 0);
  if (total === 0) return null;

  let cumLen = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={sw} />
      {data.map((seg, i) => {
        const len = (seg.value / total) * circ;
        const dashLen = Math.max(0, len - gap);
        const offset = -cumLen;
        cumLen += len;
        return (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth={sw}
            strokeDasharray={`${dashLen} ${circ}`}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        );
      })}
    </svg>
  );
}

export function ImobJourneyCostChart({ items, totalCostCents, costCoverage, loading }: Props) {
  const visibleItems = items.slice(0, 5);
  const overflowItems = items.slice(5);
  const data = visibleItems.map((item, i) => ({
    ...item,
    label: normalizeJourneyLabel(item.label),
    color: COLORS[i % COLORS.length],
  }));
  const overflowCostCents = overflowItems.reduce((sum, item) => sum + (item.costCents ?? 0), 0);
  const overflowCases = overflowItems.reduce((sum, item) => sum + (item.cases ?? 0), 0);
  const overflowRuns = overflowItems.reduce((sum, item) => sum + (item.runs ?? 0), 0);
  if (overflowCostCents > 0) {
    data.push({
      label: "Outros",
      cases: overflowCases,
      runs: overflowRuns,
      costCents: overflowCostCents,
      color: COLORS[data.length % COLORS.length],
    });
  }
  const total = totalCostCents > 0 ? totalCostCents : data.reduce((acc, d) => acc + d.costCents, 0);
  const unlinkedRunsCount = costCoverage?.unlinkedRunsCount ?? 0;

  return (
    <section className="rounded-3xl border border-white/10 bg-surface/60 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Custo por jornada</h2>
        <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {costCoverage ? `${costCoverage.linkedRunsCount}/${costCoverage.runsCount} runs vinculados` : "sem cobertura"}
        </span>
      </div>

      {loading ? (
        <div className="mt-6 flex h-44 items-center justify-center text-sm text-muted-foreground">Carregando...</div>
      ) : data.length === 0 ? (
        <div className="mt-6 flex h-44 items-center justify-center text-sm text-muted-foreground">
          Sem runs com custo no período.
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {unlinkedRunsCount > 0 ? (
            <p className="text-[11px] text-amber-200">
              Parte dos runs não pôde ser vinculada: {unlinkedRunsCount} run(s).
            </p>
          ) : null}
          <div className="flex items-center gap-5">
          <div className="relative shrink-0">
            <DonutSvg data={data.map((d) => ({ value: d.costCents, color: d.color }))} size={156} />
          </div>
          <div className="flex-1 space-y-2 min-w-0">
            {data.map((seg, i) => {
              const pct = total > 0 ? ((seg.costCents / total) * 100).toFixed(1) : "0.0";
              return (
                <div key={i} className="flex items-center gap-2 min-w-0">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: seg.color }} />
                  <span className="flex-1 truncate text-[11px] text-muted-foreground">{seg.label}</span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">{seg.runs} runs</span>
                  <span className="shrink-0 text-[11px] font-semibold tabular-nums text-foreground">{pct}%</span>
                </div>
              );
            })}
            <div className="mt-1 flex items-center gap-2 border-t border-white/10 pt-2">
              <span className="flex-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Total</span>
              <span className="shrink-0 text-[11px] font-semibold tabular-nums text-foreground">{formatCents(totalCostCents)}</span>
            </div>
          </div>
        </div>
        </div>
      )}
    </section>
  );
}
