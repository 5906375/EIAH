import "./support/testInfraEnv";
import test from "node:test";
import assert from "node:assert/strict";
import {
  archiveRun,
  assertRunArchiveSchemaReady,
} from "../services/runArchiveService";

function isoDaysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function createRun(overrides: Record<string, unknown> = {}) {
  return {
    id: "run-1",
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    userId: null,
    caseId: "case-1",
    threadId: "thread-1",
    agent: "realestate.create_contract",
    agentVersion: "v1",
    assignmentId: null,
    status: "success",
    request: { input: "archive me" },
    response: { ok: true },
    costCents: 1500,
    traceId: "trace-1",
    startedAt: isoDaysAgo(61),
    finishedAt: isoDaysAgo(61),
    errorCode: null,
    approvalStatus: "not_required",
    approvedBy: null,
    approvedAt: null,
    createdAt: isoDaysAgo(61),
    updatedAt: isoDaysAgo(61),
    criticalHash: null,
    sclTxId: null,
    txId: "tx-archive-1",
    ...overrides,
  };
}

function createMockPrisma(params: {
  run?: Record<string, unknown> | null;
  events?: Array<Record<string, unknown>>;
  archived?: boolean;
}) {
  const archives: Array<Record<string, unknown>> = params.archived
    ? [
        {
          id: "archive-1",
          runId: String(params.run?.id ?? "run-1"),
          tenantId: String(params.run?.tenantId ?? "tenant-A"),
          workspaceId: String(params.run?.workspaceId ?? "workspace-A"),
          archiveRef: "run-archive:existing",
          archivedAt: new Date("2026-01-01T00:00:00.000Z"),
          snapshot: { schema: "run.archive.v1" },
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      ]
    : [];
  const run = params.run ?? createRun();
  const events = params.events ?? [
    {
      id: "evt-1",
      runId: String(run.id),
      tenantId: String(run.tenantId),
      workspaceId: String(run.workspaceId),
      type: "run.completed",
      payload: { ok: true },
      criticalHash: null,
      sclTxId: null,
      createdAt: isoDaysAgo(61),
      userId: null,
    },
  ];

  return {
    run: {
      findFirst: async () => run,
      update: async ({ data }: any) => ({ ...run, ...data }),
      findMany: async () => [],
    },
    runArchive: {
      findFirst: async () => archives[0] ?? null,
      create: async ({ data }: any) => {
        archives.push({
          id: data.id,
          runId: data.runId,
          tenantId: data.tenantId,
          workspaceId: data.workspaceId,
          archiveRef: data.archiveRef,
          archivedAt: data.archivedAt,
          snapshot: data.snapshot,
          createdAt: new Date(),
        });
        return data;
      },
    },
    runEvent: {
      findMany: async () => events,
    },
    sclLedger: {
      findMany: async () => [],
    },
    guardrailLedger: {
      findMany: async () => [],
    },
    $executeRaw: async (query: any) => {
      const values = Array.isArray(query?.values) ? query.values : [];
      if (values.length >= 7) {
        archives.push({
          id: String(values[0]),
          runId: String(values[1]),
          tenantId: String(values[2]),
          workspaceId: String(values[3]),
          archiveRef: String(values[4]),
          archivedAt: values[5] as Date,
          snapshot: values[6],
          createdAt: new Date(),
        });
      }
      return 1;
    },
    $transaction: async (operations: any[]) => Promise.all(operations),
    $queryRaw: async (query: any) => {
      const values = Array.isArray(query?.values) ? query.values : [];
      if (values.length === 0) {
        return [{ schemaReady: true }];
      }
      if (values.length >= 3) {
        return archives.filter(
          (item) =>
            item.runId === values[0]
            && item.tenantId === values[1]
            && item.workspaceId === values[2],
        );
      }
      return [];
    },
  };
}

test("archiveRun archives run older than 60 days with snapshot and artifacts", async () => {
  const prisma = createMockPrisma({});

  const result = await archiveRun({
    prisma: prisma as any,
    runId: "run-1",
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    now: new Date(),
  });

  assert.equal(result.status, "archived");
  if (result.status !== "archived") return;
  const snapshot = result.snapshot as Record<string, any>;
  assert.equal(snapshot.schema, "run.archive.v1");
  assert.equal(snapshot.run.id, "run-1");
  assert.equal(snapshot.history.length, 1);
  assert.equal(snapshot.artifacts.receiptPath, `/api/ledger/${encodeURIComponent("tx-archive-1")}`);
  assert.equal(snapshot.artifacts.bundlePath, `/api/runs/${encodeURIComponent("run-1")}/bundle`);
});

test("archiveRun skips recent run and does not archive twice", async () => {
  const recentPrisma = createMockPrisma({
    run: createRun({
      id: "run-recent",
      updatedAt: isoDaysAgo(5),
      createdAt: isoDaysAgo(5),
      startedAt: isoDaysAgo(5),
      finishedAt: isoDaysAgo(5),
    }),
  });
  const recentResult = await archiveRun({
    prisma: recentPrisma as any,
    runId: "run-recent",
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    now: new Date(),
  });
  assert.equal(recentResult.status, "not_eligible");

  const archivedPrisma = createMockPrisma({
    run: createRun({ id: "run-archived" }),
    archived: true,
  });
  const archivedResult = await archiveRun({
    prisma: archivedPrisma as any,
    runId: "run-archived",
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    now: new Date(),
  });
  assert.equal(archivedResult.status, "already_archived");
});

test("archiveRun fails closed when run has no history", async () => {
  const prisma = createMockPrisma({
    run: createRun({ id: "run-no-history" }),
    events: [],
  });

  await assert.rejects(
    () =>
      archiveRun({
        prisma: prisma as any,
        runId: "run-no-history",
        tenantId: "tenant-A",
        workspaceId: "workspace-A",
        now: new Date(),
      }),
    /RUN_ARCHIVE_FAIL_CLOSED_NO_HISTORY/,
  );
});

test("run archive schema preflight is read-only and fails closed before migrations", async () => {
  let executeCalls = 0;
  const prisma = {
    $queryRaw: async () => [{ schemaReady: false }],
    $executeRaw: async () => {
      executeCalls += 1;
      return 0;
    },
    $executeRawUnsafe: async () => {
      executeCalls += 1;
      return 0;
    },
  };

  await assert.rejects(
    () => assertRunArchiveSchemaReady(prisma as any),
    /RUN_ARCHIVE_SCHEMA_NOT_READY/,
  );
  assert.equal(executeCalls, 0);
});
