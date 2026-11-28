import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { canonicalize, hashArtifact, hashContent, hashIntent, hashApprovalContext } from "./canonicalization.js";
const fixture = () => JSON.parse(readFileSync(new URL("../../../../fixtures/oraculo/s1/pure-v2/cases.json", import.meta.url), "utf8"));
test("FT02 bytes, Unicode code points and control escapes", () => {
  assert.equal(canonicalize({ b: 2, a: 1 }), '{"a":1,"b":2}');
  assert.equal(canonicalize({ "𐀀": 1, "\ue000": 2 }), '{"\ue000":2,"𐀀":1}');
  assert.equal(canonicalize("\n\t/"), '"\\u000a\\u0009/"');
  assert.equal(canonicalize(-0), "0");
  assert.notEqual(canonicalize("é"), canonicalize("e\u0301"));
  assert.notEqual(canonicalize({}), canonicalize({ a: null }));
  assert.equal(canonicalize([2, 1]), "[2,1]");
});
test("FT02 rejects lossy and non-JSON values", () => {
  for (const x of [1.5, NaN, Infinity, 9007199254740992, undefined, "\ud800", new Date(), new Array(2), { a: undefined }]) assert.throws(() => canonicalize(x));
  const cycle: any = {}; cycle.self = cycle; assert.throws(() => canonicalize(cycle));
});
test("HA known SHA-256 vector, distinct bytes", () => {
  assert.equal(hashArtifact(Buffer.from("abc")), "sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.notEqual(hashArtifact(Buffer.from("abc")), hashArtifact(Buffer.from("abc\n")));
});
test("H1 fixture independent digest and projection", () => {
  const c = fixture().credentials[0]; assert.equal(hashContent(c), c.contentHash);
  const old = hashContent(c); c.contentHash = "sha256:" + "f".repeat(64); assert.equal(hashContent(c), old);
  c.claims.verifiedAt = "2026-09-16T09:00:00-03:00"; assert.equal(hashContent(c), old);
  c.provenance.sourceSnapshots[0].capturedAt = "2026-09-16T09:00:00-03:00"; assert.equal(hashContent(c), old);
  c.claims.verificationResult = "NOT_VERIFIED"; assert.notEqual(hashContent(c), old);
});
test("fixture manifest checks the exact delivered bytes", () => {
  const base = new URL("../../../../fixtures/oraculo/s1/pure-v2/", import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL("manifest.json", base), "utf8"));
  assert.equal(hashArtifact(readFileSync(new URL("cases.json", base))), "sha256:" + manifest.files[0].sha256);
  for (const entry of manifest.sources) assert.equal(hashArtifact(Buffer.from(entry.content)), entry.contentHash);
});
test("HD binds direction and reviewed observation identity, normalizes declared sets", () => {
 const s=fixture(); const e={schemaVersion:"oraculo.gate-approval-context.v1",canonicalizationVersion:"oraculo.canonical-json.v1",tenantId:s.tenantId,workspaceId:s.workspaceId,mode:s.mode,caseRef:{id:s.visit.caseId,revision:1},action:"oraculo.gate.in",direction:"IN",operationRef:{id:s.visit.operationId,revision:1},visitRef:{id:s.visit.visitId,revision:1},locationRef:s.visit.locationRef,expectedRevision:1,credentialRefs:s.intent.credentialRefs,policyRefs:[{policyId:s.policy,policyVersion:"1"}],requesterBinding:s.intent.actorRef,reviewedObservationRefs:s.observations.map((o:any)=>({observationId:o.observationId}))};
 const h=hashApprovalContext(e);e.credentialRefs.reverse();e.reviewedObservationRefs.reverse();assert.equal(hashApprovalContext(e),h);
 e.reviewedObservationRefs[0].observationId="replacement";assert.notEqual(hashApprovalContext(e),h);
 assert.throws(()=>hashApprovalContext({...e,canonicalizationVersion:"unknown"}));
});
test("HI normalizes only declared sets, excludes actor/time, rejects duplicate identities", () => {
  const i = fixture().intent; const h = hashIntent(i);
  i.credentialRefs.reverse(); i.actorRef.id = "other"; i.receivedAt = "2026-09-16T13:00:00Z"; assert.equal(hashIntent(i), h);
  i.direction = "OUT"; assert.notEqual(hashIntent(i), h);
  i.credentialRefs.push(i.credentialRefs[0]); assert.throws(() => hashIntent(i));
});
