import assert from "node:assert/strict";
import test from "node:test";

import {
  APE_WEEKLY_CYCLE_V2_SCHEMA_VERSION,
  canonicalizeApeWeeklyCycleV2,
  hashApeWeeklyCycleV2,
  validateApeWeeklyCycleV2,
  type ApeWeeklyCycleV2,
} from "../src/apeWeeklyCycleV2.js";

const DIGEST = `sha256:${"a".repeat(64)}`;
const RECEIPT_HASH_PLACEHOLDER = "0".repeat(64);

function metric(value = 0) {
  return {
    value,
    source: "ledger" as const,
    method: {
      id: "ape-reconciliation-ledger-query",
      version: "v2",
      queryRef: "scripts/queries/ape-reconciliation.v2",
    },
    observedWindow: {
      startedAt: "2026-07-21T12:00:00.000Z",
      endedAt: "2026-07-28T12:00:00.000Z",
    },
    sourceDigest: DIGEST,
  };
}

function validFixture(): ApeWeeklyCycleV2 {
  const fixture: ApeWeeklyCycleV2 = {
    schemaVersion: APE_WEEKLY_CYCLE_V2_SCHEMA_VERSION,
    cycleId: "APE-49",
    runNumber: 49,
    observedAt: "2026-07-28T12:00:00.000Z",
    metrics: {
      auditGap: metric(0),
      duplicateSideEffects: metric(0),
    },
    artifact: {
      repo: "5906375/EIAH",
      commit: "1".repeat(40),
      workflowRunId: "30351755718",
      jobId: "90250620689",
      artifactId: "8654657401",
      artifactDigest: DIGEST,
    },
    decision: {
      hardMetricsGo: true,
      decision: "GO",
      hardReasons: [],
      nonRegressionGo: true,
    },
    ratification: {
      status: "pending",
      prNumber: 404,
    },
    receipt: {
      id: "ape-weekly-cycle-49",
      hash: RECEIPT_HASH_PLACEHOLDER,
      reasonCode: "AUDIT_BLOCKER",
      timestamp: "2026-07-28T12:00:00.000Z",
    },
  };

  fixture.receipt.hash = hashApeWeeklyCycleV2(fixture);
  return fixture;
}

function invalidFixture(
  mutate: (fixture: Record<string, any>) => void,
  recomputeHash = true,
): Record<string, any> {
  const fixture = structuredClone(validFixture()) as Record<string, any>;
  mutate(fixture);
  if (recomputeHash && fixture.receipt) {
    fixture.receipt.hash = hashApeWeeklyCycleV2(fixture as ApeWeeklyCycleV2);
  }
  return fixture;
}

test("accepts an honest measurement artifact that remains pending ratification", () => {
  const result = validateApeWeeklyCycleV2(validFixture());

  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.ratification.status, "pending");
});

test("rejects a missing schemaVersion", () => {
  const fixture = invalidFixture((candidate) => delete candidate.schemaVersion);
  assert.equal(validateApeWeeklyCycleV2(fixture).success, false);
});

test("rejects an unexpected schemaVersion", () => {
  const fixture = invalidFixture(
    (candidate) => {
      candidate.schemaVersion = "ape.weekly-cycle.v1";
    },
    false,
  );
  assert.equal(validateApeWeeklyCycleV2(fixture).success, false);
});

test("rejects evidence attempting to be born human-verified", () => {
  const fixture = invalidFixture(
    (candidate) => {
      candidate.ratification.status = "human-verified";
      candidate.ratification.mergeActor = "5906375";
    },
    false,
  );
  assert.equal(validateApeWeeklyCycleV2(fixture).success, false);
});

test("accepts auditGap zero when it has complete measured provenance", () => {
  const fixture = validFixture();
  assert.equal(fixture.metrics.auditGap.value, 0);
  assert.equal(validateApeWeeklyCycleV2(fixture).success, true);
});

test("rejects zero without a sourceDigest", () => {
  const fixture = invalidFixture((candidate) => {
    delete candidate.metrics.auditGap.sourceDigest;
  });
  assert.equal(validateApeWeeklyCycleV2(fixture).success, false);
});

test("rejects a missing receipt", () => {
  const fixture = invalidFixture(
    (candidate) => delete candidate.receipt,
    false,
  );
  assert.equal(validateApeWeeklyCycleV2(fixture).success, false);
});

test("rejects a receipt hash that diverges from canonical content", () => {
  const fixture = validFixture();
  fixture.metrics.auditGap.value = 1;
  assert.equal(validateApeWeeklyCycleV2(fixture).success, false);
});

test("rejects hardMetricsGo false", () => {
  const fixture = invalidFixture(
    (candidate) => {
      candidate.decision.hardMetricsGo = false;
    },
    false,
  );
  assert.equal(validateApeWeeklyCycleV2(fixture).success, false);
});

test("rejects decision NO_GO", () => {
  const fixture = invalidFixture(
    (candidate) => {
      candidate.decision.decision = "NO_GO";
    },
    false,
  );
  assert.equal(validateApeWeeklyCycleV2(fixture).success, false);
});

test("canonicalization and hash are deterministic across key insertion order", () => {
  const fixture = validFixture();
  const reordered = {
    receipt: fixture.receipt,
    ratification: fixture.ratification,
    decision: fixture.decision,
    artifact: fixture.artifact,
    metrics: fixture.metrics,
    observedAt: fixture.observedAt,
    runNumber: fixture.runNumber,
    cycleId: fixture.cycleId,
    schemaVersion: fixture.schemaVersion,
  } as ApeWeeklyCycleV2;

  assert.equal(
    canonicalizeApeWeeklyCycleV2(reordered),
    canonicalizeApeWeeklyCycleV2(fixture),
  );
  assert.equal(hashApeWeeklyCycleV2(reordered), hashApeWeeklyCycleV2(fixture));
});

test("rejects a self-declared mergeActor even while status is pending", () => {
  const fixture = invalidFixture(
    (candidate) => {
      candidate.ratification.mergeActor = "github-actions[bot]";
    },
    false,
  );
  assert.equal(validateApeWeeklyCycleV2(fixture).success, false);
});
