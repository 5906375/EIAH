import React from "react";

type RankingItem = {
  broker: string;
  cases: number;
  closings: number;
  closingRatePct: number;
  revenueCents: number;
};
type Props = { ranking: RankingItem[]; loading: boolean };

function formatCents(value: number) {
  if (value === 0) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(
    value / 100,
  );
}

function truncate(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function ImobBrokerChart({ ranking, loading }: Props) {
  const items = ranking.slice(0, 8);
  const maxCases = Math.max(...items.map((i) => i.cases), 1);

  return (
    <section className="rounded-3xl border border-white/10 bg-surface/60 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Performance de corretores
        </h2>
        <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          30 dias
        </span>
      </div>

      {loading ? (
        <div className="mt-6 flex h-44 items-center justify-center text-sm text-muted-foreground">Carregando...</div>
      ) : items.length === 0 ? (
        <div className="mt-6 flex h-44 items-center justify-center text-sm text-muted-foreground">
          Sem dados de corretores neste recorte.
        </div>
      ) : (
        <>
          <div className="mt-5 flex items-end gap-1.5" style={{ height: 120 }}>
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

          <div className="mt-2 flex items-center gap-4 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-3 rounded-sm bg-slate-600/50" />
              Casos
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-3 rounded-sm bg-violet-500/90" />
              Fechamentos
            </span>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-white/10 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="pb-1 pr-3 text-left font-normal">Corretor</th>
                  <th className="pb-1 pr-3 text-right font-normal">Casos</th>
                  <th className="pb-1 pr-3 text-right font-normal">Fechamentos</th>
                  <th className="pb-1 pr-3 text-right font-normal">Taxa</th>
                  <th className="pb-1 text-right font-normal">Receita</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={i} className="border-b border-white/5 text-[11px] text-muted-foreground">
                    <td className="py-1.5 pr-3 max-w-[110px] truncate text-foreground">{item.broker}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{item.cases}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums font-semibold text-foreground">
                      {item.closings}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{item.closingRatePct.toFixed(1)}%</td>
                    <td className="py-1.5 text-right tabular-nums text-foreground">{formatCents(item.revenueCents)}</td>
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
