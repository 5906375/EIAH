import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient, prismaGlobal } from "@repo/db";
import { buildRunEvidenceBundle } from "./evidenceBundle";

const DEFAULT_RETENTION_DAYS = Number(process.env.RUN_ARCHIVE_RETENTION_DAYS ?? 60);

export type RunArchiveRecord = {
  id: string;
  runId: string;
  tenantId: string;
  workspaceId: string;
  archiveRef: string;
  archivedAt: Date;
  snapshot: unknown;
  createdAt: Date;
};

type ScopedRun = Awaited<ReturnType<PrismaClient["run"]["findFirst"]>>;

function resolveClient(client?: PrismaClient) {
  return client ?? prismaGlobal;
}

function retentionDays() {
  return Number.isFinite(DEFAULT_RETENTION_DAYS) && DEFAULT_RETENTION_DAYS > 0 ? DEFAULT_RETENTION_DAYS : 60;
}

function cutoffDate(now: Date, days = retentionDays()) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

export async function ensureRunArchiveTable(prisma?: PrismaClient) {
  const client = resolveClient(prisma);
  await client.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS run_archives (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL UNIQUE,
      tenant_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      archive_ref TEXT NOT NULL UNIQUE,
      archived_at TIMESTAMPTZ NOT NULL,
      snapshot JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await client.$executeRawUnsafe(`
    ALTER TABLE runs
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS archive_ref TEXT
  `);
  await client.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS runs_archive_ref_key
    ON runs(archive_ref)
  `);
  await client.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS runs_archived_at_idx
    ON runs(archived_at)
  `);
  await client.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS run_archives_tenant_workspace_archived_at_idx
    ON run_archives (tenant_id, workspace_id, archived_at DESC)
  `);
}

export function isRunArchiveEligible(
  run: Pick<NonNullable<ScopedRun>, "updatedAt">,
  now = new Date(),
  days = retentionDays(),
) {
  return run.updatedAt.getTime() <= cutoffDate(now, days).getTime();
}

async function getRunArchiveByRunId(params: {
  prisma?: PrismaClient;
  runId: string;
  tenantId: string;
  workspaceId: string;
}) {
  const client = resolveClient(params.prisma);
  await ensureRunArchiveTable(client);
  const rows = await client.$queryRaw<Array<RunArchiveRecord>>(
    Prisma.sql`
      SELECT
        id,
        run_id AS "runId",
        tenant_id AS "tenantId",
        workspace_id AS "workspaceId",
        archive_ref AS "archiveRef",
        archived_at AS "archivedAt",
        snapshot,
        created_at AS "createdAt"
      FROM run_archives
      WHERE run_id = ${params.runId}
        AND tenant_id = ${params.tenantId}
        AND workspace_id = ${params.workspaceId}
      LIMIT 1
    `,
  );
  return rows[0] ?? null;
}

export async function listArchivedRunIds(params: {
  prisma?: PrismaClient;
  tenantId: string;
  workspaceId: string;
}) {
  const client = resolveClient(params.prisma);
  await ensureRunArchiveTable(client);
  const rows = await client.$queryRaw<Array<{ runId: string }>>(
    Prisma.sql`
      SELECT run_id AS "runId"
      FROM run_archives
      WHERE tenant_id = ${params.tenantId}
        AND workspace_id = ${params.workspaceId}
    `,
  );
  return rows.map((row) => row.runId);
}

export async function getRunArchiveMetadataMap(params: {
  prisma?: PrismaClient;
  tenantId: string;
  workspaceId: string;
  runIds: string[];
}) {
  const client = resolveClient(params.prisma);
  await ensureRunArchiveTable(client);
  if (params.runIds.length === 0) return new Map<string, { archiveRef: string; archivedAt: Date }>();
  const rows = await client.$queryRaw<Array<{ runId: string; archiveRef: string; archivedAt: Date }>>(
    Prisma.sql`
      SELECT
        run_id AS "runId",
        archive_ref AS "archiveRef",
        archived_at AS "archivedAt"
      FROM run_archives
      WHERE tenant_id = ${params.tenantId}
        AND workspace_id = ${params.workspaceId}
        AND run_id IN (${Prisma.join(params.runIds)})
    `,
  );
  return new Map(rows.map((row) => [row.runId, { archiveRef: row.archiveRef, archivedAt: row.archivedAt }]));
}

export async function buildRunArchiveSnapshot(params: {
  prisma?: PrismaClient;
  run: NonNullable<ScopedRun>;
}) {
  const client = resolveClient(params.prisma);
  const events = await client.runEvent.findMany({
    where: {
      runId: params.run.id,
      tenantId: params.run.tenantId,
      workspaceId: params.run.workspaceId,
    },
    orderBy: { createdAt: "asc" },
  });
  if (events.length === 0) {
    throw new Error("RUN_ARCHIVE_FAIL_CLOSED_NO_HISTORY");
  }

  const bundle = await buildRunEvidenceBundle({
    prisma: client,
    tenantId: params.run.tenantId,
    workspaceId: params.run.workspaceId,
    runId: params.run.id,
  });
  if (!bundle) {
    throw new Error("RUN_ARCHIVE_FAIL_CLOSED_BUNDLE_UNAVAILABLE");
  }

  const receiptPath = params.run.txId ? `/api/ledger/${encodeURIComponent(params.run.txId)}` : null;
  const bundlePath = `/api/runs/${encodeURIComponent(params.run.id)}/bundle`;

  return {
    schema: "run.archive.v1",
    archivedFrom: "runs",
    run: {
      id: params.run.id,
      tenantId: params.run.tenantId,
      workspaceId: params.run.workspaceId,
      userId: params.run.userId ?? null,
      caseId: params.run.caseId ?? null,
      threadId: params.run.threadId ?? null,
      agent: params.run.agent,
      agentVersion: params.run.agentVersion ?? null,
      assignmentId: params.run.assignmentId ?? null,
      status: params.run.status,
      request: params.run.request ?? null,
      response: params.run.response ?? null,
      costCents: params.run.costCents ?? 0,
      traceId: params.run.traceId ?? null,
      startedAt: params.run.startedAt,
      finishedAt: params.run.finishedAt ?? null,
      errorCode: params.run.errorCode ?? null,
      approvalStatus: params.run.approvalStatus,
      approvedBy: params.run.approvedBy ?? null,
      approvedAt: params.run.approvedAt ?? null,
      createdAt: params.run.createdAt,
      updatedAt: params.run.updatedAt,
      criticalHash: params.run.criticalHash ?? null,
      sclTxId: params.run.sclTxId ?? null,
      txId: params.run.txId ?? null,
    },
    history: events.map((event) => ({
      id: event.id,
      type: event.type,
      payload: event.payload ?? null,
      criticalHash: event.criticalHash ?? null,
      sclTxId: event.sclTxId ?? null,
      createdAt: event.createdAt,
      userId: event.userId ?? null,
    })),
    artifacts: {
      txId: params.run.txId ?? null,
      receiptPath,
      bundlePath,
      bundleHash: bundle.bundleHash,
      hashes: bundle.hashes,
      files: bundle.files,
    },
  };
}

export async function archiveRun(params: {
  prisma?: PrismaClient;
  runId: string;
  tenantId: string;
  workspaceId: string;
  now?: Date;
}) {
  const client = resolveClient(params.prisma);
  await ensureRunArchiveTable(client);

  const run = await client.run.findFirst({
    where: {
      id: params.runId,
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
    },
  });
  if (!run) return { status: "not_found" as const };

  const existing = await getRunArchiveByRunId({
    prisma: client,
    runId: params.runId,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
  });
  if (existing) {
    return { status: "already_archived" as const, archiveRef: existing.archiveRef, archivedAt: existing.archivedAt };
  }

  if (!isRunArchiveEligible(run, params.now)) {
    return { status: "not_eligible" as const };
  }

  const archivedAt = params.now ?? new Date();
  const snapshot = await buildRunArchiveSnapshot({ prisma: client, run });
  const archiveRef = `run-archive:${run.id}:${archivedAt.toISOString()}`;

  const id = randomUUID();
  await client.$executeRaw(
    Prisma.sql`
      INSERT INTO run_archives (
        id,
        run_id,
        tenant_id,
        workspace_id,
        archive_ref,
        archived_at,
        snapshot
      )
      VALUES (
        ${id},
        ${run.id},
        ${run.tenantId},
        ${run.workspaceId},
        ${archiveRef},
        ${archivedAt},
        ${JSON.stringify(snapshot)}::jsonb
      )
    `,
  );
  await client.$executeRaw(
    Prisma.sql`
      UPDATE runs
      SET archived_at = ${archivedAt},
          archive_ref = ${archiveRef}
      WHERE id = ${run.id}
    `,
  );

  return {
    status: "archived" as const,
    archiveRef,
    archivedAt,
    snapshot,
  };
}

export async function archiveEligibleRunsBatch(params: {
  prisma?: PrismaClient;
  now?: Date;
  limit?: number;
}) {
  const client = resolveClient(params.prisma);
  await ensureRunArchiveTable(client);
  const now = params.now ?? new Date();
  const limit = Math.max(1, Math.min(params.limit ?? 100, 500));
  const cutoff = cutoffDate(now);
  const candidates = await client.run.findMany({
    where: {
      updatedAt: { lte: cutoff },
    },
    orderBy: { updatedAt: "asc" },
    take: limit,
  });

  const results: Array<{ runId: string; status: string; archiveRef?: string | null }> = [];
  for (const candidate of candidates) {
    try {
      const result = await archiveRun({
        prisma: client,
        runId: candidate.id,
        tenantId: candidate.tenantId,
        workspaceId: candidate.workspaceId,
        now,
      });
      results.push({
        runId: candidate.id,
        status: result.status,
        archiveRef: "archiveRef" in result ? result.archiveRef ?? null : null,
      });
    } catch (error) {
      results.push({
        runId: candidate.id,
        status: error instanceof Error ? error.message : "archive_failed",
        archiveRef: null,
      });
    }
  }
  return results;
}
