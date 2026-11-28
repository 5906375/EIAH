import React from "react";
import { apiCreatePreDuimpContext, apiGetSessionContext } from "@/lib/api";
import { useSession } from "@/state/sessionStore";
import {
  buildPreDuimpCreateRequest, isAuthorizedShadowResponse, isPreDuimpFrontendEnabled, loadPreDuimpSessionContext,
  PRE_DUIMP_REASON_MESSAGES, presentPreDuimpError, type PreDuimpAccessState, type PreDuimpErrorPresentation,
} from "./preDuimp";
import { PRE_DUIMP_AVAILABILITY, PRE_DUIMP_CARD_NOTICE, PRE_DUIMP_CARD_TITLE, resolvePreDuimpCardView, type PreDuimpCardView } from "@/components/agents/preDuimpConversationEngine";

type Submission = "idle" | "submitting" | "success" | "error";

/** Só renderiza a visão que o engine resolveu a partir da capacidade do servidor; a ação é a mesma da página legada (criar contexto shadow). */
export function PreDuimpConversationCardView({ view, recordId, onRecordId, submission, error, onSubmit }: {
  view: PreDuimpCardView; recordId: string; onRecordId?: (value: string) => void; submission: Submission; error: PreDuimpErrorPresentation | null; onSubmit?: () => void;
}) {
  return <section aria-label="Pré-DUIMP nesta conversa" data-testid="pre-duimp-card" className="mt-3 space-y-3 rounded-2xl border border-amber-300/30 bg-black/20 p-3 sm:p-4">
    <header className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Logística & Comex · nesta conversa</p>
      <h3 className="text-lg font-semibold">{PRE_DUIMP_CARD_TITLE}</h3>
      <p className="text-xs">{PRE_DUIMP_CARD_NOTICE}</p>
    </header>
    {view.status === "checking" ? <p role="status">Verificando o acesso ao Pré-DUIMP…</p> : null}
    {view.status === "blocked" ? <div role="status" data-testid="pre-duimp-blocked" className="space-y-1 rounded-xl border border-amber-300/40 bg-amber-500/10 px-3 py-2 text-sm">
      <p className="font-semibold">Pré-DUIMP indisponível nesta conversa</p><p>{view.message}</p>
      <p className="text-xs">Código para suporte: {view.reasonCode}. Nada foi executado.</p>
    </div> : null}
    {view.status === "available" ? <form className="space-y-3" noValidate onSubmit={(event) => { event.preventDefault(); onSubmit?.(); }}>
      <label className="block text-sm font-medium" htmlFor="pre-duimp-conv-record-id">Identificador do contexto
        <input id="pre-duimp-conv-record-id" name="recordId" type="text" required autoComplete="off" value={recordId} placeholder="Ex.: contexto-duimp-001"
          onChange={(event) => onRecordId?.(event.target.value)} className="mt-1 block w-full rounded-lg border border-white/20 bg-surface p-3" />
      </label>
      <dl className="grid gap-2 rounded-xl border border-white/10 p-3 text-sm sm:grid-cols-2">
        <div><dt className="text-xs">Vertical</dt><dd>Logística</dd></div><div><dt className="text-xs">Tipo de registro</dt><dd>Contexto DUIMP</dd></div>
        <div><dt className="text-xs">Modo</dt><dd>Shadow</dd></div><div><dt className="text-xs">Transmissão externa</dt><dd>Desativada</dd></div>
      </dl>
      <button type="submit" disabled={submission === "submitting"} className="inline-flex min-h-[40px] items-center rounded-lg bg-accent/20 px-4 py-3 disabled:opacity-50">{submission === "submitting" ? "Criando contexto..." : "Criar contexto shadow"}</button>
    </form> : null}
    <div aria-live={submission === "error" ? "assertive" : "polite"} data-testid="pre-duimp-status">
      {submission === "success" ? <div className="rounded-xl border border-emerald-300/30 bg-emerald-300/10 p-3 text-sm"><p className="font-semibold">Contexto autorizado em modo shadow.</p><p className="text-xs">Nenhuma transmissão externa foi permitida. O servidor registrou só a decisão de autorização; a persistência de contextos e o replay ainda não existem neste ambiente.</p></div> : null}
      {submission === "error" && error ? <div role="alert" className="rounded-xl border border-rose-300/30 bg-rose-300/10 p-3 text-sm"><p className="font-semibold">{error.message}</p>{error.reasonCode ? <p className="text-xs">Código para suporte: {error.reasonCode}</p> : null}</div> : null}
    </div>
    <ul className="grid gap-2 sm:grid-cols-3" aria-label="Disponibilidade do Pré-DUIMP" data-testid="pre-duimp-availability">
      {PRE_DUIMP_AVAILABILITY.map((item) => <li key={item.key} aria-disabled={item.enabled ? undefined : "true"} data-enabled={item.enabled ? "true" : "false"} className="rounded-xl border border-white/10 p-2 text-xs"><p className="font-semibold">{item.title}</p><p>{item.text}</p></li>)}
    </ul>
  </section>;
}

export default function PreDuimpConversationCard() {
  const session = useSession();
  const scope = `${session.tenantId}:${session.workspaceId}:${session.userId}:${session.token}`;
  const [access, setAccess] = React.useState<{ scope: string; value: PreDuimpAccessState } | null>(null);
  const [recordId, setRecordId] = React.useState("");
  const [submission, setSubmission] = React.useState<Submission>("idle");
  const [error, setError] = React.useState<PreDuimpErrorPresentation | null>(null);
  const inFlight = React.useRef(false);
  const frontendEnabled = isPreDuimpFrontendEnabled();
  React.useEffect(() => {
    let active = true;
    if (!frontendEnabled) { setAccess({ scope, value: { status: "idle" } }); return () => { active = false; }; }
    void loadPreDuimpSessionContext((signal) => apiGetSessionContext("logistica", signal)).then((result) => { if (active) setAccess({ scope, value: result.access }); });
    return () => { active = false; };
  }, [scope, frontendEnabled]);
  const view = resolvePreDuimpCardView(frontendEnabled, access && access.scope === scope ? access.value : { status: "loading" });
  async function submit() {
    if (inFlight.current) return;
    setError(null);
    let request;
    try { request = buildPreDuimpCreateRequest({ tenantId: session.tenantId, workspaceId: session.workspaceId, recordId }); }
    catch { setSubmission("error"); setError({ reasonCode: "VALIDATION_ERROR", message: PRE_DUIMP_REASON_MESSAGES.VALIDATION_ERROR }); return; }
    setSubmission("submitting"); inFlight.current = true;
    try {
      const response = await apiCreatePreDuimpContext(request);
      if (!isAuthorizedShadowResponse(response)) throw new Error("PRE_DUIMP shadow invariants were not satisfied");
      setSubmission("success");
    } catch (failure) { setSubmission("error"); setError(presentPreDuimpError(failure)); }
    finally { inFlight.current = false; }
  }
  return <PreDuimpConversationCardView view={view} recordId={recordId} onRecordId={(value) => { setRecordId(value); if (submission !== "submitting") { setSubmission("idle"); setError(null); } }} submission={submission} error={error} onSubmit={() => void submit()} />;
}
