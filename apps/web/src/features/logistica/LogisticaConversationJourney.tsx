import React from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import type { LogisticaContextAccess, OraculoDecisionViewV1, OraculoPreparationRecordV1 } from "@eiah/contracts";
import { useSession } from "@/state/sessionStore";
import {
  LOGISTICA_ACCESS_MESSAGES,
  LOGISTICA_CASE_PARAM,
  parseLogisticaCaseRef,
  readRememberedLogisticaCase,
  rememberLogisticaCase,
  resolveLogisticaCaseForCard,
  type LogisticaCaseMemoryStore,
  type LogisticaServerCase,
} from "@/components/agents/logisticaCaseContextEngine";
import {
  LOGISTICA_JOURNEY_SCOPE_NOTE,
  LOGISTICA_JOURNEY_TITLE,
  resolveLogisticaJourney,
  type JourneyStepState,
  type LogisticaJourneyView,
} from "@/components/agents/logisticaConversationEngine";
import { OraculoPreparationPanel } from "./OraculoPreparationPanel";
import { LOGISTICA_CASE_CHANGED_EVENT } from "@/components/agents/logisticaCaseContextEngine";
import { fetchLogisticaAccess } from "./logisticaAccess";
import { isPreDuimpFrontendEnabled } from "./preDuimp";

function browserCaseStore(): LogisticaCaseMemoryStore | null {
  try { return typeof window !== "undefined" ? window.sessionStorage : null; } catch { return null; }
}

const STATE_LABEL: Record<JourneyStepState, string> = { done: "Concluída", pending: "Pendente", needs_human: "Exige decisão humana" };
const STATE_TONE: Record<JourneyStepState, string> = {
  done: "border-emerald-300/40 text-emerald-100",
  pending: "border-white/20 text-muted-foreground",
  needs_human: "border-amber-300/50 text-amber-100",
};

/** Só renderiza a jornada já resolvida pelo engine (agente define, engine executa, tela renderiza). */
export function LogisticaJourneyStepsView({ view, onCopySummary }: { view: LogisticaJourneyView; onCopySummary?: (summary: string) => void }) {
  return (
    <div className="space-y-3" data-testid="logistica-journey-steps">
      <ol className="space-y-2" aria-label="Etapas da preparação">
        {view.steps.map((step) => (
          <li key={step.id} className={`rounded-xl border px-3 py-2 text-sm ${STATE_TONE[step.state]}`} data-step={step.id} data-state={step.state}>
            <p className="font-semibold">{step.title} · <span data-testid={`step-state-${step.id}`}>{STATE_LABEL[step.state]}</span></p>
            <p className="text-xs">{step.detail}</p>
            {step.pendencies.length ? (
              <ul className="mt-1 list-disc pl-5 text-xs" aria-label={`Pendências — ${step.title}`}>
                {step.pendencies.map((line) => <li key={line} className="break-words">{line}</li>)}
              </ul>
            ) : null}
          </li>
        ))}
      </ol>
      <div className="rounded-xl border border-white/15 px-3 py-2 text-sm" aria-label="Resultados disponíveis">
        <p className="font-semibold">Resultados disponíveis</p>
        <ul className="list-disc pl-5 text-xs">{view.results.map((line) => <li key={line}>{line}</li>)}</ul>
      </div>
      <p className="text-sm"><span className="font-semibold">Próximo passo:</span> {view.nextAction}</p>
      {view.humanDecisionNeeded && view.forwardSummary ? (
        <div className="space-y-2 rounded-xl border border-amber-300/40 bg-amber-500/10 px-3 py-2 text-sm" aria-label="Encaminhar ao responsável">
          <p className="font-semibold">Decisão humana necessária</p>
          <p className="text-xs">Não existe fila nem aviso automático: a solicitação formal fica registrada no caso (painel de decisão abaixo) e o resumo não notifica ninguém. Use-o para falar com o responsável fora desta conversa.</p>
          <pre className="whitespace-pre-wrap break-words rounded-lg bg-black/30 p-2 text-xs" data-testid="forward-summary">{view.forwardSummary}</pre>
          {onCopySummary ? <button type="button" className="rounded-lg bg-accent/20 px-3 py-2 text-xs" onClick={() => onCopySummary(view.forwardSummary!)}>Copiar resumo para o responsável</button> : null}
        </div>
      ) : null}
    </div>
  );
}

export function LogisticaJourneyBlockedView({ reason }: { reason: LogisticaContextAccess["reason"] }) {
  return (
    <div role="status" className="space-y-1 rounded-xl border border-amber-300/40 bg-amber-500/10 px-3 py-2 text-sm" data-testid="logistica-journey-blocked">
      <p className="font-semibold">Preparação indisponível nesta conversa</p>
      <p>{LOGISTICA_ACCESS_MESSAGES[reason]}</p>
      <p className="text-xs">Nenhuma operação foi executada e nenhum dado foi consultado.</p>
    </div>
  );
}

/**
 * Jornada de preparação de Logística & Comex dentro da conversa do Front Door (M4/M5, escopo local). Reaproveita o painel do Oráculo
 * (contexto, evidências e conferência humana) e o contrato do servidor: o servidor decide o acesso e a gravação a cada consulta;
 * sem acesso confirmado nada é mostrado. A referência opaca do caso fica no `?case=` para a conversa retomar o mesmo caso.
 */
export default function LogisticaConversationJourney({ serverCase = null }: { serverCase?: LogisticaServerCase | null } = {}) {
  const session = useSession();
  const location = useLocation();
  const [, setSearchParams] = useSearchParams();
  // A referência com que o cartão ABRIU fica estável: o painel a aplica depois da consulta da lista; apagá-la da URL antes disso
  // (o painel avisa `null` ao montar) impedia retomar o caso após recarregar a página.
  const memoryScope = React.useMemo(() => ({ tenantId: session.tenantId, workspaceId: session.workspaceId, userId: session.userId }), [session.tenantId, session.workspaceId, session.userId]);
  // O servidor já validou (ou recusou) a referência no handoff; a decisão de qual referência abrir é do engine.
  const startup = React.useRef(resolveLogisticaCaseForCard({
    urlRef: parseLogisticaCaseRef(location.search),
    memoryRef: readRememberedLogisticaCase(browserCaseStore(), memoryScope),
    serverCase,
  }));
  const initialCaseRef = React.useRef<string | null>(startup.current.caseRef);
  const openedCase = React.useRef(false);
  // Caso a abrir no painel: parte da referência de partida e acompanha `?case=` quando a URL passa a apontar para outro caso (por exemplo,
  // "Abrir na conversa" na caixa de pendências do Front Door). O servidor continua validando a abertura (404/403 ⇒ esquece a referência).
  const [openRef, setOpenRef] = React.useState<string | null>(startup.current.caseRef);
  const caseRef = openRef;
  const urlCaseRef = parseLogisticaCaseRef(location.search);
  const scope = `${session.tenantId}:${session.workspaceId}:${session.userId}:${session.token}`;
  const [access, setAccess] = React.useState<{ scope: string; value: LogisticaContextAccess | null } | null>(null);
  const [record, setRecord] = React.useState<OraculoPreparationRecordV1 | null>(null);
  // Situação da decisão humana (J17) que o painel do caso consulta ao servidor; o engine só a combina com o registro da mesma revisão.
  const [decisionView, setDecisionView] = React.useState<OraculoDecisionViewV1 | null>(null);
  const [copied, setCopied] = React.useState(false);
  React.useEffect(() => {
    let current = true;
    void fetchLogisticaAccess().then((value) => { if (current) setAccess({ scope, value }); });
    return () => { current = false; };
  }, [scope]);
  const onCaseChange = React.useCallback((id: string | null) => {
    if (id) openedCase.current = true;
    else if (initialCaseRef.current && !openedCase.current) return; // ainda abrindo o caso da referência: não apagar
    rememberLogisticaCase(browserCaseStore(), memoryScope, id); // "Nova preparação" (id nulo) esquece o caso; caso aberto/criado é lembrado
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      if (id) next.set(LOGISTICA_CASE_PARAM, id); else next.delete(LOGISTICA_CASE_PARAM);
      return next.toString() === previous.toString() ? previous : next;
    }, { replace: true });
  }, [setSearchParams, memoryScope]);
  // O servidor recusou a referência (inexistente, outro workspace ou sem permissão): esquecer, limpar a URL e seguir com preparação nova.
  const onInitialCaseFailed = React.useCallback(() => {
    initialCaseRef.current = null;
    rememberLogisticaCase(browserCaseStore(), memoryScope, null);
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      next.delete(LOGISTICA_CASE_PARAM);
      return next.toString() === previous.toString() ? previous : next;
    }, { replace: true });
  }, [setSearchParams, memoryScope]);
  React.useEffect(() => {
    // Referência recusada pelo servidor: esquecer (memória e URL) e seguir com preparação nova, sem criar caso.
    if (!startup.current.forget) return;
    rememberLogisticaCase(browserCaseStore(), memoryScope, null);
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      next.delete(LOGISTICA_CASE_PARAM);
      return next.toString() === previous.toString() ? previous : next;
    }, { replace: true });
  }, [memoryScope, setSearchParams]);
  React.useEffect(() => {
    if (!urlCaseRef || urlCaseRef === openRef || urlCaseRef === record?.caseId) return;
    initialCaseRef.current = urlCaseRef; openedCase.current = false; setOpenRef(urlCaseRef);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlCaseRef]);
  const view = React.useMemo(() => resolveLogisticaJourney(record, decisionView), [record, decisionView]);
  const lastSignal = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!record) return;
    const key = `${record.caseId}:${record.revision}`;
    if (lastSignal.current === key) return;
    // Só avisa depois da primeira leitura: abrir o caso não é uma mudança.
    const first = lastSignal.current === null;
    lastSignal.current = key;
    if (!first) window.dispatchEvent(new CustomEvent(LOGISTICA_CASE_CHANGED_EVENT, { detail: { caseId: record.caseId, revision: record.revision } }));
  }, [record]);
  const resolved = access && access.scope === scope ? access.value : undefined;
  return (
    <section aria-label="Preparação de devolução de contêiner vazio — Logística & Comex" data-testid="logistica-journey" className="mt-3 space-y-3 rounded-2xl border border-accent/30 bg-black/20 p-3 sm:p-4">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Logística & Comex · nesta conversa</p>
        <h3 className="text-lg font-semibold">{LOGISTICA_JOURNEY_TITLE}</h3>
        <p className="text-xs">{LOGISTICA_JOURNEY_SCOPE_NOTE}</p>
        {isPreDuimpFrontendEnabled() ? <p className="text-xs" data-testid="pre-duimp-hint">Também nesta conversa: Pré-DUIMP em modo shadow — escreva “Quero preparar o Pré-DUIMP”.</p> : null}
      </header>
      {resolved === undefined ? <p role="status">Verificando o acesso à preparação…</p>
        : !resolved || !resolved.allowed || resolved.usage === "blocked" ? <LogisticaJourneyBlockedView reason={resolved?.reason ?? "unavailable"} />
        : <>
          <LogisticaJourneyStepsView view={view} onCopySummary={(summary) => { void navigator.clipboard?.writeText(summary).then(() => setCopied(true)).catch(() => setCopied(false)); }} />
          {copied ? <p role="status" className="text-xs">Resumo copiado.</p> : null}
          <OraculoPreparationPanel readOnly={resolved.usage === "read_only"} initialCaseId={caseRef} onCaseChange={onCaseChange} onRecordChange={setRecord} onInitialCaseFailed={onInitialCaseFailed} onDecisionViewChange={setDecisionView} />
        </>}
    </section>
  );
}
