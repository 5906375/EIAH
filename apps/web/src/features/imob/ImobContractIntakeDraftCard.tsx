// Render-only card for an IMOB contract intake draft.
// Pure presentational view is exported for SSR testing.
// Interactive wrapper handles confirm API call via internal state.
// PII guarantee: all displayed fields come from the backend's masked data.

import React from "react";
import type { ImobContractIntakeDraftWidget } from "@/lib/api";
import { apiImobIntakeConfirm } from "@/lib/api";

type ConfirmPhase = "pending" | "confirming" | "confirmed" | "error";

function contractTypeLabel(ct: ImobContractIntakeDraftWidget["contractType"]): string {
  if (ct === "residential_lease") return "Locação Residencial";
  if (ct === "commercial_lease") return "Locação Comercial";
  if (ct === "seasonal_lease") return "Temporada";
  return "Tipo não identificado";
}

function documentKindLabel(dk: ImobContractIntakeDraftWidget["documentKind"]): string {
  if (dk === "lease_contract") return "Contrato de Locação";
  return "Documento";
}

function formatExpiry(isoDate: string): string {
  try {
    const d = new Date(isoDate);
    const diff = Math.max(0, d.getTime() - Date.now());
    const mins = Math.floor(diff / 60000);
    if (mins <= 0) return "expirado";
    if (mins < 60) return `${mins} min`;
    return `${Math.floor(mins / 60)}h ${mins % 60}min`;
  } catch {
    return "—";
  }
}

// ─── Pure view — testable with renderToStaticMarkup ──────────────────────────

export type ImobContractIntakeDraftCardViewProps = {
  widget: ImobContractIntakeDraftWidget;
  phase: ConfirmPhase;
  runId?: string | null;
  errorMsg?: string | null;
  onConfirmClick?: () => void;
};

export function ImobContractIntakeDraftCardView({
  widget,
  phase,
  runId,
  errorMsg,
  onConfirmClick,
}: ImobContractIntakeDraftCardViewProps) {
  const pendingList = widget.pendingItems.length > 0 ? widget.pendingItems : null;
  const riskList = widget.riskFlags.length > 0 ? widget.riskFlags : null;

  return (
    <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-500/5 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-200">
          Intake de Contrato
        </p>
        <span className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {documentKindLabel(widget.documentKind)}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-200">
          {contractTypeLabel(widget.contractType)}
        </span>
        <span className="text-[10px] text-muted-foreground">
          Expira em {formatExpiry(widget.draftExpiresAt)}
        </span>
      </div>

      {pendingList ? (
        <div className="mt-3">
          <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Itens Pendentes
          </p>
          <ul className="mt-1 space-y-1">
            {pendingList.map((item, i) => (
              <li key={i} className="text-xs text-foreground/80">
                • {item}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {riskList ? (
        <div className="mt-3">
          <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Alertas de Risco
          </p>
          <ul className="mt-1 space-y-1">
            {riskList.map((flag, i) => (
              <li key={i} className="text-xs text-rose-300">
                ⚠ {flag}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-3 border-t border-white/10 pt-3">
        {phase === "pending" && (
          <button
            type="button"
            onClick={onConfirmClick}
            className="rounded-full border border-accent/40 bg-accent/10 px-4 py-1.5 text-xs font-medium text-foreground transition hover:border-accent/70 hover:bg-accent/20"
          >
            Confirmar Intake
          </button>
        )}
        {phase === "confirming" && (
          <p className="text-xs text-muted-foreground">Confirmando...</p>
        )}
        {phase === "confirmed" && runId ? (
          <div>
            <p className="text-xs text-emerald-300">✓ Intake confirmado</p>
            <p className="mt-1 font-mono text-[10px] text-muted-foreground">
              Run: {runId}
            </p>
            <p className="mt-1 text-[10px] text-muted-foreground">
              O caso será criado em instantes pelo processamento em background.
            </p>
          </div>
        ) : null}
        {phase === "error" && (
          <p className="text-xs text-rose-300">
            {errorMsg ?? "Erro ao confirmar intake. Tente novamente."}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Interactive wrapper ──────────────────────────────────────────────────────

export const ImobContractIntakeDraftCard: React.FC<{
  widget: ImobContractIntakeDraftWidget;
}> = ({ widget }) => {
  const [phase, setPhase] = React.useState<ConfirmPhase>("pending");
  const [runId, setRunId] = React.useState<string | null>(null);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const handleConfirm = React.useCallback(async () => {
    if (phase !== "pending") return;
    setPhase("confirming");
    try {
      const result = await apiImobIntakeConfirm(widget.draftId);
      if (result.ok) {
        setRunId(result.runId);
        setPhase("confirmed");
      } else {
        setErrorMsg("Ação bloqueada pelo servidor");
        setPhase("error");
      }
    } catch {
      setErrorMsg("Falha na comunicação com o servidor");
      setPhase("error");
    }
  }, [phase, widget.draftId]);

  return (
    <ImobContractIntakeDraftCardView
      widget={widget}
      phase={phase}
      runId={runId}
      errorMsg={errorMsg}
      onConfirmClick={handleConfirm}
    />
  );
};
