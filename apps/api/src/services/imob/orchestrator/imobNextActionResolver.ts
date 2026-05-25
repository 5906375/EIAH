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

function resolveCaptureJourneyAction(flow: string | null | undefined, params: ResolveNextActionParams): ImobNextAction | null {
  if (!params.context.readiness.ownerReady) {
    return mapOperationAction("owner", flow, {
      id: "create-owner",
      label: "Cadastrar proprietário",
      reasonCode: "OWNER_REQUIRED",
    });
  }

  if (!params.context.readiness.propertyReady) {
    return mapOperationAction("property", flow, {
      id: "create-property",
      label: "Cadastrar imóvel",
      reasonCode: "PROPERTY_REQUIRED",
    });
  }

  if (params.context.links.ownerProperty?.status === "missing") {
    return mapOperationAction("property", flow, {
      id: "link-owner-property",
      label: "Concluir vínculo",
      reasonCode: "OWNER_PROPERTY_LINK_REQUIRED",
    });
  }

  if (!params.context.readiness.documentsReady) {
    return mapOperationAction("documents", flow, {
      id: "collect-documents",
      label: "Coletar documentos",
      reasonCode: "DOCUMENTS_REQUIRED",
    });
  }

  return null;
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

  switch (params.mission) {
    case "capture_seasonal_property":
    case "capture_rental_property":
    case "capture_sale_property":
      return resolveCaptureJourneyAction(params.flow, params) ?? mapOperationAction("case", params.flow, {
        id: "consult-case",
        label: "Consultar caso",
        reasonCode: "CASE_REVIEW_SNAPSHOT_READY",
      });

    case "qualify_and_match_lead":
      if (!params.context.readiness.leadReady) {
        return mapLeadAction(params.flow, {
          id: "ask-missing-lead-field",
          label: "Completar dados do lead",
          reasonCode: "LEAD_MISSING_REQUIRED_FIELD",
        });
      }

      if ((params.context.readiness.leadReadinessScore ?? 0) < 70) {
        return mapLeadAction(params.flow, {
          id: "review-lead-readiness",
          label: "Consolidar readiness do lead",
          reasonCode: "LEAD_READINESS_REVIEW_REQUIRED",
        });
      }

      return mapLeadAction(params.flow, {
        id: "link-lead-to-property",
        label: "Vincular lead ao imóvel",
        reasonCode: "LEAD_READY_TO_LINK",
      });

    case "schedule_and_follow_visit":
      return mapOperationAction("visit", params.flow, {
        id: "schedule-visit",
        label: "Agendar visita",
        reasonCode: "VISIT_REQUIRED",
      });

    case "collect_documents":
      return mapOperationAction("documents", params.flow, {
        id: "collect-documents",
        label: "Coletar documentos",
        reasonCode: "DOCUMENTS_REQUIRED",
      });

    case "prepare_contract":
      if (!params.context.readiness.documentsReady) {
        return mapOperationAction("documents", params.flow, {
          id: "collect-documents",
          label: "Coletar documentos",
          reasonCode: "DOCUMENTS_REQUIRED",
        });
      }

      return mapOperationAction("contract", params.flow, {
        id: "prepare-contract",
        label: "Preparar contrato",
        reasonCode: "CONTRACT_PREPARATION_REQUIRED",
      });

    case "settle_commission":
      if (params.pendingFields?.length) {
        return mapOperationAction("commission", params.flow, {
          id: "complete-commission-data",
          label: "Completar dados da comissão",
          reasonCode: "COMMISSION_DATA_REQUIRED",
        });
      }

      return mapOperationAction("commission", params.flow, {
        id: "settle-commission",
        label: "Revisar comissão",
        reasonCode: "COMMISSION_REVIEW_REQUIRED",
      });

    case "commercial_activation":
      if (!params.context.entities.campaign || params.context.entities.campaign.status === "drafting_campaign") {
        return mapOperationAction("campaign", params.flow, {
          id: "prepare-campaign",
          label: "Preparar ativação comercial",
          reasonCode: "CAMPAIGN_DRAFT_REQUIRED",
        });
      }

      if (params.context.entities.campaign.status === "blocked_by_policy") {
        return mapOperationAction("campaign", params.flow, {
          id: "resolve-campaign-policy",
          label: "Liberar policy da ativação",
          reasonCode: "CAMPAIGN_POLICY_REQUIRED",
        });
      }

      if (params.context.entities.campaign.status === "awaiting_human_approval") {
        return mapOperationAction("campaign", params.flow, {
          id: "approve-campaign",
          label: "Aprovar ativação comercial",
          reasonCode: "CAMPAIGN_APPROVAL_REQUIRED",
        });
      }

      if (params.context.entities.campaign.status === "ready_to_publish") {
        return mapOperationAction("campaign", params.flow, {
          id: "publish-campaign",
          label: "Publicar ativação comercial",
          reasonCode: "CAMPAIGN_READY_TO_PUBLISH",
        });
      }

      return mapOperationAction("campaign", params.flow, {
        id: "activate-campaign",
        label: "Preparar ativação comercial",
        reasonCode: "COMMERCIAL_ACTIVATION_REQUIRED",
      });

    case "case_review":
      return resolveCaptureJourneyAction(params.flow, params) ?? mapOperationAction("case", params.flow, {
        id: "consult-case",
        label: "Consultar caso",
        reasonCode: "CASE_REVIEW_SNAPSHOT_READY",
      });

    default:
      return mapOperationAction("case", params.flow, {
        id: "consult-case",
        label: "Consultar caso",
        reasonCode: "CASE_REVIEW_SNAPSHOT_READY",
      });
  }
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
