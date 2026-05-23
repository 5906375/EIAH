import type {
  ImobCaseState,
  ImobMissionId,
  ImobMissionPolicy,
  ReadinessStatus,
} from "./imobMissionTypes";
import { evaluateProofGate } from "./imobProofGate";

export function buildImobMissionPolicy(mission: ImobMissionId): ImobMissionPolicy {
  switch (mission) {
    case "case_review":
      return {
        mission,
        requiredEntities: [],
        requiredProof: ["snapshot_authoritative"],
        allowedOperations: ["case", "proof"],
        criticalActions: [],
        missionTier: "p0",
      };
    case "qualify_and_match_lead":
      return {
        mission,
        requiredEntities: ["leadId"],
        requiredProof: ["evidence_bundle"],
        allowedOperations: ["lead", "visit", "proof"],
        criticalActions: [],
        missionTier: "p0",
      };
    case "collect_documents":
      return {
        mission,
        requiredEntities: [],
        requiredProof: ["document_package"],
        allowedOperations: ["documents", "proof"],
        criticalActions: [],
        missionTier: "p0",
      };
    case "prepare_contract":
      return {
        mission,
        requiredEntities: ["propertyId"],
        requiredProof: ["document_package"],
        allowedOperations: ["documents", "contract", "proof"],
        criticalActions: [],
        missionTier: "p1",
      };
    case "settle_commission":
      return {
        mission,
        requiredEntities: ["commissionId"],
        requiredProof: ["commission_record"],
        allowedOperations: ["commission", "proof"],
        criticalActions: [],
        missionTier: "p2",
      };
    case "schedule_and_follow_visit":
      return {
        mission,
        requiredEntities: ["visitId"],
        requiredProof: ["visit_record"],
        allowedOperations: ["visit", "proof"],
        criticalActions: [],
        missionTier: "p0",
      };
    case "capture_seasonal_property":
    case "capture_rental_property":
    case "capture_sale_property":
      return {
        mission,
        requiredEntities: [],
        requiredProof: ["owner_link"],
        allowedOperations: ["owner", "property", "case", "proof"],
        criticalActions: [],
        missionTier: "p0",
      };
    default:
      return {
        mission,
        requiredEntities: [],
        requiredProof: [],
        allowedOperations: ["owner", "property", "case", "proof"],
        criticalActions: [],
        missionTier: mission === "commercial_activation" ? "p2" : "p0",
      };
  }
}

export type ImobMissionProofState = {
  required: boolean;
  minimumProofSatisfied: boolean;
  missingProof: string[];
  readiness: ReadinessStatus;
};

export function resolveImobMissionProofState(
  mission: ImobMissionId,
  state: Pick<ImobCaseState, "proof" | "entities" | "audit" | "mission" | "missionStatus" | "currentStep" | "currentOperation" | "readiness" | "blockers" | "pendingFields" | "nextAction" | "schemaVersion" | "tenantId" | "workspaceId" | "caseId">,
): ImobMissionProofState {
  const policy = buildImobMissionPolicy(mission);

  if (policy.requiredProof.length === 0) {
    return {
      required: false,
      minimumProofSatisfied: true,
      missingProof: [],
      readiness: "not_applicable",
    };
  }

  const result = evaluateProofGate(mission, state as ImobCaseState, policy);
  if (result.ok) {
    return {
      required: true,
      minimumProofSatisfied: true,
      missingProof: [],
      readiness: "ready",
    };
  }

  return {
    required: true,
    minimumProofSatisfied: false,
    missingProof: result.missingProof,
    readiness: "blocked",
  };
}
