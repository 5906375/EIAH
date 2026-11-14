import React from "react";
import { apiClaimImobTurn, apiResolveImobTurn, type ImobPresentationWidget } from "@/lib/api";
import { getSession } from "@/state/sessionStore";
import { trackAsyncMethods, type PendingTrack } from "@/lib/frontDoorPendingWork";
import { buildProposalFormContinuation, buildProposalTextContinuation, hasPendingProposalReview, isConversationalProposalForm } from "@/pages/app/imob/proposalForm";
import { useImobFormState, type ImobFormState } from "./useImobFormState";
import { createImobStructuredForms } from "./createImobStructuredForms";
import { makeStructuredId, type ImobStructuredFormsHost, type StructuredMessage } from "./types";
import type { ImobConversationPersistence, PersistedTag, ResumedThread } from "../persistence/useImobConversationPersistence";
import { IMOB_PROPERTY_CAPTURE_FIELDS, IMOB_PROPERTY_CAPTURE_POLICY as propertyPolicy, imobPropertyCaptureResultSchema } from "@eiah/contracts";
import { isPropertyCreateForm, buildPropertyCreateRequest } from "@/pages/app/imob/propertyCreateForm";
import type { MessagePresentationSnapshot } from "@/components/agents/chatPresentationSnapshot";

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
  /** Gravado no histórico persistido do IMOB (FD-IMOB-PERSISTENCE-001); evita gravar de novo ao restaurar. */
  imobPersisted?: PersistedTag;
};

export function toLauncherMessage<M extends FrontDoorMessageLike>(structured: StructuredMessage): M {
  const capture = structured.propertyCaptureContext ?? (isPropertyCreateForm(structured.form) ? "active" : null);
  const presentationSnapshot: MessagePresentationSnapshot | undefined = capture ? {
    snapshotVersion: "v1", verticalContext: capture === "active" ? "IMOB" : null, routeIntent: capture === "active" ? "imob" : "help",
    showConfidence: false, provenanceMode: "none", signals: [], renderVariant: "guided_flow", quickReplySource: "agent_contract",
    quickReplies: capture === "active" ? [propertyPolicy.questionReply, propertyPolicy.pauseReply] : [propertyPolicy.resumeReply],
    inputPlaceholder: capture === "active" ? propertyPolicy.placeholder : propertyPolicy.pausedPlaceholder,
  } : undefined;
  return { id: structured.id, role: structured.role, content: structured.text, imobStructured: structured,
    ...(presentationSnapshot ? { presentationSnapshot } : {}) } as M;
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
  /** Histórico persistido do IMOB (opcional): sem ele o comportamento é o anterior (sessão do launcher). */
  persistence?: Pick<ImobConversationPersistence, "persistUser" | "persistAssistant" | "resumed">;
  /** Trabalho pendente compartilhado do front door: cada solicitação assíncrona do adaptador (turno, reivindicação, formulário) é registrada nele. */
  trackPending?: PendingTrack;
}) {
  const { messages, setMessages, getConversationGeneration } = params;
  const persistenceRef = React.useRef(params.persistence);
  persistenceRef.current = params.persistence;
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
  const { structuredForms, forwardToImob, consumeOperationalTurn, getConversationState, getPropertyCaptureContext } = createImobFrontDoorForms({
    imobForms,
    getMessages: () => messagesRef.current,
    getPropertyHistory: (formId) => {
      const all = allMessagesRef.current;
      const start = all.findIndex((item) => item.id === formId);
      return all.slice(Math.max(0, start - 1)).filter((item) => item.role === "user" || item.role === "assistant")
        .slice(-6).map((item) => ({ role: item.role as "user" | "assistant", text: item.content.slice(0, 2000) }));
    },
    getLatestAssistantMessageId: () => [...allMessagesRef.current].reverse().find((message) => message.role === "assistant")?.id ?? null,
    isReviewScopeCurrent: () => !scopeChanged,
    requestSequenceRef,
    getContinuityContextRef: () => reviewOriginRef.current.ref,
    getConversationScopeKey: () => scopeKeyRef.current,
    getConversationGeneration,
    appendStructured,
    patchStructured,
    echoUser: (text) => setMessages((prev) => [...prev, { id: makeStructuredId("user"), role: "user", content: text } as M]),
    persistUser: (key, text) => persistenceRef.current?.persistUser(key, text),
    persistAssistant: (message, meta) => persistenceRef.current?.persistAssistant(message, meta),
    getResumedThread: () => persistenceRef.current?.resumed ?? null,
    trackPending: params.trackPending,
  });

  return { imobForms, structuredForms, forwardToImob, consumeOperationalTurn, getConversationState, getPropertyCaptureContext };
}

/** Adapter do host: reutiliza o dispatcher direto e o builder de proposta do chat dedicado. */
export function createImobFrontDoorForms(params: {
  imobForms: ImobFormState;
  getMessages: () => StructuredMessage[];
  getPropertyHistory?: (formId: string) => Array<{ role: "user" | "assistant"; text: string }>;
  propertyIntakeTimeoutMs?: number;
  getLatestAssistantMessageId?: () => string | null;
  getConversationScopeKey?: () => string;
  isReviewScopeCurrent?: () => boolean;
  getContinuityContextRef?: () => string;
  requestSequenceRef?: { current: number };
  appendStructured: (message: StructuredMessage) => void;
  patchStructured: (id: string, update: (message: StructuredMessage) => StructuredMessage) => void;
  echoUser: (text: string) => void;
  resolveTurn?: typeof apiResolveImobTurn;
  claimTurn?: typeof apiClaimImobTurn;
  getConversationGeneration: () => number;
  /** Grava o texto do usuário no histórico persistido (uma vez por pedido). */
  persistUser?: (key: string, text: string) => void;
  /** Grava no histórico persistido a resposta do IMOB / a confirmação (mesma regra do chat legado). */
  persistAssistant?: (message: StructuredMessage, meta?: { intent?: string; action?: string }) => void;
  /** Thread do histórico retomada pelo usuário (cartão "Histórico IMOB"): serve de contexto quando não há contexto vivo. */
  getResumedThread?: () => ResumedThread | null;
  /** Trabalho pendente compartilhado do front door: toda solicitação assíncrona do adaptador é registrada nele (sem ele, nada muda). */
  trackPending?: PendingTrack;
}) {
  const { imobForms, getMessages, appendStructured, patchStructured, echoUser } = params;
  const track: PendingTrack = params.trackPending ?? ((work) => work());
  const resolveTurn = params.resolveTurn ?? apiResolveImobTurn;
  const originRef = `v1:${makeStructuredId("review")}`;
  const getContinuityContextRef = params.getContinuityContextRef ?? (() => originRef);
  const initialContextRef = getContinuityContextRef();
  const requestSequence = params.requestSequenceRef ?? { current: 0 };
  const latestContext = () => [...getMessages()].reverse().find((message) => message.conversationState);
  const pendingProperty = () => [...getMessages()].reverse().find((message) => isPropertyCreateForm(message.form));
  const getPropertyCaptureContext = () => {
    const form = pendingProperty();
    return form ? form.propertyCaptureContext ?? "active" as const : null;
  };
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

  /** O Front Door não executa nada de recomendação: ações de recomendação do resumo ficam no chat do caso. */
  const frontDoorWidget = (widget: ImobPresentationWidget): ImobPresentationWidget =>
    "recommendedActions" in widget ? { ...widget, recommendedActions: [] } : widget;

  async function consumeOperationalTurn(action: "continue" | "cancel" | "release" | "claim", text: string): Promise<boolean | void> {
    const propertyForm = pendingProperty();
    if (propertyForm && action === "continue" && (getPropertyCaptureContext() === "active" || text === propertyPolicy.resumeReply)) {
      await track(() => continuePropertyCapture(propertyForm, text));
      return true;
    }
    // P11: reivindicação somente leitura do turno pela vertical; sem contexto prévio também vale (a governança é do servidor).
    if (action === "claim") return forwardToImob(text, { claim: true });
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

  async function continuePropertyCapture(form: StructuredMessage, text: string) {
    const session = getSession();
    const generation = params.getConversationGeneration();
    const scope = params.getConversationScopeKey?.();
    const requestId = ++requestSequence.current;
    const values = { ...imobForms.resolveFormValuesForMessage(form) };
    const revision = imobForms.getFormRevision?.(form.id);
    const context = getPropertyCaptureContext();
    const formThreadId = form.thread?.id;
    const formCaseId = form.caseContext?.caseId;
    const stillCurrent = () => {
      const now = getSession();
      return requestSequence.current === requestId && generation === params.getConversationGeneration()
        && scope === params.getConversationScopeKey?.() && now.token === session.token && now.userId === session.userId
        && now.tenantId === session.tenantId && now.workspaceId === session.workspaceId && now.activeDomain === session.activeDomain
        && pendingProperty()?.id === form.id && getPropertyCaptureContext() === context
        && pendingProperty()?.thread?.id === formThreadId && pendingProperty()?.caseContext?.caseId === formCaseId;
    };
    const append = (content: string, state: "active" | "paused" = "active") => appendStructured({
      id: makeStructuredId("assistant"), role: "assistant", text: content, thread: form.thread,
      propertyCaptureContext: state,
    });
    if (imobForms.formSubmittingRef.current.has(form.id)) {
      append("O formulário está sendo salvo. Aguarde o resultado antes de alterar este cadastro.");
      return;
    }
    if (text === propertyPolicy.resumeReply || text === propertyPolicy.pauseReply) {
      const state = text === propertyPolicy.resumeReply ? "active" : "paused";
      patchStructured(form.id, (message) => ({ ...message, propertyCaptureContext: state }));
      append(state === "active" ? "Retomei o mesmo cadastro. O formulário e todos os dados foram preservados."
        : "Pausei o cadastro para mudar de assunto. O formulário e os dados foram preservados; nada foi gravado.", state);
      return;
    }
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let result: import("@eiah/contracts").ImobPropertyCaptureResult;
    try {
      const response = await Promise.race([
        resolveTurn({ intake: "property_draft", message: text, propertyCapture: {
          message: text, operation: "property.create", step: "editing_form",
          draft: Object.fromEntries(IMOB_PROPERTY_CAPTURE_FIELDS.filter((field) => field in values).map((field) => [field, values[field]])),
          history: params.getPropertyHistory?.(form.id) ?? [],
        } }, controller.signal),
        new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("timeout")); }, params.propertyIntakeTimeoutMs ?? propertyPolicy.clientTimeoutMs); }),
      ]);
      const parsed = imobPropertyCaptureResultSchema.safeParse(response.data?.propertyCapture);
      if (!response.ok || !parsed.success) throw new Error("invalid");
      result = parsed.data;
      if (Object.keys(result.patch).length && result.outcome !== "updated") throw new Error("invalid");
      // Reuse the actual form validator, checking only the proposed fields (other fields may still be incomplete).
      const validation = buildPropertyCreateRequest({ ...values, ...result.patch });
      if (!validation.ok && Object.keys(result.patch).some((field) => validation.errors[field])) throw new Error("invalid");
      if (Object.keys(result.patch).some((field) => !form.form?.fields.some((item) => item.name === field))) throw new Error("invalid");
    } catch (error) {
      const outcome = controller.signal.aborted ? "timeout" : error instanceof Error && error.message === "invalid" ? "invalid" : "unavailable";
      result = { outcome, patch: {}, content: propertyPolicy[outcome] };
    } finally { if (timer) clearTimeout(timer); }
    if (!stillCurrent()) return;
    if (imobForms.formSubmittingRef.current.has(form.id) || revision !== imobForms.getFormRevision?.(form.id)
      || JSON.stringify(values) !== JSON.stringify(imobForms.resolveFormValuesForMessage(form))) {
      append("Você editou o formulário durante a interpretação. Preservei suas edições e descartei a resposta anterior. Envie sua mensagem novamente para usar os dados atuais.");
      return;
    }
    if (Object.keys(result.patch).length) {
      imobForms.setFormValuesByMessageId((previous) => ({
        ...previous, [form.id]: { ...(previous[form.id] ?? {}), ...result.patch } as Record<string, string>,
      }));
      imobForms.setFormErrorsByMessageId((previous) => {
        const remaining = { ...(previous[form.id] ?? {}) };
        for (const field of Object.keys(result.patch)) delete remaining[field];
        return { ...previous, [form.id]: remaining };
      });
    }
    const state = result.outcome === "leave" ? "paused" : "active";
    patchStructured(form.id, (message) => ({ ...message, propertyCaptureContext: state }));
    append(result.content, state);
  }

  /** Toda solicitação ao IMOB feita pelo front door (turno, reivindicação, continuação de formulário) é trabalho pendente compartilhado. */
  function forwardToImob(...args: Parameters<typeof forwardToImobRequest>): Promise<boolean> {
    return track(() => forwardToImobRequest(...args));
  }

  async function forwardToImobRequest(text: string, options?: { displayText?: string; continuityReplyRef?: string; claim?: boolean }, continuation?: {
    message: StructuredMessage;
    request: Extract<ReturnType<typeof buildProposalFormContinuation>, { ok: true }>["request"];
  }): Promise<boolean> {
    if (options?.displayText) echoUser(options.displayText);
    const context = continuation?.message ?? latestContext();
    const generation = params.getConversationGeneration();
    const requestId = ++requestSequence.current;
    if (!continuation) params.persistUser?.(`user:${initialScopeKey ?? ""}:${generation}:${requestId}:${Date.now()}`, options?.displayText ?? text);
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
    const resumedThread = context ? null : params.getResumedThread?.() ?? null;
    const thread = context?.thread ?? (resumedThread ? { id: resumedThread.threadId, label: resumedThread.label, status: resumedThread.status } : FRONT_DOOR_IMOB_THREAD);
    try {
      const call = options?.claim ? (params.claimTurn ?? apiClaimImobTurn) : resolveTurn;
      const response = await call({
        message: continuation?.request.message ?? buildProposalTextContinuation(text, context?.conversationState, requestContextRef).message,
        continuityContextRef: requestContextRef,
        threadId: thread.id,
        threadLabel: thread.label,
        caseId: context?.caseContext?.caseId ?? resumedThread?.caseId ?? null,
        threadState: continuation?.request.threadState ?? context?.conversationState ?? null,
        ...(options?.continuityReplyRef ? { continuityReplyRef: options.continuityReplyRef } : {}),
      });
      if (!response.ok) throw new Error("IMOB resolve-turn failed");
      // Reivindicação recusada (ou sem acesso): nada a mostrar; o Front Door segue com o fluxo dele.
      if (options?.claim && !("claimed" in response && response.claimed === true)) return false;
      const turn = response.data as NonNullable<typeof response.data>;
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
      const reply: StructuredMessage = {
        id: makeStructuredId("assistant"), role: "assistant",
        text: unknownForm
          ? `${presentation.text}\nEste formulário ainda não pode ser enviado por esta conversa. Nenhum envio foi efetuado.`
          : proposalCollectionForm ? "" : presentation.text,
        form: supported && turn.mode !== "blocked" ? form : undefined,
        thread: resolvedThread,
        conversationState: turn.conversationState,
        // Reivindicação: o caso só existe se o SERVIDOR o devolveu (vínculo explícito); nunca se herda um caso anterior, para que um
        // caso negado, fora de escopo ou não confirmado não continue preso à conversa.
        caseContext: options?.claim ? (turn.caseContext ?? null) : (turn.caseContext ?? (resolvedThread.id === thread.id ? context?.caseContext : null)),
        ...(options?.claim && presentation.widget ? { widget: frontDoorWidget(presentation.widget) } : {}),
        ...(presentation.card ? { card: { type: "action" as const, title: presentation.card.title, lines: presentation.card.lines,
          ctas: presentation.card.ctas?.filter((cta) => Boolean(cta.href)), thread: resolvedThread } } : {}),
      };
      appendStructured(reply);
      // Resposta do servidor ao turno: vai ao histórico persistido (formulários locais e mensagens de erro não).
      params.persistAssistant?.(reply);
      return accepted;
    } catch {
      if (options?.claim) return false;
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
    getFormContextKey: () => `${requestSequence.current}:${latestAssistantId() ?? ""}`,
    isFormCurrent: (message) => params.getConversationGeneration() === initialGeneration
      && params.getConversationScopeKey?.() === initialScopeKey
      && getMessages().some((item) => item.id === message.id && Boolean(item.form)),
    activeThreadId: latestContext()?.thread?.id ?? FRONT_DOOR_IMOB_THREAD.id,
    appendMessage: appendStructured,
    updateMessage: (messageId, patch) => patchStructured(messageId, (message) => ({ ...message, ...patch })),
    patchMessage: patchStructured,
    // O cadastro já está gravado no IMOB; a confirmação vai ao histórico persistido (nunca o conteúdo do formulário).
    persistMessage: (message, meta) => params.persistAssistant?.(message, meta),
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
  const structuredForms = createImobStructuredForms(imobForms, host, { resolveTurn });
  return {
    getPropertyCaptureContext,
    forwardToImob,
    getConversationState: () => {
      const context = latestContext();
      const state = context?.conversationState;
      return state?.operational?.continuity && state.operational.continuity.pending !== null && context && !reviewIsCurrent(context)
        ? { ...state, operational: { ...state.operational, continuity: null } } : state ?? null;
    },
    consumeOperationalTurn,
    // Cada operação assíncrona de formulário/ação (salvar, carregar listas, arquivar…) é trabalho pendente compartilhado; as síncronas passam direto.
    structuredForms: trackAsyncMethods({
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
    }, track),
  };
}

export type ImobFrontDoorForms = ReturnType<typeof useImobFrontDoorForms>;
