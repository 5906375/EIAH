import React from "react";
import type { TenantRecipeComposerStep } from "../tenantRecipeComposer";

type Props = {
  index: number;
  step: TenantRecipeComposerStep;
  onChange: (stepId: string, patch: Partial<TenantRecipeComposerStep>) => void;
  onRemove: (stepId: string) => void;
  disableRemove: boolean;
};

export default function TenantRecipeStepEditor(props: Props) {
  const { index, step, onChange, onRemove, disableRemove } = props;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-accent">Etapa {index + 1}</p>
        <button
          type="button"
          disabled={disableRemove}
          onClick={() => onRemove(step.id)}
          className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-muted-foreground transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Remover
        </button>
      </div>
      <div className="mt-3 grid gap-3 text-xs text-muted-foreground">
        <label className="flex flex-col gap-2">
          <span className="uppercase tracking-[0.2em] text-[10px]">Nome da etapa</span>
          <input
            type="text"
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-foreground"
            value={step.title}
            onChange={(event) => onChange(step.id, { title: event.target.value })}
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="uppercase tracking-[0.2em] text-[10px]">Objetivo da etapa</span>
          <textarea
            rows={2}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-foreground"
            value={step.objective}
            onChange={(event) => onChange(step.id, { objective: event.target.value })}
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="uppercase tracking-[0.2em] text-[10px]">Checks obrigatórios</span>
          <textarea
            rows={3}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-foreground"
            value={step.checks}
            onChange={(event) => onChange(step.id, { checks: event.target.value })}
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="uppercase tracking-[0.2em] text-[10px]">Evidências esperadas</span>
          <textarea
            rows={3}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-foreground"
            value={step.evidence}
            onChange={(event) => onChange(step.id, { evidence: event.target.value })}
          />
        </label>
        <label className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
          <span className="uppercase tracking-[0.2em] text-[10px] text-foreground">Bloqueia avanço</span>
          <input
            type="checkbox"
            checked={step.blocking}
            onChange={(event) => onChange(step.id, { blocking: event.target.checked })}
            className="h-4 w-4 rounded border-white/20 bg-white/5 text-accent"
          />
        </label>
      </div>
    </div>
  );
}
