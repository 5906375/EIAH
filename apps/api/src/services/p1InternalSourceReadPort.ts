/** Internal P1 capture read adapter. It is not wired to routes, jobs or the legacy reconciler. */
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@repo/db";
import type { InternalFactInput, InternalSourceReadPort, SourceReadScope } from "../../../../scripts/lib/p1InternalSourceCapture.js";

const PAGE_SIZE = 500;
type CursorRow = { id: string };
function fail(reason: string): never { throw new Error(reason); }
/** Count and stable ID cursor are checked inside the read transaction, not against an independent witness. */
async function collect<T extends CursorRow>(
  fetch: (cursor: string | undefined) => Promise<readonly T[]>, count: () => Promise<number>,
): Promise<T[]> {
  const expected = await count();
  if (!Number.isSafeInteger(expected) || expected < 0) fail("invalid_source_count");
  const rows: T[] = [];
  let cursor: string | undefined;
  while (true) {
    const page = await fetch(cursor);
    if (!Array.isArray(page) || page.length > PAGE_SIZE) fail("invalid_source_page");
    for (const row of page) {
      if (!row || typeof row.id !== "string" || !row.id || (cursor !== undefined && row.id <= cursor)) fail("source_cursor_not_increasing");
      rows.push(row); cursor = row.id;
    }
    if (rows.length > expected) fail("source_count_mismatch");
    if (page.length < PAGE_SIZE) break;
  }
  if (rows.length !== expected) fail("source_count_mismatch");
  return rows;
}
function paging(cursor: string | undefined) {
  return { orderBy: { id: "asc" as const }, take: PAGE_SIZE,
    ...(cursor === undefined ? {} : { cursor: { id: cursor }, skip: 1 }) };
}
const utc = (date: Date) => date.toISOString().replace(/\.000Z$/, "Z");

export function createP1InternalSourceReadPort(prisma: PrismaClient): InternalSourceReadPort {
  return {
    withReadView: read => prisma.$transaction(async tx => {
      const snapshotRef = `unverified-read-view:${randomUUID()}`;
      const view = {
        snapshotRef,
        async listWorkspaces(tenantId: string) {
          const where = { tenantId };
          const rows = await collect(
            cursor => tx.workspace.findMany({ where, select: { id: true, tenantId: true }, ...paging(cursor) }),
            () => tx.workspace.count({ where }),
          );
          return rows;
        },
        async listRuns(scope: SourceReadScope) {
          const where = { tenantId: scope.tenantId, createdAt: { gte: new Date(scope.from), lt: new Date(scope.to) } };
          const rows = await collect(
            cursor => tx.run.findMany({ where, select: { id: true, tenantId: true, workspaceId: true, createdAt: true,
              finishedAt: true, status: true, costCents: true }, ...paging(cursor) }),
            () => tx.run.count({ where }),
          );
          return rows.map(row => ({ ...row, createdAt: utc(row.createdAt), finishedAt: row.finishedAt === null ? null : utc(row.finishedAt) }));
        },
        async listFacts(scope: SourceReadScope): Promise<readonly InternalFactInput[]> {
          // Conservatively enumerate every tenant fact in [from, cutoff], including unlinked rows.
          // The applicability rule for facts without a selected run still requires approval.
          const observed = { gte: new Date(scope.from), lte: new Date(scope.cutoffAt) };
          const usageWhere = { tenantId: scope.tenantId, createdAt: observed };
          const debitWhere = { tenantId: scope.tenantId, entryType: "debit", createdAt: observed };
          const authorityWhere = { tenantId: scope.tenantId, actionType: "blocked.guardrails", timestamp: observed };
          const usage = await collect(
            cursor => tx.runUsageBreakdown.findMany({ where: usageWhere, select: { id: true, tenantId: true,
              workspaceId: true, runId: true, createdAt: true }, ...paging(cursor) }),
            () => tx.runUsageBreakdown.count({ where: usageWhere }),
          );
          const debit = await collect(
            cursor => tx.billingLedger.findMany({ where: debitWhere, select: { id: true, tenantId: true,
              workspaceId: true, runId: true, createdAt: true, entryType: true }, ...paging(cursor) }),
            () => tx.billingLedger.count({ where: debitWhere }),
          );
          const authority = await collect(
            cursor => tx.guardrailLedger.findMany({ where: authorityWhere, select: { id: true, tenantId: true,
              runId: true, timestamp: true, actionType: true }, ...paging(cursor) }),
            () => tx.guardrailLedger.count({ where: authorityWhere }),
          );
          return [
            ...usage.map(row => ({ id: row.id, kind: "usage" as const, tenantId: row.tenantId,
              workspaceId: row.workspaceId, runId: row.runId, createdAt: utc(row.createdAt) })),
            ...debit.map(row => ({ id: row.id, kind: "ledger" as const, entryType: "debit" as const,
              tenantId: row.tenantId, workspaceId: row.workspaceId, runId: row.runId, createdAt: utc(row.createdAt) })),
            ...authority.map(row => ({ id: row.id, kind: "authority" as const, actionType: "blocked.guardrails" as const,
              tenantId: row.tenantId, workspaceId: null, runId: row.runId, createdAt: utc(row.timestamp) })),
          ];
        },
      };
      return read(view);
    }, { isolationLevel: "RepeatableRead", maxWait: 5_000, timeout: 60_000 }),
  };
}
