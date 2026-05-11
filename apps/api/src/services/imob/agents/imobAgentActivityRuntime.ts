import type { ImobResolveTurnResponse } from "../imobConversationContract";
import { createImobAgentActivityEvent, type ImobAgentActivityEvent } from "./imobAgentActivity";

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

function buildMarketScanActivities(
  response: ImobResolveTurnResponse,
  operational: NonNullable<ImobResolveTurnResponse["conversationState"]["operational"]>,
): ImobAgentActivityEvent[] {
  const result = response.presentation.marketScanResult ?? operational.marketScanSnapshot ?? null;
  const cities = operational.marketScanContext?.cities ?? operational.marketScanContext?.cityCandidates ?? [];
  const citySummary = formatCityList(cities);
  const activities: ImobAgentActivityEvent[] = [
    createImobAgentActivityEvent({
      agentId: "IMOB_Orchestrator",
      agentLabel: "IMOB",
      role: "owner",
      mode: "propose_action",
      status: "completed",
      visibleMessage: buildOwnerMessage(operational.flow),
    }),
    createImobAgentActivityEvent({
      agentId: "IMOB_MarketScanAgent",
      agentLabel: "Market Scan",
      role: "supporting",
      mode: "read_only",
      status: result ? "completed" : "analyzing",
      visibleMessage: `Preparando varredura em ${citySummary}.`,
    }),
  ];

  if (result) {
    activities.push(
      createImobAgentActivityEvent({
        agentId: "Guardian_EvidenceAgent",
        agentLabel: "Guardian",
        role: "guardian",
        mode: "audit",
        status: "completed",
        visibleMessage: "Registrando snapshot da análise.",
        evidenceId: result.scanId,
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
  const blocked = response.mode === "blocked";
  return [
    createImobAgentActivityEvent({
      agentId: "IMOB_Orchestrator",
      agentLabel: "IMOB",
      role: "owner",
      mode: "propose_action",
      status: blocked ? "blocked" : "completed",
      visibleMessage: buildOwnerMessage(operational.flow),
    }),
    createImobAgentActivityEvent({
      agentId: "IMOB_DedupeAgent",
      agentLabel: "Dedupe",
      role: "supporting",
      mode: "execute",
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
  const activities: ImobAgentActivityEvent[] = [
    createImobAgentActivityEvent({
      agentId: "IMOB_Orchestrator",
      agentLabel: "IMOB",
      role: "owner",
      mode: "propose_action",
      status: "completed",
      visibleMessage: buildOwnerMessage(operational.flow),
    }),
  ];

  if (response.presentation.preparedFollowUp) {
    activities.push(
      createImobAgentActivityEvent({
        agentId: "IMOB_FollowUpAgent",
        agentLabel: "Marketing",
        role: "supporting",
        mode: "draft",
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
      return [
        createImobAgentActivityEvent({
          agentId: "IMOB_PropertyAgent",
          agentLabel: "IMOB",
          role: "owner",
          mode: "propose_action",
          status: "completed",
          visibleMessage: buildOwnerMessage(operational.flow),
        }),
      ];
    default:
      return [
        createImobAgentActivityEvent({
          agentId: "IMOB_Orchestrator",
          agentLabel: "IMOB",
          role: "owner",
          mode: "propose_action",
          status: "completed",
          visibleMessage: buildOwnerMessage(operational.flow),
        }),
      ];
  }
}
