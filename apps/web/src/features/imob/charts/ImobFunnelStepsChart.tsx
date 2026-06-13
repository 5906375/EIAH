import React from "react";

type Step = { id: string; label: string; count: number; conversionPct: number };
type Props = { steps: Step[]; loading: boolean; windowDays?: 7 | 15 | 30 };

const COLORS = ["#8b5cf6", "#7c3aed", "#6d28d9", "#5b21b6", "#4c1d95"];

function getStepTransitionState(previousCount: number, currentCount: number, conversionPct: number) {
  if (previousCount === 0 && currentCount > 0) {
    return {
      tone: "text-rose-300",
      prefix: "⚠",
      summary: "anomalia crítica",
    };
  }
  if (conversionPct > 100) {
    return {
      tone: "text-amber-200",
      prefix: "↑",
      summary: "anomalia",
    };
  }
  return {
    tone: "text-emerald-300/80",
    prefix: "↓",
    summary: "conversão",
  };
}

export function ImobFunnelStepsChart({ steps, loading, windowDays = 30 }: Props) {
  const maxCount = steps.length > 0 ? Math.max(...steps.map((s) => s.count), 1) : 1;

  return (
    <section className="rounded-3xl border border-white/10 bg-surface/60 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Funil de conversão</h2>
        <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          {steps.length} etapas · {windowDays}d
        </span>
      </div>

      {loading ? (
        <div className="mt-6 flex h-44 items-center justify-center text-sm text-muted-foreground">Carregando...</div>
      ) : steps.length === 0 ? (
        <div className="mt-6 flex h-44 items-center justify-center text-sm text-muted-foreground">
          Sem dados de funil neste recorte.
        </div>
      ) : (
        <div className="mt-5 space-y-2.5">
          {steps.map((step, index) => {
            const widthPct = (step.count / maxCount) * 100;
            const color = COLORS[Math.min(index, COLORS.length - 1)];
            const previousStep = index > 0 ? steps[index - 1] : null;
            const previousCount = previousStep?.count ?? 0;
            const dropOff = previousStep ? Math.max(0, previousCount - step.count) : 0;
            const transitionState = previousStep
              ? getStepTransitionState(previousCount, step.count, step.conversionPct)
              : null;
            return (
              <div key={step.id}>
                {previousStep && transitionState ? (
                  <p className={`mb-1.5 ml-[6.5rem] text-[10px] tracking-[0.1em] ${transitionState.tone}`}>
                    {transitionState.prefix} {step.count} de {previousCount} · {step.conversionPct.toFixed(1)}% de {transitionState.summary}
                    {dropOff > 0 ? ` · -${dropOff}` : ""}
                  </p>
                ) : null}
                <div className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-right text-[11px] text-muted-foreground leading-tight">
                    {step.label}
                  </span>
                  <div className="relative flex-1 h-6 rounded-md bg-white/5 overflow-hidden">
                    <div
                      className="h-full rounded-md"
                      style={{
                        width: `${widthPct}%`,
                        backgroundColor: color,
                        opacity: 0.82,
                        transition: "width 0.7s ease-out",
                      }}
                    />
                  </div>
                  <span className="w-10 shrink-0 text-right text-[11px] font-semibold tabular-nums text-foreground">
                    {step.count}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
