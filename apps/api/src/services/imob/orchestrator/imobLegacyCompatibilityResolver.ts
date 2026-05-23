import type { ImobCaseContextV1, ImobCaseMission } from "../crm/imobCaseContextContract";
import type {
  ImobCaseState,
  ImobMissionId,
  ImobMissionPolicy,
  ImobNextAction,
  ImobOperation,
  MissionStatus,
} from "./imobMissionTypes";
import { resolveImobOperationRoute } from "./imobOperationRouter";

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
    default:
      return "case";
  }
}

function buildDefaultNextAction(params: {
  mission: ImobMissionId;
  context: ImobCaseContextV1;
  operation: ImobOperation;
  flow?: string | null;
  legacyNextAction?: string | null;
}): ImobNextAction {
  if (params.legacyNextAction === "ask_missing_lead_field") {
    const route = resolveImobOperationRoute("lead", params.flow);
    return {
      id: "ask-missing-lead-field",
      label: "Completar dados do lead",
      operation: "lead",
      targetAgent: route.dispatchedAgentId,
      reasonCode: "LEAD_MISSING_REQUIRED_FIELD",
    };
  }

  if (params.legacyNextAction === "link_lead_to_property") {
    const route = resolveImobOperationRoute("lead", params.flow);
    return {
      id: "link-lead-to-property",
      label: "Vincular lead ao imóvel",
      operation: "lead",
      targetAgent: route.dispatchedAgentId,
      reasonCode: "LEAD_READY_TO_LINK",
    };
  }

  if (!params.context.readiness.ownerReady) {
    const route = resolveImobOperationRoute("owner", params.flow);
    return {
      id: "create-owner",
      label: "Cadastrar proprietário",
      operation: "owner",
      targetAgent: route.dispatchedAgentId,
      reasonCode: "OWNER_REQUIRED",
    };
  }
  if (!params.context.readiness.propertyReady) {
    const route = resolveImobOperationRoute("property", params.flow);
    return {
      id: "create-property",
      label: "Cadastrar imóvel",
      operation: "property",
      targetAgent: route.dispatchedAgentId,
      reasonCode: "PROPERTY_REQUIRED",
    };
  }
  if (params.context.links.ownerProperty?.status === "missing") {
    const route = resolveImobOperationRoute("property", params.flow);
    return {
      id: "link-owner-property",
      label: "Concluir vínculo",
      operation: "property",
      targetAgent: route.dispatchedAgentId,
      reasonCode: "OWNER_PROPERTY_LINK_REQUIRED",
    };
  }
  if (params.mission === "collect_documents" || !params.context.readiness.documentsReady) {
    const route = resolveImobOperationRoute("documents", params.flow);
    return {
      id: "collect-documents",
      label: "Coletar documentos",
      operation: "documents",
      targetAgent: route.dispatchedAgentId,
      reasonCode: "DOCUMENTS_REQUIRED",
    };
  }

  const route = resolveImobOperationRoute(params.operation, params.flow);
  return {
    id: "consult-case",
    label: "Consultar caso",
    operation: params.operation,
    targetAgent: route.dispatchedAgentId,
    reasonCode: "CASE_REVIEW_SNAPSHOT_READY",
  };
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
      return params.pendingFields.length > 0 ? "gathering_signals" : "matching_inventory";
    case "schedule_and_follow_visit":
      return params.pendingFields.length > 0 ? "selecting_slot" : "scheduled";
    case "collect_documents":
      return params.pendingFields.length > 0 ? "collecting" : "package_ready";
    case "case_review":
      return "generating_snapshot";
    case "prepare_contract":
      return "checking_document_sufficiency";
    case "settle_commission":
      return "calculating_basis";
    case "commercial_activation":
      return "drafting_campaign";
  }
}

function resolveMissionStatus(context: ImobCaseContextV1): MissionStatus {
  if (context.blockers.some((item) => item.severity === "blocking")) return "blocked";
  if (context.readiness.operationalReady) return "done";
  if (context.blockers.length > 0 || !context.readiness.operationalReady) return "in_progress";
  return "draft";
}

export function buildMissionPolicySeed(mission: ImobMissionId): ImobMissionPolicy {
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
    default:
      return {
        mission,
        requiredEntities: [],
        requiredProof: [],
        allowedOperations: ["owner", "property", "case", "proof"],
        criticalActions: [],
        missionTier: mission === "prepare_contract" ? "p1" : mission === "settle_commission" || mission === "commercial_activation" ? "p2" : "p0",
      };
  }
}

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

  const nextAction = buildDefaultNextAction({
    mission,
    context: params.context,
    operation,
    flow: sourceFlow,
    legacyNextAction: params.operational?.nextAction ?? null,
  });

  const state: ImobCaseState = {
    schemaVersion: 1,
    tenantId: params.context.tenantId,
    workspaceId: params.context.workspaceId,
    caseId: params.context.caseId,
    mission,
    missionStatus: resolveMissionStatus(params.context),
    currentStep,
    currentOperation: operation,
    entities: {
      ownerId: params.context.entities.owner?.id ?? undefined,
      propertyId: params.context.entities.property?.id ?? undefined,
      leadId: params.context.entities.lead?.id ?? undefined,
    },
    readiness: {
      owner: params.context.readiness.ownerReady ? "ready" : "incomplete",
      property: params.context.readiness.propertyReady ? "ready" : "incomplete",
      documents: params.context.readiness.documentsReady ? "ready" : "incomplete",
      proof: mission === "case_review" ? "ready" : "not_applicable",
    },
    blockers: params.context.blockers.map((item) => ({
      code: item.code,
      message: item.message,
    })),
    pendingFields: pendingFields.map((field) => ({ field })),
    nextAction,
    proof: {
      required: mission === "case_review",
      minimumProofSatisfied: mission !== "case_review",
      missingProof: mission === "case_review" ? ["snapshot_authoritative"] : [],
    },
    audit: {
      version: 1,
      lastUpdatedAt: new Date().toISOString(),
      updatedByAgent: "IMOB",
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
