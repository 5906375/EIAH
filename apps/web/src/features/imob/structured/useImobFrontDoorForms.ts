import React from "react";
import { apiResolveImobTurn } from "@/lib/api";
import { getSession } from "@/state/sessionStore";
import { buildProposalFormContinuation, buildProposalTextContinuation, isConversationalProposalForm } from "@/pages/app/imob/proposalForm";
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

  const messagesRef = React.useRef(structuredMessages);
  messagesRef.current = structuredMessages;
  const { structuredForms, forwardToImob, consumeOperationalTurn, getConversationState } = createImobFrontDoorForms({
    imobForms,
    getMessages: () => messagesRef.current,
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
  appendStructured: (message: StructuredMessage) => void;
  patchStructured: (id: string, update: (message: StructuredMessage) => StructuredMessage) => void;
  echoUser: (text: string) => void;
  resolveTurn?: typeof apiResolveImobTurn;
  getConversationGeneration: () => number;
}) {
  const { imobForms, getMessages, appendStructured, patchStructured, echoUser } = params;
  const resolveTurn = params.resolveTurn ?? apiResolveImobTurn;
  const latestContext = () => [...getMessages()].reverse().find((message) => message.conversationState);

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
    if (action !== "continue") { closeProposalCollection(context, action === "cancel"); return; }
    // Reutiliza o lock do formulário: texto e botão não enviam o mesmo draft simultaneamente.
    if (imobForms.formSubmittingRef.current.has(context.id)) {
      appendStructured({ id: makeStructuredId("assistant"), role: "assistant", thread: context.thread,
        text: "Estou atualizando a proposta. Aguarde a resposta antes de enviar o próximo campo." });
      return;
    }
    imobForms.formSubmittingRef.current.add(context.id);
    try { await forwardToImob(text); }
    finally { imobForms.formSubmittingRef.current.delete(context.id); }
  }

  async function forwardToImob(text: string, options?: { displayText?: string }, continuation?: {
    message: StructuredMessage;
    request: Extract<ReturnType<typeof buildProposalFormContinuation>, { ok: true }>["request"];
  }): Promise<boolean> {
    if (options?.displayText) echoUser(options.displayText);
    const context = continuation?.message ?? latestContext();
    const generation = params.getConversationGeneration();
    const initialSession = getSession();
    const isCurrentConversation = () => {
      const current = getSession();
      return generation === params.getConversationGeneration() && current.token === initialSession.token
        && current.tenantId === initialSession.tenantId && current.workspaceId === initialSession.workspaceId;
    };
    const thread = context?.thread ?? FRONT_DOOR_IMOB_THREAD;
    try {
      const response = await resolveTurn({
        message: continuation?.request.message ?? buildProposalTextContinuation(text, context?.conversationState).message,
        threadId: thread.id,
        threadLabel: thread.label,
        caseId: context?.caseContext?.caseId ?? null,
        threadState: continuation?.request.threadState ?? context?.conversationState ?? null,
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
      if (!isCurrentConversation() || (context && latestContext()?.id !== context.id)) return false;
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
      if (!isCurrentConversation() || (context && latestContext()?.id !== context.id)) return false;
      appendStructured({ id: makeStructuredId("assistant"), role: "assistant", thread,
        text: continuation || context?.conversationState?.operational?.flow === "proposal.create"
          ? "Não consegui continuar a proposta agora. O contexto foi preservado; tente novamente."
          : "Não consegui abrir o formulário do IMOB agora. Tente novamente pela barra do IMOB.",
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
    getConversationState: () => latestContext()?.conversationState ?? null,
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
