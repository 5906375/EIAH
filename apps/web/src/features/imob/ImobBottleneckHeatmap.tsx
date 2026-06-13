import React from "react";
import type { ImobHeatmapCell } from "@/lib/api";

type Props = {
  items: ImobHeatmapCell[];
};

function tone(weightedScore: number) {
  if (weightedScore >= 12) return "border-rose-400/40 bg-rose-500/15 text-rose-100";
  if (weightedScore >= 7) return "border-amber-300/35 bg-amber-500/12 text-amber-100";
  return "border-white/10 bg-black/20 text-muted-foreground";
}

function phaseLabel(value: ImobHeatmapCell["phase"]) {
  if (value === "captacao") return "Captação";
  if (value === "qualificacao") return "Qualificação";
  if (value === "atendimento_ativo") return "Atendimento";
  if (value === "visita") return "Visita";
  if (value === "proposta") return "Proposta";
  if (value === "negociacao") return "Negociação";
  if (value === "documentacao") return "Documentação";
  if (value === "fechamento") return "Fechamento";
  return "Pós-venda";
}

function waitingOnLabel(value: string) {
  if (value === "broker") return "Corretor";
  if (value === "lead") return "Lead";
  if (value === "owner") return "Proprietário";
  if (value === "legal") return "Jurídico";
  if (value === "finance") return "Financeiro";
  if (value === "internal") return "Interno";
  return value;
}

function reasonLabel(value: ImobHeatmapCell["reasonCode"]) {
  if (value === "COMMERCIAL_PRIORITY") return "Comercial";
  if (value === "FOLLOW_UP_DISCIPLINE") return "Follow-up";
  if (value === "DOCUMENT_BLOCKER") return "Documentação";
  if (value === "FINANCIAL_BLOCKER") return "Financeiro";
  return "Auditoria";
}

export const ImobBottleneckHeatmap: React.FC<Props> = ({ items }) => {
  return (
    <section className="rounded-3xl border border-white/10 bg-surface/60 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Heatmap de gargalos</h2>
          <p className="mt-1 text-sm text-muted-foreground">Fase humana, reason code e área travando a conversão.</p>
        </div>
        <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          {items.length} célula(s)
        </span>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.slice(0, 9).map((item) => (
          <article key={`${item.phase}-${item.reasonCode}-${item.waitingOn ?? "none"}`} className={`rounded-2xl border p-4 ${tone(item.weightedScore)}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{phaseLabel(item.phase)}</p>
                <p className="mt-1 text-[11px]">{reasonLabel(item.reasonCode)}</p>
              </div>
              <span className="rounded-full border border-white/15 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-[0.14em]">
                {item.total}
              </span>
            </div>
            <p className="mt-3 text-[11px] uppercase tracking-[0.14em]">
              {item.waitingOn ? `Aguardando: ${waitingOnLabel(item.waitingOn)}` : "Sem pendência de área"}
            </p>
            <p className="mt-2 text-xs">Score agregado {item.weightedScore}</p>
          </article>
        ))}
        {items.length === 0 ? (
          <p className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-muted-foreground">
            Nenhum gargalo agregado no recorte atual.
          </p>
        ) : null}
      </div>
    </section>
  );
};
