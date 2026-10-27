import {
  apiCreateImobChatConversation,
  apiCreateImobChatMessage,
  apiCreateImobChatTelemetry,
  apiGetImobChatInterviewState,
  apiListImobChatConversations,
  apiListImobChatMessages,
  apiListImobChatThreads,
  type ImobChatConversation,
  type ImobChatMessage,
  type ImobChatThread,
  type ImobContractInterviewState,
} from "@/lib/api";
import { FRONT_DOOR_SURFACE_ROUTE, restoreFrontDoorMessages, type RestoredFrontDoorMessage } from "./imobChatHistory";

/**
 * FD-IMOB-PERSISTENCE-001 — núcleo (sem React) da persistência do IMOB no Front Door. Usa SOMENTE os endpoints existentes do chat IMOB
 * (`/imob/chat/conversations*`, `/imob/chat/telemetry`); o servidor continua autorizando por tenant/workspace. Ter um `conversationId`,
 * `threadId` ou `caseId` não é autorização: toda leitura/gravação é revalidada pela API. Nenhuma leitura cria vínculo (só GET).
 * Falha de persistência nunca bloqueia o fluxo operacional (mesma regra F1 do chat legado) e é registrada na telemetria existente.
 */

export type ImobPersistenceApi = {
  listConversations: typeof apiListImobChatConversations;
  createConversation: typeof apiCreateImobChatConversation;
  listMessages: typeof apiListImobChatMessages;
  createMessage: typeof apiCreateImobChatMessage;
  listThreads: typeof apiListImobChatThreads;
  getInterviewState: typeof apiGetImobChatInterviewState;
  telemetry: typeof apiCreateImobChatTelemetry;
};

export const defaultImobPersistenceApi: ImobPersistenceApi = {
  listConversations: apiListImobChatConversations,
  createConversation: apiCreateImobChatConversation,
  listMessages: apiListImobChatMessages,
  createMessage: apiCreateImobChatMessage,
  listThreads: apiListImobChatThreads,
  getInterviewState: apiGetImobChatInterviewState,
  telemetry: apiCreateImobChatTelemetry,
};

/** Mesmo critério do chat legado: título curto a partir da primeira mensagem; muito curta cai no padrão do servidor. */
export function titleFromFirstMessage(text: string) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length < 4) return undefined;
  return cleaned.length > 72 ? `${cleaned.slice(0, 72)}...` : cleaned;
}

export type PersistBody = Parameters<typeof apiCreateImobChatMessage>[1];
export type PersistResult = { conversationId: string; messageId: string } | null;

export const HISTORY_RESTORE_LIMIT = 30;

export type RestoreOutcome = {
  conversationId: string;
  messages: RestoredFrontDoorMessage[];
  hasMore: boolean;
};

export function createImobPersistenceCore(api: ImobPersistenceApi = defaultImobPersistenceApi) {
  let conversationId: string | null = null;
  let chain: Promise<unknown> = Promise.resolve();
  const inFlight = new Map<string, Promise<PersistResult>>();
  let epoch = 0;

  const report = (id: string, value: 0 | 1, role: string) => {
    void api.telemetry({ conversationId: id, event: "message_persist_success_rate", value, metadata: { role, surfaceRoute: FRONT_DOOR_SURFACE_ROUTE } }).catch(() => undefined);
  };

  return {
    getConversationId: () => conversationId,
    /** Reinício explícito ("Nova conversa" ou troca de contexto): a próxima gravação abre outra conversa; nada é apagado no servidor. */
    reset() {
      epoch += 1;
      conversationId = null;
      inFlight.clear();
      chain = Promise.resolve();
    },
    adopt(id: string | null) { conversationId = id; },
    /**
     * Grava uma mensagem, em ordem e no máximo uma vez por `key` (id da mensagem do launcher). A conversa é criada sob demanda, uma só vez,
     * mesmo com gravações simultâneas. Retorna `null` quando a API recusa (o fluxo segue).
     */
    persist(key: string, body: PersistBody): Promise<PersistResult> {
      const existing = inFlight.get(key);
      if (existing) return existing;
      const myEpoch = epoch;
      const task = chain.then(async (): Promise<PersistResult> => {
        if (myEpoch !== epoch) return null;
        let target = conversationId;
        try {
          if (!target) {
            const created = await api.createConversation({ ...(titleFromFirstMessage(body.content) ? { title: titleFromFirstMessage(body.content) } : {}), metadata: { surface: "front_door" } });
            if (myEpoch !== epoch) return null;
            target = created.conversation.conversationId;
            conversationId = target;
          }
          const saved = await api.createMessage(target, body);
          report(target, 1, body.role);
          return { conversationId: target, messageId: saved.message.id };
        } catch {
          if (target) report(target, 0, body.role);
          return null;
        }
      });
      chain = task.catch(() => undefined);
      inFlight.set(key, task);
      return task;
    },
    async listConversations(limit = 20): Promise<ImobChatConversation[]> {
      const list = await api.listConversations({ limit });
      return list.items.filter((item) => item.lastMessageAt || item.lastMessagePreview);
    },
    /** Carrega a conversa pedida, ou a mais recente com histórico (mesma escolha do bootstrap do chat legado). */
    async restore(options?: { conversationId?: string | null; limit?: number; force?: boolean }): Promise<RestoreOutcome | null> {
      const limit = options?.limit ?? HISTORY_RESTORE_LIMIT;
      const withHistory = await this.listConversations();
      const target = (options?.conversationId && withHistory.find((item) => item.conversationId === options.conversationId)?.conversationId)
        ?? withHistory[0]?.conversationId ?? null;
      if (!target) return null;
      const history = await api.listMessages(target, { limit });
      // Restauração automática nunca atropela uma conversa que o usuário já abriu/gravou enquanto o histórico carregava.
      if (options?.force || !conversationId) conversationId = target;
      return { conversationId: target, messages: restoreFrontDoorMessages(target, history.items as ImobChatMessage[]), hasMore: history.items.length >= limit };
    },
    async listThreads(id: string): Promise<ImobChatThread[]> {
      return (await api.listThreads(id)).items;
    },
    async getInterviewState(id: string): Promise<ImobContractInterviewState | null> {
      return (await api.getInterviewState(id)).state;
    },
    uxEvent(action: string) {
      const id = conversationId;
      if (!id) return;
      void api.telemetry({ conversationId: id, event: "ux_interaction", value: 1, metadata: { action, surfaceRoute: FRONT_DOOR_SURFACE_ROUTE } }).catch(() => undefined);
    },
  };
}

export type ImobPersistenceCore = ReturnType<typeof createImobPersistenceCore>;
