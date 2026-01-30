import { Prisma, prismaGlobal, type PrismaClient } from "@repo/db";

export type ReconcileLedgerOptions = {
  tenantId: string;
  since?: Date;
  until?: Date;
  limit?: number;
  actionTypes?: string[];
  guardrailCursorId?: string;
  sclCursorId?: string;
  persistReport?: boolean;
  prisma?: PrismaClient;
};

export type ReconcileLedgerResult = {
  checkedGuardrail: number;
  checkedScl: number;
  nextGuardrailCursorId?: string;
  nextSclCursorId?: string;
  missingInScl: Array<{
    guardrailId: string;
    runId: string | null;
    actionType: string;
    criticalHash: string;
    txId: string | null;
    timestamp: Date;
  }>;
  missingInGuardrail: Array<{
    sclId: string;
    runId: string;
    criticalHash: string;
    txId: string;
    createdAt: Date;
  }>;
  mismatchedTx: Array<{
    guardrailId: string;
    sclId: string;
    criticalHash: string;
    guardrailTxId: string | null;
    sclTxId: string;
  }>;
};

export async function reconcileLedgerService(
  options: ReconcileLedgerOptions
): Promise<ReconcileLedgerResult> {
  const client = options.prisma ?? prismaGlobal;
  const since = options.since ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const until = options.until ?? new Date();
  const limit = options.limit ?? 1000;
  const actionTypes = options.actionTypes?.length ? options.actionTypes : undefined;

  const [guardrailRows, sclRows] = await Promise.all([
    client.guardrailLedger.findMany({
      where: {
        tenantId: options.tenantId,
        timestamp: { gte: since, lte: until },
        ...(actionTypes ? { actionType: { in: actionTypes } } : {}),
      },
      select: {
        id: true,
        runId: true,
        actionType: true,
        criticalHash: true,
        txId: true,
        timestamp: true,
      },
      take: limit,
      orderBy: { timestamp: "desc" },
      ...(options.guardrailCursorId
        ? { cursor: { id: options.guardrailCursorId }, skip: 1 }
        : {}),
    }),
    client.sclLedger.findMany({
      where: {
        tenantId: options.tenantId,
        createdAt: { gte: since, lte: until },
      },
      select: {
        id: true,
        runId: true,
        criticalHash: true,
        txId: true,
        createdAt: true,
      },
      take: limit,
      orderBy: { createdAt: "desc" },
      ...(options.sclCursorId ? { cursor: { id: options.sclCursorId }, skip: 1 } : {}),
    }),
  ]);

  const sclByCritical = new Map<string, (typeof sclRows)[number]>();
  const sclByTx = new Map<string, (typeof sclRows)[number]>();
  for (const row of sclRows) {
    sclByCritical.set(row.criticalHash, row);
    sclByTx.set(row.txId, row);
  }

  const guardrailByCritical = new Map<string, (typeof guardrailRows)[number]>();
  for (const row of guardrailRows) {
    guardrailByCritical.set(row.criticalHash, row);
  }

  const missingInScl: ReconcileLedgerResult["missingInScl"] = [];
  const mismatchedTx: ReconcileLedgerResult["mismatchedTx"] = [];

  for (const row of guardrailRows) {
    const sclMatch = sclByCritical.get(row.criticalHash);
    if (!sclMatch) {
      missingInScl.push({
        guardrailId: row.id,
        runId: row.runId ?? null,
        actionType: row.actionType,
        criticalHash: row.criticalHash,
        txId: row.txId ?? null,
        timestamp: row.timestamp,
      });
      continue;
    }

    if (row.txId && row.txId !== sclMatch.txId) {
      mismatchedTx.push({
        guardrailId: row.id,
        sclId: sclMatch.id,
        criticalHash: row.criticalHash,
        guardrailTxId: row.txId,
        sclTxId: sclMatch.txId,
      });
    }
  }

  const missingInGuardrail: ReconcileLedgerResult["missingInGuardrail"] = [];
  for (const row of sclRows) {
    if (!guardrailByCritical.has(row.criticalHash)) {
      missingInGuardrail.push({
        sclId: row.id,
        runId: row.runId,
        criticalHash: row.criticalHash,
        txId: row.txId,
        createdAt: row.createdAt,
      });
    }
  }

  const result: ReconcileLedgerResult = {
    checkedGuardrail: guardrailRows.length,
    checkedScl: sclRows.length,
    nextGuardrailCursorId: guardrailRows.at(-1)?.id,
    nextSclCursorId: sclRows.at(-1)?.id,
    missingInScl,
    missingInGuardrail,
    mismatchedTx,
  };

  if (options.persistReport) {
    const metadata: Prisma.InputJsonValue = {
      window: { since: since.toISOString(), until: until.toISOString() },
      checkedGuardrail: result.checkedGuardrail,
      checkedScl: result.checkedScl,
      missingInSclCount: result.missingInScl.length,
      missingInGuardrailCount: result.missingInGuardrail.length,
      mismatchedTxCount: result.mismatchedTx.length,
      sample: {
        missingInScl: result.missingInScl.slice(0, 20),
        missingInGuardrail: result.missingInGuardrail.slice(0, 20),
        mismatchedTx: result.mismatchedTx.slice(0, 20),
      },
      cursors: {
        guardrail: result.nextGuardrailCursorId ?? null,
        scl: result.nextSclCursorId ?? null,
      },
      actionTypes: actionTypes ?? null,
    };

    await client.guardrailAuditLedger.create({
      data: {
        tenantId: options.tenantId,
        eventType: "ledger.reconcile",
        severity: result.mismatchedTx.length || result.missingInScl.length ? "warn" : "info",
        message: "Ledger reconciliation report",
        metadata,
      },
    });
  }

  return result;
}
