import test from "node:test";
import assert from "node:assert/strict";

import {
  describeLegacyThreadStateShape,
  getLegacyCrmFallbackConfigFromEnv,
  resolveLegacyCrmFallbackDecision,
} from "../services/imob/crm/imobCrmLegacyFallbackPolicy";

test("legacy fallback policy defaults to allowlist mode and trims allowlist entries", () => {
  const config = getLegacyCrmFallbackConfigFromEnv({
    IMOB_CRM_LEGACY_FALLBACK_MODE: "unknown-mode",
    IMOB_CRM_LEGACY_FALLBACK_ALLOWLIST: " visit.schedule , consult:visit.schedule ,, ",
  });

  assert.equal(config.mode, "allowlist");
  assert.deepEqual([...config.allowlist], ["visit.schedule", "consult:visit.schedule"]);
});

test("legacy fallback policy marks calls without legacy scope as ineligible", () => {
  const decision = resolveLegacyCrmFallbackDecision(
    {
      message: "quais são as regras do imob?",
      caseId: null,
      threadState: null,
    },
    "consult",
    { mode: "allowlist", allowlist: new Set() },
  );

  assert.equal(decision.eligible, false);
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "no_legacy_scope");
  assert.match(decision.scenarioKey, /^consult:no_flow:/);
});

test("legacy fallback policy blocks eligible scenarios when mode is disabled", () => {
  const decision = resolveLegacyCrmFallbackDecision(
    {
      message: "mostrar bloqueios do caso",
      caseId: "case-123",
      threadState: { operational: { flow: "visit.schedule" } },
    },
    "consult",
    { mode: "disabled", allowlist: new Set(["consult:visit.schedule"]) },
  );

  assert.equal(decision.eligible, true);
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "fallback_mode_disabled");
  assert.equal(decision.operationalFlow, "visit.schedule");
});

test("legacy fallback policy allows eligible scenarios when mode is broad", () => {
  const decision = resolveLegacyCrmFallbackDecision(
    {
      message: "registrar visita deste caso",
      caseId: "case-123",
      threadState: { operational: { flow: "visit.schedule" } },
    },
    "update",
    { mode: "broad", allowlist: new Set() },
  );

  assert.equal(decision.eligible, true);
  assert.equal(decision.allowed, true);
  assert.equal(decision.reason, "fallback_mode_broad");
  assert.equal(decision.operationalFlow, "visit.schedule");
});

test("legacy fallback policy matches allowlist by exact scenario key", () => {
  const baseDecision = resolveLegacyCrmFallbackDecision(
    {
      message: "mostrar bloqueios do caso",
      caseId: "case-123",
      threadState: {
        activeCaseId: "case-123",
        activeThreadId: "thread-123",
        operational: { flow: "visit.schedule", pendingFields: ["propertyId"] },
      },
    },
    "consult",
    { mode: "allowlist", allowlist: new Set() },
  );

  const allowedDecision = resolveLegacyCrmFallbackDecision(
    {
      message: "mostrar bloqueios do caso",
      caseId: "case-123",
      threadState: {
        activeCaseId: "case-123",
        activeThreadId: "thread-123",
        operational: { flow: "visit.schedule", pendingFields: ["propertyId"] },
      },
    },
    "consult",
    { mode: "allowlist", allowlist: new Set([baseDecision.scenarioKey]) },
  );

  assert.equal(baseDecision.reason, "allowlist_missing");
  assert.equal(allowedDecision.allowed, true);
  assert.equal(allowedDecision.reason, "allowlist_match");
  assert.equal(allowedDecision.scenarioKey, baseDecision.scenarioKey);
});

test("legacy fallback thread-state shape stays explicit for telemetry", () => {
  const shape = describeLegacyThreadStateShape({
    caseId: "case-123",
    threadState: {
      activeCaseId: "case-123",
      activeThreadId: "thread-123",
      operational: { flow: "visit.schedule", pendingFields: ["propertyId"] },
    },
  });

  assert.equal(shape, "case_scope|operational_flow|active_case|active_thread|pending_fields");
});
