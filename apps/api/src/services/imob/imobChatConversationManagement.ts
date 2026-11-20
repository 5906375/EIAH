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

// Durable admission uses the same transaction/advisory-lock pattern as conversation management.
// Lock by authenticated actor, not formId: changing a client ID cannot renew an open capture.
export const PROPERTY_CAPTURE_SESSION = "property.capture.session.v1";
export type PropertyCaptureScope = { tenantId: string; workspaceId: string; userId?: string | null };
export async function withPropertyCaptureLock<T>(client: PrismaClient, scope: PropertyCaptureScope,
  work: (tx: import("@repo/db").Prisma.TransactionClient) => Promise<T>): Promise<T> {
  if (!scope.tenantId || !scope.workspaceId || !scope.userId) throw new Error("property_capture_scope_missing");
  return client.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`property-capture:${scope.tenantId}:${scope.workspaceId}:${scope.userId}`}, 0))`;
    return work(tx);
  });
}
export function propertyCaptureSessionWhere(scope: PropertyCaptureScope) {
  return { tenantId: scope.tenantId, workspaceId: scope.workspaceId, agentId: AGENT, key: PROPERTY_CAPTURE_SESSION,
    metadata: { path: ["actorUserId"], equals: scope.userId! } };
}

/**
 * The actor's open guided capture, if any. Server-side exclusion of legacy semantic/units dispatch uses it, and it names the exact session
 * that an explicit recovery (`cancel`/`pause` with this `sessionRef`) may close. It never selects a target on the caller's behalf.
 */
export async function openPropertyCapture(client: PrismaClient, scope: PropertyCaptureScope, includePaused = false) {
  if (!scope.userId) return null;
  const events = await client.memoryEvent.findMany({ where: propertyCaptureSessionWhere(scope), orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, metadata: true } });
  for (const { id, metadata } of events) {
    const status = (metadata as { status?: unknown } | null)?.status;
    if (status === "active" || includePaused && status === "paused") return { sessionRef: id, status };
  }
  return null;
}
/** The actor's open capture, as named to the client by the 409 conflict contract (`details`). Server-issued reference, authenticated scope only. */
export type OpenPropertyCapture = { sessionRef: string; status: "active" | "paused" };
/** Raised by the guided engine when an open capture of ANOTHER origin exists: same contract as the route guard (one 409 shape, one recovery path). */
export class PropertyCaptureActiveError extends Error {
  constructor(readonly open: OpenPropertyCapture) { super("IMOB_PROPERTY_CAPTURE_ACTIVE"); }
}
export const propertyCaptureActiveBody = (open: { sessionRef: string; status: unknown }) => ({ ok: false as const, error: { code: "IMOB_PROPERTY_CAPTURE_ACTIVE",
  message: "Continue no cadastro guiado, revise, pause ou cancele antes de mudar de assunto.", details: { sessionRef: open.sessionRef, status: open.status } } });
export async function hasActivePropertyCapture(client: PrismaClient, scope: PropertyCaptureScope, includePaused = false) {
  return Boolean(await openPropertyCapture(client, scope, includePaused));
}
