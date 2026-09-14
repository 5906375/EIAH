import React from "react";

import { apiCreatePreDuimpContext } from "@/lib/api";
import {
  buildPreDuimpCreateRequest,
  isAuthorizedShadowResponse,
  PRE_DUIMP_REASON_MESSAGES,
  presentPreDuimpError,
  type PreDuimpErrorPresentation,
} from "@/features/logistica/preDuimp";
import { useSession } from "@/state/sessionStore";

type SubmissionState = "idle" | "submitting" | "success" | "error";

export default function PreDuimpPage() {
  const session = useSession();
  const [recordId, setRecordId] = React.useState("");
  const [submissionState, setSubmissionState] = React.useState<SubmissionState>("idle");
  const [error, setError] = React.useState<PreDuimpErrorPresentation | null>(null);
  const submissionInFlightRef = React.useRef(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submissionInFlightRef.current) return;
    setError(null);

    let request;
    try {
      request = buildPreDuimpCreateRequest({
        tenantId: session.tenantId,
        workspaceId: session.workspaceId,
        recordId,
      });
    } catch {
      setSubmissionState("error");
      setError({
        reasonCode: "VALIDATION_ERROR",
        message: PRE_DUIMP_REASON_MESSAGES.VALIDATION_ERROR,
      });
      return;
    }

    setSubmissionState("submitting");
    submissionInFlightRef.current = true;

    try {
      const response = await apiCreatePreDuimpContext(request);
      if (!isAuthorizedShadowResponse(response)) {
        throw new Error("PRE_DUIMP shadow invariants were not satisfied");
      }
      setSubmissionState("success");
    } catch (submissionError) {
      setSubmissionState("error");
      setError(presentPreDuimpError(submissionError));
    } finally {
      submissionInFlightRef.current = false;
    }
  };

  return (
    <section className="space-y-6" aria-labelledby="pre-duimp-title">
      <header className="glass-panel overflow-hidden p-6 sm:p-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent">Logística</p>
            <div className="flex flex-wrap items-center gap-3">
              <h1 id="pre-duimp-title" className="font-display text-3xl font-semibold text-foreground sm:text-4xl">
                Pré-DUIMP
              </h1>
              <span className="pill border-amber-300/30 bg-amber-300/10 text-amber-100">Modo shadow</span>
            </div>
            <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              Prepare internamente um contexto DUIMP para validação governada, sem execução aduaneira real.
            </p>
          </div>

          <div className="shrink-0 rounded-2xl border border-emerald-300/25 bg-emerald-300/10 px-4 py-3 text-sm text-emerald-100">
            <p className="font-semibold">Nenhuma transmissão ao Siscomex/Portal Único</p>
            <p className="mt-1 text-xs text-emerald-100/75">Transmissão externa permanece desativada.</p>
          </div>
        </div>
      </header>

      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(17rem,2fr)]">
        <form className="glass-panel min-w-0 space-y-6 p-6 sm:p-8" onSubmit={handleSubmit} noValidate>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-accent">Ação disponível</p>
            <h2 className="mt-2 text-2xl font-semibold text-foreground">Criar contexto</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              A identidade e as coordenadas do recurso são obtidas da sessão autenticada e revalidadas pelo servidor.
            </p>
          </div>

          <label htmlFor="pre-duimp-record-id" className="block text-sm font-medium text-foreground">
            Identificador do contexto
            <input
              id="pre-duimp-record-id"
              name="recordId"
              type="text"
              required
              autoComplete="off"
              value={recordId}
              onChange={(event) => {
                setRecordId(event.target.value);
                if (submissionState !== "submitting") {
                  setSubmissionState("idle");
                  setError(null);
                }
              }}
              placeholder="Ex.: contexto-duimp-001"
              className="mt-2 w-full min-w-0 rounded-xl border border-input bg-black/30 px-4 py-3 text-base text-foreground outline-none transition placeholder:text-muted-foreground/60 focus:border-accent focus:ring-2 focus:ring-accent/30"
            />
          </label>

          <dl className="grid gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Vertical</dt>
              <dd className="mt-1 font-medium text-foreground">Logística</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Tipo de registro</dt>
              <dd className="mt-1 font-medium text-foreground">Contexto DUIMP</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Modo</dt>
              <dd className="mt-1 font-medium text-foreground">Shadow</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Transmissão externa</dt>
              <dd className="mt-1 font-medium text-foreground">Desativada</dd>
            </div>
          </dl>

          <button
            type="submit"
            disabled={submissionState === "submitting"}
            className="inline-flex w-full items-center justify-center rounded-full border border-accent/50 bg-accent/15 px-5 py-3 text-sm font-semibold text-foreground transition hover:border-accent hover:bg-accent/25 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            {submissionState === "submitting" ? "Criando contexto..." : "Criar contexto shadow"}
          </button>

          <div
            className="min-h-6 text-sm"
            aria-live={submissionState === "error" ? "assertive" : "polite"}
            aria-atomic="true"
            data-testid="pre-duimp-status"
          >
            {submissionState === "submitting" ? (
              <p className="text-accent">Validando o contexto no front door governado...</p>
            ) : null}
            {submissionState === "success" ? (
              <div className="rounded-2xl border border-emerald-300/30 bg-emerald-300/10 p-4 text-emerald-100">
                <p className="font-semibold">Contexto autorizado em modo shadow.</p>
                <p className="mt-1 text-xs">Nenhuma transmissão externa foi permitida.</p>
              </div>
            ) : null}
            {submissionState === "error" && error ? (
              <div role="alert" className="rounded-2xl border border-rose-300/30 bg-rose-300/10 p-4 text-rose-100">
                <p className="font-semibold">{error.message}</p>
                {error.reasonCode ? (
                  <p className="mt-1 text-xs">Código para suporte: {error.reasonCode}</p>
                ) : null}
              </div>
            ) : null}
          </div>
        </form>

        <aside className="glass-subtle min-w-0 space-y-4 p-6 sm:p-8" aria-labelledby="pre-duimp-availability-title">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-accent">Ambiente interno</p>
            <h2 id="pre-duimp-availability-title" className="mt-2 text-xl font-semibold text-foreground">
              Disponibilidade
            </h2>
          </div>

          <div className="space-y-3">
            <article className="rounded-2xl border border-emerald-300/25 bg-emerald-300/10 p-4">
              <p className="font-semibold text-emerald-100">Criação de contexto</p>
              <p className="mt-1 text-sm text-emerald-100/75">Disponível exclusivamente em modo shadow.</p>
            </article>

            <article className="rounded-2xl border border-white/10 bg-white/5 p-4" aria-disabled="true">
              <p className="font-semibold text-foreground">Revisão</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Aprovação HITL persistida ainda não está habilitada neste ambiente.
              </p>
            </article>

            <article className="rounded-2xl border border-white/10 bg-white/5 p-4" aria-disabled="true">
              <p className="font-semibold text-foreground">Replay</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Replay e idempotência persistidos ainda estão em preparação.
              </p>
            </article>
          </div>
        </aside>
      </div>
    </section>
  );
}
