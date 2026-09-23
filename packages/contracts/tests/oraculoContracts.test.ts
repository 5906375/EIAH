import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { oraculoCredentialContentV1Schema as c1, oraculoGateIntentV1Schema as c4, oraculoGateResultV1Schema as c5, oraculoCredentialEvaluationV1Schema as c3, oraculoGateIntentTrackingV1Schema as tracking } from "../src/index.js";
const s=JSON.parse(readFileSync(new URL("../../../apps/api/fixtures/oraculo/s1/pure-v2/cases.json",import.meta.url),"utf8"));
test("strict discriminated claims and millisecond timestamps",()=>{
 assert.equal(c1.safeParse(s.credentials[0]).success,true);
 assert.equal(c1.safeParse({...s.credentials[0],claims:{...s.credentials[0].claims,extra:1}}).success,false);
 assert.equal(c1.safeParse({...s.credentials[0],subjectRef:s.credentials[1].subjectRef}).success,false);
 assert.equal(c1.safeParse({...s.credentials[0],claims:{...s.credentials[0].claims,verifiedAt:"2026-09-16T12:00:00.0001Z"}}).success,false);
});
test("intent rejects ambiguous selected credentials and client authority",()=>{
 assert.equal(c4.safeParse({...s.intent,credentialRefs:[s.intent.credentialRefs[0],s.intent.credentialRefs[0]]}).success,false);
 assert.equal(c4.safeParse({...s.intent,humanApprovalGranted:true}).success,false);
});
test("FINAL has matching result and other states cannot carry result",()=>{
 const r={schemaVersion:"oraculo.gate-result.v1",tenantId:s.tenantId,workspaceId:s.workspaceId,mode:"SIMULATION",resultId:"r",intentId:"i",outcome:"DENIED",reasonCodes:["candidate-test-only"],evaluationRefs:[],evidenceRefs:[],recordedAt:s.evaluatedAt};
 const t={schemaVersion:"oraculo.gate-intent-tracking.v1",intentId:"i",mode:"SIMULATION",state:"FINAL",acceptedAt:s.evaluatedAt,updatedAt:s.evaluatedAt,result:r};
 assert.equal(tracking.safeParse(t).success,true);assert.equal(tracking.safeParse({...t,result:undefined}).success,false);assert.equal(tracking.safeParse({...t,state:"PROCESSING"}).success,false);assert.equal(tracking.safeParse({...t,intentId:"other"}).success,false);
 assert.equal(c5.safeParse({...r,outcome:"APPLIED"}).success,false);assert.equal(c5.safeParse({...r,previousState:"INSIDE"}).success,false);
 assert.equal(c5.safeParse({...r,outcome:"APPLIED",reasonCodes:[],evaluationRefs:["e"],previousState:"NOT_ENTERED",nextState:"INSIDE",previousRevision:1,nextRevision:2}).success,true);
});


test("R-S1-03: canonical reason format and uniqueness in C3/C5/tracking", () => {
 const r={schemaVersion:"oraculo.gate-result.v1",tenantId:s.tenantId,workspaceId:s.workspaceId,mode:"SIMULATION",resultId:"r",intentId:"i",outcome:"DENIED",reasonCodes:["CANDIDATE_ONLY"],evaluationRefs:[],evidenceRefs:[],recordedAt:s.evaluatedAt};
 const t={schemaVersion:"oraculo.gate-intent-tracking.v1",intentId:"i",mode:"SIMULATION",state:"PROCESSING",acceptedAt:s.evaluatedAt,updatedAt:s.evaluatedAt,reasonCodes:["CANDIDATE_ONLY"]};
 const e={schemaVersion:"oraculo.credential-evaluation.v1",tenantId:s.tenantId,workspaceId:s.workspaceId,mode:"SIMULATION",evaluationId:"e",credentialRef:s.intent.credentialRefs[0],operationRef:{id:s.visit.operationId,revision:1},purpose:"SIMULATED_EMPTY_RETURN",observationRefs:[],sourceRefs:[],policyId:s.policy,policyVersion:"1",evaluatedAt:s.evaluatedAt,result:"REJECTED",reasonCodes:["CANDIDATE_ONLY"]};
 for(const [schema, value] of [[c3,e],[c5,r],[tracking,t]] as const) {
   assert.equal(schema.safeParse(value).success,true);
   for(const codes of [["bad code"],[" "],["/bad"],["x","x"]]) assert.equal(schema.safeParse({...value,reasonCodes:codes}).success,false);
   // Syntactic validity is deliberately not registration/activation in a production catalog.
   assert.equal(schema.safeParse({...value,reasonCodes:["NotRegistered.Yet-1"]}).success,true);
 }
});
