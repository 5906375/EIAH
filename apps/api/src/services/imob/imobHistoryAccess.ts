import type { Response } from "express";
import type { PrismaClient } from "@repo/db";
import { readActiveMembershipStatus } from "../commercialAuthority";

/**
 * FD-IMOB-HISTORY-AUTHZ-001 — autorização do histórico persistido do chat IMOB (conversas, mensagens, threads, entrevista, snapshot,
 * export, telemetria por conversa). Fail-closed no backend, antes de devolver ou gravar qualquer coisa.
 *
 * Fontes autoritativas (todas já existentes; nada é criado nem promovido):
 *  1. tenant/workspace e `userId` do token autenticado (`authContext`);
 *  2. vínculo ATIVO do usuário no workspace, lido por `readActiveMembershipStatus` (SOMENTE LEITURA: sem DDL, sem bootstrap, sem
 *     promoção; ausência, status diferente de `active`, erro de consulta ⇒ nega);
 *  3. TITULARIDADE da conversa: a execução de auditoria `imob-chat-audit` da conversa é criada pelo servidor, no ato da criação, com o
 *     `userId` do criador (`runs.user_id`). Só o titular lê/grava a própria conversa.
 * Não são fontes: e-mail, papel declarado/perfil, `conversationId`/`threadId`/`caseId` recebidos, nem vínculo criado numa leitura.
 * Compartilhamento/atribuição de conversa: NÃO existe no modelo atual; portanto nada é compartilhado (bloqueio registrado no relatório).
 */
export const IMOB_CHAT_AUDIT_AGENT_ID = "imob-chat-audit";

export type ImobHistoryDenial =
  | { allowed: false; status: 403; code: "IMOB_HISTORY_IDENTITY_REQUIRED" | "IMOB_HISTORY_MEMBERSHIP_REQUIRED"; message: string }
  | { allowed: false; status: 404; code: "CONVERSATION_NOT_FOUND"; message: string };
export type ImobHistoryActor = { allowed: true; userId: string; tenantId: string; workspaceId: string };

export type ImobHistoryAccessDeps = {
  readMembership: (scope: { tenantId: string; workspaceId: string; userId: string }) => Promise<{ status: string | null } | null>;
  listOwnedConversationIds: (scope: { tenantId: string; workspaceId: string; userId: string }) => Promise<Set<string>>;
};

type RunClient = Pick<PrismaClient, "run">;

function conversationIdOf(request: unknown): string | null {
  if (!request || typeof request !== "object") return null;
  const metadata = (request as { metadata?: unknown }).metadata;
  if (!metadata || typeof metadata !== "object") return null;
  const value = (metadata as { conversationId?: unknown }).conversationId;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function createImobHistoryAccessDeps(prisma: unknown): ImobHistoryAccessDeps {
  const client = prisma as RunClient;
  return {
    readMembership: (scope) => readActiveMembershipStatus(prisma as never, scope),
    async listOwnedConversationIds(scope) {
      const rows = await client.run.findMany({
        where: { tenantId: scope.tenantId, workspaceId: scope.workspaceId, agent: IMOB_CHAT_AUDIT_AGENT_ID, userId: scope.userId },
        select: { request: true },
        orderBy: { createdAt: "desc" },
        take: 2000,
      });
      const ids = new Set<string>();
      for (const row of rows) {
        const id = conversationIdOf(row.request);
        if (id) ids.add(id);
      }
      return ids;
    },
  };
}

const DENIED_MEMBERSHIP = "Seu usuário não tem vínculo ativo neste workspace para acessar o histórico do IMOB.";
const DENIED_IDENTITY = "Histórico do IMOB exige um usuário identificado.";
const NOT_FOUND = "Conversation not found";

/** Identidade + vínculo ativo (leitura). Qualquer falha ⇒ negado. */
export async function authorizeImobHistoryActor(
  auth: { tenantId?: string | null; workspaceId?: string | null; userId?: string | null } | undefined,
  deps: ImobHistoryAccessDeps,
): Promise<ImobHistoryActor | ImobHistoryDenial> {
  const tenantId = auth?.tenantId?.trim();
  const workspaceId = auth?.workspaceId?.trim();
  const userId = auth?.userId?.trim();
  if (!tenantId || !workspaceId || !userId) return { allowed: false, status: 403, code: "IMOB_HISTORY_IDENTITY_REQUIRED", message: DENIED_IDENTITY };
  try {
    const membership = await deps.readMembership({ tenantId, workspaceId, userId });
    if (!membership || membership.status !== "active") return { allowed: false, status: 403, code: "IMOB_HISTORY_MEMBERSHIP_REQUIRED", message: DENIED_MEMBERSHIP };
  } catch {
    return { allowed: false, status: 403, code: "IMOB_HISTORY_MEMBERSHIP_REQUIRED", message: DENIED_MEMBERSHIP };
  }
  return { allowed: true, userId, tenantId, workspaceId };
}

/** Vínculo ativo + titularidade da conversa. Inexistente, de outro usuário, de outro workspace/tenant ou erro ⇒ 404 indistinguível. */
export async function authorizeImobConversation(
  auth: Parameters<typeof authorizeImobHistoryActor>[0],
  conversationId: string,
  deps: ImobHistoryAccessDeps,
): Promise<ImobHistoryActor | ImobHistoryDenial> {
  const actor = await authorizeImobHistoryActor(auth, deps);
  if (!actor.allowed) return actor;
  try {
    const owned = await deps.listOwnedConversationIds(actor);
    if (!owned.has(conversationId)) return { allowed: false, status: 404, code: "CONVERSATION_NOT_FOUND", message: NOT_FOUND };
  } catch {
    return { allowed: false, status: 404, code: "CONVERSATION_NOT_FOUND", message: NOT_FOUND };
  }
  return actor;
}

export function sendImobHistoryDenied(res: Response, denial: ImobHistoryDenial) {
  return res.status(denial.status).json({
    ok: false,
    error: {
      code: denial.code,
      ...(denial.status === 403 ? { reasonCode: "IMOB_PERMISSION_DENIED" } : {}),
      message: denial.message,
    },
  });
}
