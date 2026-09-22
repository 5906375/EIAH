import { z } from "zod";
import { governedReasonCodeV1Schema, governedSha256V1Schema as hash, immutableArtifactRefV1Schema, provenanceV1Schema, sourceSnapshotRefV1Schema, humanAuthorityDecisionV1Schema } from "./governance.js";

const id = z.string().min(1);
const revision = z.number().int().safe().positive();
const visitRevision = z.number().int().safe().nonnegative();
export const oraculoTimestampSchema = z.string().datetime({ offset: true }).refine(v => !/\.\d{4}/.test(v) && Number.isFinite(Date.parse(v)), "millisecond precision required").transform(v => new Date(v).toISOString());
const time = oraculoTimestampSchema;
const snapshotRef = sourceSnapshotRefV1Schema.extend({ capturedAt: time });
const provenance = provenanceV1Schema.superRefine((v, ctx) => {
  v.sourceSnapshots.forEach((s, i) => { if (!time.safeParse(s.capturedAt).success) ctx.addIssue({ code: "custom", path: ["sourceSnapshots", i, "capturedAt"], message: "invalid typed timestamp" }); });
}).transform(v => ({ ...v, sourceSnapshots: v.sourceSnapshots.map(s => ({ ...s, capturedAt: new Date(s.capturedAt).toISOString() })) }));
const scope = { tenantId: id, workspaceId: id, mode: z.literal("SIMULATION") };
export const oraculoDomainRefSchema = z.object({ kind: z.enum(["DRIVER", "VEHICLE", "COMPANY", "CONTAINER", "LOCATION", "SOURCE", "DOCUMENT", "CRITERIA"]), id, revision }).strict();
const ref = oraculoDomainRefSchema;
const typed = (kind: z.infer<typeof ref>["kind"]) => ref.refine(v => v.kind === kind);
// Local adapter references, not extensions of the generic artifact enums.
const entityRef = z.object({ id, revision }).strict();
const observationRef = z.object({ observationId: id }).strict();
export const oraculoCredentialRefSchema = z.object({ credentialId: id, revision, contentHash: hash }).strict();
const credentialRef = oraculoCredentialRefSchema;
const artifact = immutableArtifactRefV1Schema.extend({ contentHash: hash });
const policyRef = z.object({ policyId: id, policyVersion: id }).strict();
function setOf<T extends z.ZodTypeAny>(schema: T, key: (v: z.infer<T>) => string) {
  return z.array(schema).superRefine((values, ctx) => {
    const seen = new Set<string>();
    values.forEach((v, i) => { const k = key(v); if (seen.has(k)) ctx.addIssue({ code: "custom", path: [i], message: "duplicate reference identity" }); seen.add(k); });
  });
}
const reasonCodes = setOf(governedReasonCodeV1Schema, value => value);
const credentials = setOf(credentialRef, v => JSON.stringify([v.credentialId, v.revision]));
const artifacts = setOf(artifact, v => JSON.stringify([v.artifactType, v.artifactId]));
const observations = setOf(observationRef, v => v.observationId);
const validity = z.discriminatedUnion("kind", [z.object({ kind: z.literal("INTERVAL"), startsAt: time, endsAt: time }).strict(), z.object({ kind: z.literal("UNDETERMINED") }).strict()]).refine(v => v.kind !== "INTERVAL" || v.startsAt < v.endsAt, "invalid interval");
const base = { schemaVersion: z.literal("oraculo.credential-content.v1"), ...scope, credentialId: id, revision, purpose: z.literal("SIMULATED_EMPTY_RETURN"), issuerRef: typed("SOURCE"), validity, provenance: provenance, contentHash: hash, artifactRef: artifact.optional(), supersedesRef: credentialRef.optional() };
export const oraculoCredentialContentV1Schema = z.discriminatedUnion("credentialType", [
  z.object({ ...base, credentialType: z.literal("DRIVER_LICENSE_CHECK"), subjectRef: typed("DRIVER"), claims: z.object({ documentRef: typed("DOCUMENT"), verificationResult: z.enum(["VERIFIED", "NOT_VERIFIED"]), authorizedActivity: z.literal("SIMULATED_YARD_DRIVING"), verifiedAt: time }).strict() }).strict(),
  z.object({ ...base, credentialType: z.literal("VEHICLE_INSPECTION"), subjectRef: typed("VEHICLE"), claims: z.object({ inspectedAt: time, inspectionResult: z.enum(["APPROVED", "REJECTED"]), criteriaRef: typed("CRITERIA"), inspectorRef: typed("SOURCE") }).strict() }).strict(),
  z.object({ ...base, credentialType: z.literal("COMPANY_LICENSE_CHECK"), subjectRef: typed("COMPANY"), claims: z.object({ documentRef: typed("DOCUMENT"), verificationResult: z.enum(["VERIFIED", "NOT_VERIFIED"]), permittedActivity: z.literal("SIMULATED_EMPTY_RETURN"), verifiedAt: time }).strict() }).strict(),
]);
export const oraculoCredentialStatusObservationV1Schema = z.object({ schemaVersion: z.literal("oraculo.credential-status-observation.v1"), ...scope, observationId: id, credentialRef, sourceRef: typed("SOURCE"), provenance: provenance, declaredStatus: z.enum(["ACTIVE", "SUSPENDED", "REVOKED", "UNKNOWN"]), observedAt: time, effectiveAt: time.optional(), freshnessPolicyRef: policyRef }).strict();
export const oraculoCredentialEvaluationV1Schema = z.object({ schemaVersion: z.literal("oraculo.credential-evaluation.v1"), ...scope, evaluationId: id, credentialRef, operationRef: entityRef, purpose: id, observationRefs: observations, sourceRefs: z.array(typed("SOURCE")), policyId: id, policyVersion: id, evaluatedAt: time, result: z.enum(["ACCEPTED_FOR_SIMULATION", "REJECTED", "INDETERMINATE", "HUMAN_REVIEW_REQUIRED"]), reasonCodes: reasonCodes, riskRefs: artifacts.optional(), authorityRefs: z.array(id).optional() }).strict().refine(v => v.result === "ACCEPTED_FOR_SIMULATION" || v.reasonCodes.length > 0, "impediment requires reasons");
export const oraculoGateIntentV1Schema = z.object({ schemaVersion: z.literal("oraculo.gate-intent.v1"), ...scope, intentId: id, operationId: id, visitId: id, locationRef: typed("LOCATION"), direction: z.enum(["IN", "OUT"]), expectedRevision: visitRevision, credentialRefs: credentials, actorRef: entityRef, receivedAt: time, previousIntentRef: id.optional(), evidenceRefs: artifacts.optional() }).strict();
const state = z.enum(["NOT_ENTERED", "INSIDE", "EXITED"]);
export const oraculoGateResultV1Schema = z.object({ schemaVersion: z.literal("oraculo.gate-result.v1"), ...scope, resultId: id, intentId: id, outcome: z.enum(["APPLIED", "DENIED", "REVIEW_REQUIRED", "CONFLICT", "FAILED"]), reasonCodes: reasonCodes, evaluationRefs: z.array(id), evidenceRefs: artifacts, recordedAt: time, previousState: state.optional(), nextState: state.optional(), previousRevision: visitRevision.optional(), nextRevision: visitRevision.optional(), runRef: artifact.optional(), eventRef: artifact.optional() }).strict().superRefine((v, ctx) => {
  const fields = [v.previousState, v.nextState, v.previousRevision, v.nextRevision];
  if (v.outcome === "APPLIED") {
    if (fields.some(x => x === undefined) || v.nextRevision !== v.previousRevision! + 1 || !((v.previousState === "NOT_ENTERED" && v.nextState === "INSIDE") || (v.previousState === "INSIDE" && v.nextState === "EXITED")) || !v.evaluationRefs.length) ctx.addIssue({ code: "custom", message: "invalid applied transition" });
  } else if (fields.some(x => x !== undefined) || !v.reasonCodes.length) ctx.addIssue({ code: "custom", message: "non-applied result requires reasons and no transition" });
});
export const oraculoGateApprovalContextV1Schema = z.object({ schemaVersion: z.literal("oraculo.gate-approval-context.v1"), canonicalizationVersion: z.literal("oraculo.canonical-json.v1"), ...scope, caseRef: entityRef, action: id, direction: z.enum(["IN", "OUT"]), operationRef: entityRef, visitRef: entityRef, locationRef: typed("LOCATION"), expectedRevision: visitRevision, credentialRefs: credentials, policyRefs: setOf(policyRef, v => JSON.stringify([v.policyId, v.policyVersion])), requesterBinding: entityRef, reviewedObservationRefs: observations, evidenceRefs: artifacts.optional(), snapshotRefs: setOf(snapshotRef, v => v.snapshotId).optional(), riskContextRef: artifact.optional() }).strict();
export const oraculoHumanDecisionV1Schema = humanAuthorityDecisionV1Schema.superRefine((v, ctx) => {
  for (const t of [v.decidedAt, v.validUntil].filter((t): t is string => t !== null)) if (!time.safeParse(t).success) ctx.addIssue({ code: "custom", message: "invalid approval timestamp" });
}).transform(v => ({ ...v, decidedAt: new Date(v.decidedAt).toISOString(), validUntil: v.validUntil === null ? null : new Date(v.validUntil).toISOString() }));
export const oraculoGateIntentTrackingV1Schema = z.object({ schemaVersion: z.literal("oraculo.gate-intent-tracking.v1"), intentId: id, mode: z.literal("SIMULATION"), state: z.enum(["ACCEPTED", "PROCESSING", "RECONCILING", "FINAL"]), acceptedAt: time, updatedAt: time, result: oraculoGateResultV1Schema.optional(), reasonCodes: reasonCodes.optional(), correlationRef: id.optional() }).strict().refine(v => v.updatedAt >= v.acceptedAt && (v.state === "FINAL" ? v.result !== undefined && v.result.intentId === v.intentId : v.result === undefined), "tracking/result mismatch");
export type OraculoCredentialContentV1 = z.infer<typeof oraculoCredentialContentV1Schema>;
export type OraculoGateIntentV1 = z.infer<typeof oraculoGateIntentV1Schema>;
export type OraculoGateApprovalContextV1 = z.infer<typeof oraculoGateApprovalContextV1Schema>;
