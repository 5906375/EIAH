export const DIRECTED_ACTION_BADGE = "ação direcionada — aguardando confirmação" as const;

export type DirectedActionCardCta = {
  id: string;
  action: "confirm_execution" | "reject_execution";
  label: string;
  kind: "primary" | "neutral";
};

export type DirectedActionCard = {
  type: "action";
  title: string;
  thread: { id: string; label: string; status: "waiting" };
  lines: string[];
  ctas: DirectedActionCardCta[];
};

export type AgentsExecuteMetadata = {
  chatFlow: string;
  intent: string;
  conversationId?: string;
  threadId: string;
  threadLabel: string;
  sessionRunId?: string;
  source?: string;
};

/**
 * Determines if the current turn should use the directed-action confirmation
 * flow instead of the standard auto-execute path.
 * True only when actionId is present AND backend returned mode="execute".
 */
export function shouldUseDirectedActionFlow(
  requestedActionId: string | null | undefined,
  turnMode: string
): boolean {
  return Boolean(requestedActionId && requestedActionId.trim().length > 0) && turnMode === "execute";
}

/**
 * Builds the card shown to the user while waiting for explicit confirmation
 * of a directed action dispatched from the Command Center.
 */
export function buildDirectedActionCard(thread: { id: string; label: string }): DirectedActionCard {
  return {
    type: "action",
    title: thread.label,
    thread: { id: thread.id, label: thread.label, status: "waiting" },
    lines: ["Ação selecionada no Command Center. Confirme para iniciar a execução governada."],
    ctas: [
      {
        id: "confirm-dispatch",
        action: "confirm_execution",
        label: "Confirmar execução",
        kind: "primary",
      },
      {
        id: "cancel-dispatch",
        action: "reject_execution",
        label: "Cancelar",
        kind: "neutral",
      },
    ],
  };
}

/**
 * Builds the metadata object for apiAgentsExecute.
 * Includes source only when provided, so non-directed calls stay clean.
 */
export function buildAgentsExecuteMetadata(params: {
  chatFlow: string;
  intent: string;
  conversationId?: string | null;
  threadId: string;
  threadLabel: string;
  sessionRunId?: string | null;
  source?: string | null;
}): AgentsExecuteMetadata {
  const meta: AgentsExecuteMetadata = {
    chatFlow: params.chatFlow,
    intent: params.intent,
    threadId: params.threadId,
    threadLabel: params.threadLabel,
  };
  if (params.conversationId) meta.conversationId = params.conversationId;
  if (params.sessionRunId) meta.sessionRunId = params.sessionRunId;
  if (params.source) meta.source = params.source;
  return meta;
}
