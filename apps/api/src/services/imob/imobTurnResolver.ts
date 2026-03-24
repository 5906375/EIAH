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

function detectContractType(message: string): "rent" | "sale" | "management" {
  const text = normalizeImobText(message);
  if (text.includes("loca") || text.includes("alug")) return "rent";
  if (text.includes("gest") || text.includes("administra")) return "management";
  return "sale";
}

function classifyImobIntent(message: string): ImobIntent {
  const text = normalizeImobText(message);
  if (text.includes("comissao") || text.includes("comissão")) return "commission";
  if (text.includes("contrato") || text.includes("assinatura")) return "contract";
  if (text.includes("proposta") || text.includes("oferta")) return "proposal";
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

function buildOperationalExecution(intent: ImobIntent, message: string, timestamp: string): ImobExecutionRequest {
  const numericId = extractNumericToken(message);
  switch (intent) {
    case "commission": {
      const dealId = numericId ? `deal-${numericId}` : `deal-${Date.now()}`;
      return {
        intent,
        action: "realestate.release_commission",
        prompt: `Fechar comissão imobiliária para o negócio ${dealId}.`,
        input: { dealId, brokerId: "broker-default", amountCents: 100000, requestedAt: timestamp },
      };
    }
    case "contract": {
      const propertyId = numericId ? `property-${numericId}` : `property-${Date.now()}`;
      return {
        intent,
        action: "realestate.create_contract",
        prompt: `Gerar contrato imobiliário para ${propertyId}.`,
        input: {
          propertyId,
          partyA: "proprietario-default",
          partyB: "cliente-default",
          contractType: detectContractType(message),
          requestedAt: timestamp,
        },
      };
    }
    case "proposal": {
      const propertyId = numericId ? `property-${numericId}` : `property-${Date.now()}`;
      return {
        intent,
        action: "realestate.create_contract",
        prompt: `Converter proposta em minuta contratual para ${propertyId}.`,
        input: {
          propertyId,
          partyA: "proprietario-default",
          partyB: "cliente-default",
          contractType: detectContractType(message),
          requestedAt: timestamp,
        },
      };
    }
    case "capture": {
      const propertyId = numericId ? `property-${numericId}` : `property-${Date.now()}`;
      return {
        intent,
        action: "realestate.register_property",
        prompt: `Cadastrar imóvel ${propertyId} para operação imobiliária.`,
        input: { propertyId, address: "endereco-pendente", ownerDocument: "documento-pendente", requestedAt: timestamp },
      };
    }
    case "match": {
      const propertyId = numericId ? `property-${numericId}` : `property-${Date.now()}`;
      return {
        intent,
        action: "realestate.apply_adjustment",
        prompt: `Ajustar condições para matching operacional do imóvel ${propertyId}.`,
        input: { propertyId, adjustmentType: "discount", amountCents: 5000, reason: "matching-request", requestedAt: timestamp },
      };
    }
    case "adjustment":
    default: {
      const propertyId = numericId ? `property-${numericId}` : `property-${Date.now()}`;
      return {
        intent: "adjustment",
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
  const previousPendingSlot = request.threadState?.pendingSlot ?? "none";
  const pendingSlotChanged = nextThreadState.pendingSlot !== previousPendingSlot;
  const shouldStayInSearchThread = isSearchThread(request.threadLabel) && isSearchRefinementQuery(message) && !pendingSlotChanged;
  const shouldUseConsultMode = nextThreadState.slots.goal !== null && (!hasMeaningfulSearchFilters(nextThreadState.slots) || nextThreadState.pendingSlot !== "none") && !shouldStayInSearchThread;

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

  if (isResearchQuery(message) || shouldStayInSearchThread || hasMeaningfulSearchFilters(nextThreadState.slots)) {
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

  const intent = classifyImobIntent(message);
  const executionRequest = buildOperationalExecution(intent, message, new Date().toISOString());
  return {
    mode: "execute",
    action: executionRequest.action,
    threadLabel: getIntentThreadLabel(intent),
    conversationState: { slots: createEmptyImobSlots(), mode: "execute", pendingSlot: "none", resultOffset: 0 },
    executionRequest,
    presentation: {
      text:
        intent === "capture"
          ? "Posso iniciar a captação agora."
          : intent === "match"
            ? "Posso começar a busca de opções agora."
            : intent === "proposal"
              ? "Posso preparar a proposta agora."
              : intent === "contract"
                ? "Posso iniciar o fluxo de contrato agora."
                : intent === "commission"
                  ? "Posso iniciar o fluxo de comissão agora."
                  : "Posso aplicar esse ajuste agora.",
    },
  };
}
