import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { evaluateS1 } from "./evaluation.js";
import { hashContent, hashArtifact, hashApprovalContext } from "./canonicalization.js";
const fixture = (): any => JSON.parse(readFileSync(new URL("../../../../fixtures/oraculo/s1/pure-v2/cases.json", import.meta.url), "utf8"));
function refresh(s: any, n: number) { const c = s.credentials[n]; c.contentHash = hashContent(c); s.intent.credentialRefs[n] = { credentialId:c.credentialId, revision:c.revision, contentHash:c.contentHash }; s.observations[n].credentialRef = {...s.intent.credentialRefs[n]}; }
function hitl() { const s = fixture(); s.policy = "sim-return-hitl.v1"; s.observations.forEach((o: any) => o.freshnessPolicyRef.policyId = s.policy); return s; }
test("basic S1 is deterministic, immutable and never applied", () => {
  const s=fixture(), before=JSON.stringify(s); const a=evaluateS1(s);
  assert.equal(a.disposition,"ELIGIBLE_FOR_SIMULATION"); assert.equal(a.applied,false); assert.deepEqual(evaluateS1(s),a); assert.equal(JSON.stringify(s),before);
});
const cases: [string, (s:any)=>void, string][] = [
  ["scope",s=>s.credentials[0].tenantId="other","RV02"],
  ["real mode",s=>s.mode="REAL","RV01"],
  ["payload authority",s=>s.intent.authority=true,"RV01"],
  ["revision",s=>s.intent.expectedRevision=2,"RV22"],
  ["OUT before IN",s=>s.intent.direction="OUT","RV23"],
  ["hash mismatch",s=>s.credentials[0].claims.verificationResult="NOT_VERIFIED","RV05"],
  ["rejected inspection",s=>{s.credentials[1].claims.inspectionResult="REJECTED";refresh(s,1);},"RV07"],
  ["expired exact end",s=>{s.credentials[0].validity.endsAt=s.evaluatedAt;refresh(s,0);},"RV08"],
  ["not started",s=>{s.credentials[0].validity.startsAt="2026-09-16T13:00:00Z";refresh(s,0);},"RV09"],
  ["undetermined",s=>{s.credentials[0].validity={kind:"UNDETERMINED"};refresh(s,0);},"RV10"],
  ["revoked",s=>s.observations[0].declaredStatus="REVOKED","RV11"],
  ["suspended",s=>s.observations[0].declaredStatus="SUSPENDED","RV12"],
  ["unknown",s=>s.observations[0].declaredStatus="UNKNOWN","RV13"],
  ["stale",s=>s.observations[0].observedAt="2026-09-16T11:59:59Z","RV14"],
  ["conflict",s=>s.observations.push({...s.observations[0],observationId:"conflict",declaredStatus:"REVOKED"}),"RV15"],
  ["untrusted source",s=>s.observations[0].sourceRef.id="unexpected","RV16"],
  ["unknown subject snapshot",s=>s.visit.driverRef.revision=2,"RV25"],
  ["origin remains revoked on local revision",s=>{s.credentials[0].revision=2;s.origins[0].credentialRevision=2;s.origins[0].status="REVOKED";refresh(s,0);},"RV11"],
  ["not verified mapper pending",s=>{s.credentials[0].claims.verificationResult="NOT_VERIFIED";refresh(s,0);},"FT03_NOT_VERIFIED_MAPPING_PENDING"],
];
for(const [name,mutate,reason] of cases) test(name,()=>{const s=fixture();mutate(s); const r=evaluateS1(s);assert.ok(r.findings.includes(reason),JSON.stringify(r));assert.equal(r.applied,false);});
test("OUT requires matching, hashed return evidence after entry",()=>{
 const s=fixture();s.intent.direction="OUT";s.visit.state="INSIDE";s.visit.enteredAt="2026-09-16T11:45:00.000Z";
 assert.deepEqual(evaluateS1(s).findings,["RV24"]);
 const content="synthetic empty return";const h=hashArtifact(Buffer.from(content));
 s.returnProof={tenantId:s.tenantId,workspaceId:s.workspaceId,operationId:s.visit.operationId,visitId:s.visit.visitId,containerRef:s.visit.containerRef,locationRef:s.visit.locationRef,occurredAt:"2026-09-16T11:55:00.000Z",recordedAt:s.evaluatedAt,attesterRef:{kind:"SOURCE",id:"sim-return-source",revision:1},artifactId:"sim-proof",contentHash:h,content};
 s.intent.evidenceRefs=[{schemaVersion:"artifact-ref.v1",artifactType:"evidence",artifactId:"sim-proof",contentHash:h}];
 assert.equal(evaluateS1(s).disposition,"ELIGIBLE_FOR_SIMULATION");s.returnProof.content+="tampered";assert.deepEqual(evaluateS1(s).findings,["RV06"]);
});
function approvalFixture() {
 const s=hitl(); const e={schemaVersion:"oraculo.gate-approval-context.v1",canonicalizationVersion:"oraculo.canonical-json.v1",tenantId:s.tenantId,workspaceId:s.workspaceId,mode:s.mode,caseRef:{id:s.visit.caseId,revision:s.visit.caseRevision},action:"oraculo.gate.in",direction:"IN",operationRef:{id:s.visit.operationId,revision:s.visit.operationRevision},visitRef:{id:s.visit.visitId,revision:s.visit.revision},locationRef:s.visit.locationRef,expectedRevision:1,credentialRefs:s.intent.credentialRefs,policyRefs:[{policyId:s.policy,policyVersion:"1"}],requesterBinding:s.intent.actorRef,reviewedObservationRefs:s.observations.map((o:any)=>({observationId:o.observationId}))};
 s.approvalContext=e;s.approval={schemaVersion:"human-authority-decision.v1",authorityDecisionId:"sim-a1",tenantId:s.tenantId,workspaceId:s.workspaceId,subject:{caseId:s.visit.caseId,action:e.action,resourceType:"oraculo_gate_visit",resourceId:s.visit.visitId,inputHash:hashApprovalContext(e)},decision:"APPROVED",decidedByUserId:"synthetic-reviewer",decidedAt:s.evaluatedAt,validUntil:"2026-09-16T12:05:00.000Z",policyVersion:"1",reasonCodes:[],evidenceRefs:[]};return s;
}
test("HITL never falls back to basic or treats supplied A1 as persisted",()=>{
 assert.deepEqual(evaluateS1(hitl()).findings,["RV17"]);const s=approvalFixture();assert.deepEqual(evaluateS1(s).findings,["HITL_PERSISTENCE_NOT_IMPLEMENTED"]);
 s.approvalContext.reviewedObservationRefs[0].observationId="replacement";assert.deepEqual(evaluateS1(s).findings,["RV18"]);
});
test("HITL rejected, expired and wrong direction remain distinct",()=>{
 let s=approvalFixture();s.approval.decision="REJECTED";s.approval.reasonCodes=["synthetic-rejection"];assert.deepEqual(evaluateS1(s).findings,["RV20"]);
 s=approvalFixture();s.approval.decidedAt="2026-09-16T11:55:00.000Z";s.approval.validUntil=s.evaluatedAt;assert.deepEqual(evaluateS1(s).findings,["RV19"]);
 s=approvalFixture();s.approvalContext.direction="OUT";assert.deepEqual(evaluateS1(s).findings,["RV18"]);
});


test("R-S1-02: duplicate observation identity across credentials is invalid", () => {
  const s = fixture();
  s.observations[1].observationId = s.observations[0].observationId;
  assert.deepEqual(evaluateS1(s).findings, ["RV01"]);
});
test("R-S1-02: identical repeated observation is invalid", () => {
  const s = fixture();
  s.observations.push(structuredClone(s.observations[0]));
  assert.deepEqual(evaluateS1(s).findings, ["RV01"]);
});

// Mutate E1 and re-hash A1: two stale records agreeing is not sufficient.
const contextMutations: [string, (e: any) => void][] = [
  ["action", e => e.action = "unrelated.action"],
  ["case revision", e => e.caseRef.revision++],
  ["operation revision", e => e.operationRef.revision++],
  ["visit revision", e => e.visitRef.revision++],
  ["evidence added", e => e.evidenceRefs = [{schemaVersion:"artifact-ref.v1",artifactType:"evidence",artifactId:"old-proof",contentHash:"sha256:"+"a".repeat(64)}]],
  ["snapshot added", e => e.snapshotRefs = [fixture().credentials[0].provenance.sourceSnapshots[0]]],
  ["risk added", e => e.riskContextRef = {schemaVersion:"artifact-ref.v1",artifactType:"evidence",artifactId:"old-risk",contentHash:"sha256:"+"a".repeat(64)}],
];
for (const [name, mutate] of contextMutations) test("R-S1-01: matching A1/E1 cannot hide changed " + name, () => {
  const s = approvalFixture();
  mutate(s.approvalContext);
  s.approval.subject.inputHash = hashApprovalContext(s.approvalContext);
  s.approval.subject.action = s.approvalContext.action;
  assert.deepEqual(evaluateS1(s).findings, ["RV18"]);
});
for (const field of ["caseRevision", "operationRevision"]) test("R-S1-01: current " + field + " invalidates old review", () => {
  const s = approvalFixture(); s.visit[field]++;
  assert.deepEqual(evaluateS1(s).findings, ["RV18"]);
});
test("R-S1-01: current materials are bound and their set order is irrelevant", () => {
  const s = approvalFixture();
  s.snapshotRefs = [s.credentials[0].provenance.sourceSnapshots[0], s.credentials[1].provenance.sourceSnapshots[0]];
  s.riskContextRef = {schemaVersion:"artifact-ref.v1",artifactType:"evidence",artifactId:"risk",contentHash:"sha256:"+"a".repeat(64)};
  s.intent.evidenceRefs = [{schemaVersion:"artifact-ref.v1",artifactType:"evidence",artifactId:"proof",contentHash:"sha256:"+"b".repeat(64)}];
  s.approvalContext.snapshotRefs = structuredClone(s.snapshotRefs).reverse();
  s.approvalContext.riskContextRef = structuredClone(s.riskContextRef);
  s.approvalContext.evidenceRefs = structuredClone(s.intent.evidenceRefs);
  s.approvalContext.credentialRefs.reverse(); s.approvalContext.reviewedObservationRefs.reverse();
  s.approval.subject.inputHash = hashApprovalContext(s.approvalContext);
  assert.deepEqual(evaluateS1(s).findings, ["HITL_PERSISTENCE_NOT_IMPLEMENTED"]);
  for (const key of ["snapshotRefs", "riskContextRef", "evidenceRefs"]) {
    const changed = structuredClone(s);
    delete changed.approvalContext[key];
    changed.approval.subject.inputHash = hashApprovalContext(changed.approvalContext);
    assert.deepEqual(evaluateS1(changed).findings, ["RV18"]);
  }
});
test("R-S1-01: OUT proof replacement invalidates an internally consistent old approval", () => {
  const s=approvalFixture(); s.intent.direction="OUT"; s.visit.state="INSIDE";
  s.visit.enteredAt="2026-09-16T11:45:00.000Z";
  const content="synthetic return"; const h=hashArtifact(Buffer.from(content));
  s.returnProof={tenantId:s.tenantId,workspaceId:s.workspaceId,operationId:s.visit.operationId,visitId:s.visit.visitId,containerRef:s.visit.containerRef,locationRef:s.visit.locationRef,occurredAt:"2026-09-16T11:55:00.000Z",recordedAt:s.evaluatedAt,attesterRef:{kind:"SOURCE",id:"sim-return-source",revision:1},artifactId:"proof-v1",contentHash:h,content};
  s.intent.evidenceRefs=[{schemaVersion:"artifact-ref.v1",artifactType:"evidence",artifactId:"proof-v1",contentHash:h}];
  s.approvalContext.direction="OUT";s.approvalContext.action="oraculo.gate.out";
  s.approvalContext.evidenceRefs=structuredClone(s.intent.evidenceRefs);
  s.approval.subject.action=s.approvalContext.action;
  s.approval.subject.inputHash=hashApprovalContext(s.approvalContext);
  assert.deepEqual(evaluateS1(s).findings,["HITL_PERSISTENCE_NOT_IMPLEMENTED"]);
  s.returnProof.artifactId="proof-v2";s.intent.evidenceRefs[0].artifactId="proof-v2";
  assert.deepEqual(evaluateS1(s).findings,["RV18"]);
});
