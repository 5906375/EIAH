import { z } from "zod";
import { oraculoGateIntentV1Schema, oraculoCredentialContentV1Schema, oraculoCredentialStatusObservationV1Schema, oraculoDomainRefSchema, oraculoTimestampSchema, oraculoGateApprovalContextV1Schema, oraculoHumanDecisionV1Schema, sourceSnapshotRefV1Schema, immutableArtifactRefV1Schema, governedSha256V1Schema } from "@eiah/contracts";
import { canonicalize, hashContent, hashApprovalContext, hashArtifact, normalizeApprovalContext } from "./canonicalization.js";

const id = z.string().min(1);
const revision = z.number().int().safe().nonnegative();
const time = oraculoTimestampSchema;
const scope = { tenantId: id, workspaceId: id };
const ref = oraculoDomainRefSchema;
const proof = z.object({ ...scope, operationId: id, visitId: id, containerRef: ref, locationRef: ref, occurredAt: time, recordedAt: time, attesterRef: ref, artifactId: id, contentHash: z.string(), content: z.string() }).strict();
export const s1SnapshotSchema = z.object({
  mode: z.literal("SIMULATION"), ...scope, evaluatedAt: time,
  policy: z.enum(["sim-return-basic.v1", "sim-return-hitl.v1"]),
  intent: oraculoGateIntentV1Schema,
  visit: z.object({ ...scope, caseId: id, caseRevision: revision, visitId: id, operationId: id, operationRevision: revision, revision, state: z.enum(["NOT_ENTERED", "INSIDE", "EXITED"]), locationRef: ref, driverRef: ref, vehicleRef: ref, companyRef: ref, containerRef: ref, enteredAt: time.optional() }).strict(),
  credentials: z.array(oraculoCredentialContentV1Schema),
  observations: z.array(oraculoCredentialStatusObservationV1Schema).superRefine((values, ctx) => {
    const seen = new Set<string>();
    values.forEach((value, index) => {
      if (seen.has(value.observationId)) ctx.addIssue({ code: "custom", path: [index, "observationId"], message: "duplicate observation identity" });
      seen.add(value.observationId);
    });
  }),
  snapshotRefs: z.array(sourceSnapshotRefV1Schema).optional(),
  riskContextRef: immutableArtifactRefV1Schema.extend({ contentHash: governedSha256V1Schema }).optional(),
  // These are resolved synthetic origin snapshots, not payload assertions of real authority.
  origins: z.array(z.object({ ...scope, credentialId: id, credentialRevision: revision, originRef: ref, sourceRef: ref, observedAt: time, status: z.enum(["ACTIVE", "REVOKED", "SUSPENDED", "UNKNOWN"]) }).strict()),
  returnProof: proof.optional(),
  approvalContext: oraculoGateApprovalContextV1Schema.optional(),
  approval: oraculoHumanDecisionV1Schema.optional(),
}).strict();

export type S1Snapshot = z.infer<typeof s1SnapshotSchema>;
export type S1Assessment = { mode: "SIMULATION"; disposition: "ELIGIBLE_FOR_SIMULATION" | "DENIED" | "INDETERMINATE" | "REVIEW_REQUIRED" | "CONFLICT"; applied: false; findings: string[]; };
const same = (a: unknown, b: unknown) => canonicalize(a) === canonicalize(b);
const source = (id: string) => ({ kind: "SOURCE", id, revision: 1 });
/** Pure, internal synthetic assessment. Never a C5 commit result or operational authorization. */
export function evaluateResolvedS1(input: unknown): S1Assessment {
  const result = (disposition: S1Assessment["disposition"], ...findings: string[]): S1Assessment => ({ mode: "SIMULATION", disposition, applied: false, findings });
  const parsed = s1SnapshotSchema.safeParse(input);
  if (!parsed.success) return result("DENIED", "RV01");
  const s = parsed.data; const i = s.intent; const v = s.visit; const now = s.evaluatedAt;
  try { canonicalize(s); } catch { return result("DENIED", "RV01"); }
  const inScope = (x: { tenantId: string; workspaceId: string }) => x.tenantId === s.tenantId && x.workspaceId === s.workspaceId;
  if (![i, v, ...s.credentials, ...s.observations, ...s.origins].every(inScope) || (s.returnProof && !inScope(s.returnProof)) || (s.approval && !inScope(s.approval)) || (s.approvalContext && !inScope(s.approvalContext))) return result("DENIED", "RV02");
  if (i.visitId !== v.visitId || i.operationId !== v.operationId || !same(i.locationRef, v.locationRef)) return result("DENIED", "RV25");
  if (i.expectedRevision !== v.revision) return result("CONFLICT", "RV22");
  if ((i.direction === "IN" && v.state !== "NOT_ENTERED") || (i.direction === "OUT" && v.state !== "INSIDE")) return result("DENIED", "RV23");
  if (i.receivedAt > now) return result("INDETERMINATE", "FT03_TEMPORAL_MAPPING_PENDING");
  const requirements = [
    ["DRIVER_LICENSE_CHECK", v.driverRef, "sim-driver-source"],
    ["VEHICLE_INSPECTION", v.vehicleRef, "sim-inspection-source"],
    ["COMPANY_LICENSE_CHECK", v.companyRef, "sim-company-source"],
  ] as const;
  if (s.credentials.length !== 3 || i.credentialRefs.length !== 3) return result("INDETERMINATE", "RV16");
  for (const [type, subject, sourceId] of requirements) {
    const matches = s.credentials.filter(c => c.credentialType === type);
    if (matches.length !== 1) return result("INDETERMINATE", "RV16");
    const c = matches[0];
    const selected = i.credentialRefs.find(r => r.credentialId === c.credentialId && r.revision === c.revision);
    if (!selected || !same(c.subjectRef, subject)) return result("DENIED", "RV25");
    let digest: string;
    try { digest = hashContent(c); } catch { return result("DENIED", "RV01"); }
    if (digest !== c.contentHash || selected.contentHash !== digest) return result("DENIED", "RV05");
    if (!same(c.issuerRef, source(sourceId)) || !c.provenance.sourceSnapshots.some(p => p.sourceId === sourceId && p.sourceVersion === "1")) return result("INDETERMINATE", "RV16");
    if (c.validity.kind === "UNDETERMINED") return result("INDETERMINATE", "RV10");
    if (now >= c.validity.endsAt) return result("DENIED", "RV08");
    if (now < c.validity.startsAt) return result("DENIED", "RV09");
    const at = c.credentialType === "VEHICLE_INSPECTION" ? c.claims.inspectedAt : c.claims.verifiedAt;
    if (at > now) return result("INDETERMINATE", "FT03_TEMPORAL_MAPPING_PENDING");
    if (c.credentialType === "VEHICLE_INSPECTION") {
      if (c.claims.inspectionResult === "REJECTED") return result("DENIED", "RV07");
      if (!same(c.claims.inspectorRef, source(sourceId)) || !same(c.claims.criteriaRef, { kind: "CRITERIA", id: "sim-empty-return-criteria", revision: 1 })) return result("INDETERMINATE", "RV16");
    } else if (c.claims.verificationResult !== "VERIFIED") return result("DENIED", "FT03_NOT_VERIFIED_MAPPING_PENDING");
    const origins = s.origins.filter(o => o.credentialId === c.credentialId && o.credentialRevision === c.revision);
    if (origins.length !== 1 || !same(origins[0].sourceRef, source(sourceId))) return result("INDETERMINATE", "RV16");
    if (c.credentialType !== "VEHICLE_INSPECTION" && !same(origins[0].originRef, c.claims.documentRef)) return result("INDETERMINATE", "RV16");
    const related = s.origins.filter(o => same(o.originRef, origins[0].originRef));
    if (related.some(o => o.status !== origins[0].status)) return result("INDETERMINATE", "RV15");
    if (origins[0].observedAt !== now) return result("INDETERMINATE", "RV14");
    if (origins[0].status !== "ACTIVE") return result(origins[0].status === "UNKNOWN" ? "INDETERMINATE" : "DENIED", origins[0].status === "REVOKED" ? "RV11" : origins[0].status === "SUSPENDED" ? "RV12" : "RV13");
    const obs = s.observations.filter(o => same(o.credentialRef, selected));
    if (!obs.length) return result("INDETERMINATE", "RV13");
    if (new Set(obs.map(o => o.declaredStatus)).size > 1) return result("INDETERMINATE", "RV15");
    if (obs.length !== 1) return result("INDETERMINATE", "RV15");
    const o = obs[0];
    if (!same(o.sourceRef, source(sourceId)) || !o.provenance.sourceSnapshots.some(p => p.sourceId === sourceId && p.sourceVersion === "1")) return result("INDETERMINATE", "RV16");
    if (o.freshnessPolicyRef.policyId !== s.policy || o.freshnessPolicyRef.policyVersion !== "1") return result("INDETERMINATE", "RV10");
    if (o.observedAt > now || (o.effectiveAt && o.effectiveAt > now)) return result("INDETERMINATE", "FT03_TEMPORAL_MAPPING_PENDING");
    if (o.observedAt !== now) return result("INDETERMINATE", "RV14");
    if (o.declaredStatus !== "ACTIVE") return result(o.declaredStatus === "UNKNOWN" ? "INDETERMINATE" : "DENIED", o.declaredStatus === "REVOKED" ? "RV11" : o.declaredStatus === "SUSPENDED" ? "RV12" : "RV13");
  }
  if (s.observations.some(o => !i.credentialRefs.some(r => same(r, o.credentialRef)))) return result("INDETERMINATE", "RV25");
  if (i.direction === "OUT") {
    const p = s.returnProof;
    if (!p || !v.enteredAt) return result("DENIED", "RV24");
    if (p.visitId !== v.visitId || p.operationId !== v.operationId || !same(p.containerRef, v.containerRef) || !same(p.locationRef, v.locationRef)) return result("DENIED", "RV25");
    if (!same(p.attesterRef, source("sim-return-source"))) return result("INDETERMINATE", "RV16");
    if (p.occurredAt <= v.enteredAt || p.occurredAt > now || p.recordedAt < p.occurredAt || p.recordedAt > now) return result("INDETERMINATE", "FT03_TEMPORAL_MAPPING_PENDING");
    if (hashArtifact(Buffer.from(p.content, "utf8")) !== p.contentHash) return result("DENIED", "RV06");
    if (!i.evidenceRefs?.some(r => r.artifactType === "evidence" && r.artifactId === p.artifactId && r.contentHash === p.contentHash)) return result("DENIED", "RV24");
  }
  if (s.policy === "sim-return-hitl.v1") {
    const a = s.approval; const e = s.approvalContext;
    if (!a) return result("REVIEW_REQUIRED", "RV17");
    // Build the review context from current resolved inputs, never from supplied E1/A1.
    let currentContext;
    try { currentContext = oraculoGateApprovalContextV1Schema.safeParse(buildS1ApprovalContext(s)); }
    catch { return result("REVIEW_REQUIRED", "RV18"); }
    if (!e || !currentContext.success) return result("REVIEW_REQUIRED", "RV18");
    const expected = currentContext.data;
    const expectedHash = hashApprovalContext(expected);
    if (hashApprovalContext(e) !== expectedHash ||
        a.subject.inputHash !== expectedHash ||
        a.subject.caseId !== expected.caseRef.id ||
        a.subject.resourceId !== expected.visitRef.id ||
        a.subject.resourceType !== "oraculo_gate_visit" ||
        a.subject.action !== expected.action ||
        a.policyVersion !== expected.policyRefs[0].policyVersion) {
      return result("REVIEW_REQUIRED", "RV18");
    }
    if (!a.validUntil || a.decidedAt > now || a.validUntil <= now || Date.parse(a.validUntil) > Date.parse(a.decidedAt) + 300000 || s.credentials.some(c => c.validity.kind !== "INTERVAL" || a.validUntil! > c.validity.endsAt)) return result("REVIEW_REQUIRED", "RV19");
    if (a.decision === "REJECTED") return result("DENIED", "RV20");
    // R3 prohibits treating a supplied/synthetic A1 as persisted operational authority.
    return result("ELIGIBLE_FOR_SIMULATION");
  }
  return result("ELIGIBLE_FOR_SIMULATION");
}

/** Internal canonical builder shared by the pure validator and trusted persistence adapter. */
export function buildS1ApprovalContext(s: S1Snapshot) {
  const i = s.intent; const v = s.visit;
  return normalizeApprovalContext({
      schemaVersion: "oraculo.gate-approval-context.v1",
      canonicalizationVersion: "oraculo.canonical-json.v1",
      tenantId: s.tenantId,
      workspaceId: s.workspaceId,
      mode: s.mode,
      caseRef: { id: v.caseId, revision: v.caseRevision },
      action: i.direction === "IN" ? "oraculo.gate.in" : "oraculo.gate.out",
      direction: i.direction,
      operationRef: { id: v.operationId, revision: v.operationRevision },
      visitRef: { id: v.visitId, revision: v.revision },
      locationRef: v.locationRef,
      expectedRevision: v.revision,
      credentialRefs: i.credentialRefs,
      policyRefs: [{ policyId: s.policy, policyVersion: "1" }],
      requesterBinding: i.actorRef,
      reviewedObservationRefs: s.observations.map(o => ({ observationId: o.observationId })),
      ...(i.evidenceRefs === undefined ? {} : { evidenceRefs: i.evidenceRefs }),
      ...(s.snapshotRefs === undefined ? {} : { snapshotRefs: s.snapshotRefs }),
      ...(s.riskContextRef === undefined ? {} : { riskContextRef: s.riskContextRef }),
    });
}

/** Public pure entry point preserves the conservative S1 boundary. */
export function evaluateS1(input: unknown): S1Assessment {
  const assessment = evaluateResolvedS1(input);
  const parsed = s1SnapshotSchema.safeParse(input);
  if (parsed.success && parsed.data.policy === "sim-return-hitl.v1" && assessment.disposition === "ELIGIBLE_FOR_SIMULATION") {
    return { mode: "SIMULATION", disposition: "REVIEW_REQUIRED", applied: false, findings: ["HITL_PERSISTENCE_NOT_IMPLEMENTED"] };
  }
  return assessment;
}
