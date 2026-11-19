import React from "react";
import { apiClaimImobTurn, apiResolveImobTurn, type ImobPresentationWidget } from "@/lib/api";
import { getSession } from "@/state/sessionStore";
import { trackAsyncMethods, type PendingTrack } from "@/lib/frontDoorPendingWork";
import { buildProposalFormContinuation, buildProposalTextContinuation, hasPendingProposalReview, isConversationalProposalForm } from "@/pages/app/imob/proposalForm";
import { useImobFormState, type ImobFormState } from "./useImobFormState";
import { createImobStructuredForms } from "./createImobStructuredForms";
import { makeStructuredId, type ImobStructuredFormsHost, type StructuredMessage } from "./types";
import type { ImobConversationPersistence, PersistedTag, ResumedThread } from "../persistence/useImobConversationPersistence";
import { IMOB_PROPERTY_GUIDED_POLICY as guidedPolicy, resolveImobPropertyGuidedCommand, IMOB_PROPERTY_CAPTURE_FIELDS, IMOB_PROPERTY_CAPTURE_POLICY as propertyPolicy, imobPropertyCaptureResultSchema, type ImobPropertyCaptureProposal } from "@eiah/contracts";
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
  /** Produced by toLauncherMessage and rendered by the launcher. */
  presentationSnapshot?: MessagePresentationSnapshot;
  /** Gravado no histórico persistido do IMOB (FD-IMOB-PERSISTENCE-001); evita gravar de novo ao restaurar. */
  imobPersisted?: PersistedTag;
};

/** Thrown by the wrapped resolve-turn after it showed the recovery notice, so callers do not add a generic failure on top. */
class CaptureRecoveryOffered extends Error {}
function activeCaptureOf(error: unknown) {
  const e = error as { status?: unknown; body?: { error?: { code?: unknown; details?: { sessionRef?: unknown; status?: unknown } } } } | null;
  const details = e?.body?.error?.details;
  if (e?.status !== 409 || e.body?.error?.code !== "IMOB_PROPERTY_CAPTURE_ACTIVE" || typeof details?.sessionRef !== "string") return null;
  return { sessionRef: details.sessionRef, status: details.status === "paused" ? "paused" as const : "active" as const };
}

export function toLauncherMessage<M extends FrontDoorMessageLike>(structured: StructuredMessage): M {
  const capture = structured.propertyCaptureContext ?? (isPropertyCreateForm(structured.form) ? "active" : null);
  const presentationSnapshot: MessagePresentationSnapshot | undefined = capture ? {
    snapshotVersion: "v1", verticalContext: capture === "active" ? "IMOB" : null, routeIntent: capture === "active" ? "imob" : "help",
    showConfidence: false, provenanceMode: "none", signals: [], renderVariant: "guided_flow", quickReplySource: structured.propertyGuided ? "backend_payload" : "agent_contract",
    quickReplies: structured.propertyGuided ? structured.propertyGuided.quickReplies : capture === "active" ? structured.propertyCaptureProposal
      ? [propertyPolicy.confirmReply, propertyPolicy.rejectReply, propertyPolicy.questionReply]
      : [propertyPolicy.questionReply, propertyPolicy.pauseReply] : [propertyPolicy.resumeReply],
    inputPlaceholder: structured.propertyGuided && capture === "active"
      ? structured.propertyCaptureProposal ? propertyPolicy.confirmationPlaceholder
        : structured.propertyGuided.phase === "start" ? guidedPolicy.initialPlaceholder
          : structured.propertyGuided.showFullForm ? guidedPolicy.reviewPlaceholder : guidedPolicy.collectingPlaceholder
      : capture === "active" ? structured.propertyCaptureProposal ? propertyPolicy.confirmationPlaceholder : propertyPolicy.placeholder : propertyPolicy.pausedPlaceholder,
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

  React.useEffect(() => {
    setMessages((prev) => {
      let changed = false;
      const next = prev.map((message) => {
        const structured = message.imobStructured;
        const local = imobForms.formValuesByMessageId[message.id];
        if (!structured?.propertyGuided || !structured.form || !local) return message;
        if (!structured.form.fields.some((field) => field.name in local && String(field.value ?? "") !== local[field.name])) return message;
        changed = true;
        return { ...message, imobStructured: { ...structured, propertyCaptureProposal: null,
          propertyCaptureOrigin: structured.propertyCaptureOrigin ? { ...structured.propertyCaptureOrigin,
            draftVersion: imobForms.getFormRevision(message.id) } : undefined,
          form: { ...structured.form, fields: structured.form.fields.map((field) => ({ ...field, value: local[field.name] ?? field.value })) } } };
      });
      return changed ? next : prev;
    });
  }, [imobForms.formValuesByMessageId, setMessages]);

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
        if (structured?.propertyCaptureProposal && (changedScope || (!structured.propertyGuided && structured.propertyCaptureProposal.origin.contextRef !== reviewOriginRef.current.ref))) {
          invalidated = true;
          return { ...message, imobStructured: { ...structured, propertyCaptureProposal: null } };
        }
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
  const rawResolveTurn = params.resolveTurn ?? apiResolveImobTurn;
  // 409 IMOB_PROPERTY_CAPTURE_ACTIVE: the server names the actor's open guided capture. Show an explicit recovery notice (no LLM, no retry).
  const resolveTurn: typeof apiResolveImobTurn = async (body, signal) => {
    try { return await rawResolveTurn(body, signal); }
    catch (error) {
      const active = activeCaptureOf(error);
      if (!active) throw error;
      offerCaptureRecovery(active);
      throw new CaptureRecoveryOffered();
    }
  };
  const originRef = `v1:${makeStructuredId("review")}`;
  const getContinuityContextRef = params.getContinuityContextRef ?? (() => originRef);
  const initialContextRef = getContinuityContextRef();
  const requestSequence = params.requestSequenceRef ?? { current: 0 };
  const latestContext = () => [...getMessages()].reverse().find((message) => message.conversationState);
  const pendingProperty = () => [...getMessages()].reverse().find((message) => isPropertyCreateForm(message.form));
  const pendingOpening = () => [...getMessages()].reverse().find((message) => !message.form && message.propertyCaptureOrigin
    && message.propertyGuided?.phase === "start" && message.propertyGuided.status === "active" && !message.propertyGuided.sessionRef);
  const pendingRecovery = () => [...getMessages()].reverse().find((message) => message.propertyRecovery);
  const getPropertyCaptureContext = () => {
    const form = pendingProperty();
    return form ? form.propertyCaptureContext ?? "active" as const : pendingOpening() || pendingRecovery() ? "active" as const : null;
  };

  function offerCaptureRecovery(active: NonNullable<ReturnType<typeof activeCaptureOf>>) {
    // At most one live notice: the previous one stops offering its action, so repeated attempts never stack buttons or loop.
    for (const item of getMessages()) if (item.propertyRecovery) patchStructured(item.id, (message) => ({ ...message, propertyRecovery: undefined, quickReplies: undefined }));
    const id = makeStructuredId("assistant");
    appendStructured({ id, role: "assistant", propertyRecovery: active,
      text: "Há um cadastro de imóvel pendente em outra aba ou sessão. Nada foi salvo e nenhuma interpretação por IA foi feita. "
        + "Para seguir com outro assunto, cancele o cadastro pendente (os dados dele serão descartados) ou retome-o na aba em que foi iniciado.",
      quickReplies: [{ id: "cancel-pending-property", label: guidedPolicy.cancelReply, reply: guidedPolicy.cancelReply,
        onSelect: () => { void track(() => recoverPendingCapture(id)); } }] });
  }

  /** Explicit recovery: closes exactly the session the server named. Never "the latest one"; the answer is the persisted state. */
  async function recoverPendingCapture(noticeId: string): Promise<boolean> {
    const notice = getMessages().find((message) => message.id === noticeId);
    const target = notice?.propertyRecovery;
    if (!notice || !target) return true;
    const before = getSession(), generation = params.getConversationGeneration();
    const current = () => generation === params.getConversationGeneration() && before.token === getSession().token && before.userId === getSession().userId
      && before.tenantId === getSession().tenantId && before.workspaceId === getSession().workspaceId;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const response = await Promise.race([
        rawResolveTurn({ intake: "property_draft", message: guidedPolicy.cancelReply, propertyCapture: {
          message: guidedPolicy.cancelReply, operation: "property.create", step: "editing_form", draft: {}, history: [],
          guided: { action: "cancel", sessionRef: target.sessionRef },
        } }, controller.signal),
        new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("timeout")); }, params.propertyIntakeTimeoutMs ?? propertyPolicy.clientTimeoutMs); }),
      ]);
      if (!current()) return true;
      const parsed = imobPropertyCaptureResultSchema.safeParse(response.data?.propertyCapture);
      const guided = response.ok && parsed.success ? parsed.data.guided : undefined;
      if (!guided || guided.sessionRef !== target.sessionRef || (guided.status !== "cancelled" && guided.status !== "saved")) throw new Error("unconfirmed");
      patchStructured(noticeId, (message) => ({ ...message, propertyRecovery: undefined, quickReplies: undefined }));
      appendStructured({ id: makeStructuredId("assistant"), role: "assistant", text: guided.status === "saved"
        ? "Esse cadastro já havia sido salvo; nada mais foi alterado. Para cadastrar outro imóvel, escolha Cadastrar imóvel."
        : "Cadastro pendente cancelado. Nada foi salvo. Para cadastrar um imóvel, escolha Cadastrar imóvel." });
    } catch {
      // Unknown outcome: the notice (and its single action) stay; nothing is retried automatically.
      if (current()) appendStructured({ id: makeStructuredId("assistant"), role: "assistant",
        text: "Não consegui confirmar o cancelamento do cadastro pendente. Ele continua aberto; tente novamente pelo aviso." });
    } finally { if (timer) clearTimeout(timer); }
    return true;
  }
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
    const recovery = !propertyForm && !pendingOpening() ? pendingRecovery() : undefined;
    if (recovery) {
      const typed = text.trim().toLocaleLowerCase("pt-BR");
      if (typed === guidedPolicy.cancelReply.toLocaleLowerCase("pt-BR")) return track(() => recoverPendingCapture(recovery.id));
      if (typed === guidedPolicy.startReply.toLocaleLowerCase("pt-BR")) { offerCaptureRecovery(recovery.propertyRecovery!); return true; }
      return false; // Other subjects follow the governed routing; IMOB turns surface the notice again, with no automatic retry.
    }
    if (text.trim().toLocaleLowerCase("pt-BR") === guidedPolicy.startReply.toLocaleLowerCase("pt-BR")) {
      return track(() => propertyForm?.propertyGuided ? continueGuidedProperty(propertyForm, text, { action: "sync" }) : startGuidedProperty());
    }
    const opening = pendingOpening();
    if (!propertyForm && opening) {
      if (action === "cancel" || text.trim().toLocaleLowerCase("pt-BR") === guidedPolicy.cancelReply.toLocaleLowerCase("pt-BR")) return track(() => cancelGuidedOpening(opening));
      appendStructured({ id: makeStructuredId("assistant"), role: "assistant", text: "A abertura ainda está pendente. Você pode repetir Cadastrar imóvel para sincronizar ou cancelar o cadastro." });
      return true;
    }
    if (propertyForm?.propertyGuided) return track(() => continueGuidedProperty(propertyForm, text,
      action === "cancel" ? { action: "cancel" } : action === "release" ? { action: "pause" } : undefined));
    if (propertyForm && action === "continue") return track(() => continuePropertyCapture(propertyForm, text));
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

  async function startGuidedProperty(): Promise<boolean> {
    const previous = pendingProperty();
    if (previous?.propertyGuided) return continueGuidedProperty(previous, guidedPolicy.startReply, { action: "sync" });
    // A lost opening response may already have created the server session. Retry the same registration, including after same-tab reload.
    const interrupted = pendingOpening();
    const generation = params.getConversationGeneration();
    const before = getSession(), scope = params.getConversationScopeKey?.(), contextRef = getContinuityContextRef();
    const sequence = ++requestSequence.current;
    const origin = interrupted?.propertyCaptureOrigin ?? { formId: makeStructuredId("assistant"), contextRef, draftVersion: 0, threadId: FRONT_DOOR_IMOB_THREAD.id, caseId: null };
    const markerId = interrupted?.id ?? makeStructuredId("assistant");
    const pendingView = { sessionRef: null, revision: 0, phase: "start" as const, status: "active" as const, skipped: [],
      interpretation: "blocked" as const, currentField: null, errors: {}, quickReplies: [guidedPolicy.startReply, guidedPolicy.cancelReply], showFullForm: false };
    if (!interrupted) appendStructured({ id: markerId, role: "assistant", text: "Abrindo o cadastro do imóvel…",
      propertyCaptureOrigin: origin, propertyGuided: pendingView, propertyCaptureContext: "active" });
    const stillCurrent = () => sequence === requestSequence.current && generation === params.getConversationGeneration()
      && getMessages().find((message) => message.id === markerId)?.propertyGuided?.status === "active"
      && (!pendingProperty() || pendingProperty()?.id === previous?.id)
      && params.getConversationScopeKey?.() === scope && contextRef === getContinuityContextRef()
      && before.token === getSession().token && before.tenantId === getSession().tenantId && before.workspaceId === getSession().workspaceId
      && before.userId === getSession().userId && before.activeDomain === getSession().activeDomain;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const response = await Promise.race([
        resolveTurn({ intake: "property_draft", message: guidedPolicy.startReply, propertyCapture: {
          message: guidedPolicy.startReply, operation: "property.create", step: "editing_form", draft: {}, origin, history: [], guided: { action: "start" },
        } }, controller.signal),
        new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("timeout")); }, params.propertyIntakeTimeoutMs ?? propertyPolicy.clientTimeoutMs); }),
      ]);
      if (!stillCurrent()) return true;
      const parsed = imobPropertyCaptureResultSchema.safeParse(response.data?.propertyCapture);
      if (!response.ok || !parsed.success || !parsed.data.guided || !response.data.presentation.form) throw new Error("invalid");
      const result = parsed.data;
      if (result.guided?.status === "cancelled" || result.guided?.status === "saved") {
        patchStructured(markerId, (message) => ({ ...message, text: result.content, propertyGuided: result.guided, propertyCaptureProposal: null }));
        return true;
      }
      patchStructured(markerId, (message) => ({ ...message, text: "", propertyGuided: undefined, propertyCaptureOrigin: undefined, propertyCaptureContext: undefined }));
      const values = { ...result.patch, ...(result.guided?.fieldPatch ? { [result.guided.fieldPatch.name]: result.guided.fieldPatch.value } : {}) };
      appendStructured({ id: origin.formId, role: "assistant", text: result.content,
        form: { ...response.data.presentation.form, fields: response.data.presentation.form.fields.map((field) => ({ ...field, value: values[field.name as keyof typeof values] ?? field.value })) },
        thread: FRONT_DOOR_IMOB_THREAD, propertyGuided: result.guided, propertyCaptureContext: result.guided?.status === "paused" ? "paused" : "active", propertyCaptureOrigin: origin,
        propertyCaptureProposal: result.proposal });
      return true;
    } catch (error) {
      // Another origin has an open capture: the wrapped resolveTurn already showed the explicit recovery notice (server-named session, no retry).
      // Nothing was opened, so the opening marker is removed instead of left pending behind a generic failure.
      if (error instanceof CaptureRecoveryOffered) {
        patchStructured(markerId, (message) => ({ ...message, text: "", propertyGuided: undefined, propertyCaptureOrigin: undefined, propertyCaptureContext: undefined }));
        return true;
      }
      if (stillCurrent()) patchStructured(markerId, (message) => ({ ...message,
        text: "Não consegui confirmar a abertura do cadastro. Tente Cadastrar imóvel novamente para sincronizar a mesma sessão." }));
      return true;
    } finally { if (timer) clearTimeout(timer); }
  }

  async function cancelGuidedOpening(opening: StructuredMessage): Promise<boolean> {
    const sequence = ++requestSequence.current, before = getSession(), generation = params.getConversationGeneration();
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const current = () => sequence === requestSequence.current && generation === params.getConversationGeneration()
      && before.token === getSession().token && before.userId === getSession().userId
      && before.tenantId === getSession().tenantId && before.workspaceId === getSession().workspaceId;
    try {
      const response = await Promise.race([
        resolveTurn({ intake: "property_draft", message: guidedPolicy.cancelReply, propertyCapture: {
          message: guidedPolicy.cancelReply, operation: "property.create", step: "editing_form", draft: {}, history: [],
          origin: opening.propertyCaptureOrigin, guided: { action: "cancel" },
        } }, controller.signal),
        new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("timeout")); }, params.propertyIntakeTimeoutMs ?? propertyPolicy.clientTimeoutMs); }),
      ]);
      if (!current()) return true;
      const parsed = imobPropertyCaptureResultSchema.safeParse(response.data?.propertyCapture);
      if (!response.ok || !parsed.success || !parsed.data.guided || !["cancelled", "saved"].includes(parsed.data.guided.status)) throw new Error("invalid");
      patchStructured(opening.id, (message) => ({ ...message, text: parsed.data.content, propertyGuided: parsed.data.guided, propertyCaptureProposal: null }));
    } catch {
      if (current()) patchStructured(opening.id, (message) => ({ ...message,
        text: "Não consegui confirmar o cancelamento. A resposta antiga foi descartada; tente cancelar novamente ou sincronizar Cadastrar imóvel." }));
    } finally { if (timer) clearTimeout(timer); }
    return true;
  }

  async function continueGuidedProperty(form: StructuredMessage, text: string,
    selected?: NonNullable<import("@eiah/contracts").ImobPropertyCaptureRequest["guided"]>): Promise<boolean> {
    const state = form.propertyGuided!;
    if (imobForms.formSubmittingRef.current.has(form.id)) {
      appendStructured({ id: makeStructuredId("assistant"), role: "assistant", text: "O cadastro está sendo salvo. Aguarde o resultado antes de alterar ou cancelar." });
      return true;
    }
    if (!form.form || !form.propertyCaptureOrigin) return true;
    const command = selected ?? resolveImobPropertyGuidedCommand(text, state, form.form.fields, Boolean(form.propertyCaptureProposal));
    if (state.status === "paused" && command.action === "sync") return false;
    const values = { ...imobForms.resolveFormValuesForMessage(form) };
    const revision = imobForms.getFormRevision(form.id);
    const origin = { ...form.propertyCaptureOrigin, draftVersion: revision };
    const before = getSession(), generation = params.getConversationGeneration(), scope = params.getConversationScopeKey?.();
    const sequence = ++requestSequence.current;
    const stillCurrent = () => sequence === requestSequence.current && params.getConversationGeneration() === generation
      && params.getConversationScopeKey?.() === scope && getSession().token === before.token && getSession().userId === before.userId
      && getSession().tenantId === before.tenantId && getSession().workspaceId === before.workspaceId && getSession().activeDomain === before.activeDomain
      && pendingProperty()?.id === form.id && pendingProperty()?.propertyGuided?.sessionRef === state.sessionRef;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const response = await Promise.race([
        resolveTurn({ intake: "property_draft", message: text, propertyCapture: { message: text, operation: "property.create", step: "editing_form",
          draft: Object.fromEntries(IMOB_PROPERTY_CAPTURE_FIELDS.filter((key) => key in values).map((key) => [key, values[key]])), origin,
          contextState: form.propertyCaptureContext ?? "active", pendingProposal: form.propertyCaptureProposal ?? null,
          history: params.getPropertyHistory?.(form.id) ?? [],
          guided: { ...command, ...(state.sessionRef ? { sessionRef: state.sessionRef } : {}), revision: state.revision, ownerId: values.ownerId ?? "", fallbackView: { phase: state.phase, skipped: state.skipped, currentField: state.currentField } },
        } }, controller.signal),
        new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("timeout")); }, params.propertyIntakeTimeoutMs ?? propertyPolicy.clientTimeoutMs); }),
      ]);
      if (!stillCurrent()) return true;
      const parsed = imobPropertyCaptureResultSchema.safeParse(response.data?.propertyCapture);
      if (!response.ok || !parsed.success) throw new Error("invalid");
      const result = parsed.data;
      if (!result.guided) {
        patchStructured(form.id, (current) => ({ ...current, propertyCaptureProposal: null,
          propertyGuided: { ...state, interpretation: "blocked", quickReplies: [guidedPolicy.reviewReply, guidedPolicy.cancelReply] } }));
        appendStructured({ id: makeStructuredId("assistant"), role: "assistant", text: result.content, propertyGuided: { ...state, quickReplies: [] } });
        return true;
      }
      if (result.guided.sessionRef !== state.sessionRef && state.sessionRef) throw new Error("invalid");
      const updated = revision === imobForms.getFormRevision(form.id) && JSON.stringify(values) === JSON.stringify(imobForms.resolveFormValuesForMessage(form));
      if (!updated) {
        patchStructured(form.id, (current) => ({ ...current, propertyGuided: result.guided, propertyCaptureProposal: null }));
        appendStructured({ id: makeStructuredId("assistant"), role: "assistant", text: "Preservei sua edição feita durante a resposta. Continue pelo campo ou revise o cadastro." });
        return true;
      }
      const patch: Record<string, string> = Object.fromEntries(Object.entries(result.patch).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
      if (result.guided.fieldPatch) patch[result.guided.fieldPatch.name] = result.guided.fieldPatch.value;
      if (!result.guided.synchronized && command.action === "confirm" && Object.keys(patch).length
        && (!form.propertyCaptureProposal || result.confirmedProposalRef !== form.propertyCaptureProposal.ref
          || JSON.stringify(Object.entries(result.patch).sort()) !== JSON.stringify(Object.entries(form.propertyCaptureProposal.changes).sort()))) throw new Error("invalid");
      if (!result.guided.synchronized && command.action === "set" && Object.keys(patch).some((key) => key !== command.field && key !== state.currentField)) throw new Error("invalid");
      if (Object.keys(patch).length) imobForms.setFormValuesByMessageId((prev) => ({ ...prev, [form.id]: { ...values, ...patch } }));
      const nextValues = { ...values, ...patch };
      const closed = result.guided.status === "cancelled" || result.guided.status === "saved";
      patchStructured(form.id, (current) => ({ ...current, propertyGuided: result.guided,
        propertyCaptureContext: result.guided!.status === "paused" ? "paused" : "active",
        propertyCaptureProposal: result.proposal ?? null, propertyCaptureOrigin: origin,
        form: closed ? undefined : { ...current.form!, fields: current.form!.fields.map((field) => ({ ...field, value: nextValues[field.name] ?? field.value })) },
      }));
      imobForms.setFormErrorsByMessageId((prev) => ({ ...prev, [form.id]: result.guided!.showFullForm ? result.guided!.errors : {} }));
      appendStructured({ id: makeStructuredId("assistant"), role: "assistant", text: result.content,
        propertyCaptureContext: result.guided.status === "paused" ? "paused" : "active", propertyGuided: result.guided,
        propertyCaptureProposal: result.proposal ?? null, thread: form.thread });
      return true;
    } catch {
      if (stillCurrent()) {
        // Unknown outcomes never renew local eligibility. Server admission remains authoritative after reload/retry.
        const blocked = { ...state, interpretation: "blocked" as const };
        patchStructured(form.id, (current) => ({ ...current, propertyGuided: blocked }));
        appendStructured({ id: makeStructuredId("assistant"), role: "assistant", propertyGuided: blocked,
          text: "Não consegui confirmar a resposta. Seus dados foram mantidos. Continue sem IA para sincronizar o cadastro." });
      }
      return true;
    } finally { if (timer) clearTimeout(timer); }
  }

  async function continuePropertyCapture(form: StructuredMessage, text: string): Promise<boolean> {
    const session = getSession();
    const generation = params.getConversationGeneration();
    const scope = params.getConversationScopeKey?.();
    const contextRef = getContinuityContextRef();
    const requestId = ++requestSequence.current;
    const values = { ...imobForms.resolveFormValuesForMessage(form) };
    const revision = imobForms.getFormRevision?.(form.id) ?? 0;
    const context = getPropertyCaptureContext() ?? "active";
    const origin = { formId: form.id, contextRef, draftVersion: revision,
      threadId: form.thread?.id ?? null, caseId: form.caseContext?.caseId ?? null };
    const draft = Object.fromEntries(IMOB_PROPERTY_CAPTURE_FIELDS.filter((field) => field in values).map((field) => [field, values[field]]));
    const pending = form.propertyCaptureProposal ?? null;
    const sameDraft = (a: Record<string, string | undefined>, b: Record<string, string | undefined>) =>
      IMOB_PROPERTY_CAPTURE_FIELDS.every((field) => (a[field] ?? "") === (b[field] ?? ""));
    const stillCurrent = () => {
      const now = getSession();
      return requestSequence.current === requestId && generation === params.getConversationGeneration()
        && scope === params.getConversationScopeKey?.() && contextRef === getContinuityContextRef()
        && now.token === session.token && now.userId === session.userId
        && now.tenantId === session.tenantId && now.workspaceId === session.workspaceId && now.activeDomain === session.activeDomain
        && pendingProperty()?.id === form.id && getPropertyCaptureContext() === context
        && (pendingProperty()?.thread?.id ?? null) === origin.threadId && (pendingProperty()?.caseContext?.caseId ?? null) === origin.caseId
        && (pendingProperty()?.propertyCaptureProposal?.ref ?? null) === (pending?.ref ?? null);
    };
    const append = (content: string, state: "active" | "paused", proposal?: ImobPropertyCaptureProposal | null) => appendStructured({
      id: makeStructuredId("assistant"), role: "assistant", text: content, thread: form.thread,
      propertyCaptureContext: state, propertyCaptureProposal: proposal,
    });
    if (imobForms.formSubmittingRef.current.has(form.id)) {
      append("O formulário está sendo salvo. Aguarde o resultado antes de alterar este cadastro.", context, pending);
      return true;
    }
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let result: import("@eiah/contracts").ImobPropertyCaptureResult;
    try {
      const response = await Promise.race([
        resolveTurn({ intake: "property_draft", message: text, propertyCapture: {
          message: text, operation: "property.create", step: "editing_form", draft, origin, contextState: context,
          pendingProposal: pending, providedFields: form.form!.fields.filter((field) => values[field.name]?.trim()).map((field) => field.name),
          history: params.getPropertyHistory?.(form.id) ?? [],
        } }, controller.signal),
        new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("timeout")); }, params.propertyIntakeTimeoutMs ?? propertyPolicy.clientTimeoutMs); }),
      ]);
      const parsed = imobPropertyCaptureResultSchema.safeParse(response.data?.propertyCapture);
      if (!response.ok || !parsed.success) throw new Error("invalid");
      result = parsed.data;
      const validatePatch = (patch: Record<string, string | undefined>) => {
        const validation = buildPropertyCreateRequest({ ...values, ...patch } as Record<string, string>);
        if ((!validation.ok && Object.keys(patch).some((field) => validation.errors[field]))
          || Object.keys(patch).some((field) => !form.form?.fields.some((item) => item.name === field))) throw new Error("invalid");
      };
      validatePatch(result.patch);
      if (result.outcome === "updated") {
        if (!pending || result.confirmedProposalRef !== pending.ref || result.proposal !== null
          || JSON.stringify(pending.origin) !== JSON.stringify(origin) || !sameDraft(pending.baseDraft, draft)
          || JSON.stringify(Object.entries(result.patch).sort()) !== JSON.stringify(Object.entries(pending.changes).sort())) throw new Error("invalid");
      } else if (Object.keys(result.patch).length) throw new Error("invalid");
      if (result.proposal) {
        validatePatch(result.proposal.changes);
        if (JSON.stringify(result.proposal.origin) !== JSON.stringify(origin) || !sameDraft(result.proposal.baseDraft, draft)
          || !Object.keys(result.proposal.changes).length
          || (result.outcome !== "proposed" && result.proposal.ref !== pending?.ref)) throw new Error("invalid");
      } else if (result.outcome === "proposed") throw new Error("invalid");
    } catch (error) {
      const outcome = controller.signal.aborted ? "timeout" : error instanceof Error && error.message === "invalid" ? "invalid" : "unavailable";
      result = { outcome, patch: {}, proposal: pending, content: propertyPolicy[outcome] };
    } finally { if (timer) clearTimeout(timer); }
    if (!stillCurrent()) return true;
    if (imobForms.formSubmittingRef.current.has(form.id) || revision !== (imobForms.getFormRevision?.(form.id) ?? 0)
      || JSON.stringify(values) !== JSON.stringify(imobForms.resolveFormValuesForMessage(form))) {
      patchStructured(form.id, (message) => ({ ...message, propertyCaptureProposal: null }));
      append("Você editou o formulário durante a interpretação. Preservei suas edições e descartei a resposta e a proposta anteriores por inteiro. Envie sua mensagem novamente para uma nova revisão.", context, null);
      return true;
    }
    // Only a response bound to the exact current proposal may edit this same draft. Never invokes a save handler.
    if (result.outcome === "updated") {
      imobForms.setFormValuesByMessageId((previous) => ({
        ...previous, [form.id]: { ...(previous[form.id] ?? {}), ...result.patch } as Record<string, string>,
      }));
      imobForms.setFormErrorsByMessageId((previous) => {
        const remaining = { ...(previous[form.id] ?? {}) };
        for (const field of Object.keys(result.patch)) delete remaining[field];
        return { ...previous, [form.id]: remaining };
      });
    }
    const state = result.outcome === "leave" ? "paused" : result.outcome === "resumed" || result.outcome === "proposed" || result.outcome === "updated" ? "active" : context;
    const proposal = result.proposal === undefined ? pending : result.proposal;
    patchStructured(form.id, (message) => ({ ...message, propertyCaptureContext: state, propertyCaptureProposal: proposal }));
    // Paused conversation gets a semantic resume check before releasing a new subject to the existing front door.
    if (context === "paused" && result.outcome === "leave") return false;
    append(result.content, state, proposal);
    return true;
  }

  /** Toda solicitação ao IMOB feita pelo front door (turno, reivindicação, continuação de formulário) é trabalho pendente compartilhado. */
  function forwardToImob(...args: Parameters<typeof forwardToImobRequest>): Promise<boolean> {
    return track(() => forwardToImobRequest(...args));
  }

  async function forwardToImobRequest(text: string, options?: { displayText?: string; continuityReplyRef?: string; claim?: boolean }, continuation?: {
    message: StructuredMessage;
    request: Extract<ReturnType<typeof buildProposalFormContinuation>, { ok: true }>["request"];
  }): Promise<boolean> {
    if (!options?.claim && text.trim().toLocaleLowerCase("pt-BR") === guidedPolicy.startReply.toLocaleLowerCase("pt-BR")) return startGuidedProperty();
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
    } catch (error) {
      if (error instanceof CaptureRecoveryOffered) return false;
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
      handleSelectChange(message: StructuredMessage, field: string, value: string) {
        const live = getMessages().find((item) => item.id === message.id);
        if (live?.propertyGuided && !live.propertyGuided.showFullForm) {
          void track(() => continueGuidedProperty(live, value || "Selecionar opção", { action: "set", field, value }));
          return;
        }
        structuredForms.handleSelectChange(message, field, value);
      },
      focusPropertyField(message: StructuredMessage, field: string) {
        const live = getMessages().find((item) => item.id === message.id);
        if (live?.propertyGuided) return track(() => continueGuidedProperty(live, `Corrigir ${field}`, { action: "focus", field }));
      },
      /** A reply the server offered for the current guided state (e.g. "Continuar sem IA"): the same canonical command as typing it. No provider. */
      selectGuidedReply(message: StructuredMessage, reply: string) {
        const live = getMessages().find((item) => item.id === message.id);
        if (!live?.propertyGuided || !live.form || !live.propertyGuided.quickReplies.includes(reply)) return;
        echoUser(reply);
        return track(() => continueGuidedProperty(live, reply));
      },
      async handleStructuredFormAction(incoming: StructuredMessage, actionId: "cancel" | "submit" | "archive"): Promise<boolean> {
        const guided = getMessages().find((item) => item.id === incoming.id);
        if (guided?.propertyGuided && guided.form) {
          if (actionId === "cancel") return continueGuidedProperty(guided, guidedPolicy.cancelReply, { action: "cancel" });
          if (!guided.propertyGuided.showFullForm) {
            const field = guided.propertyGuided.currentField;
            if (field && actionId === "submit") return continueGuidedProperty(guided, imobForms.resolveFormValuesForMessage(guided)[field] || "Continuar",
              { action: "set", field, value: imobForms.resolveFormValuesForMessage(guided)[field] ?? "" });
            return true;
          }
        }
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
