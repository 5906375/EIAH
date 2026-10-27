import { createHash, randomUUID } from "node:crypto";
import {
  deriveOraculoDecisionTriggers, oraculoDecisionBasis, oraculoDecisionRecordV1Schema, oraculoDecisionRequestV1Schema,
  type OraculoDecisionInputV1, type OraculoDecisionRecordV1, type OraculoDecisionRequestInputV1, type OraculoDecisionRequestStatus,
  type OraculoDecisionRequestV1, type OraculoPreparationRecordV1,
} from "@eiah/contracts";
import { canonicalizeGovernedJsonV1 } from "../preDuimpGovernedCaseCanonicalization";

/** Decisão humana do caso (FD-E2E-004): regras puras sobre o registro; a autoridade (política/membro) é conferida na rota. */
export class PreparationDecisionError extends Error {
  constructor(readonly status: 403 | 409, readonly code: "ORACULO_DECISION_BLOCKED" | "ORACULO_DECISION_DENIED", readonly subreason: string) { super(subreason); }
}

/**
 * Elegibilidade PROVISÓRIA do J17 (FD-E2E-004/005): enquanto não existe designação legítima do responsável (D1–D4), "quem pode decidir"
 * é calculado a partir da política do workspace e só vale em dev/test. Fora disso (produção/staging) nenhuma decisão é apresentada nem
 * aceita como autorizada: fail-closed. Lido a cada chamada (testável); não concede nada.
 */
export const provisionalDecisionEligibilityEnabled = () => ["test", "development"].includes(process.env.NODE_ENV ?? "");

export const decisionBasisHash = (record: OraculoPreparationRecordV1) =>
  createHash("sha256").update(canonicalizeGovernedJsonV1(oraculoDecisionBasis(record))).digest("hex");

const requestsOf = (record: OraculoPreparationRecordV1) => (record.humanDecisions ?? []).filter((event): event is OraculoDecisionRequestV1 => event.kind === "requested");
const decisionsOf = (record: OraculoPreparationRecordV1) => (record.humanDecisions ?? []).filter((event): event is OraculoDecisionRecordV1 => event.kind === "decided");

export type DecisionRequestState = {
  request: OraculoDecisionRequestV1;
  decision: OraculoDecisionRecordV1 | null;
  status: OraculoDecisionRequestStatus;
  /** A base do caso ainda é a da solicitação (a decisão registrada, se houver, continua valendo para o caso como está). */
  basisCurrent: boolean;
};

export function deriveDecisionStates(record: OraculoPreparationRecordV1): DecisionRequestState[] {
  const current = decisionBasisHash(record);
  const decisions = decisionsOf(record);
  return requestsOf(record).map((request) => {
    const decision = decisions.find((item) => item.requestId === request.id) ?? null;
    const basisCurrent = request.basisHash === current;
    return { request, decision, basisCurrent, status: decision ? decision.decision : basisCurrent ? "pending" : "obsolete" };
  });
}

/** Cobertura da base ATUAL do caso: o que vale para os itens que exigem decisão agora. */
export function decisionCoverage(record: OraculoPreparationRecordV1): "no_decision_needed" | "none" | OraculoDecisionRequestStatus {
  if (!deriveOraculoDecisionTriggers(record).length) return "no_decision_needed";
  const states = deriveDecisionStates(record);
  const covering = states.filter((state) => state.basisCurrent).at(-1);
  // `obsolete`: o ÚLTIMO pedido ficou sem decisão e a base mudou (precisa pedir de novo); `none`: nenhum pedido vale para a base atual.
  return covering ? covering.status : states.at(-1)?.status === "obsolete" ? "obsolete" : "none";
}

export function buildDecisionRequest(current: OraculoPreparationRecordV1, input: OraculoDecisionRequestInputV1, actorRef: string): OraculoDecisionRequestV1 {
  const triggers = deriveOraculoDecisionTriggers(current);
  if (!triggers.length) throw new PreparationDecisionError(409, "ORACULO_DECISION_BLOCKED", "no_decision_needed");
  if ((current.humanDecisions?.length ?? 0) >= 100) throw new PreparationDecisionError(409, "ORACULO_DECISION_BLOCKED", "decision_limit");
  const basisHash = decisionBasisHash(current);
  // Uma solicitação por base: repetir o pedido (ou pedir de novo depois de decidido) sem mudar o caso é duplicidade.
  if (requestsOf(current).some((request) => request.basisHash === basisHash)) throw new PreparationDecisionError(409, "ORACULO_DECISION_BLOCKED", "already_requested");
  return oraculoDecisionRequestV1Schema.parse({
    schemaVersion: "oraculo.decision-request.v1", kind: "requested", id: randomUUID(),
    caseId: current.caseId, tenantId: current.tenantId, workspaceId: current.workspaceId,
    basedOnRevision: current.revision, basisHash, triggers: triggers.map((trigger) => trigger.key),
    ...(input.note ? { note: input.note } : {}),
    requestedBy: actorRef, requestedAt: new Date().toISOString(), operationalAuthorization: false,
  });
}

export function buildDecision(current: OraculoPreparationRecordV1, input: OraculoDecisionInputV1, actorRef: string): OraculoDecisionRecordV1 {
  const state = deriveDecisionStates(current).find((item) => item.request.id === input.requestId);
  if (!state) throw new PreparationDecisionError(409, "ORACULO_DECISION_BLOCKED", "request_not_found");
  if (state.decision) throw new PreparationDecisionError(409, "ORACULO_DECISION_BLOCKED", "already_decided");
  if (!state.basisCurrent) throw new PreparationDecisionError(409, "ORACULO_DECISION_BLOCKED", "request_obsolete");
  // Independência: quem pediu não decide o próprio pedido.
  if (state.request.requestedBy === actorRef) throw new PreparationDecisionError(403, "ORACULO_DECISION_DENIED", "decider_not_independent");
  return oraculoDecisionRecordV1Schema.parse({
    schemaVersion: "oraculo.decision.v1", kind: "decided", id: randomUUID(), requestId: state.request.id,
    caseId: current.caseId, tenantId: current.tenantId, workspaceId: current.workspaceId,
    basedOnRevision: current.revision, basisHash: state.request.basisHash,
    decision: input.decision, note: input.note, acknowledgedBasisRead: input.acknowledgedBasisRead,
    decidedBy: actorRef, decidedAt: new Date().toISOString(),
    operationalAuthorization: false, executionAuthorization: false, responsibilityClosure: false, costClosure: false,
  });
}
