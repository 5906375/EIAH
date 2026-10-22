import test from "node:test";
import assert from "node:assert/strict";
import {
  deriveOraculoDecisionTriggers, oraculoDecisionInputV1Schema, oraculoDocumentReviewRequestV1Schema, oraculoPreparationRecordV1Schema,
  type OraculoEvidenceV1, type OraculoPreparationRecordV1,
} from "@eiah/contracts";
import { buildDocumentReview } from "./documentReview";
import { buildDecision, buildDecisionRequest, decisionBasisHash, decisionCoverage, deriveDecisionStates, PreparationDecisionError } from "./humanDecision";

// FD-E2E-004 (J17): regras puras da decisão humana do caso — gatilhos, base exata, solicitação, decisão, obsolescência, duplicidade e independência.
const evidence: OraculoEvidenceV1 = { documentId: "document-a", kind: "receipt", sourceDescription: "Synthetic", fileName: "eir.txt", mimeType: "text/plain", sizeBytes: 10, sha256: "a".repeat(64), uploadedAt: "2026-10-17T10:00:00.000Z", linkedAt: "2026-10-17T10:01:00.000Z", linkedBy: "uploader", reviewStatus: "unreviewed" };
const record = (over: Partial<OraculoPreparationRecordV1> = {}): OraculoPreparationRecordV1 => oraculoPreparationRecordV1Schema.parse({
  schemaVersion: "oraculo.empty-return-preparation.v1", caseType: "ORACULO_EMPTY_RETURN_PREPARATION_V1", caseId: "case-a", tenantId: "tenant-a", workspaceId: "workspace-a", revision: 2, lifecycle: "DISCOVERY",
  context: { port: { status: "informed", value: "Porto A" }, depot: { status: "informed", value: "Depósito A" }, flow: { status: "informed", value: "Devolução" } },
  operationReference: { containerNumber: "MSCU1234567", returnDate: "2026-10-17" }, evidences: [evidence],
  createdAt: "2026-10-17T10:00:00.000Z", updatedAt: "2026-10-17T10:01:00.000Z", executionAllowed: false, authorizationState: "NOT_REQUESTED", externalTransmissionAllowed: false, ...over,
});
const reviewOf = (current: OraculoPreparationRecordV1, observations: Record<string, string | undefined>) => buildDocumentReview(current, evidence, oraculoDocumentReviewRequestV1Schema.parse({
  documentId: evidence.documentId, expectedRevision: current.revision, acknowledgedDocumentRead: true, locator: "Página 1", notes: "Transcrição humana de teste",
  observations: Object.fromEntries(Object.entries({ containerNumber: "MSCU1234567", port: "Porto A", depot: "Depósito A", returnDate: "2026-10-17", movement: "empty_return", ...observations }).filter(([, value]) => value !== undefined)),
}), "reviewer-a");
const dispensedFlow = () => record({ context: { port: { status: "informed", value: "Porto A" }, depot: { status: "informed", value: "Depósito A" }, flow: { status: "not_applicable", justification: "Não se aplica nesta operação" } } });
const decisionInput = (requestId: string, over = {}) => oraculoDecisionInputV1Schema.parse({ requestId, expectedRevision: 3, decision: "approved", note: "Analisado pelo responsável", acknowledgedBasisRead: true, ...over });
const withRequest = (current: OraculoPreparationRecordV1, actor = "ana") => {
  const request = buildDecisionRequest(current, { expectedRevision: current.revision }, actor);
  return { request, next: record({ ...current, humanDecisions: [...current.humanDecisions ?? [], request], revision: current.revision + 1 }) };
};
const blocked = (fn: () => unknown, status: number, subreason: string) => assert.throws(fn, (error: unknown) => error instanceof PreparationDecisionError && error.status === status && error.subreason === subreason);

test("gatilhos: campo dispensado e a ÚLTIMA conferência divergente/indeterminada; conferência coerente posterior desfaz o gatilho", () => {
  assert.deepEqual(deriveOraculoDecisionTriggers(record()), []);
  assert.deepEqual(deriveOraculoDecisionTriggers(dispensedFlow()).map((t) => t.key), ["context:flow"]);
  const divergent = reviewOf(record(), { containerNumber: "MSCU7654321" });
  const withDivergence = record({ contentReviews: [divergent] });
  const [trigger] = deriveOraculoDecisionTriggers(withDivergence);
  assert.equal(trigger?.kind, "document_review");
  assert.equal(trigger?.key, `review:document-a:${divergent.id}`);
  const indeterminate = record({ contentReviews: [reviewOf(record(), { depot: undefined })] });
  assert.equal(deriveOraculoDecisionTriggers(indeterminate).length, 1);
  const fixed = record({ contentReviews: [divergent, reviewOf(record(), {})] });
  assert.deepEqual(deriveOraculoDecisionTriggers(fixed), [], "a última conferência vale");
});

test("base: muda com contexto/referência/documento/conferência; NÃO muda com revisão, data ou com os próprios eventos de decisão", () => {
  const current = dispensedFlow();
  const base = decisionBasisHash(current);
  assert.match(base, /^[a-f0-9]{64}$/);
  assert.equal(decisionBasisHash({ ...current, revision: 40, updatedAt: "2026-12-01T00:00:00.000Z" }), base);
  const { next } = withRequest(current);
  assert.equal(decisionBasisHash(next), base, "pedir a decisão não muda a base");
  for (const changed of [
    { ...current, context: { ...current.context, port: { status: "informed" as const, value: "Porto B" } } },
    { ...current, operationReference: { containerNumber: "OUTRO0000001" } },
    { ...current, evidences: [{ ...evidence, sha256: "b".repeat(64) }] },
    { ...current, contentReviews: [reviewOf(current, {})] },
  ]) assert.notEqual(decisionBasisHash(changed), base);
});

test("solicitação: exige gatilho, prende caso e revisão, é única por base e não autoriza nada", () => {
  blocked(() => buildDecisionRequest(record(), { expectedRevision: 2 }, "ana"), 409, "no_decision_needed");
  const current = dispensedFlow();
  const { request, next } = withRequest(current);
  assert.equal(request.caseId, "case-a"); assert.equal(request.basedOnRevision, 2);
  assert.deepEqual(request.triggers, ["context:flow"]);
  assert.equal(request.operationalAuthorization, false); assert.equal(request.requestedBy, "ana");
  blocked(() => buildDecisionRequest(next, { expectedRevision: next.revision }, "ana"), 409, "already_requested");
  blocked(() => buildDecisionRequest(next, { expectedRevision: next.revision }, "outra"), 409, "already_requested");
  assert.equal(decisionCoverage(next), "pending");
  assert.equal(decisionCoverage(record()), "no_decision_needed");
  assert.equal(decisionCoverage(current), "none");
});

test("decisão: aprovada/rejeitada/complementação registram sem autorizar; quem pediu não decide; decidida não repete", () => {
  for (const value of ["approved", "rejected", "more_information"] as const) {
    const { request, next } = withRequest(dispensedFlow());
    const decision = buildDecision(next, decisionInput(request.id, { decision: value }), "bruno");
    assert.equal(decision.decision, value); assert.equal(decision.decidedBy, "bruno"); assert.equal(decision.requestId, request.id);
    assert.equal(decision.basisHash, request.basisHash);
    for (const flag of ["operationalAuthorization", "executionAuthorization", "responsibilityClosure", "costClosure"] as const) assert.equal(decision[flag], false);
    const after = record({ ...next, humanDecisions: [...next.humanDecisions!, decision], revision: next.revision + 1 });
    assert.equal(deriveDecisionStates(after)[0]?.status, value);
    assert.equal(decisionCoverage(after), value);
    blocked(() => buildDecision(after, decisionInput(request.id, { expectedRevision: after.revision }), "carla"), 409, "already_decided");
    // decidida e sem mudança na base: pedir de novo é duplicidade
    blocked(() => buildDecisionRequest(after, { expectedRevision: after.revision }, "ana"), 409, "already_requested");
  }
  const { request, next } = withRequest(dispensedFlow(), "ana");
  blocked(() => buildDecision(next, decisionInput(request.id), "ana"), 403, "decider_not_independent");
  blocked(() => buildDecision(next, decisionInput("inexistente"), "bruno"), 409, "request_not_found");
  assert.equal(oraculoDecisionInputV1Schema.safeParse({ ...decisionInput(request.id), acknowledgedBasisRead: false }).success, false);
  assert.equal(oraculoDecisionInputV1Schema.safeParse({ ...decisionInput(request.id), note: "   " }).success, false);
  assert.equal(oraculoDecisionInputV1Schema.safeParse({ ...decisionInput(request.id), decision: "authorize_execution" }).success, false);
  assert.equal(oraculoDecisionInputV1Schema.safeParse({ ...decisionInput(request.id), operationalAuthorization: true }).success, false, "o cliente não injeta autoridade");
});

test("revisão obsoleta: mudar o caso depois do pedido invalida a decisão; pedir de novo na base nova é permitido", () => {
  const { request, next } = withRequest(dispensedFlow());
  const changed = record({ ...next, context: { ...next.context, port: { status: "informed", value: "Porto B" } }, revision: next.revision + 1 });
  assert.equal(deriveDecisionStates(changed)[0]?.status, "obsolete");
  assert.equal(decisionCoverage(changed), "obsolete");
  blocked(() => buildDecision(changed, decisionInput(request.id, { expectedRevision: changed.revision }), "bruno"), 409, "request_obsolete");
  const again = buildDecisionRequest(changed, { expectedRevision: changed.revision }, "ana");
  assert.notEqual(again.basisHash, request.basisHash);
  // decisão já registrada continua histórica, mas a base atual voltou a ficar sem cobertura
  const decision = buildDecision(next, decisionInput(request.id), "bruno");
  const decided = record({ ...next, humanDecisions: [...next.humanDecisions!, decision], revision: next.revision + 1 });
  const edited = record({ ...decided, context: { ...decided.context, depot: { status: "informed", value: "Depósito B" } }, revision: decided.revision + 1 });
  const [state] = deriveDecisionStates(edited);
  assert.equal(state?.status, "approved"); assert.equal(state?.basisCurrent, false);
  assert.equal(decisionCoverage(edited), "none", "a aprovação antiga não cobre a base nova");
});

test("compatibilidade: registro sem decisões mantém o mesmo contrato e o hash histórico (campo opcional sem default)", () => {
  const parsed = oraculoPreparationRecordV1Schema.parse(record());
  assert.equal("humanDecisions" in parsed, false);
});
