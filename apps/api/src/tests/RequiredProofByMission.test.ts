import test from "node:test";
import assert from "node:assert/strict";

import { buildImobMissionPolicy } from "../services/imob/orchestrator/imobMissionPolicy";

test("mission policy assigns required proof to critical p0 missions", () => {
  assert.deepEqual(buildImobMissionPolicy("case_review").requiredProof, ["snapshot_authoritative"]);
  assert.deepEqual(buildImobMissionPolicy("qualify_and_match_lead").requiredProof, ["evidence_bundle"]);
  assert.deepEqual(buildImobMissionPolicy("collect_documents").requiredProof, ["document_package"]);
  assert.deepEqual(buildImobMissionPolicy("schedule_and_follow_visit").requiredProof, ["visit_record"]);
  assert.deepEqual(buildImobMissionPolicy("capture_seasonal_property").requiredProof, ["owner_link"]);
});
