import type { ImobCaseContextV1, ImobCaseMission } from "../crm/imobCaseContextContract";
import type { ImobCaseState, ImobMissionId, MissionStatus } from "./imobMissionTypes";

type ResolveMissionStatusParams = {
  mission: ImobMissionId;
  context: ImobCaseContextV1;
  currentStep: ImobCaseState["currentStep"];
  pendingFields: string[];
  hasNextAction: boolean;
  proofRequired?: boolean;
  proofSatisfied?: boolean;
};

function normalizeLegacyMission(mission?: ImobCaseMission | ImobMissionId | null): ImobMissionId {
  switch (mission) {
    case "qualify_lead":
      return "qualify_and_match_lead";
    case "schedule_visit":
      return "schedule_and_follow_visit";
    default:
      return (mission as ImobMissionId | null) ?? "case_review";
  }
}

function hasBlockingBlocker(context: ImobCaseContextV1) {
  return context.blockers.some((item) => item.severity === "blocking");
}

function hasUsefulEntityContext(context: ImobCaseContextV1) {
  return Boolean(
    context.entities.owner?.id
    || context.entities.property?.id
    || context.entities.lead?.id
    || context.entities.visit?.id
    || context.entities.proposal?.id
    || context.entities.documents?.id
    || context.entities.contract?.id
    || context.entities.commission?.id
  );
}

export function resolveImobMissionStatus(params: ResolveMissionStatusParams): MissionStatus {
  if (hasBlockingBlocker(params.context)) return "blocked";

  if (params.context.readiness.operationalReady) {
    if (params.proofRequired && !params.proofSatisfied) return "blocked";
    return "done";
  }

  switch (params.mission) {
    case "case_review":
      if (params.currentStep === "snapshot_ready") return "ready_for_transition";
      return params.hasNextAction || hasUsefulEntityContext(params.context) ? "in_progress" : "draft";
    case "qualify_and_match_lead":
      if (
        params.context.leadMatching?.status === "suggested"
      ) {
        return "ready_for_transition";
      }
      if (
        params.context.readiness.leadReady
        && (params.context.readiness.leadReadinessScore ?? 0) >= 70
        && Boolean(params.context.entities.lead?.id || params.context.entities.lead?.name)
      ) {
        return "ready_for_transition";
      }
      return params.hasNextAction || params.pendingFields.length > 0 ? "in_progress" : "draft";
    case "schedule_and_follow_visit":
      if (params.context.entities.proposal?.status === "ready_for_review") return "ready_for_transition";
      if (params.pendingFields.length === 0 && params.currentStep === "scheduled") return "ready_for_transition";
      return params.hasNextAction || params.pendingFields.length > 0 ? "in_progress" : "draft";
    case "collect_documents":
      if (params.pendingFields.length === 0 && params.currentStep === "package_ready") return "ready_for_transition";
      return params.hasNextAction || params.pendingFields.length > 0 ? "in_progress" : "draft";
    case "prepare_contract":
      if (params.pendingFields.length === 0 && params.currentStep === "ready_for_signature") return "ready_for_transition";
      return params.hasNextAction || params.pendingFields.length > 0 ? "in_progress" : "draft";
    case "settle_commission":
      if (params.pendingFields.length === 0 && (params.currentStep === "settlement_ready" || params.currentStep === "reconciled")) {
        return "ready_for_transition";
      }
      return params.hasNextAction || params.pendingFields.length > 0 ? "in_progress" : "draft";
    case "commercial_activation":
      if (params.pendingFields.length === 0 && (params.currentStep === "ready_to_publish" || params.currentStep === "published_or_sent")) {
        return "ready_for_transition";
      }
      return params.hasNextAction || params.pendingFields.length > 0 ? "in_progress" : "draft";
    case "capture_seasonal_property":
    case "capture_rental_property":
    case "capture_sale_property":
      if (params.context.readiness.ownerReady && params.context.readiness.propertyReady) {
        const linked = params.context.links.ownerProperty?.status === "linked";
        if (linked && params.context.readiness.documentsReady) return "ready_for_transition";
        return "in_progress";
      }
      return params.hasNextAction || hasUsefulEntityContext(params.context) ? "in_progress" : "draft";
    default:
      return params.hasNextAction || hasUsefulEntityContext(params.context) ? "in_progress" : "draft";
  }
}

export function resolveImobMissionStatusFromContext(params: {
  context: ImobCaseContextV1;
  currentStep: ImobCaseState["currentStep"];
  pendingFields: string[];
  hasNextAction: boolean;
  proofRequired?: boolean;
  proofSatisfied?: boolean;
}) {
  return resolveImobMissionStatus({
    mission: normalizeLegacyMission(params.context.missionContext?.mission),
    context: params.context,
    currentStep: params.currentStep,
    pendingFields: params.pendingFields,
    hasNextAction: params.hasNextAction,
    proofRequired: params.proofRequired,
    proofSatisfied: params.proofSatisfied,
  });
}
