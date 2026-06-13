import React from "react";
import { Link } from "react-router-dom";
import type { ImobPriorityQueueItem } from "@/lib/api";

type Props = {
  items: ImobPriorityQueueItem[];
  buildHref: (item: ImobPriorityQueueItem) => string;
};

function urgencyLabel(value: ImobPriorityQueueItem["urgency"]) {
  if (value === "critical") return "Crítico";
  if (value === "high") return "Alto";
  if (value === "medium") return "Médio";
  return "Baixo";
}

function urgencyTone(value: ImobPriorityQueueItem["urgency"]) {
  if (value === "critical" || value === "high") return "text-rose-300 border-rose-400/40";
  if (value === "medium") return "text-amber-200 border-amber-300/30";
  return "text-emerald-300 border-emerald-400/40";
}

function followUpRiskLabel(value: string | null | undefined) {
  if (value === "high") return "Follow-up crítico";
  if (value === "medium") return "Follow-up médio";
  if (value === "low") return "Follow-up baixo";
  return `Follow-up ${value}`;
}

function waitingOnLabel(value: string | null | undefined) {
  if (value === "internal") return "Aguard. Interno";
  if (value === "legal") return "Aguard. Jurídico";
  if (value === "finance") return "Aguard. Financeiro";
  if (value === "broker") return "Aguard. Corretor";
  if (value === "lead") return "Aguard. Lead";
  if (value === "owner") return "Aguard. Proprietário";
  return `Aguard. ${value}`;
}

export const ImobPriorityQueue: React.FC<Props> = ({ items, buildHref }) => {
  return (
    <section className="rounded-3xl border border-white/10 bg-surface/60 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Fila priorizada</h2>
          <p className="mt-1 text-sm text-muted-foreground">Casos com maior risco operacional para agir agora.</p>
        </div>
        <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          {items.length} caso(s)
        </span>
      </div>
      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        {items.map((item) => (
          <article key={item.caseId} className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">{item.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {item.currentObjective || item.nextStep || "Sem objetivo explícito"}
                </p>
              </div>
              <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.15em] ${urgencyTone(item.urgency)}`}>
                {urgencyLabel(item.urgency)}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {item.followUpRisk ? (
                <span className="rounded-full border border-white/15 bg-white/5 px-2 py-1">
                  {followUpRiskLabel(item.followUpRisk)}
                </span>
              ) : null}
              {item.waitingOn ? (
                <span className="rounded-full border border-white/15 bg-white/5 px-2 py-1">
                  {waitingOnLabel(item.waitingOn)}
                </span>
              ) : null}
              {typeof item.agingHours === "number" ? (
                <span className="rounded-full border border-white/15 bg-white/5 px-2 py-1">{item.agingHours.toFixed(1)}h</span>
              ) : null}
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">Score {item.priorityScore}</p>
              <Link
                to={buildHref(item)}
                className="rounded-full border border-accent/45 bg-accent/15 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-accent hover:border-accent/70"
              >
                Agir Agora
              </Link>
            </div>
          </article>
        ))}
        {items.length === 0 ? (
          <p className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-muted-foreground">
            Nenhum caso priorizado no recorte atual.
          </p>
        ) : null}
      </div>
    </section>
  );
};
