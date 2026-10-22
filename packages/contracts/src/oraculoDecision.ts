import type { OraculoPreparationRecordV1 } from "./oraculoPreparation.js";

/**
 * FD-E2E-004 — o que exige decisão humana, derivado SÓ do registro do caso (puro, sem rede e sem hash: serve ao servidor, que valida,
 * e à tela, que apresenta). Os gatilhos são os mesmos que a jornada já mostrava como "exige decisão humana":
 *  - campo do contexto dispensado com justificativa (`not_applicable`);
 *  - última conferência de um documento divergente ou indeterminada.
 */
export type OraculoDecisionTrigger =
  | { key: string; kind: "context_field"; field: "port" | "depot" | "flow" }
  | { key: string; kind: "document_review"; documentId: string; reviewId: string; outcome: "divergent" | "indeterminate" };

const CONTEXT_FIELDS = ["port", "depot", "flow"] as const;

function latestReviewByDocument(record: OraculoPreparationRecordV1) {
  const reviews = record.contentReviews ?? [];
  return (record.evidences ?? []).flatMap((evidence) => {
    const latest = [...reviews].reverse().find((review) => review.documentId === evidence.documentId);
    return latest ? [{ evidence, review: latest }] : [];
  });
}

export function deriveOraculoDecisionTriggers(record: OraculoPreparationRecordV1): OraculoDecisionTrigger[] {
  const triggers: OraculoDecisionTrigger[] = [];
  for (const field of CONTEXT_FIELDS) {
    if (record.context[field].status === "not_applicable") triggers.push({ key: `context:${field}`, kind: "context_field", field });
  }
  for (const { evidence, review } of latestReviewByDocument(record)) {
    if (review.outcome === "divergent" || review.outcome === "indeterminate") {
      triggers.push({ key: `review:${evidence.documentId}:${review.id}`, kind: "document_review", documentId: evidence.documentId, reviewId: review.id, outcome: review.outcome });
    }
  }
  return triggers;
}

/**
 * Base EXATA sobre a qual uma decisão vale: contexto, referência, documentos (por hash) e últimas conferências. Qualquer mudança nela
 * deixa a solicitação obsoleta. Exclui de propósito `revision`, `updatedAt` e os próprios eventos de decisão (pedir ou decidir não
 * muda a base). O servidor aplica o hash canônico sobre este objeto.
 */
export function oraculoDecisionBasis(record: OraculoPreparationRecordV1) {
  return {
    caseId: record.caseId, tenantId: record.tenantId, workspaceId: record.workspaceId,
    context: record.context, operationReference: record.operationReference ?? {},
    evidences: (record.evidences ?? []).map((evidence) => ({ documentId: evidence.documentId, sha256: evidence.sha256, kind: evidence.kind })),
    reviews: latestReviewByDocument(record).map(({ review }) => ({ documentId: review.documentId, reviewId: review.id, bindingHash: review.bindingHash, outcome: review.outcome })),
    triggers: deriveOraculoDecisionTriggers(record).map((trigger) => trigger.key),
  };
}

/** Estado de uma solicitação, dado se a base atual do caso ainda é a dela. */
export type OraculoDecisionRequestStatus = "pending" | "obsolete" | "approved" | "rejected" | "more_information";

/** Visão da decisão humana que o servidor devolve ao cartão da conversa (sem ids de pessoas: só "você" ou "outro responsável"). */
export type OraculoDecisionCoverage = "no_decision_needed" | "none" | OraculoDecisionRequestStatus;
export type OraculoDecisionRequestBlockedReason = "read_only" | "no_decision_needed" | "already_requested" | "no_eligible_decider";
/** Por que ESTE usuário não pode decidir agora (a visão não promete ação autorizada sem designação/política). */
export type OraculoDecisionDecideBlockedReason = "read_only" | "policy_absent" | "not_designated";
export type OraculoDecisionViewV1 = {
  caseId: string;
  revision: number;
  coverage: OraculoDecisionCoverage;
  triggers: OraculoDecisionTrigger[];
  requests: Array<{
    id: string; status: OraculoDecisionRequestStatus; basisCurrent: boolean; basedOnRevision: number; requestedAt: string;
    requestedByYou: boolean; triggers: string[]; note?: string;
    decision?: { id: string; value: "approved" | "rejected" | "more_information"; note: string; decidedAt: string; decidedByYou: boolean; basedOnRevision: number };
  }>;
  eligibility: { requestAllowed: boolean; requestBlockedReason: OraculoDecisionRequestBlockedReason | null; deciderAvailable: boolean; decideAllowed: boolean; decideBlockedReason?: OraculoDecisionDecideBlockedReason | null };
  operationalAuthorization: "not_granted";
};

/**
 * FD-E2E-005 — caixa de pendências do Front Door: leitura entre os casos do MESMO tenant/workspace autenticado. `awaitingYou` só é
 * preenchida para quem pode decidir (mesma elegibilidade da decisão, nunca por ser apenas membro); `yours` são os pedidos do próprio usuário.
 * Sem ids de pessoas e sem conteúdo de documentos.
 */
export type OraculoDecisionInboxItemV1 = {
  caseId: string; requestId: string; status: OraculoDecisionRequestStatus; basisCurrent: boolean;
  basedOnRevision: number; currentRevision: number; requestedAt: string; triggers: string[]; note?: string;
  decision?: { value: "approved" | "rejected" | "more_information"; note: string; decidedAt: string };
};
export type OraculoDecisionInboxV1 = {
  awaitingYou: OraculoDecisionInboxItemV1[];
  yours: OraculoDecisionInboxItemV1[];
  eligibility: { canDecide: boolean; reason: OraculoDecisionDecideBlockedReason | null };
  limits: { casesScanned: number; maxCases: number };
  operationalAuthorization: "not_granted";
};
