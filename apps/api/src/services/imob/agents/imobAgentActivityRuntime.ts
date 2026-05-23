import type { ImobResolveTurnResponse } from "../imobConversationContract";
import { createImobAgentActivityEvent, type ImobAgentActivityEvent } from "./imobAgentActivity";
import {
  buildLeadReasonCode,
  mapLeadNextActionToLabel,
} from "../crm/imobLeadQualifyRuntime";
import { getImobInternalAgent, type ImobInternalAgentId } from "./imobInternalAgents";
import { resolveImobOperationRoute } from "../orchestrator/imobOperationRouter";

function formatCityList(cities: string[]) {
  if (cities.length === 0) return "as cidades selecionadas";
  if (cities.length === 1) return cities[0];
  if (cities.length === 2) return `${cities[0]} e ${cities[1]}`;
  return `${cities.slice(0, -1).join(", ")} e ${cities[cities.length - 1]}`;
}

function buildOwnerMessage(flow: NonNullable<ImobResolveTurnResponse["conversationState"]["operational"]>["flow"]) {
  switch (flow) {
    case "property.market_scan":
    case "property.create":
      return "Analisando a solicitação de captação.";
    case "owner.dedupe_review":
      return "Analisando os cadastros e as correspondências encontradas.";
    case "lead.qualify":
      return "Analisando a qualificação do lead.";
    default:
      return "Analisando o caso.";
  }
}

function createInternalAgentActivity(params: {
  agentId: ImobInternalAgentId;
  status: ImobAgentActivityEvent["status"];
  visibleMessage: string;
  reasonCode?: string;
  evidenceId?: string;
}) {
  const definition = getImobInternalAgent(params.agentId);
  if (!definition) {
    throw new Error(`Unknown IMOB internal agent: ${params.agentId}`);
  }

  return createImobAgentActivityEvent({
    agentId: definition.id,
    agentLabel: definition.label,
    role: definition.role,
    mode: definition.mode,
    status: params.status,
    visibleMessage: params.visibleMessage,
    reasonCode: params.reasonCode,
    evidenceId: params.evidenceId,
  });
}

function createOwnerActivity(
  flow: NonNullable<ImobResolveTurnResponse["conversationState"]["operational"]>["flow"],
  status: ImobAgentActivityEvent["status"] = "completed",
) {
  return createInternalAgentActivity({
    agentId: "IMOB_Orchestrator",
    status,
    visibleMessage: buildOwnerMessage(flow),
  });
}

function buildMarketScanActivities(
  response: ImobResolveTurnResponse,
  operational: NonNullable<ImobResolveTurnResponse["conversationState"]["operational"]>,
): ImobAgentActivityEvent[] {
  const route = resolveImobOperationRoute("market", operational.flow);
  const result = response.presentation.marketScanResult ?? operational.marketScanSnapshot ?? null;
  const run = operational.marketScanRun ?? null;
  const cities = operational.marketScanContext?.cities ?? operational.marketScanContext?.cityCandidates ?? [];
  const citySummary = formatCityList(cities);
  const activities: ImobAgentActivityEvent[] = [
    createOwnerActivity(operational.flow),
    createInternalAgentActivity({
      agentId: route.dispatchedAgentId,
      status: result ? "completed" : "analyzing",
      visibleMessage: `Preparando inteligência de mercado em ${citySummary}.`,
    }),
  ];

  if (result) {
    activities.push(
      createInternalAgentActivity({
        agentId: "Guardian_EvidenceAgent",
        status: "completed",
        visibleMessage: "Registrando snapshot da análise.",
        evidenceId: run?.evidenceBundleId ?? result.scanId,
        reasonCode: "evidence.decision_rationale",
      }),
    );
  }

  return activities;
}

function buildDedupeActivities(
  response: ImobResolveTurnResponse,
  operational: NonNullable<ImobResolveTurnResponse["conversationState"]["operational"]>,
): ImobAgentActivityEvent[] {
  const route = resolveImobOperationRoute("owner", operational.flow);
  const blocked = response.mode === "blocked";
  return [
    createOwnerActivity(operational.flow, blocked ? "blocked" : "completed"),
    createInternalAgentActivity({
      agentId: route.dispatchedAgentId,
      status: blocked ? "blocked" : "completed",
      visibleMessage: blocked
        ? "Bloqueando a atualização até confirmar o cadastro correto."
        : "Verificando cadastros existentes desta etapa.",
    }),
  ];
}

function buildLeadActivities(
  response: ImobResolveTurnResponse,
  operational: NonNullable<ImobResolveTurnResponse["conversationState"]["operational"]>,
): ImobAgentActivityEvent[] {
  const route = resolveImobOperationRoute("lead", operational.flow);
  const pendingFields = operational.pendingFields ?? [];
  const leadStatus = operational.leadStatus ?? (pendingFields.length === 0 ? "qualified" : "incomplete");
  const nextAction = operational.nextAction ?? (pendingFields.length === 0 ? "advance_commercial_step" : "ask_missing_lead_field");
  const reasonCode = buildLeadReasonCode({
    leadStatus,
    nextAction,
    pendingFields,
  });
  const activities: ImobAgentActivityEvent[] = [
    createOwnerActivity(operational.flow),
  ];

  activities.push(
    createInternalAgentActivity({
      agentId: route.dispatchedAgentId,
      status: leadStatus === "blocked" ? "blocked" : "completed",
      visibleMessage: leadStatus === "qualified"
        ? "Lead qualificado com pendências zeradas."
        : pendingFields.length > 0
          ? `Lead atualizado com ${pendingFields.length} pendência(s) obrigatória(s).`
          : "Lead preparado para continuidade do caso.",
      reasonCode,
    }),
    createImobAgentActivityEvent({
      agentId: "IMOB_LeadNextAction",
      agentLabel: "Lead",
      role: "supporting",
      mode: "propose_action",
      status: "completed",
      visibleMessage: `Próxima ação principal definida: ${mapLeadNextActionToLabel(nextAction) ?? "Continuar o caso"}.`,
      reasonCode,
    }),
  );

  if (response.presentation.preparedFollowUp) {
    activities.push(
      createInternalAgentActivity({
        agentId: "IMOB_FollowUpAgent",
        status: "completed",
        visibleMessage: "Preparando sugestão de abordagem comercial.",
      }),
    );
  }

  return activities;
}

export function buildImobAgentActivities(
  response: ImobResolveTurnResponse,
): ImobAgentActivityEvent[] {
  const operational = response.conversationState.operational;
  if (!operational) return [];

  switch (operational.flow) {
    case "property.market_scan":
      return buildMarketScanActivities(response, operational);
    case "owner.dedupe_review":
      return buildDedupeActivities(response, operational);
    case "lead.qualify":
      return buildLeadActivities(response, operational);
    case "property.create":
      return (() => {
        const route = resolveImobOperationRoute("property", operational.flow);
        return [
          createOwnerActivity(operational.flow),
          createInternalAgentActivity({
            agentId: route.dispatchedAgentId,
            status: "completed",
            visibleMessage: "Preparando o cadastro e as pendências do imóvel.",
          }),
        ];
      })();
    default:
      return [
        createOwnerActivity(operational.flow),
      ];
  }
}
