import React from "react";

type RankingItem = {
  broker: string;
  cases: number;
  closings: number;
  closingRatePct: number;
  estimatedListingValueCents: number;
  assignmentSource: "broker_canonical" | "owner_responsible_fallback" | "unassigned_internal";
};
type Props = {
  ranking: RankingItem[];
  loading: boolean;
  windowDays: number;
  metricSource: "derived" | "primary" | "synthetic" | "unavailable";
  unassigned?: {
    label: string;
    cases: number;
    closings: number;
    estimatedListingValueCents: number;
  } | null;
};

function formatCents(value: number) {
  if (value === 0) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(
    value / 100,
  );
}

function truncate(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function metricSourceLabel(value: Props["metricSource"]) {
  if (value === "primary") return "Real";
  if (value === "synthetic") return "Simulado";
  if (value === "unavailable") return "Sem dados";
  return "Derivado";
}

export function ImobBrokerChart({ ranking, loading, windowDays, metricSource, unassigned = null }: Props) {
  const items = ranking.slice(0, 8);
  const maxCases = Math.max(...items.map((i) => i.cases), 1);

  return (
    <section className="rounded-3xl border border-white/10 bg-surface/60 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="min-w-0 text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Performance de corretores
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            {windowDays} dias
          </span>
          <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            {metricSourceLabel(metricSource)}
          </span>
        </div>
      </div>

      {unassigned && unassigned.cases > 0 ? (
        <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-500/5 p-3 text-xs text-amber-100">
          <p className="font-medium uppercase tracking-[0.14em] text-amber-200">{unassigned.label}</p>
          <p className="mt-1">
            {unassigned.cases} caso(s) sem broker canonico. Esses casos saem do ranking e ficam como pendencia operacional.
          </p>
        </div>
      ) : null}

      {loading ? (
        <div className="mt-6 flex h-44 items-center justify-center text-sm text-muted-foreground">Carregando...</div>
      ) : items.length === 0 ? (
        <div className="mt-6 flex h-44 items-center justify-center text-sm text-muted-foreground">
          Sem dados de corretores neste recorte.
        </div>
      ) : (
        <>
          <div className="mt-5 hidden items-end gap-1.5 md:flex" style={{ height: 120 }}>
            {items.map((item, i) => {
              const casePct = (item.cases / maxCases) * 100;
              const closingPct = (item.closings / maxCases) * 100;
              return (
                <div
                  key={i}
                  className="group relative flex flex-1 flex-col items-center justify-end gap-0.5"
                  style={{ height: 120 }}
                  title={`${item.broker}: ${item.closings} fechamentos / ${item.cases} casos`}
                >
                  <div className="relative w-full" style={{ height: 104 }}>
                    <div
                      className="absolute bottom-0 left-0 right-0 rounded-t-md bg-slate-600/50 transition-all duration-700"
                      style={{ height: `${casePct}%` }}
                    />
                    <div
                      className="absolute bottom-0 left-1 right-1 rounded-t-md bg-violet-500/90 transition-all duration-700"
                      style={{ height: `${closingPct}%` }}
                    />
                  </div>
                  <span className="text-[9px] text-muted-foreground text-center w-full truncate leading-none">
                    {truncate(item.broker, 7)}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="mt-2 hidden items-center gap-4 text-[10px] text-muted-foreground md:flex">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-3 rounded-sm bg-slate-600/50" />
              Casos
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-3 rounded-sm bg-violet-500/90" />
              Fechamentos
            </span>
          </div>

          <div className="mt-4 grid gap-3 md:hidden">
            {items.map((item, i) => (
              <article key={i} className="rounded-2xl border border-white/10 bg-black/20 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{item.broker}</p>
                    <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                      {item.assignmentSource === "owner_responsible_fallback" ? "atribuição derivada" : "atribuição canônica"}
                    </p>
                  </div>
                  <span className="rounded-full border border-white/15 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    {item.cases} casos
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-2">
                    <p className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Fech.</p>
                    <p className="mt-1 font-semibold text-foreground">{item.closings}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-2">
                    <p className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Taxa</p>
                    <p className="mt-1 font-semibold text-foreground">{item.closingRatePct.toFixed(1)}%</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-2">
                    <p className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">Valor est.</p>
                    <p className="mt-1 font-semibold text-foreground">{formatCents(item.estimatedListingValueCents)}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>

          <div className="mt-4 hidden overflow-x-auto md:block">
            <table className="min-w-[620px] w-full">
              <thead>
                <tr className="border-b border-white/10 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="pb-1 pr-3 text-left font-normal">Corretor</th>
                  <th className="pb-1 pr-3 text-right font-normal">Casos</th>
                  <th className="pb-1 pr-3 text-right font-normal">Fechamentos</th>
                  <th className="pb-1 pr-3 text-right font-normal">Taxa</th>
                  <th className="pb-1 text-right font-normal">Valor anunciado est.</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={i} className="border-b border-white/5 text-[11px] text-muted-foreground">
                    <td className="py-1.5 pr-3 max-w-[140px] truncate text-foreground">{item.broker}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{item.cases}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums font-semibold text-foreground">
                      {item.closings}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{item.closingRatePct.toFixed(1)}%</td>
                    <td className="py-1.5 text-right tabular-nums text-foreground">{formatCents(item.estimatedListingValueCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
