import test from "node:test";
import assert from "node:assert/strict";
import type { ImobMarketScanResultSnapshot, ImobMarketScanRunSnapshot } from "../services/imob/imobConversationContract";
import { judgeMarketScanPolicy } from "../services/imob/marketScan/marketScanPolicyJudge";

const run: ImobMarketScanRunSnapshot = {
  runId: "run-1",
  tenantId: "tenant-1",
  workspaceId: "workspace-1",
  status: "completed",
  sourceIds: ["internal_crm"],
  queryHash: "query-hash",
  evidenceBundleId: "evidence-1",
};

const snapshot: ImobMarketScanResultSnapshot = {
  scanId: "scan-1",
  providerId: "internal_crm",
  sourceStatus: "completed",
  totalItems: 1,
  readOnly: true,
  generatedAt: "2026-05-18T12:00:00.000Z",
  groups: [
    {
      city: "Itajaí",
      goal: "venda",
      items: [
        {
          source: "internal_crm",
          sourceId: "prop-1",
          providerId: "internal_crm",
          retrievedAt: "2026-05-18T12:00:00.000Z",
          city: "Itajaí",
          goal: "venda",
        },
      ],
    },
  ],
};

test("market scan policy judge allows evidenced listings from run", () => {
  const decision = judgeMarketScanPolicy({
    run,
    resultSnapshot: snapshot,
    referencedSourceIds: ["prop-1"],
  });

  assert.equal(decision.allowed, true);
});

test("market scan policy judge blocks missing evidence", () => {
  const decision = judgeMarketScanPolicy({
    run: { ...run, evidenceBundleId: null },
    resultSnapshot: snapshot,
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.reasonCode, "MARKET_SCAN_EVIDENCE_REQUIRED");
});

test("market scan policy judge blocks PII and listings not in run", () => {
  const piiDecision = judgeMarketScanPolicy({
    run,
    resultSnapshot: {
      ...snapshot,
      groups: [{ ...snapshot.groups[0]!, items: [{ ...snapshot.groups[0]!.items[0]!, phone: "47999999999" } as any] }],
    },
  });
  const missingDecision = judgeMarketScanPolicy({
    run,
    resultSnapshot: snapshot,
    referencedSourceIds: ["missing-prop"],
  });

  assert.equal(piiDecision.allowed, false);
  assert.equal(piiDecision.reasonCode, "MARKET_SCAN_PII_BLOCKED");
  assert.equal(missingDecision.allowed, false);
  assert.equal(missingDecision.reasonCode, "MARKET_SCAN_LISTING_NOT_IN_RUN");
});
