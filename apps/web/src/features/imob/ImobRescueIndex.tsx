import React from "react";
import type { ImobRescueMetric } from "@/lib/api";

type Props = {
  items: ImobRescueMetric[];
};

function phaseLabel(value: string) {
  if (value === "captacao") return "Captação";
  if (value === "qualificacao") return "Qualificação";
  if (value === "atendimento_ativo") return "Atendimento";
  if (value === "visita") return "Visita";
  if (value === "proposta") return "Proposta";
  if (value === "negociacao") return "Negociação";
  if (value === "documentacao") return "Documentação";
  if (value === "fechamento") return "Fechamento";
  return value;
}

function formatPct(value: number) {
  return `${Math.round(value * 100)}%`;
}

export const ImobRescueIndex: React.FC<Props> = ({ items }) => {
  return (
    <section className="rounded-3xl border border-white/10 bg-surface/60 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Índice de resgate</h2>
          <p className="mt-1 text-sm text-muted-foreground">Casos críticos que melhoraram após gatilho de follow-up.</p>
        </div>
        <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          {items.length} recorte(s)
        </span>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {items.slice(0, 6).map((item) => (
          <article key={`${item.scope}-${item.key}`} className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="text-sm font-semibold text-foreground">{phaseLabel(item.key)}</p>
            <p className="mt-2 text-lg font-semibold text-foreground">{formatPct(item.rescueRate)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {item.rescued} resgatado(s) de {item.totalCritical} crítico(s)
            </p>
          </article>
        ))}
        {items.length === 0 ? (
          <p className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-muted-foreground">
            Nenhum índice de resgate disponível no recorte atual.
          </p>
        ) : null}
      </div>
    </section>
  );
};
