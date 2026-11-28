import test from "node:test";
import assert from "node:assert/strict";
import { S1_NEGATIVE_MAPPING_PROPOSALS, proposeS1NegativeMapping } from "./negativeMappingProposal.js";
import { assertActiveReasonCode, getReasonCodeDefinition } from "../../../../../../packages/core/src/reasons/reasonCatalog.js";
test("ratified simulation matrix matches active candidate catalog",()=>{
  for(const item of S1_NEGATIVE_MAPPING_PROPOSALS){
    assert.equal(getReasonCodeDefinition(item.candidateCode)?.status,"active");
    assert.doesNotThrow(()=>assertActiveReasonCode(item.candidateCode));
    assert.equal(proposeS1NegativeMapping(item.finding).status,"RATIFIED_SIMULATION_ONLY");
  }
});
test("payload conflict and uncertain commit cannot overwrite a final result",()=>{
  const conflict=proposeS1NegativeMapping("RV21"),uncertain=proposeS1NegativeMapping("RV26"),failed=proposeS1NegativeMapping("RV27");
  assert(conflict.status!=="UNMAPPED"&&uncertain.status!=="UNMAPPED"&&failed.status!=="UNMAPPED");
  assert.equal(conflict.target,"REQUEST_ERROR");assert.equal(conflict.outcome,null);
  assert.equal(uncertain.target,"TRACKING");assert.equal(uncertain.outcome,null);
  assert.equal(failed.outcome,"FAILED");assert.equal(failed.requiresNoEffectProof,true);
});
test("missing FT03 semantics get distinct candidates rather than revoked or expired aliases",()=>{
  const verification=proposeS1NegativeMapping("FT03_NOT_VERIFIED_MAPPING_PENDING");
  const temporal=proposeS1NegativeMapping("FT03_TEMPORAL_MAPPING_PENDING");
  assert(verification.status!=="UNMAPPED"&&temporal.status!=="UNMAPPED");
  assert.equal(verification.candidateCode,"ORACULO_VERIFICATION_NOT_SATISFIED");
  assert.equal(temporal.candidateCode,"ORACULO_TEMPORAL_INCOHERENCE");
  assert.equal(temporal.outcome,"REVIEW_REQUIRED");
});
test("unknown findings and pure HITL persistence sentinel remain unmapped",()=>{
  assert.equal(proposeS1NegativeMapping("HITL_PERSISTENCE_NOT_IMPLEMENTED").status,"UNMAPPED");
  assert.equal(proposeS1NegativeMapping("future-code").status,"UNMAPPED");
});
