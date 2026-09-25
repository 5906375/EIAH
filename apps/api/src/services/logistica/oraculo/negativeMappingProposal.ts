import { getReasonCodeDefinition } from "../../../../../../packages/core/src/reasons/reasonCatalog.js";

// Ratified SIMULATION mapping, prepared locally for dedicated activation review.
export const S1_NEGATIVE_MAPPING_PROPOSALS = [
  {
    "finding": "RV01",
    "candidateCode": "ORACULO_INPUT_INVALID",
    "target": "REQUEST_ERROR",
    "outcome": null,
    "requiresNoEffectProof": false
  },
  {
    "finding": "RV02",
    "candidateCode": "ORACULO_SCOPE_DENIED",
    "target": "REQUEST_ERROR",
    "outcome": null,
    "requiresNoEffectProof": false
  },
  {
    "finding": "RV03",
    "candidateCode": "ORACULO_EXTERNAL_EFFECT_BLOCKED",
    "target": "REQUEST_ERROR",
    "outcome": null,
    "requiresNoEffectProof": false
  },
  {
    "finding": "RV04",
    "candidateCode": "ORACULO_VISIT_NOT_RESOLVED",
    "target": "REQUEST_ERROR",
    "outcome": null,
    "requiresNoEffectProof": false
  },
  {
    "finding": "RV05",
    "candidateCode": "ORACULO_CONTENT_INTEGRITY_MISMATCH",
    "target": "C5",
    "outcome": "DENIED",
    "requiresNoEffectProof": false
  },
  {
    "finding": "RV06",
    "candidateCode": "ORACULO_ARTIFACT_INTEGRITY_MISMATCH",
    "target": "C5",
    "outcome": "DENIED",
    "requiresNoEffectProof": false
  },
  {
    "finding": "RV07",
    "candidateCode": "ORACULO_INSPECTION_REJECTED",
    "target": "C5",
    "outcome": "DENIED",
    "requiresNoEffectProof": false
  },
  {
    "finding": "RV08",
    "candidateCode": "ORACULO_VALIDITY_EXPIRED",
    "target": "C5",
    "outcome": "DENIED",
    "requiresNoEffectProof": false
  },
  {
    "finding": "RV09",
    "candidateCode": "ORACULO_VALIDITY_NOT_STARTED",
    "target": "C5",
    "outcome": "DENIED",
    "requiresNoEffectProof": false
  },
  {
    "finding": "RV10",
    "candidateCode": "ORACULO_TEMPORAL_POLICY_UNRESOLVED",
    "target": "C5",
    "outcome": "REVIEW_REQUIRED",
    "requiresNoEffectProof": false
  },
  {
    "finding": "RV11",
    "candidateCode": "ORACULO_STATUS_REVOKED",
    "target": "C5",
    "outcome": "DENIED",
    "requiresNoEffectProof": false
  },
  {
    "finding": "RV12",
    "candidateCode": "ORACULO_STATUS_SUSPENDED",
    "target": "C5",
    "outcome": "DENIED",
    "requiresNoEffectProof": false
  },
  {
    "finding": "RV13",
    "candidateCode": "ORACULO_STATUS_UNKNOWN",
    "target": "C5",
    "outcome": "REVIEW_REQUIRED",
    "requiresNoEffectProof": false
  },
  {
    "finding": "RV14",
    "candidateCode": "ORACULO_STATUS_STALE",
    "target": "C5",
    "outcome": "REVIEW_REQUIRED",
    "requiresNoEffectProof": false
  },
  {
    "finding": "RV15",
    "candidateCode": "ORACULO_STATUS_CONFLICT",
    "target": "C5",
    "outcome": "REVIEW_REQUIRED",
    "requiresNoEffectProof": false
  },
  {
    "finding": "RV16",
    "candidateCode": "ORACULO_SOURCE_AUTHORITY_UNRESOLVED",
    "target": "C5",
    "outcome": "REVIEW_REQUIRED",
    "requiresNoEffectProof": false
  },
  {
    "finding": "RV17",
    "candidateCode": "ORACULO_HITL_REQUIRED",
    "target": "C5",
    "outcome": "REVIEW_REQUIRED",
    "requiresNoEffectProof": false
  },
  {
    "finding": "RV18",
    "candidateCode": "ORACULO_APPROVAL_CONTEXT_MISMATCH",
    "target": "C5",
    "outcome": "REVIEW_REQUIRED",
    "requiresNoEffectProof": false
  },
  {
    "finding": "RV19",
    "candidateCode": "ORACULO_APPROVAL_EXPIRED",
    "target": "C5",
    "outcome": "REVIEW_REQUIRED",
    "requiresNoEffectProof": false
  },
  {
    "finding": "RV20",
    "candidateCode": "ORACULO_APPROVAL_REJECTED",
    "target": "C5",
    "outcome": "DENIED",
    "requiresNoEffectProof": false
  },
  {
    "finding": "RV21",
    "candidateCode": "ORACULO_INTENT_PAYLOAD_CONFLICT",
    "target": "REQUEST_ERROR",
    "outcome": null,
    "requiresNoEffectProof": false
  },
  {
    "finding": "RV22",
    "candidateCode": "ORACULO_VISIT_REVISION_CONFLICT",
    "target": "C5",
    "outcome": "CONFLICT",
    "requiresNoEffectProof": false
  },
  {
    "finding": "RV23",
    "candidateCode": "ORACULO_VISIT_TRANSITION_DENIED",
    "target": "C5",
    "outcome": "DENIED",
    "requiresNoEffectProof": false
  },
  {
    "finding": "RV24",
    "candidateCode": "ORACULO_EVIDENCE_REQUIRED",
    "target": "C5",
    "outcome": "DENIED",
    "requiresNoEffectProof": false
  },
  {
    "finding": "RV25",
    "candidateCode": "ORACULO_SNAPSHOT_MISMATCH",
    "target": "C5",
    "outcome": "REVIEW_REQUIRED",
    "requiresNoEffectProof": false
  },
  {
    "finding": "RV26",
    "candidateCode": "ORACULO_COMMIT_OUTCOME_UNKNOWN",
    "target": "TRACKING",
    "outcome": null,
    "requiresNoEffectProof": false
  },
  {
    "finding": "RV27",
    "candidateCode": "ORACULO_COMMIT_FAILED_NO_EFFECT",
    "target": "C5",
    "outcome": "FAILED",
    "requiresNoEffectProof": true
  },
  {
    "finding": "RV28",
    "candidateCode": "ORACULO_EXECUTION_AUTHORITY_LOST",
    "target": "REQUEST_ERROR",
    "outcome": null,
    "requiresNoEffectProof": false
  },
  {
    "finding": "FT03_NOT_VERIFIED_MAPPING_PENDING",
    "candidateCode": "ORACULO_VERIFICATION_NOT_SATISFIED",
    "target": "C5",
    "outcome": "DENIED",
    "requiresNoEffectProof": false
  },
  {
    "finding": "FT03_TEMPORAL_MAPPING_PENDING",
    "candidateCode": "ORACULO_TEMPORAL_INCOHERENCE",
    "target": "C5",
    "outcome": "REVIEW_REQUIRED",
    "requiresNoEffectProof": false
  }
] as const;

export function proposeS1NegativeMapping(finding: string) {
  const mapping = S1_NEGATIVE_MAPPING_PROPOSALS.find(row => row.finding === finding);
  if (!mapping) return { status: "UNMAPPED" as const, finding };
  const definition = getReasonCodeDefinition(mapping.candidateCode);
  if (definition?.status !== "active") throw new Error("Ratified simulation requires active catalog status");
  return { status: "RATIFIED_SIMULATION_ONLY" as const, ...mapping };
}
