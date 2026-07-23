import assert from "node:assert/strict";
import test from "node:test";
import { buildRunEvidenceBundle } from "../services/evidenceBundle";
import {
  deriveExecutionEvidence,
  EXECUTION_EVIDENCE_REASON_CODES,
} from "../services/executionEvidence";
import {
  buildLedgerReceiptCanonV1,
  validateReceiptCanonCriticalChain,
  type BuildReceiptCanonParams,
} from "../services/receiptCanonService";
import { verifyReceiptCanonPayload } from "../../../../scripts/verify-receipt-canon";

function baseParams(execution: BuildReceiptCanonParams["execution"]): BuildReceiptCanonParams {
  return {
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    runId: "run-1",
    actorId: "user-1",
    actorType: "user",
    txId: "tx-1234567890123456",
    bundleHash: "bundle-hash",
    invariant: {
      txIdToRunId: true,
      runIdToBundleHash: true,
      status: "ok",
      reasons: [],
    },
    reconciliation: {
      hasRun: true,
      hasScl: true,
      hasPoU: false,
      runSclAligned: true,
      runHashAligned: true,
      matchedPoUByTxId: false,
    },
    pou: {
      matchedByTxId: null,
      receiptsByRun: [],
    } as BuildReceiptCanonParams["pou"],
    trustSnapshot: null,
    approval: {
      required: false,
      status: "not_required",
      approvalId: null,
      approvedBy: null,
      approvedAt: null,
    },
    delegation: {
      status: "not_delegated",
      delegationId: null,
      scope: null,
      trustMin: null,
      validUntil: null,
    },
    execution,
  };
}

function ledgerPayload(params: BuildReceiptCanonParams, ok: boolean) {
  const receiptCanon = buildLedgerReceiptCanonV1(params);
  const reasonCodes = params.execution?.reasonCodes ?? [];
  return {
    ok,
    ...(ok ? {} : { error: { code: "RECEIPT_CANON_INCONSISTENT", reasonCodes } }),
    txId: params.txId,
    run: ok
      ? { id: params.runId, bundleHash: params.bundleHash, status: params.execution?.state }
      : undefined,
    runId: ok ? undefined : params.runId,
    invariant: params.invariant,
    receiptCanon,
  };
}

function fakePrisma(run: Record<string, unknown>) {
  return {
    run: { findFirst: async () => run },
    runEvent: { findMany: async () => [] },
    sclLedger: { findMany: async () => [] },
    guardrailLedger: { findMany: async () => [] },
  } as never;
}

test("execution evidence classifies real, blocked, and historical simulated runs", () => {
  assert.deepEqual(
    deriveExecutionEvidence({ status: "success", errorCode: null, response: { outputs: [{ ok: true }] } }),
    { state: "real", reasonCodes: [], containsHistoricalSimulatedOutput: false }
  );
  assert.deepEqual(
    deriveExecutionEvidence({
      status: "error",
      errorCode: "MCP_TOOL_CONTRACT_MISSING",
      response: { error: "missing" },
    }),
    {
      state: "blocked",
      reasonCodes: ["MCP_TOOL_CONTRACT_MISSING"],
      containsHistoricalSimulatedOutput: false,
    }
  );
  assert.deepEqual(
    deriveExecutionEvidence({ status: "error", errorCode: null, response: { error: "unknown" } }),
    {
      state: "blocked",
      reasonCodes: ["EXECUTION_FAILED"],
      containsHistoricalSimulatedOutput: false,
    }
  );
  assert.deepEqual(
    deriveExecutionEvidence({
      status: "success",
      errorCode: null,
      response: { outputs: [{ data: { ok: true, simulated: true } }] },
    }),
    {
      state: "historical_simulated",
      reasonCodes: ["SIMULATED_OUTPUT_IN_CRITICAL_CHAIN"],
      containsHistoricalSimulatedOutput: true,
    }
  );
});

test("Receipt Canon validates real execution and exposes blocked reasonCode", () => {
  const real = baseParams(deriveExecutionEvidence({ status: "success", errorCode: null, response: {} }));
  const blocked = baseParams(
    deriveExecutionEvidence({
      status: "error",
      errorCode: EXECUTION_EVIDENCE_REASON_CODES.missingToolContract,
      response: {},
    })
  );

  assert.deepEqual(validateReceiptCanonCriticalChain(real), { ok: true, reasonCodes: [] });
  assert.deepEqual(validateReceiptCanonCriticalChain(blocked), {
    ok: false,
    reasonCodes: ["MCP_TOOL_CONTRACT_MISSING"],
  });
  const receipt = buildLedgerReceiptCanonV1(blocked).receipts.find(
    (item) => item.receiptType === "ExecutionStateReceipt"
  );
  assert.equal(receipt?.state, "blocked");
  assert.deepEqual(receipt?.reasonCodes, ["MCP_TOOL_CONTRACT_MISSING"]);
});

test("Receipt Canon preserves historical simulated data but rejects it as a real critical chain", () => {
  const historical = baseParams(
    deriveExecutionEvidence({
      status: "success",
      errorCode: null,
      response: { outputs: [{ data: { simulated: true, historicalPayload: "still-readable" } }] },
    })
  );
  const envelope = buildLedgerReceiptCanonV1(historical);

  assert.equal(envelope.specVersion, "receipt.canon.v1");
  assert.equal(
    envelope.receipts.find((item) => item.receiptType === "ExecutionStateReceipt")
      ?.containsHistoricalSimulatedOutput,
    true
  );
  assert.deepEqual(validateReceiptCanonCriticalChain(historical), {
    ok: false,
    reasonCodes: ["SIMULATED_OUTPUT_IN_CRITICAL_CHAIN"],
  });
});

test("bundle manifest marks real, blocked, and historical simulated execution", async () => {
  const runs = [
    { id: "real", status: "success", errorCode: null, response: { outputs: [{ ok: true }] } },
    {
      id: "blocked",
      status: "error",
      errorCode: "MCP_TOOL_CONTRACT_MISSING",
      response: { error: "missing" },
    },
    {
      id: "historical",
      status: "success",
      errorCode: null,
      response: { outputs: [{ data: { simulated: true } }] },
    },
  ];

  const bundles = await Promise.all(
    runs.map((run) =>
      buildRunEvidenceBundle({
        prisma: fakePrisma({
          ...run,
          request: {},
        }),
        tenantId: "tenant-1",
        workspaceId: "workspace-1",
        runId: run.id,
      })
    )
  );

  assert.equal(bundles[0]?.manifest.execution.state, "real");
  assert.equal(bundles[1]?.manifest.execution.state, "blocked");
  assert.deepEqual(bundles[1]?.manifest.execution.reasonCodes, ["MCP_TOOL_CONTRACT_MISSING"]);
  assert.equal(bundles[2]?.manifest.execution.state, "historical_simulated");
  assert.equal(bundles[2]?.manifest.execution.containsHistoricalSimulatedOutput, true);
});

test("external verifier distinguishes real, governed block, and historical simulated evidence", () => {
  const real = baseParams(deriveExecutionEvidence({ status: "success", errorCode: null, response: {} }));
  const blocked = baseParams(
    deriveExecutionEvidence({
      status: "error",
      errorCode: "MCP_TOOL_CONTRACT_MISSING",
      response: {},
    })
  );
  const historical = baseParams(
    deriveExecutionEvidence({
      status: "success",
      errorCode: null,
      response: { outputs: [{ simulated: true }] },
    })
  );

  const realVerification = verifyReceiptCanonPayload(ledgerPayload(real, true), true);
  const blockedVerification = verifyReceiptCanonPayload(ledgerPayload(blocked, false), true);
  const historicalVerification = verifyReceiptCanonPayload(ledgerPayload(historical, false), true);

  assert.equal(realVerification.ok, true);
  assert.equal(realVerification.state, "real");
  assert.equal(blockedVerification.ok, true);
  assert.equal(blockedVerification.state, "blocked");
  assert.equal(historicalVerification.ok, false);
  assert.equal(historicalVerification.state, "historical_simulated");
  assert.ok(historicalVerification.errors.includes("SIMULATED_OUTPUT_IN_CRITICAL_CHAIN"));
});

test("external verifier remains backward-compatible with v1 envelopes without the additive receipt", () => {
  const legacy = baseParams(undefined);
  const verification = verifyReceiptCanonPayload(ledgerPayload(legacy, true), true);

  assert.equal(verification.ok, true);
  assert.equal(verification.state, "unknown");
  assert.equal(verification.verified.receiptCount, 5);
});
