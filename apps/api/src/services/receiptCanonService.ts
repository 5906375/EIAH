import crypto from "node:crypto";
import type { PoULedgerResolution } from "./pouService";
import {
  EXECUTION_EVIDENCE_REASON_CODES,
  type ExecutionEvidenceMarker,
} from "./executionEvidence";

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
  execution?: ExecutionEvidenceMarker;
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

export function buildExecutionStateReceipt(params: BuildReceiptCanonParams) {
  if (!params.execution) return null;
  return withMeta(
    params,
    {
      receiptType: "ExecutionStateReceipt",
      txId: params.txId,
      state: params.execution.state,
      containsHistoricalSimulatedOutput: params.execution.containsHistoricalSimulatedOutput,
      reasonCodes: params.execution.reasonCodes,
    },
    {
      id: "execution.evidence.v1",
      source: "run.execution",
      decision: params.execution.state === "real" ? "allow" : "block",
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
  if (params.execution?.state === "historical_simulated") {
    reasonCodes.add(EXECUTION_EVIDENCE_REASON_CODES.simulatedOutput);
  }
  if (params.execution?.state === "blocked") {
    for (const reasonCode of params.execution.reasonCodes) {
      reasonCodes.add(reasonCode);
    }
  }
  return {
    ok: reasonCodes.size === 0,
    reasonCodes: [...reasonCodes],
  };
}

export function buildLedgerReceiptCanonV1(params: BuildReceiptCanonParams): ReceiptCanonEnvelope {
  const executionReceipt = buildExecutionStateReceipt(params);
  return {
    specVersion: "receipt.canon.v1",
    generatedAt: new Date().toISOString(),
    receipts: [
      buildPoUReceipt(params),
      buildTrustSnapshotReceipt(params),
      buildApprovalReceipt(params),
      buildDelegationReceipt(params),
      buildTxLinkReceipt(params),
      ...(executionReceipt ? [executionReceipt] : []),
    ],
  };
}

// --- Economy Receipt v1 ---
// Envelope econômico unificado: run + settlement + dispute + trust + policy.
// Versiona evidência contábil multi-tenant de forma auditável.
// v1.0: bundleHash e executionReceiptHash são nullable (tornados obrigatórios em v1.1).

export type EconomyReceiptEnvelope = {
  specVersion: "economy.receipt.v1";
  generatedAt: string;
  tenantId: string;
  workspaceId: string;
  verticalScope: string;
  agentId: string | null;
  runId: string;
  bundleHash: string | null;
  txId: string | null;
  settlementId: string | null;
  disputeId: string | null;
  executionReceiptHash: string | null;
  trustSnapshot: {
    scoreBefore: number | null;
    scoreAfter: number | null;
    scoreDelta: number;
    policy: string;
  } | null;
  policyDecision: {
    code: string;
    outcome: "approved" | "rejected" | "pending";
    decidedAt: string | null;
    decidedBy: string | null;
  };
  receiptHash: string;
};

export type BuildEconomyReceiptParams = Omit<
  EconomyReceiptEnvelope,
  "specVersion" | "generatedAt" | "receiptHash"
>;

export function buildEconomyReceiptV1(
  params: BuildEconomyReceiptParams
): EconomyReceiptEnvelope {
  const body: Omit<EconomyReceiptEnvelope, "receiptHash"> = {
    specVersion: "economy.receipt.v1",
    generatedAt: new Date().toISOString(),
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    verticalScope: params.verticalScope,
    agentId: params.agentId,
    runId: params.runId,
    bundleHash: params.bundleHash,
    txId: params.txId,
    settlementId: params.settlementId,
    disputeId: params.disputeId,
    executionReceiptHash: params.executionReceiptHash,
    trustSnapshot: params.trustSnapshot,
    policyDecision: params.policyDecision,
  };
  return {
    ...body,
    receiptHash: receiptHash(body as Record<string, unknown>),
  };
}
