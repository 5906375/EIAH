import React from "react";
import { OraculoPreparationPanel } from "@/features/logistica/OraculoPreparationPanel";
import { Link, useSearchParams } from "react-router-dom";
import type { LogisticaContextAccess } from "@eiah/contracts";
import { ApiError, apiGetSessionContext } from "@/lib/api";
import { useSession } from "@/state/sessionStore";
import { VerticalWorkbenchShell } from "@/features/workbench/VerticalWorkbenchShell";
import { isPreDuimpAccessAllowed, isPreDuimpFrontendEnabled } from "@/features/logistica/preDuimp";
import { LOGISTICA_ACCESS_MESSAGES, LOGISTICA_CASE_PARAM, isValidLogisticaCaseRef, logisticaFrontDoorHref } from "@/components/agents/logisticaCaseContextEngine";

const PENDING = LOGISTICA_ACCESS_MESSAGES;

export function LogisticaCockpitContent({ access, preDuimpAllowed, workspaceId, initialCaseId = null }: {
  access: LogisticaContextAccess; preDuimpAllowed: boolean; workspaceId: string; initialCaseId?: string | null;
}) {
  const [panelOpen, setPanelOpen] = React.useState(false);
  const [openCaseId, setOpenCaseId] = React.useState<string | null>(null);
  if (!access.allowed) return <section className="space-y-4 rounded-2xl border border-white/10 p-6" aria-label="Acesso à Logística">
    <h1 className="text-2xl font-semibold">Logística & Comex</h1>
    <p role="status">{PENDING[access.reason]}</p>
    <Link className="text-accent underline" to="/app/chat?domain=core">Ir ao Front Door para consultar a liberação ou ativar Logística</Link>
  </section>;
  const contextPanel = <div className="space-y-4 p-5 text-base">
    <h2 className="text-lg font-semibold">Contexto do workspace</h2>
    <p className="break-all">{workspaceId}</p>
    <p>{access.usage === "read_only" ? "Acesso somente para leitura." : "Consulta e preparação de contexto."}</p>
    <p>Execução operacional, pagamentos e transmissão externa não estão liberados neste cockpit.</p>
  </div>;
  return <VerticalWorkbenchShell
    compactColumns
    eyebrow="Logística & Comex" title="Oráculo SC" description="Cockpit integrado ao Front Door"
    helperText="Prepare o contexto da operação." verticalLabel="LOGISTICA" statusLabel="Consulta de contexto"
    backHref={logisticaFrontDoorHref(openCaseId)} backLabel="Voltar ao Front Door"
    panelToggleLabel="Contexto e permissões" isContextPanelOpen={panelOpen}
    onToggleContextPanel={() => setPanelOpen((open) => !open)} contextPanel={contextPanel}
    sidebar={<nav aria-label="Módulos de Logística" className="space-y-4 p-5 text-base"><p className="font-semibold">Oráculo SC</p><a className="block text-accent underline" href="#devolucao">Devolução de contêiner</a><a className="block text-accent underline" href="#pre-duimp">Pré-DUIMP</a></nav>}
    main={<div className="space-y-6 p-5 sm:p-8">
      <header><p className="text-base text-accent">Logística & Comex</p><h1 className="text-3xl font-semibold">Oráculo SC</h1><p className="mt-2 text-base">Prepare sua operação com contexto e evidências.</p></header>
      <section id="devolucao" className="space-y-4 rounded-xl border border-white/15 p-5">
        <h2 className="text-xl font-semibold">Devolução de contêiner vazio</h2>
        <p>Porto, depósito e fluxo podem ser informados quando conhecidos. A análise operacional ainda depende de validação.</p>
        <OraculoPreparationPanel readOnly={access.usage === "read_only"} initialCaseId={initialCaseId} onCaseChange={setOpenCaseId} />
      </section>
      <section id="pre-duimp" className="space-y-3 rounded-xl border border-white/15 p-5"><h2 className="text-xl font-semibold">Pré-DUIMP Governada</h2><p>Módulo do Oráculo SC com liberação própria.</p>{preDuimpAllowed ? <Link className="text-accent underline" to="/app/logistica/pre-duimp">Abrir Pré-DUIMP</Link> : <p role="status">Pré-DUIMP indisponível para esta sessão. Consulte a liberação no Front Door.</p>}</section>
    </div>}
  />;
}

export default function LogisticaCockpitPage() {
  const session = useSession();
  const [searchParams] = useSearchParams();
  const rawCase = searchParams.get(LOGISTICA_CASE_PARAM);
  const caseRef = isValidLogisticaCaseRef(rawCase) ? rawCase : null;
  const scope = `${session.tenantId}:${session.workspaceId}:${session.userId}:${session.token}`;
  const [result, setResult] = React.useState<{ scope: string; access: LogisticaContextAccess | null; preDuimpAllowed: boolean } | null>(null);
  const [attempt, setAttempt] = React.useState(0);
  React.useEffect(() => {
    const controller = new AbortController();
    let current = true;
    void apiGetSessionContext("logistica", controller.signal).then((response) => {
      if (current) setResult({ scope, access: response.ok ? response.data?.capabilities?.logisticaContext ?? null : null,
        preDuimpAllowed: response.ok && isPreDuimpAccessAllowed(isPreDuimpFrontendEnabled(), { status: "ready", capability: response.data?.capabilities?.preDuimpShadow }) });
    }).catch((error: unknown) => {
      if (!current) return;
      const body = error instanceof ApiError ? error.body as { error?: { capability?: LogisticaContextAccess } } | undefined : undefined;
      setResult({ scope, access: body?.error?.capability ?? null, preDuimpAllowed: false });
    });
    return () => { current = false; controller.abort(); };
  }, [scope, attempt]);
  if (!result || result.scope !== scope) return <p role="status">Validando acesso à Logística…</p>;
  if (!result.access) return <section className="space-y-4"><h1 className="text-2xl">Logística & Comex</h1><p role="alert">Não foi possível validar o acesso ao cockpit.</p><button type="button" onClick={() => { setResult(null); setAttempt((value) => value + 1); }}>Tentar novamente</button><Link className="block text-accent underline" to="/app/chat?domain=core">Voltar ao Front Door</Link></section>;
  return <LogisticaCockpitContent key={scope} access={result.access} preDuimpAllowed={result.preDuimpAllowed} workspaceId={session.workspaceId} initialCaseId={caseRef} />;
}
