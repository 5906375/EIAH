import React from "react";
import { apiResolveImobTurn } from "@/lib/api";
import { getSession } from "@/state/sessionStore";
import { buildProposalFormContinuation, buildProposalTextContinuation, hasPendingProposalReview, isConversationalProposalForm } from "@/pages/app/imob/proposalForm";
import { useImobFormState, type ImobFormState } from "./useImobFormState";
import { createImobStructuredForms } from "./createImobStructuredForms";
import { makeStructuredId, type ImobStructuredFormsHost, type StructuredMessage } from "./types";

/**
 * Formulários do IMOB dentro da conversa do front door (`/app/chat`,
 * ADR-010 etapa D). Implementa `ImobStructuredFormsHost` sobre a lista de
 * mensagens do launcher: cada parte do IMOB vira uma mensagem da mesma
 * conversa (`imobStructured`). Pedidos de cadastro vão ao mesmo resolvedor de
 * turno do IMOB que serve o `/app/imob/chat`. Cadastros usam a API direta;
 * propostas continuam pelo draft estruturado já aceito pelo resolvedor.
 */

export const FRONT_DOOR_IMOB_THREAD = { id: "frontdoor-imob", label: "IMOB", status: "active" as const };

export type FrontDoorMessageLike = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  imobStructured?: StructuredMessage;
};

function toLauncherMessage<M extends FrontDoorMessageLike>(structured: StructuredMessage): M {
  return { id: structured.id, role: structured.role, content: structured.text, imobStructured: structured } as M;
}

/** Um formulário por vez: ao abrir outro, o anterior não salvo fecha (nada é gravado). */
function closeOpenForms<M extends FrontDoorMessageLike>(messages: M[]): M[] {
  return messages.map((message) =>
    message.imobStructured?.form
      ? {
          ...message,
          imobStructured: { ...message.imobStructured, form: undefined, text: `${message.imobStructured.text} (Formulário fechado sem salvar.)` },
        }
      : message,
  );
}

export function useImobFrontDoorForms<M extends FrontDoorMessageLike>(params: {
  messages: M[];
  setMessages: React.Dispatch<React.SetStateAction<M[]>>;
  getConversationGeneration: () => number;
  getConversationScopeKey?: () => string;
}) {
  const { messages, setMessages, getConversationGeneration } = params;
  const structuredMessages = React.useMemo(
    () => messages.flatMap((message) => (message.imobStructured ? [message.imobStructured] : [])),
    [messages],
  );
  const imobForms = useImobFormState(structuredMessages);
  const { prepareIncomingMessage } = imobForms;

  const appendStructured = React.useCallback(
    (incoming: StructuredMessage) => {
      const message = prepareIncomingMessage({ ...incoming, thread: incoming.thread ?? FRONT_DOOR_IMOB_THREAD });
      setMessages((prev) => [...(message.form ? closeOpenForms(prev) : prev), toLauncherMessage<M>(message)]);
    },
    [prepareIncomingMessage, setMessages],
  );

  const patchStructured = React.useCallback(
    (messageId: string, update: (message: StructuredMessage) => StructuredMessage) => {
      setMessages((prev) =>
        prev.map((message) => {
          if (message.id !== messageId || !message.imobStructured) return message;
          const next = update(message.imobStructured);
          return { ...message, content: next.text, imobStructured: next };
        }),
      );
    },
    [setMessages],
  );

  const allMessagesRef = React.useRef(messages);
  allMessagesRef.current = messages;
  const requestSequenceRef = React.useRef(0);
  const scopeKey = params.getConversationScopeKey?.() ?? "";
  const scopeKeyRef = React.useRef(scopeKey);
  scopeKeyRef.current = scopeKey;
  const generation = getConversationGeneration();
  const session = getSession();
  const questionScope = `${generation}:${session.tenantId}:${session.workspaceId}:${session.userId}:${session.token}:${session.activeDomain}:${scopeKey}`;
  const reviewOriginRef = React.useRef({ scope: questionScope, ref: `v1:${makeStructuredId("review")}` });
  if (reviewOriginRef.current.scope !== questionScope) {
    reviewOriginRef.current = { scope: questionScope, ref: `v1:${makeStructuredId("review")}` };
  }
  const previousScope = React.useRef(questionScope);
  const scopeChanged = previousScope.current !== questionScope;
  React.useEffect(() => {
    const changedScope = previousScope.current !== questionScope;
    previousScope.current = questionScope;
    if (changedScope) requestSequenceRef.current += 1;
    // History hydration can run after this effect. Recheck restored descriptors on message changes.
    setMessages((prev) => {
      let invalidated = false;
      const next = prev.map((message) => {
        const structured = message.imobStructured;
        const continuity = structured?.conversationState?.operational?.continuity;
        if (!continuity || (!changedScope && (!continuity.pending || continuity.pending.contextRef === reviewOriginRef.current.ref))) return message;
        invalidated = true;
        const text = continuity.pending
          ? "Esta revisão pertence a um contexto anterior. Reabra Gerar proposta na barra Negócios para revisar os dados. O rascunho foi preservado."
          : structured!.text;
        return { ...message, content: text, imobStructured: { ...structured!, text, conversationState: {
          ...structured!.conversationState!, operational: { ...structured!.conversationState!.operational!, continuity: null },
        } } };
      });
      return invalidated ? next : prev;
    });
  }, [questionScope, messages, setMessages]);
  const messagesRef = React.useRef(structuredMessages);
  messagesRef.current = structuredMessages;
  const { structuredForms, forwardToImob, consumeOperationalTurn, getConversationState } = createImobFrontDoorForms({
    imobForms,
    getMessages: () => messagesRef.current,
    getLatestAssistantMessageId: () => [...allMessagesRef.current].reverse().find((message) => message.role === "assistant")?.id ?? null,
    isReviewScopeCurrent: () => !scopeChanged,
    requestSequenceRef,
    getContinuityContextRef: () => reviewOriginRef.current.ref,
    getConversationScopeKey: () => scopeKeyRef.current,
    getConversationGeneration,
    appendStructured,
    patchStructured,
    echoUser: (text) => setMessages((prev) => [...prev, { id: makeStructuredId("user"), role: "user", content: text } as M]),
  });

  return { imobForms, structuredForms, forwardToImob, consumeOperationalTurn, getConversationState };
}

/** Adapter do host: reutiliza o dispatcher direto e o builder de proposta do chat dedicado. */
export function createImobFrontDoorForms(params: {
  imobForms: ImobFormState;
  getMessages: () => StructuredMessage[];
  getLatestAssistantMessageId?: () => string | null;
  getConversationScopeKey?: () => string;
  isReviewScopeCurrent?: () => boolean;
  getContinuityContextRef?: () => string;
  requestSequenceRef?: { current: number };
  appendStructured: (message: StructuredMessage) => void;
  patchStructured: (id: string, update: (message: StructuredMessage) => StructuredMessage) => void;
  echoUser: (text: string) => void;
  resolveTurn?: typeof apiResolveImobTurn;
  getConversationGeneration: () => number;
}) {
  const { imobForms, getMessages, appendStructured, patchStructured, echoUser } = params;
  const resolveTurn = params.resolveTurn ?? apiResolveImobTurn;
  const originRef = `v1:${makeStructuredId("review")}`;
  const getContinuityContextRef = params.getContinuityContextRef ?? (() => originRef);
  const initialContextRef = getContinuityContextRef();
  const requestSequence = params.requestSequenceRef ?? { current: 0 };
  const latestContext = () => [...getMessages()].reverse().find((message) => message.conversationState);
  const initialGeneration = params.getConversationGeneration();
  const initialScopeKey = params.getConversationScopeKey?.();
  const initialReviewSession = getSession();
  const latestAssistantId = () => params.getLatestAssistantMessageId?.()
    ?? [...getMessages()].reverse().find((message) => message.role === "assistant")?.id ?? null;
  const reviewIsCurrent = (context: StructuredMessage) => {
    const session = getSession();
    const pending = context.conversationState?.operational?.continuity?.pending;
    return hasPendingProposalReview(context.conversationState) && pending?.contextRef === getContinuityContextRef()
      && getContinuityContextRef() === initialContextRef && pending?.caseId === context.caseContext?.caseId
      && pending?.threadId === context.thread?.id && pending?.threadId === context.caseContext?.threadId
      && latestAssistantId() === context.id && params.isReviewScopeCurrent?.() !== false
      && params.getConversationGeneration() === initialGeneration && params.getConversationScopeKey?.() === initialScopeKey
      && session.token === initialReviewSession.token && session.tenantId === initialReviewSession.tenantId
      && session.userId === initialReviewSession.userId && session.workspaceId === initialReviewSession.workspaceId && session.activeDomain === initialReviewSession.activeDomain;
  };

  function closeProposalCollection(message: StructuredMessage, cancelled: boolean) {
    // Preserva os snapshots antigos; o último estado canônico encerra a coleta local.
    for (const item of getMessages()) {
      if (item.thread?.id !== message.thread?.id || !isConversationalProposalForm(item.form)) continue;
      patchStructured(item.id, (current) => ({ ...current, form: undefined }));
      imobForms.setFormErrorsByMessageId((prev) => ({ ...prev, [item.id]: {} }));
    }
    appendStructured({ id: makeStructuredId("assistant"), role: "assistant", thread: message.thread,
      text: cancelled ? "Formulário de proposta fechado. Nada foi gravado pelo formulário."
        : "Coleta de proposta encerrada para seguir com o novo assunto.",
      conversationState: message.conversationState ? { ...message.conversationState, operational: null } : undefined,
      caseContext: message.caseContext,
    });
  }

  async function consumeOperationalTurn(action: "continue" | "cancel" | "release", text: string) {
    const context = latestContext();
    if (!context) return;
    if (action !== "continue") {
      if (context.conversationState?.operational?.continuity) {
        appendStructured({ id: makeStructuredId("assistant"), role: "assistant", thread: context.thread,
          text: "Revisão da proposta pausada para seguir com o novo assunto. O rascunho foi preservado.",
          conversationState: { ...context.conversationState,
            operational: { ...context.conversationState.operational, continuity: null } }, caseContext: context.caseContext });
      } else closeProposalCollection(context, action === "cancel");
      return;
    }
    const pending = context.conversationState?.operational?.continuity?.pending;
    if (pending && !reviewIsCurrent(context)) return;
    // Reutiliza o lock do formulário: texto e botão não enviam o mesmo draft simultaneamente.
    if (imobForms.formSubmittingRef.current.has(context.id)) {
      // A duplicate reply must not replace the question while its first response is pending.
      if (pending) return;
      appendStructured({ id: makeStructuredId("assistant"), role: "assistant", thread: context.thread,
        text: "Estou atualizando a proposta. Aguarde a resposta antes de enviar o próximo campo." });
      return;
    }
    imobForms.formSubmittingRef.current.add(context.id);
    try { await forwardToImob(text, pending ? { continuityReplyRef: pending.ref } : undefined); }
    finally { imobForms.formSubmittingRef.current.delete(context.id); }
  }

  async function forwardToImob(text: string, options?: { displayText?: string; continuityReplyRef?: string }, continuation?: {
    message: StructuredMessage;
    request: Extract<ReturnType<typeof buildProposalFormContinuation>, { ok: true }>["request"];
  }): Promise<boolean> {
    if (options?.displayText) echoUser(options.displayText);
    const context = continuation?.message ?? latestContext();
    const generation = params.getConversationGeneration();
    const requestId = ++requestSequence.current;
    const initialSession = getSession();
    const requestContextRef = getContinuityContextRef();
    const initialScope = params.getConversationScopeKey?.();
    const requestAssistantId = latestAssistantId();
    const requestQuestionRef = options?.continuityReplyRef ?? context?.conversationState?.operational?.continuity?.pending?.ref;
    const isCurrentQuestion = () => !requestQuestionRef
      || (latestAssistantId() === requestAssistantId
        && latestContext()?.conversationState?.operational?.continuity?.pending?.ref === requestQuestionRef
        && Boolean(latestContext() && reviewIsCurrent(latestContext()!)));
    const isCurrentConversation = () => {
      const current = getSession();
      return requestContextRef === getContinuityContextRef() && requestId === requestSequence.current && generation === params.getConversationGeneration() && current.token === initialSession.token
        && current.userId === initialSession.userId && current.tenantId === initialSession.tenantId && current.workspaceId === initialSession.workspaceId
        && current.activeDomain === initialSession.activeDomain && params.getConversationScopeKey?.() === initialScope;
    };
    const thread = context?.thread ?? FRONT_DOOR_IMOB_THREAD;
    try {
      const response = await resolveTurn({
        message: continuation?.request.message ?? buildProposalTextContinuation(text, context?.conversationState, requestContextRef).message,
        continuityContextRef: requestContextRef,
        threadId: thread.id,
        threadLabel: thread.label,
        caseId: context?.caseContext?.caseId ?? null,
        threadState: continuation?.request.threadState ?? context?.conversationState ?? null,
        ...(options?.continuityReplyRef ? { continuityReplyRef: options.continuityReplyRef } : {}),
      });
      if (!response.ok) throw new Error("IMOB resolve-turn failed");
      const turn = response.data;
      const presentation = turn.presentation;
      // A thread sintética é apenas o bootstrap. O caseContext do servidor é autoritativo.
      const resolvedThread = { ...thread, id: turn.caseContext?.threadId || thread.id, label: turn.threadLabel || thread.label };
      const form = presentation.form;
      const supported = Boolean(form?.submitTarget) || isConversationalProposalForm(form);
      const unknownForm = Boolean(form && !supported);
      const accepted = turn.mode !== "blocked" && !unknownForm;
      // Na continuação da coleta, o formulário já apresenta os campos pendentes.
      // Usa seu rótulo/descrição como resposta, preservando o texto inicial no histórico.
      const proposalCollectionForm = accepted && isConversationalProposalForm(form)
        && context?.conversationState?.operational?.flow === "proposal.create"
        && context.conversationState.operational.status === "collecting"
        && turn.conversationState?.operational?.flow === "proposal.create"
        && turn.conversationState.operational.status === "collecting"
        && Boolean(form?.label?.trim() || form?.description?.trim());
      // Uma resposta tardia não reabre coleta cancelada nem uma nova conversa.
      if (!isCurrentConversation() || (context && latestContext()?.id !== context.id)
        || !isCurrentQuestion()) return false;
      // Fecha somente após resposta aceita, antes de abrir eventual formulário seguinte.
      if (accepted && context && (continuation || context.conversationState?.operational?.flow === "proposal.create")) {
        patchStructured(context.id, (message) => ({ ...message, form: undefined }));
      }
      appendStructured({
        id: makeStructuredId("assistant"), role: "assistant",
        text: unknownForm
          ? `${presentation.text}\nEste formulário ainda não pode ser enviado por esta conversa. Nenhum envio foi efetuado.`
          : proposalCollectionForm ? "" : presentation.text,
        form: supported && turn.mode !== "blocked" ? form : undefined,
        thread: resolvedThread,
        conversationState: turn.conversationState,
        caseContext: turn.caseContext ?? (resolvedThread.id === thread.id ? context?.caseContext : null),
        ...(presentation.card ? { card: { type: "action" as const, title: presentation.card.title, lines: presentation.card.lines,
          ctas: presentation.card.ctas?.filter((cta) => Boolean(cta.href)), thread: resolvedThread } } : {}),
      });
      return accepted;
    } catch {
      if (!isCurrentConversation() || (context && latestContext()?.id !== context.id)
        || !isCurrentQuestion()) return false;
      appendStructured({ id: makeStructuredId("assistant"), role: "assistant", thread,
        text: continuation || context?.conversationState?.operational?.flow === "proposal.create"
          ? "Não consegui continuar a proposta agora. O contexto foi preservado; tente novamente."
          : "Não consegui abrir o formulário do IMOB agora. Tente novamente pela barra do IMOB.",
        ...(options?.continuityReplyRef ? { conversationState: context?.conversationState, caseContext: context?.caseContext } : {}),
      });
      return false;
    }
  }

  const host: ImobStructuredFormsHost = {
    activeThreadId: latestContext()?.thread?.id ?? FRONT_DOOR_IMOB_THREAD.id,
    appendMessage: appendStructured,
    updateMessage: (messageId, patch) => patchStructured(messageId, (message) => ({ ...message, ...patch })),
    patchMessage: patchStructured,
    // A confirmação fica na conversa do front door (sessão do launcher); o cadastro já está gravado no IMOB.
    persistMessage: () => undefined,
    sendText: (text, options) => forwardToImob(text, options),
    onFormClosed: (message) => {
      const context = latestContext();
      if (!context?.conversationState || context.thread?.id !== message.thread?.id) return;
      // Mesmo ciclo do chat dedicado: cadastro concluído não continua em coleta no próximo turno.
      patchStructured(context.id, (current) => ({
        ...current,
        conversationState: current.conversationState ? { ...current.conversationState, operational: null } : undefined,
      }));
    },
  };
  const structuredForms = createImobStructuredForms(imobForms, host);
  return {
    forwardToImob,
    getConversationState: () => {
      const context = latestContext();
      const state = context?.conversationState;
      return state?.operational?.continuity && state.operational.continuity.pending !== null && context && !reviewIsCurrent(context)
        ? { ...state, operational: { ...state.operational, continuity: null } } : state ?? null;
    },
    consumeOperationalTurn,
    structuredForms: {
      ...structuredForms,
      async handleStructuredFormAction(incoming: StructuredMessage, actionId: "cancel" | "submit" | "archive"): Promise<boolean> {
        if (!isConversationalProposalForm(incoming.form)) return structuredForms.handleStructuredFormAction(incoming, actionId);
        // Ignora eventos de um formulário já fechado e duplo clique durante o envio.
        const message = getMessages().find((item) => item.id === incoming.id);
        if (!message?.form || imobForms.formSubmittingRef.current.has(message.id)) return true;
        if (actionId === "archive") return true;
        if (actionId === "cancel") {
          closeProposalCollection(message, true);
          return true;
        }
        const values = imobForms.resolveFormValuesForMessage(message);
        const built = buildProposalFormContinuation(message.form, values, message.conversationState);
        const errors: Record<string, string> = built.ok ? {} : built.errors;
        for (const field of message.form.fields) {
          if (field.required && !field.allowAttachment && !(values[field.name] ?? String(field.value ?? "")).trim()) {
            errors[field.name] = "Preencha este campo para continuar.";
          }
        }
        if (!message.thread) errors._form = "Reabra a proposta para continuar.";
        if (!built.ok || Object.keys(errors).length) {
          imobForms.setFormErrorsByMessageId((prev) => ({ ...prev, [message.id]: errors }));
          return true;
        }
        imobForms.formSubmittingRef.current.add(message.id);
        imobForms.setFormErrorsByMessageId((prev) => ({ ...prev, [message.id]: {} }));
        try {
          const accepted = await forwardToImob(built.request.message, undefined, { message, request: built.request });
          if (!accepted) imobForms.setFormErrorsByMessageId((prev) => ({ ...prev, [message.id]: { _form: "Não foi possível continuar. Confira a resposta do IMOB e tente novamente." } }));
        } finally {
          imobForms.formSubmittingRef.current.delete(message.id);
        }
        return true;
      },
    },
  };
}

export type ImobFrontDoorForms = ReturnType<typeof useImobFrontDoorForms>;
