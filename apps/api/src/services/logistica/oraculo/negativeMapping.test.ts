import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildNegativeFinalization } from "./negativeMapping.js";
import { S1_NEGATIVE_MAPPING_PROPOSALS } from "./negativeMappingProposal.js";
import type { S1Snapshot, S1Assessment } from "./evaluation.js";
const s:S1Snapshot=JSON.parse(readFileSync(new URL("../../../../fixtures/oraculo/s1/pure-v2/cases.json",import.meta.url),"utf8"));
test("ratified C5 candidates map with no invented transition or credential attribution",()=>{
 for(const m of S1_NEGATIVE_MAPPING_PROPOSALS){
  const a:S1Assessment={mode:"SIMULATION",disposition:"DENIED",applied:false,findings:[m.finding]};
  const result=buildNegativeFinalization(s,a);
  if(m.target!=="C5"||m.requiresNoEffectProof){assert.equal(result,null);continue;}
  assert.equal(result?.result.outcome,m.outcome);assert.deepEqual(result.result.reasonCodes,[m.candidateCode]);assert.deepEqual(result.evaluations,[]);assert.equal(result.result.nextRevision,undefined);
 }
});
test("ambiguous or unknown assessment cannot manufacture a final result",()=>{
 for(const findings of [[],["RV11","RV12"],["unknown"],["HITL_PERSISTENCE_NOT_IMPLEMENTED"]])assert.equal(buildNegativeFinalization(s,{mode:"SIMULATION",disposition:"DENIED",applied:false,findings}),null);
});
