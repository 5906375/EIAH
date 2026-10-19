import React from "react";
import { Link, useLocation } from "react-router-dom";
import type { LogisticaContextAccess } from "@eiah/contracts";
import { ApiError, apiGetOraculoPreparation, apiGetSessionContext, apiListOraculoPreparations } from "@/lib/api";
import { useSession } from "@/state/sessionStore";
import {
  parseLogisticaCaseRef,
  resolveLogisticaFrontDoorContext,
  type LogisticaFrontDoorContext,
} from "@/components/agents/logisticaCaseContextEngine";

/** Somente renderiza o contexto já resolvido pelo engine (agente define, engine executa, tela renderiza). */
export function LogisticaFrontDoorContextView({ context }: { context: LogisticaFrontDoorContext | null }) {
  if (!context) return <section aria-label="Contexto de Logística" className="mt-6 rounded-2xl border border-white/10 p-5"><p role="status">Verificando o contexto de Logística…</p></section>;
  const tone = context.status === "no_access" || context.status === "case_unavailable" ? "border-amber-400/30" : "border-white/10";
  return (
    <section aria-label="Contexto de Logística" className={`mt-6 space-y-3 rounded-2xl border ${tone} p-5`}>
      <h2 className="text-lg font-semibold">{context.title}</h2>
      <p role="status">{context.message}</p>
      {context.status === "case" || (context.status === "no_case" && context.recent) ? (() => {
        const summary = context.status === "case" ? context.summary : context.recent!;
        return (
          <dl className="grid gap-2 text-sm sm:grid-cols-2" aria-label="Resumo do caso">
            <div><dt className="font-semibold">Caso</dt><dd>{summary.shortId} · revisão {summary.revision}</dd></div>
            <div><dt className="font-semibold">Atualizado em</dt><dd>{new Date(summary.updatedAt).toLocaleString("pt-BR")}</dd></div>
            <div><dt className="font-semibold">Pendências de preparação</dt><dd>{summary.pending.length ? summary.pending.join(", ") : "Nenhuma"}</dd></div>
            <div><dt className="font-semibold">Aguardando revisão humana</dt><dd>{summary.needsReview.length ? summary.needsReview.join(", ") : "Nenhuma"}</dd></div>
            <div><dt className="font-semibold">Evidências vinculadas</dt><dd>{summary.evidenceCount}</dd></div>
            <div><dt className="font-semibold">Última conferência</dt><dd>{summary.lastReview ? `${summary.lastReview.outcome} (transcrição humana)` : "Não registrada"}</dd></div>
          </dl>
        );
      })() : null}
      <div className="flex flex-wrap gap-3">
        {context.ctas.map((cta) => <Link key={cta.id} className="rounded-lg bg-accent/20 px-4 py-3 text-accent underline" to={cta.href}>{cta.label}</Link>)}
      </div>
    </section>
  );
}

/** O servidor é a fonte do acesso: 200 traz a capacidade; 403 traz a mesma capacidade com o motivo da negação. */
export async function fetchLogisticaAccess(): Promise<LogisticaContextAccess | null> {
  try {
    const response = await apiGetSessionContext("logistica");
    return response.ok ? response.data?.capabilities?.logisticaContext ?? null : null;
  } catch (error) {
    const body = error instanceof ApiError ? (error.body as { error?: { capability?: LogisticaContextAccess } } | undefined) : undefined;
    return body?.error?.capability ?? null;
  }
}

/** Painel do Front Door no domínio logística: o servidor decide o acesso; a referência `?case=` é apenas um ponteiro. */
export default function LogisticaFrontDoorContextPanel() {
  const session = useSession();
  const location = useLocation();
  const caseRef = parseLogisticaCaseRef(location.search);
  const scope = `${session.tenantId}:${session.workspaceId}:${session.userId}:${session.token}:${caseRef ?? ""}`;
  const [result, setResult] = React.useState<{ scope: string; context: LogisticaFrontDoorContext } | null>(null);
  React.useEffect(() => {
    let current = true;
    void resolveLogisticaFrontDoorContext({
      getAccess: fetchLogisticaAccess, caseRef,
      getCase: (id) => apiGetOraculoPreparation(id),
      listCases: () => apiListOraculoPreparations(),
    }).then((context) => { if (current) setResult({ scope, context }); });
    return () => { current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);
  return <LogisticaFrontDoorContextView context={result && result.scope === scope ? result.context : null} />;
}
