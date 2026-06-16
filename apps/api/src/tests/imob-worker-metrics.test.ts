// H1 — ImobWorkerMetrics unit tests
//
// Verifies that each outcome path in processImobRunCompletedJob increments
// the correct counter. Uses injectable deps — no BullMQ, no DB, no network.
//
// T-M1: mutation_applied increments MUTATIONS_APPLIED + JOBS_RECEIVED
// T-M2: simulated skip increments SKIPS{reason=simulated}
// T-M3: run_not_success skip increments SKIPS{reason=run_not_success}
// T-M4: already_processed increments SKIPS{reason=already_processed}
// T-M5: worker failure counter (direct incrementCounter call)
// T-M6: no PII in any counter key (caseId, tenantId, workspaceId, ownerResponsible)
// T-M7: renderCountersAsPrometheusText emits valid Prometheus text

import "./support/testInfraEnv.js";
import { describe, it, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { closePrismaResources } from "@repo/db";
import { imobRunCompletedQueue } from "../queues/imobRunCompletedQueue.js";

import {
  incrementCounter,
  getCounterSnapshot,
  renderCountersAsPrometheusText,
  resetCountersForTesting,
  IMOB_WORKER_COUNTER,
} from "../workers/imobWorkerMetrics.js";
import { processImobRunCompletedJob } from "../workers/imobPostRunMutationWorker.js";
import type { ImobWorkerDeps } from "../workers/imobPostRunMutationWorker.js";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TENANT = "tenant-metrics-test";
const WORKSPACE = "ws-metrics-test";
const CASE_ID = "case-metrics-test";

function makeJob(overrides: Record<string, unknown> = {}) {
  return {
    runId: "run-metrics-01",
    tenantId: TENANT,
    workspaceId: WORKSPACE,
    caseId: CASE_ID,
    actionId: "owner.register",
    eventRunId: "evt-metrics-01",
    ...overrides,
  };
}

function makeRun(overrides: Record<string, unknown> = {}) {
  return {
    id: "run-metrics-01",
    status: "success",
    txId: "tx-metrics-01",
    response: { outputs: [] },
    ...overrides,
  };
}

function makeCase(overrides: Record<string, unknown> = {}) {
  return {
    id: CASE_ID,
    tenantId: TENANT,
    workspaceId: WORKSPACE,
    flow: "owner.create",
    stage: "intake",
    status: "pending_data",
    pendingItems: [],
    blockers: [],
    ownerResponsible: "Carlos Mendes",
    owner: null,
    lead: null,
    property: null,
    ...overrides,
  };
}

function makeUpdatedCase() {
  return {
    id: CASE_ID,
    flow: "owner.create",
    stage: "property_collecting",
    status: "ready_for_review",
    nextStep: "Cadastrar imóvel",
    pendingItems: [],
    blockers: [],
    ownerResponsible: "Carlos Mendes",
    owner: null,
    lead: null,
    property: null,
  };
}

function makeDeps(overrides: Partial<{
  run: unknown;
  findFirstResult: unknown;
  existingCaseResult: unknown;
  updateCaseResult: { status: string; data?: unknown };
  getRunFn: (args: unknown) => Promise<unknown>;
}> = {}): ImobWorkerDeps {
  return {
    getRunFn: overrides.getRunFn ?? (async () => overrides.run !== undefined ? overrides.run : makeRun()),
    prisma: {
      imobCaseEvent: {
        findFirst: async () => overrides.findFirstResult ?? null,
        create: async () => ({}),
      },
      imobCase: {
        findFirst: async () => overrides.existingCaseResult !== undefined ? overrides.existingCaseResult : makeCase(),
      },
    } as any,
    mutationServiceFactory: (_p) => ({
      updateCase: async () => overrides.updateCaseResult ?? { status: "updated", data: makeUpdatedCase() },
    }),
  };
}

// Close BullMQ Queue + pg.Pool to prevent event loop hang (both open persistent handles at module import)
after(async () => {
  await imobRunCompletedQueue.close();
  await closePrismaResources();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("[T-M1] mutation_applied increments correct counters", () => {
  beforeEach(() => resetCountersForTesting());

  it("should increment JOBS_RECEIVED and MUTATIONS_APPLIED on happy path", async () => {
    await processImobRunCompletedJob(makeJob(), makeDeps());

    const snap = getCounterSnapshot();

    // JOBS_RECEIVED with actionId label
    const jobsKey = `${IMOB_WORKER_COUNTER.JOBS_RECEIVED}{actionId="owner.register"}`;
    assert.equal(snap.get(jobsKey), 1, `expected ${jobsKey}=1`);

    // MUTATIONS_APPLIED with terminal=false, requiresTxId=true (owner.register)
    const mutKey = `${IMOB_WORKER_COUNTER.MUTATIONS_APPLIED}{actionId="owner.register",requiresTxId="true",terminal="false"}`;
    assert.equal(snap.get(mutKey), 1, `expected ${mutKey}=1`);

    // No SKIPS should have been emitted
    const anySkip = [...snap.keys()].find((k) => k.startsWith(IMOB_WORKER_COUNTER.SKIPS));
    assert.equal(anySkip, undefined, "no skip counter should fire on happy path");
  });

  it("should count terminal action commission.settle with terminal=true", async () => {
    await processImobRunCompletedJob(
      makeJob({ actionId: "commission.settle" }),
      makeDeps({ run: makeRun({ txId: "tx-settle" }) }),
    );

    const snap = getCounterSnapshot();
    const mutKey = `${IMOB_WORKER_COUNTER.MUTATIONS_APPLIED}{actionId="commission.settle",requiresTxId="true",terminal="true"}`;
    assert.equal(snap.get(mutKey), 1, `expected ${mutKey}=1`);
  });
});

describe("[T-M2] simulated skip increments correct counter", () => {
  beforeEach(() => resetCountersForTesting());

  it("should increment SKIPS{reason=simulated} when run output is simulated", async () => {
    const simulatedRun = makeRun({
      response: { outputs: [{ data: { simulated: true } }] },
    });

    await processImobRunCompletedJob(makeJob(), makeDeps({ run: simulatedRun }));

    const snap = getCounterSnapshot();
    const skipKey = `${IMOB_WORKER_COUNTER.SKIPS}{actionId="owner.register",reason="simulated"}`;
    assert.equal(snap.get(skipKey), 1, `expected ${skipKey}=1`);

    // No mutation should fire
    const anyMutation = [...snap.keys()].find((k) => k.startsWith(IMOB_WORKER_COUNTER.MUTATIONS_APPLIED));
    assert.equal(anyMutation, undefined, "no mutation counter should fire for simulated run");
  });
});

describe("[T-M3] run_not_success skip increments correct counter", () => {
  beforeEach(() => resetCountersForTesting());

  it("should increment SKIPS{reason=run_not_success} when run.status=error", async () => {
    await processImobRunCompletedJob(
      makeJob(),
      makeDeps({ run: makeRun({ status: "error" }) }),
    );

    const snap = getCounterSnapshot();
    const skipKey = `${IMOB_WORKER_COUNTER.SKIPS}{actionId="owner.register",reason="run_not_success"}`;
    assert.equal(snap.get(skipKey), 1, `expected ${skipKey}=1`);
  });

  it("should also skip when run.status=pending", async () => {
    await processImobRunCompletedJob(
      makeJob(),
      makeDeps({ run: makeRun({ status: "pending" }) }),
    );

    const snap = getCounterSnapshot();
    const skipKey = `${IMOB_WORKER_COUNTER.SKIPS}{actionId="owner.register",reason="run_not_success"}`;
    assert.equal(snap.get(skipKey), 1, `expected ${skipKey}=1`);
  });
});

describe("[T-M4] already_processed increments correct counter", () => {
  beforeEach(() => resetCountersForTesting());

  it("should increment SKIPS{reason=already_processed} on duplicate job", async () => {
    await processImobRunCompletedJob(
      makeJob(),
      makeDeps({ findFirstResult: { id: "existing-event-id" } }),
    );

    const snap = getCounterSnapshot();
    const skipKey = `${IMOB_WORKER_COUNTER.SKIPS}{actionId="owner.register",reason="already_processed"}`;
    assert.equal(snap.get(skipKey), 1, `expected ${skipKey}=1`);
  });
});

describe("[T-M5] worker failure counter (direct incrementCounter)", () => {
  beforeEach(() => resetCountersForTesting());

  it("should increment FAILURES counter when called directly", () => {
    incrementCounter(IMOB_WORKER_COUNTER.FAILURES, { reason: "job_error" });
    incrementCounter(IMOB_WORKER_COUNTER.FAILURES, { reason: "job_error" });
    incrementCounter(IMOB_WORKER_COUNTER.FAILURES, { reason: "job_permanently_failed" });

    const snap = getCounterSnapshot();
    assert.equal(
      snap.get(`${IMOB_WORKER_COUNTER.FAILURES}{reason="job_error"}`),
      2,
    );
    assert.equal(
      snap.get(`${IMOB_WORKER_COUNTER.FAILURES}{reason="job_permanently_failed"}`),
      1,
    );
  });

  it("should increment receipt_required_no_tx_id skip for HIGH tier without txId", async () => {
    await processImobRunCompletedJob(
      makeJob({ actionId: "owner.register" }),
      makeDeps({ run: makeRun({ txId: null }) }),
    );

    const snap = getCounterSnapshot();
    const skipKey = `${IMOB_WORKER_COUNTER.SKIPS}{actionId="owner.register",reason="receipt_required_no_tx_id"}`;
    assert.equal(snap.get(skipKey), 1, `expected ${skipKey}=1`);
  });

  it("should increment run_not_found skip when run is null", async () => {
    await processImobRunCompletedJob(
      makeJob(),
      makeDeps({ getRunFn: async () => null }),
    );

    const snap = getCounterSnapshot();
    const skipKey = `${IMOB_WORKER_COUNTER.SKIPS}{actionId="owner.register",reason="run_not_found"}`;
    assert.equal(snap.get(skipKey), 1, `expected ${skipKey}=1`);
  });
});

describe("[T-M6] no PII in counter keys", () => {
  beforeEach(() => resetCountersForTesting());

  it("should not include caseId, tenantId, workspaceId or ownerResponsible in any counter key", async () => {
    await processImobRunCompletedJob(makeJob(), makeDeps());

    const snap = getCounterSnapshot();
    const allKeys = [...snap.keys()].join("|");

    assert.ok(!allKeys.includes(CASE_ID), `caseId '${CASE_ID}' must not appear in counter keys`);
    assert.ok(!allKeys.includes(TENANT), `tenantId '${TENANT}' must not appear in counter keys`);
    assert.ok(!allKeys.includes(WORKSPACE), `workspaceId '${WORKSPACE}' must not appear in counter keys`);
    assert.ok(!allKeys.includes("Carlos Mendes"), "ownerResponsible must not appear in counter keys");
  });

  it("should not include PII for simulated path either", async () => {
    await processImobRunCompletedJob(
      makeJob(),
      makeDeps({ run: makeRun({ response: { outputs: [{ data: { simulated: true } }] } }) }),
    );

    const snap = getCounterSnapshot();
    const allKeys = [...snap.keys()].join("|");

    assert.ok(!allKeys.includes(CASE_ID));
    assert.ok(!allKeys.includes(TENANT));
    assert.ok(!allKeys.includes(WORKSPACE));
  });
});

describe("[T-M7] renderCountersAsPrometheusText emits valid format", () => {
  beforeEach(() => resetCountersForTesting());

  it("should return empty string when no counters exist", () => {
    assert.equal(renderCountersAsPrometheusText(), "");
  });

  it("should emit one line per counter key in Prometheus text format", async () => {
    incrementCounter(IMOB_WORKER_COUNTER.JOBS_RECEIVED, { actionId: "owner.register" });
    incrementCounter(IMOB_WORKER_COUNTER.MUTATIONS_APPLIED, { actionId: "owner.register", terminal: "false", requiresTxId: "true" });
    incrementCounter(IMOB_WORKER_COUNTER.SKIPS, { actionId: "lead.qualify", reason: "simulated" });

    const text = renderCountersAsPrometheusText();
    const lines = text.split("\n").filter(Boolean);

    assert.equal(lines.length, 3);

    for (const line of lines) {
      // Each line: metric_name{...} <number>
      assert.match(line, /^[a-z_]+(\{[^}]+\})? \d+$/, `line does not match Prometheus format: ${line}`);
    }

    assert.ok(lines.some((l) => l.startsWith("imob_run_completed_jobs_total")));
    assert.ok(lines.some((l) => l.startsWith("imob_post_run_mutations_applied_total")));
    assert.ok(lines.some((l) => l.startsWith("imob_post_run_skips_total")));
  });

  it("should accumulate counter increments (idempotent key)", () => {
    incrementCounter(IMOB_WORKER_COUNTER.JOBS_RECEIVED, { actionId: "owner.register" });
    incrementCounter(IMOB_WORKER_COUNTER.JOBS_RECEIVED, { actionId: "owner.register" });
    incrementCounter(IMOB_WORKER_COUNTER.JOBS_RECEIVED, { actionId: "owner.register" });

    const snap = getCounterSnapshot();
    assert.equal(
      snap.get(`${IMOB_WORKER_COUNTER.JOBS_RECEIVED}{actionId="owner.register"}`),
      3,
    );
  });
});
