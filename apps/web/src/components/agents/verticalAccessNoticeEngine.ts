import {
  apiListVerticalAccessNotices,
  apiMarkVerticalAccessNoticeRead,
  type VerticalAccessNotice,
} from "@/lib/api";

/**
 * ADR-011 §2.4: avisos da liberação EIAH entregues dentro da conversa do front door (`/app/chat`).
 * Cada aviso não lido chega como mensagem do assistente, uma única vez por conversa, com
 * "Entendi" para marcar como lido (só para quem clicou). O aviso diz só o estado da liberação:
 * nunca score, sinais de billing ou a observação do administrador. O launcher só renderiza.
 */

export type VerticalAccessNoticeSnapshot = {
  noticeIds: string[];
  status: "pending" | "acknowledged";
};

const formatWhen = (value: string) =>
  new Date(value).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** O botão leva a data do aviso: o launcher esconde respostas já usadas e cada aviso tem o seu. */
export const noticeAckReply = (latest: string) => `Entendi o aviso de ${formatWhen(latest)}`;

const ACK_PATTERN = /^entendi o aviso de \d{2}\/\d{2},? \d{2}:\d{2}$/;

const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();

/** Ids de avisos já mostrados nesta conversa (para não repetir a mensagem). */
export function noticeIdsShownInConversation(
  snapshots: Array<{ verticalAccessNotice?: VerticalAccessNoticeSnapshot | null } | null | undefined>,
) {
  const ids = new Set<string>();
  for (const snapshot of snapshots) for (const id of snapshot?.verticalAccessNotice?.noticeIds ?? []) ids.add(id);
  return ids;
}

export type VerticalAccessNoticePresentation = {
  content: string;
  quickReplies: string[];
  notice: VerticalAccessNoticeSnapshot;
};

/** Mensagem com os avisos ainda não mostrados nesta conversa, ou nada. */
export function describeUnshownNotices(
  notices: VerticalAccessNotice[],
  shownIds: Set<string>,
): VerticalAccessNoticePresentation | null {
  const pending = notices.filter((notice) => !shownIds.has(notice.id));
  if (pending.length === 0) return null;
  const ordered = [...pending].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const lines = ordered.map((notice) => `${notice.message} (${formatWhen(notice.createdAt)})`);
  return {
    content: [ordered.length === 1 ? "**Aviso da EIAH**" : `**Avisos da EIAH (${ordered.length})**`, "", ...lines.flatMap((line) => [line, ""])]
      .join("\n")
      .trim(),
    quickReplies: [noticeAckReply(ordered[ordered.length - 1]!.createdAt)],
    notice: { noticeIds: ordered.map((notice) => notice.id), status: "pending" },
  };
}

/** Lê os avisos não lidos; falha de leitura não atrapalha a conversa. */
export async function fetchVerticalAccessNotices(api: typeof apiListVerticalAccessNotices = apiListVerticalAccessNotices) {
  try {
    return (await api()).data.notices;
  } catch {
    return [];
  }
}

export type VerticalAccessNoticeAckRequest = { noticeIds: string[] | "all_shown" };

/**
 * "Entendi" logo depois do aviso marca aqueles avisos como lidos. Se a pessoa clicar num "Entendi"
 * antigo, marca como lidos os avisos não lidos que já apareceram até aquele momento.
 */
export function resolveNoticeAckStep(
  input: string,
  pending: VerticalAccessNoticeSnapshot | null | undefined,
): VerticalAccessNoticeAckRequest | null {
  if (!ACK_PATTERN.test(normalize(input))) return null;
  if (pending?.status === "pending" && pending.noticeIds.length > 0) return { noticeIds: pending.noticeIds };
  return { noticeIds: "all_shown" };
}

type DecisionWithNoticeAck = {
  content?: string;
  resolvedQuickReplies?: string[];
  verticalAccessNoticeAck?: VerticalAccessNoticeAckRequest;
  verticalAccessNotice?: VerticalAccessNoticeSnapshot;
};

export async function enrichLauncherDecisionWithNoticeAck<D extends DecisionWithNoticeAck>(
  decision: D | null,
  api: { list: typeof apiListVerticalAccessNotices; markRead: typeof apiMarkVerticalAccessNoticeRead } = {
    list: apiListVerticalAccessNotices,
    markRead: apiMarkVerticalAccessNoticeRead,
  },
): Promise<D | null> {
  const request = decision?.verticalAccessNoticeAck;
  if (!decision || !request) return decision;
  const ids = request.noticeIds === "all_shown" ? (await fetchVerticalAccessNotices(api.list)).map((notice) => notice.id) : request.noticeIds;
  const results = await Promise.allSettled(ids.map((id) => api.markRead(id)));
  const failed = results.some((result) => result.status === "rejected");
  return {
    ...decision,
    content: failed
      ? "Não consegui marcar o aviso como lido agora. Ele volta a aparecer na próxima vez que você abrir a conversa."
      : ids.length > 1
        ? "Pronto, avisos marcados como lidos."
        : "Pronto, aviso marcado como lido.",
    resolvedQuickReplies: [],
    verticalAccessNotice: { noticeIds: ids, status: "acknowledged" },
  };
}

/** Congela o aviso no snapshot da mensagem. */
export function attachVerticalAccessNoticeToSnapshot<S extends { verticalAccessNotice?: VerticalAccessNoticeSnapshot | null }>(
  snapshot: S,
  notice: VerticalAccessNoticeSnapshot | null | undefined,
): S {
  return notice ? { ...snapshot, verticalAccessNotice: notice } : snapshot;
}
