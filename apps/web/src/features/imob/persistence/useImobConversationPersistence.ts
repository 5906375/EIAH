import React from "react";
import type { StructuredMessage } from "@/features/imob/structured/types";
import { buildFrontDoorPersistedMessage } from "./imobChatHistory";
import { createImobPersistenceCore, type ImobPersistenceApi, type ImobPersistenceCore, type RestoreOutcome } from "./imobConversationPersistence";

/**
 * FD-IMOB-PERSISTENCE-001 — o histórico persistido do IMOB dentro do launcher compartilhado. Mensagens do IMOB (pedido do usuário,
 * resposta, formulário/confirmação) são gravadas no chat IMOB existente; ao entrar no IMOB em outra sessão, a conversa mais recente
 * volta para a superfície conversacional. Não cria chat, launcher ou thread próprios.
 */

export type PersistedTag = { conversationId: string; messageId: string };
export type PersistableMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  imobStructured?: StructuredMessage;
  imobPersisted?: PersistedTag;
};

export type ResumedThread = { threadId: string; label: string; status: "active" | "waiting" | "done" | "blocked"; caseId: string | null };

export function useImobConversationPersistence<M extends PersistableMessage>(params: {
  /** tenant:workspace:usuário — a troca de escopo reinicia a persistência (nunca mistura históricos). */
  scopeKey: string;
  /** IMOB disponível para esta sessão (cliente só decide QUANDO tentar; a API autoriza). */
  active: boolean;
  messages: M[];
  setMessages: React.Dispatch<React.SetStateAction<M[]>>;
  api?: ImobPersistenceApi;
}) {
  const { scopeKey, active, setMessages } = params;
  const coreRef = React.useRef<ImobPersistenceCore | null>(null);
  if (!coreRef.current) coreRef.current = createImobPersistenceCore(params.api);
  const core = coreRef.current;
  const messagesRef = React.useRef(params.messages);
  messagesRef.current = params.messages;
  const scopeRef = React.useRef(scopeKey);
  const bootstrappedRef = React.useRef(false);
  const [conversationId, setConversationId] = React.useState<string | null>(null);
  const [resumed, setResumed] = React.useState<ResumedThread | null>(null);
  const resumedRef = React.useRef<ResumedThread | null>(null);
  resumedRef.current = resumed;

  if (scopeRef.current !== scopeKey) {
    scopeRef.current = scopeKey;
    core.reset();
    bootstrappedRef.current = false;
  }
  React.useEffect(() => {
    setConversationId(null);
    setResumed(null);
  }, [scopeKey]);

  const tag = React.useCallback((messageId: string, persisted: PersistedTag) => {
    setConversationId(persisted.conversationId);
    setMessages((prev) => prev.map((message) => (message.id === messageId && !message.imobPersisted ? { ...message, imobPersisted: persisted } : message)));
  }, [setMessages]);

  const persistUser = React.useCallback((key: string, text: string, messageId?: string) => {
    const body = buildFrontDoorPersistedMessage({ role: "user", text });
    if (!body) return;
    const resumedThread = resumedRef.current;
    void core.persist(key, { ...body, ...(resumedThread ? { threadId: resumedThread.threadId, threadLabel: resumedThread.label, threadStatus: resumedThread.status } : {}) })
      .then((result) => { if (result && messageId) tag(messageId, result); else if (result) setConversationId(result.conversationId); });
  }, [core, tag]);

  const persistAssistant = React.useCallback((message: StructuredMessage, meta?: { intent?: string; action?: string }) => {
    const base = buildFrontDoorPersistedMessage(message);
    if (!base) return;
    const body = { ...base, ...(meta?.intent ? { intent: meta.intent } : {}), ...(meta?.action ? { action: meta.action } : {}) };
    void core.persist(message.id, body).then((result) => { if (result) tag(message.id, result); });
  }, [core, tag]);

  // Restauração ao entrar no IMOB: uma vez por escopo; se a sessão já mostra conteúdo do IMOB (sessionStorage), ela prevalece.
  React.useEffect(() => {
    if (!active || bootstrappedRef.current) return;
    // Espera a hidratação da sessão do launcher (sessionStorage) terminar: o que a sessão já mostra prevalece sobre o servidor.
    const timer = setTimeout(() => {
      if (bootstrappedRef.current) return;
      bootstrappedRef.current = true;
      const current = messagesRef.current;
      const lastTagged = [...current].reverse().find((message) => message.imobPersisted)?.imobPersisted;
      if (lastTagged) {
        core.adopt(lastTagged.conversationId);
        setConversationId(lastTagged.conversationId);
        return;
      }
      if (current.some((message) => message.imobStructured)) return;
      const startedScope = scopeRef.current;
      void core.restore().then((outcome) => {
        if (!outcome || scopeRef.current !== startedScope) return;
        // O usuário já gravou algo (conversa nova) enquanto o histórico carregava: a escolha dele vence.
        if (core.getConversationId() !== outcome.conversationId) return;
        setConversationId(outcome.conversationId);
        setMessages((prev) => {
          const present = new Set(prev.map((message) => message.imobPersisted?.messageId ?? message.id));
          const restored = outcome.messages.filter((message) => !present.has(message.id)) as unknown as M[];
          return restored.length ? [...restored, ...prev] : prev;
        });
      }).catch(() => undefined);
    }, 50);
    return () => clearTimeout(timer);
  }, [active, core, setMessages]);

  const startNew = React.useCallback(() => {
    core.reset();
    bootstrappedRef.current = true; // "Nova conversa" é decisão explícita: não restaura de volta
    setConversationId(null);
    setResumed(null);
  }, [core]);

  const openConversation = React.useCallback(async (id: string): Promise<RestoreOutcome | null> => {
    const outcome = await core.restore({ conversationId: id, limit: 200, force: true });
    if (!outcome) return null;
    bootstrappedRef.current = true;
    setConversationId(outcome.conversationId);
    setResumed(null);
    setMessages(outcome.messages as unknown as M[]);
    core.uxEvent("conversation_selected");
    return outcome;
  }, [core, setMessages]);

  /** Caso vinculado a uma thread, segundo as mensagens restauradas (a thread só carrega o contexto; a API autoriza cada turno). */
  const caseIdForThread = React.useCallback((threadId: string): string | null => {
    for (let index = messagesRef.current.length - 1; index >= 0; index -= 1) {
      const structured = messagesRef.current[index]?.imobStructured;
      const caseContext = structured?.caseContext;
      if (caseContext?.caseId && (caseContext.threadId === threadId || structured?.thread?.id === threadId)) return caseContext.caseId;
    }
    return null;
  }, []);

  return { core, conversationId, resumed, resumeThread: setResumed, caseIdForThread, persistUser, persistAssistant, startNew, openConversation };
}

export type ImobConversationPersistence = ReturnType<typeof useImobConversationPersistence>;
