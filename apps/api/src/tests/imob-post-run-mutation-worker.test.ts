// Phase 4.1c — ImobPostRunMutationWorker tests (T1–T10)
//
// INVARIANTES VERIFICADOS:
// 1. IMOB_RUN_OUTCOME_MAP cobre exatamente os 12 actionIds canônicos
// 2. simulated=true → processImobRunCompletedJob retorna sem mutar
// 3. run.status !== "success" → retorna sem mutar
// 4. requiresTxId=true && txId=null → retorna sem mutar
// 5. Idempotência DB por runId → retorna sem mutar se já processado
// 6. Happy path → updateCase é chamado com os campos corretos
// 7. ImobCase.status nunca é decidido fora do backend (esta função)

import "./support/testInfraEnv.js";
import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import {
  IMOB_RUN_OUTCOME_MAP,
  computeNextPendingItems,
  resolveImobReceiptPaths,
  processImobRunCompletedJob,
} from "../workers/imobPostRunMutationWorker.js";
import { IMOB_DISPATCHER_ACTION_IDS } from "../services/imob/crm/imobCrmActionDispatcher.js";
import type { ImobRunCompletedJobPayload } from "../queues/imobRunCompletedQueue.js";
import type { ImobWorkerDeps } from "../workers/imobPostRunMutationWorker.js";

// ─── Helpers for test stub construction ──────────────────────────────────────

function makeJob(overrides: Partial<ImobRunCompletedJobPayload> = {}): ImobRunCompletedJobPayload {
  return {
    runId: "run-001",
    tenantId: "t-001",
    workspaceId: "w-001",
    caseId: "case-001",
    actionId: "owner.register",
    eventRunId: "run-001",
    receiptPath: null,
    bundlePath: null,
    ...overrides,
  };
}

function makeRun(overrides: Record<string, unknown> = {}) {
  return {
    id: "run-001",
    tenantId: "t-001",
    workspaceId: "w-001",
    userId: "user-001",
    status: "success",
    txId: "tx-abc123",
    approvalStatus: "approved",
    approvedBy: "director@acme.test",
    approvedAt: new Date("2026-06-28T10:00:00.000Z"),
    response: null,
    ...overrides,
  };
}

function makeCase(overrides: Record<string, unknown> = {}) {
  return {
    id: "case-001",
    tenantId: "t-001",
    workspaceId: "w-001",
    flow: "owner.create",
    stage: "intake",
    status: "pending_data",
    ownerResponsible: "João Silva",
    nextStep: null,
    blockers: [],
    pendingItems: ["Proprietário pendente de cadastro"],
    owner: null,
    property: null,
    lead: null,
    ...overrides,
  };
}

function makeUpdatedCase(overrides: Record<string, unknown> = {}) {
  return {
    id: "case-001",
    flow: "owner.create",
    stage: "property_collecting",
    status: "ready_for_review",
    ownerResponsible: "João Silva",
    nextStep: "Cadastrar o imóvel do proprietário para avançar a captação",
    blockers: [],
    pendingItems: [],
    owner: null,
    property: null,
    lead: null,
    ...overrides,
  };
}

function noop() {}

function makeDeps(overrides: Partial<ImobWorkerDeps> & {
  findFirstResult?: unknown;
  updateCaseResult?: unknown;
  existingCaseResult?: unknown;
} = {}): ImobWorkerDeps {
  const findFirstResult =
    overrides.findFirstResult !== undefined ? overrides.findFirstResult : null;
  const updateCaseResult = overrides.updateCaseResult ?? {
    status: "updated",
    data: makeUpdatedCase(),
    previous: makeCase(),
  };
  const existingCaseResult =
    overrides.existingCaseResult !== undefined ? overrides.existingCaseResult : makeCase();

  const prisma = {
    imobCaseEvent: {
      findFirst: async () => findFirstResult,
      create: async () => ({ id: "event-001" }),
    },
    imobCase: {
      findFirst: async () => existingCaseResult,
    },
  } as unknown as ImobWorkerDeps["prisma"];

  const mutationServiceFactory = (_p: unknown) => ({
    updateCase: async (_scope: unknown, _caseId: string, _input: unknown) => updateCaseResult,
  });

  return {
    getRunFn: overrides.getRunFn ?? (async () => makeRun()),
    prisma,
    mutationServiceFactory: overrides.mutationServiceFactory ?? (mutationServiceFactory as any),
  };
}

// ─── T1: IMOB_RUN_OUTCOME_MAP coverage ───────────────────────────────────────

describe("[T1] Phase 4.1c — IMOB_RUN_OUTCOME_MAP covers all 12 IMOB_DISPATCHER_ACTION_IDS", () => {
  it("should have exactly 12 keys in IMOB_RUN_OUTCOME_MAP", () => {
    assert.equal(Object.keys(IMOB_RUN_OUTCOME_MAP).length, 12);
  });

  it("should have an outcome entry for every IMOB_DISPATCHER_ACTION_IDS member", () => {
    for (const actionId of IMOB_DISPATCHER_ACTION_IDS) {
      const outcome = IMOB_RUN_OUTCOME_MAP[actionId];
      assert.ok(outcome, `Missing outcome for actionId: ${actionId}`);
      assert.ok(typeof outcome.stage === "string" && outcome.stage.length > 0, `${actionId}.stage must be non-empty string`);
      assert.ok(typeof outcome.status === "string" && outcome.status.length > 0, `${actionId}.status must be non-empty string`);
      assert.ok(typeof outcome.requiresTxId === "boolean", `${actionId}.requiresTxId must be boolean`);
      assert.ok(typeof outcome.isTerminal === "boolean", `${actionId}.isTerminal must be boolean`);
    }
  });

  it("commission.settle should be the only terminal action", () => {
    const terminalActions = Object.entries(IMOB_RUN_OUTCOME_MAP)
      .filter(([, v]) => v.isTerminal)
      .map(([k]) => k);
    assert.deepEqual(terminalActions, ["commission.settle"]);
  });

  it("commission.settle outcome should have stage=done and status=done", () => {
    const outcome = IMOB_RUN_OUTCOME_MAP["commission.settle"];
    assert.equal(outcome.stage, "done");
    assert.equal(outcome.status, "done");
    assert.equal(outcome.nextStep, null);
  });
});

// ─── T2: computeNextPendingItems ─────────────────────────────────────────────

describe("[T2] Phase 4.1c — computeNextPendingItems semantics", () => {
  it("should remove exact matches by substring (case-insensitive)", () => {
    const result = computeNextPendingItems(
      ["Proprietário pendente de cadastro", "Outro item"],
      [],
      ["Proprietário pendente de cadastro"],
    );
    assert.deepEqual(result, ["Outro item"]);
  });

  it("should add new items without duplicates", () => {
    const result = computeNextPendingItems(
      ["Outro item"],
      ["Ativação do anúncio pendente"],
      [],
    );
    assert.deepEqual(result, ["Outro item", "Ativação do anúncio pendente"]);
  });

  it("should not duplicate an item already present", () => {
    const result = computeNextPendingItems(
      ["Ativação do anúncio pendente"],
      ["Ativação do anúncio pendente"],
      [],
    );
    assert.equal(result.length, 1);
    assert.equal(result[0], "Ativação do anúncio pendente");
  });

  it("should return empty array when isTerminal=true pattern (cleared)", () => {
    const result = computeNextPendingItems(
      ["Item A", "Item B", "Item C"],
      [],
      [],
    );
    // For terminal: caller passes [] for add/remove, so result equals current
    // The terminal case clears by bypassing computeNextPendingItems entirely
    // This test verifies the function doesn't auto-clear
    assert.equal(result.length, 3);
  });

  it("should handle remove that partially matches existing items", () => {
    const result = computeNextPendingItems(
      ["Dados do proprietário ausentes", "Imóvel pendente de cadastro"],
      [],
      ["Dados do proprietário ausentes", "Imóvel pendente de cadastro"],
    );
    assert.deepEqual(result, []);
  });
});

// ─── T3: resolveImobReceiptPaths ─────────────────────────────────────────────

describe("[T3] Phase 4.1c — resolveImobReceiptPaths with and without txId", () => {
  it("should return receiptPath when txId is present", () => {
    const { receiptPath, bundlePath } = resolveImobReceiptPaths({ id: "run-abc", txId: "tx-xyz" });
    assert.equal(receiptPath, "/api/ledger/tx-xyz");
    assert.equal(bundlePath, "/api/runs/run-abc/bundle");
  });

  it("should return null receiptPath when txId is null", () => {
    const { receiptPath, bundlePath } = resolveImobReceiptPaths({ id: "run-abc", txId: null });
    assert.equal(receiptPath, null);
    assert.equal(bundlePath, "/api/runs/run-abc/bundle");
  });

  it("should URL-encode special characters in txId and runId", () => {
    const { receiptPath, bundlePath } = resolveImobReceiptPaths({ id: "run/a b", txId: "tx/a b" });
    assert.equal(receiptPath, "/api/ledger/tx%2Fa%20b");
    assert.equal(bundlePath, "/api/runs/run%2Fa%20b/bundle");
  });
});

// ─── T4: Guard — missing required fields ──────────────────────────────────────

describe("[T4] Phase 4.1c — processImobRunCompletedJob skips on missing required fields", () => {
  it("should return without calling getRun when caseId is empty", async () => {
    let getRuncalled = false;
    const deps = makeDeps({
      getRunFn: async () => { getRuncalled = true; return makeRun(); },
    });
    const job = makeJob({ caseId: "" });
    await processImobRunCompletedJob(job, deps);
    assert.equal(getRuncalled, false, "getRun should NOT be called when caseId is empty");
  });

  it("should return without calling getRun when actionId is empty string", async () => {
    let getRuncalled = false;
    const deps = makeDeps({
      getRunFn: async () => { getRuncalled = true; return makeRun(); },
    });
    const job = makeJob({ actionId: "" });
    await processImobRunCompletedJob(job, deps);
    assert.equal(getRuncalled, false, "getRun should NOT be called when actionId is empty");
  });

  it("should return without calling getRun when runId is missing", async () => {
    let getRuncalled = false;
    const deps = makeDeps({
      getRunFn: async () => { getRuncalled = true; return makeRun(); },
    });
    const job = makeJob({ runId: "" });
    await processImobRunCompletedJob(job, deps);
    assert.equal(getRuncalled, false, "getRun should NOT be called when runId is empty");
  });
});

// ─── T5: Guard — unknown actionId ─────────────────────────────────────────────

describe("[T5] Phase 4.1c — processImobRunCompletedJob skips on unknown actionId", () => {
  it("should return without calling getRun when actionId is not in IMOB_DISPATCHER_ACTION_IDS", async () => {
    let getRuncalled = false;
    const deps = makeDeps({
      getRunFn: async () => { getRuncalled = true; return makeRun(); },
    });
    const job = makeJob({ actionId: "unknown.action.not.canonical" });
    await processImobRunCompletedJob(job, deps);
    assert.equal(getRuncalled, false, "getRun should NOT be called for unknown actionId");
  });

  it("should return without calling getRun when actionId is an injection attempt", async () => {
    let getRuncalled = false;
    const deps = makeDeps({
      getRunFn: async () => { getRuncalled = true; return makeRun(); },
    });
    const job = makeJob({ actionId: "'; DROP TABLE imob_cases; --" });
    await processImobRunCompletedJob(job, deps);
    assert.equal(getRuncalled, false, "getRun should NOT be called for injected actionId");
  });
});

// ─── T6: Guard — run.status !== "success" ─────────────────────────────────────

describe("[T6] Phase 4.1c — processImobRunCompletedJob skips mutation when run.status !== success", () => {
  it("should NOT call updateCase when run.status is 'failed'", async () => {
    let updateCaseCalled = false;
    const deps = makeDeps({
      getRunFn: async () => makeRun({ status: "failed" }),
      mutationServiceFactory: () => ({
        updateCase: async () => { updateCaseCalled = true; return { status: "updated", data: makeUpdatedCase() }; },
      }),
    });
    await processImobRunCompletedJob(makeJob(), deps);
    assert.equal(updateCaseCalled, false, "updateCase must NOT be called when run failed");
  });

  it("should NOT call updateCase when run.status is 'pending'", async () => {
    let updateCaseCalled = false;
    const deps = makeDeps({
      getRunFn: async () => makeRun({ status: "pending" }),
      mutationServiceFactory: () => ({
        updateCase: async () => { updateCaseCalled = true; return { status: "updated", data: makeUpdatedCase() }; },
      }),
    });
    await processImobRunCompletedJob(makeJob(), deps);
    assert.equal(updateCaseCalled, false, "updateCase must NOT be called when run is pending");
  });
});

// ─── T7: Guard — simulated=true ───────────────────────────────────────────────

describe("[T7] Phase 4.1c — processImobRunCompletedJob skips mutation when simulated=true", () => {
  it("should NOT call updateCase when run.response.outputs[].data.simulated=true", async () => {
    let updateCaseCalled = false;
    const deps = makeDeps({
      getRunFn: async () => makeRun({
        status: "success",
        txId: "tx-123",
        response: {
          outputs: [{ stepId: "s1", data: { ok: true, simulated: true, action: "realestate.register_property" } }],
        },
      }),
      mutationServiceFactory: () => ({
        updateCase: async () => { updateCaseCalled = true; return { status: "updated", data: makeUpdatedCase() }; },
      }),
    });
    await processImobRunCompletedJob(makeJob({ actionId: "owner.register" }), deps);
    assert.equal(updateCaseCalled, false, "updateCase must NOT be called for simulated run");
  });
});

// ─── T8: Guard — requiresTxId=true && txId=null ───────────────────────────────

describe("[T8] Phase 4.1c — processImobRunCompletedJob skips mutation when requiresTxId=true and no txId", () => {
  it("should NOT call updateCase for owner.register (requiresTxId=true) when txId=null", async () => {
    let updateCaseCalled = false;
    const deps = makeDeps({
      getRunFn: async () => makeRun({ status: "success", txId: null }),
      mutationServiceFactory: () => ({
        updateCase: async () => { updateCaseCalled = true; return { status: "updated", data: makeUpdatedCase() }; },
      }),
    });
    await processImobRunCompletedJob(makeJob({ actionId: "owner.register" }), deps);
    assert.equal(updateCaseCalled, false, "updateCase must NOT be called when requiresTxId=true and txId=null");
  });

  it("should call updateCase for lead.qualify (requiresTxId=false) even when txId=null", async () => {
    let updateCaseCalled = false;
    const deps = makeDeps({
      getRunFn: async () => makeRun({ status: "success", txId: null }),
      mutationServiceFactory: () => ({
        updateCase: async () => { updateCaseCalled = true; return { status: "updated", data: makeUpdatedCase() }; },
      }),
    });
    await processImobRunCompletedJob(makeJob({ actionId: "lead.qualify" }), deps);
    assert.equal(updateCaseCalled, true, "updateCase SHOULD be called when requiresTxId=false even without txId");
  });
});

describe("[T8b] Phase 4.1c — processImobRunCompletedJob blocks HIGH mutation when approval is absent or invalid", () => {
  it("should NOT call updateCase for contract.prepare when approval is missing", async () => {
    let updateCaseCalled = false;
    const blockedPayloads: Array<Record<string, unknown>> = [];
    const deps = makeDeps({
      getRunFn: async () =>
        makeRun({
          approvalStatus: "not_required",
          approvedBy: null,
          approvedAt: null,
        }),
      findFirstResult: null,
      existingCaseResult: makeCase(),
      mutationServiceFactory: () => ({
        updateCase: async () => {
          updateCaseCalled = true;
          return { status: "updated", data: makeUpdatedCase() };
        },
      }),
    });
    (deps.prisma as any).imobCaseEvent.create = async ({ data }: { data: Record<string, unknown> }) => {
      blockedPayloads.push(data.payload as Record<string, unknown>);
      return { id: "event-approval-blocked" };
    };

    await processImobRunCompletedJob(makeJob({ actionId: "contract.prepare" }), deps);

    assert.equal(updateCaseCalled, false, "updateCase must NOT be called when approval is missing");
    assert.equal(blockedPayloads[0]?.reasonCode, "APPROVAL_REQUIRED");
  });

  it("should NOT call updateCase for commission.settle when approval is expired", async () => {
    let updateCaseCalled = false;
    const blockedPayloads: Array<Record<string, unknown>> = [];
    const deps = makeDeps({
      getRunFn: async () =>
        makeRun({
          request: {
            metadata: {
              approvalExpiresAt: "2026-06-28T09:00:00.000Z",
            },
          },
        }),
      findFirstResult: null,
      existingCaseResult: makeCase(),
      mutationServiceFactory: () => ({
        updateCase: async () => {
          updateCaseCalled = true;
          return { status: "updated", data: makeUpdatedCase() };
        },
      }),
    });
    (deps.prisma as any).imobCaseEvent.create = async ({ data }: { data: Record<string, unknown> }) => {
      blockedPayloads.push(data.payload as Record<string, unknown>);
      return { id: "event-approval-expired" };
    };

    await processImobRunCompletedJob(makeJob({ actionId: "commission.settle" }), deps);

    assert.equal(updateCaseCalled, false, "updateCase must NOT be called when approval is expired");
    assert.equal(blockedPayloads[0]?.reasonCode, "APPROVAL_EXPIRED");
  });
});

// ─── T9: Guard — DB idempotency (already processed) ──────────────────────────

describe("[T9] Phase 4.1c — processImobRunCompletedJob skips mutation when already processed", () => {
  it("should NOT call updateCase when an ImobCaseEvent with same runId+type already exists", async () => {
    let updateCaseCalled = false;
    const deps = makeDeps({
      getRunFn: async () => makeRun({ status: "success", txId: "tx-abc" }),
      findFirstResult: { id: "existing-event-001" },
      mutationServiceFactory: () => ({
        updateCase: async () => { updateCaseCalled = true; return { status: "updated", data: makeUpdatedCase() }; },
      }),
    });
    await processImobRunCompletedJob(makeJob({ actionId: "owner.register" }), deps);
    assert.equal(updateCaseCalled, false, "updateCase must NOT be called when already processed");
  });
});

// ─── T10: Happy path — mutation applied ───────────────────────────────────────

describe("[T10] Phase 4.1c — processImobRunCompletedJob calls updateCase on happy path", () => {
  it("should call updateCase with correct stage/status from outcome map for owner.register", async () => {
    let capturedInput: unknown = null;
    let capturedCaseId: string | null = null;

    const deps = makeDeps({
      getRunFn: async () => makeRun({ status: "success", txId: "tx-abc" }),
      findFirstResult: null,
      existingCaseResult: makeCase({ pendingItems: ["Proprietário pendente de cadastro"] }),
      mutationServiceFactory: () => ({
        updateCase: async (_scope: unknown, caseId: string, input: unknown) => {
          capturedCaseId = caseId;
          capturedInput = input;
          return { status: "updated", data: makeUpdatedCase(), previous: makeCase() };
        },
      }),
    });

    await processImobRunCompletedJob(makeJob({ actionId: "owner.register" }), deps);

    assert.ok(capturedInput, "updateCase must have been called");
    assert.equal(capturedCaseId, "case-001");

    const input = capturedInput as Record<string, unknown>;
    assert.equal(input.stage, "property_collecting", "stage must match outcome map for owner.register");
    assert.equal(input.status, "ready_for_review", "status must match outcome map for owner.register");
    assert.equal(input.eventType, "case.action.completed");
    assert.equal(input.eventActorType, "system");

    const payload = input.eventPayload as Record<string, unknown>;
    assert.equal(payload.actionId, "owner.register");
    assert.equal(payload.approvalDecision, "APPROVAL_GRANTED");
    assert.equal(payload.approvalStatus, "approved");
    assert.equal(payload.receiptPath, "/api/ledger/tx-abc");
    assert.equal(payload.bundlePath, "/api/runs/run-001/bundle");
  });

  it("should clear pendingItems for commission.settle (terminal action)", async () => {
    let capturedInput: unknown = null;

    const terminalCase = makeCase({
      ownerResponsible: "Carlos Mendes",
      pendingItems: ["Assinatura pendente", "Documentos aguardando"],
      blockers: ["Algum blocker"],
    });

    const deps = makeDeps({
      getRunFn: async () => makeRun({ status: "success", txId: "tx-com-001" }),
      findFirstResult: null,
      existingCaseResult: terminalCase,
      mutationServiceFactory: () => ({
        updateCase: async (_scope: unknown, _caseId: string, input: unknown) => {
          capturedInput = input;
          return {
            status: "updated",
            data: makeUpdatedCase({ stage: "done", status: "done", pendingItems: [], blockers: [] }),
            previous: terminalCase,
          };
        },
      }),
    });

    await processImobRunCompletedJob(makeJob({ actionId: "commission.settle" }), deps);

    assert.ok(capturedInput, "updateCase must have been called for commission.settle");
    const input = capturedInput as Record<string, unknown>;
    assert.equal(input.stage, "done");
    assert.equal(input.status, "done");
    assert.deepEqual(input.pendingItems, [], "pendingItems must be cleared for terminal action");
    assert.deepEqual(input.blockers, [], "blockers must be cleared for terminal action");
  });

  it("should NOT call updateCase when commission.settle and ownerResponsible is null", async () => {
    let updateCaseCalled = false;

    const deps = makeDeps({
      getRunFn: async () => makeRun({ status: "success", txId: "tx-com-002" }),
      findFirstResult: null,
      existingCaseResult: makeCase({ ownerResponsible: null }),
      mutationServiceFactory: () => ({
        updateCase: async () => { updateCaseCalled = true; return { status: "updated", data: makeUpdatedCase() }; },
      }),
    });

    await processImobRunCompletedJob(makeJob({ actionId: "commission.settle" }), deps);
    assert.equal(updateCaseCalled, false, "updateCase must NOT be called for commission.settle without ownerResponsible");
  });
});
