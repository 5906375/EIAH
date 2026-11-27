import type { PrismaClient } from "@repo/db";

export const CONVERSATION_RENAMED = "conversation.renamed";
export const CONVERSATION_DELETED = "conversation.deleted";
const AGENT = "imob-chat";
type Scope = { tenantId: string; workspaceId: string; userId: string };
type ReadClient = Pick<PrismaClient, "memoryEvent">;

export function conversationTitle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const title = value.trim();
  return title && title.length <= 120 && !/[\u0000-\u001f\u007f]/.test(title) ? title : null;
}

export function conversationSearchText(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR");
}

export async function isConversationDeleted(client: ReadClient, scope: Pick<Scope, "tenantId" | "workspaceId">, conversationId: string) {
  return !!await client.memoryEvent.findFirst({
    where: { tenantId: scope.tenantId, workspaceId: scope.workspaceId, agentId: AGENT, key: CONVERSATION_DELETED, metadata: { path: ["conversationId"], equals: conversationId } },
    select: { id: true },
  });
}

/** Owner authorization is required by the HTTP gate before this append-only operation. */
export async function changeConversation(client: PrismaClient, scope: Scope, conversationId: string, action: "rename" | "delete", title?: string) {
  return client.$transaction(async (tx) => {
    // Serialize rename/delete for this tenant/workspace/conversation. A tombstone always wins.
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`${scope.tenantId}:${scope.workspaceId}:${conversationId}`}, 0))`;
    if (await isConversationDeleted(tx, { tenantId: scope.tenantId, workspaceId: scope.workspaceId }, conversationId)) return false;
    await tx.memoryEvent.create({ data: {
      tenantId: scope.tenantId, workspaceId: scope.workspaceId, agentId: AGENT, runId: null,
      key: action === "rename" ? CONVERSATION_RENAMED : CONVERSATION_DELETED,
      content: action === "rename" ? title! : "Conversa removida do histórico pelo titular",
      metadata: { conversationId, actorUserId: scope.userId, ...(action === "rename" ? { title } : {}) },
    } });
    return true;
  });
}

/** Fold append-only management events over the authorized conversation list. */
export async function applyConversationChanges<T extends { conversationId: string; title: string }>(client: ReadClient, scope: Pick<Scope, "tenantId" | "workspaceId">, items: T[]): Promise<T[]> {
  if (!items.length) return items;
  const events = await client.memoryEvent.findMany({
    where: { tenantId: scope.tenantId, workspaceId: scope.workspaceId, agentId: AGENT, key: { in: [CONVERSATION_RENAMED, CONVERSATION_DELETED] },
      OR: items.map(({ conversationId }) => ({ metadata: { path: ["conversationId"], equals: conversationId } })) },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { key: true, metadata: true },
  });
  const deleted = new Set<string>(), titles = new Map<string, string>();
  for (const event of events) {
    const meta = event.metadata as { conversationId?: unknown; title?: unknown } | null;
    if (typeof meta?.conversationId !== "string") continue;
    if (event.key === CONVERSATION_DELETED) deleted.add(meta.conversationId);
    else if (typeof meta.title === "string") titles.set(meta.conversationId, meta.title);
  }
  return items.filter((item) => !deleted.has(item.conversationId)).map((item) => ({ ...item, title: titles.get(item.conversationId) ?? item.title }));
}
