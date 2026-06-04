import React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SelfServiceAgentConfig } from "../config";
import {
  buildTenantRecipeInstructions,
  clampRecipeTags,
  createEmptyRecipeStep,
  inferSuggestedTags,
  recommendRecipeMode,
  TENANT_RECIPE_LIMITS,
  type TenantRecipeComposerState,
} from "../tenantRecipeComposer";
import TenantRecipeStepEditor from "./TenantRecipeStepEditor";

type Props = {
  form: TenantRecipeComposerState;
  configs: SelfServiceAgentConfig[];
  isSubmitting: boolean;
  onChange: (patch: Partial<TenantRecipeComposerState>) => void;
  onSubmit: (status: "draft" | "homologated") => void;
};

function Counter(props: { current: number; limit: number }) {
  const { current, limit } = props;
  const nearLimit = current > limit * 0.85;
  const overLimit = current > limit;
  return (
    <span className={overLimit ? "text-red-300" : nearLimit ? "text-amber-200" : "text-muted-foreground"}>
      {current}/{limit}
    </span>
  );
}

export default function TenantRecipeComposer(props: Props) {
  const { form, configs, isSubmitting, onChange, onSubmit } = props;
  const [tagInput, setTagInput] = React.useState("");

  const generatedInstructions = React.useMemo(() => buildTenantRecipeInstructions(form), [form]);
  const suggestedTags = React.useMemo(() => inferSuggestedTags(form), [form]);
  const recommendedMode = React.useMemo(() => recommendRecipeMode(form), [form]);

  React.useEffect(() => {
    if (!form.instructionsManuallyEdited && form.instructions !== generatedInstructions) {
      onChange({ instructions: generatedInstructions });
    }
  }, [form.instructions, form.instructionsManuallyEdited, generatedInstructions, onChange]);

  const setMode = (mode: "simple" | "staged") => {
    onChange({
      mode,
      steps: mode === "staged" && form.steps.length === 0 ? [createEmptyRecipeStep(0)] : form.steps,
    });
  };

  const addTag = (value: string) => {
    const normalized = clampRecipeTags([...form.tags, value]);
    onChange({ tags: normalized });
    setTagInput("");
  };

  const removeTag = (value: string) => {
    onChange({ tags: form.tags.filter((tag) => tag !== value) });
  };

  const addStep = () => {
    onChange({ steps: [...form.steps, createEmptyRecipeStep(form.steps.length)] });
  };

  const updateStep = (stepId: string, patch: Partial<(typeof form.steps)[number]>) => {
    onChange({
      steps: form.steps.map((step) => (step.id === stepId ? { ...step, ...patch } : step)),
    });
  };

  const removeStep = (stepId: string) => {
    if (form.steps.length <= 1) return;
    onChange({ steps: form.steps.filter((step) => step.id !== stepId) });
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0a1527] p-5">
        <p className="text-xs uppercase tracking-[0.25em] text-accent">Publicar nova recipe</p>
        <div className="mt-4 grid gap-4 text-xs text-muted-foreground">
          <div className="grid gap-2">
            <span className="uppercase tracking-[0.2em] text-[10px]">Modo da recipe</span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setMode("simple")}
                className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.22em] transition ${
                  form.mode === "simple"
                    ? "border-accent/60 bg-accent/20 text-accent"
                    : "border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10"
                }`}
              >
                Recipe simples
              </button>
              <button
                type="button"
                onClick={() => setMode("staged")}
                className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.22em] transition ${
                  form.mode === "staged"
                    ? "border-accent/60 bg-accent/20 text-accent"
                    : "border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10"
                }`}
              >
                Recipe em etapas
              </button>
            </div>
            {recommendedMode === "staged" && form.mode !== "staged" ? (
              <p className="rounded-xl border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-amber-100">
                Este plano parece multi-etapa. Vale organizar como uma recipe principal com checkpoints internos.
              </p>
            ) : null}
          </div>

          <label className="flex flex-col gap-2">
            <span className="uppercase tracking-[0.2em] text-[10px]">Agente</span>
            <Select
              value={form.agentId}
              onValueChange={(value) => onChange({ agentId: value })}
            >
              <SelectTrigger className="h-10 rounded-xl border-white/10 bg-white/5 px-3 py-2 text-xs text-foreground shadow-none">
                <SelectValue placeholder="Selecione um agente" />
              </SelectTrigger>
              <SelectContent>
                {configs.map((config) => (
                  <SelectItem key={config.slug} value={config.agentId}>
                    {config.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <span className="uppercase tracking-[0.2em] text-[10px]">Título</span>
              <Counter current={form.title.length} limit={TENANT_RECIPE_LIMITS.title} />
            </div>
            <input
              type="text"
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-foreground"
              value={form.title}
              onChange={(event) => onChange({ title: event.target.value })}
            />
          </label>

          <label className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <span className="uppercase tracking-[0.2em] text-[10px]">Resumo</span>
              <Counter current={form.summary.length} limit={TENANT_RECIPE_LIMITS.summary} />
            </div>
            <textarea
              rows={3}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-foreground"
              value={form.summary}
              onChange={(event) => onChange({ summary: event.target.value })}
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="uppercase tracking-[0.2em] text-[10px]">Escopo</span>
            <Select
              value={form.scopeMode}
              onValueChange={(value) =>
                onChange({ scopeMode: value as "current_workspace" | "all_workspaces" })
              }
            >
              <SelectTrigger className="h-10 rounded-xl border-white/10 bg-white/5 px-3 py-2 text-xs text-foreground shadow-none">
                <SelectValue placeholder="Selecione o escopo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="current_workspace">Workspace atual</SelectItem>
                <SelectItem value="all_workspaces">Todos os workspaces</SelectItem>
              </SelectContent>
            </Select>
          </label>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <span className="uppercase tracking-[0.2em] text-[10px]">Tags</span>
              <Counter current={form.tags.length} limit={TENANT_RECIPE_LIMITS.tags} />
            </div>
            <div className="flex flex-wrap gap-2">
              {form.tags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground transition hover:bg-white/10"
                >
                  {tag} ×
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={(event) => setTagInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === ",") {
                    event.preventDefault();
                    if (tagInput.trim()) addTag(tagInput);
                  }
                }}
                className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-foreground"
                placeholder="Digite uma tag e pressione Enter"
              />
              <button
                type="button"
                onClick={() => addTag(tagInput)}
                disabled={!tagInput.trim()}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-foreground transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Adicionar
              </button>
            </div>
            {form.tags.length === 0 && suggestedTags.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {suggestedTags.map((tag) => (
                  <button
                    key={`suggested-${tag}`}
                    type="button"
                    onClick={() => addTag(tag)}
                    className="rounded-full border border-accent/30 bg-accent/10 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-accent transition hover:bg-accent/20"
                  >
                    + {tag}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <label className="flex flex-col gap-2">
            <span className="uppercase tracking-[0.2em] text-[10px]">
              {form.mode === "staged" ? "Objetivo geral" : "Objetivo final"}
            </span>
            <textarea
              rows={3}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-foreground"
              value={form.goal}
              onChange={(event) => onChange({ goal: event.target.value })}
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="uppercase tracking-[0.2em] text-[10px]">Resultado prático esperado</span>
            <textarea
              rows={2}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-foreground"
              value={form.expectedOutcome}
              onChange={(event) => onChange({ expectedOutcome: event.target.value })}
            />
          </label>

          {form.mode === "staged" ? (
            <div className="space-y-3">
              {form.steps.map((step, index) => (
                <TenantRecipeStepEditor
                  key={step.id}
                  index={index}
                  step={step}
                  onChange={updateStep}
                  onRemove={removeStep}
                  disableRemove={form.steps.length === 1}
                />
              ))}
              <button
                type="button"
                onClick={addStep}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[10px] uppercase tracking-[0.22em] text-foreground transition hover:bg-white/10"
              >
                Adicionar etapa
              </button>
            </div>
          ) : null}

          <label className="flex flex-col gap-2">
            <span className="uppercase tracking-[0.2em] text-[10px]">
              {form.mode === "staged" ? "Condição final de GO" : "Evidências esperadas / condição de GO"}
            </span>
            <textarea
              rows={3}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-foreground"
              value={form.goCondition}
              onChange={(event) => onChange({ goCondition: event.target.value })}
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="uppercase tracking-[0.2em] text-[10px]">
              {form.mode === "staged" ? "Condição final de bloqueio" : "Condição de bloqueio"}
            </span>
            <textarea
              rows={3}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-foreground"
              value={form.blockCondition}
              onChange={(event) => onChange({ blockCondition: event.target.value })}
            />
          </label>

          <label className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <span className="uppercase tracking-[0.2em] text-[10px]">Instruções</span>
              <Counter current={form.instructions.length} limit={TENANT_RECIPE_LIMITS.instructions} />
            </div>
            <textarea
              rows={10}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-foreground"
              value={form.instructions}
              onChange={(event) =>
                onChange({ instructions: event.target.value, instructionsManuallyEdited: true })
              }
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  onChange({
                    instructions: generatedInstructions,
                    instructionsManuallyEdited: false,
                  })
                }
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-foreground transition hover:bg-white/10"
              >
                Regenerar instruções
              </button>
              {form.instructionsManuallyEdited ? (
                <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-amber-100">
                  edição manual ativa
                </span>
              ) : (
                <span className="rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-accent">
                  sincronizado com os campos
                </span>
              )}
            </div>
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={isSubmitting || !form.title.trim() || !form.summary.trim()}
            onClick={() => onSubmit("draft")}
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-foreground transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Salvar draft
          </button>
          <button
            type="button"
            disabled={isSubmitting || !form.title.trim() || !form.summary.trim()}
            onClick={() => onSubmit("homologated")}
            className="rounded-full border border-accent/60 bg-accent/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-accent transition hover:border-accent hover:bg-accent/30 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Homologar e publicar
          </button>
        </div>
    </div>
  );
}
