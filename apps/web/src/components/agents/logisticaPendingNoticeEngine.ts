import { apiGetChatVerticalRegistry, apiGetOraculoDecisionInbox } from "@/lib/api";

/**
 * FD-CHAT-ONLY-001 — as pendências de decisão humana (J17) chegam como MENSAGEM da conversa do Front Door, no mesmo modelo dos avisos da
 * liberação (ADR-011 §2.4): o engine decide se há algo a dizer a ESTE usuário e o launcher só renderiza o cartão dentro da área de
 * mensagens. Nada é consultado em workspace sem Logística (o registry do servidor decide); sem pendência nem pedido do usuário não há
 * mensagem. Não concede nada: elegibilidade, isolamento e idempotência continuam sendo do servidor.
 */
export type LogisticaPendingNotice = { content: string; awaitingYou: number; yours: number };

type Deps = {
  logisticaEnabled: () => Promise<boolean>;
  inboxCounts: () => Promise<{ awaitingYou: number; yours: number }>;
};

const defaults: Deps = {
  logisticaEnabled: async () => (await apiGetChatVerticalRegistry()).data.verticals.some((vertical) => vertical.id === "log" && vertical.status === "enabled"),
  inboxCounts: async () => {
    const inbox = (await apiGetOraculoDecisionInbox()).data;
    return { awaitingYou: inbox.awaitingYou.length, yours: inbox.yours.length };
  },
};

/** Fail-closed: qualquer falha ou ausência de Logística habilitada ⇒ nenhuma mensagem. */
export async function fetchLogisticaPendingNotice(deps: Deps = defaults): Promise<LogisticaPendingNotice | null> {
  try {
    if (!(await deps.logisticaEnabled())) return null;
    const { awaitingYou, yours } = await deps.inboxCounts();
    if (awaitingYou === 0 && yours === 0) return null;
    const parts = [
      awaitingYou ? `${awaitingYou} pendência(s) de decisão humana aguardando você` : null,
      yours ? `${yours} pedido(s) seu(s) com andamento ou resultado` : null,
    ].filter(Boolean);
    return {
      content: `Logística & Comex: ${parts.join(" e ")}. Abra o caso aqui na conversa para decidir ou ver o resultado. Decidir é um registro humano e não autoriza execução, aceite da devolução, custos nem transmissão.`,
      awaitingYou, yours,
    };
  } catch {
    return null;
  }
}

/** Marca a mensagem como a das pendências (uma única por conversa; o cartão se atualiza sozinho). */
export function attachLogisticaPendingToSnapshot<S extends { logisticaPendingDecisions?: boolean | null }>(snapshot: S): S {
  return { ...snapshot, logisticaPendingDecisions: true };
}
export const hasLogisticaPendingMessage = (snapshots: Array<{ logisticaPendingDecisions?: boolean | null } | null | undefined>) =>
  snapshots.some((snapshot) => snapshot?.logisticaPendingDecisions === true);
