import test from "node:test";
import assert from "node:assert/strict";
import type { PrismaClient } from "@repo/db";
import { captureInternalSourceCandidates } from "../../../../scripts/lib/p1InternalSourceCapture.js";
import { createP1InternalSourceReadPort } from "./p1InternalSourceReadPort.js";

const from = "2026-09-14T00:00:00Z", to = "2026-09-21T00:00:00Z", cutoffAt = "2026-09-28T00:00:00Z";
function source(omitSecondPage: boolean) {
  const calls: Array<{ cursor?: string; take: number; skip?: number }> = [];
  const runRows = Array.from({ length: 501 }, (_, n) => ({ id: `r${String(n).padStart(4, "0")}`,
    tenantId: "t", workspaceId: "w", createdAt: new Date(from), finishedAt: null,
    status: "pending", costCents: 0 }));
  const empty = { async count() { return 0; }, async findMany() { return []; } };
  const tx = {
    workspace: { async count() { return 1; }, async findMany() { return [{ id: "w", tenantId: "t" }]; } },
    run: {
      async count() { return runRows.length; },
      async findMany(args: { take: number; skip?: number; cursor?: { id: string } }) {
        calls.push({ cursor: args.cursor?.id, take: args.take, skip: args.skip });
        if (omitSecondPage && args.cursor) return [];
        const start = args.cursor ? runRows.findIndex(row => row.id === args.cursor!.id) + (args.skip ?? 0) : 0;
        return runRows.slice(start, start + args.take);
      },
    },
    runUsageBreakdown: empty, billingLedger: empty, guardrailLedger: empty,
  };
  const prisma = {
    async $transaction<T>(read: (transaction: typeof tx) => Promise<T>, options: { isolationLevel: string }) {
      assert.equal(options.isolationLevel, "RepeatableRead");
      return read(tx);
    },
  } as unknown as PrismaClient;
  return { prisma, calls };
}
const scope = { tenantId: "t", from, to, cutoffAt };
test("exact page boundary fetches the 501st run using an ID cursor", async () => {
  const s = source(false);
  const capture = await captureInternalSourceCandidates(createP1InternalSourceReadPort(s.prisma), scope);
  assert.equal(capture.runs.length, 501);
  assert.equal(capture.counts.pendingRuns, 501);
  assert.equal(capture.runs[500].id, "r0500");
  assert.deepEqual(s.calls, [{ cursor: undefined, take: 500, skip: undefined },
    { cursor: "r0499", take: 500, skip: 1 }]);
  assert.equal(capture.operationalEligibility, "blocked");
});
test("second page missing after a full first page fails against the transaction count", async () => {
  const s = source(true);
  await assert.rejects(captureInternalSourceCandidates(createP1InternalSourceReadPort(s.prisma), scope), /source_count_mismatch/);
  assert.equal(s.calls.length, 2);
});
