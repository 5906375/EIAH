import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRuntimeExecutionProof,
  resolveTurnPresentationProof,
  resolveVisibleMessageProof,
} from "./chatProof";

test("IMOB chat proof helper prioritizes presentation.proof for real-time turns", () => {
  const proof = resolveTurnPresentationProof({
    metadata: {
      canonicalSnapshot: {
        authoritative: true,
        source: "imob_crm_turn_engine",
        variant: "consult",
      },
    },
    proof: {
      required: true,
      ready: false,
      state: "pending",
      runId: "run-turn-1",
      txId: "tx-turn-1",
      receiptPath: "/api/ledger/tx-turn-1",
      bundlePath: null,
      verifyUrl: "/api/ledger/tx-turn-1",
    },
    card: {
      title: "Leitura",
      lines: [],
      runId: "run-card-fallback",
    },
  });

  assert.equal(proof?.required, true);
  assert.equal(proof?.ready, false);
  assert.equal(proof?.state, "pending");
  assert.equal(proof?.runId, "run-turn-1");
  assert.equal(proof?.txId, "tx-turn-1");
});

test("IMOB chat proof helper ignores card.proof on authoritative canonical snapshots", () => {
  const proof = resolveTurnPresentationProof({
    proof: undefined,
    metadata: {
      canonicalSnapshot: {
        authoritative: true,
        source: "imob_crm_turn_engine",
        variant: "consult",
      },
    },
    card: {
      title: "Leitura",
      lines: [],
      runId: "run-card-1",
      proof: {
        required: true,
        ready: true,
        state: "ready",
        txId: "tx-card-1",
        receiptPath: "/api/ledger/tx-card-1",
        bundlePath: "/api/runs/run-card-1/bundle",
      },
    },
  });

  assert.equal(proof, undefined);
});

test("IMOB chat proof helper falls back to card.proof only on non-migrated snapshots", () => {
  const proof = resolveTurnPresentationProof({
    proof: undefined,
    metadata: undefined,
    card: {
      title: "Leitura",
      lines: [],
      runId: "run-card-1",
      proof: {
        required: true,
        ready: true,
        state: "ready",
        txId: "tx-card-1",
        receiptPath: "/api/ledger/tx-card-1",
        bundlePath: "/api/runs/run-card-1/bundle",
      },
    },
  });

  assert.equal(proof?.required, true);
  assert.equal(proof?.ready, true);
  assert.equal(proof?.state, "ready");
  assert.equal(proof?.runId, "run-card-1");
  assert.equal(proof?.bundlePath, "/api/runs/run-card-1/bundle");
});

test("IMOB chat proof helper resolves visible proof from message-level source first", () => {
  const visible = resolveVisibleMessageProof({
    presentationMetadata: {
      canonicalSnapshot: {
        authoritative: true,
        source: "imob_crm_turn_engine",
        variant: "consult",
      },
    },
    proof: {
      required: true,
      ready: false,
      state: "pending",
      runId: "run-msg-1",
      txId: null,
      receiptPath: null,
      bundlePath: null,
      verifyUrl: null,
    },
    card: {
      proof: {
        required: true,
        ready: true,
        state: "ready",
        runId: "run-card-2",
        txId: "tx-card-2",
        receiptPath: "/api/ledger/tx-card-2",
        bundlePath: "/api/runs/run-card-2/bundle",
        verifyUrl: "/api/ledger/tx-card-2",
      },
    },
  });

  assert.equal(visible?.runId, "run-msg-1");
  assert.equal(visible?.state, "pending");
});

test("IMOB chat proof helper does not revive card.proof on authoritative canonical messages", () => {
  const visible = resolveVisibleMessageProof({
    presentationMetadata: {
      canonicalSnapshot: {
        authoritative: true,
        source: "imob_crm_turn_engine",
        variant: "success_updated",
      },
    },
    proof: undefined,
    card: {
      proof: {
        required: true,
        ready: true,
        state: "ready",
        runId: "run-card-only",
        txId: "tx-card-only",
        receiptPath: "/api/ledger/tx-card-only",
        bundlePath: "/api/runs/run-card-only/bundle",
        verifyUrl: "/api/ledger/tx-card-only",
      },
    },
  });

  assert.equal(visible, undefined);
});

test("IMOB chat proof helper builds canonical runtime execution proof", () => {
  const proof = buildRuntimeExecutionProof({
    runId: "run-live-1",
    txId: "tx-live-1",
    receiptPath: "/api/ledger/tx-live-1",
    bundlePath: "/api/runs/run-live-1/bundle",
  });

  assert.equal(proof.required, true);
  assert.equal(proof.ready, true);
  assert.equal(proof.state, "ready");
  assert.equal(proof.verifyUrl, "/api/ledger/tx-live-1");
});
