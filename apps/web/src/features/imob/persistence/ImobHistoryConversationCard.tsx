import React from "react";
import { ApiError, type ImobChatConversation, type ImobChatThread, type ImobContractInterviewState } from "@/lib/api";
import { IMOB_HISTORY_CARD_TITLE } from "@/components/agents/imobHistoryConversationEngine";
import { resolveImobAccessGateCopy } from "@/features/imob/accessGateCatalog";
import { getContractTypeLabel } from "@/features/imob/contractInterviewEngine";
import type { ImobConversationPersistence } from "./useImobConversationPersistence";

type GateInput = Parameters<typeof resolveImobAccessGateCopy>[0];

type View =
  | { status: "loading" }
  | { status: "blocked"; message: string }
  | { status: "error"; message: string }
  | { status: "ready"; conversations: ImobChatConversation[]; threads: ImobChatThread[]; interview: ImobContractInterviewState | null };

const INTERVIEW_STATUS_LABEL: Record<ImobContractInterviewState["status"], string> = {
  collecting: "coletando respostas",
  review: "em revisão",
  generating: "gerando",
  generated: "concluída",
};
const THREAD_STATUS_LABEL = { active: "ativa", waiting: "aguardando", done: "concluída", blocked: "bloqueada" } as const;

function describeError(error: unknown): View {
  if (error instanceof ApiError && error.status === 403) {
    const body = error.body && typeof error.body === "object" ? (error.body as { error?: GateInput }).error : undefined;
    return { status: "blocked", message: resolveImobAccessGateCopy(body).body };
  }
  return { status: "error", message: error instanceof Error ? error.message : "Falha ao carregar o histórico do IMOB." };
}

const CARD_CLASS = "mt-3 w-full min-w-0 max-w-full space-y-3 overflow-x-auto rounded-2xl border border-accent/30 bg-black/20 p-3 sm:p-4 [contain:inline-size]";

/**
 * FD-IMOB-PERSISTENCE-001 — conversas, threads e estado de entrevista do IMOB, dentro da conversa do Front Door. Lê o histórico que o chat
 * IMOB já persiste (mesmos endpoints; o servidor autoriza por tenant/workspace). Abrir uma conversa ou retomar uma thread só carrega
 * contexto para os próximos turnos: cada turno continua sendo autorizado pela API.
 */
export function ImobHistoryConversationCard({ persistence }: { persistence: ImobConversationPersistence }) {
  const { core, conversationId, resumed, openConversation, resumeThread, caseIdForThread } = persistence;
  const [view, setView] = React.useState<View>({ status: "loading" });
  const [notice, setNotice] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    setView((current) => (current.status === "ready" ? current : { status: "loading" }));
    try {
      const conversations = await core.listConversations(20);
      const current = core.getConversationId();
      const [threads, interview] = current
        ? await Promise.all([core.listThreads(current), core.getInterviewState(current)])
        : [[] as ImobChatThread[], null];
      setView({ status: "ready", conversations, threads, interview });
    } catch (error) {
      setView(describeError(error));
    }
  }, [core]);

  React.useEffect(() => {
    void refresh();
  }, [refresh, conversationId]);

  const open = async (id: string) => {
    setNotice(null);
    try {
      const outcome = await openConversation(id);
      setNotice(outcome ? `Conversa reaberta com ${outcome.messages.length} mensagem(ns).` : "Conversa não encontrada.");
    } catch (error) {
      const next = describeError(error);
      setNotice(next.status === "ready" || next.status === "loading" ? null : next.message);
    }
  };

  return (
    <section aria-label="Histórico IMOB nesta conversa" data-testid="imob-history-card" className={CARD_CLASS}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">IMOB · nesta conversa</p>
          <h3 className="text-lg font-semibold">{IMOB_HISTORY_CARD_TITLE}</h3>
          <p className="text-xs text-muted-foreground">Conversas, threads e estado de entrevista já gravados no IMOB. Abrir uma conversa traz o histórico para cá.</p>
        </div>
        <button type="button" onClick={() => void refresh()} className="min-h-[40px] rounded-lg border border-white/15 px-3 text-xs">Atualizar</button>
      </header>
      {notice ? <p role="status" data-testid="imob-history-notice" className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm">{notice}</p> : null}
      {view.status === "loading" ? <p role="status" data-testid="imob-history-loading">Carregando o histórico do IMOB…</p> : null}
      {view.status === "blocked" ? (
        <div role="status" data-testid="imob-history-blocked" className="space-y-1 rounded-xl border border-amber-300/40 bg-amber-500/10 px-3 py-2 text-sm">
          <p className="font-semibold">Histórico IMOB indisponível nesta conversa</p>
          <p>{view.message}</p>
          <p className="text-xs">Nenhum dado foi exibido.</p>
        </div>
      ) : null}
      {view.status === "error" ? <p role="alert" data-testid="imob-history-error" className="rounded-xl border border-rose-300/30 bg-rose-300/10 px-3 py-2 text-sm">{view.message}</p> : null}
      {view.status === "ready" ? (
        <div className="space-y-4" data-testid="imob-history-ready">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Conversas ({view.conversations.length})</h4>
            {view.conversations.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground" data-testid="imob-history-empty">Nenhuma conversa do IMOB gravada ainda.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {view.conversations.map((item) => (
                  <li key={item.conversationId} data-testid="imob-history-conversation" className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="break-words font-medium">{item.title}{item.conversationId === conversationId ? " · atual" : ""}</p>
                        {item.lastMessagePreview ? <p className="mt-0.5 break-words text-xs text-muted-foreground">{item.lastMessagePreview}</p> : null}
                        <p className="mt-0.5 text-[11px] text-muted-foreground">{item.lastMessageAt ? new Date(item.lastMessageAt).toLocaleString("pt-BR") : ""}</p>
                      </div>
                      {item.conversationId !== conversationId ? (
                        <button type="button" onClick={() => void open(item.conversationId)} className="min-h-[40px] rounded-lg border border-accent/40 px-3 text-xs text-accent">Abrir</button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {conversationId ? (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Threads da conversa atual ({view.threads.length})</h4>
              {view.threads.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground" data-testid="imob-history-no-threads">Sem threads de operação nesta conversa.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {view.threads.map((thread) => (
                    <li key={thread.threadId} data-testid="imob-history-thread" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/20 p-3 text-sm">
                      <span className="min-w-0 break-words">
                        {thread.label} · {THREAD_STATUS_LABEL[thread.status]} · {thread.messageCount} mensagem(ns)
                        {resumed?.threadId === thread.threadId ? " · retomada" : ""}
                      </span>
                      {resumed?.threadId !== thread.threadId ? (
                        <button
                          type="button"
                          className="min-h-[40px] rounded-lg border border-accent/40 px-3 text-xs text-accent"
                          onClick={() => {
                            resumeThread({ threadId: thread.threadId, label: thread.label, status: thread.status, caseId: caseIdForThread(thread.threadId) });
                            setNotice(`Thread "${thread.label}" retomada: os próximos pedidos seguem nela.`);
                          }}
                        >Retomar</button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
          {conversationId ? (
            <div data-testid="imob-history-interview">
              <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Entrevista de contrato</h4>
              {view.interview ? (
                <p className="mt-2 text-sm" data-testid="imob-history-interview-state">
                  {view.interview.contractType ? getContractTypeLabel(view.interview.contractType) : "Contrato"} · {INTERVIEW_STATUS_LABEL[view.interview.status]} · passo {view.interview.currentStep + 1} · {Object.keys(view.interview.answers ?? {}).length} resposta(s) gravada(s)
                </p>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground" data-testid="imob-history-interview-none">Sem entrevista de contrato gravada nesta conversa.</p>
              )}
              {view.interview && view.interview.status !== "generated" ? (
                <p className="mt-1 text-xs text-muted-foreground">Para concluir o contrato, use a barra Locações ou Negócios desta conversa (formulário de contrato).</p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export default ImobHistoryConversationCard;
