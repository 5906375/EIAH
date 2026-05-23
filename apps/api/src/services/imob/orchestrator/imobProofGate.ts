import type {
  ImobCaseState,
  ImobMissionId,
  ImobMissionPolicy,
  ProofGateResult,
} from "./imobMissionTypes";

export function isProofSatisfied(proofId: string, state: ImobCaseState): boolean {
  switch (proofId) {
    case "evidence_bundle":
      return typeof state.proof.evidenceBundleId === "string" && state.proof.evidenceBundleId.length > 0;
    case "owner_link":
      return typeof state.entities.ownerId === "string" && typeof state.entities.propertyId === "string";
    case "visit_record":
      return typeof state.entities.visitId === "string" && state.entities.visitId.length > 0;
    case "document_package":
      return typeof state.entities.documentPackageId === "string" && state.entities.documentPackageId.length > 0;
    case "snapshot_authoritative":
      return (
        typeof state.proof.snapshotId === "string"
        && state.proof.snapshotId.length > 0
        && state.proof.snapshotVersion === state.audit.version
      );
    case "commission_record":
      return typeof state.entities.commissionId === "string" && state.entities.commissionId.length > 0;
    case "campaign_record":
      return typeof state.entities.campaignId === "string" && state.entities.campaignId.length > 0;
    default:
      return false;
  }
}

export function evaluateProofGate(
  mission: ImobMissionId,
  state: ImobCaseState,
  policy: ImobMissionPolicy,
): ProofGateResult {
  const missingProof = policy.requiredProof.filter((proofId) => !isProofSatisfied(proofId, state));

  if (mission === "case_review" && missingProof.length === 0) {
    return { ok: true, minimumProofSatisfied: true };
  }

  if (missingProof.length > 0) {
    return {
      ok: false,
      minimumProofSatisfied: false,
      reasonCode: "MISSING_REQUIRED_PROOF",
      missingProof,
    };
  }

  return { ok: true, minimumProofSatisfied: true };
}
