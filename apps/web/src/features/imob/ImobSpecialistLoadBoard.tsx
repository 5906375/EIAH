import React from "react";
import type { ImobSpecialistLoadMetric } from "@/lib/api";

type Props = {
  items: ImobSpecialistLoadMetric[];
};

function reasonLabel(value: ImobSpecialistLoadMetric["reasonCode"]) {
  if (value === "COMMERCIAL_PRIORITY") return "Comercial";
  if (value === "FOLLOW_UP_DISCIPLINE") return "Follow-up";
  if (value === "DOCUMENT_BLOCKER") return "Documentação";
  if (value === "FINANCIAL_BLOCKER") return "Financeiro";
  return "Auditoria";
}

export const ImobSpecialistLoadBoard: React.FC<Props> = ({ items }) => {
  return (
    <section className="rounded-3xl border border-white/10 bg-surface/60 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Carga por specialist</h2>
          <p className="mt-1 text-sm text-muted-foreground">Leitura executiva de specialist × reason code.</p>
        </div>
        <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          {items.length} linha(s)
        </span>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {items.slice(0, 6).map((item) => (
          <article key={`${item.specialistId}-${item.reasonCode}`} className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">{item.specialistId}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{reasonLabel(item.reasonCode)}</p>
              </div>
              <span className="rounded-full border border-white/15 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {item.total}
              </span>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">Score agregado {item.weightedScore}</p>
          </article>
        ))}
        {items.length === 0 ? (
          <p className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-muted-foreground">
            Nenhuma carga de specialist no recorte atual.
          </p>
        ) : null}
      </div>
    </section>
  );
};
