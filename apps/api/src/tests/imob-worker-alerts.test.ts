// H2 — ImobWorkerAlerts unit tests
//
// Verifies that each alert rule fires correctly with the expected severity,
// and that no PII appears in alert outputs.
//
// T-A1: IMOB-W-001 (ERROR) — job_permanently_failed > 0
// T-A2: IMOB-W-002 (ERROR) — receipt_required_no_tx_id > 0
// T-A3: IMOB-W-003 (WARNING) — simulated skip > threshold
// T-A4: IMOB-W-004 (WARNING) — duplicate skip rate > threshold
// T-A5: no PII in alert outputs (message, counterKey, ruleId, name)
// T-A6: zero counters → no alerts (no false positives)
// T-A7: IMOB-W-007 (WARNING) — stall fires when no new jobs in window
// T-A8: stall does NOT fire when jobs are still processing

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  evaluateImobWorkerAlerts,
  evaluateImobWorkerStall,
  DEFAULT_ALERT_CONFIG,
  type AlertEvent,
} from "../workers/imobWorkerAlerts.js";
import { IMOB_WORKER_COUNTER } from "../workers/imobWorkerMetrics.js";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const JOBS = IMOB_WORKER_COUNTER.JOBS_RECEIVED;
const MUTATIONS = IMOB_WORKER_COUNTER.MUTATIONS_APPLIED;
const SKIPS = IMOB_WORKER_COUNTER.SKIPS;
const FAILURES = IMOB_WORKER_COUNTER.FAILURES;

function snap(entries: [string, number][]): Map<string, number> {
  return new Map(entries);
}

function jobsKey(actionId: string): string {
  return `${JOBS}{actionId="${actionId}"}`;
}

function skipKey(actionId: string, reason: string): string {
  return `${SKIPS}{actionId="${actionId}",reason="${reason}"}`;
}

function failureKey(reason: string): string {
  return `${FAILURES}{reason="${reason}"}`;
}

function mutationKey(actionId: string, terminal: string, requiresTxId: string): string {
  return `${MUTATIONS}{actionId="${actionId}",requiresTxId="${requiresTxId}",terminal="${terminal}"}`;
}

function alertIds(events: AlertEvent[]): string[] {
  return events.map((e) => e.ruleId);
}

function hasError(events: AlertEvent[], ruleId: string): boolean {
  return events.some((e) => e.ruleId === ruleId && e.severity === "error");
}

function hasWarning(events: AlertEvent[], ruleId: string): boolean {
  return events.some((e) => e.ruleId === ruleId && e.severity === "warning");
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("[T-A1] IMOB-W-001 — job_permanently_failed fires ERROR", () => {
  it("should fire ERROR when permanently_failed > 0", () => {
    const s = snap([
      [jobsKey("owner.register"), 10],
      [mutationKey("owner.register", "false", "true"), 9],
      [failureKey("job_permanently_failed"), 1],
    ]);

    const events = evaluateImobWorkerAlerts(s);
    assert.ok(hasError(events, "IMOB-W-001"), "IMOB-W-001 must fire as ERROR");

    const event = events.find((e) => e.ruleId === "IMOB-W-001")!;
    assert.equal(event.value, 1);
    assert.equal(event.threshold, 0);
  });

  it("should NOT fire when permanently_failed === 0", () => {
    const s = snap([
      [jobsKey("owner.register"), 10],
      [mutationKey("owner.register", "false", "true"), 10],
    ]);

    const events = evaluateImobWorkerAlerts(s);
    assert.ok(!alertIds(events).includes("IMOB-W-001"), "IMOB-W-001 must not fire");
  });

  it("should also fire IMOB-W-006 (ERROR) when job_error rate exceeds threshold", () => {
    const s = snap([
      [jobsKey("owner.register"), 100],
      [failureKey("job_error"), 10],  // 10% > 5% threshold
    ]);

    const events = evaluateImobWorkerAlerts(s);
    assert.ok(hasError(events, "IMOB-W-006"), "IMOB-W-006 must fire as ERROR at 10%");

    const event = events.find((e) => e.ruleId === "IMOB-W-006")!;
    assert.equal(event.value, 10);
  });
});

describe("[T-A2] IMOB-W-002 — receipt_required_no_tx_id fires ERROR", () => {
  it("should fire ERROR when any HIGH-tier skip with no_txid detected", () => {
    const s = snap([
      [jobsKey("owner.register"), 5],
      [skipKey("owner.register", "receipt_required_no_tx_id"), 2],
    ]);

    const events = evaluateImobWorkerAlerts(s);
    assert.ok(hasError(events, "IMOB-W-002"), "IMOB-W-002 must fire as ERROR");

    const event = events.find((e) => e.ruleId === "IMOB-W-002")!;
    assert.equal(event.value, 2);
    assert.equal(event.threshold, 0);
  });

  it("should accumulate across multiple HIGH-tier actionIds", () => {
    const s = snap([
      [jobsKey("owner.register"), 5],
      [skipKey("owner.register", "receipt_required_no_tx_id"), 1],
      [skipKey("commission.settle", "receipt_required_no_tx_id"), 3],
    ]);

    const events = evaluateImobWorkerAlerts(s);
    assert.ok(hasError(events, "IMOB-W-002"));

    const event = events.find((e) => e.ruleId === "IMOB-W-002")!;
    assert.equal(event.value, 4, "should sum across all actionIds");
  });

  it("should NOT fire when reason=receipt_required_no_tx_id is absent", () => {
    const s = snap([
      [jobsKey("lead.qualify"), 10],
      [skipKey("lead.qualify", "simulated"), 1],
    ]);

    const events = evaluateImobWorkerAlerts(s);
    assert.ok(!alertIds(events).includes("IMOB-W-002"), "IMOB-W-002 must not fire");
  });
});

describe("[T-A3] IMOB-W-003 — simulated in production fires WARNING", () => {
  it("should fire WARNING when simulated skip > 0 (default threshold)", () => {
    const s = snap([
      [jobsKey("owner.register"), 20],
      [skipKey("owner.register", "simulated"), 1],
    ]);

    const events = evaluateImobWorkerAlerts(s);
    assert.ok(hasWarning(events, "IMOB-W-003"), "IMOB-W-003 must fire as WARNING");

    const event = events.find((e) => e.ruleId === "IMOB-W-003")!;
    assert.equal(event.value, 1);
    assert.equal(event.threshold, 0);
  });

  it("should NOT fire when simulated threshold is set higher and value is below", () => {
    const s = snap([
      [jobsKey("owner.register"), 20],
      [skipKey("owner.register", "simulated"), 2],
    ]);

    const config = { ...DEFAULT_ALERT_CONFIG, simulatedSkipThreshold: 5 };
    const events = evaluateImobWorkerAlerts(s, config);
    assert.ok(!alertIds(events).includes("IMOB-W-003"));
  });
});

describe("[T-A4] IMOB-W-004 — duplicate skip rate fires WARNING", () => {
  it("should fire WARNING when already_processed / jobs > 30%", () => {
    const s = snap([
      [jobsKey("owner.register"), 100],
      [skipKey("owner.register", "already_processed"), 35],  // 35% > 30%
    ]);

    const events = evaluateImobWorkerAlerts(s);
    assert.ok(hasWarning(events, "IMOB-W-004"), "IMOB-W-004 must fire at 35%");

    const event = events.find((e) => e.ruleId === "IMOB-W-004")!;
    assert.equal(event.value, 35);
  });

  it("should NOT fire when duplicate rate is below threshold", () => {
    const s = snap([
      [jobsKey("owner.register"), 100],
      [skipKey("owner.register", "already_processed"), 10],  // 10% < 30%
    ]);

    const events = evaluateImobWorkerAlerts(s);
    assert.ok(!alertIds(events).includes("IMOB-W-004"));
  });

  it("should also fire IMOB-W-005 when run_not_success rate exceeds threshold", () => {
    const s = snap([
      [jobsKey("owner.register"), 100],
      [skipKey("owner.register", "run_not_success"), 25],  // 25% > 20%
    ]);

    const events = evaluateImobWorkerAlerts(s);
    assert.ok(hasWarning(events, "IMOB-W-005"), "IMOB-W-005 must fire at 25%");
  });
});

describe("[T-A5] no PII in alert outputs", () => {
  const PII_TOKENS = [
    "case-",
    "tenant-",
    "ws-",
    "workspace-",
    "Carlos",
    "João",
    "Maria",
  ];

  function assertNoPii(events: AlertEvent[]) {
    for (const event of events) {
      const fields = [event.message, event.counterKey, event.ruleId, event.name];
      for (const field of fields) {
        for (const pii of PII_TOKENS) {
          assert.ok(
            !field.includes(pii),
            `PII token '${pii}' found in alert field: ${field}`,
          );
        }
      }
    }
  }

  it("should contain no PII when all rules fire simultaneously", () => {
    const s = snap([
      [jobsKey("owner.register"), 100],
      [failureKey("job_permanently_failed"), 2],
      [skipKey("owner.register", "receipt_required_no_tx_id"), 1],
      [skipKey("owner.register", "simulated"), 3],
      [skipKey("owner.register", "already_processed"), 50],  // 50% > 30%
      [skipKey("owner.register", "run_not_success"), 30],    // 30% > 20%
      [failureKey("job_error"), 10],                         // 10% > 5%
    ]);

    const events = evaluateImobWorkerAlerts(s);
    assert.ok(events.length > 0, "at least some alerts should fire");
    assertNoPii(events);
  });

  it("should contain no PII in stall alert", () => {
    const prev = snap([[jobsKey("owner.register"), 5]]);
    const curr = snap([[jobsKey("owner.register"), 5]]);  // no delta

    const events = evaluateImobWorkerStall(prev, curr, 6 * 60 * 1000);
    assert.ok(events.length > 0, "stall alert should fire");
    assertNoPii(events);
  });
});

describe("[T-A6] zero counters → no alerts (no false positives)", () => {
  it("should return empty array when snapshot is empty", () => {
    const events = evaluateImobWorkerAlerts(new Map());
    assert.equal(events.length, 0, "no alerts on empty snapshot");
  });

  it("should return empty array when only mutations_applied exist (healthy)", () => {
    const s = snap([
      [jobsKey("owner.register"), 50],
      [mutationKey("owner.register", "false", "true"), 50],
    ]);

    const events = evaluateImobWorkerAlerts(s);
    assert.equal(events.length, 0, "no alerts when all jobs mutated successfully");
  });

  it("should return empty array when skips are below all thresholds", () => {
    const s = snap([
      [jobsKey("owner.register"), 100],
      [mutationKey("owner.register", "false", "true"), 90],
      [skipKey("owner.register", "already_processed"), 5],   // 5% < 30%
      [skipKey("owner.register", "run_not_success"), 5],     // 5% < 20%
    ]);

    const events = evaluateImobWorkerAlerts(s);
    assert.equal(events.length, 0, "no alerts when all rates are within bounds");
  });
});

describe("[T-A7] IMOB-W-007 — stall fires WARNING when queue is silent", () => {
  it("should fire WARNING when no new jobs in stall window", () => {
    const prev = snap([[jobsKey("owner.register"), 10]]);
    const curr = snap([[jobsKey("owner.register"), 10]]);  // no delta

    const events = evaluateImobWorkerStall(prev, curr, 6 * 60 * 1000);  // 6 min > 5 min default
    assert.ok(hasWarning(events, "IMOB-W-007"), "IMOB-W-007 must fire as WARNING");

    const event = events.find((e) => e.ruleId === "IMOB-W-007")!;
    assert.equal(event.value, 0);
    assert.equal(event.threshold, 1);
    assert.match(event.message, /6 min/);
  });

  it("should NOT fire stall when elapsed is below stallWindowMs", () => {
    const prev = snap([[jobsKey("owner.register"), 10]]);
    const curr = snap([[jobsKey("owner.register"), 10]]);

    const events = evaluateImobWorkerStall(prev, curr, 4 * 60 * 1000);  // 4 min < 5 min
    assert.equal(events.length, 0, "stall must not fire before window expires");
  });

  it("should NOT fire stall on startup (prevTotal === 0)", () => {
    const prev = snap([]);
    const curr = snap([]);

    const events = evaluateImobWorkerStall(prev, curr, 10 * 60 * 1000);
    assert.equal(events.length, 0, "stall must not fire when worker never had jobs");
  });
});

describe("[T-A8] stall does NOT fire when jobs are processing", () => {
  it("should NOT fire stall when new jobs were received in window", () => {
    const prev = snap([[jobsKey("owner.register"), 10]]);
    const curr = snap([[jobsKey("owner.register"), 15]]);  // 5 new jobs

    const events = evaluateImobWorkerStall(prev, curr, 6 * 60 * 1000);
    assert.equal(events.length, 0, "stall must not fire when jobs are processing");
  });

  it("should NOT fire stall with custom shorter window", () => {
    const prev = snap([[jobsKey("lead.qualify"), 100]]);
    const curr = snap([[jobsKey("lead.qualify"), 101]]);  // 1 new job

    const events = evaluateImobWorkerStall(prev, curr, 2 * 60 * 1000, 1 * 60 * 1000);
    assert.equal(events.length, 0, "stall must not fire with processing happening");
  });
});
