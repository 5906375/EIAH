import { Web3Executor } from "./web3Executor";
import { TxStore, type TxStorePrismaLike } from "./txStore";

export type Web3ReconcileResult = {
  scanned: number;
  confirmed: number;
  failed: number;
  pending: number;
};

export async function reconcileWeb3Transactions(params: {
  prisma: TxStorePrismaLike & {
    run: {
      updateMany: (args: {
        where: { id: string; tenantId: string };
        data: { txId: string; sclTxId: string };
      }) => Promise<unknown>;
    };
    guardrailLedger: {
      updateMany: (args: {
        where: { runId: string; tenantId: string; txId: null };
        data: { txId: string };
      }) => Promise<unknown>;
    };
    proofOfUsage: {
      updateMany: (args: {
        where: {
          runId: string;
          tenantId: string;
          OR: Array<{ canonicalResultRef: null } | { canonicalResultRef: "" }>;
        };
        data: { canonicalResultRef: string };
      }) => Promise<unknown>;
    };
    guardrailAuditLedger: TxStorePrismaLike["guardrailAuditLedger"];
  };
  tenantId: string;
  limit?: number;
  lookbackHours?: number;
}) {
  const txStore = new TxStore(params.prisma);
  const executor = new Web3Executor(txStore, {
    failClosed: false,
  });

  const pending = await txStore.listPending({
    tenantId: params.tenantId,
    limit: params.limit ?? 100,
    lookbackHours: params.lookbackHours ?? 24,
  });

  const result: Web3ReconcileResult = {
    scanned: pending.length,
    confirmed: 0,
    failed: 0,
    pending: 0,
  };

  for (const item of pending) {
    const checked = await executor.checkReceipt(item.txId);
    if (checked.status === "pending") {
      result.pending += 1;
      continue;
    }

    await txStore.append({
      tenantId: item.tenantId,
      workspaceId: item.workspaceId,
      runId: item.runId,
      idempotencyKey: item.idempotencyKey,
      txId: item.txId,
      nonce: item.nonce,
      status: checked.status,
      criticalHash: item.criticalHash,
      chainId: item.chainId,
      receipt: checked.receipt,
      error: checked.status === "failed" ? "receipt_status_failed" : null,
    });

    if (checked.status === "failed") {
      result.failed += 1;
      await params.prisma.guardrailAuditLedger.create({
        data: {
          tenantId: item.tenantId,
          workspaceId: item.workspaceId,
          runId: item.runId,
          eventType: "web3.reconcile.failed",
          severity: "error",
          message: "Web3 tx reconciliation marked as failed",
          metadata: {
            txId: item.txId,
            idempotencyKey: item.idempotencyKey,
          } as any,
        },
      });
      continue;
    }

    result.confirmed += 1;

    await params.prisma.run.updateMany({
      where: {
        id: item.runId,
        tenantId: item.tenantId,
      },
      data: {
        txId: item.txId,
        sclTxId: item.txId,
      },
    });

    await params.prisma.guardrailLedger.updateMany({
      where: {
        runId: item.runId,
        tenantId: item.tenantId,
        txId: null,
      },
      data: {
        txId: item.txId,
      },
    });

    await params.prisma.proofOfUsage.updateMany({
      where: {
        runId: item.runId,
        tenantId: item.tenantId,
        OR: [{ canonicalResultRef: null }, { canonicalResultRef: "" }],
      },
      data: {
        canonicalResultRef: `onchain:${item.txId}`,
      },
    });

    await params.prisma.guardrailAuditLedger.create({
      data: {
        tenantId: item.tenantId,
        workspaceId: item.workspaceId,
        runId: item.runId,
        eventType: "web3.reconcile.linked",
        severity: "info",
        message: "Run/SCL/PoU linked with on-chain txId",
        metadata: {
          txId: item.txId,
          idempotencyKey: item.idempotencyKey,
          receipt: checked.receipt,
        } as any,
      },
    });
  }

  return result;
}
