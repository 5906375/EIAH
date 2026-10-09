import { createHash, randomUUID } from "node:crypto";
import type { ImobOperationalState, ImobProposalContinuityV1 } from "../imobConversationContract";
import { IMOB_PROPOSAL_REVIEW_POLICY } from "../imobAgentContract";
import type { ImobCrmCaseContext } from "./imobCrmAgentContract";

function object(value: unknown): Record<string, any> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : null;
}

// Fixed domain fields, independent of object key order and without copying PII into the descriptor.
export function proposalDraftRef(draft: unknown) {
  const value = object(draft);
  return createHash("sha256").update(JSON.stringify([
    "buyerName", "buyerEmail", "buyerPhone", "propertyId", "offerAmount", "contractType",
    "counterofferAmount", "negotiationStatus", "approvalRequired", "approvalStatus",
  ].map((key) => value?.[key] ?? null))).digest("hex");
}

export function isProposalReviewContextRef(value: unknown): value is string {
  return typeof value === "string" && /^v1:[A-Za-z0-9:_-]{1,200}$/.test(value);
}

/** Invalid questions become an explicit tombstone; answered descriptors retain pending:null. */
export function parseProposalContinuity(operational: unknown, now = Date.now()): ImobProposalContinuityV1 | null {
  const op = object(operational);
  const continuity = object(op?.continuity);
  if (op?.flow !== "proposal.create" || op.status !== "ready_for_review" || !Array.isArray(op.pendingFields)
    || op.pendingFields.length || !object(op.proposalDraft) || continuity?.version !== "v1"
    || !["review", "clarification"].includes(continuity.phase)) return null;
  if (continuity.pending === null) return { version: "v1", phase: continuity.phase, pending: null };
  const pending = object(continuity.pending);
  const reviewing = continuity.phase === "review";
  if (!pending || pending.subject !== "proposalDraft"
    || pending.purpose !== (reviewing ? "review_data" : "identify_correction")
    || pending.expectedResponse !== (reviewing ? "affirmation_or_correction" : "correction_details")
    || !["ref", "caseId", "threadId", "draftRef"].every((key) => typeof pending[key] === "string" && pending[key].trim())
    || !isProposalReviewContextRef(pending.contextRef)
    || (pending.expiresAt !== null && (typeof pending.expiresAt !== "string"
      || !Number.isFinite(Date.parse(pending.expiresAt)) || Date.parse(pending.expiresAt) <= now))
    || pending.draftRef !== proposalDraftRef(op.proposalDraft)) return null;
  return { version: "v1", phase: continuity.phase, pending: {
    ref: pending.ref, subject: "proposalDraft", purpose: pending.purpose, expectedResponse: pending.expectedResponse,
    caseId: pending.caseId, threadId: pending.threadId, draftRef: pending.draftRef, contextRef: pending.contextRef, expiresAt: pending.expiresAt,
  } };
}

function questionRef(pending: NonNullable<ImobProposalContinuityV1["pending"]>, scope: { tenantId: string; workspaceId: string; userId?: string | null }) {
  // Correlation to the authenticated scope; this hash does not grant authority or prove durable freshness.
  const nonce = /^q:([0-9a-f-]{36}):/.exec(pending.ref)?.[1];
  if (!nonce) return null;
  return `q:${nonce}:` + createHash("sha256").update(JSON.stringify([
    nonce, scope.tenantId, scope.workspaceId, scope.userId ?? null, pending.contextRef, pending.caseId, pending.threadId, pending.draftRef,
    pending.purpose, pending.expiresAt,
  ])).digest("hex");
}

export function buildProposalReviewQuestion(params: {
  operational: ImobOperationalState;
  caseId: string;
  threadId: string;
  tenantId: string;
  workspaceId: string;
  userId?: string | null;
  contextRef: string;
  phase?: ImobProposalContinuityV1["phase"];
  expiresAt?: string | null;
}): ImobProposalContinuityV1 {
  const phase = params.phase ?? "review";
  const pending: NonNullable<ImobProposalContinuityV1["pending"]> = {
    ref: `q:${randomUUID()}:`, subject: "proposalDraft", purpose: phase === "review" ? "review_data" : "identify_correction",
    expectedResponse: phase === "review" ? "affirmation_or_correction" : "correction_details",
    caseId: params.caseId, threadId: params.threadId, contextRef: params.contextRef, draftRef: proposalDraftRef(params.operational.proposalDraft),
    // No timeout policy: adapters invalidate on answer/replacement/scope changes. No durable consumption.
    expiresAt: params.expiresAt ?? null,
  };
  pending.ref = questionRef(pending, params)!;
  return { version: "v1", phase, pending };
}

/** Add a question only after a normal resolved proposal has an authoritative case/thread. */
export function attachProposalReviewQuestion<T extends Record<string, any>>(data: T, scope: { tenantId: string; workspaceId: string; userId?: string | null }, contextRef?: unknown): T {
  const op = object(data.conversationState?.operational);
  const context = object(data.caseContext);
  if (!isProposalReviewContextRef(contextRef) || !scope.userId?.trim() || !scope.tenantId.trim() || !scope.workspaceId.trim()
    || data.mode !== "execute" || op?.flow !== "proposal.create" || op.status !== "ready_for_review"
    || !Array.isArray(op.pendingFields) || op.pendingFields.length || !op.proposalDraft
    || !context?.caseId || !context.threadId || data.executionRequest?.input?.actionId) return data;
  const continuity = buildProposalReviewQuestion({ operational: op as ImobOperationalState,
    caseId: context.caseId, threadId: context.threadId, contextRef, ...scope });
  // Domain-owned summary; contacts and internal identifiers never enter the card.
  const draft = op.proposalDraft;
  const amount = typeof draft.offerAmount === "number" && Number.isFinite(draft.offerAmount)
    ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(draft.offerAmount) : "Não informado";
  const lines = [
    `Comprador: ${draft.buyerName ? "informado (identidade protegida)" : "não informado"}`,
    `Contato: ${draft.buyerEmail || draft.buyerPhone ? "informado (dados protegidos)" : "não informado"}`,
    `Imóvel: ${draft.propertyId ? "selecionado no caso (referência protegida)" : "não informado"}`,
    `Valor proposto: ${amount}`,
    `Tipo: ${({ sale: "venda", rent: "locação", management: "administração" } as Record<string, string>)[draft.contractType] ?? "não informado"}`,
    `Aprovação: ${draft.approvalRequired ? "necessária no fluxo próprio do caso" : "conforme o fluxo próprio do caso"}`,
  ];
  return { ...data, conversationState: { ...data.conversationState, operational: { ...op, continuity } },
    presentation: { ...data.presentation,
      text: "Confira o resumo do rascunho da proposta. Os dados apresentados estão corretos? Esta revisão não aprova nem executa nenhuma ação.",
      card: { title: "Revisão da proposta", lines } } };
}

/** Conversational branch: no helpers, provider, persistence, run or action dispatch. */
export function resolveProposalReviewReply(params: {
  message: string;
  replyRef: unknown;
  contextRef: unknown;
  threadState: any;
  caseId: string | null;
  threadId: string | null;
  reviewCase: ImobCrmCaseContext | null;
  reviewDraftRef: string | null;
  canonicalPendingAction: unknown;
  tenantId: string;
  workspaceId: string;
  userId?: string | null;
}) {
  const op = object(params.threadState?.operational);
  const continuity = parseProposalContinuity(op);
  const pending = continuity?.pending;
  const context = params.reviewCase;
  const valid = params.userId?.trim() && params.tenantId.trim() && params.workspaceId.trim()
    && isProposalReviewContextRef(params.contextRef) && pending && pending.contextRef === params.contextRef
    && params.replyRef === pending.ref && pending.ref === questionRef(pending, params)
    && pending.caseId === params.caseId && pending.threadId === params.threadId
    && context?.caseId === pending.caseId && context.threadId === pending.threadId
    && params.reviewDraftRef === pending.draftRef
    && context.flow === "proposal.create" && context.stage === "ready_for_review"
    && context.status === "ready_for_review";
  let next = valid ? continuity : null;
  let text = "Não há uma pergunta de revisão válida para esta resposta. Reabra a revisão da proposta; nenhuma ação foi executada.";
  const input = params.message.trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[.!?]+$/, "").trim();
  if (valid && pending) {
    if (input === IMOB_PROPOSAL_REVIEW_POLICY.changeTopicInput) {
      next = { ...continuity, pending: null };
      text = "Revisão da proposta pausada nesta conversa. O rascunho foi preservado; nenhuma ação foi confirmada ou cancelada. Qual assunto deseja tratar? A disponibilidade de outro domínio será verificada antes de qualquer encaminhamento.";
    } else if (input === IMOB_PROPOSAL_REVIEW_POLICY.continueReviewInput.normalize("NFD").replace(/\p{Diacritic}/gu, "")) {
      next = buildProposalReviewQuestion({ operational: op as ImobOperationalState, ...params,
        caseId: pending.caseId, threadId: pending.threadId, contextRef: pending.contextRef, phase: "review", expiresAt: pending.expiresAt });
      text = "Continuamos na revisão da proposta. Os dados apresentados estão corretos? Responda Sim ou Não. Nenhum dado foi alterado; esta resposta não aprova nem executa ações.";
    } else if ((IMOB_PROPOSAL_REVIEW_POLICY.cancelInputs as readonly string[]).includes(input)) {
      next = { ...continuity, pending: null };
      text = "Revisão da proposta encerrada nesta conversa. O rascunho foi preservado; nenhuma ação, negócio ou registro foi cancelado.";
    } else if (object(params.canonicalPendingAction)?.status === "awaiting_confirmation"
      || object(op?.pendingAction)?.status === "awaiting_confirmation") {
      text = "Há uma revisão de dados e uma ação pendente neste caso. Informe o dado que deseja revisar ou use a ação explícita do caso. Esta resposta não autoriza execução.";
    } else if (continuity.phase === "review" && (IMOB_PROPOSAL_REVIEW_POLICY.negativeInputs as readonly string[]).includes(input)) {
      next = buildProposalReviewQuestion({ operational: op as ImobOperationalState, ...params,
        caseId: pending.caseId, threadId: pending.threadId, contextRef: pending.contextRef, phase: "clarification", expiresAt: pending.expiresAt });
      text = "Qual dado ou condição da proposta precisa ser corrigido? Mantive o rascunho; nenhuma ação foi executada.";
    } else if (continuity.phase === "review" && (IMOB_PROPOSAL_REVIEW_POLICY.affirmativeInputs as readonly string[]).includes(input)) {
      next = { ...continuity, pending: null };
      text = "Entendido: você confirmou os dados apresentados da proposta. O rascunho foi preservado. Isso não aprova nem executa nenhuma ação; a aprovação segue pelo fluxo próprio do caso.";
    } else if (continuity.phase === "clarification" && input
      && !["sim", "nao", "ok", "confirmo", "confirmar", "pode executar", "pode seguir", "seguir"].includes(input)) {
      // Free text does not prove ownership or authorize editing. Keep the live question until an explicit choice.
      text = `Nenhum dado foi alterado. Para editar os dados, reabra Gerar proposta na barra Negócios. ${IMOB_PROPOSAL_REVIEW_POLICY.ambiguityPrompt}`;
    } else {
      text = continuity.phase === "review"
        ? `Estou perguntando apenas sobre os dados apresentados. ${IMOB_PROPOSAL_REVIEW_POLICY.ambiguityPrompt}`
        : `Indique qual dado ou condição precisa ser corrigido. ${IMOB_PROPOSAL_REVIEW_POLICY.ambiguityPrompt}`;
    }
  }
  return { mode: "consult", action: "crm.proposal.review", threadLabel: "Proposta",
    conversationState: { ...params.threadState, mode: "consult", operational: op ? { ...op, continuity: next } : null },
    caseContext: context, presentation: { text } };
}
