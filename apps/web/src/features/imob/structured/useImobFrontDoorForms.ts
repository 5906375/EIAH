import React from "react";
import { apiResolveImobTurn } from "@/lib/api";
import { useImobFormState } from "./useImobFormState";
import { createImobStructuredForms } from "./createImobStructuredForms";
import { makeStructuredId, type ImobStructuredFormsHost, type StructuredMessage } from "./types";

/**
 * Formulários do IMOB dentro da conversa do front door (`/app/chat`,
 * ADR-010 etapa D). Implementa `ImobStructuredFormsHost` sobre a lista de
 * mensagens do launcher: cada parte do IMOB vira uma mensagem da mesma
 * conversa (`imobStructured`). Pedidos de cadastro vão ao mesmo resolvedor de
 * turno do IMOB que serve o `/app/imob/chat`; os envios dos formulários vão
 * direto para a API do IMOB, sem run e sem virar texto de conversa.
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
}) {
  const { messages, setMessages } = params;
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

  /** Pedido de texto ao IMOB (itens de menu de cadastro e o pedido original após o handoff). */
  const forwardToImob = React.useCallback(
    async (text: string, options?: { displayText?: string }) => {
      if (options?.displayText) {
        setMessages((prev) => [...prev, { id: makeStructuredId("user"), role: "user", content: options.displayText } as M]);
      }
      try {
        const response = await apiResolveImobTurn({ message: text, threadId: FRONT_DOOR_IMOB_THREAD.id, threadLabel: FRONT_DOOR_IMOB_THREAD.label });
        const presentation = response.data.presentation;
        if (presentation.form?.submitTarget) {
          appendStructured({ id: makeStructuredId("assistant"), role: "assistant", text: presentation.text, form: presentation.form });
          return;
        }
        appendStructured({
          id: makeStructuredId("assistant"),
          role: "assistant",
          text: "Para este pedido, use a barra do IMOB aqui embaixo (Proprietários, Imóveis, Locações, Negócios).",
        });
      } catch {
        appendStructured({
          id: makeStructuredId("assistant"),
          role: "assistant",
          text: "Não consegui abrir o formulário do IMOB agora. Nada foi gravado; tente pela barra do IMOB.",
        });
      }
    },
    [appendStructured, setMessages],
  );

  const host: ImobStructuredFormsHost = {
    activeThreadId: FRONT_DOOR_IMOB_THREAD.id,
    appendMessage: appendStructured,
    updateMessage: (messageId, patch) => patchStructured(messageId, (message) => ({ ...message, ...patch })),
    patchMessage: patchStructured,
    // A confirmação fica na conversa do front door (sessão do launcher); o cadastro já está gravado no IMOB.
    persistMessage: () => undefined,
    sendText: (text, options) => forwardToImob(text, options),
  };
  const structuredForms = createImobStructuredForms(imobForms, host);

  return { imobForms, structuredForms, forwardToImob };
}

export type ImobFrontDoorForms = ReturnType<typeof useImobFrontDoorForms>;
