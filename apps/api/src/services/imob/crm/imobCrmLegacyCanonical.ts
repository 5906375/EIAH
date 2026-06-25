import type { ImobCrmCanonicalCase, ImobCrmRecommendedAction } from "./imobCrmAgentContract";
import type { ImobReasonCode } from "../control/imobReasonCodeCatalog";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
}

function normalizeImobLegacyText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function mapFlowToJourneyType(flow: string | null | undefined) {
  switch ((flow ?? "").trim()) {
    case "owner.create":
    case "property.create":
    case "listing.activate":
      return "property_capture";
    case "lead.qualify":
      return "lead_qualification";
    case "visit.schedule":
      return "visit_follow_up";
    case "documents.collect":
      return "documentation";
    case "proposal.create":
      return "proposal";
    case "deal.review":
      return "negotiation";
    case "contract.prepare":
      return "contract";
    case "commission.settle":
      return "commission";
    case "rules.configure":
      return "temporada_rules";
    default:
      return "operations";
  }
}

function mapFlowToCommercialGoal(flow: string | null | undefined) {
  switch ((flow ?? "").trim()) {
    case "owner.create":
    case "property.create":
    case "listing.activate":
      return "captacao";
    case "lead.qualify":
      return "qualificacao";
    case "visit.schedule":
      return "visita";
    case "documents.collect":
      return "documentacao";
    case "proposal.create":
      return "proposta";
    case "deal.review":
      return "negociacao";
    case "contract.prepare":
      return "contrato";
    case "commission.settle":
      return "comissao";
    case "rules.configure":
      return "temporada";
    default:
      return "operacao";
  }
}

function buildRecommendedActions(params: {
  flow?: string | null;
  nextStep?: string | null;
  pendingItems: string[];
  blockers: string[];
}): ImobCrmRecommendedAction[] {
  const normalizedFlow = (params.flow ?? "").trim();
  const normalizedNextStep = normalizeImobLegacyText(params.nextStep ?? "");
  const isMarketScanConfirmationNextStep =
    normalizedNextStep.includes("confirmar selecao do scan")
    || normalizedNextStep.includes("confirmar seleção do scan")
    || normalizedNextStep.includes("confirmar captacao do scan")
    || normalizedNextStep.includes("confirmar captação do scan");
  if (
    normalizedFlow === "owner.create"
    && params.pendingItems.length === 0
    && params.blockers.length === 0
    && normalizedNextStep.includes("vincular o proprietario")
  ) {
    return [];
  }

  const actions: ImobCrmRecommendedAction[] = [];
  const push = (action: ImobCrmRecommendedAction) => {
    if (!actions.some((item) => item.id === action.id)) actions.push(action);
  };

  if (params.blockers.length > 0) {
    push({ id: "review_blockers", label: "Revisar bloqueios", actionType: "consultive", inputHint: "mostrar bloqueios do caso", reasonCode: "BLOCKERS_PRESENT" });
  }
  if (params.pendingItems.length > 0) {
    push({ id: "review_pending_items", label: "Ver pendências", actionType: "consultive", inputHint: "mostrar pendências do caso", reasonCode: "PENDING_ITEMS_PRESENT" });
  }

  switch (normalizedFlow) {
    case "owner.create":
      push({ id: "register_owner", label: "Cadastrar proprietário", actionType: "operational", inputHint: "cadastrar proprietário" });
      break;
    case "property.create":
      if (!isMarketScanConfirmationNextStep) {
        push({ id: "register_property", label: "Cadastrar imóvel", actionType: "operational", inputHint: "cadastrar imóvel" });
      }
      break;
    case "lead.qualify":
      push({ id: "qualify_lead", label: "Qualificar lead", actionType: "operational", inputHint: "qualificar lead deste caso" });
      break;
    case "visit.schedule":
      push({ id: "register_visit", label: "Registrar visita", actionType: "operational", inputHint: "registrar visita deste caso" });
      break;
    case "documents.collect":
      push({ id: "request_documents", label: "Cobrar documentação", actionType: "operational", inputHint: "solicitar documentos pendentes" });
      break;
    case "proposal.create":
      push({ id: "generate_proposal", label: "Montar proposta", actionType: "governed", inputHint: "gerar proposta para este caso" });
      break;
    case "deal.review":
      push({ id: "open_negotiation", label: "Avançar negociação", actionType: "governed", inputHint: "abrir negociação deste caso" });
      break;
    case "contract.prepare":
      push({ id: "prepare_contract", label: "Preparar contrato", actionType: "governed", inputHint: "preparar contrato deste caso" });
      break;
    case "commission.settle":
      push({ id: "settle_commission", label: "Liberar comissão", actionType: "governed", inputHint: "liberar comissão deste caso" });
      break;
    case "rules.configure":
      push({ id: "configure_seasonal_rules", label: "Configurar regras de temporada", actionType: "governed", inputHint: "configurar regras de hospedagem deste imóvel" });
      break;
    default:
      break;
  }

  if (params.nextStep) {
    if (!normalizedNextStep.includes("mostrar bloqueios do caso")) {
      const followNextStep: ImobCrmRecommendedAction = isMarketScanConfirmationNextStep
        ? {
            id: "confirm_market_scan_capture",
            label: "Confirmar captação do scan",
            actionType: "consultive",
            inputHint: "confirmar captação do scan",
            reasonCode: "NEXT_STEP_AVAILABLE",
          }
        : {
            id: "follow_next_step",
            label: "Executar próximo passo",
            actionType: "consultive",
            inputHint: params.nextStep,
            reasonCode: "NEXT_STEP_AVAILABLE",
          };
      if (normalizedFlow === "lead.qualify" && params.pendingItems.length === 0 && params.blockers.length === 0) {
        actions.unshift(followNextStep);
      } else {
        push(followNextStep);
      }
    }
  }

  return actions.slice(0, 3);
}

export function buildImobCrmLegacyCanonicalCase(item: {
  flow?: unknown;
  nextStep?: unknown;
  pendingItems?: unknown;
  blockers?: unknown;
  status?: unknown;
}): ImobCrmCanonicalCase {
  const pendingItems = asStringList(item?.pendingItems);
  const blockers = asStringList(item?.blockers);

  return {
    journeyType: mapFlowToJourneyType(asString(item?.flow)),
    partyRole: asString(item?.flow) === "lead.qualify" ? "buyer" : asString(item?.flow) === "property.create" ? "owner" : "operator",
    commercialGoal: mapFlowToCommercialGoal(asString(item?.flow)),
    recommendedActions: buildRecommendedActions({
      flow: asString(item?.flow),
      nextStep: asString(item?.nextStep),
      pendingItems,
      blockers,
    }),
    blockedActions: blockers,
    missingContext: pendingItems,
	    reasonCodes: [
	      ...(blockers.length > 0 ? ["BLOCKERS_PRESENT"] : []),
	      ...(pendingItems.length > 0 ? ["PENDING_ITEMS_PRESENT"] : []),
	      ...(asString(item?.status) === "blocked" ? ["CASE_STATUS_BLOCKED"] : []),
	    ] as ImobReasonCode[],
  };
}
