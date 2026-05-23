import test from "node:test";
import assert from "node:assert/strict";

import { IMOB_MISSION_TRANSITIONS, listMissionSteps } from "../services/imob/orchestrator/imobMissionGraph";

test("each IMOB mission exposes a non-empty typed step list", () => {
  for (const mission of Object.keys(IMOB_MISSION_TRANSITIONS)) {
    const steps = listMissionSteps(mission as keyof typeof IMOB_MISSION_TRANSITIONS);
    assert.ok(steps.length > 0, `${mission} should declare at least one step`);
  }
});
