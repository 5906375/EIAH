/** Characterization established against the original adapter, before extraction. No infrastructure. */
import test from "node:test";
import assert from "node:assert/strict";
import { getBillingReconciliationSummary } from "../../apps/api/src/services/billingReconciliation.js";

const run = (id: string, costCents: number | null = 100) => ({ id, workspaceId: "w", agent: "a", traceId: null, costCents, status: "success", errorCode: null });
const usage = (id: string, runId: string, amountCents: number | null = 100) => ({ id, runId, workspaceId: "w", requestId: "request", meterType: "tokens", amountCents });
const ledger = (id: string, runId: string | null, amountCents: number | null = 100) => ({ id, runId, workspaceId: "w", requestId: "request", entryType: "debit", amountCents });
function mock(runs: unknown[], breakdowns: unknown[], ledgers: unknown[]) {
  const calls: Record<string, any> = {};
  const table = (key: string, rows: unknown[]) => ({ findMany: async (args: unknown) => { calls[key] = args; return rows; } });
  return { calls, prisma: { run: table("run", runs), runUsageBreakdown: table("usage", breakdowns), billingLedger: table("ledger", ledgers), guardrailLedger: table("authority", []) } as any };
}
test("legacy exact response, filters, full-read caps and mismatch precedence", async () => {
  const { prisma, calls } = mock([run("bad", 101), run("good")], [usage("u1", "bad"), usage("u2", "good")], [ledger("l1", "bad", 90), { ...ledger("l2", "good"), requestId: "other" }]);
  const from = new Date("2026-09-14T00:00:00Z"), to = new Date("2026-09-21T00:00:00Z");
  const result = await getBillingReconciliationSummary(prisma, { tenantId: "t", workspaceId: "w", from, to, coverageMode: "full", limit: 1 });
  assert.deepEqual(result, {
    filters: { tenantId: "t", workspaceId: "w", runId: null, agent: null, from: from.toISOString(), to: to.toISOString(), limit: 1 },
    totals: { runsChecked: 2, breakdownRows: 2, ledgerRows: 2, auditGapCount: 1, authorityUnresolvedCount: 0, orphanUsageCount: 0, duplicateChargesCount: 0, ledgerGapCount: 0, missingBreakdownCount: 0, missingLedgerCount: 0, costMismatchCount: 1 },
    items: { auditGaps: [{ runId: "bad", workspaceId: "w", agent: "a", traceId: null, runCostCents: 101, breakdownCostCents: 100, ledgerCostCents: 90, issue: "run_vs_breakdown_mismatch" }], authorityUnresolved: [], orphanUsage: [], duplicateCharges: [], ledgerGaps: [] },
  });
  assert.deepEqual(calls.run.where, { tenantId: "t", workspaceId: "w", finishedAt: { not: null }, createdAt: { gte: from, lt: to } });
  assert.deepEqual(calls.usage.where.createdAt, calls.ledger.where.createdAt);
  assert.equal(calls.run.take, undefined); assert.equal(calls.usage.take, undefined);
  assert.deepEqual(calls.authority.where, { tenantId: "t", actionType: "blocked.guardrails", timestamp: { gte: from, lt: to } });
});
test("legacy presentation truncates orphan/gap counts, duplicates counted before truncation, null money becomes zero", async () => {
  const { prisma, calls } = mock([run("r", null)], [usage("u", "r", null), usage("x", "outside"), usage("y", "elsewhere")], [ledger("a", "r", null), ledger("b", "r", 0), ledger("c", "r", 0), { ...ledger("d", null), workspaceId: null }]);
  const result = await getBillingReconciliationSummary(prisma, { tenantId: "t", limit: 1 });
  assert.equal(result.totals.auditGapCount, 0);
  assert.equal(result.totals.duplicateChargesCount, 2);
  assert.deepEqual(result.items.duplicateCharges, [{ runId: "r", workspaceId: "w", requestId: "request", count: 3, amountCents: 0 }]);
  assert.equal(result.totals.orphanUsageCount, 1); assert.equal(result.items.orphanUsage[0].runId, "outside");
  assert.equal(result.totals.ledgerGapCount, 1); assert.equal(result.items.ledgerGaps[0].issue, "missing_workspace");
  assert.equal(calls.run.take, 1); assert.equal(calls.usage.take, 20); assert.equal(calls.ledger.take, 20);
});
test("legacy agent filter drops unlinked ledger rows; null/empty request IDs do not count duplicate effects", async () => {
  const { prisma } = mock([run("r", 0)], [usage("u", "r", 0)], [{ ...ledger("a", "r", 0), requestId: null }, { ...ledger("b", "r", 0), requestId: null }, ledger("c", "outside")]);
  const r = await getBillingReconciliationSummary(prisma, { tenantId: "t", agent: "a" });
  assert.equal(r.totals.ledgerRows, 2); assert.equal(r.totals.duplicateChargesCount, 0); assert.equal(r.totals.ledgerGapCount, 0);
});
