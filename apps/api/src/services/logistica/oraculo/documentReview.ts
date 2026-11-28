import { createHash, randomUUID } from "node:crypto";
import { oraculoDocumentReviewV1Schema, type OraculoDocumentCheckV1, type OraculoDocumentReviewRequestV1, type OraculoDocumentReviewV1, type OraculoEvidenceV1, type OraculoPreparationRecordV1 } from "@eiah/contracts";
import { canonicalizeGovernedJsonV1 } from "../preDuimpGovernedCaseCanonicalization";

/** Bind the attestation to this case, its declared reference and the exact linked file, not to future context. */
export function documentReviewBindingHash(current: OraculoPreparationRecordV1, evidence: OraculoEvidenceV1) {
  return createHash("sha256").update(canonicalizeGovernedJsonV1({
    caseId: current.caseId, tenantId: current.tenantId, workspaceId: current.workspaceId,
    context: current.context, operationReference: current.operationReference ?? {},
    documentId: evidence.documentId, documentSha256: evidence.sha256, kind: evidence.kind,
  })).digest("hex");
}
const normalized = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toUpperCase();
const container = (value: string) => normalized(value).replace(/[\s-]/g, "");
export function compareDocumentObservations(current: OraculoPreparationRecordV1, input: OraculoDocumentReviewRequestV1) {
  const checks: OraculoDocumentCheckV1[] = [];
  const compare = (field: OraculoDocumentCheckV1["field"], expected: string | undefined, observed: string | undefined, mandatoryReference = false) => {
    const values = { field, ...(expected ? { expected } : {}), ...(observed ? { observed } : {}) };
    checks.push({ ...values, status: !expected ? mandatoryReference ? "reference_missing" : "not_assessed"
      : !observed ? "not_observed" : (field === "containerNumber" ? container(expected) === container(observed) : normalized(expected) === normalized(observed)) ? "matches" : "diverges" });
  };
  compare("containerNumber", current.operationReference?.containerNumber, input.observations.containerNumber, true);
  for (const field of ["port", "depot"] as const) {
    const reference = current.context[field];
    if (reference.status === "to_confirm" || reference.status === "not_applicable") {
      checks.push({ field, status: "reference_unconfirmed", ...("value" in reference && reference.value ? { expected: reference.value } : {}), ...(input.observations[field] ? { observed: input.observations[field] } : {}) });
    } else compare(field, reference.status === "informed" ? reference.value : undefined, input.observations[field]);
  }
  compare("returnDate", current.operationReference?.returnDate, input.observations.returnDate);
  checks.push({ field: "movement", expected: "empty_return", observed: input.observations.movement,
    status: input.observations.movement === "not_identified" ? "not_observed" : input.observations.movement === "empty_return" ? "matches" : "diverges" });
  const outcome = checks.some((check) => check.status === "diverges") ? "divergent"
    : checks.some((check) => ["reference_missing", "reference_unconfirmed", "not_observed"].includes(check.status)) ? "indeterminate" : "consistent_in_checked_fields";
  return { outcome, checks } as const;
}
export function buildDocumentReview(current: OraculoPreparationRecordV1, evidence: OraculoEvidenceV1, input: OraculoDocumentReviewRequestV1, actorRef: string): OraculoDocumentReviewV1 {
  return oraculoDocumentReviewV1Schema.parse({
    // Parsed below from explicitly selected fields: never accept caller-provided authority or result.
    schemaVersion: "oraculo.document-review.v1", id: randomUUID(),
    caseId: current.caseId, tenantId: current.tenantId, workspaceId: current.workspaceId,
    documentId: evidence.documentId, acknowledgedDocumentRead: input.acknowledgedDocumentRead,
    observations: input.observations, locator: input.locator, notes: input.notes,
    documentSha256: evidence.sha256, basedOnRevision: current.revision,
    bindingHash: documentReviewBindingHash(current, evidence), reviewedBy: actorRef, reviewedAt: new Date().toISOString(),
    method: "human_transcription", ...compareDocumentObservations(current, input),
    operationalAuthorization: false, responsibilityClosure: false, costClosure: false,
  });
}
