import {
  ApiError,
  apiDecideVerticalApproval,
  apiListVerticalApprovals,
  type VerticalApprovalAdminItem,
} from "@/lib/api";

/**
 * ADR-011 §2.3: o administrador da plataforma EIAH decide pedidos de liberação também pela conversa
 * do front door. O servidor continua sendo quem valida tudo (só administradores veem a fila; para os
 * demais a API responde 404 e a conversa não revela nada). Nenhuma decisão sai sem confirmação
 * explícita logo depois da proposta; a observação é pedida quando é obrigatória (recusar e aprovar
 * contra a recomendação do agente). A conversa mostra só dados do pedido e sinais do score.
 * Cada pedido aparece com os próprios botões Aprovar/Recusar dentro da conversa (cartão), e a
 * confirmação também é por botão. O launcher só renderiza o cartão e envia o texto do botão.
 */

export const APPROVAL_QUEUE_REPLY = "Ver aprovações pendentes";
export const APPROVAL_CONFIRM_APPROVE_REPLY = "Confirmar aprovação";
export const APPROVAL_CONFIRM_REFUSE_REPLY = "Confirmar recusa";
export const APPROVAL_CANCEL_REPLY = "Cancelar decisão";
const MAX_ITEMS = 5;

export type ApprovalChatDecision = "aprovar" | "recusar";

type QueueEntry = {
  id: string;
  label: string;
  noteRequiredToApprove: boolean;
  /** Posição na fila mostrada (1, 2, …), score e motivos não atendidos: só o que o cartão exibe. */
  index?: number;
  scoreLabel?: string;
  misses?: string[];
};

/** Estado congelado no snapshot da mensagem do assistente. */
export type VerticalApprovalChatSnapshot =
  | { status: "queue"; items: QueueEntry[] }
  | { status: "note_needed"; approvalId: string; decision: ApprovalChatDecision; label: string }
  | { status: "confirm"; approvalId: string; decision: ApprovalChatDecision; label: string; note: string | null }
  | { status: "done" | "cancelled" | "failed" | "empty" };

export type VerticalApprovalChatRequest =
  | { step: "list" }
  | { step: "choose"; approvalId: string; decision: ApprovalChatDecision; label: string; noteRequired: boolean }
  | { step: "note"; approvalId: string; decision: ApprovalChatDecision; label: string; note: string }
  | { step: "confirm"; approvalId: string; decision: ApprovalChatDecision; label: string; note: string | null }
  | { step: "cancel" };

const normalize = (value: string) =>
  value.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[.!?]+$/g, "").replace(/\s+/g, " ").trim();

export function isApprovalQueueRequest(input: string) {
  const text = normalize(input);
  if (text === normalize(APPROVAL_QUEUE_REPLY)) return true;
  return /\b(aprovacoes|liberacoes|pedidos de liberacao)\b/.test(text) && /\b(pendentes?|aguardando|fila)\b/.test(text);
}

function isCancel(input: string) {
  const text = normalize(input);
  return text === normalize(APPROVAL_CANCEL_REPLY) || /^(cancelar|cancela|desistir)$/.test(text);
}

// Os botões levam o pedido no texto: o launcher esconde respostas já usadas na conversa, e assim
// uma segunda decisão continua com os próprios botões.
export const choiceReply = (decision: ApprovalChatDecision, index: number, label: string) =>
  `${decision === "aprovar" ? "Aprovar" : "Recusar"} pedido ${index}: ${label}`;

export const confirmReplyFor = (decision: ApprovalChatDecision, label: string) =>
  `${decision === "aprovar" ? APPROVAL_CONFIRM_APPROVE_REPLY : APPROVAL_CONFIRM_REFUSE_REPLY}: ${label}`;

/** Decide o passo do turno (ou nenhum) a partir do pedido e do estado pendente. */
export function resolveVerticalApprovalChatStep(
  input: string,
  pending: VerticalApprovalChatSnapshot | null | undefined,
): VerticalApprovalChatRequest | null {
  const text = normalize(input);
  if (pending?.status === "confirm") {
    const shortReply = pending.decision === "aprovar" ? APPROVAL_CONFIRM_APPROVE_REPLY : APPROVAL_CONFIRM_REFUSE_REPLY;
    if (text === normalize(shortReply) || text === normalize(confirmReplyFor(pending.decision, pending.label))) {
      return { step: "confirm", approvalId: pending.approvalId, decision: pending.decision, label: pending.label, note: pending.note };
    }
    if (isCancel(input)) return { step: "cancel" };
  }
  if (pending?.status === "note_needed") {
    if (isCancel(input)) return { step: "cancel" };
    const note = input.trim().slice(0, 1000);
    if (note) return { step: "note", approvalId: pending.approvalId, decision: pending.decision, label: pending.label, note };
  }
  if (pending?.status === "queue") {
    const match = /^(aprovar|recusar) pedido (\d+)(:|$)/.exec(text);
    const entry = match ? pending.items[Number(match[2]) - 1] : undefined;
    if (match && entry) {
      const decision = match[1] as ApprovalChatDecision;
      return {
        step: "choose",
        approvalId: entry.id,
        decision,
        label: entry.label,
        noteRequired: decision === "recusar" || entry.noteRequiredToApprove,
      };
    }
  }
  if (isApprovalQueueRequest(input)) return { step: "list" };
  return null;
}

export type VerticalApprovalChatPresentation = {
  content: string;
  quickReplies: string[];
  approvalChat: VerticalApprovalChatSnapshot;
};

const RECOMMENDATION_LABEL: Record<string, string> = {
  recomendado: "Recomendado",
  revisar: "Revisar",
  nao_recomendado: "Não recomendado",
};

const itemLabel = (item: VerticalApprovalAdminItem) => `${item.vertical} para ${item.tenantName} · ${item.workspaceName}`;

export function describeApprovalQueue(items: VerticalApprovalAdminItem[]): VerticalApprovalChatPresentation {
  const awaiting = items.filter((item) => ["pendente", "em_analise", "aguardando_humano"].includes(item.status)).slice(0, MAX_ITEMS);
  if (awaiting.length === 0) {
    return { content: "Não há pedidos de liberação aguardando decisão.", quickReplies: [], approvalChat: { status: "empty" } };
  }
  const entries: QueueEntry[] = awaiting.map((item, index) => ({
    id: item.id,
    label: itemLabel(item),
    noteRequiredToApprove: item.recommendation === "nao_recomendado",
    index: index + 1,
    scoreLabel: item.score === null
      ? "sem score"
      : `score ${item.score} (${RECOMMENDATION_LABEL[item.recommendation ?? ""] ?? "sem recomendação"})`,
    misses: (item.scoreReasons ?? []).filter((reason) => reason.maxPoints > 0 && !reason.ok).map((reason) => reason.message),
  }));
  return {
    content: [
      `Pedidos aguardando decisão (${awaiting.length}). O score é do agente verificador; a decisão é sua.`,
      "",
      "Use os botões de cada pedido abaixo. Nada é decidido até você confirmar.",
    ].join("\n"),
    // Os botões ficam no cartão de cada pedido, dentro da conversa.
    quickReplies: [],
    approvalChat: { status: "queue", items: entries },
  };
}

function describeConfirmProposal(
  approvalId: string,
  decision: ApprovalChatDecision,
  label: string,
  note: string | null,
): VerticalApprovalChatPresentation {
  const confirmReply = confirmReplyFor(decision, label);
  return {
    content: [
      `${decision === "aprovar" ? "Aprovar" : "Recusar"} a liberação do ${label}?`,
      ...(note ? ["", `Observação: ${note}`] : []),
      "",
      `Nada muda até você confirmar. Use o botão abaixo ou responda "${confirmReply}".`,
    ].join("\n"),
    quickReplies: [],
    approvalChat: { status: "confirm", approvalId, decision, label, note },
  };
}

export function describeApprovalChoice(request: Extract<VerticalApprovalChatRequest, { step: "choose" }>): VerticalApprovalChatPresentation {
  if (request.noteRequired) {
    return {
      content: request.decision === "recusar"
        ? `Escreva a observação da recusa do ${request.label} (obrigatória).`
        : `O agente não recomenda a liberação do ${request.label}. Para aprovar mesmo assim, escreva a observação (obrigatória).`,
      quickReplies: [],
      approvalChat: { status: "note_needed", approvalId: request.approvalId, decision: request.decision, label: request.label },
    };
  }
  return describeConfirmProposal(request.approvalId, request.decision, request.label, null);
}

export function describeApprovalDecided(decision: ApprovalChatDecision, label: string): VerticalApprovalChatPresentation {
  return {
    content: `Decisão registrada: ${label} ${decision === "aprovar" ? "aprovado" : "recusado"}. O cliente recebe o aviso no app.`,
    quickReplies: [APPROVAL_QUEUE_REPLY],
    approvalChat: { status: "done" },
  };
}

export function describeApprovalChatFailure(error: unknown, stage: "list" | "decide"): VerticalApprovalChatPresentation {
  const body = error instanceof ApiError ? (error.body as { error?: { code?: string; message?: string } } | undefined) : undefined;
  if (error instanceof ApiError && error.status === 404) {
    // Para quem não é administrador a fila não existe; a conversa não revela nada além disso.
    return { content: "Não encontrei aprovações aguardando decisão para você.", quickReplies: [], approvalChat: { status: "empty" } };
  }
  return {
    content: stage === "decide"
      ? `Nada foi decidido. ${body?.error?.message ?? "Não consegui registrar a decisão agora."}`
      : "Não consegui carregar a fila de aprovações agora.",
    quickReplies: [APPROVAL_QUEUE_REPLY],
    approvalChat: { status: "failed" },
  };
}

export type ApprovalCardAction = { label: string; reply: string; tone: "approve" | "refuse" | "neutral" };
/** `title` vazio = linha só com botões (pergunta da conversa logo acima). */
export type ApprovalCardRow = { title?: string; detail?: string; misses?: string[]; actions: ApprovalCardAction[] };

/** O que o cartão da conversa mostra para o estado atual (ou nada). Os botões enviam o mesmo texto que o resolvedor entende. */
export function approvalCardRows(snapshot: VerticalApprovalChatSnapshot | null | undefined): ApprovalCardRow[] | null {
  if (!snapshot) return null;
  if (snapshot.status === "queue") {
    return snapshot.items.map((item, position) => {
      const index = item.index ?? position + 1;
      return {
        title: `Pedido ${index}: ${item.label}`,
        detail: item.scoreLabel,
        misses: item.misses ?? [],
        actions: [
          { label: "Aprovar", reply: choiceReply("aprovar", index, item.label), tone: "approve" },
          { label: "Recusar", reply: choiceReply("recusar", index, item.label), tone: "refuse" },
        ],
      };
    });
  }
  if (snapshot.status === "confirm") {
    return [
      {
        title: `${snapshot.decision === "aprovar" ? "Aprovar" : "Recusar"} a liberação do ${snapshot.label}`,
        detail: snapshot.note ? `Observação: ${snapshot.note}` : undefined,
        actions: [
          {
            label: snapshot.decision === "aprovar" ? APPROVAL_CONFIRM_APPROVE_REPLY : APPROVAL_CONFIRM_REFUSE_REPLY,
            reply: confirmReplyFor(snapshot.decision, snapshot.label),
            tone: snapshot.decision === "aprovar" ? "approve" : "refuse",
          },
          { label: "Cancelar", reply: APPROVAL_CANCEL_REPLY, tone: "neutral" },
        ],
      },
    ];
  }
  if (snapshot.status === "note_needed") {
    return [
      {
        title: "Escreva a observação na caixa de texto e envie.",
        actions: [{ label: "Cancelar", reply: APPROVAL_CANCEL_REPLY, tone: "neutral" }],
      },
    ];
  }
  return null;
}

type DecisionWithApprovalChat = {
  content?: string;
  resolvedQuickReplies?: string[];
  verticalApprovalChatRequest?: VerticalApprovalChatRequest;
  verticalApprovalChat?: VerticalApprovalChatSnapshot;
};

/** Etapa assíncrona do engine: lê a fila ou registra a decisão confirmada no servidor. */
export async function enrichLauncherDecisionWithVerticalApprovalChat<D extends DecisionWithApprovalChat>(
  decision: D | null,
  api: { list: typeof apiListVerticalApprovals; decide: typeof apiDecideVerticalApproval } = {
    list: apiListVerticalApprovals,
    decide: apiDecideVerticalApproval,
  },
): Promise<D | null> {
  const request = decision?.verticalApprovalChatRequest;
  if (!decision || !request) return decision;
  let presentation: VerticalApprovalChatPresentation;
  if (request.step === "cancel") {
    presentation = { content: "Decisão cancelada. Nada foi alterado.", quickReplies: [APPROVAL_QUEUE_REPLY], approvalChat: { status: "cancelled" } };
  } else if (request.step === "choose") {
    presentation = describeApprovalChoice(request);
  } else if (request.step === "note") {
    presentation = describeConfirmProposal(request.approvalId, request.decision, request.label, request.note);
  } else if (request.step === "list") {
    try {
      presentation = describeApprovalQueue((await api.list()).data.items);
    } catch (error) {
      presentation = describeApprovalChatFailure(error, "list");
    }
  } else {
    try {
      await api.decide(request.approvalId, { decision: request.decision, note: request.note ?? undefined, channel: "chat" });
      presentation = describeApprovalDecided(request.decision, request.label);
    } catch (error) {
      presentation = describeApprovalChatFailure(error, "decide");
    }
  }
  return {
    ...decision,
    content: presentation.content,
    resolvedQuickReplies: presentation.quickReplies,
    verticalApprovalChat: presentation.approvalChat,
  };
}

/** Congela o estado da decisão pela conversa no snapshot da mensagem. */
export function attachVerticalApprovalChatToSnapshot<
  S extends { verticalApprovalChat?: VerticalApprovalChatSnapshot | null; quickReplies?: string[] },
>(snapshot: S, decision: DecisionWithApprovalChat | null): S {
  if (!decision?.verticalApprovalChat) return snapshot;
  // Com o cartão de botões na mensagem, as sugestões genéricas da ajuda só atrapalham.
  const hasCard = approvalCardRows(decision.verticalApprovalChat) !== null;
  return { ...snapshot, verticalApprovalChat: decision.verticalApprovalChat, ...(hasCard ? { quickReplies: [] } : {}) };
}
