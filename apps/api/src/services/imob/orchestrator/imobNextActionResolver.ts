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

function resolveMarketScanRecommendedAction(flow: string | null | undefined, params: ResolveNextActionParams): ImobNextAction | null {
  if (flow !== "property.market_scan" && flow !== "property.market_scan.selection") return null;
  const recommendation = params.context.marketScanRecommendation;
  if (!recommendation) return null;

  switch (recommendation.recommendedAction) {
    case "captar":
      return mapOperationAction("property", flow, {
        id: "capture-from-market-scan",
        label: "Seguir com captação",
        reasonCode: "MARKET_SCAN_CAPTURE_RECOMMENDED",
      });
    case "pedir_documento":
      return mapOperationAction("documents", flow, {
        id: "request-market-scan-document",
        label: "Pedir documentação",
        reasonCode: "MARKET_SCAN_DOCUMENT_REQUIRED",
      });
    case "campanha":
      return mapOperationAction("campaign", flow, {
        id: "prepare-campaign-from-market-scan",
        label: "Preparar ativação comercial",
        reasonCode: "MARKET_SCAN_COMMERCIAL_ACTIVATION_RECOMMENDED",
      });
    case "ajustar_preco":
      return mapOperationAction("case", flow, {
        id: "review-market-scan-price",
        label: "Revisar estratégia de preço",
        reasonCode: "MARKET_SCAN_PRICE_REVIEW_REQUIRED",
      });
    case "pedir_autorizacao":
      return mapOperationAction("case", flow, {
        id: "request-market-scan-authorization",
        label: "Pedir autorização",
        reasonCode: "MARKET_SCAN_HUMAN_AUTHORIZATION_REQUIRED",
      });
    case "nao_seguir":
      return mapOperationAction("case", flow, {
        id: "review-market-scan-stop",
        label: "Revisar decisão do scan",
        reasonCode: "MARKET_SCAN_DO_NOT_PROCEED",
      });
    default:
      return null;
  }
}

function resolveCaptureJourneyAction(flow: string | null | undefined, params: ResolveNextActionParams): ImobNextAction | null {
  const marketScanAction = resolveMarketScanRecommendedAction(flow, params);
  if (marketScanAction) return marketScanAction;

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

function buildDocumentChecklistLabel(context: ImobCaseContextV1) {
  switch (context.documentChecklist?.operation) {
    case "venda":
      return "Completar checklist documental de venda";
    case "locacao":
      return "Completar checklist documental de locação";
    case "temporada":
      return "Completar checklist documental de temporada";
    default:
      return "Coletar documentos";
  }
}

function resolveCommercialFollowUpNextAction(
  flow: ResolveNextActionParams["flow"],
  commercialFollowUp: ImobCaseContextV1["commercialFollowUp"] | null | undefined,
) {
  if (!commercialFollowUp) return null;

  if (commercialFollowUp.status === "awaiting_response") {
    return mapLeadAction(flow, {
      id: "await-follow-up-response",
      label: "Acompanhar resposta do lead",
      reasonCode: "FOLLOW_UP_RESPONSE_PENDING",
    });
  }

  if (commercialFollowUp.status === "follow_up_required") {
    return mapLeadAction(flow, {
      id: commercialFollowUp.source === "visit_outcome" ? "follow-up-post-visit" : "execute-commercial-follow-up",
      label: commercialFollowUp.source === "visit_outcome" ? "Retomar pós-visita" : "Executar follow-up comercial",
      reasonCode: commercialFollowUp.source === "visit_outcome" ? "VISIT_FOLLOW_UP_REQUIRED" : "FOLLOW_UP_PENDING",
    });
  }

  if (commercialFollowUp.status === "reengagement_required") {
    return mapLeadAction(flow, {
      id:
        commercialFollowUp.source === "visit_outcome"
          ? "reengage-post-visit"
          : commercialFollowUp.source === "lead_lifecycle"
            ? "reengage-disqualified-lead"
            : "reengage-commercial-follow-up",
      label:
        commercialFollowUp.source === "visit_outcome"
          ? "Reengajar lead após visita"
          : commercialFollowUp.source === "lead_lifecycle"
            ? "Retomar lead"
            : "Reengajar lead",
      reasonCode:
        commercialFollowUp.source === "visit_outcome"
          ? "VISIT_REENGAGEMENT_REQUIRED"
          : commercialFollowUp.source === "lead_lifecycle"
            ? "LEAD_REENGAGEMENT_REQUIRED"
            : "FOLLOW_UP_REENGAGEMENT_REQUIRED",
    });
  }

  return null;
}

export function resolveImobNextAction(params: ResolveNextActionParams): ImobNextAction {
  if (params.context.dedupe?.status === "pending_review") {
    return mapOperationAction(params.context.dedupe.entity === "lead" ? "lead" : "owner", params.flow, {
      id: "review-dedupe",
      label: "Revisar dedupe",
      reasonCode: "DEDUPE_REVIEW_PENDING",
    });
  }

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
      {
        const followUpAction = resolveCommercialFollowUpNextAction(params.flow, params.context.commercialFollowUp);
        if (followUpAction) return followUpAction;
      }

      if (params.context.leadLifecycle?.status === "reengagement_ready") {
        return mapLeadAction(params.flow, {
          id: "reengage-disqualified-lead",
          label: "Retomar lead",
          reasonCode: "LEAD_REENGAGEMENT_REQUIRED",
        });
      }

      if (params.context.leadLifecycle?.status === "disqualified") {
        return mapLeadAction(params.flow, {
          id: "review-disqualified-lead",
          label: "Revisar desqualificação do lead",
          reasonCode: "LEAD_DISQUALIFIED",
        });
      }

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

      if (params.context.leadMatching?.status === "suggested") {
        return mapOperationAction("visit", params.flow, {
          id: "schedule-visit-for-matched-lead",
          label: "Avançar para visita",
          reasonCode: "VISIT_REQUIRED",
        });
      }

      if (params.context.leadMatching?.status === "no_match") {
        return mapLeadAction(params.flow, {
          id: "review-lead-match-criteria",
          label: "Refinar critérios do lead",
          reasonCode: "LEAD_PROPERTY_MATCH_REVIEW_REQUIRED",
        });
      }

      if (params.context.leadMatching?.status === "awaiting_candidate") {
        return mapLeadAction(params.flow, {
          id: "find-matching-property",
          label: "Buscar imóvel compatível",
          reasonCode: "LEAD_PROPERTY_MATCH_PENDING",
        });
      }

      return mapLeadAction(params.flow, {
        id: "link-lead-to-property",
        label: "Vincular lead ao imóvel",
        reasonCode: "LEAD_READY_TO_LINK",
      });

    case "schedule_and_follow_visit":
      {
        const followUpAction = resolveCommercialFollowUpNextAction(params.flow, params.context.commercialFollowUp);
        if (followUpAction) return followUpAction;
      }

      if (params.context.visitScheduling?.status === "awaiting_reschedule") {
        return mapOperationAction("visit", params.flow, {
          id: "reschedule-visit",
          label: "Remarcar visita",
          reasonCode: "VISIT_RESCHEDULE_REQUIRED",
        });
      }

      if (params.context.visitScheduling?.status === "cancel_requested") {
        return mapOperationAction("visit", params.flow, {
          id: "review-visit-cancellation",
          label: "Confirmar cancelamento da visita",
          reasonCode: "VISIT_CANCELLATION_REVIEW_REQUIRED",
        });
      }

      if (params.context.visitScheduling?.status === "pending_confirmation") {
        return mapOperationAction("visit", params.flow, {
          id: "confirm-visit-scheduling",
          label: "Confirmar agenda da visita",
          reasonCode: "VISIT_SCHEDULING_PENDING",
        });
      }

      if (params.context.visitOutcome?.status === "pending_result") {
        return mapOperationAction("visit", params.flow, {
          id: "register-visit-outcome",
          label: "Registrar resultado da visita",
          reasonCode: "VISIT_OUTCOME_REQUIRED",
        });
      }

      if (params.context.visitOutcome?.status === "follow_up_required") {
        return mapLeadAction(params.flow, {
          id: "follow-up-post-visit",
          label: "Retomar pós-visita",
          reasonCode: "VISIT_FOLLOW_UP_REQUIRED",
        });
      }

      if (params.context.visitOutcome?.status === "reengagement_required") {
        return mapLeadAction(params.flow, {
          id: "reengage-post-visit",
          label: "Reengajar lead após visita",
          reasonCode: "VISIT_REENGAGEMENT_REQUIRED",
        });
      }

      if (params.context.visitOutcome?.status === "proposal_ready") {
        return mapLeadAction(params.flow, {
          id: "prepare-proposal",
          label: "Preparar proposta",
          reasonCode: "PROPOSAL_REQUIRED",
        });
      }

      if (params.context.proposalNegotiation?.status === "collecting") {
        return mapLeadAction(params.flow, {
          id: "complete-proposal-data",
          label: "Completar proposta",
          reasonCode: "PROPOSAL_DATA_REQUIRED",
        });
      }

      if (params.context.entities.proposal?.status === "ready_for_review") {
        return mapLeadAction(params.flow, {
          id: "review-proposal",
          label: "Revisar proposta",
          reasonCode: "PROPOSAL_REVIEW_REQUIRED",
        });
      }

      return mapOperationAction("visit", params.flow, {
        id: "schedule-visit",
        label: "Agendar visita",
        reasonCode: "VISIT_REQUIRED",
      });

    case "collect_documents":
      if (params.context.documentChecklist?.pendingDocuments.length) {
        return mapOperationAction("documents", params.flow, {
          id: "complete-document-checklist",
          label: buildDocumentChecklistLabel(params.context),
          reasonCode: "DOCUMENT_CHECKLIST_REQUIRED",
        });
      }
      return mapOperationAction("documents", params.flow, {
        id: "collect-documents",
        label: "Coletar documentos",
        reasonCode: "DOCUMENTS_REQUIRED",
      });

    case "prepare_contract":
      if (!params.context.readiness.documentsReady) {
        return mapOperationAction("documents", params.flow, {
          id: "collect-documents",
          label: params.context.documentChecklist?.pendingDocuments.length
            ? buildDocumentChecklistLabel(params.context)
            : "Coletar documentos",
          reasonCode: params.context.documentChecklist?.pendingDocuments.length
            ? "DOCUMENT_CHECKLIST_REQUIRED"
            : "DOCUMENTS_REQUIRED",
        });
      }

      if (params.context.documentSufficiency?.handoffTarget === "LEGAL" && params.context.documentSufficiency.legalHandoffStatus === "pending") {
        return mapOperationAction("contract", params.flow, {
          id: "legal-handoff",
          label: "Encaminhar para jurídico",
          reasonCode: "LEGAL_HANDOFF_REQUIRED",
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
