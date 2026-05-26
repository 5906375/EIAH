import test from "node:test";
import assert from "node:assert/strict";

import { buildImobCrmLegacyCanonicalCase } from "../services/imob/crm/imobCrmLegacyCanonical";

test("IMOB legacy canonical keeps market scan confirmation actions specific to the current state", () => {
  const canonical = buildImobCrmLegacyCanonicalCase({
    flow: "property.create",
    nextStep: "confirmar seleção do scan",
    pendingItems: [],
    blockers: [],
    status: "running",
  });

  const actionIds = canonical.recommendedActions.map((item) => item.id);
  const actionHints = canonical.recommendedActions.map((item) => item.inputHint);

  assert.deepEqual(actionIds, ["confirm_market_scan_capture"]);
  assert.deepEqual(actionHints, ["confirmar captação do scan"]);
});
