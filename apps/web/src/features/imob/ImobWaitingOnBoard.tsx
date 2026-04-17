import React from "react";
import { Link } from "react-router-dom";
import type { ImobPriorityQueueItem, ImobWaitingOnBucket } from "@/lib/api";

type Props = {
  items: ImobWaitingOnBucket[];
  buildHref: (item: ImobPriorityQueueItem) => string;
};

function waitingOnLabel(value: ImobWaitingOnBucket["waitingOn"]) {
  if (value === "broker") return "Broker";
  if (value === "lead") return "Lead";
  if (value === "owner") return "Owner";
  if (value === "legal") return "Legal";
  if (value === "finance") return "Finance";
  return "Internal";
}

export const ImobWaitingOnBoard: React.FC<Props> = ({ items, buildHref }) => {
  return (
    <section className="rounded-3xl border border-white/10 bg-surface/60 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Waiting On</h2>
          <p className="mt-1 text-sm text-muted-foreground">Leia rapidamente onde o funil está parado por área.</p>
        </div>
        <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          {items.length} grupo(s)
        </span>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map((bucket) => (
          <article key={bucket.waitingOn} className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-foreground">{waitingOnLabel(bucket.waitingOn)}</p>
              <span className="rounded-full border border-white/15 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {bucket.total}
              </span>
            </div>
            <div className="mt-3 space-y-2">
              {bucket.items.slice(0, 3).map((item) => (
                <div key={`${bucket.waitingOn}-${item.caseId}`} className="rounded-xl border border-white/10 bg-surface/30 p-3">
                  <p className="text-xs font-medium text-foreground">{item.title}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {item.nextStep || item.currentObjective || "Sem próximo passo"}
                  </p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                      {typeof item.agingHours === "number" ? `${item.agingHours.toFixed(1)}h` : "—"}
                    </span>
                    <Link
                      to={buildHref(item)}
                      className="text-[10px] uppercase tracking-[0.16em] text-accent hover:text-accent/80"
                    >
                      Agir Agora
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </article>
        ))}
        {items.length === 0 ? (
          <p className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-muted-foreground">
            Nenhum agrupamento de waiting on no recorte atual.
          </p>
        ) : null}
      </div>
    </section>
  );
};
