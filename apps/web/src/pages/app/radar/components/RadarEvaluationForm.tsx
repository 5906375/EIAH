import React from "react";

// Mesmos valores de apps/api/src/services/radarSocial/radarRecommendationEvaluationContract.ts
// (FUNDAMENTACAO_VALUES/CLAREZA_VALUES/UTILIDADE_VALUES) — reproduzidos aqui
// como literais porque o contrato vive só no pacote da API.
const FUNDAMENTACAO_OPTIONS = [
  { value: "bem_fundamentada", label: "Bem fundamentada" },
  { value: "parcialmente_fundamentada", label: "Parcialmente fundamentada" },
  { value: "nao_fundamentada", label: "Não fundamentada" },
  { value: "nao_avaliavel", label: "Não avaliável" },
] as const;
const CLAREZA_OPTIONS = [
  { value: "clara", label: "Clara" },
  { value: "parcialmente_clara", label: "Parcialmente clara" },
  { value: "confusa", label: "Confusa" },
  { value: "nao_avaliavel", label: "Não avaliável" },
] as const;
const UTILIDADE_OPTIONS = [
  { value: "util", label: "Útil" },
  { value: "parcialmente_util", label: "Parcialmente útil" },
  { value: "nao_util", label: "Não útil" },
  { value: "nao_avaliavel", label: "Não avaliável" },
] as const;

export type RadarEvaluationFormValues = {
  fundamentacao: string;
  clareza: string;
  utilidade: string;
  justificativa: string;
  comentario: string;
};

export const RadarEvaluationForm: React.FC<{
  initial?: Partial<RadarEvaluationFormValues>;
  submitLabel: string;
  submitting: boolean;
  error?: string | null;
  onSubmit: (values: RadarEvaluationFormValues) => void;
}> = ({ initial, submitLabel, submitting, error, onSubmit }) => {
  const [fundamentacao, setFundamentacao] = React.useState(initial?.fundamentacao ?? "");
  const [clareza, setClareza] = React.useState(initial?.clareza ?? "");
  const [utilidade, setUtilidade] = React.useState(initial?.utilidade ?? "");
  const [justificativa, setJustificativa] = React.useState(initial?.justificativa ?? "");
  const [comentario, setComentario] = React.useState(initial?.comentario ?? "");

  const isFullyPositive = fundamentacao === "bem_fundamentada" && clareza === "clara" && utilidade === "util";

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({ fundamentacao, clareza, utilidade, justificativa, comentario });
      }}
      className="space-y-3"
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <select
          required
          value={fundamentacao}
          onChange={(event) => setFundamentacao(event.target.value)}
          className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-foreground focus:border-accent/40 focus:outline-none"
        >
          <option value="" disabled>
            Fundamentação
          </option>
          {FUNDAMENTACAO_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <select
          required
          value={clareza}
          onChange={(event) => setClareza(event.target.value)}
          className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-foreground focus:border-accent/40 focus:outline-none"
        >
          <option value="" disabled>
            Clareza
          </option>
          {CLAREZA_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <select
          required
          value={utilidade}
          onChange={(event) => setUtilidade(event.target.value)}
          className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-foreground focus:border-accent/40 focus:outline-none"
        >
          <option value="" disabled>
            Utilidade
          </option>
          {UTILIDADE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <textarea
        required={!isFullyPositive}
        value={justificativa}
        onChange={(event) => setJustificativa(event.target.value)}
        placeholder={isFullyPositive ? "Justificativa (opcional)" : "Justificativa (obrigatória — avaliação não totalmente positiva)"}
        rows={3}
        className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent/40 focus:outline-none"
      />
      <textarea
        value={comentario}
        onChange={(event) => setComentario(event.target.value)}
        placeholder="Comentário (opcional)"
        rows={2}
        className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent/40 focus:outline-none"
      />
      {error ? <p className="text-xs text-rose-200">{error}</p> : null}
      <button
        type="submit"
        disabled={submitting}
        className="rounded-full border border-accent/40 bg-accent/10 px-4 py-2 text-xs uppercase tracking-[0.2em] text-accent transition hover:bg-accent/20 disabled:opacity-50"
      >
        {submitting ? "Enviando..." : submitLabel}
      </button>
    </form>
  );
};

export default RadarEvaluationForm;
