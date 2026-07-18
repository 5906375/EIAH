import React from "react";

export type ChatVerticalHandoffSurfaceSnapshot = {
  version: "chat.vertical_handoff.v1";
  verticalId: string;
  handoffMessage: string;
  reasonCode: string;
  riskLevel: "read_only" | "assisted" | "high" | "critical";
  hitlRequired: boolean;
  renderHints?: {
    verticalBadgeLabel?: string;
    suggestedSurface?: "chat" | "cockpit" | "run" | "proof";
    ctaLabel?: string;
    cockpitDeepLink?: string;
  };
};

type ChatVerticalHandoffSurfaceProps = {
  snapshot?: ChatVerticalHandoffSurfaceSnapshot | null;
};

const RISK_LABELS: Record<ChatVerticalHandoffSurfaceSnapshot["riskLevel"], string> = {
  read_only: "Read-only",
  assisted: "Assistido",
  high: "Alto",
  critical: "Crítico",
};

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-sm text-foreground">{value}</dd>
    </div>
  );
}

export function ChatVerticalHandoffSurface({ snapshot }: ChatVerticalHandoffSurfaceProps) {
  if (!snapshot) {
    return (
      <section
        aria-label="Estado do handoff vertical do chat"
        className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-muted-foreground"
      >
        Nenhum handoff vertical ativo.
      </section>
    );
  }

  const renderHints = snapshot.renderHints;
  const hasRenderHints =
    Boolean(renderHints?.verticalBadgeLabel) ||
    Boolean(renderHints?.suggestedSurface) ||
    Boolean(renderHints?.ctaLabel) ||
    Boolean(renderHints?.cockpitDeepLink);

  return (
    <section
      aria-label={`Handoff vertical read-only para ${snapshot.verticalId}`}
      className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 shadow-xl shadow-black/10"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-accent">Handoff read-only</p>
          <h4 className="mt-1 break-words text-base font-semibold text-foreground">{snapshot.verticalId}</h4>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${
            snapshot.riskLevel === "critical"
              ? "border-rose-300/35 bg-rose-500/10 text-rose-100"
              : snapshot.riskLevel === "high"
                ? "border-amber-300/35 bg-amber-500/10 text-amber-100"
                : "border-cyan-300/30 bg-cyan-500/10 text-cyan-100"
          }`}
        >
          {RISK_LABELS[snapshot.riskLevel]}
        </span>
      </div>

      <p className="mt-3 break-words text-sm leading-6 text-muted-foreground">{snapshot.handoffMessage}</p>

      {snapshot.riskLevel === "critical" && snapshot.hitlRequired ? (
        <div
          role="status"
          aria-label="Aviso read-only de HITL obrigatório"
          className="mt-3 rounded-xl border border-rose-300/25 bg-rose-500/10 px-3 py-2 text-sm text-rose-100"
        >
          HITL obrigatório. Aviso visual apenas; nenhuma aprovação é executada nesta superfície.
        </div>
      ) : null}

      <dl className="mt-4 grid gap-2 sm:grid-cols-2">
        <Field label="ReasonCode" value={snapshot.reasonCode} />
        <Field label="HITL" value={snapshot.hitlRequired ? "Requerido" : "Não requerido"} />
      </dl>

      {hasRenderHints ? (
        <div className="mt-4 rounded-xl border border-white/10 bg-black/15 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Render hints de apresentação
          </p>
          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            {renderHints?.verticalBadgeLabel ? <Field label="Badge" value={renderHints.verticalBadgeLabel} /> : null}
            {renderHints?.suggestedSurface ? (
              <Field label="Superfície sugerida" value={renderHints.suggestedSurface} />
            ) : null}
            {renderHints?.ctaLabel ? <Field label="CTA sugerida" value={renderHints.ctaLabel} /> : null}
            {renderHints?.cockpitDeepLink ? <Field label="Deep link" value={renderHints.cockpitDeepLink} /> : null}
          </dl>
        </div>
      ) : null}
    </section>
  );
}

export default ChatVerticalHandoffSurface;
