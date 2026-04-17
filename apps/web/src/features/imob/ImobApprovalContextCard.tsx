import React from "react";
import { Link } from "react-router-dom";
import type { ImobApprovalContextItem } from "@/lib/api";

type ApprovalAction = "approve" | "delegate" | "escalate";

type Props = {
  items: ImobApprovalContextItem[];
  buildHref: (item: ImobApprovalContextItem) => string;
  onAction?: (item: ImobApprovalContextItem, action: ApprovalAction) => Promise<void> | void;
};

function urgencyTone(value: ImobApprovalContextItem["urgency"]) {
  if (value === "critical" || value === "high") return "text-rose-300 border-rose-400/40";
  if (value === "medium") return "text-amber-200 border-amber-300/30";
  return "text-emerald-300 border-emerald-400/40";
}

function phaseLabel(value: ImobApprovalContextItem["humanJourneyPhase"]) {
  if (value === "captacao") return "Captação";
  if (value === "qualificacao") return "Qualificação";
  if (value === "atendimento_ativo") return "Atendimento";
  if (value === "visita") return "Visita";
  if (value === "proposta") return "Proposta";
  if (value === "negociacao") return "Negociação";
  if (value === "documentacao") return "Documentação";
  if (value === "fechamento") return "Fechamento";
  if (value === "pos_venda") return "Pós-venda";
  return "Operação";
}

export const ImobApprovalContextCard: React.FC<Props> = ({ items, buildHref, onAction }) => {
  const [pendingActionKey, setPendingActionKey] = React.useState<string | null>(null);

  const handleAction = async (item: ImobApprovalContextItem, action: ApprovalAction) => {
    if (!onAction) return;
    const actionKey = `${item.caseId}:${item.reasonCode}:${action}`;
    setPendingActionKey(actionKey);
    try {
      await onAction(item, action);
    } finally {
      setPendingActionKey((current) => (current === actionKey ? null : current));
    }
  };

  return (
    <section className="rounded-3xl border border-white/10 bg-surface/60 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Approvals contextuais</h2>
          <p className="mt-1 text-sm text-muted-foreground">Casos sensíveis com necessidade de aprovação humana ou evidência.</p>
        </div>
        <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          {items.length} item(ns)
        </span>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {items.slice(0, 6).map((item) => (
          <article key={`${item.caseId}-${item.reasonCode}-${item.specialistId}`} className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">{item.reasonLabel}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {phaseLabel(item.humanJourneyPhase)} • specialist {item.specialistId}
                </p>
              </div>
              <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${urgencyTone(item.urgency)}`}>
                {item.urgency ?? "low"}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {item.requiresApproval ? (
                <span className="rounded-full border border-white/15 bg-white/5 px-2 py-1">approval</span>
              ) : null}
              {item.requiresEvidence ? (
                <span className="rounded-full border border-white/15 bg-white/5 px-2 py-1">evidence</span>
              ) : null}
              <span className="rounded-full border border-white/15 bg-white/5 px-2 py-1">
                {item.evidenceCount > 0 ? `${item.evidenceCount} evid.` : "sem evidência"}
              </span>
              {item.waitingOn ? (
                <span className="rounded-full border border-white/15 bg-white/5 px-2 py-1">waiting on {item.waitingOn}</span>
              ) : null}
            </div>

            <p className="mt-3 text-xs text-muted-foreground">
              {item.suggestedAction || item.currentObjective || item.nextStep || "Revisar contexto do caso"}
            </p>

            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">Score {item.priorityScore}</p>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={pendingActionKey !== null || (item.requiresEvidence && item.evidenceCount <= 0)}
                  onClick={() => void handleAction(item, "approve")}
                  className="rounded-full border border-white/20 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-foreground transition hover:border-white/35 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Aprovar
                </button>
                <button
                  type="button"
                  disabled={pendingActionKey !== null}
                  onClick={() => void handleAction(item, "delegate")}
                  className="rounded-full border border-white/20 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-foreground transition hover:border-white/35 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Delegar
                </button>
                <button
                  type="button"
                  disabled={pendingActionKey !== null}
                  onClick={() => void handleAction(item, "escalate")}
                  className="rounded-full border border-white/20 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-foreground transition hover:border-white/35 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Escalar
                </button>
                <Link
                  to={buildHref(item)}
                  className="rounded-full border border-accent/45 bg-accent/15 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-accent hover:border-accent/70"
                >
                  Abrir aprovação
                </Link>
              </div>
            </div>
          </article>
        ))}
        {items.length === 0 ? (
          <p className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-muted-foreground">
            Nenhum approval contextual pendente no recorte atual.
          </p>
        ) : null}
      </div>
    </section>
  );
};
