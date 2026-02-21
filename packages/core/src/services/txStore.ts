export type TxStoreStatus = "submitted" | "confirmed" | "failed";

export type TxStoreEntry = {
  tenantId: string;
  workspaceId: string | null;
  runId: string;
  idempotencyKey: string;
  txId: string;
  nonce: string;
  status: TxStoreStatus;
  criticalHash: string;
  chainId: number | null;
  receipt: Record<string, unknown> | null;
  error: string | null;
  updatedAt: string;
};

export type TxStorePrismaLike = {
  guardrailAuditLedger: {
    create: (args: {
      data: {
        tenantId: string;
        workspaceId: string | null;
        runId: string;
        eventType: string;
        severity: string;
        message: string;
        metadata: unknown;
      };
    }) => Promise<unknown>;
    findMany: (args: {
      where: {
        tenantId: string;
        runId?: string;
        eventType?: { startsWith: string };
        createdAt?: { gte: Date };
      };
      orderBy: { createdAt: "desc" };
      take: number;
      select: {
        tenantId: true;
        workspaceId: true;
        runId: true;
        metadata: true;
      };
    }) => Promise<
      Array<{
        tenantId: string;
        workspaceId: string | null;
        runId: string | null;
        metadata: unknown;
      }>
    >;
  };
};

type TxStoreMetadata = {
  schemaVersion: "web3.tx.v1";
  idempotencyKey: string;
  txId: string;
  nonce: string;
  status: TxStoreStatus;
  criticalHash: string;
  chainId: number | null;
  receipt: Record<string, unknown> | null;
  error: string | null;
  updatedAt: string;
};

const STATUS_EVENT_TYPE: Record<TxStoreStatus, string> = {
  submitted: "web3.tx.submitted",
  confirmed: "web3.tx.confirmed",
  failed: "web3.tx.failed",
};

function parseMetadata(value: unknown): TxStoreMetadata | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const meta = value as Record<string, unknown>;
  if (meta.schemaVersion !== "web3.tx.v1") return null;
  if (typeof meta.idempotencyKey !== "string") return null;
  if (typeof meta.txId !== "string") return null;
  if (typeof meta.nonce !== "string") return null;
  if (meta.status !== "submitted" && meta.status !== "confirmed" && meta.status !== "failed") {
    return null;
  }
  return {
    schemaVersion: "web3.tx.v1",
    idempotencyKey: meta.idempotencyKey,
    txId: meta.txId,
    nonce: meta.nonce,
    status: meta.status,
    criticalHash: typeof meta.criticalHash === "string" ? meta.criticalHash : "",
    chainId: typeof meta.chainId === "number" ? meta.chainId : null,
    receipt:
      meta.receipt && typeof meta.receipt === "object" && !Array.isArray(meta.receipt)
        ? (meta.receipt as Record<string, unknown>)
        : null,
    error: typeof meta.error === "string" ? meta.error : null,
    updatedAt: typeof meta.updatedAt === "string" ? meta.updatedAt : new Date(0).toISOString(),
  };
}

function toEntry(params: {
  tenantId: string;
  workspaceId: string | null;
  runId: string;
  metadata: TxStoreMetadata;
}): TxStoreEntry {
  return {
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    runId: params.runId,
    idempotencyKey: params.metadata.idempotencyKey,
    txId: params.metadata.txId,
    nonce: params.metadata.nonce,
    status: params.metadata.status,
    criticalHash: params.metadata.criticalHash,
    chainId: params.metadata.chainId,
    receipt: params.metadata.receipt,
    error: params.metadata.error,
    updatedAt: params.metadata.updatedAt,
  };
}

export class TxStore {
  constructor(private readonly prisma: TxStorePrismaLike) {}

  async append(params: {
    tenantId: string;
    workspaceId?: string | null;
    runId: string;
    idempotencyKey: string;
    txId: string;
    nonce: string;
    status: TxStoreStatus;
    criticalHash: string;
    chainId?: number | null;
    receipt?: Record<string, unknown> | null;
    error?: string | null;
  }) {
    const metadata: TxStoreMetadata = {
      schemaVersion: "web3.tx.v1",
      idempotencyKey: params.idempotencyKey,
      txId: params.txId,
      nonce: params.nonce,
      status: params.status,
      criticalHash: params.criticalHash,
      chainId: params.chainId ?? null,
      receipt: params.receipt ?? null,
      error: params.error ?? null,
      updatedAt: new Date().toISOString(),
    };

    await this.prisma.guardrailAuditLedger.create({
      data: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId ?? null,
        runId: params.runId,
        eventType: STATUS_EVENT_TYPE[params.status],
        severity: params.status === "failed" ? "error" : "info",
        message: `web3 tx ${params.status}`,
        metadata: metadata as any,
      },
    });

    return toEntry({
      tenantId: params.tenantId,
      workspaceId: params.workspaceId ?? null,
      runId: params.runId,
      metadata,
    });
  }

  async latestByIdempotency(params: {
    tenantId: string;
    runId: string;
    idempotencyKey: string;
  }): Promise<TxStoreEntry | null> {
    const rows = await this.prisma.guardrailAuditLedger.findMany({
      where: {
        tenantId: params.tenantId,
        runId: params.runId,
        eventType: { startsWith: "web3.tx." },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        tenantId: true,
        workspaceId: true,
        runId: true,
        metadata: true,
      },
    });

    for (const row of rows) {
      const meta = parseMetadata(row.metadata);
      if (!meta) continue;
      if (meta.idempotencyKey !== params.idempotencyKey) continue;
      return toEntry({
        tenantId: row.tenantId,
        workspaceId: row.workspaceId,
        runId: row.runId ?? params.runId,
        metadata: meta,
      });
    }

    return null;
  }

  async listPending(params: {
    tenantId: string;
    lookbackHours?: number;
    limit?: number;
  }): Promise<TxStoreEntry[]> {
    const lookbackHours = Math.max(1, params.lookbackHours ?? 24);
    const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);
    const rows = await this.prisma.guardrailAuditLedger.findMany({
      where: {
        tenantId: params.tenantId,
        eventType: { startsWith: "web3.tx." },
        createdAt: { gte: since },
      },
      orderBy: { createdAt: "desc" },
      take: Math.max(50, params.limit ?? 500),
      select: {
        tenantId: true,
        workspaceId: true,
        runId: true,
        metadata: true,
      },
    });

    const latestByKey = new Map<string, TxStoreEntry>();
    for (const row of rows) {
      const meta = parseMetadata(row.metadata);
      if (!meta || !row.runId) continue;
      const dedupeKey = `${row.runId}:${meta.idempotencyKey}`;
      if (latestByKey.has(dedupeKey)) continue;
      latestByKey.set(
        dedupeKey,
        toEntry({
          tenantId: row.tenantId,
          workspaceId: row.workspaceId,
          runId: row.runId,
          metadata: meta,
        })
      );
    }

    return Array.from(latestByKey.values())
      .filter((entry) => entry.status === "submitted")
      .slice(0, params.limit ?? 100);
  }
}
