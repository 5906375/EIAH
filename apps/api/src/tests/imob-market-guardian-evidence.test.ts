import test from "node:test";
import assert from "node:assert/strict";
import { createMarketScanGuardianEvidence, sha256MarketScanEvidence } from "../services/imob/marketScan/guardianEvidenceHook";

test("market scan guardian evidence creates stable hashes and bundle id", () => {
  const evidence = createMarketScanGuardianEvidence({
    runId: "run-1",
    queryHash: "query-hash",
    sourceSnapshot: { sourceIds: ["internal_crm"], totalItems: 1 },
    normalizedListings: null,
    recommendation: null,
    createdAt: new Date("2026-05-18T12:00:00.000Z"),
  });

  assert.match(evidence.evidenceBundleId, /^mse_/);
  assert.equal(evidence.queryHash, "query-hash");
  assert.equal(evidence.sourceSnapshotHash, sha256MarketScanEvidence({ totalItems: 1, sourceIds: ["internal_crm"] }));
  assert.equal(evidence.createdAt, "2026-05-18T12:00:00.000Z");
});
