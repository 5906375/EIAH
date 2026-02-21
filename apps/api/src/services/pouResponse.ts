import type { PoUResponseV1 } from "@eiah/contracts";

type PoURecord = {
  id: string;
  tenantId: string;
  workspaceId: string | null;
  runId: string;
  actionId: string;
  status: "PENDING" | "FINALIZED" | "FAILED" | "PENDING_TRUST";
  compositeTxId: string;
  intentHash: string;
  paramsHash: string;
  signatureHash: string;
  resultHash: string;
  trustSnapshot: unknown;
  failureReason: string | null;
  attestationKeyId: string | null;
  attestationSignature: string | null;
  canonicalResultRef: string | null;
  createdAt: Date;
  finalizedAt: Date | null;
};

type AnchoringEvidence = {
  phase4Dependency: "required";
  status: "anchored" | "inconsistent" | "missing_phase4_anchor";
  strength: "strong" | "weak";
  consistent: boolean;
  pointers: {
    runCriticalHash: string | null;
    runSclTxId: string | null;
    runTxId: string | null;
  };
  checks: {
    hasRunPointers: boolean;
    sclFoundByTx: boolean;
    sclFoundByCriticalHash: boolean;
    hashConsistent: boolean;
    txConsistent: boolean;
    signaturePresent: boolean;
    guardrailLinked: boolean;
  };
};

export function toPoUResponseV1(params: {
  record: PoURecord;
  anchoring: AnchoringEvidence;
}): PoUResponseV1 {
  const { record, anchoring } = params;
  return {
    ok: true,
    schemaVersion: "pou.v1",
    data: {
      id: record.id,
      tenantId: record.tenantId,
      workspaceId: record.workspaceId,
      runId: record.runId,
      actionId: record.actionId,
      status: record.status,
      compositeTxId: record.compositeTxId,
      hashes: {
        intentHash: record.intentHash,
        paramsHash: record.paramsHash,
        signatureHash: record.signatureHash,
        resultHash: record.resultHash,
      },
      trustSnapshot:
        record.trustSnapshot && typeof record.trustSnapshot === "object"
          ? (record.trustSnapshot as Record<string, unknown>)
          : null,
      failureReason: record.failureReason,
      attestationKeyId: record.attestationKeyId,
      attestationSignature: record.attestationSignature,
      canonicalResultRef: record.canonicalResultRef,
      createdAt: record.createdAt.toISOString(),
      finalizedAt: record.finalizedAt ? record.finalizedAt.toISOString() : null,
      anchoring,
    },
  };
}
