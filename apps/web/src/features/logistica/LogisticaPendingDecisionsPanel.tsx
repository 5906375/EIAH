import React from "react";
import { Link } from "react-router-dom";
import type { OraculoDecisionInboxItemV1, OraculoDecisionInboxV1 } from "@eiah/contracts";
import { apiGetOraculoDecisionInbox } from "@/lib/api";
import { useSession } from "@/state/sessionStore";
import { INBOX_DECIDE_BLOCK_MESSAGES, INBOX_STATUS_LABELS, describeInboxTrigger } from "@/components/agents/logisticaConversationEngine";
import { LOGISTICA_CASE_CHANGED_EVENT, logisticaFrontDoorHref } from "@/components/agents/logisticaCaseContextEngine";

const shortId = (caseId: string) => caseId.slice(0, 8);

function InboxItem({ item, mine }: { item: OraculoDecisionInboxItemV1; mine: boolean }) {
  return <li className="space-y-1 rounded-lg border border-white/15 p-3 text-sm" data-testid={mine ? "inbox-yours" : "inbox-awaiting"} data-status={item.status} data-case={item.caseId}>
    <p className="font-semibold">Caso {shortId(item.caseId)} · {INBOX_STATUS_LABELS[item.status]}{item.decision ? ` · ${item.decision.value === "approved" ? "aprovada" : item.decision.value === "rejected" ? "rejeitada" : "complementação"}` : ""}</p>
    <p className="text-xs">Pedido na revisão {item.basedOnRevision} · caso na revisão {item.currentRevision} · {new Date(item.requestedAt).toLocaleString("pt-BR")}{item.basisCurrent ? "" : " · o caso mudou depois do pedido"}</p>
    <ul className="list-disc pl-5 text-xs">{item.triggers.map((key) => <li key={key} className="break-words">{describeInboxTrigger(key)}</li>)}</ul>
    {item.note && !item.decision ? <p className="break-words text-xs">Motivo informado: {item.note}</p> : null}
    {item.decision ? <p className="break-words text-xs">Justificativa da decisão: {item.decision.note}</p> : null}
    <Link className="inline-flex min-h-[36px] items-center text-accent underline" to={logisticaFrontDoorHref(item.caseId)}>
      {mine ? "Abrir o caso na conversa" : "Abrir na conversa para decidir"}
    </Link>
  </li>;
}

/** Só renderiza o que o servidor resolveu: nada é apresentado como ação sua sem elegibilidade comprovada (agente define, engine executa, tela renderiza). */
export function LogisticaPendingDecisionsView({ inbox, loading, error, onRefresh }: { inbox: OraculoDecisionInboxV1 | null; loading: boolean; error: boolean; onRefresh?: () => void }) {
  const open = inbox?.yours.filter((item) => item.status === "pending" || item.status === "obsolete") ?? [];
  const answered = inbox?.yours.filter((item) => item.status !== "pending" && item.status !== "obsolete") ?? [];
  const nothing = inbox && !inbox.awaitingYou.length && !inbox.yours.length;
  return <section aria-label="Pendências de decisão humana" data-testid="pending-decisions" className="mt-4 space-y-3 rounded-2xl border border-amber-300/30 p-4 sm:p-5">
    <h2 className="text-lg font-semibold">Pendências de decisão humana</h2>
    <p className="text-xs">Solicitar ou decidir é um registro humano no caso: não autoriza execução, aceite da devolução, custos nem transmissão. Não há aviso automático: esta lista é consultada ao abrir o Front Door e ao atualizar.</p>
    {loading && !inbox ? <p role="status">Consultando pendências…</p> : null}
    {error ? <p role="status" data-testid="inbox-error">Não foi possível consultar as pendências agora. Nada foi alterado.</p> : null}
    {inbox ? <>
      {inbox.eligibility.canDecide
        ? <div className="space-y-2" aria-label="Aguardando sua decisão">
            <h3 className="font-semibold">Aguardando sua decisão ({inbox.awaitingYou.length})</h3>
            {inbox.awaitingYou.length ? <ul className="space-y-2">{inbox.awaitingYou.map((item) => <InboxItem key={item.requestId} item={item} mine={false} />)}</ul> : <p className="text-sm" data-testid="inbox-empty-awaiting">Nenhuma pendência aguardando você.</p>}
          </div>
        : <p className="text-sm" data-testid="inbox-not-authorized">{inbox.eligibility.reason ? INBOX_DECIDE_BLOCK_MESSAGES[inbox.eligibility.reason] : "Nenhuma pendência é apresentada como ação sua."}</p>}
      {inbox.yours.length ? <div className="space-y-2" aria-label="Seus pedidos">
        <h3 className="font-semibold">Seus pedidos ({inbox.yours.length})</h3>
        <ul className="space-y-2">{[...open, ...answered].map((item) => <InboxItem key={item.requestId} item={item} mine />)}</ul>
      </div> : null}
      {nothing && inbox.eligibility.canDecide ? <p className="text-sm">Sem pendências neste workspace.</p> : null}
    </> : null}
    {onRefresh ? <button type="button" className="inline-flex min-h-[36px] items-center text-accent underline" onClick={onRefresh}>Atualizar pendências</button> : null}
  </section>;
}

/** Contêiner: consulta a caixa ao servidor (escopo do usuário autenticado) e se atualiza quando o caso muda, ao voltar à janela e sob pedido. */
export default function LogisticaPendingDecisionsPanel() {
  const session = useSession();
  const scope = `${session.tenantId}:${session.workspaceId}:${session.userId}:${session.token}`;
  const [tick, setTick] = React.useState(0);
  const [state, setState] = React.useState<{ scope: string; inbox: OraculoDecisionInboxV1 | null; error: boolean } | null>(null);
  React.useEffect(() => {
    const bump = () => setTick((value) => value + 1);
    window.addEventListener(LOGISTICA_CASE_CHANGED_EVENT, bump);
    window.addEventListener("focus", bump);
    return () => { window.removeEventListener(LOGISTICA_CASE_CHANGED_EVENT, bump); window.removeEventListener("focus", bump); };
  }, []);
  React.useEffect(() => {
    const controller = new AbortController(); let active = true;
    void apiGetOraculoDecisionInbox(controller.signal)
      .then((response) => { if (active) setState({ scope, inbox: response.data, error: false }); })
      .catch(() => { if (active) setState({ scope, inbox: null, error: true }); });
    return () => { active = false; controller.abort(); };
  }, [scope, tick]);
  const current = state && state.scope === scope ? state : null;
  return <LogisticaPendingDecisionsView inbox={current?.inbox ?? null} loading={!current} error={Boolean(current?.error)} onRefresh={() => setTick((value) => value + 1)} />;
}
