import assert from "node:assert/strict";
import test from "node:test";

import {
  type GateWaiverContract,
  type WorkflowJob,
  evaluateGateWaivers,
  parseWorkflowJobs,
} from "../checkGateWaiverExpiry.js";

const WORKFLOW = ".github/workflows/ci.yml";
const JOB_ID = "p3_settlement_support_by_env";
const GATE_ID = "P3SettlementSupportByEnv";

function clock(date: string) {
  return { now: () => new Date(`${date}T00:00:00.000Z`) };
}

function contract(includeWaiver = true): GateWaiverContract {
  return {
    schemaVersion: "gate-waivers.v1",
    waivers: includeWaiver ? [{
      gateId: GATE_ID,
      workflow: WORKFLOW,
      jobId: JOB_ID,
      reason: "fixture evidence is not grounded",
      grantedAt: "2026-08-01",
      expiresAt: "2026-10-30",
      restoreFront: "REPLACE-P3-EVIDENCE-HARDCODED",
      approvedBy: "fixture-owner",
    }] : [],
  };
}

function job(continueOnError: boolean): WorkflowJob {
  return {
    workflow: WORKFLOW,
    jobId: JOB_ID,
    gateId: GATE_ID,
    continueOnError,
  };
}

test("continue-on-error true with a future waiver passes with days remaining", () => {
  const result = evaluateGateWaivers(contract(), [job(true)], clock("2026-08-02"));

  assert.equal(result.ok, true);
  assert.deepEqual(result.violations, []);
  assert.equal(result.warnings[0]?.code, "GATE_WAIVER_ACTIVE");
  assert.equal(result.warnings[0]?.daysRemaining, 89);
});

test("continue-on-error true with an expired waiver fails", () => {
  const result = evaluateGateWaivers(contract(), [job(true)], clock("2026-10-31"));

  assert.equal(result.ok, false);
  assert.deepEqual(result.violations.map(({ criterion, code }) => ({ criterion, code })), [{
    criterion: "declared_waiver_must_not_be_expired",
    code: "P3_SETTLEMENT_SUPPORT_WAIVER_EXPIRED",
  }]);
});

test("continue-on-error true without a waiver fails as undeclared", () => {
  const result = evaluateGateWaivers(contract(false), [job(true)], clock("2026-08-02"));

  assert.equal(result.ok, false);
  assert.equal(result.violations[0]?.criterion, "continue_on_error_requires_declared_waiver");
  assert.equal(result.violations[0]?.code, "GATE_WAIVER_UNDECLARED");
});

test("a declared waiver without continue-on-error fails as stale", () => {
  const result = evaluateGateWaivers(contract(), [job(false)], clock("2026-08-02"));

  assert.equal(result.ok, false);
  assert.equal(result.violations[0]?.criterion, "declared_waiver_requires_continue_on_error");
  assert.equal(result.violations[0]?.code, "GATE_WAIVER_STALE");
});

test("no waiver and no continue-on-error passes", () => {
  const result = evaluateGateWaivers(contract(false), [job(false)], clock("2026-08-02"));

  assert.equal(result.ok, true);
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(result.violations, []);

  const parsed = parseWorkflowJobs(WORKFLOW, [
    "jobs:",
    "  p3_settlement_support_by_env:",
    "    name: P3SettlementSupportByEnv",
    "    # continue-on-error: true",
    "    continue-on-error: false",
    "    steps:",
    "      - name: nested field is not a job field",
    "        continue-on-error: true",
  ].join("\n"));
  assert.deepEqual(parsed, [job(false)]);
});
