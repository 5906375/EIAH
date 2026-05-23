import type { ImobCaseContextV1, ImobCaseMission } from "../crm/imobCaseContextContract";
import type { ImobMissionId, ImobNextAction, ImobOperation } from "./imobMissionTypes";
import { resolveImobOperationRoute } from "./imobOperationRouter";

type ResolveNextActionParams = {
  mission: ImobMissionId;
  context: ImobCaseContextV1;
  operation: ImobOperation;
  flow?: string | null;
  legacyNextAction?: string | null;
  pendingFields?: string[];
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

function mapLeadAction(flow: string | null | undefined, params: {
  id: string;
  label: string;
  reasonCode: string;
}): ImobNextAction {
  const route = resolveImobOperationRoute("lead", flow);
  return {
    id: params.id,
    label: params.label,
    operation: "lead",
    targetAgent: route.dispatchedAgentId,
    reasonCode: params.reasonCode,
  };
}

function mapOperationAction(
  operation: ImobOperation,
  flow: string | null | undefined,
  params: {
    id: string;
    label: string;
    reasonCode: string;
  },
): ImobNextAction {
  const route = resolveImobOperationRoute(operation, flow);
  return {
    id: params.id,
    label: params.label,
    operation,
    targetAgent: route.dispatchedAgentId,
    reasonCode: params.reasonCode,
  };
}

export function resolveImobNextAction(params: ResolveNextActionParams): ImobNextAction {
  if (params.legacyNextAction === "ask_missing_lead_field") {
    return mapLeadAction(params.flow, {
      id: "ask-missing-lead-field",
      label: "Completar dados do lead",
      reasonCode: "LEAD_MISSING_REQUIRED_FIELD",
    });
  }

  if (params.legacyNextAction === "link_lead_to_property") {
    return mapLeadAction(params.flow, {
      id: "link-lead-to-property",
      label: "Vincular lead ao imóvel",
      reasonCode: "LEAD_READY_TO_LINK",
    });
  }

  if (!params.context.readiness.ownerReady) {
    return mapOperationAction("owner", params.flow, {
      id: "create-owner",
      label: "Cadastrar proprietário",
      reasonCode: "OWNER_REQUIRED",
    });
  }

  if (!params.context.readiness.propertyReady) {
    return mapOperationAction("property", params.flow, {
      id: "create-property",
      label: "Cadastrar imóvel",
      reasonCode: "PROPERTY_REQUIRED",
    });
  }

  if (params.context.links.ownerProperty?.status === "missing") {
    return mapOperationAction("property", params.flow, {
      id: "link-owner-property",
      label: "Concluir vínculo",
      reasonCode: "OWNER_PROPERTY_LINK_REQUIRED",
    });
  }

  if (params.mission === "collect_documents" || !params.context.readiness.documentsReady) {
    return mapOperationAction("documents", params.flow, {
      id: "collect-documents",
      label: "Coletar documentos",
      reasonCode: "DOCUMENTS_REQUIRED",
    });
  }

  return mapOperationAction(params.operation, params.flow, {
    id: "consult-case",
    label: "Consultar caso",
    reasonCode: "CASE_REVIEW_SNAPSHOT_READY",
  });
}

export function resolveImobNextActionFromContext(params: {
  context: ImobCaseContextV1;
  flow?: string | null;
  operation: ImobOperation;
  legacyNextAction?: string | null;
  pendingFields?: string[];
}) {
  return resolveImobNextAction({
    mission: normalizeLegacyMission(params.context.missionContext?.mission),
    context: params.context,
    operation: params.operation,
    flow: params.flow,
    legacyNextAction: params.legacyNextAction,
    pendingFields: params.pendingFields,
  });
}
