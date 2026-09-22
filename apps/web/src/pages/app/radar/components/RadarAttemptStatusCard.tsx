import React from "react";
import type { RadarAnalysisAttempt } from "@/lib/api";

const STATUS_LABEL: Record<RadarAnalysisAttempt["status"], string> = {
  pending: "Aguardando execução",
  running: "Em processamento",
  provider_responded_pending_persistence: "Resposta recebida — validando",
  completed: "Concluída",
  failed: "Falhou",
  cancelled: "Cancelada",
};

const STATUS_TONE: Record<RadarAnalysisAttempt["status"], string> = {
  pending: "text-muted-foreground border-white/15",
  running: "text-amber-200 border-amber-300/30",
  provider_responded_pending_persistence: "text-amber-200 border-amber-300/30",
  completed: "text-emerald-300 border-emerald-400/40",
  failed: "text-rose-300 border-rose-400/40",
  cancelled: "text-muted-foreground border-white/15",
};

export const RadarAttemptStatusCard: React.FC<{ attempt: RadarAnalysisAttempt }> = ({ attempt }) => {
  const isUnknownOutcome = attempt.status === "running" && attempt.claimedAt !== null;
  return (
    <article className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">Tentativa #{attempt.attemptNumber}</p>
        <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.15em] ${STATUS_TONE[attempt.status]}`}>
          {STATUS_LABEL[attempt.status]}
        </span>
      </div>
      {isUnknownOutcome ? (
        <p className="mt-2 text-xs text-amber-200">
          Resultado ainda desconhecido — a tentativa permanece em processamento. Nunca tente rodar novamente enquanto este
          estado persistir.
        </p>
      ) : null}
      {attempt.status === "failed" && attempt.failureReasonCode ? (
        <p className="mt-2 text-xs text-rose-200">Motivo: {attempt.failureReasonCode}</p>
      ) : null}
      <p className="mt-2 text-xs text-muted-foreground">
        Atualizado em {new Date(attempt.updatedAt).toLocaleString("pt-BR")}
      </p>
    </article>
  );
};

export default RadarAttemptStatusCard;
