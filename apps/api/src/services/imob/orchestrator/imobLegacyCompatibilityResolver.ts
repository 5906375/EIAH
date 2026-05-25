import type { ImobCaseContextV1, ImobCaseMission } from "../crm/imobCaseContextContract";
import type {
  ImobCaseState,
  ImobMissionId,
  ImobOperation,
} from "./imobMissionTypes";
import { resolveImobMissionStatus } from "./imobCompletionEvaluator";
import { buildImobMissionPolicy, resolveImobMissionProofState } from "./imobMissionPolicy";
import { resolveImobNextAction } from "./imobNextActionResolver";

type LegacyOperationalInput = {
  flow?: string | null;
  pendingFields?: string[] | null;
  nextAction?: string | null;
};

export type LegacyCompatibilityResult =
  | {
      ok: true;
      state: ImobCaseState;
      migrated: boolean;
      sourceFlow?: string | null;
      sourceMission?: ImobCaseMission | null;
    }
  | {
      ok: false;
      reasonCode: "LEGACY_CASE_INCOMPATIBLE" | "LEGACY_CASE_INCOMPLETE";
    };

function mapLegacyMission(mission?: ImobCaseMission | null): ImobMissionId {
  switch (mission) {
    case "qualify_lead":
      return "qualify_and_match_lead";
    case "schedule_visit":
      return "schedule_and_follow_visit";
    default:
      return mission ?? "case_review";
  }
}

function mapLegacyFlowToOperation(flow?: string | null): ImobOperation {
  switch (flow) {
    case "owner.create":
      return "owner";
    case "property.create":
    case "rules.configure":
      return "property";
    case "property.market_scan":
      return "market";
    case "lead.qualify":
      return "lead";
    case "visit.schedule":
      return "visit";
    case "documents.collect":
      return "documents";
    case "contract.prepare":
      return "contract";
    case "commission.settle":
      return "commission";
    case "listing.activate":
      return "campaign";
    default:
      return "case";
  }
}

function resolveCurrentStep(params: {
  mission: ImobMissionId;
  context: ImobCaseContextV1;
  operation: ImobOperation;
  pendingFields: string[];
}): ImobCaseState["currentStep"] {
  switch (params.mission) {
    case "capture_seasonal_property":
      if (!params.context.readiness.ownerReady) return "collecting_owner";
      if (!params.context.readiness.propertyReady) return "registering_property";
      if (params.context.links.ownerProperty?.status === "missing") return "owner_property_linking";
      if (!params.context.readiness.documentsReady) return "verifying_docs";
      return "final_review";
    case "capture_rental_property":
      if (!params.context.readiness.ownerReady) return "collecting_owner";
      if (!params.context.readiness.propertyReady) return "registering_property";
      if (params.context.links.ownerProperty?.status === "missing") return "owner_property_linking";
      if (!params.context.readiness.documentsReady) return "rental_checklist";
      return "final_review";
    case "capture_sale_property":
      if (!params.context.readiness.ownerReady) return "collecting_owner";
      if (!params.context.readiness.propertyReady) return "registering_property";
      if (params.context.links.ownerProperty?.status === "missing") return "owner_property_linking";
      if (!params.context.readiness.documentsReady) return "sale_checklist";
      return "final_review";
    case "qualify_and_match_lead":
      if (params.context.leadLifecycle?.status === "disqualified" || params.context.leadLifecycle?.status === "reengagement_ready") {
        return "disqualified";
      }
      if (params.context.leadMatching?.status === "suggested") return "ready_for_visit";
      if (params.context.leadMatching?.status === "no_match") return "no_match_found";
      return params.pendingFields.length > 0 ? "gathering_signals" : "matching_inventory";
    case "schedule_and_follow_visit":
      if (params.context.entities.proposal?.status === "ready_for_review") return "post_visit";
      return params.pendingFields.length > 0 ? "selecting_slot" : "scheduled";
    case "collect_documents":
      return params.pendingFields.length > 0 ? "collecting" : "package_ready";
    case "case_review":
      return "generating_snapshot";
    case "prepare_contract":
      if (!params.context.readiness.documentsReady) return "checking_document_sufficiency";
      if (params.context.entities.contract?.status === "ready_for_signature") return "ready_for_signature";
      if (params.context.entities.contract?.status === "legal_handoff_pending") return "legal_handoff";
      if (params.context.entities.contract?.status === "needs_document_rework") return "needs_document_rework";
      return "drafting";
    case "settle_commission":
      if (params.pendingFields.length > 0) return "calculating_basis";
      if (params.context.entities.commission?.status === "paid") return "reconciled";
      if (params.context.entities.commission?.status === "ready") return "settlement_ready";
      return "awaiting_approval";
    case "commercial_activation":
      if (params.context.entities.campaign?.status === "published_or_sent") return "published_or_sent";
      if (params.context.entities.campaign?.status === "ready_to_publish") return "ready_to_publish";
      if (params.context.entities.campaign?.status === "awaiting_human_approval") return "awaiting_human_approval";
      if (params.context.entities.campaign?.status === "blocked_by_policy") return "blocked_by_policy";
      return "drafting_campaign";
  }
}

export const buildMissionPolicySeed = buildImobMissionPolicy;

export function resolveCanonicalCaseStateFromLegacy(params: {
  context: ImobCaseContextV1;
  operational?: LegacyOperationalInput | null;
}): LegacyCompatibilityResult {
  if (!params.context.tenantId || !params.context.workspaceId || !params.context.caseId) {
    return { ok: false, reasonCode: "LEGACY_CASE_INCOMPLETE" };
  }

  const sourceMission = params.context.missionContext?.mission ?? null;
  const mission = mapLegacyMission(sourceMission);
  const sourceFlow = params.operational?.flow ?? null;
  const operation = mapLegacyFlowToOperation(sourceFlow);
  const pendingFields = Array.isArray(params.operational?.pendingFields)
    ? params.operational?.pendingFields.filter((item): item is string => typeof item === "string")
    : [];
  const currentStep = resolveCurrentStep({
    mission,
    context: params.context,
    operation,
    pendingFields,
  });

  const nextAction = resolveImobNextAction({
    mission,
    context: params.context,
    operation,
    flow: sourceFlow,
    legacyNextAction: params.operational?.nextAction ?? null,
    pendingFields,
  });
  const baseState: ImobCaseState = {
    schemaVersion: 1,
    tenantId: params.context.tenantId,
    workspaceId: params.context.workspaceId,
    caseId: params.context.caseId,
    mission,
    missionStatus: "draft",
    currentStep,
    currentOperation: operation,
      entities: {
        ownerId: params.context.entities.owner?.id ?? undefined,
        propertyId: params.context.entities.property?.id ?? undefined,
        leadId: params.context.entities.lead?.id ?? undefined,
        visitId: params.context.entities.visit?.id ?? undefined,
        documentPackageId: params.context.readiness.documentsReady ? (params.context.entities.documents?.id ?? undefined) : undefined,
        campaignId: (params.context.entities.campaign?.status === "ready_to_publish" || params.context.entities.campaign?.status === "published_or_sent")
          ? (params.context.entities.campaign?.id ?? undefined)
          : undefined,
        contractId: params.context.entities.contract?.id ?? undefined,
        commissionId: (params.context.entities.commission?.status === "ready" || params.context.entities.commission?.status === "paid")
          ? (params.context.entities.commission?.id ?? undefined)
          : undefined,
      },
    readiness: {
      owner: params.context.readiness.ownerReady ? "ready" : "incomplete",
      property: params.context.readiness.propertyReady ? "ready" : "incomplete",
      lead: params.context.readiness.leadReady
        ? ((params.context.readiness.leadReadinessScore ?? 0) >= 70 ? "ready" : "blocked")
        : params.context.entities.lead
          ? "incomplete"
          : undefined,
      documents: params.context.readiness.documentsReady ? "ready" : "incomplete",
      campaign: params.context.entities.campaign?.status === "ready_to_publish" || params.context.entities.campaign?.status === "published_or_sent"
        ? "ready"
        : params.context.entities.campaign
          ? "blocked"
          : undefined,
      commission: params.context.entities.commission?.status === "ready" || params.context.entities.commission?.status === "paid"
        ? "ready"
        : params.context.entities.commission
          ? "blocked"
          : undefined,
      proof: "not_applicable",
    },
    blockers: params.context.blockers.map((item) => ({
      code: item.code,
      message: item.message,
    })),
    pendingFields: pendingFields.map((field) => ({ field })),
    nextAction,
    proof: {
      required: false,
      minimumProofSatisfied: true,
      missingProof: [],
    },
    audit: {
      version: 1,
      lastUpdatedAt: new Date().toISOString(),
      updatedByAgent: "IMOB",
    },
  };

  const proofState = resolveImobMissionProofState(mission, baseState);
  const missionStatus = resolveImobMissionStatus({
    mission,
    context: params.context,
    currentStep,
    pendingFields,
    hasNextAction: true,
    proofRequired: proofState.required,
    proofSatisfied: proofState.minimumProofSatisfied,
  });

  const state: ImobCaseState = {
    ...baseState,
    missionStatus,
    readiness: {
      ...baseState.readiness,
      proof: proofState.readiness,
    },
    proof: {
      ...baseState.proof,
      required: proofState.required,
      minimumProofSatisfied: proofState.minimumProofSatisfied,
      missingProof: proofState.missingProof,
    },
  };

  return {
    ok: true,
    state,
    migrated: true,
    sourceFlow,
    sourceMission,
  };
}
