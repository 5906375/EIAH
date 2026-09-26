import { randomUUID } from "node:crypto";
import { oraculoGateResultV1Schema, oraculoCredentialEvaluationV1Schema } from "@eiah/contracts";
import { assertActiveReasonCode } from "../../../../../../packages/core/src/reasons/reasonCatalog.js";
import { S1_NEGATIVE_MAPPING_PROPOSALS } from "./negativeMappingProposal.js";
import type { S1Assessment, S1Snapshot } from "./evaluation.js";

/** No retries, no re-evaluation, no inferred proof of a failed commit. */
export function buildNegativeFinalization(snapshot: S1Snapshot, assessment: S1Assessment) {
  if (snapshot.mode !== "SIMULATION" || assessment.mode !== "SIMULATION" || assessment.applied !== false || assessment.disposition === "ELIGIBLE_FOR_SIMULATION" || assessment.findings.length !== 1) return null;
  const mapping = S1_NEGATIVE_MAPPING_PROPOSALS.find(m => m.finding === assessment.findings[0]);
  if (!mapping || mapping.target !== "C5" || mapping.requiresNoEffectProof || !mapping.outcome) return null;
  assertActiveReasonCode(mapping.candidateCode);
  const reasonCodes = [mapping.candidateCode];
  const evaluations = [];
  // Only an explicitly attributed finding creates a credential evaluation.
  // Legacy aggregate findings must never be retroactively assigned to a credential.
  if (assessment.credentialRef) {
    const credentialRef = snapshot.intent.credentialRefs.find(c => c.credentialId === assessment.credentialRef!.credentialId && c.revision === assessment.credentialRef!.revision && c.contentHash === assessment.credentialRef!.contentHash);
    if (!credentialRef) throw new Error("NEGATIVE_CREDENTIAL_BINDING_MISMATCH");
    const observations = snapshot.observations.filter(o => o.credentialRef.credentialId === credentialRef.credentialId && o.credentialRef.revision === credentialRef.revision && o.credentialRef.contentHash === credentialRef.contentHash);
    evaluations.push(oraculoCredentialEvaluationV1Schema.parse({
      schemaVersion: "oraculo.credential-evaluation.v1", mode: "SIMULATION",
      tenantId: snapshot.tenantId, workspaceId: snapshot.workspaceId, evaluationId: randomUUID(), credentialRef,
      operationRef: { id: snapshot.visit.operationId, revision: snapshot.visit.operationRevision }, purpose: "SIMULATED_EMPTY_RETURN",
      observationRefs: observations.map(o => ({ observationId: o.observationId })),
      sourceRefs: [...new Map(observations.map(o => [JSON.stringify(o.sourceRef), o.sourceRef])).values()],
      policyId: snapshot.policy, policyVersion: "1", evaluatedAt: snapshot.evaluatedAt,
      result: mapping.outcome === "DENIED" ? "REJECTED" : "INDETERMINATE", reasonCodes,
    }));
  }
  const result = oraculoGateResultV1Schema.parse({
    schemaVersion: "oraculo.gate-result.v1", mode: "SIMULATION", tenantId: snapshot.tenantId, workspaceId: snapshot.workspaceId,
    resultId: randomUUID(), intentId: snapshot.intent.intentId, outcome: mapping.outcome, reasonCodes,
    evaluationRefs: evaluations.map(e => e.evaluationId), evidenceRefs: snapshot.intent.evidenceRefs ?? [], recordedAt: new Date().toISOString(),
  });
  return { result, evaluations };
}
