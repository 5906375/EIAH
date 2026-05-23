import test from "node:test";
import assert from "node:assert/strict";

import {
  ImobGovernanceError,
  assertValidMissionTransition,
} from "../services/imob/orchestrator/imobMissionGraph";

test("allowed mission transition passes", () => {
  assert.doesNotThrow(() =>
    assertValidMissionTransition("collect_documents", "collecting", "classifying"),
  );
});

test("rework path transition passes", () => {
  assert.doesNotThrow(() =>
    assertValidMissionTransition("capture_sale_property", "needs_rework", "sale_checklist"),
  );
});

test("invalid mission transition fails closed", () => {
  assert.throws(
    () => assertValidMissionTransition("case_review", "generating_snapshot", "generating_snapshot"),
    (error: unknown) =>
      error instanceof ImobGovernanceError
      && error.reasonCode === "INVALID_MISSION_TRANSITION",
  );
});
