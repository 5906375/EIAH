// Canonical IMOB case types and derivation logic.
// Extracted from routes/imob.ts (Phase 4.1b) to allow worker-side access
// without a circular import through the route layer.

export function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
}

export function normalizeImobCanonicalText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

export type ImobCanonicalJourneyType =
  | "property_capture"
  | "lead_qualification"
  | "proposal"
  | "visit_follow_up"
  | "negotiation"
  | "documentation"
  | "contract"
  | "closing"
  | "commission"
  | "temporada_rules"
  | "operations";

export type ImobCanonicalPartyRole =
  | "broker"
  | "manager"
  | "owner"
  | "buyer"
  | "seller"
  | "tenant"
  | "landlord"
  | "operator";

export type ImobCanonicalCommercialGoal =
  | "captacao"
  | "qualificacao"
  | "proposta"
  | "visita"
  | "negociacao"
  | "documentacao"
  | "contrato"
  | "fechamento"
  | "comissao"
  | "temporada"
  | "operacao";

export type ImobCanonicalRecommendedAction = {
  id: string;
  label: string;
  actionType: "consultive" | "operational" | "governed";
  inputHint?: string;
  reasonCode?: string;
};

export type ImobCanonicalCase = {
  journeyType?: ImobCanonicalJourneyType;
  partyRole?: ImobCanonicalPartyRole;
  commercialGoal?: ImobCanonicalCommercialGoal;
  recommendedActions?: ImobCanonicalRecommendedAction[];
  blockedActions?: string[];
  missingContext?: string[];
  reasonCodes?: string[];
};

export function mapImobFlowToJourneyType(flow: string | null | undefined): ImobCanonicalJourneyType {
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

export function mapImobFlowToCommercialGoal(flow: string | null | undefined): ImobCanonicalCommercialGoal {
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

export function mapImobResponsibleToPartyRole(
  ownerResponsible: string | null | undefined,
  journeyType: ImobCanonicalJourneyType,
): ImobCanonicalPartyRole {
  const normalized = normalizeImobCanonicalText(ownerResponsible ?? "");
  if (normalized.includes("corretor")) return "broker";
  if (normalized.includes("juridico")) return "manager";
  if (normalized.includes("financeiro")) return "manager";
  if (normalized.includes("imob ops")) return "operator";
  if (normalized.includes("cliente")) {
    if (journeyType === "property_capture" || journeyType === "documentation") return "owner";
    if (journeyType === "lead_qualification" || journeyType === "proposal" || journeyType === "visit_follow_up") return "buyer";
  }
  if (journeyType === "property_capture") return "owner";
  if (journeyType === "lead_qualification" || journeyType === "proposal" || journeyType === "visit_follow_up") return "buyer";
  return "operator";
}

export function buildImobRecommendedActions(params: {
  flow: string | null | undefined;
  nextStep?: string | null;
  pendingItems: string[];
  blockers: string[];
  hasLead?: boolean;
  hasOwner?: boolean;
}): ImobCanonicalRecommendedAction[] {
  const actions: ImobCanonicalRecommendedAction[] = [];
  const push = (action: ImobCanonicalRecommendedAction) => {
    if (actions.some((item) => item.id === action.id)) return;
    actions.push(action);
  };

  if (params.blockers.length > 0) {
    push({
      id: "review_blockers",
      label: "Revisar bloqueios",
      actionType: "consultive",
      inputHint: "mostrar bloqueios do caso",
      reasonCode: "BLOCKERS_PRESENT",
    });
  }

  if (params.pendingItems.length > 0) {
    push({
      id: "review_pending_items",
      label: "Ver pendências",
      actionType: "consultive",
      inputHint: "mostrar pendências do caso",
      reasonCode: "PENDING_ITEMS_PRESENT",
    });
  }

  switch ((params.flow ?? "").trim()) {
    case "owner.create":
      push({ id: "register_owner", label: "Cadastrar proprietário", actionType: "operational", inputHint: "cadastrar proprietário" });
      push({ id: "continue_property_capture", label: "Avançar captação", actionType: "operational", inputHint: "continuar captação deste caso" });
      break;
    case "property.create":
      if (params.pendingItems.length === 0) {
        if (params.hasLead) {
          push({ id: "advance_visit", label: "Avançar para visita", actionType: "operational", inputHint: "vamos avançar para visita" });
        } else {
          push({ id: "qualify_lead", label: "Qualificar lead", actionType: "operational", inputHint: "qualificar lead deste caso" });
        }
        if (!params.hasOwner) {
          push({ id: "register_owner", label: "Cadastrar proprietário", actionType: "operational", inputHint: "cadastrar proprietário" });
        }
      } else {
        push({ id: "register_property", label: "Cadastrar imóvel", actionType: "operational", inputHint: "cadastrar imóvel" });
        push({ id: "continue_property_capture", label: "Avançar captação", actionType: "operational", inputHint: "continuar captação deste caso" });
      }
      break;
    case "listing.activate":
      push({ id: "publish_listing", label: "Publicar anúncio", actionType: "operational", inputHint: "publicar anúncio deste caso" });
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
      push({ id: "complete_seasonal_occupancy", label: "Completar check-in e ocupação", actionType: "operational", inputHint: "completar check-in, check-out e limite de hóspedes deste imóvel" });
      break;
    default:
      break;
  }

  if (params.nextStep && params.nextStep.trim().length > 0) {
    const normalizedNextStep = normalizeImobCanonicalText(params.nextStep);
    if (!normalizedNextStep.includes("mostrar bloqueios do caso")) {
      push({
        id: "follow_next_step",
        label: "Executar próximo passo",
        actionType: "consultive",
        inputHint: params.nextStep.trim(),
        reasonCode: "NEXT_STEP_AVAILABLE",
      });
    }
  }

  return actions.slice(0, 3);
}

export function buildImobCanonicalCase(params: {
  flow: string | null | undefined;
  stage: string | null | undefined;
  status: string | null | undefined;
  ownerResponsible?: string | null;
  nextStep?: string | null;
  blockers?: unknown;
  pendingItems?: unknown;
  lead?: { id?: string | null; name?: string | null } | null;
  owner?: { id?: string | null; name?: string | null } | null;
  property?: { id?: string | null } | null;
}): ImobCanonicalCase {
  const pendingItems = asStringList(params.pendingItems);
  const blockers = asStringList(params.blockers);
  const journeyType = mapImobFlowToJourneyType(params.flow);
  const reasonCodes = [
    ...(blockers.length > 0 ? ["BLOCKERS_PRESENT"] : []),
    ...(pendingItems.length > 0 ? ["PENDING_ITEMS_PRESENT"] : []),
    ...(params.stage === "collecting" ? ["CASE_STAGE_COLLECTING"] : []),
    ...(params.status === "blocked" ? ["CASE_STATUS_BLOCKED"] : []),
  ];

  return {
    journeyType,
    partyRole: mapImobResponsibleToPartyRole(params.ownerResponsible, journeyType),
    commercialGoal: mapImobFlowToCommercialGoal(params.flow),
    recommendedActions: buildImobRecommendedActions({
      flow: params.flow,
      nextStep: params.nextStep,
      pendingItems,
      blockers,
      hasLead: Boolean(params.lead && (params.lead.id || params.lead.name)),
      hasOwner: Boolean(params.owner && (params.owner.id || params.owner.name)),
    }),
    blockedActions: blockers,
    missingContext: pendingItems,
    reasonCodes,
  };
}

// Guard: returns true when a run's outputs contain at least one simulated tool result.
// Simulated executions happen when a realestate.* ToolContract is missing in DB;
// they must never trigger ImobCase mutation.
export function shouldSkipImobPostRunMutationForSimulatedOutput(run: {
  response?: unknown;
}): boolean {
  if (!run.response || typeof run.response !== "object" || Array.isArray(run.response)) {
    return false;
  }
  const response = run.response as Record<string, unknown>;
  const outputs = response.outputs;
  if (!Array.isArray(outputs)) return false;
  return outputs.some((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
    const data = (entry as Record<string, unknown>).data;
    if (!data || typeof data !== "object" || Array.isArray(data)) return false;
    return (data as Record<string, unknown>).simulated === true;
  });
}
