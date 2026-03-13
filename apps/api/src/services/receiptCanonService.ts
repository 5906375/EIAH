import crypto from "node:crypto";
import type { PoULedgerResolution } from "./pouService";

type InvariantStatus = "ok" | "broken";

type LedgerInvariant = {
  txIdToRunId: boolean;
  runIdToBundleHash: boolean;
  status: InvariantStatus;
  reasons: string[];
};

type Reconciliation = {
  hasRun: boolean;
  hasScl: boolean;
  hasPoU: boolean;
  runSclAligned: boolean;
  runHashAligned: boolean;
  matchedPoUByTxId: boolean;
};

export type ReceiptCanonEnvelope = {
  specVersion: "receipt.canon.v1";
  generatedAt: string;
  receipts: Array<Record<string, unknown>>;
};

type CommonReceiptContext = {
  tenantId: string;
  workspaceId: string;
  runId: string;
  actorId: string | null;
  actorType: "user" | "system";
};

export type BuildReceiptCanonParams = CommonReceiptContext & {
  txId: string;
  bundleHash: string | null;
  invariant: LedgerInvariant;
  reconciliation: Reconciliation;
  pou: PoULedgerResolution;
  trustSnapshot: Record<string, unknown> | null;
  approval: {
    required: boolean;
    status: "not_required" | "pending" | "approved" | "rejected";
    approvalId: string | null;
    approvedBy: string | null;
    approvedAt: string | null;
  };
  delegation: {
    status: "active" | "expired" | "not_delegated";
    delegationId: string | null;
    scope: string[] | null;
    trustMin: number | null;
    validUntil: string | null;
  };
};

function stableSort(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stableSort(item));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return Object.fromEntries(keys.map((key) => [key, stableSort(record[key])]));
}

function receiptHash(payload: Record<string, unknown>) {
  const canonical = JSON.stringify(stableSort(payload));
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

function withMeta(context: CommonReceiptContext, payload: Record<string, unknown>, policy: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  const data = {
    ...payload,
    runId: context.runId,
    actor: {
      id: context.actorId,
      type: context.actorType,
    },
    timestamp,
    policy,
  };
  return {
    ...data,
    hash: receiptHash(data),
  };
}

export function buildTxLinkReceipt(params: BuildReceiptCanonParams) {
  return withMeta(
    params,
    {
      receiptType: "TxLinkReceipt",
      txId: params.txId,
      bundleHash: params.bundleHash,
      invariant: {
        txIdToRunId: params.invariant.txIdToRunId,
        runIdToBundleHash: params.invariant.runIdToBundleHash,
        status: params.invariant.status,
        reasons: params.invariant.reasons,
      },
      reconciliation: params.reconciliation,
      reasonCodes: params.invariant.reasons,
    },
    {
      id: "tx-link.v1",
      source: "ledger.invariant",
      decision: params.invariant.status === "ok" ? "allow" : "block",
    }
  );
}

export function buildPoUReceipt(params: BuildReceiptCanonParams) {
  const matched = params.pou.matchedByTxId;
  return withMeta(
    params,
    {
      receiptType: "PoUReceipt",
      txId: params.txId,
      compositeTxId: matched?.compositeTxId ?? null,
      pouId: matched?.id ?? null,
      actionId: matched?.actionId ?? null,
      status: matched?.status ?? "NOT_FOUND",
      reasonCodes: matched ? [] : ["pou_txid_mismatch"],
    },
    {
      id: "pou.reconciliation.v1",
      source: matched ? "pou.ledger" : "pou.unavailable",
      decision: matched ? "allow" : "observe",
    }
  );
}

export function buildTrustSnapshotReceipt(params: BuildReceiptCanonParams) {
  return withMeta(
    params,
    {
      receiptType: "TrustSnapshotReceipt",
      txId: params.txId,
      snapshot: params.trustSnapshot,
      reasonCodes: params.trustSnapshot ? [] : ["missing_trust_snapshot_for_pou"],
    },
    {
      id: "trust.snapshot.v1",
      source: params.trustSnapshot ? "trust.snapshot" : "trust.unavailable",
      decision: params.trustSnapshot ? "allow" : "observe",
    }
  );
}

export function buildApprovalReceipt(params: BuildReceiptCanonParams) {
  const decisionMap = {
    approved: "APPROVED",
    rejected: "REJECTED",
    pending: "PENDING",
    not_required: "NOT_REQUIRED",
  } as const;
  const approvalDecision = decisionMap[params.approval.status];
  const reasonCodes = params.approval.required && params.approval.status !== "approved" ? ["approval_required"] : [];

  return withMeta(
    params,
    {
      receiptType: "ApprovalReceipt",
      txId: params.txId,
      approvalId: params.approval.approvalId,
      approvedBy: params.approval.approvedBy,
      approvedAt: params.approval.approvedAt,
      required: params.approval.required,
      decision: approvalDecision,
      reasonCodes,
    },
    {
      id: "approval.policy.v1",
      source: params.approval.required ? "approval.policy.required" : "approval.policy.not_required",
      decision: params.approval.required && params.approval.status !== "approved" ? "block" : "allow",
    }
  );
}

export function buildDelegationReceipt(params: BuildReceiptCanonParams) {
  const statusMap = {
    active: "ACTIVE",
    expired: "EXPIRED",
    not_delegated: "NOT_DELEGATED",
  } as const;
  const status = statusMap[params.delegation.status];
  return withMeta(
    params,
    {
      receiptType: "DelegationReceipt",
      txId: params.txId,
      delegationId: params.delegation.delegationId,
      status,
      scope: params.delegation.scope,
      trustMin: params.delegation.trustMin,
      validUntil: params.delegation.validUntil,
      reasonCodes: params.delegation.status === "not_delegated" ? [] : params.delegation.status === "expired" ? ["delegation_expired"] : [],
    },
    {
      id: "delegation.policy.v1",
      source: params.delegation.status === "not_delegated" ? "delegation.absent" : "delegation.policy",
      decision: params.delegation.status === "expired" ? "block" : "allow",
    }
  );
}

export function validateReceiptCanonCriticalChain(params: BuildReceiptCanonParams) {
  const reasonCodes = new Set<string>();
  if (params.invariant.status !== "ok") {
    for (const reason of params.invariant.reasons) reasonCodes.add(reason);
  }
  if (params.reconciliation.matchedPoUByTxId && !params.trustSnapshot) {
    reasonCodes.add("missing_trust_snapshot_for_pou");
  }
  if (params.approval.required && params.approval.status !== "approved") {
    reasonCodes.add("approval_required");
  }
  if (params.delegation.status === "expired") {
    reasonCodes.add("delegation_expired");
  }
  return {
    ok: reasonCodes.size === 0,
    reasonCodes: [...reasonCodes],
  };
}

export function buildLedgerReceiptCanonV1(params: BuildReceiptCanonParams): ReceiptCanonEnvelope {
  return {
    specVersion: "receipt.canon.v1",
    generatedAt: new Date().toISOString(),
    receipts: [
      buildPoUReceipt(params),
      buildTrustSnapshotReceipt(params),
      buildApprovalReceipt(params),
      buildDelegationReceipt(params),
      buildTxLinkReceipt(params),
    ],
  };
}
