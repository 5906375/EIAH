import {
  AWAITING_DECISION_STATUS_VALUES,
  buildEvaluationTerms,
  decisionRequiresNote,
  grantTermsIntegrity,
  isEvaluationOfferEnabled,
  resolveVerticalUsage,
  termsAreCurrent,
  type EvaluationGrantGate,
  type EvaluationOfferState,
  type EvaluationTerms,
  type GrantRowLike,
  NO_EVALUATION_GRANT,
} from "./verticalEvaluationContract";

/**
 * Planejamento PURO das transições da avaliação. Cada função recebe a linha JÁ TRAVADA (relida dentro da transação) e devolve
 * o que fazer ou o motivo da recusa; o serviço só aplica o UPDATE condicional correspondente. Sem banco, sem relógio global,
 * sem ambiente: tudo entra por parâmetro (fixtures explícitas nos testes; produção passa a oferta real).
 */

export type PlanRow = GrantRowLike & {
  id: string;
  requestContext: unknown;
  recommendation: string | null;
};

// ─── Decisão humana ────────────────────────────────────────────────────────────────────────────────────────────
export type EvaluationDecisionErrorCode =
  | "NOT_FOUND"
  | "NOT_EVALUATION"
  | "OFFER_UNAVAILABLE"
  | "NOT_AWAITING_DECISION"
  | "NOTE_REQUIRED"
  | "SELF_DECISION_FORBIDDEN"
  | "TERMS_INVALID"
  | "CONFLICT";

export type EvaluationDecisionPlan =
  | { ok: false; code: EvaluationDecisionErrorCode; issues?: string[] }
  | { ok: true; kind: "refuse" }
  | { ok: true; kind: "propose"; terms: EvaluationTerms; hash: string; reproposal: boolean };

/**
 * `aprovar` PROPÕE termos (`pre_ativacao`): não é aceite, não é ativação e não libera uso. Decidível: pedido aguardando
 * decisão, ou termos propostos ainda não aceitos (reproposta). O aprovador nunca decide o próprio pedido.
 */
export function planEvaluationDecision(
  row: PlanRow | null,
  input: {
    decision: "aprovar" | "recusar";
    adminUserId: string | null;
    note: string | null;
    decisionInput: unknown;
    actor: string;
    decidedAt: Date;
    offer: EvaluationOfferState;
  },
): EvaluationDecisionPlan {
  if (!row) return { ok: false, code: "NOT_FOUND" };
  if (row.grantKind !== "evaluation") return { ok: false, code: "NOT_EVALUATION" };
  if (input.decision === "aprovar" && !isEvaluationOfferEnabled(input.offer)) return { ok: false, code: "OFFER_UNAVAILABLE" };
  if (!input.adminUserId || row.requestedByUserId === input.adminUserId) return { ok: false, code: "SELF_DECISION_FORBIDDEN" };
  const awaiting = (AWAITING_DECISION_STATUS_VALUES as readonly string[]).includes(row.status);
  const decidable = awaiting || (row.status === "pre_ativacao" && !row.grantAcceptedAt);
  if (!decidable) return { ok: false, code: "NOT_AWAITING_DECISION" };
  if (decisionRequiresNote(input.decision, row.recommendation as never) && !input.note) return { ok: false, code: "NOTE_REQUIRED" };
  if (input.decision === "recusar") return { ok: true, kind: "refuse" };
  if (!isEvaluationOfferEnabled(input.offer)) return { ok: false, code: "OFFER_UNAVAILABLE" };
  const built = buildEvaluationTerms({
    scope: { tenantId: row.tenantId, workspaceId: row.workspaceId },
    requestedByUserId: row.requestedByUserId,
    requestContext: row.requestContext,
    input: input.decisionInput,
    decidedBy: input.actor,
    decidedAt: input.decidedAt,
    offer: input.offer.config,
  });
  if (!built.ok) return { ok: false, code: "TERMS_INVALID", issues: built.issues };
  return { ok: true, kind: "propose", terms: built.terms, hash: built.hash, reproposal: row.status === "pre_ativacao" };
}

// ─── Aceite ────────────────────────────────────────────────────────────────────────────────────────────────────
export type EvaluationAcceptErrorCode =
  | "NOT_FOUND"
  | "OFFER_UNAVAILABLE"
  | "NOT_PENDING"
  | "NOT_REQUESTER"
  | "TERMS_MISMATCH"
  | "TERMS_STALE"
  | "CONFLICT";

export type EvaluationAcceptPlan =
  | { ok: false; code: EvaluationAcceptErrorCode; issues?: string[] }
  | { ok: true; outcome: "already_accepted" }
  | { ok: true; outcome: "accept"; terms: EvaluationTerms };

/**
 * Aceite da versão VIGENTE pelo solicitante. Não ativa nem libera uso. Exige: oferta habilitada, `pre_ativacao`, o solicitante
 * como autor, hash IGUAL ao dos termos gravados e termos ainda válidos sob a configuração vigente.
 */
export function planEvaluationAcceptance(
  row: PlanRow | null,
  input: { userId: string; termsHash: string; offer: EvaluationOfferState },
): EvaluationAcceptPlan {
  if (!row || row.grantKind !== "evaluation") return { ok: false, code: "NOT_FOUND" };
  if (!isEvaluationOfferEnabled(input.offer)) return { ok: false, code: "OFFER_UNAVAILABLE" };
  if (row.status !== "pre_ativacao") return { ok: false, code: "NOT_PENDING" };
  if (row.requestedByUserId !== input.userId) return { ok: false, code: "NOT_REQUESTER" };
  if (row.grantAcceptedAt) {
    return row.grantAcceptedHash === input.termsHash && row.grantAcceptedBy === input.userId
      ? { ok: true, outcome: "already_accepted" }
      : { ok: false, code: "CONFLICT" };
  }
  const integrity = grantTermsIntegrity(row);
  if (!integrity.ok) return { ok: false, code: "TERMS_STALE", issues: [integrity.reason] };
  const current = termsAreCurrent(integrity.terms, input.offer.config);
  if (!current.ok) return { ok: false, code: "TERMS_STALE", issues: current.issues };
  if (row.grantTermsHash !== input.termsHash) return { ok: false, code: "TERMS_MISMATCH" };
  return { ok: true, outcome: "accept", terms: integrity.terms };
}

// ─── Recusa pelo solicitante ───────────────────────────────────────────────────────────────────────────────────
export type EvaluationDeclinePlan =
  | { ok: false; code: "NOT_FOUND" | "NOT_PENDING" | "NOT_REQUESTER" }
  | { ok: true; outcome: "already_declined" | "decline" };

export function planEvaluationDecline(row: (PlanRow & { grantClosedReason: string | null }) | null, userId: string): EvaluationDeclinePlan {
  if (!row || row.grantKind !== "evaluation") return { ok: false, code: "NOT_FOUND" };
  if (row.status === "recusado" && row.grantClosedReason === "declined_by_requester") return { ok: true, outcome: "already_declined" };
  if (row.status !== "pre_ativacao") return { ok: false, code: "NOT_PENDING" };
  if (row.requestedByUserId !== userId) return { ok: false, code: "NOT_REQUESTER" };
  return { ok: true, outcome: "decline" };
}

// ─── Pedido ───────────────────────────────────────────────────────────────────────────────────────────────────
/** Estados em que o pedido já está com a EIAH e não precisa ser feito de novo (`pre_ativacao` inclui termos propostos/aceitos). */
export const OPEN_REQUEST_STATUS_VALUES = [...AWAITING_DECISION_STATUS_VALUES, "pre_ativacao"] as const;

export type VerticalRequestPlan =
  | { ok: false; outcome: "evaluation_unavailable" }
  | { ok: false; outcome: "already_approved" | "already_requested" | "evaluation_already_used" }
  | { ok: true };

/**
 * Guardas do pedido sobre a leitura EFETIVA da linha. Pedido de avaliação com oferta desligada/bloqueada/incompleta, ou para
 * outra vertical, não grava nada (também para chamadas internas). `aprovado` (inclusive pago) e pedido aberto nunca são
 * reescritos; uma avaliação já iniciada não se repete pelo pedido (decisão sobre repetição ainda não ratificada).
 */
export function planVerticalAccessRequest(input: {
  existing: { status: string; evaluationUsedAt: Date | null } | null;
  evaluation: boolean;
  vertical: string;
  offer: EvaluationOfferState;
}): VerticalRequestPlan {
  if (input.evaluation && (!isEvaluationOfferEnabled(input.offer) || input.vertical !== input.offer.config.vertical)) {
    return { ok: false, outcome: "evaluation_unavailable" };
  }
  const { existing } = input;
  if (existing?.status === "aprovado") return { ok: false, outcome: "already_approved" };
  if (existing && (OPEN_REQUEST_STATUS_VALUES as readonly string[]).includes(existing.status)) return { ok: false, outcome: "already_requested" };
  if (input.evaluation && existing?.evaluationUsedAt) return { ok: false, outcome: "evaluation_already_used" };
  return { ok: true };
}

// ─── Gate de uso (Agent Protocol, runs, worker, uploads) ───────────────────────────────────────────────────────
/**
 * Linha COM grant de avaliação (qualquer fase: pedido, em análise, recusado, termos, ativo, encerrado) só permite escrita
 * quando o acesso efetivo é `aprovado` e o uso é `full`; antes disso ou depois do fim, `allowed=false`. Sem grant: não se
 * aplica (comportamento legado). `row` deve ser a linha EFETIVA (a leitura já aplica validade e integridade).
 */
export function computeEvaluationGrantGate(row: { status: string; revocationMode: string | null; grantKind: string | null } | null): EvaluationGrantGate {
  if (!row?.grantKind) return NO_EVALUATION_GRANT;
  const usage = resolveVerticalUsage(row);
  return { applies: true, allowed: row.status === "aprovado" && usage === "full", usage };
}
