import { buildImobDriveSearchUrl } from "./imobDriveSync";
import {
  createEmptyImobSlots,
  type ImobExecutionRequest,
  type ImobIntent,
  type ImobKnowledgeSourceFilter,
  type ImobResolveTurnRequest,
  type ImobResolveTurnResponse,
} from "./imobConversationContract";
import {
  createNextImobOperationalState,
  createNextImobThreadState,
  extractRegion,
  extractGoal,
  hasMeaningfulSearchFilters,
  normalizeImobText,
} from "./imobConversationState";

const IMOB_DRIVE_FOLDER_URL = "https://drive.google.com/drive/folders/1rwqbWQmL2eiXYBY5UaPReubZ2sbQsBu3";

function extractNumericToken(text: string) {
  const match = text.match(/#?([0-9]{2,})/);
  return match ? match[1] : null;
}

function extractPropertyReferenceToken(message: string) {
  const normalized = normalizeImobText(message);
  const match = normalized.match(/(?:imovel|imóvel|apartamento|apto|casa)\s*#?\s*(\d{2,})/);
  return match ? match[1] : null;
}

function detectContractType(message: string): "rent" | "sale" | "management" {
  const text = normalizeImobText(message);
  if (text.includes("loca") || text.includes("alug")) return "rent";
  if (text.includes("gest") || text.includes("administra")) return "management";
  return "sale";
}

function classifyImobIntent(message: string): ImobIntent {
  const text = normalizeImobText(message);
  if (text.includes("comissao") || text.includes("comissão") || text.includes("repasse") || text.includes("sinal")) return "commission";
  if (text.includes("contrato") || text.includes("assinatura") || text.includes("minuta")) return "contract";
  if (text.includes("proposta") || text.includes("oferta") || text.includes("negocia")) return "proposal";
  if (text.includes("visita") || text.includes("agendar") || text.includes("agenda") || text.includes("tour")) return "visit";
  if (text.includes("lead") || text.includes("triagem") || text.includes("qualificar cliente") || text.includes("qualificar lead")) return "lead";
  if (text.includes("publicar") || text.includes("anuncio") || text.includes("anúncio") || text.includes("listing") || text.includes("portal")) return "listing";
  if (text.includes("cadastrar") || text.includes("capta") || text.includes("propriet") || text.includes("imovel") || text.includes("imóvel")) return "capture";
  if (text.includes("alugar") || text.includes("loca") || text.includes("procur") || text.includes("quartos")) return "match";
  return "adjustment";
}

function extractSegment(text: string): "locacao" | "venda" | "ambos" {
  const normalized = normalizeImobText(text);
  const goal = extractGoal(normalized);
  return goal ?? "ambos";
}

function buildSearchSourceDescription(region: string, segment: "locacao" | "venda" | "ambos") {
  const segmentLabel = segment === "locacao" ? "locação" : segment === "venda" ? "venda" : "locação e venda";
  return region === "Brasil" ? segmentLabel : `${segmentLabel} em ${region}`;
}

function buildImobSearchSources(query: string, region: string, segment: "locacao" | "venda" | "ambos") {
  const scopeLabel = buildSearchSourceDescription(region, segment);
  return [
    {
      id: "drive-search",
      label: "Buscar no acervo IMOB",
      href: buildImobDriveSearchUrl(query),
      description: `Pesquisa direta no Drive do IMOB para ${scopeLabel}.`,
    },
    {
      id: "drive-folder",
      label: "Abrir pasta base IMOB",
      href: IMOB_DRIVE_FOLDER_URL,
      description: "Abre a pasta compartilhada para navegação manual no acervo do time.",
    },
  ];
}

function dedupeSourceTypes(items: ImobKnowledgeSourceFilter[]) {
  return [...new Set(items)];
}

function extractKnowledgeSourceTypes(message: string): ImobKnowledgeSourceFilter[] {
  const normalized = normalizeImobText(message);
  const sourceTypes: ImobKnowledgeSourceFilter[] = [];

  if (normalized.includes("drive") || normalized.includes("acervo")) sourceTypes.push("drive");
  if (normalized.includes("upload") || normalized.includes("arquivo") || normalized.includes("anexo") || normalized.includes("planilha") || normalized.includes("pdf")) sourceTypes.push("upload");
  if (normalized.includes("site") || normalized.includes("sites") || normalized.includes("web")) sourceTypes.push("web");
  if (normalized.includes("interno") || normalized.includes("playbook") || normalized.includes("base interna") || normalized.includes("guia interno")) sourceTypes.push("internal_doc");

  return dedupeSourceTypes(sourceTypes);
}

function hasImobKnowledgeAccess(request?: ImobResolveTurnRequest) {
  const access = request?.access;
  if (!access?.tenantId || !access?.workspaceId) return false;
  return access.entitlements?.REAL_ESTATE_CORE === true;
}

function isKnowledgeSearchQuery(message: string) {
  const text = normalizeImobText(message);
  return (
    text.includes("acervo imob") ||
    text.includes("buscar contratos e propostas") ||
    text.includes("contratos e propostas") ||
    text.includes("materiais de capta") ||
    text.includes("buscar por cidade ou regiao") ||
    text.includes("buscar por cidade ou região") ||
    text.includes("documentos de loca") ||
    text.includes("documentos de venda") ||
    text.includes("modelos de proposta") ||
    text.includes("checklists de capta") ||
    text.includes("playbook") ||
    text.includes("base interna") ||
    text.includes("documento interno") ||
    text.includes("uploads") ||
    text.includes("upload") ||
    text.includes("arquivo") ||
    text.includes("anexo") ||
    text.includes("site") ||
    text.includes("sites") ||
    text.includes("web")
  );
}

function isResearchQuery(message: string) {
  const text = normalizeImobText(message);
  const hasInventoryIntent =
    text.includes("buscar") ||
    text.includes("busca") ||
    text.includes("pesquisa") ||
    text.includes("consultar portais") ||
    text.includes("portais imobili") ||
    text.includes("site imobili") ||
    text.includes("sites imobili") ||
    text.includes("mercado") ||
    text.includes("regi") ||
    text.includes("brasil");
  const hasNaturalDiscoveryIntent =
    text.includes("quero alugar") ||
    text.includes("quero comprar") ||
    text.includes("quero locar") ||
    text.includes("procuro") ||
    text.includes("procurando") ||
    text.includes("preciso alugar") ||
    text.includes("preciso comprar");
  const hasInventorySubject =
    text.includes("apto") ||
    text.includes("apart") ||
    text.includes("casa") ||
    text.includes("imovel") ||
    text.includes("imóvel") ||
    text.includes("kitnet") ||
    text.includes("studio") ||
    text.includes("sala") ||
    text.includes("galpao") ||
    text.includes("galpão") ||
    text.includes("terreno") ||
    text.includes("cobertura");

  return hasInventoryIntent || hasNaturalDiscoveryIntent || (hasNaturalDiscoveryIntent && hasInventorySubject);
}

function isSearchThread(threadLabel?: string | null) {
  if (!threadLabel) return false;
  const normalized = normalizeImobText(threadLabel);
  return normalized.includes("busca de imoveis") || normalized.includes("busca de imóveis");
}

function isSearchRefinementQuery(message: string) {
  const text = normalizeImobText(message);
  return (
    text.includes("quarto") ||
    text.includes("banheiro") ||
    text.includes("suite") ||
    text.includes("suíte") ||
    text.includes("vaga") ||
    text.includes("garagem") ||
    text.includes("bairro") ||
    text.includes("centro") ||
    text.includes("praia") ||
    text.includes("valor") ||
    text.includes("preco") ||
    text.includes("preço") ||
    text.includes("mobiliado") ||
    text.includes("mobilia") ||
    text.includes("mobiliada") ||
    text.includes("pet") ||
    text.includes("condominio") ||
    text.includes("condomínio")
  );
}

function buildConsultPresentationText(response: ImobResolveTurnResponse) {
  const slots = response.conversationState.slots;
  const pendingSlot = response.conversationState.pendingSlot ?? "none";
  const goalLabel = response.searchRequest?.segment === "locacao" ? "locação" : response.searchRequest?.segment === "venda" ? "venda" : "locação e venda";
  if (pendingSlot === "city") return "Certo. Posso seguir por Balneário Camboriú, Itajaí ou Itapema. Qual cidade você quer?";
  if (pendingSlot === "budget") return "Qual faixa de valor você quer considerar?";
  if (pendingSlot === "bedrooms") return "Quantos quartos você quer?";
  if (pendingSlot === "bathrooms") return "Quantos banheiros você quer?";
  const cityLabel = slots.city ? ` em ${slots.city}` : "";
  return slots.propertyType
    ? `Posso te ajudar com ${slots.propertyType} para ${goalLabel}${cityLabel}. Quer seguir por cidade, faixa de valor ou número de quartos?`
    : `Posso te ajudar com ${goalLabel}${cityLabel}. Quer seguir por cidade, faixa de valor ou número de quartos?`;
}

function getIntentThreadLabel(intent: ImobIntent) {
  switch (intent) {
    case "capture":
      return "Captação";
    case "match":
      return "Busca de imóveis";
    case "lead":
      return "Lead";
    case "visit":
      return "Visita";
    case "listing":
      return "Listing";
    case "proposal":
      return "Proposta";
    case "contract":
      return "Contrato";
    case "commission":
      return "Comissão";
    case "adjustment":
    default:
      return "Ajuste";
  }
}

function buildOperationalExecution(intent: ImobIntent, message: string, timestamp: string, operationalState?: ImobResolveTurnResponse["conversationState"]["operational"] | null): ImobExecutionRequest {
  const numericId = extractNumericToken(message);
  const propertyRef = extractPropertyReferenceToken(message);
  switch (intent) {
    case "commission": {
      const dealId = numericId ? `deal-${numericId}` : `deal-${Date.now()}`;
      return {
        intent,
        operation: "commission.settle",
        action: "realestate.release_commission",
        prompt: `Fechar comissão imobiliária para o negócio ${dealId}.`,
        input: { dealId, brokerRef: "broker-default", amountCents: 100000, requestedAt: timestamp },
      };
    }
    case "contract": {
      const propertyId = propertyRef ? `property-${propertyRef}` : `property-${Date.now()}`;
      return {
        intent,
        operation: "contract.prepare",
        action: "realestate.create_contract",
        prompt: `Gerar contrato imobiliário para ${propertyId}.`,
        input: {
          propertyId,
          ownerRef: "owner-pending",
          clientRef: "client-pending",
          contractType: detectContractType(message),
          requestedAt: timestamp,
        },
      };
    }
    case "proposal": {
      const propertyId = propertyRef ? `property-${propertyRef}` : `property-${Date.now()}`;
      return {
        intent,
        operation: "proposal.create",
        action: "realestate.create_contract",
        prompt: `Preparar proposta operacional para ${propertyId}.`,
        input: {
          propertyId,
          ownerRef: "owner-pending",
          clientRef: operationalState?.flow === "proposal.create" ? (operationalState.proposalDraft?.buyerName ?? "client-pending") : "client-pending",
          buyerEmail: operationalState?.flow === "proposal.create" ? (operationalState.proposalDraft?.buyerEmail ?? null) : null,
          buyerPhone: operationalState?.flow === "proposal.create" ? (operationalState.proposalDraft?.buyerPhone ?? null) : null,
          offerAmount: operationalState?.flow === "proposal.create" ? (operationalState.proposalDraft?.offerAmount ?? null) : null,
          contractType: operationalState?.flow === "proposal.create" ? (operationalState.proposalDraft?.contractType ?? detectContractType(message)) : detectContractType(message),
          requestedAt: timestamp,
        },
      };
    }
    case "capture": {
      const propertyId = operationalState?.flow === "property.create"
        ? (operationalState.propertyDraft?.propertyId ?? (propertyRef ? `property-${propertyRef}` : `property-${Date.now()}`))
        : propertyRef ? `property-${propertyRef}` : `property-${Date.now()}`;
      return {
        intent,
        operation: operationalState?.flow === "property.create" ? "property.create" : "owner.create",
        action: "realestate.register_property",
        prompt: `Cadastrar imóvel ${propertyId} para operação imobiliária.`,
        input: {
          propertyId,
          ownerRef: operationalState?.flow === "owner.create" ? (operationalState.ownerDraft?.ownerName ?? "owner-pending") : "owner-pending",
          ownerEmail: operationalState?.flow === "owner.create" ? (operationalState.ownerDraft?.ownerEmail ?? null) : null,
          ownerPhone: operationalState?.flow === "owner.create" ? (operationalState.ownerDraft?.ownerPhone ?? null) : null,
          ownerDocument: operationalState?.flow === "owner.create" ? (operationalState.ownerDraft?.ownerDocument ?? null) : null,
          propertyType: operationalState?.flow === "property.create" ? (operationalState.propertyDraft?.propertyType ?? null) : null,
          goal: operationalState?.flow === "property.create" ? (operationalState.propertyDraft?.goal ?? null) : null,
          city: operationalState?.flow === "property.create" ? (operationalState.propertyDraft?.city ?? null) : null,
          neighborhood: operationalState?.flow === "property.create" ? (operationalState.propertyDraft?.neighborhood ?? null) : null,
          bedrooms: operationalState?.flow === "property.create" ? (operationalState.propertyDraft?.bedrooms ?? null) : null,
          bathrooms: operationalState?.flow === "property.create" ? (operationalState.propertyDraft?.bathrooms ?? null) : null,
          address: operationalState?.flow === "property.create" ? (operationalState.propertyDraft?.address ?? "endereco-pendente") : "endereco-pendente",
          requestedAt: timestamp,
        },
      };
    }
    case "listing": {
      const propertyId = propertyRef ? `property-${propertyRef}` : `property-${Date.now()}`;
      return {
        intent,
        operation: "listing.activate",
        action: "realestate.apply_adjustment",
        prompt: `Ativar listing operacional do imóvel ${propertyId}.`,
        input: { propertyId, adjustmentType: "listing_activate", reason: "listing-operation", requestedAt: timestamp },
      };
    }
    case "lead": {
      const leadId = numericId ? `lead-${numericId}` : `lead-${Date.now()}`;
      return {
        intent,
        operation: "lead.qualify",
        action: "realestate.apply_adjustment",
        prompt: `Qualificar lead imobiliário ${leadId}.`,
        input: {
          leadId,
          leadName: operationalState?.flow === "lead.qualify" ? (operationalState.leadDraft?.leadName ?? null) : null,
          leadEmail: operationalState?.flow === "lead.qualify" ? (operationalState.leadDraft?.leadEmail ?? null) : null,
          leadPhone: operationalState?.flow === "lead.qualify" ? (operationalState.leadDraft?.leadPhone ?? null) : null,
          desiredGoal: operationalState?.flow === "lead.qualify" ? (operationalState.leadDraft?.desiredGoal ?? null) : null,
          desiredCity: operationalState?.flow === "lead.qualify" ? (operationalState.leadDraft?.desiredCity ?? null) : null,
          budgetMax: operationalState?.flow === "lead.qualify" ? (operationalState.leadDraft?.budgetMax ?? null) : null,
          adjustmentType: "lead_qualification",
          reason: "lead-qualification",
          requestedAt: timestamp,
        },
      };
    }
    case "visit": {
      const propertyId = propertyRef ? `property-${propertyRef}` : `property-${Date.now()}`;
      return {
        intent,
        operation: "visit.schedule",
        action: "realestate.apply_adjustment",
        prompt: `Agendar visita operacional para ${propertyId}.`,
        input: { propertyId, adjustmentType: "visit_schedule", reason: "visit-scheduling", requestedAt: timestamp },
      };
    }
    case "match": {
      const propertyId = propertyRef ? `property-${propertyRef}` : `property-${Date.now()}`;
      return {
        intent,
        operation: "lead.qualify",
        action: "realestate.apply_adjustment",
        prompt: `Ajustar condições para matching operacional do imóvel ${propertyId}.`,
        input: {
          propertyId,
          leadName: operationalState?.flow === "lead.qualify" ? (operationalState.leadDraft?.leadName ?? null) : null,
          desiredGoal: operationalState?.flow === "lead.qualify" ? (operationalState.leadDraft?.desiredGoal ?? null) : null,
          desiredCity: operationalState?.flow === "lead.qualify" ? (operationalState.leadDraft?.desiredCity ?? null) : null,
          budgetMax: operationalState?.flow === "lead.qualify" ? (operationalState.leadDraft?.budgetMax ?? null) : null,
          adjustmentType: "discount",
          amountCents: 5000,
          reason: "matching-request",
          requestedAt: timestamp,
        },
      };
    }
    case "adjustment":
    default: {
      const propertyId = propertyRef ? `property-${propertyRef}` : `property-${Date.now()}`;
      return {
        intent: "adjustment",
        operation: "adjustment.apply",
        action: "realestate.apply_adjustment",
        prompt: `Aplicar ajuste operacional ao imóvel ${propertyId}.`,
        input: { propertyId, adjustmentType: "correction", amountCents: 1000, reason: "operational-adjustment", requestedAt: timestamp },
      };
    }
  }
}

export function resolveImobTurn(request: ImobResolveTurnRequest): ImobResolveTurnResponse {
  const message = request.message.trim();
  const nextThreadState = createNextImobThreadState(request.threadState ?? undefined, message);

  if (isKnowledgeSearchQuery(message)) {
    const region = nextThreadState.slots.city ?? nextThreadState.slots.region ?? extractRegion(normalizeImobText(message)) ?? "Brasil";
    const segment = nextThreadState.slots.goal ?? extractSegment(message);
    const sourceTypes = extractKnowledgeSourceTypes(message);
    if (!hasImobKnowledgeAccess(request)) {
      return {
        mode: "blocked",
        action: "realestate.search_knowledge_base",
        threadLabel: "Busca de imóveis",
        conversationState: { ...nextThreadState, mode: "blocked" },
        presentation: {
          text: "O IMOB não está habilitado para este tenant/workspace. Ative a vertical antes de usar a busca documental.",
          suggestedNextAction: "Ativar o IMOB no workspace ou falar com comercial.",
        },
      };
    }
    const sources = buildImobSearchSources(message, region, segment);
    return {
      mode: "search_knowledge",
      action: "realestate.search_knowledge_base",
      threadLabel: "Busca de imóveis",
      conversationState: { ...nextThreadState, mode: "search_knowledge" },
      knowledgeRequest: {
        query: message,
        filters: { region, segment, sourceTypes },
      },
      presentation: {
        text: `Pesquisar documentos do acervo IMOB em ${region} para ${segment}.`,
        card: {
          title: "Busca documental IMOB",
          lines: ["Vou consultar o acervo IMOB com este recorte."],
          ctas: sources.map((source, index) => ({ id: source.id, label: source.label, href: source.href, kind: index === 0 ? ("primary" as const) : ("neutral" as const) })).slice(0, 2),
        },
        suggestedNextAction: "Refinar tipo documental, cidade, operação ou etapa da jornada.",
      },
    };
  }

  const resolvedRegion = nextThreadState.slots.city ?? nextThreadState.slots.region ?? extractRegion(normalizeImobText(message)) ?? "Brasil";
  const resolvedSegment = nextThreadState.slots.goal ?? extractSegment(message);
  const intent = classifyImobIntent(message);
  const previousPendingSlot = request.threadState?.pendingSlot ?? "none";
  const pendingSlotChanged = nextThreadState.pendingSlot !== previousPendingSlot;
  const shouldStayInSearchThread = isSearchThread(request.threadLabel) && isSearchRefinementQuery(message) && !pendingSlotChanged;
  const shouldUseConsultMode =
    intent === "match" &&
    nextThreadState.slots.goal !== null &&
    (!hasMeaningfulSearchFilters(nextThreadState.slots) || nextThreadState.pendingSlot !== "none") &&
    !shouldStayInSearchThread;

  if (shouldUseConsultMode) {
    const response: ImobResolveTurnResponse = {
      mode: "consult",
      action: "realestate.search_inventory",
      threadLabel: "Busca de imóveis",
      conversationState: { ...nextThreadState, mode: "consult" },
      searchRequest: {
        query: message,
        region: resolvedRegion,
        segment: resolvedSegment,
        slots: nextThreadState.slots,
        offset: nextThreadState.resultOffset,
        limit: 2,
      },
      presentation: { text: "", suggestedNextAction: "Coletar cidade, faixa de valor ou quantidade de quartos." },
    };
    response.presentation.text = buildConsultPresentationText(response);
    return response;
  }

  if (intent === "match" && (isResearchQuery(message) || shouldStayInSearchThread || hasMeaningfulSearchFilters(nextThreadState.slots))) {
    return {
      mode: "search",
      action: "realestate.search_inventory",
      threadLabel: "Busca de imóveis",
      conversationState: { ...nextThreadState, mode: "search" },
      searchRequest: {
        query: message,
        region: resolvedRegion,
        segment: resolvedSegment,
        slots: nextThreadState.slots,
        offset: nextThreadState.resultOffset,
        limit: 2,
      },
      presentation: {
        text: `Pesquisar opções de imóveis em ${resolvedRegion} para ${resolvedSegment}.`,
        suggestedNextAction: "Refinar região, faixa de preço e tipologia.",
      },
    };
  }

  const operationalState = createNextImobOperationalState(request.threadState?.operational ?? null, intent, message, nextThreadState.slots);
  const executionRequest = buildOperationalExecution(intent, message, new Date().toISOString(), operationalState);
  return {
    mode: "execute",
    action: executionRequest.action,
    threadLabel: getIntentThreadLabel(intent),
    conversationState: { slots: createEmptyImobSlots(), mode: "execute", pendingSlot: "none", resultOffset: 0, operational: operationalState },
    executionRequest,
    presentation: {
      text:
        intent === "capture"
          ? operationalState?.flow === "property.create"
            ? operationalState.pendingFields.length > 0
              ? `Posso iniciar o cadastro do imóvel agora. Ainda preciso de: ${operationalState.pendingFields.join(", ")}.`
              : "Posso iniciar o cadastro do imóvel agora."
            : operationalState?.flow === "owner.create" && operationalState.pendingFields.length > 0
              ? `Posso iniciar a captação agora. Ainda preciso de: ${operationalState.pendingFields.join(", ")}.`
              : "Posso iniciar a captação agora."
          : intent === "match"
            ? "Posso começar a busca de opções agora."
            : intent === "lead"
              ? operationalState?.flow === "lead.qualify" && operationalState.pendingFields.length > 0
                ? `Posso iniciar a qualificação do lead agora. Ainda preciso de: ${operationalState.pendingFields.join(", ")}.`
                : "Posso iniciar a qualificação do lead agora."
              : intent === "visit"
                ? "Posso organizar o agendamento da visita agora."
                : intent === "listing"
                  ? "Posso preparar a ativação do anúncio agora."
                  : intent === "proposal"
                    ? operationalState?.flow === "proposal.create" && operationalState.pendingFields.length > 0
                      ? `Posso preparar a proposta agora. Ainda preciso de: ${operationalState.pendingFields.join(", ")}.`
                      : "Posso preparar a proposta agora."
                    : intent === "contract"
                      ? "Posso iniciar o fluxo de contrato agora."
                      : intent === "commission"
                        ? "Posso iniciar o fluxo de comissão agora."
                        : "Posso aplicar esse ajuste agora.",
    },
  };
}
