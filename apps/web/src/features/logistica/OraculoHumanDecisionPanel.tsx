import React from "react";
import type { OraculoDecisionValue, OraculoDecisionViewV1, OraculoPreparationRecordV1 } from "@eiah/contracts";
import { ApiError, apiGetOraculoDecisions, apiRecordOraculoDecision, apiRequestOraculoDecision } from "@/lib/api";
import { DECISION_BLOCK_MESSAGES, DECISION_VALUE_LABELS, describeDecisionTrigger } from "@/components/agents/logisticaConversationEngine";

const STATUS_LABEL = { pending: "Aguardando decisão", obsolete: "Obsoleta — o caso mudou", approved: "Aprovada", rejected: "Rejeitada", more_information: "Complementação solicitada" } as const;
const DECISION_OPTIONS: Array<{ value: OraculoDecisionValue; label: string }> = [
  { value: "approved", label: "Aprovar (aceito como está para esta base do caso)" },
  { value: "rejected", label: "Rejeitar (o caso precisa ser corrigido)" },
  { value: "more_information", label: "Pedir complementação (faltam informações)" },
];

/** Só renderiza a visão que o servidor resolveu (agente define, engine executa, tela renderiza). Os botões chamam as ações recebidas. */
export function OraculoHumanDecisionView({ record, view, canAct, busy, message, onRequest, onDecide }: {
  record: OraculoPreparationRecordV1;
  view: OraculoDecisionViewV1 | null;
  /** O caso está salvo e atualizado nesta tela (sem edição local pendente); sem isso nenhuma ação é oferecida. */
  canAct: boolean;
  busy: boolean;
  message: string;
  onRequest?: (note: string) => void;
  onDecide?: (input: { requestId: string; decision: OraculoDecisionValue; note: string }) => void;
}) {
  const [requestNote, setRequestNote] = React.useState("");
  const [decision, setDecision] = React.useState<OraculoDecisionValue>("approved");
  const [note, setNote] = React.useState("");
  const [read, setRead] = React.useState(false);
  // Os gatilhos vêm do servidor (mesma função pura do contrato que valida o pedido): a tela não reimplementa a regra.
  const triggers = view?.triggers ?? [];
  const open = view?.requests.find((request) => request.status === "pending") ?? null;
  const history = view ? [...view.requests].filter((request) => request !== open).reverse() : [];
  return <section aria-label="Decisão humana do caso" data-testid="human-decision" className="space-y-3 rounded-xl border border-amber-300/30 p-3 sm:p-4">
    <h3 className="text-xl font-semibold">Decisão humana do caso</h3>
    <p className="text-sm">A solicitação fica registrada neste caso (revisão {record.revision}) e vale só para a base atual dele. Decidir não autoriza execução, aceite da devolução, responsabilidade, custos nem transmissão externa.</p>
    {triggers.length ? <ul className="list-disc space-y-1 pl-5 text-sm" aria-label="Itens que exigem decisão humana">{triggers.map((trigger) => <li key={trigger.key} className="break-words">{describeDecisionTrigger(trigger, record)}</li>)}</ul> : <p className="text-sm">Nenhum item exige decisão humana nesta base do caso.</p>}
    {!view ? <p role="status">Consultando a situação da decisão…</p> : <>
      {open ? <div className="space-y-2 rounded-lg border border-white/15 p-3" data-testid="decision-pending">
        <p className="font-semibold">Decisão solicitada · {STATUS_LABEL.pending}</p>
        <p className="text-xs">Pedido na revisão {open.basedOnRevision} · {new Date(open.requestedAt).toLocaleString("pt-BR")} · {open.requestedByYou ? "solicitado por você" : "solicitado por outro membro"}</p>
        {open.note ? <p className="break-words text-sm">Motivo informado: {open.note}</p> : null}
        {open.requestedByYou ? <p className="text-sm" data-testid="decision-independence">Quem pediu não decide o próprio pedido: aguarde outro responsável elegível abrir este caso.</p>
          : view.eligibility.decideAllowed && canAct ? <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); if (read && note.trim()) onDecide?.({ requestId: open.id, decision, note: note.trim() }); }}>
            <fieldset disabled={busy} className="space-y-3">
              <legend className="text-lg">Registrar decisão</legend>
              <label className="block">Decisão<select className="mt-1 block w-full rounded-lg border border-white/20 bg-surface p-3" value={decision} onChange={(event) => setDecision(event.target.value as OraculoDecisionValue)}>{DECISION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
              <label className="block">Justificativa da decisão<textarea className="mt-1 block w-full rounded-lg border border-white/20 bg-surface p-3" required maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} /></label>
              <label className="flex items-start gap-3"><input className="mt-1" type="checkbox" checked={read} required onChange={(event) => setRead(event.target.checked)} />Li os itens acima e os documentos e conferências do caso.</label>
              <button type="submit" className="inline-flex min-h-[40px] items-center rounded-lg bg-accent/20 px-4 py-3 disabled:opacity-50" disabled={busy || !read || !note.trim()}>{busy ? "Registrando…" : "Registrar decisão"}</button>
            </fieldset>
          </form>
          : <p className="text-sm" data-testid="decision-awaiting">{view.eligibility.decideAllowed ? "Salve ou descarte a edição local antes de decidir." : view.eligibility.decideBlockedReason === "not_designated" ? "Não há responsável designado para decidir neste ambiente." : "Aguardando um responsável com a política de conferência humana do workspace."}</p>}
      </div> : null}
      {!open && triggers.length && view.eligibility.requestAllowed && canAct ? <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); onRequest?.(requestNote.trim()); setRequestNote(""); }}>
        <label className="block">Motivo para o responsável (opcional)<input className="mt-1 block w-full rounded-lg border border-white/20 bg-surface p-3" maxLength={500} value={requestNote} onChange={(event) => setRequestNote(event.target.value)} /></label>
        <button type="submit" className="inline-flex min-h-[40px] items-center rounded-lg bg-accent/20 px-4 py-3 disabled:opacity-50" disabled={busy}>{busy ? "Solicitando…" : "Solicitar decisão humana"}</button>
      </form> : null}
      {!open && triggers.length && !view.eligibility.requestAllowed && view.eligibility.requestBlockedReason ? <p role="status" data-testid="decision-blocked" className="rounded-lg border border-amber-300/40 bg-amber-500/10 p-3 text-sm">{DECISION_BLOCK_MESSAGES[view.eligibility.requestBlockedReason]}</p> : null}
      {history.length ? <details className="rounded-lg border border-white/15 p-3 text-sm" open={!open}><summary>Solicitações e decisões deste caso ({history.length})</summary>
        <ol className="mt-2 space-y-2" aria-label="Histórico de decisões">{history.map((request) => <li key={request.id} className="rounded-lg border border-white/10 p-2" data-status={request.status} data-testid="decision-history-item">
          <p className="font-semibold">{STATUS_LABEL[request.status]}{request.decision ? ` · ${DECISION_VALUE_LABELS[request.decision.value]}` : ""}</p>
          <p className="text-xs">Pedido na revisão {request.basedOnRevision}{request.requestedByYou ? " por você" : ""}{request.basisCurrent ? "" : " · o caso mudou depois deste pedido"}</p>
          {request.decision ? <><p className="break-words">Justificativa: {request.decision.note}</p><p className="text-xs">{request.decision.decidedByYou ? "Decidido por você" : "Decidido por outro responsável"} · {new Date(request.decision.decidedAt).toLocaleString("pt-BR")}</p></> : null}
        </li>)}</ol></details> : null}
    </>}
    {message ? <p role="status">{message}</p> : null}
  </section>;
}

/** Contêiner: consulta a visão ao servidor, executa pedir/decidir e devolve o registro novo ao painel do caso (a revisão sobe a cada evento). */
export function OraculoHumanDecisionPanel({ current, editable, blocked, onChanged, onBusyChange, onViewChange }: {
  current: OraculoPreparationRecordV1; editable: boolean; blocked: boolean;
  onChanged: (value: OraculoPreparationRecordV1) => void; onBusyChange: (value: boolean) => void;
  onViewChange?: (view: OraculoDecisionViewV1 | null) => void;
}) {
  const [view, setView] = React.useState<OraculoDecisionViewV1 | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [refresh, setRefresh] = React.useState(0);
  const alive = React.useRef(true);
  React.useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  React.useEffect(() => {
    const controller = new AbortController(); let active = true;
    setView(null);
    void apiGetOraculoDecisions(current.caseId, controller.signal).then((response) => {
      if (!active) return;
      if (response.data.revision === current.revision) setView(response.data);
      else setMessage("O caso mudou. Atualize e reabra a preparação antes de decidir.");
    }).catch(() => { if (active) setMessage("Não foi possível consultar a decisão humana. Atualize a consulta."); });
    return () => { active = false; controller.abort(); };
  }, [current.caseId, current.revision, refresh]);
  React.useEffect(() => { onViewChange?.(view); }, [view]);
  const fail = (error: unknown) => {
    if (!alive.current) return;
    const subreason = error instanceof ApiError && typeof error.body === "object" && error.body ? ((error.body as { error?: { subreason?: string } }).error?.subreason ?? "") : "";
    setMessage(
      subreason === "no_eligible_decider" ? DECISION_BLOCK_MESSAGES.no_eligible_decider
        : subreason === "already_requested" ? "Já existe solicitação para esta base do caso."
        : subreason === "request_obsolete" ? "A solicitação ficou obsoleta porque o caso mudou. Solicite de novo."
        : subreason === "already_decided" ? "Esta solicitação já foi decidida."
        : subreason === "decider_not_independent" ? "Quem pediu não decide o próprio pedido."
        : subreason === "decision_not_designated" ? "Não há responsável designado para decidir neste ambiente: a decisão foi negada e nada foi registrado."
        : subreason === "decision_policy_denied" ? "Sem a política de conferência humana do workspace: a decisão foi negada e nada foi registrado."
        : error instanceof ApiError && error.status === 409 ? "O caso mudou desde a última leitura. Atualize antes de tentar de novo."
        : "Não foi possível concluir. Nada foi registrado; atualize a consulta e tente de novo.",
    );
    setRefresh((value) => value + 1);
  };
  const run = async (action: () => Promise<{ data: OraculoPreparationRecordV1 }>, done: string) => {
    if (busy || blocked) return;
    setBusy(true); onBusyChange(true); setMessage("");
    try { const response = await action(); if (!alive.current) return; onChanged(response.data); setMessage(done); }
    catch (error) { fail(error); }
    finally { if (alive.current) { setBusy(false); onBusyChange(false); } }
  };
  const canAct = editable && !blocked && view?.revision === current.revision;
  // Sem nada a decidir e sem histórico o painel não ocupa espaço; só aparece quando há gatilho ou solicitação/decisão registrada.
  if (!view && !message) return null;
  if (view && !view.triggers.length && !view.requests.length && !message) return null;
  return <OraculoHumanDecisionView record={current} view={view} canAct={canAct} busy={busy || blocked} message={message}
    onRequest={(note) => void run(() => apiRequestOraculoDecision(current.caseId, { expectedRevision: current.revision, ...(note ? { note } : {}) }), "Decisão solicitada e registrada no caso. Nenhuma operação foi autorizada.")}
    onDecide={(input) => void run(() => apiRecordOraculoDecision(current.caseId, { ...input, expectedRevision: current.revision, acknowledgedBasisRead: true }), "Decisão registrada no caso. Ela não autoriza execução, aceite da devolução, custos nem transmissão.")} />;
}
