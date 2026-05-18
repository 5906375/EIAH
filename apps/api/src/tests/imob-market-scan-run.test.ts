import test from "node:test";
import assert from "node:assert/strict";
import {
  blockMarketScanRun,
  completeMarketScanRun,
  computeMarketScanQueryHash,
  createMarketScanRun,
  markMarketScanAuthorizationStarted,
  markMarketScanFetchStarted,
  markMarketScanNormalizationStarted,
  markMarketScanRecommendationStarted,
  markMarketScanScoringStarted,
} from "../services/imob/marketScan/imobMarketScanRunStore";

function createFakePrisma() {
  const rows = new Map<string, any>();
  const calls: Array<{ op: "create" | "update"; data: any }> = [];
  return {
    calls,
    prisma: {
      imobMarketScanRun: {
        async create(args: any) {
          const row = { ...args.data };
          rows.set(row.id, row);
          calls.push({ op: "create", data: row });
          return row;
        },
        async update(args: any) {
          const current = rows.get(args.where.id);
          assert.ok(current, "run must exist before update");
          const row = { ...current, ...args.data };
          rows.set(args.where.id, row);
          calls.push({ op: "update", data: row });
          return row;
        },
      },
    },
  };
}

test("market scan run is created before authorization and keeps query hash/source ids", async () => {
  const fake = createFakePrisma();
  const query = {
    city: "São Paulo",
    neighborhood: "Pinheiros",
    operation: "sale",
    propertyType: "apartamento",
  };

  const run = await createMarketScanRun({
    prisma: fake.prisma,
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    caseId: "case-1",
    query,
    region: "Pinheiros",
    operation: "sale",
    propertyType: "apartamento",
    sourceIds: ["internal_crm"],
    accessMode: "internal_crm",
  });
  const auth = await markMarketScanAuthorizationStarted({ prisma: fake.prisma, runId: run.runId });

  assert.equal(fake.calls[0]?.op, "create");
  assert.equal(fake.calls[1]?.data.status, "authorization");
  assert.equal(run.status, "requested");
  assert.equal(auth.status, "authorization");
  assert.equal(run.queryHash, computeMarketScanQueryHash({ propertyType: "apartamento", operation: "sale", neighborhood: "Pinheiros", city: "São Paulo" }));
  assert.deepEqual(run.sourceIds, ["internal_crm"]);
});

test("market scan run records pipeline transitions and completion evidence", async () => {
  const fake = createFakePrisma();
  const run = await createMarketScanRun({
    prisma: fake.prisma,
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    query: { city: "Itajaí" },
    sourceIds: ["tenant_inventory_import"],
    accessMode: "tenant_inventory_import",
  });

  await markMarketScanFetchStarted({ prisma: fake.prisma, runId: run.runId });
  await markMarketScanNormalizationStarted({ prisma: fake.prisma, runId: run.runId });
  await markMarketScanScoringStarted({ prisma: fake.prisma, runId: run.runId });
  await markMarketScanRecommendationStarted({ prisma: fake.prisma, runId: run.runId });
  const completed = await completeMarketScanRun({
    prisma: fake.prisma,
    runId: run.runId,
    resultSnapshot: { totalItems: 2 },
    evidenceBundleId: "evidence-1",
    recommendationId: "rec-1",
    opportunityId: "opp-1",
  });

  assert.equal(completed.status, "completed");
  assert.equal(completed.evidenceBundleId, "evidence-1");
  assert.deepEqual(
    fake.calls.filter((call) => call.op === "update").map((call) => call.data.status),
    ["fetch", "normalization", "scoring", "recommendation", "completed"],
  );
});

test("market scan run persists fail-closed blocks with reason code context", async () => {
  const fake = createFakePrisma();
  const run = await createMarketScanRun({
    prisma: fake.prisma,
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    query: { city: "Itajaí" },
    sourceIds: ["public_web_assisted"],
    accessMode: "public_web_assisted",
  });
  const decision = {
    allowed: false as const,
    decision: "blocked_fail_closed" as const,
    sourceId: "public_web_assisted",
    requestedMode: "public_web_assisted" as const,
    reasonCode: "PII_EXPOSURE_RISK" as const,
    message: "PII blocked",
  };

  const blocked = await blockMarketScanRun({
    prisma: fake.prisma,
    runId: run.runId,
    reason: decision.reasonCode,
    sourceAccessDecision: decision,
  });

  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.sourceAccessDecision?.allowed, false);
  assert.equal(fake.calls.at(-1)?.data.failureReason, "PII_EXPOSURE_RISK");
});
