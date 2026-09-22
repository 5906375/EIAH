import React from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  apiRadarGetAttempt,
  apiRadarGetRecommendation,
  apiRadarListEvaluations,
  apiRadarRunAttempt,
  apiRadarSubmitEvaluation,
  radarNewOperationKey,
  type RadarAnalysisAttempt,
  type RadarRecommendation,
  type RadarRecommendationEvaluation,
} from "@/lib/api";
import { useSession } from "@/state/sessionStore";
import RadarAttemptStatusCard from "./components/RadarAttemptStatusCard";
import RadarEvaluationForm, { type RadarEvaluationFormValues } from "./components/RadarEvaluationForm";

const IN_PROGRESS_STATUSES = new Set<RadarAnalysisAttempt["status"]>(["pending", "running", "provider_responded_pending_persistence"]);

/** Encontra a ponta da cadeia de avaliações do PRÓPRIO usuário (a que ainda
 * não tem sucessora) — usada para oferecer "corrigir" em vez de uma nova
 * raiz, mesma regra já aplicada no servidor. */
function findOwnChainTip(evaluations: RadarRecommendationEvaluation[], userId: string | undefined): RadarRecommendationEvaluation | null {
  if (!userId) return null;
  const own = evaluations.filter((e) => e.evaluatorUserId === userId);
  if (own.length === 0) return null;
  const superseded = new Set(own.map((e) => e.supersedesEvaluationId).filter((id): id is string => Boolean(id)));
  return own.find((e) => !superseded.has(e.id)) ?? own[own.length - 1] ?? null;
}

const RadarRequestPage: React.FC = () => {
  const { entityId = "", requestId = "" } = useParams<{ entityId: string; requestId: string }>();
  const [searchParams] = useSearchParams();
  const attemptId = searchParams.get("attemptId") ?? "";
  const session = useSession();

  const [attempt, setAttempt] = React.useState<RadarAnalysisAttempt | null>(null);
  const [recommendation, setRecommendation] = React.useState<RadarRecommendation | null>(null);
  const [evaluations, setEvaluations] = React.useState<RadarRecommendationEvaluation[]>([]);
  const [attemptError, setAttemptError] = React.useState<string | null>(null);
  const [runError, setRunError] = React.useState<string | null>(null);
  const [running, setRunning] = React.useState(false);
  const [evaluationSubmitting, setEvaluationSubmitting] = React.useState(false);
  const [evaluationError, setEvaluationError] = React.useState<string | null>(null);

  // Consulta de estado / atualização de página: SOMENTE GET, nunca dispara
  // runGovernedAnalysis — só o botão "Rodar análise simulada" abaixo chama
  // apiRadarRunAttempt. Mesmo padrão de backoff de AgentFormShell.tsx.
  React.useEffect(() => {
    if (!attemptId) return;
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      try {
        const fresh = await apiRadarGetAttempt(attemptId);
        if (cancelled) return;
        setAttempt(fresh.attempt);
        setAttemptError(null);
        if (IN_PROGRESS_STATUSES.has(fresh.attempt.status)) {
          timeout = setTimeout(poll, 2500);
        }
      } catch (error) {
        if (cancelled) return;
        setAttemptError(error instanceof Error ? error.message : "Tentativa não encontrada ou sem acesso");
        timeout = setTimeout(poll, 4000);
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (timeout) clearTimeout(timeout);
    };
  }, [attemptId]);

  const loadRecommendationAndHistory = React.useCallback(() => {
    return apiRadarGetRecommendation(requestId)
      .then((response) => {
        setRecommendation(response.recommendation);
        return apiRadarListEvaluations(response.recommendation.id);
      })
      .then((response) => {
        if (response) setEvaluations(response.evaluations ?? []);
      })
      .catch(() => {
        // Ainda não concluída, ou sem acesso — nada a mostrar por ora.
      });
  }, [requestId]);

  React.useEffect(() => {
    if (attempt?.status === "completed") {
      void loadRecommendationAndHistory();
    }
  }, [attempt?.status, loadRecommendationAndHistory]);

  async function handleRun() {
    if (!attemptId) return;
    setRunning(true);
    setRunError(null);
    try {
      const result = await apiRadarRunAttempt(attemptId);
      setAttempt(result.attempt);
      if (result.recommendation) {
        setRecommendation(result.recommendation);
        void apiRadarListEvaluations(result.recommendation.id).then((response) => setEvaluations(response.evaluations ?? []));
      }
    } catch (error) {
      setRunError(error instanceof Error ? error.message : "Falha ao rodar a análise simulada");
    } finally {
      setRunning(false);
    }
  }

  async function handleEvaluationSubmit(values: RadarEvaluationFormValues) {
    if (!recommendation) return;
    setEvaluationSubmitting(true);
    setEvaluationError(null);
    try {
      await apiRadarSubmitEvaluation(recommendation.id, {
        fundamentacao: values.fundamentacao,
        clareza: values.clareza,
        utilidade: values.utilidade,
        justificativa: values.justificativa || null,
        comentario: values.comentario || null,
        operationKey: radarNewOperationKey(),
        supersedesEvaluationId: ownChainTip?.id ?? null,
      });
      const response = await apiRadarListEvaluations(recommendation.id);
      setEvaluations(response.evaluations ?? []);
    } catch (error) {
      setEvaluationError(error instanceof Error ? error.message : "Falha ao registrar avaliação");
    } finally {
      setEvaluationSubmitting(false);
    }
  }

  const ownChainTip = findOwnChainTip(evaluations, session.userId);

  return (
    <div className="space-y-6">
      <div>
        <Link
          to={`/app/radar/${encodeURIComponent(entityId)}`}
          className="text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
        >
          ← Voltar à entidade
        </Link>
      </div>

      <header className="rounded-3xl border border-white/10 bg-gradient-to-r from-accent/10 via-surface/80 to-transparent p-8">
        <p className="text-xs uppercase tracking-[0.35em] text-accent">Radar Social</p>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">Acompanhamento da tentativa</h1>
      </header>

      {!attemptId ? (
        <p className="rounded-xl border border-amber-400/30 bg-amber-500/5 p-4 text-sm text-amber-200">
          Parâmetro attemptId ausente na URL — abra esta tela a partir de uma solicitação recém-criada.
        </p>
      ) : null}

      {attemptError && !attempt ? (
        <p className="rounded-xl border border-rose-400/30 bg-rose-500/5 p-4 text-sm text-rose-200">{attemptError}</p>
      ) : null}

      {attempt ? (
        <section className="rounded-3xl border border-white/10 bg-surface/60 p-4 sm:p-6">
          <RadarAttemptStatusCard attempt={attempt} />
          {attempt.status === "pending" ? (
            <div className="mt-4">
              {runError ? <p className="mb-2 text-xs text-rose-200">{runError}</p> : null}
              <button
                type="button"
                onClick={handleRun}
                disabled={running}
                className="rounded-full border border-accent/40 bg-accent/10 px-4 py-2 text-xs uppercase tracking-[0.2em] text-accent transition hover:bg-accent/20 disabled:opacity-50"
              >
                {running ? "Rodando..." : "Rodar análise simulada"}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {recommendation ? (
        <section className="rounded-3xl border border-white/10 bg-surface/60 p-4 sm:p-6">
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Recomendação</h2>
          <p className="mt-2 text-sm text-foreground">{recommendation.summary}</p>
          {recommendation.recommendationType === "insufficient_evidence" ? (
            <p className="mt-2 text-xs text-amber-200">Evidência insuficiente: {recommendation.insufficientEvidenceReason}</p>
          ) : null}
          {recommendation.recommendationType === "do_not_act" ? (
            <p className="mt-2 text-xs text-amber-200">Não agir: {recommendation.doNotActReason}</p>
          ) : null}
          {recommendation.suggestedAction ? (
            <p className="mt-2 text-xs text-muted-foreground">Sugestão: {recommendation.suggestedAction}</p>
          ) : null}
          <div className="mt-3 space-y-2">
            {recommendation.statements.map((statement, index) => (
              <p key={index} className="text-xs text-muted-foreground">
                • {statement.content} <span className="uppercase tracking-[0.1em] text-muted-foreground/70">({statement.natureza})</span>
              </p>
            ))}
          </div>
          {recommendation.limitations ? <p className="mt-3 text-xs text-muted-foreground">Limites: {recommendation.limitations}</p> : null}
        </section>
      ) : null}

      {recommendation ? (
        <section className="rounded-3xl border border-white/10 bg-surface/60 p-4 sm:p-6">
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {ownChainTip ? "Corrigir minha avaliação" : "Registrar avaliação humana"}
          </h2>
          <div className="mt-4">
            <RadarEvaluationForm
              submitLabel={ownChainTip ? "Enviar correção" : "Enviar avaliação"}
              submitting={evaluationSubmitting}
              error={evaluationError}
              onSubmit={handleEvaluationSubmit}
            />
          </div>

          <div className="mt-6 space-y-2">
            <h3 className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Histórico</h3>
            {evaluations.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma avaliação registrada ainda.</p>
            ) : (
              evaluations.map((evaluation) => (
                <article key={evaluation.id} className="rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-muted-foreground">
                  <p>
                    {evaluation.evaluatorUserId} • {new Date(evaluation.createdAt).toLocaleString("pt-BR")}
                    {evaluation.supersedesEvaluationId ? " (correção)" : ""}
                  </p>
                  <p className="mt-1 text-foreground">
                    fundamentação: {evaluation.fundamentacao} • clareza: {evaluation.clareza} • utilidade: {evaluation.utilidade}
                  </p>
                  {evaluation.justificativa ? <p className="mt-1">justificativa: {evaluation.justificativa}</p> : null}
                  {evaluation.comentario ? <p className="mt-1">comentário: {evaluation.comentario}</p> : null}
                </article>
              ))
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
};

export default RadarRequestPage;
