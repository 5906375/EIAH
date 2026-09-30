import test from "node:test";
import assert from "node:assert/strict";
import type { PrismaClient } from "@repo/db";
import { captureInternalSourceCandidates } from "../../../../scripts/lib/p1InternalSourceCapture.js";
import { createP1InternalSourceReadPort } from "./p1InternalSourceReadPort.js";

const from = "2026-09-14T00:00:00Z", to = "2026-09-21T00:00:00Z", cutoffAt = "2026-09-28T00:00:00Z";
const scope = { tenantId: "t", from, to, cutoffAt };
type Row = { id: string; tenantId: string; createdAt?: Date; timestamp?: Date; entryType?: string; actionType?: string };
function source() {
  const trace: string[] = [];
  const data = {
    workspace: [{ id: "w1", tenantId: "t" }, { id: "w2", tenantId: "t" }],
    run: [{ id: "r1", tenantId: "t", workspaceId: "w1", createdAt: new Date(from), finishedAt: null,
      status: "pending", costCents: 0 }],
    runUsageBreakdown: [{ id: "u", tenantId: "t", workspaceId: "w1", runId: "r1", createdAt: new Date("2026-09-25T00:00:00Z") }],
    billingLedger: [{ id: "l", tenantId: "t", workspaceId: null, runId: null, entryType: "debit", createdAt: new Date("2026-09-26T00:00:00Z") },
      { id: "credit", tenantId: "t", workspaceId: "w1", runId: "r1", entryType: "credit", createdAt: new Date("2026-09-26T00:00:00Z") }],
    guardrailLedger: [{ id: "g", tenantId: "t", runId: "r1", actionType: "blocked.guardrails", timestamp: new Date("2026-09-27T00:00:00Z") }],
  };
  let omitRunPage = false, crossTenantWorkspace = false, mutateDuringRead = false;
  const matches = (row: Row, where: Record<string, any>) => row.tenantId === where.tenantId &&
    (!where.entryType || row.entryType === where.entryType) && (!where.actionType || row.actionType === where.actionType) &&
    (!where.createdAt || (!!row.createdAt && row.createdAt >= where.createdAt.gte &&
      (where.createdAt.lt ? row.createdAt < where.createdAt.lt : row.createdAt <= where.createdAt.lte))) &&
    (!where.timestamp || (!!row.timestamp && row.timestamp >= where.timestamp.gte && row.timestamp <= where.timestamp.lte));
  function delegate(name: keyof typeof data) {
    const rows = data[name] as unknown as Row[];
    return {
      async count({ where }: { where: Record<string, any> }) { trace.push(`count:${name}`); return rows.filter(row => matches(row, where)).length + (name === "workspace" && crossTenantWorkspace ? 1 : 0); },
      async findMany({ where, take, cursor }: { where: Record<string, any>; take: number; cursor?: { id: string } }) {
        trace.push(`page:${name}`);
        if (name === "run" && omitRunPage) return [];
        if (name === "workspace" && crossTenantWorkspace) return [...rows, { id: "foreign", tenantId: "other" }].sort((a, b) => a.id.localeCompare(b.id));
        if (name === "run" && mutateDuringRead) rows.splice(0, 1);
        return rows.filter(row => matches(row, where) && (!cursor || row.id > cursor.id))
          .sort((a, b) => a.id.localeCompare(b.id)).slice(0, take);
      },
    };
  }
  const tx = {
    workspace: delegate("workspace"), run: delegate("run"), runUsageBreakdown: delegate("runUsageBreakdown"),
    billingLedger: delegate("billingLedger"), guardrailLedger: delegate("guardrailLedger"),
  };
  const prisma = {
    async $transaction<T>(callback: (transaction: typeof tx) => Promise<T>, options: { isolationLevel: string }) {
      trace.push(`transaction:${options.isolationLevel}`);
      const result = await callback(tx);
      trace.push("transaction:end");
      return result;
    },
  } as unknown as PrismaClient;
  return { prisma, trace, setOmitRunPage(value: boolean) { omitRunPage = value; },
    setCrossTenantWorkspace(value: boolean) { crossTenantWorkspace = value; },
    setMutateDuringRead(value: boolean) { mutateDuringRead = value; } };
}
test("reads pending runs, late and orphan facts in one repeatable read view", async () => {
  const s = source();
  const result = await captureInternalSourceCandidates(createP1InternalSourceReadPort(s.prisma), scope);
  assert.deepEqual(result.workspaceIds, ["w1", "w2"]);
  assert.deepEqual(result.runs.map(r => r.id), ["r1"]);
  assert.deepEqual(result.facts.map(f => f.id), ["g", "l", "u"]);
  assert.equal(result.counts.unresolvedFacts, 1);
  assert.equal(result.snapshotVerification, "not_demonstrated");
  assert.equal(result.watermarkVerification, "not_demonstrated");
  assert.equal(result.operationalEligibility, "blocked");
  assert.equal(s.trace[0], "transaction:RepeatableRead");
  assert.equal(s.trace.at(-1), "transaction:end");
});
test("a missing page compared with the count fails closed", async () => {
  const s = source(); s.setOmitRunPage(true);
  await assert.rejects(captureInternalSourceCandidates(createP1InternalSourceReadPort(s.prisma), scope), /source_count_mismatch/);
});
test("a mixed-tenant workspace is rejected", async () => {
  const s = source(); s.setCrossTenantWorkspace(true);
  await assert.rejects(captureInternalSourceCandidates(createP1InternalSourceReadPort(s.prisma), scope), /workspace_tenant_mismatch/);
});
test("a changing result after the count fails closed", async () => {
  const s = source(); s.setMutateDuringRead(true);
  await assert.rejects(captureInternalSourceCandidates(createP1InternalSourceReadPort(s.prisma), scope), /source_count_mismatch/);
});
