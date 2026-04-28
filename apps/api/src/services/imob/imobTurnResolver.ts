import { buildImobDriveSearchUrl } from "./imobDriveSync";
import { type ImobActionKey } from "./imobActionCatalog";
import {
  buildImobCanonicalMessage,
  getSupportedActions,
  listImobIntentChoicesForAction,
  parseImobIntent,
  resolveCanonicalLabel,
} from "./imobIntentCatalog";
import {
  createEmptyImobSlots,
  type ImobPresentationMetadata,
  type ImobExecutionRequest,
  type ImobIntent,
  type ImobKnowledgeSourceFilter,
  type ImobOperationalState,
  type ImobOperationalOwner,
  type ImobResolveTurnRequest,
  type ImobResolveTurnResponse,
} from "./imobConversationContract";
import { buildImobAgentRuntimeMetadata } from "./imobAgentContract";
import {
  createNextImobOperationalState,
  createNextImobThreadState,
  extractRegion,
  extractGoal,
  hasMeaningfulSearchFilters,
  normalizeImobText,
} from "./imobConversationState";
import { IMOB_CRM_PROPERTY_GOAL_OPTIONS, normalizeImobCrmPropertyGoal } from "./crm/imobCrmPropertyGoals";
import { IMOB_CRM_PROPERTY_TYPE_OPTIONS, normalizeImobCrmPropertyType } from "./crm/imobCrmPropertyTypes";

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

function isRulesConfigurationRequest(message: string) {
  const text = normalizeImobText(message);
  const hasRulesSignal =
    text.includes("regras") ||
    text.includes("regra") ||
    text.includes("checkin") ||
    text.includes("check in") ||
    text.includes("checkout") ||
    text.includes("check out") ||
    text.includes("hospedes") ||
    text.includes("hóspedes") ||
    text.includes("hospedagem");
  const hasPropertyContext =
    text.includes("imovel") ||
    text.includes("imóvel") ||
    text.includes("temporada") ||
    text.includes("diaria") ||
    text.includes("diária") ||
    text.includes("locacao") ||
    text.includes("locação") ||
    text.includes("aluguel");
  return hasRulesSignal && hasPropertyContext;
}

function classifyImobIntent(message: string): ImobIntent {
  const text = normalizeImobText(message);
  if (isRulesConfigurationRequest(message)) return "rules";
  if (text.includes("comissao") || text.includes("comissão") || text.includes("repasse") || text.includes("sinal")) return "commission";
  if (text.includes("deal") || text.includes("negocio") || text.includes("negócio") || text.includes("review do negocio") || text.includes("review do negócio") || text.includes("revisar negocio") || text.includes("revisar negócio")) return "deal";
  if (text.includes("contrato") || text.includes("assinatura") || text.includes("minuta")) return "contract";
  if (isDocumentCollectionRequest(message)) return "documents";
  if (text.includes("proposta") || text.includes("oferta") || text.includes("negocia")) return "proposal";
  if (text.includes("visita") || text.includes("agendar") || text.includes("agenda") || text.includes("tour")) return "visit";
  if (text.includes("lead") || text.includes("triagem") || text.includes("qualificar cliente") || text.includes("qualificar lead")) return "lead";
  if (text.includes("publicar") || text.includes("anuncio") || text.includes("anúncio") || text.includes("listing") || text.includes("portal")) return "listing";
  if (
    text.includes("cadastrar") ||
    text.includes("capta") ||
    text.includes("propriet") ||
    text.includes("imovel") ||
    text.includes("imóvel") ||
    text.includes("vender")
  ) return "capture";
  if (text.includes("alugar") || text.includes("loca") || text.includes("procur") || text.includes("quartos")) return "match";
  return "adjustment";
}

function mapCatalogIntentToImobIntent(parsed: { entity: string | null; action: string | null }): ImobIntent | null {
  if (!parsed.entity || !parsed.action) return null;

  if (["proprietario", "imovel", "vendedor", "locador"].includes(parsed.entity) && parsed.action === "create") {
    return "capture";
  }

  if (parsed.entity === "imovel" && parsed.action === "configure") {
    return "rules";
  }

  if (["comprador", "locatario", "lead"].includes(parsed.entity) && parsed.action === "create") {
    return "lead";
  }

  if (parsed.entity === "anuncio" && ["create", "publish", "unpublish", "edit"].includes(parsed.action)) {
    return "listing";
  }

  if (parsed.entity === "documento" && ["validate", "send", "create", "edit"].includes(parsed.action)) {
    return "documents";
  }

  if (parsed.entity === "contrato" && ["create", "edit", "history", "sendForSignature", "approve", "get"].includes(parsed.action)) {
    return "contract";
  }

  if (parsed.entity === "proposta" && ["create", "edit", "approve", "reject", "send", "history", "get"].includes(parsed.action)) {
    return "proposal";
  }

  if (parsed.entity === "visita" && ["create", "edit", "confirm", "reschedule", "get", "list"].includes(parsed.action)) {
    return "visit";
  }

  return null;
}

function mapOperationalFlowToIntent(flow: NonNullable<ImobResolveTurnResponse["conversationState"]["operational"]>["flow"]): ImobIntent {
  if (flow === "owner.create" || flow === "property.create") return "capture";
  if (flow === "lead.qualify") return "lead";
  if (flow === "visit.schedule") return "visit";
  if (flow === "listing.activate") return "listing";
  if (flow === "documents.collect") return "documents";
  if (flow === "proposal.create") return "proposal";
  if (flow === "deal.review") return "deal";
  if (flow === "contract.prepare") return "contract";
  if (flow === "rules.configure") return "rules";
  if (flow === "commission.settle") return "commission";
  return "adjustment";
}

function shouldBreakOwnerCaptureContinuation(
  previous: ImobResolveTurnRequest["threadState"]["operational"] | null | undefined,
  baseIntent: ImobIntent,
  message: string,
) {
  if (!previous || previous.status !== "collecting" || previous.flow !== "owner.create" || baseIntent !== "capture") {
    return false;
  }
  const text = normalizeImobText(message);
  if (text.includes("propriet")) return false;
  return (
    text.includes("vender") ||
    text.includes("venda") ||
    text.includes("alugar") ||
    text.includes("locacao") ||
    text.includes("locação") ||
    text.includes("cadastrar imovel") ||
    text.includes("cadastrar imóvel") ||
    text.includes("captar imovel") ||
    text.includes("captar imóvel")
  );
}

function isExplicitCaseContinuationRequest(message: string) {
  const text = normalizeImobText(message);
  return (
    text.includes("continuar este cadastro") ||
    text.includes("retomar este cadastro") ||
    text.includes("continuar desse caso") ||
    text.includes("continuar deste caso") ||
    text.includes("retomar desse caso") ||
    text.includes("retomar deste caso")
  );
}

function hasPendingFieldSignalForActiveFlow(
  activeOperationalState: ImobOperationalState,
  message: string,
  nextSlots: ReturnType<typeof createNextImobThreadState>["slots"],
) {
  const pending = new Set(activeOperationalState.pendingFields ?? []);
  if (pending.size === 0) return false;
  const normalized = normalizeImobText(message);
  const hasEmail = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(message);
  const hasPhone = /(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?\d{4,5}[-\s]?\d{4}/.test(message);
  const hasDocumentDigits = message.replace(/\D/g, "").length >= 11;

  if (activeOperationalState.flow === "owner.create") {
    if (pending.has("ownerEmail") && hasEmail) return true;
    if (pending.has("ownerPhone") && hasPhone) return true;
    if (
      pending.has("ownerDocument")
      && (
        hasDocumentDigits
        || normalized.includes("cpf")
        || normalized.includes("cnpj")
        || normalized.includes("documento")
      )
    ) return true;
    if (pending.has("ownerName") && normalized.includes("nome")) return true;
    return false;
  }

  if (activeOperationalState.flow === "property.create") {
    if (pending.has("propertyType") && Boolean(nextSlots.propertyType)) return true;
    if (pending.has("goal") && Boolean(nextSlots.goal)) return true;
    if (pending.has("city") && Boolean(nextSlots.city)) return true;
    if (
      pending.has("address")
      && (normalized.includes("endereco") || normalized.includes("endereço") || /\b(rua|av|avenida|alameda|travessa|rodovia)\b/.test(normalized))
    ) return true;
    return false;
  }

  if (activeOperationalState.flow === "lead.qualify") {
    if (pending.has("leadEmail") && hasEmail) return true;
    if (pending.has("leadPhone") && hasPhone) return true;
    if (pending.has("desiredGoal") && Boolean(nextSlots.goal)) return true;
    if (pending.has("desiredCity") && Boolean(nextSlots.city)) return true;
    if (pending.has("budgetMax") && typeof nextSlots.budgetMax === "number") return true;
    if (pending.has("leadName") && normalized.includes("nome")) return true;
    return false;
  }

  if (activeOperationalState.flow === "proposal.create") {
    if (pending.has("buyerEmail") && hasEmail) return true;
    if (pending.has("buyerPhone") && hasPhone) return true;
    if (pending.has("buyerName") && normalized.includes("nome")) return true;
    if (pending.has("offerAmount") && /\b\d+(?:[.,]\d+)?\b/.test(message)) return true;
    return false;
  }

  if (activeOperationalState.flow === "rules.configure") {
    if (pending.has("checkin") && normalized.includes("checkin")) return true;
    if (pending.has("checkout") && normalized.includes("checkout")) return true;
    if (pending.has("minHospedes") && /(min|mín).*(hosped|hospede)|\b1 a \d+ hospedes\b/.test(normalized)) return true;
    if (pending.has("maxHospedes") && /(max|máx).*(hosped|hospede)|\b\d+ a \d+ hospedes\b/.test(normalized)) return true;
    if (pending.has("regras") && normalized.includes("regras")) return true;
    return false;
  }

  return false;
}

type ImobTurnDecisionStage =
  | "pending_field_parse"
  | "explicit_continuity"
  | "same_journey_context"
  | "explicit_route_change"
  | "front_door_generic"
  | "default";

function resolveImobTurnDecision(params: {
  activeOperationalState: ImobOperationalState | null | undefined;
  message: string;
  nextSlots: ReturnType<typeof createNextImobThreadState>["slots"];
  baseIntent: ImobIntent;
  hasExplicitCatalogTarget: boolean;
}) {
  const active = params.activeOperationalState;
  const activeIntent = active ? mapOperationalFlowToIntent(active.flow) : null;
  const collecting = Boolean(active && active.status === "collecting");

  if (collecting && active && hasPendingFieldSignalForActiveFlow(active, params.message, params.nextSlots)) {
    return { stage: "pending_field_parse" as const, intent: activeIntent ?? params.baseIntent };
  }

  if (collecting && active && isExplicitCaseContinuationRequest(params.message)) {
    return { stage: "explicit_continuity" as const, intent: activeIntent ?? params.baseIntent };
  }

  if (collecting && active && !params.hasExplicitCatalogTarget && activeIntent === params.baseIntent) {
    return { stage: "same_journey_context" as const, intent: activeIntent ?? params.baseIntent };
  }

  if (collecting && shouldBreakOwnerCaptureContinuation(active, params.baseIntent, params.message)) {
    return { stage: "explicit_route_change" as const, intent: params.baseIntent };
  }

  if (isOperationalFlowGuidanceRequest(params.message)) {
    return { stage: "front_door_generic" as const, intent: params.baseIntent };
  }

  return { stage: "default" as const, intent: params.baseIntent };
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

function isDocumentCollectionRequest(message: string) {
  const text = normalizeImobText(message);
  const hasCollectionVerb =
    text.includes("coletar") ||
    text.includes("coleta") ||
    text.includes("receber") ||
    text.includes("enviar") ||
    text.includes("subir") ||
    text.includes("anexar");
  const hasDocumentSubject =
    text.includes("document") ||
    text.includes("anexo") ||
    text.includes("arquivo") ||
    text.includes("upload") ||
    text.includes("matricula") ||
    text.includes("matrícula") ||
    text.includes("cpf") ||
    text.includes("rg") ||
    text.includes("cnpj");
  return hasCollectionVerb && hasDocumentSubject;
}

function isDocumentUploadOnlyRequest(message: string) {
  const text = normalizeImobText(message);
  const hasUploadVerb =
    text.includes("enviar") ||
    text.includes("anexar") ||
    text.includes("subir") ||
    text.includes("mandar");
  const hasDocumentSubject =
    text.includes("document") ||
    text.includes("anexo") ||
    text.includes("arquivo") ||
    text.includes("upload") ||
    text.includes("cpf") ||
    text.includes("rg") ||
    text.includes("cnpj");
  const hasConcreteData = /\b\d{11,14}\b/.test(text) || text.includes("matricula") || text.includes("matrícula");
  return hasUploadVerb && hasDocumentSubject && !hasConcreteData;
}

function isAttachmentReferenceMessage(message: string) {
  const text = normalizeImobText(message);
  const hasAttachmentReference =
    text.includes("anexo") ||
    text.includes("arquivo") ||
    text.includes("upload") ||
    text.includes("conversa");
  const hasDocumentReference =
    text.includes("document") ||
    text.includes("cpf") ||
    text.includes("rg") ||
    text.includes("cnpj");
  return hasAttachmentReference && hasDocumentReference;
}

function isGenericCadastroRequest(message: string) {
  const text = normalizeImobText(message);
  const asksCadastro = text.includes("cadastrar") || text.includes("cadastro") || text.includes("incluir");
  if (!asksCadastro) return false;
  const hasSpecificTarget =
    text.includes("propriet") ||
    text.includes("imovel") ||
    text.includes("imóvel") ||
    text.includes("lead") ||
    text.includes("cliente") ||
    text.includes("comprador") ||
    text.includes("vendedor") ||
    text.includes("locador") ||
    text.includes("locatario") ||
    text.includes("locatário");
  return !hasSpecificTarget;
}

function buildCatalogActionLines(actionLabel: string, entityLabels: string[]) {
  return [`Posso seguir com ${actionLabel.toLowerCase()} para ${entityLabels.join(", ")}.`];
}

function buildLeadCreationChoices() {
  const allowedEntities = new Set(["comprador", "locatario", "lead"]);
  return listImobIntentChoicesForAction("create").filter((choice) => allowedEntities.has(choice.entity));
}

function buildCadastroCreationChoices() {
  return listImobIntentChoicesForAction("create").filter((choice) => choice.entity !== "lead");
}

function isCaptureEntryOptionsRequest(message: string) {
  const text = normalizeImobText(message);
  const hasExplicitPropertyCreate =
    text.includes("cadastrar imovel") ||
    text.includes("cadastrar imóvel") ||
    text.includes("cadastro de imovel") ||
    text.includes("cadastro de imóvel") ||
    text.includes("incluir imovel") ||
    text.includes("incluir imóvel");
  if (hasExplicitPropertyCreate) return false;
  const asksOptions =
    text.includes("me ofereca opcoes") ||
    text.includes("me ofereça opcoes") ||
    text.includes("me ofereça opções") ||
    text.includes("me ofereca opções") ||
    text.includes("me mostre opcoes") ||
    text.includes("me mostre opções") ||
    text.includes("escolher entre");
  const hasCaptureContext =
    text.includes("captacao no imob") ||
    text.includes("captação no imob") ||
    (text.includes("capt") && text.includes("imob"));
  const asksNextStepOptions =
    text.includes("proximos passos") ||
    text.includes("próximos passos") ||
    text.includes("opcoes de proximos passos") ||
    text.includes("opções de próximos passos");
  return (asksOptions || asksNextStepOptions) && hasCaptureContext;
}

function isOperationalFlowGuidanceRequest(message: string) {
  const text = normalizeImobText(message);
  if (text === "continuar" || text === "como continuar" || text === "como continuar aqui") return true;
  if (text === "me perdi" || text === "nao entendi" || text === "não entendi") return true;
  if (text === "voltar" || text === "recomecar" || text === "recomeçar") return true;
  if (text.includes("nao da continuidade") || text.includes("não dá continuidade")) return true;
  if (text.includes("isso e generico") || text.includes("isso é generico") || text.includes("isso é genérico")) return true;
  if (text.includes("voltar ao fluxo") || text.includes("direcionar conversa para a vertical")) return true;
  return false;
}

function buildCaptureEntryChoices() {
  return [
    {
      id: "capture-entry-property",
      label: "Cadastrar imóvel",
      kind: "primary" as const,
      action: "send_suggested_message" as const,
      nextMessage: "cadastrar imóvel",
    },
    {
      id: "capture-entry-owner",
      label: "Cadastrar proprietário",
      kind: "secondary" as const,
      action: "send_suggested_message" as const,
      nextMessage: "cadastrar proprietário",
    },
    {
      id: "capture-entry-lead",
      label: "Qualificar lead",
      kind: "neutral" as const,
      action: "send_suggested_message" as const,
      nextMessage: "qualificar lead",
    },
    {
      id: "capture-entry-case",
      label: "Consultar caso",
      kind: "neutral" as const,
      action: "send_suggested_message" as const,
      nextMessage: "consultar caso",
    },
  ];
}

function buildDocumentEntryChoices() {
  return [
    {
      id: "document-entry-owner",
      label: "Documentos do proprietário",
      kind: "primary" as const,
      action: "send_suggested_message" as const,
      nextMessage: "documentos do proprietário por upload",
    },
    {
      id: "document-entry-property",
      label: "Documentos do imóvel",
      kind: "secondary" as const,
      action: "send_suggested_message" as const,
      nextMessage: "documentos do imóvel por upload",
    },
    {
      id: "document-entry-lead",
      label: "Documentos do lead",
      kind: "neutral" as const,
      action: "send_suggested_message" as const,
      nextMessage: "documentos do lead por upload",
    },
    {
      id: "document-entry-attach",
      label: "Anexar agora",
      kind: "neutral" as const,
      action: "open_attachment_menu" as const,
    },
  ];
}

function buildCaptureFlowGuidanceChoices(activeFlow: ImobOperationalState["flow"]) {
  const continueLabel =
    activeFlow === "owner.create"
      ? "Continuar proprietário"
      : activeFlow === "property.create"
        ? "Continuar imóvel"
        : activeFlow === "lead.qualify"
          ? "Continuar lead"
          : "Continuar fluxo atual";
  const continueNextMessage =
    activeFlow === "owner.create"
      ? "cadastrar proprietário"
      : activeFlow === "property.create"
        ? "cadastrar imóvel"
        : activeFlow === "lead.qualify"
          ? "qualificar lead deste caso"
          : "consultar caso";
  return [
    {
      id: "capture-guidance-continue",
      label: continueLabel,
      kind: "primary" as const,
      action: "send_suggested_message" as const,
      nextMessage: continueNextMessage,
    },
    ...buildCaptureEntryChoices().map((cta, index) => ({
      ...cta,
      kind: index === 0 ? ("secondary" as const) : "neutral" as const,
    })),
  ];
}

function isGenericLeadRequest(parsed: ReturnType<typeof parseImobIntent>, normalizedMessage: string) {
  return parsed.entity === "lead" && !parsed.action && normalizedMessage === "lead";
}

function humanizeCatalogEntity(entity: string) {
  if (entity === "imovel") return "Imóvel";
  if (entity === "proprietario") return "Proprietário";
  if (entity === "locatario") return "Locatário";
  if (entity === "anuncio") return "Anúncio";
  return entity.charAt(0).toUpperCase() + entity.slice(1);
}

const LOW_CONFIDENCE_ACTION_SCORE = 95;
const LOW_CONFIDENCE_ENTITY_SCORE = 95;

function isGenericCatalogActionAlias(alias: string | null) {
  const normalized = normalizeImobText(alias ?? "");
  return normalized === "ver" || normalized === "mostrar" || normalized === "abrir" || normalized === "buscar";
}

function shouldClarifyCatalogIntent(parsed: ReturnType<typeof parseImobIntent>) {
  if (!parsed.action || !parsed.entity || parsed.action === "create") {
    return false;
  }
  const hasReliablePluralitySignal = parsed.pluralityHint !== null;
  if (parsed.actionScore < LOW_CONFIDENCE_ACTION_SCORE) {
    return true;
  }
  if (parsed.entityScore < LOW_CONFIDENCE_ENTITY_SCORE && !hasReliablePluralitySignal) {
    return true;
  }
  if ((parsed.action === "list" || parsed.action === "get" || parsed.action === "view") && isGenericCatalogActionAlias(parsed.matchedActionAlias) && !parsed.pluralityHint) {
    return true;
  }
  return false;
}

function buildCatalogActionClarification(
  parsed: ReturnType<typeof parseImobIntent>,
  source: "openai" | "parser_fallback" = "parser_fallback"
) {
  if (!parsed.entity) {
    return null;
  }
  const entityLabel = humanizeCatalogEntity(parsed.entity);
  const supportedActions = getSupportedActions(parsed.entity);
  const preferredOrder: ImobActionKey[] = ["get", "list", "history", "update", "status"];
  const choices = preferredOrder
    .filter((action) => supportedActions.includes(action))
    .slice(0, 3)
    .map((action, index) => ({
      id: `clarify-${action}-${parsed.entity}`,
      label: resolveCanonicalLabel(buildImobCanonicalMessage(parsed.entity!, action)) ?? buildImobCanonicalMessage(parsed.entity!, action),
      kind: index === 0 ? "primary" : index === 1 ? "secondary" : "neutral",
      action: "send_suggested_message" as const,
      nextMessage: buildImobCanonicalMessage(parsed.entity, action),
    }));

  if (choices.length === 0) {
    return null;
  }

  return {
    mode: "consult" as const,
    action: "crm.catalog.clarify_action",
    presentation: {
      text: [`Quero confirmar sua intenção sobre ${entityLabel.toLowerCase()}.`, "Escolha a ação mais próxima do que você quer fazer agora."].join("\n"),
      suggestedNextAction: `Escolha se você quer consultar, listar ou ajustar ${entityLabel.toLowerCase()}.`,
      metadata: buildCatalogConfidenceMetadata(parsed, true, { source }),
      card: {
        title: `O que você quer fazer com ${entityLabel.toLowerCase()}?`,
        lines: ["Identifiquei o alvo, mas a ação ficou ambígua nesta frase."],
        ctas: choices,
      },
    },
  };
}

function buildCatalogConfidenceMetadata(
  parsed: ReturnType<typeof parseImobIntent>,
  lowConfidence = false,
  options?: { choiceStyle?: "inline"; source?: "openai" | "parser_fallback" }
) {
  return {
    confidence: {
      entity: parsed.entity,
      source: options?.source ?? "parser_fallback",
      action: parsed.action,
      matchedEntityAlias: parsed.matchedEntityAlias,
      matchedActionAlias: parsed.matchedActionAlias,
      entityScore: parsed.entityScore,
      actionScore: parsed.actionScore,
      pluralityHint: parsed.pluralityHint,
      canonicalLabel: parsed.canonicalLabel,
      lowConfidence,
    },
    ...(options?.choiceStyle ? { choiceStyle: options.choiceStyle } : {}),
  };
}

function withImobAgentPresentationMetadata(
  response: ImobResolveTurnResponse,
): ImobResolveTurnResponse {
  return {
    ...response,
    presentation: response.presentation
      ? {
          ...response.presentation,
          metadata: {
            ...(response.presentation.metadata ?? {} as ImobPresentationMetadata),
            agentRuntime: buildImobAgentRuntimeMetadata(),
          },
        }
      : response.presentation,
  };
}

function buildCatalogEntityActionPresentation(entityLabel: string, action: ImobActionKey, canonicalLabel: string) {
  if (action === "delete") {
    return {
      text: `Entendi: ${canonicalLabel}. Envie o nome, documento ou identificador do cadastro para eu confirmar a exclusão.`,
      suggestedNextAction: `Informe a referência do ${entityLabel.toLowerCase()} para eu confirmar a exclusão.`,
      card: {
        title: canonicalLabel,
        lines: [`A exclusão de ${entityLabel.toLowerCase()} exige confirmação com uma referência objetiva do cadastro.`],
      },
    };
  }

  if (action === "edit" || action === "update" || action === "status") {
    return {
      text: `Entendi: ${canonicalLabel}. Envie o nome, documento ou identificador do cadastro e o ajuste desejado.`,
      suggestedNextAction: `Informe a referência do ${entityLabel.toLowerCase()} e o que precisa mudar.`,
      card: {
        title: canonicalLabel,
        lines: [`Posso continuar assim que você indicar qual ${entityLabel.toLowerCase()} deve ser alterado e quais dados mudar.`],
      },
    };
  }

  if (action === "list" || action === "view" || action === "indicators" || action === "reports") {
    return {
      text: `Entendi: ${canonicalLabel}. Se quiser, posso seguir com esse recorte agora.`,
      suggestedNextAction: `Refine o recorte do ${entityLabel.toLowerCase()} se quiser filtrar melhor a consulta.`,
      card: {
        title: canonicalLabel,
        lines: [`Posso montar a consulta de ${entityLabel.toLowerCase()} com o filtro que você indicar.`],
      },
    };
  }

  if (action === "get" || action === "history" || action === "sendDocuments" || action === "send") {
    return {
      text: `Entendi: ${canonicalLabel}. Envie o nome, documento ou identificador do cadastro para eu localizar o item certo.`,
      suggestedNextAction: `Informe a referência do ${entityLabel.toLowerCase()} para eu continuar.`,
      card: {
        title: canonicalLabel,
        lines: [`Posso continuar assim que você indicar qual ${entityLabel.toLowerCase()} deve ser consultado.`],
      },
    };
  }

  return {
    text: `Entendi: ${canonicalLabel}. Posso continuar assim que você indicar o contexto desse ${entityLabel.toLowerCase()}.`,
    suggestedNextAction: `Envie mais detalhes do ${entityLabel.toLowerCase()} para eu seguir com ${canonicalLabel.toLowerCase()}.`,
    card: {
      title: canonicalLabel,
      lines: [`Posso continuar com ${canonicalLabel.toLowerCase()} quando você indicar a referência correta.`],
    },
  };
}

function mapOperationalOwner(flow: NonNullable<ImobResolveTurnResponse["conversationState"]["operational"]>["flow"]): ImobOperationalOwner {
  if (flow === "contract.prepare") return "Jurídico";
  if (flow === "commission.settle") return "Financeiro";
  if (flow === "documents.collect") return "IMOB Ops";
  return "Corretor";
}

function getOwnerPersonaCopy(ownerDraft?: { ownerPersona?: "proprietario" | "vendedor" | "locador" } | null) {
  if (ownerDraft?.ownerPersona === "vendedor") {
    return {
      entity: "vendedor",
      singular: "vendedor",
      article: "do vendedor",
      label: "Cadastrar vendedor",
      description: "Preencha os dados abaixo para iniciar o cadastro.",
      nameLabel: "Nome completo",
      phoneLabel: "Telefone",
      emailLabel: "E-mail",
      documentLabel: "Documento",
      nextStep: "Completar dados do vendedor antes de avançar a captação.",
      blocker: "Dados do vendedor ainda estão incompletos para seguir.",
    };
  }
  if (ownerDraft?.ownerPersona === "locador") {
    return {
      entity: "locador",
      singular: "locador",
      article: "do locador",
      label: "Cadastrar locador",
      description: "Preencha os dados abaixo para iniciar o cadastro.",
      nameLabel: "Nome completo",
      phoneLabel: "Telefone",
      emailLabel: "E-mail",
      documentLabel: "Documento",
      nextStep: "Completar dados do locador antes de avançar a captação.",
      blocker: "Dados do locador ainda estão incompletos para seguir.",
    };
  }
  return {
    entity: "proprietario",
    singular: "proprietário",
    article: "do proprietário",
    label: "Cadastrar proprietário",
    description: "Preencha os dados abaixo para iniciar o cadastro.",
    nameLabel: "Nome completo",
    phoneLabel: "Telefone",
    emailLabel: "E-mail",
    documentLabel: "Documento",
    nextStep: "Completar dados do proprietário antes de avançar a captação.",
    blocker: "Dados do proprietário ainda estão incompletos para seguir.",
  };
}

function getLeadPersonaCopy(leadDraft?: { leadPersona?: "lead" | "comprador" | "locatario" } | null) {
  if (leadDraft?.leadPersona === "comprador") {
    return {
      entity: "comprador",
      singular: "comprador",
      article: "do comprador",
      qualification: "do comprador",
      label: "Cadastrar comprador",
      description: "Preencha os dados abaixo para iniciar o cadastro do comprador.",
      nameLabel: "Nome completo do comprador",
      phoneLabel: "Telefone do comprador",
      emailLabel: "E-mail do comprador",
      goalLabel: "Finalidade do comprador",
      cityLabel: "Cidade de interesse do comprador",
      budgetLabel: "Faixa de orçamento do comprador",
      nextStep: "Completar dados do comprador e revisar o interesse comercial.",
      blocker: "Dados do comprador ainda estão incompletos para seguir.",
    };
  }
  if (leadDraft?.leadPersona === "locatario") {
    return {
      entity: "locatario",
      singular: "locatário",
      article: "do locatário",
      qualification: "do locatário",
      label: "Cadastrar locatário",
      description: "Preencha os dados abaixo para iniciar o cadastro do locatário.",
      nameLabel: "Nome completo do locatário",
      phoneLabel: "Telefone do locatário",
      emailLabel: "E-mail do locatário",
      goalLabel: "Finalidade do locatário",
      cityLabel: "Cidade de interesse do locatário",
      budgetLabel: "Faixa de orçamento do locatário",
      nextStep: "Completar dados do locatário e revisar o interesse comercial.",
      blocker: "Dados do locatário ainda estão incompletos para seguir.",
    };
  }
  return {
    entity: "lead",
    singular: "lead",
    article: "do lead",
    qualification: "do lead",
    label: "Cadastrar lead",
    description: "Preencha os dados abaixo para iniciar a qualificação do lead.",
    nameLabel: "Nome completo do lead",
    phoneLabel: "Telefone do lead",
    emailLabel: "E-mail do lead",
    goalLabel: "Finalidade do lead",
    cityLabel: "Cidade de interesse do lead",
    budgetLabel: "Faixa de orçamento do lead",
    nextStep: "Completar dados do lead e revisar o interesse comercial.",
    blocker: "Dados do lead ainda estão incompletos para seguir.",
  };
}

function getProposalPersonaCopy(proposalDraft?: {
  contractType?: "rent" | "sale" | "management" | null;
} | null) {
  if (proposalDraft?.contractType === "rent") {
    return {
      singular: "locatário",
      article: "do locatário",
      label: "Criar proposta para locatário",
      description: "Preencha os dados abaixo para preparar a proposta comercial para o locatário.",
      nameLabel: "Nome do locatário",
      phoneLabel: "Telefone do locatário",
      emailLabel: "E-mail do locatário",
      offerLabel: "Valor da proposta de locação",
      nextStep: "Completar dados do locatário e ajustar a proposta.",
      blocker: "Dados do locatário ou proposta incompletos.",
    };
  }

  return {
    singular: "comprador",
    article: "do comprador",
    label: "Criar proposta para comprador",
    description: "Preencha os dados abaixo para preparar a proposta comercial para o comprador.",
    nameLabel: "Nome do comprador",
    phoneLabel: "Telefone do comprador",
    emailLabel: "E-mail do comprador",
    offerLabel: "Valor da proposta",
    nextStep: "Completar dados do comprador e ajustar a proposta.",
    blocker: "Dados do comprador ou proposta incompletos.",
  };
}

function buildProposalCreateForm(proposalDraft?: {
  buyerName?: string | null;
  buyerPhone?: string | null;
  buyerEmail?: string | null;
  propertyId?: string | null;
  offerAmount?: number | null;
  contractType?: "rent" | "sale" | "management" | null;
} | null) {
  const proposalCopy = getProposalPersonaCopy(proposalDraft);
  return {
    entity: "proposta",
    action: "create",
    label: proposalCopy.label,
    description: proposalCopy.description,
    fields: [
      {
        name: "propertyId",
        label: "Imóvel da proposta",
        type: "text" as const,
        required: true,
        placeholder: "Ex.: 4455",
        value: proposalDraft?.propertyId?.replace(/^property-/, "") ?? "",
      },
      {
        name: "buyerName",
        label: proposalCopy.nameLabel,
        type: "text" as const,
        required: true,
        placeholder: "Ex.: Maria da Silva",
        value: proposalDraft?.buyerName ?? "",
      },
      {
        name: "buyerPhone",
        label: proposalCopy.phoneLabel,
        type: "tel" as const,
        required: true,
        placeholder: "Ex.: (11) 99999-9999",
        value: proposalDraft?.buyerPhone ?? "",
      },
      {
        name: "buyerEmail",
        label: proposalCopy.emailLabel,
        type: "email" as const,
        placeholder: "Ex.: maria@email.com",
        value: proposalDraft?.buyerEmail ?? "",
      },
      {
        name: "offerAmount",
        label: proposalCopy.offerLabel,
        type: "text" as const,
        required: true,
        placeholder: proposalDraft?.contractType === "rent" ? "Ex.: 3500" : "Ex.: 500000",
        value: proposalDraft?.offerAmount ? String(proposalDraft.offerAmount) : "",
      },
      {
        name: "contractType",
        label: "Tipo de proposta",
        type: "text" as const,
        required: true,
        placeholder: "Ex.: venda ou locação",
        value:
          proposalDraft?.contractType === "rent"
            ? "locação"
            : proposalDraft?.contractType === "sale"
              ? "venda"
              : proposalDraft?.contractType === "management"
                ? "administração"
                : "",
      },
    ],
    actions: [
      {
        id: "cancel" as const,
        label: "Cancelar",
        kind: "secondary" as const,
      },
      {
        id: "submit" as const,
        label: "Continuar proposta",
        kind: "primary" as const,
      },
    ],
  };
}

function buildOwnerCreateForm(ownerDraft?: {
  ownerPersona?: "proprietario" | "vendedor" | "locador";
  ownerName?: string | null;
  ownerPhone?: string | null;
  ownerEmail?: string | null;
  ownerDocument?: string | null;
} | null) {
  const ownerCopy = getOwnerPersonaCopy(ownerDraft);
  return {
    entity: ownerCopy.entity,
    action: "create",
    label: ownerCopy.label,
    description: ownerCopy.description,
    fields: [
      {
        name: "ownerName",
        label: ownerCopy.nameLabel,
        type: "text" as const,
        required: true,
        placeholder: "Ex.: João da Silva",
        value: ownerDraft?.ownerName ?? "",
      },
      {
        name: "ownerPhone",
        label: ownerCopy.phoneLabel,
        type: "tel" as const,
        required: true,
        placeholder: "Ex.: (11) 99999-9999",
        value: ownerDraft?.ownerPhone ?? "",
      },
      {
        name: "ownerEmail",
        label: ownerCopy.emailLabel,
        type: "email" as const,
        required: true,
        placeholder: "Ex.: joao@email.com",
        value: ownerDraft?.ownerEmail ?? "",
      },
      {
        name: "ownerDocument",
        label: ownerCopy.documentLabel,
        type: "text" as const,
        required: true,
        placeholder: "Ex.: CPF ou CNPJ",
        value: ownerDraft?.ownerDocument ?? "",
        helperText: "Informe CPF/CNPJ ou anexe o documento.",
        allowAttachment: true,
        attachmentLabel: "Anexar documento",
      },
    ],
    actions: [
      {
        id: "cancel" as const,
        label: "Cancelar",
        kind: "secondary" as const,
      },
      {
        id: "submit" as const,
        label: "Salvar cadastro",
        kind: "primary" as const,
      },
    ],
  };
}

function buildPropertyCreateForm(propertyDraft?: {
  propertyType?: string | null;
  goal?: "locacao" | "venda" | "aluguel_por_temporada" | null;
  cep?: string | null;
  city?: string | null;
  address?: string | null;
} | null) {
  const normalizedPropertyType = normalizeImobCrmPropertyType(propertyDraft?.propertyType ?? null) ?? null;
  const normalizedGoal = normalizeImobCrmPropertyGoal(propertyDraft?.goal ?? null) ?? null;
  return {
    entity: "imovel",
    action: "create",
    label: "Cadastrar imóvel",
    description: "",
    fields: [
      {
        name: "propertyType",
        label: "Tipo",
        type: "select" as const,
        required: true,
        placeholder: "",
        value: normalizedPropertyType ?? "",
        options: IMOB_CRM_PROPERTY_TYPE_OPTIONS.map((option) => ({
          value: option.value,
          label: option.label,
          group: option.category === "residential" ? "Residencial" : "Comercial",
        })),
      },
      {
        name: "goal",
        label: "Finalidade",
        type: "select" as const,
        required: true,
        placeholder: "",
        value: normalizedGoal ?? "",
        options: IMOB_CRM_PROPERTY_GOAL_OPTIONS.map((option) => ({
          value: option.value,
          label: option.label,
        })),
      },
      {
        name: "cep",
        label: "CEP",
        type: "text" as const,
        inputMode: "numeric" as const,
        maxLength: 9,
        value: propertyDraft?.cep ?? "",
        lookup: {
          kind: "cep" as const,
          autoFillTargets: {
            city: "city",
            address: "address",
          },
        },
      },
      {
        name: "city",
        label: "Cidade",
        type: "text" as const,
        required: true,
        value: propertyDraft?.city ?? "",
      },
      {
        name: "address",
        label: "Endereço",
        type: "text" as const,
        required: true,
        value: propertyDraft?.address ?? "",
      },
    ],
    actions: [
      {
        id: "cancel" as const,
        label: "Cancelar",
        kind: "secondary" as const,
      },
      {
        id: "submit" as const,
        label: "Salvar cadastro",
        kind: "primary" as const,
      },
    ],
  };
}

function shouldReturnConsultWithForm(params: {
  message: string;
  operationalState: ImobOperationalState | null;
}) {
  const { message, operationalState } = params;
  if (!operationalState) return false;
  if (operationalState.flow === "rules.configure" && operationalState.status === "collecting") return true;
  if (
    operationalState.flow === "property.create"
    && operationalState.status === "collecting"
    && /\b\d+\s+(?:imoveis|imóveis)\b/i.test(message)
  ) return true;
  return false;
}

function buildLeadCreateForm(leadDraft?: {
  leadPersona?: "lead" | "comprador" | "locatario";
  leadName?: string | null;
  leadPhone?: string | null;
  leadEmail?: string | null;
  desiredGoal?: "locacao" | "venda" | null;
  desiredCity?: string | null;
  budgetMax?: number | null;
} | null) {
  const leadCopy = getLeadPersonaCopy(leadDraft);
  return {
    entity: leadCopy.entity,
    action: "create",
    label: leadCopy.label,
    description: leadCopy.description,
    fields: [
      {
        name: "leadName",
        label: leadCopy.nameLabel,
        type: "text" as const,
        required: true,
        placeholder: "Ex.: Maria da Silva",
        value: leadDraft?.leadName ?? "",
      },
      {
        name: "leadPhone",
        label: leadCopy.phoneLabel,
        type: "tel" as const,
        required: true,
        placeholder: "Ex.: (11) 99999-9999",
        value: leadDraft?.leadPhone ?? "",
      },
      {
        name: "leadEmail",
        label: leadCopy.emailLabel,
        type: "email" as const,
        placeholder: "Ex.: maria@email.com",
        value: leadDraft?.leadEmail ?? "",
      },
      {
        name: "desiredGoal",
        label: leadCopy.goalLabel,
        type: "text" as const,
        required: true,
        placeholder: "Ex.: compra ou locação",
        value: leadDraft?.desiredGoal ?? "",
      },
      {
        name: "desiredCity",
        label: leadCopy.cityLabel,
        type: "text" as const,
        required: true,
        placeholder: "Ex.: Itapema",
        value: leadDraft?.desiredCity ?? "",
      },
      {
        name: "budgetMax",
        label: leadCopy.budgetLabel,
        type: "text" as const,
        required: true,
        placeholder: "Ex.: 500000 ou 3500",
        value: leadDraft?.budgetMax ? String(leadDraft.budgetMax) : "",
      },
    ],
    actions: [
      {
        id: "cancel" as const,
        label: "Cancelar",
        kind: "secondary" as const,
      },
      {
        id: "submit" as const,
        label: "Salvar cadastro",
        kind: "primary" as const,
      },
    ],
  };
}

function buildListingActivateForm(listingDraft?: {
  propertyId?: string | null;
  listingTitle?: string | null;
  publicationGoal?: "locacao" | "venda" | null;
  publicationChannels?: string[] | null;
} | null) {
  return {
    entity: "anuncio",
    action: "publish",
    label: "Publicar anúncio",
    description: "Preencha os dados abaixo para iniciar a ativação do anúncio.",
    fields: [
      {
        name: "propertyId",
        label: "Imóvel de referência",
        type: "text" as const,
        required: true,
        placeholder: "Ex.: 4455",
        value: listingDraft?.propertyId?.replace(/^property-/, "") ?? "",
      },
      {
        name: "listingTitle",
        label: "Título do anúncio",
        type: "text" as const,
        required: true,
        placeholder: "Ex.: Vista Mar",
        value: listingDraft?.listingTitle ?? "",
      },
      {
        name: "publicationGoal",
        label: "Finalidade do anúncio",
        type: "text" as const,
        required: true,
        placeholder: "Ex.: venda ou locação",
        value: listingDraft?.publicationGoal ?? "",
      },
      {
        name: "publicationChannels",
        label: "Canais de publicação",
        type: "text" as const,
        required: true,
        placeholder: "Ex.: portal, whatsapp, instagram",
        value: listingDraft?.publicationChannels?.join(", ") ?? "",
      },
    ],
    actions: [
      {
        id: "cancel" as const,
        label: "Cancelar",
        kind: "secondary" as const,
      },
      {
        id: "submit" as const,
        label: "Continuar ativação",
        kind: "primary" as const,
      },
    ],
  };
}


function buildDocumentValidationForm(documentDraft?: {
  referenceId?: string | null;
  subjectType?: "owner" | "property" | "lead" | "proposal" | "contract" | null;
  documentTypes?: string[] | null;
  deliveryChannel?: "upload" | "email" | "whatsapp" | "drive" | null;
} | null) {
  return {
    entity: "documento",
    action: "validate",
    label: "Validar documento",
    description: "Preencha os dados abaixo para iniciar a validação do documento.",
    fields: [
      {
        name: "referenceId",
        label: "Imóvel ou referência",
        type: "text" as const,
        placeholder: "Ex.: 4455",
        value: documentDraft?.referenceId?.replace(/^property-/, "") ?? "",
      },
      {
        name: "subjectType",
        label: "Documento de quem",
        type: "text" as const,
        required: true,
        placeholder: "Ex.: proprietário, imóvel, comprador, contrato",
        value: documentDraft?.subjectType ?? "",
      },
      {
        name: "documentTypes",
        label: "Tipo documental",
        type: "text" as const,
        required: true,
        placeholder: "Ex.: matrícula, cpf, rg",
        value: documentDraft?.documentTypes?.join(", ") ?? "",
        allowAttachment: true,
        attachmentLabel: "Anexar documento",
      },
      {
        name: "deliveryChannel",
        label: "Canal de envio",
        type: "text" as const,
        required: true,
        placeholder: "Ex.: upload, email, whatsapp, drive",
        value: documentDraft?.deliveryChannel ?? "",
      },
    ],
    actions: [
      {
        id: "cancel" as const,
        label: "Cancelar",
        kind: "secondary" as const,
      },
      {
        id: "submit" as const,
        label: "Continuar validação",
        kind: "primary" as const,
      },
    ],
  };
}

function buildContractActionForm(
  contractDraft: {
    propertyId?: string | null;
    counterpartyName?: string | null;
    contractType?: "rent" | "sale" | "management" | null;
    documentPacketStatus?: "pending" | "ready" | null;
  } | null | undefined,
  action: "create" | "sendForSignature"
) {
  const sendForSignature = action === "sendForSignature";
  return {
    entity: "contrato",
    action,
    label: sendForSignature ? "Enviar contrato para assinatura" : "Criar contrato",
    description: sendForSignature
      ? "Preencha os dados abaixo para preparar o envio do contrato para assinatura."
      : "Preencha os dados abaixo para preparar o contrato.",
    fields: [
      {
        name: "propertyId",
        label: "Imóvel do contrato",
        type: "text" as const,
        required: true,
        placeholder: "Ex.: 4455",
        value: contractDraft?.propertyId?.replace(/^property-/, "") ?? "",
      },
      {
        name: "counterpartyName",
        label: "Comprador ou contraparte",
        type: "text" as const,
        required: true,
        placeholder: "Ex.: Maria da Silva",
        value: contractDraft?.counterpartyName ?? "",
      },
      {
        name: "contractType",
        label: "Tipo de contrato",
        type: "text" as const,
        required: true,
        placeholder: "Ex.: venda, locação, administração",
        value: contractDraft?.contractType ?? "",
      },
      {
        name: "documentPacketStatus",
        label: "Status documental",
        type: "text" as const,
        required: true,
        placeholder: "Ex.: documentos completos ou documentos pendentes",
        value: contractDraft?.documentPacketStatus === "ready"
          ? "documentos completos"
          : contractDraft?.documentPacketStatus === "pending"
            ? "documentos pendentes"
            : "",
      },
    ],
    actions: [
      {
        id: "cancel" as const,
        label: "Cancelar",
        kind: "secondary" as const,
      },
      {
        id: "submit" as const,
        label: sendForSignature ? "Continuar envio" : "Continuar contrato",
        kind: "primary" as const,
      },
    ],
  };
}

function buildRulesConfigureForm(rulesDraft?: {
  propertyId?: string | null;
  propertyFinality?: "aluguel_por_temporada" | "locacao" | "venda" | null;
  checkin?: string | null;
  checkout?: string | null;
  minHospedes?: number | null;
  maxHospedes?: number | null;
  regras?: string | null;
} | null) {
  return {
    entity: "imovel",
    action: "configureRules",
    label: "Configurar regras do imóvel",
    description: "Preencha as regras de hospedagem. Este fluxo só segue para aluguel por temporada.",
    fields: [
      {
        name: "propertyId",
        label: "Imóvel das regras",
        type: "text" as const,
        required: true,
        placeholder: "Ex.: 4455",
        value: rulesDraft?.propertyId?.replace(/^property-/, "") ?? "",
      },
      {
        name: "propertyFinality",
        label: "Finalidade do imóvel",
        type: "text" as const,
        required: true,
        placeholder: "Ex.: aluguel por temporada",
        value: rulesDraft?.propertyFinality === "aluguel_por_temporada" ? "aluguel por temporada" : rulesDraft?.propertyFinality ?? "",
        helperText: "Regras de check-in, check-out e hóspedes só são habilitadas para aluguel por temporada.",
      },
      {
        name: "checkin",
        label: "Check-in",
        type: "text" as const,
        required: true,
        placeholder: "Ex.: 15:00",
        value: rulesDraft?.checkin ?? "",
      },
      {
        name: "checkout",
        label: "Check-out",
        type: "text" as const,
        required: true,
        placeholder: "Ex.: 11:00",
        value: rulesDraft?.checkout ?? "",
      },
      {
        name: "minHospedes",
        label: "Mínimo de hóspedes",
        type: "text" as const,
        required: true,
        placeholder: "Ex.: 1",
        value: rulesDraft?.minHospedes != null ? String(rulesDraft.minHospedes) : "",
      },
      {
        name: "maxHospedes",
        label: "Máximo de hóspedes",
        type: "text" as const,
        required: true,
        placeholder: "Ex.: 4",
        value: rulesDraft?.maxHospedes != null ? String(rulesDraft.maxHospedes) : "",
      },
      {
        name: "regras",
        label: "Regras adicionais",
        type: "text" as const,
        placeholder: "Ex.: sem festas, não fumar, aceitar pets",
        value: rulesDraft?.regras ?? "",
      },
    ],
    actions: [
      {
        id: "cancel" as const,
        label: "Cancelar",
        kind: "secondary" as const,
      },
      {
        id: "submit" as const,
        label: "Continuar regras",
        kind: "primary" as const,
      },
    ],
  };
}

function buildContractHistoryForm() {
  return {
    entity: "contrato",
    action: "history",
    label: "Ver histórico do contrato",
    description: "Informe a referência para eu localizar o contrato certo.",
    fields: [
      {
        name: "propertyId",
        label: "Imóvel do contrato",
        type: "text" as const,
        placeholder: "Ex.: 4455",
      },
      {
        name: "counterpartyName",
        label: "Comprador ou contraparte",
        type: "text" as const,
        placeholder: "Ex.: Maria da Silva",
      },
    ],
    actions: [
      {
        id: "cancel" as const,
        label: "Cancelar",
        kind: "secondary" as const,
      },
      {
        id: "submit" as const,
        label: "Consultar histórico",
        kind: "primary" as const,
      },
    ],
  };
}

function mapOperationalPendingFieldLabel(
  flow: NonNullable<ImobResolveTurnResponse["conversationState"]["operational"]>["flow"],
  field: string,
  options?: {
    leadPersona?: "lead" | "comprador" | "locatario" | null;
    ownerPersona?: "proprietario" | "vendedor" | "locador" | null;
  }
) {
  const leadPersonaCopy = getLeadPersonaCopy(options?.leadPersona ? { leadPersona: options.leadPersona } : null);
  const ownerPersonaCopy = getOwnerPersonaCopy(options?.ownerPersona ? { ownerPersona: options.ownerPersona } : null);
  const common: Record<string, string> = {
    propertyId: "imóvel de referência",
    ownerName: `nome ${ownerPersonaCopy.article}`,
    ownerEmail: `e-mail ${ownerPersonaCopy.article}`,
    ownerPhone: `telefone ${ownerPersonaCopy.article}`,
    ownerDocument: `documento ${ownerPersonaCopy.article}`,
    propertyType: "tipo",
    goal: "finalidade",
    city: "cidade",
    neighborhood: "bairro do imóvel",
    bedrooms: "quantidade de quartos",
    bathrooms: "quantidade de banheiros",
    address: "endereço",
    leadName: `nome ${leadPersonaCopy.article}`,
    leadPhone: `telefone ${leadPersonaCopy.article}`,
    leadEmail: `e-mail ${leadPersonaCopy.article}`,
    desiredGoal: `objetivo ${leadPersonaCopy.article}`,
    desiredCity: "cidade de interesse",
    budgetMax: "faixa de orçamento",
    buyerName: `nome ${getProposalPersonaCopy({
      contractType: flow === "proposal.create" ? ((options as { contractType?: "rent" | "sale" | "management" | null } | undefined)?.contractType ?? null) : null,
    }).article}`,
    buyerPhone: `telefone ${getProposalPersonaCopy({
      contractType: flow === "proposal.create" ? ((options as { contractType?: "rent" | "sale" | "management" | null } | undefined)?.contractType ?? null) : null,
    }).article}`,
    buyerEmail: `e-mail ${getProposalPersonaCopy({
      contractType: flow === "proposal.create" ? ((options as { contractType?: "rent" | "sale" | "management" | null } | undefined)?.contractType ?? null) : null,
    }).article}`,
    offerAmount: "valor da proposta",
    visitorName: "nome do visitante",
    visitorPhone: "telefone do visitante",
    preferredDate: "data da visita",
    preferredWindow: "turno da visita",
    counterpartyName: "nome da contraparte",
    contractType: "tipo de contrato",
    documentPacketStatus: "pacote documental",
    referenceId: "imóvel ou referência",
    subjectType: "documento de quem",
    documentTypes: "tipo documental",
    deliveryChannel: "canal de envio",
    brokerRef: "corretor responsável",
    amountCents: "valor da comissão",
    payoutChannel: "canal de repasse",
    settlementStatus: "status da liquidação",
    dealId: "negócio",
    propertyFinality: "finalidade do imóvel",
    checkin: "horário de check-in",
    checkout: "horário de check-out",
    minHospedes: "mínimo de hóspedes",
    maxHospedes: "máximo de hóspedes",
    guestRange: "faixa de hóspedes coerente",
    regras: "regras do imóvel",
    approvalRequired: "aprovação humana",
  };
  if (flow === "proposal.create" && field === "propertyId") return "imóvel da proposta";
  if (flow === "visit.schedule" && field === "propertyId") return "imóvel da visita";
  if (flow === "contract.prepare" && field === "propertyId") return "imóvel do contrato";
  if (flow === "rules.configure" && field === "propertyId") return "imóvel das regras";
  if (flow === "commission.settle" && field === "dealId") return "negócio da comissão";
  return common[field] ?? field;
}

function buildOperationalPresentationMeta(
  operationalState: NonNullable<ImobResolveTurnResponse["conversationState"]["operational"]> | null | undefined
) {
  if (!operationalState) return {};
  const flow = operationalState.flow;
  const pendingFieldLabels = operationalState.pendingFields.map((field) =>
    mapOperationalPendingFieldLabel(flow, field, {
      leadPersona: flow === "lead.qualify" ? (operationalState.leadDraft?.leadPersona ?? "lead") : null,
      ownerPersona: flow === "owner.create" ? (operationalState.ownerDraft?.ownerPersona ?? "proprietario") : null,
      ...(flow === "proposal.create" ? { contractType: operationalState.proposalDraft?.contractType ?? null } : {}),
    })
  );
  const owner = mapOperationalOwner(flow);
  const proposalCopy = flow === "proposal.create" ? getProposalPersonaCopy(operationalState.proposalDraft) : null;
  const nextStep =
    flow === "commission.settle"
      ? pendingFieldLabels.length > 0
        ? "Confirmar pendências da comissão antes do repasse."
        : "Validar liquidação e acompanhar repasse da comissão."
      : flow === "contract.prepare"
        ? pendingFieldLabels.length > 0
          ? "Completar dados contratuais e validar pacote documental."
          : "Revisar minuta e validar pacote documental."
        : flow === "rules.configure"
          ? pendingFieldLabels.length > 0
            ? "Completar regras de hospedagem antes da revisão."
            : "Revisar regras do imóvel para temporada."
        : flow === "proposal.create"
          ? pendingFieldLabels.length > 0
            ? proposalCopy?.nextStep ?? "Completar dados da proposta e ajustar a negociação."
            : `Confirmar dados ${proposalCopy?.article ?? "da contraparte"} e acompanhar aceite da proposta.`
          : flow === "visit.schedule"
            ? pendingFieldLabels.length > 0
              ? "Completar dados da visita antes da confirmação."
              : "Confirmar agenda com cliente e imóvel."
            : flow === "lead.qualify"
              ? pendingFieldLabels.length > 0
                ? getLeadPersonaCopy(operationalState.leadDraft).nextStep
                : "Escolher a próxima ação: cadastrar imóvel, cadastrar proprietário, revisar documentos ou consultar caso."
              : flow === "owner.create"
                ? pendingFieldLabels.length > 0
                  ? getOwnerPersonaCopy(operationalState.ownerDraft).nextStep
                  : `Vincular o ${getOwnerPersonaCopy(operationalState.ownerDraft).singular} ao próximo imóvel ou etapa documental.`
                : flow === "property.create"
                  ? pendingFieldLabels.length > 0
                    ? "Completar dados do imóvel antes de avançar a captação."
                    : "Vincular o imóvel ao próximo lead ou etapa comercial/documental."
                  : undefined;
  const blocker =
    flow === "commission.settle"
      ? pendingFieldLabels.length > 0
        ? "Validar dados de comissão antes do repasse."
        : null
      : flow === "contract.prepare"
        ? pendingFieldLabels.length > 0
          ? "Revisão jurídica ou pacote documental pendente."
          : null
        : flow === "rules.configure"
          ? pendingFieldLabels.length > 0
            ? operationalState.rulesDraft?.propertyFinality && operationalState.rulesDraft.propertyFinality !== "aluguel_por_temporada"
              ? "Regras de hospedagem só podem seguir para aluguel por temporada."
              : "Dados de regras do imóvel ainda estão incompletos."
            : null
        : flow === "proposal.create"
          ? pendingFieldLabels.length > 0
            ? proposalCopy?.blocker ?? "Dados da proposta incompletos."
            : null
          : flow === "visit.schedule"
            ? pendingFieldLabels.length > 0
              ? "Confirmação de agenda ou contato pendente."
              : null
            : flow === "lead.qualify"
              ? pendingFieldLabels.length > 0
                ? getLeadPersonaCopy(operationalState.leadDraft).blocker
                : null
              : flow === "owner.create"
                ? pendingFieldLabels.length > 0
                  ? getOwnerPersonaCopy(operationalState.ownerDraft).blocker
                  : null
                : flow === "property.create"
                  ? pendingFieldLabels.length > 0
                    ? "Dados do imóvel ainda estão incompletos para seguir."
                    : null
                  : null;
  return {
    owner,
    nextStep,
    blocker,
    pendingFieldLabels,
    dedupeKey: `${flow}:${operationalState.status}`,
  };
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

type GenericOperationalGuidanceIntent =
  | "capture_guidance"
  | "qualification_guidance"
  | "documents_by_phase"
  | "document_preparation"
  | "follow_up_preparation"
  | "case_resume_preparation"
  | "approval_preparation"
  | "specialist_handoff"
  | "when_involve_legal"
  | "when_involve_finance"
  | "resume_after_visit"
  | "resume_negotiation"
  | "proposal_readiness"
  | "sensitive_closing";

function resolveGenericOperationalGuidanceIntent(message: string): GenericOperationalGuidanceIntent | null {
  const text = normalizeImobText(message);
  const asksHow = text.includes("como");
  const asksWhen = text.includes("quando");
  const asksWhat = text.includes("quais") || text.includes("o que") || /\bqual\b/.test(text);
  const asksNeed = text.includes("preciso");
  const asksPreparation =
    text.includes("preparar") ||
    text.includes("prepara ") ||
    text.includes("organizar") ||
    text.includes("organiza ") ||
    text.includes("resumir") ||
    text.includes("resumo") ||
    text.includes("retomar") ||
    text.includes("quero");
  const explicitExecution =
    text.includes("cadastrar") ||
    text.includes("validar documento") ||
    text.includes("coletar documentos") ||
    text.includes("enviar para assinatura") ||
    text.includes("gerar proposta");

  if (explicitExecution) return null;

  if (
    (asksHow || asksWhat || asksNeed)
    && (text.includes("captacao") || text.includes("captação") || text.includes("captar imovel") || text.includes("captar imóvel") || text.includes("lead captado"))
  ) {
    return "capture_guidance";
  }

  if (
    (asksHow || asksWhat || asksNeed)
    && (
      (text.includes("qualificar") && text.includes("lead"))
      || text.includes("qualificacao")
      || text.includes("qualificação")
      || text.includes("triar lead")
    )
    && !text.includes("deste caso")
    && !text.includes("desse caso")
  ) {
    return "qualification_guidance";
  }

  if (
    asksWhat
    && (
      text.includes("documentos normalmente faltam")
      || text.includes("quais documentos preciso")
      || text.includes("documentos necessarios")
      || text.includes("documentos necessários")
    )
  ) {
    return "documents_by_phase";
  }

  if (
    (asksHow || asksWhat || asksNeed || asksPreparation)
    && (
      text.includes("checklist documental")
      || text.includes("preparar documentacao")
      || text.includes("prepara documentacao")
      || text.includes("preparar a documentacao")
      || text.includes("prepara a documentacao")
      || text.includes("organizar documentos")
      || text.includes("triar pendencias documentais")
      || text.includes("triar pendências documentais")
    )
  ) {
    return "document_preparation";
  }

  if (
    (asksHow || asksWhat || asksNeed || asksPreparation)
    && (
      text.includes("preparar follow up")
      || text.includes("prepara follow up")
      || text.includes("preparar follow-up")
      || text.includes("prepara follow-up")
      || text.includes("organizar follow up")
      || text.includes("organizar follow-up")
      || text.includes("monta mensagem")
      || text.includes("prepara mensagem")
      || text.includes("o que mando")
    )
  ) {
    return "follow_up_preparation";
  }

  if (
    (asksHow || asksWhat || asksNeed || asksPreparation)
    && (
      text.includes("resumir caso")
      || text.includes("resumo do caso")
      || text.includes("retomar caso antigo")
      || text.includes("retomar contexto")
      || text.includes("retomar esse caso")
      || text.includes("retomar este caso")
    )
  ) {
    return "case_resume_preparation";
  }

  if (
    (asksHow || asksWhat || asksNeed || asksPreparation)
    && (
      text.includes("preparar approval")
      || text.includes("prepara approval")
      || text.includes("preparar aprovacao")
      || text.includes("prepara aprovacao")
      || text.includes("preparar aprovação")
      || text.includes("o que preciso para approval")
      || text.includes("o que preciso para aprovacao")
      || text.includes("o que preciso para aprovação")
    )
  ) {
    return "approval_preparation";
  }

  if (
    (asksHow || asksWhat || asksNeed)
    && (
      text.includes("qual specialist")
      || text.includes("que specialist")
      || text.includes("quem entra nesse caso")
      || text.includes("quem entra neste caso")
      || text.includes("juridico ou financeiro")
      || text.includes("jurídico ou financeiro")
      || text.includes("qual apoio entra")
    )
  ) {
    return "specialist_handoff";
  }

  if (asksWhen && (text.includes("envolver juridico") || text.includes("envolver jurídico"))) {
    return "when_involve_legal";
  }

  if (asksWhen && text.includes("envolver financeiro")) {
    return "when_involve_finance";
  }

  if (
    (asksHow || asksWhat || asksNeed)
    && (text.includes("pos visita") || text.includes("pós visita") || text.includes("depois da visita") || text.includes("fiz a visita") || text.includes("apos a visita") || text.includes("após a visita"))
    && (text.includes("retomar") || text.includes("sem retorno") || text.includes("sumiu"))
  ) {
    return "resume_after_visit";
  }

  if (
    (asksHow || asksWhat || asksNeed)
    && (text.includes("retomar negociacao") || text.includes("retomar negociação") || text.includes("negociacao") || text.includes("negociação"))
  ) {
    return "resume_negotiation";
  }

  if (
    (asksHow || asksWhat || asksNeed)
    && (text.includes("montar proposta") || text.includes("proposta"))
    && (text.includes("validar") || text.includes("antes") || text.includes("risco"))
  ) {
    return "proposal_readiness";
  }

  if (
    (asksHow || asksWhat || asksNeed)
    && (text.includes("fechamento") || text.includes("assinatura") || text.includes("caso sensivel") || text.includes("caso sensível"))
    && (text.includes("sensivel") || text.includes("sensível") || text.includes("risco") || text.includes("approval") || text.includes("evidence"))
  ) {
    return "sensitive_closing";
  }

  return null;
}

function buildGenericOperationalGuidanceResponse(intent: GenericOperationalGuidanceIntent, conversationState: ImobResolveTurnResponse["conversationState"]) {
  function buildGenericPreparedFollowUp(params: {
    objective: string;
    trigger: string;
    recipientRole: "lead" | "owner" | "broker" | "legal" | "finance" | "internal";
    directText: string;
    consultiveText: string;
    expectedReply: string;
  }) {
    return {
      objective: params.objective,
      recipientRole: params.recipientRole,
      trigger: params.trigger,
      expectedReply: params.expectedReply,
      escalationHint: "Se a outra parte não responder, o próximo passo é reclassificar blocker, waitingOn e decidir nova cadência de contato.",
      variants: [
        { id: "follow-up-direct", label: "Mensagem curta", tone: "direct" as const, text: params.directText },
        { id: "follow-up-consultive", label: "Mensagem consultiva", tone: "consultive" as const, text: params.consultiveText },
      ],
    };
  }

  const guidanceByIntent: Record<GenericOperationalGuidanceIntent, {
    title: string;
    lines: string[];
    text: string;
    suggestedNextAction: string;
    preparedFollowUp?: ReturnType<typeof buildGenericPreparedFollowUp>;
    actionableChecklist?: {
      title: string;
      items: Array<{
        id: string;
        title: string;
        criticality: "critical" | "supporting";
        owner: string;
        unlocks: string;
        urgency: "low" | "medium" | "high" | "critical";
      }>;
    };
    handoffPack?: {
      targetArea: string;
      reason: string;
      summary: string;
      blocker?: string | null;
      needsValidation: string[];
      remainsWithBroker: string[];
      urgency?: "low" | "medium" | "high" | "critical" | null;
      ownershipBoundary?: string | null;
    };
    ctas?: Array<{ id: string; label: string; kind: "primary" | "secondary" | "neutral"; action: "send_suggested_message"; nextMessage: string }>;
  }> = {
    capture_guidance: {
      title: "Captação operacional",
      text: [
        "Na captação, o IMOB deve responder primeiro com leitura operacional, não com formulário puro.",
        "Leitura operacional preliminar: o objetivo é validar se existe ativo real, proprietário identificável e contexto mínimo para avançar.",
        "Próximo passo seguro: confirmar dados mínimos do imóvel, urgência do proprietário e readiness documental básica antes de aprofundar cadastro.",
      ].join("\n"),
      suggestedNextAction: "Se quiser, eu organizo a captação em checklist ou abro o cadastro do imóvel.",
      lines: [
        "Validar imóvel, proprietário e urgência real.",
        "Separar dado mínimo de dado complementar.",
        "Só aprofundar cadastro depois que a captação fizer sentido.",
      ],
      ctas: [
        { id: "guidance-capture-start", label: "Cadastrar imóvel", kind: "primary", action: "send_suggested_message", nextMessage: "cadastrar imóvel" },
        { id: "guidance-capture-owner", label: "Cadastrar proprietário", kind: "secondary", action: "send_suggested_message", nextMessage: "cadastrar proprietário" },
      ],
    },
    qualification_guidance: {
      title: "Qualificação do lead",
      text: [
        "Na qualificação, o foco não é só completar campo: é entender aderência, urgência e chance real de avanço.",
        "Leitura operacional preliminar: o waitingOn mais comum é lead ou broker, dependendo do que ainda falta confirmar.",
        "Próximo passo seguro: confirmar objetivo, cidade, orçamento e prontidão antes de empurrar visita ou proposta.",
      ].join("\n"),
      suggestedNextAction: "Se quiser, eu transformo isso em próximo passo do caso ou abro a qualificação do lead.",
      lines: [
        "Objetivo do lead.",
        "Cidade e orçamento.",
        "Prontidão para visita ou avanço comercial.",
      ],
      ctas: [
        { id: "guidance-qualification-start", label: "Qualificar lead", kind: "primary", action: "send_suggested_message", nextMessage: "qualificar lead deste caso" },
        { id: "guidance-qualification-case", label: "Consultar caso", kind: "secondary", action: "send_suggested_message", nextMessage: "qual status desse caso?" },
      ],
    },
    documents_by_phase: {
      title: "Checklist operacional",
      text: [
        "Posso responder isso sem abrir cadastro agora.",
        "Na etapa documental, o que mais trava é matrícula atualizada, documento pessoal das partes, autorização de venda e comprovação financeira quando o negócio depende de crédito.",
        "Leitura operacional preliminar: o waitingOn mais provável nessa fase é owner, legal ou finance.",
        "Próximo passo seguro: identificar a fase do caso e cobrar primeiro o documento que libera a próxima validação.",
      ].join("\n"),
      suggestedNextAction: "Se quiser, eu aplico esse checklist ao caso específico.",
      lines: [
        "Captação: dados mínimos do proprietário e do imóvel.",
        "Proposta/negociação: identificação básica da contraparte e condições da oferta.",
        "Documentação/fechamento: matrícula, documentos pessoais, autorização e pendências financeiras.",
      ],
      ctas: [
        { id: "guidance-docs-case", label: "Aplicar ao caso", kind: "primary", action: "send_suggested_message", nextMessage: "consultar caso" },
        { id: "guidance-docs-collect", label: "Coletar documentos", kind: "secondary", action: "send_suggested_message", nextMessage: "coletar documentos" },
      ],
    },
    document_preparation: {
      title: "Preparação documental",
      text: [
        "Posso organizar o trabalho documental sem abrir fluxo sensível agora.",
        "Leitura operacional preliminar: primeiro separar checklist por fase, depois identificar blocker, waitingOn e owner da cobrança.",
        "Próximo passo seguro: montar um pacote mínimo com documento crítico, responsável atual e pendência que libera a próxima validação.",
      ].join("\n"),
      suggestedNextAction: "Se quiser, eu transformo isso em checklist prático do caso ou preparo a cobrança documental.",
      actionableChecklist: {
        title: "Checklist acionável documental",
        items: [
          { id: "doc-critical", title: "Cobrar o documento que libera a próxima validação", criticality: "critical", owner: "proprietário", unlocks: "destravar a revisão documental", urgency: "high" },
          { id: "doc-owner", title: "Explicitar waitingOn e owner da cobrança", criticality: "supporting", owner: "corretor", unlocks: "evitar repasse manual difuso", urgency: "medium" },
          { id: "doc-review", title: "Separar o que precisa de revisão do J_360", criticality: "supporting", owner: "jurídico/documentação", unlocks: "encaminhar o handoff certo", urgency: "medium" },
        ],
      },
      lines: [
        "Separar documento crítico do documento complementar.",
        "Explicitar waitingOn e owner da cobrança.",
        "Cobrar primeiro o item que libera a próxima validação.",
      ],
      ctas: [
        { id: "guidance-doc-prep-case", label: "Consultar caso", kind: "primary", action: "send_suggested_message", nextMessage: "qual status desse caso?" },
        { id: "guidance-doc-prep-blocker", label: "Ver bloqueios", kind: "secondary", action: "send_suggested_message", nextMessage: "mostrar bloqueios do caso" },
      ],
    },
    follow_up_preparation: {
      title: "Preparação de follow-up",
      text: [
        "Posso preparar o follow-up antes de abrir qualquer execução.",
        "Leitura operacional preliminar: follow-up útil precisa resumir contexto, explicitar blocker ou objetivo e pedir um único próximo movimento.",
        "Próximo passo seguro: dizer o que mudou desde o último contato, a objeção principal e a ação esperada do lead, owner ou broker.",
      ].join("\n"),
      suggestedNextAction: "Se quiser, eu monto a mensagem de follow-up e depois aplico ao caso atual.",
      preparedFollowUp: buildGenericPreparedFollowUp({
        objective: "Retomar o contato sem reabrir o caso do zero e puxar uma única resposta objetiva.",
        trigger: "O caso precisa de uma confirmação para voltar a andar.",
        recipientRole: "lead",
        directText: "Olá. Estou retomando este atendimento porque preciso confirmar o próximo passo com você. Hoje o ponto principal é alinhar a objeção atual e decidir um único movimento para avançarmos. Consegue me responder ainda hoje?",
        consultiveText: "Oi. Voltei a olhar este caso para não deixarmos o atendimento esfriar. Quero confirmar a objeção principal e entender qual é o melhor próximo movimento agora. Se você me responder com o que está te travando hoje, eu organizo a próxima ação sem te fazer repetir todo o contexto.",
        expectedReply: "Confirmar a objeção principal e autorizar um único próximo movimento.",
      }),
      lines: [
        "Resumo curto do contexto atual.",
        "Objeção ou blocker principal.",
        "Pedido de uma ação única no próximo contato.",
      ],
      ctas: [
        { id: "guidance-followup-case", label: "Consultar caso", kind: "primary", action: "send_suggested_message", nextMessage: "qual status desse caso?" },
        { id: "guidance-followup-next", label: "Próximo passo", kind: "secondary", action: "send_suggested_message", nextMessage: "qual próximo passo desse caso?" },
      ],
    },
    case_resume_preparation: {
      title: "Resumo estruturado do caso",
      text: [
        "Posso resumir o caso como leitura operacional antes de qualquer execução.",
        "Leitura mínima útil: fase, objetivo da fase, blocker, waitingOn, owner da ação e próximo passo seguro.",
        "Próximo passo seguro: usar esse resumo para retomar contexto rápido, handoff ou priorização da carteira.",
      ].join("\n"),
      suggestedNextAction: "Se quiser, eu monto esse resumo no caso atual e preparo a retomada.",
      lines: [
        "Fase atual e objetivo da etapa.",
        "Blocker e waitingOn atuais.",
        "Owner da ação e próximo movimento seguro.",
      ],
      ctas: [
        { id: "guidance-resume-case", label: "Consultar caso", kind: "primary", action: "send_suggested_message", nextMessage: "qual status desse caso?" },
        { id: "guidance-resume-priority", label: "Melhor ação", kind: "secondary", action: "send_suggested_message", nextMessage: "o que faço agora nesse caso?" },
      ],
    },
    approval_preparation: {
      title: "Preparação de approval",
      text: [
        "Posso preparar o approval sem executar a decisão agora.",
        "Leitura operacional preliminar: approval forte precisa de blocker claro, reasonCode, specialist contextual e evidência mínima quando a policy exigir.",
        "Próximo passo seguro: separar pendência operacional simples de transição sensível antes de pedir aprovação humana.",
      ].join("\n"),
      suggestedNextAction: "Se quiser, eu verifico se o caso atual já está pronto para approval ou ainda falta evidência.",
      lines: [
        "Confirmar reasonCode e risco real da transição.",
        "Explicitar specialist contextual e ownership do caso.",
        "Validar se approval e evidence são exigidos pela policy.",
      ],
      ctas: [
        { id: "guidance-approval-case", label: "Consultar caso", kind: "primary", action: "send_suggested_message", nextMessage: "qual status desse caso?" },
        { id: "guidance-approval-blockers", label: "Ver bloqueios", kind: "secondary", action: "send_suggested_message", nextMessage: "mostrar bloqueios do caso" },
      ],
    },
    specialist_handoff: {
      title: "Handoff de specialists",
      text: [
        "O IMOB_CRM continua dono do caso. Specialists entram como apoio contextual e não assumem ownership.",
        "J_360 entra quando o blocker é documental, contratual ou jurídico. fin-nexus entra quando o bloqueio é financeiro, de repasse, comissão ou pagamento. guardian entra quando a transição exige approval, evidence ou trilha auditável.",
        "I_BC apoia priorização comercial e negociação. Diarias apoia follow-up, rotina diária e backlog acionável.",
        "Próximo passo seguro: identificar primeiro blocker, waitingOn e risco antes de acionar o specialist.",
      ].join("\n"),
      suggestedNextAction: "Se quiser, eu aplico essa leitura ao caso atual e digo qual specialist entra por motivo real.",
      handoffPack: {
        targetArea: "Jurídico/Financeiro/Specialist contextual",
        reason: "O caso já tem blocker ou risco suficiente para justificar apoio contextual.",
        summary: "O chat deve preparar o handoff com blocker, motivo da escalada e ownership preservado no IMOB_CRM.",
        blocker: "validar o tipo de blocker antes de passar o caso",
        needsValidation: [
          "Motivo real do handoff",
          "Qual documento ou condição precisa de validação",
          "O que continua com o corretor",
        ],
        remainsWithBroker: [
          "Manter o ownership do caso no IMOB_CRM.",
          "Atualizar o cliente e coordenar o próximo passo após o retorno da área.",
        ],
        urgency: "medium",
        ownershipBoundary: "Specialist apoia o caso e não assume ownership.",
      },
      lines: [
        "IMOB_CRM mantém ownership do caso.",
        "Specialist entra por blocker, risco ou reasonCode.",
        "Handoff não substitui a leitura operacional do caso.",
      ],
      ctas: [
        { id: "guidance-specialist-case", label: "Consultar caso", kind: "primary", action: "send_suggested_message", nextMessage: "qual status desse caso?" },
        { id: "guidance-specialist-blocker", label: "Ver bloqueios", kind: "secondary", action: "send_suggested_message", nextMessage: "mostrar bloqueios do caso" },
      ],
    },
    when_involve_legal: {
      title: "Quando envolver jurídico",
      text: [
        "Se a pergunta é operacional, eu consigo orientar antes de abrir formulário.",
        "Envolva jurídico/documentação quando houver matrícula inconsistente, titularidade duvidosa, minuta sensível, exigência contratual fora do padrão ou risco de assinatura sem validação final.",
        "Leitura operacional preliminar: nesses cenários o waitingOn tende a migrar para legal.",
        "Próximo passo seguro: separar o blocker documental e só depois abrir o fluxo contratual.",
      ].join("\n"),
      suggestedNextAction: "Se quiser, eu verifico se o caso atual já pede jurídico.",
      lines: [
        "Matrícula ou titularidade inconsistente.",
        "Minuta, cláusula ou condição fora do padrão.",
        "Fechamento sensível com validação final pendente.",
      ],
      ctas: [
        { id: "guidance-legal-case", label: "Consultar caso", kind: "primary", action: "send_suggested_message", nextMessage: "qual status desse caso?" },
        { id: "guidance-legal-contract", label: "Preparar contrato", kind: "secondary", action: "send_suggested_message", nextMessage: "preparar contrato deste caso" },
      ],
    },
    when_involve_finance: {
      title: "Quando envolver financeiro",
      text: [
        "Envolva financeiro quando houver sinal, repasse, comissão, financiamento incerto ou condição de pagamento capaz de travar o avanço.",
        "Leitura operacional preliminar: nesses cenários o waitingOn mais provável é finance.",
        "Próximo passo seguro: confirmar se o bloqueio é financeiro real antes de prometer fechamento.",
      ].join("\n"),
      suggestedNextAction: "Se quiser, eu classifico o caso atual entre blocker comercial e financeiro.",
      lines: [
        "Sinal ou repasse pendente.",
        "Comissão e liquidação do negócio.",
        "Financiamento ou condição de pagamento sem validação.",
      ],
      ctas: [
        { id: "guidance-finance-case", label: "Consultar caso", kind: "primary", action: "send_suggested_message", nextMessage: "qual status desse caso?" },
      ],
    },
    resume_after_visit: {
      title: "Retomada pós-visita",
      text: [
        "Num pós-visita sem retorno, a leitura operacional padrão é follow-up risk em alta e waitingOn=lead.",
        "Antes de pedir complemento da visita, o melhor é retomar com referência objetiva ao que o cliente viu e uma única proposta de próximo movimento.",
        "Próximo passo seguro: confirmar feedback, objeção principal e janela para novo contato.",
      ].join("\n"),
      suggestedNextAction: "Se quiser, eu monto a retomada e depois aplico ao caso.",
      lines: [
        "1. Resumir o interesse percebido.",
        "2. Perguntar a objeção principal.",
        "3. Propor retorno, nova visita ou proposta.",
      ],
      ctas: [
        { id: "guidance-visit-case", label: "Consultar caso", kind: "primary", action: "send_suggested_message", nextMessage: "qual status desse caso?" },
        { id: "guidance-visit-next", label: "Próximo passo", kind: "secondary", action: "send_suggested_message", nextMessage: "qual próximo passo desse caso?" },
      ],
    },
    resume_negotiation: {
      title: "Retomada de negociação",
      text: [
        "Para retomar negociação, o correto é ler fase, blocker, waitingOn e owner da ação antes de abrir formulário.",
        "Leitura operacional preliminar: negociação parada costuma travar em preço, condição de pagamento ou silêncio de uma das partes.",
        "Próximo passo seguro: identificar quem segura o avanço e conduzir uma única ação comercial objetiva.",
      ].join("\n"),
      suggestedNextAction: "Se quiser, eu preparo a retomada e aplico ao caso atual.",
      lines: [
        "Checar se o waitingOn está em lead, owner ou broker.",
        "Explicitar a objeção principal.",
        "Definir uma ação única de retomada.",
      ],
      ctas: [
        { id: "guidance-negotiation-case", label: "Consultar caso", kind: "primary", action: "send_suggested_message", nextMessage: "qual status desse caso?" },
        { id: "guidance-negotiation-blocker", label: "Ver bloqueios", kind: "secondary", action: "send_suggested_message", nextMessage: "mostrar bloqueios do caso" },
      ],
    },
    proposal_readiness: {
      title: "Leitura antes da proposta",
      text: [
        "Antes de montar proposta, vale validar contraparte, imóvel de referência, valor, condição de pagamento e risco comercial básico.",
        "Leitura operacional preliminar: nessa fase o waitingOn costuma estar em lead, owner ou broker, dependendo de quem precisa confirmar condição.",
        "Próximo passo seguro: confirmar as condições mínimas e só depois abrir a proposta formal.",
      ].join("\n"),
      suggestedNextAction: "Se quiser, eu abro a proposta depois de revisar as condições mínimas.",
      lines: [
        "Validar imóvel, contraparte e valor.",
        "Checar condição de pagamento e sinais de objeção.",
        "Envolver I_BC se a negociação já estiver sensível.",
      ],
      ctas: [
        { id: "guidance-proposal-case", label: "Consultar caso", kind: "primary", action: "send_suggested_message", nextMessage: "qual status desse caso?" },
        { id: "guidance-proposal-open", label: "Abrir proposta", kind: "secondary", action: "send_suggested_message", nextMessage: "gerar proposta para este caso" },
      ],
    },
    sensitive_closing: {
      title: "Fechamento sensível",
      text: [
        "Em fechamento sensível, o IMOB deve separar claramente pendência de dado, blocker documental e transição governada.",
        "Leitura operacional preliminar: o waitingOn tende a migrar para legal ou finance, e pode haver necessidade de approval ou evidence conforme o risco.",
        "Próximo passo seguro: confirmar o blocker real antes de liberar assinatura, repasse ou fechamento final.",
      ].join("\n"),
      suggestedNextAction: "Se quiser, eu verifico se o caso atual já pede approval, evidence ou handoff especializado.",
      lines: [
        "Confirmar blocker documental ou financeiro.",
        "Separar pendência operacional de transição sensível.",
        "Só avançar assinatura ou repasse com validação suficiente.",
      ],
      ctas: [
        { id: "guidance-closing-case", label: "Consultar caso", kind: "primary", action: "send_suggested_message", nextMessage: "qual status desse caso?" },
        { id: "guidance-closing-blockers", label: "Ver bloqueios", kind: "secondary", action: "send_suggested_message", nextMessage: "mostrar bloqueios do caso" },
      ],
    },
  };

  const guidance = guidanceByIntent[intent];
  return {
    mode: "consult",
    action: "crm.operational_guidance",
    threadLabel: "IMOB Ops",
    conversationState,
    presentation: {
      text: guidance.text,
      suggestedNextAction: guidance.suggestedNextAction,
      ...(guidance.preparedFollowUp ? { preparedFollowUp: guidance.preparedFollowUp } : {}),
      ...(guidance.actionableChecklist ? { actionableChecklist: guidance.actionableChecklist } : {}),
      ...(guidance.handoffPack ? { handoffPack: guidance.handoffPack } : {}),
      card: {
        title: guidance.title,
        lines: guidance.lines,
        ctas: guidance.ctas,
      },
    },
  } satisfies ImobResolveTurnResponse;
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

function isStructuredOperationalDataSubmission(message: string) {
  const normalized = normalizeImobText(message);
  return (
    normalized.includes("nome do propriet") ||
    normalized.includes("telefone do propriet") ||
    normalized.includes("email do propriet") ||
    normalized.includes("e mail do propriet") ||
    normalized.includes("documento do propriet") ||
    normalized.includes("tipo do imovel") ||
    normalized.includes("finalidade do imovel") ||
    normalized.includes("cidade do imovel") ||
    normalized.includes("endereco do imovel") ||
    normalized.includes("nome do lead") ||
    normalized.includes("telefone do lead") ||
    normalized.includes("email do lead") ||
    normalized.includes("cidade de interesse") ||
    normalized.includes("faixa de orcamento")
  );
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
    case "deal":
      return "Deal Review";
    case "documents":
      return "Documentos";
    case "contract":
      return "Contrato";
    case "rules":
      return "Regras do imóvel";
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
      const dealId = operationalState?.flow === "commission.settle"
        ? (operationalState.commissionDraft?.dealId ?? (numericId ? `deal-${numericId}` : `deal-${Date.now()}`))
        : numericId ? `deal-${numericId}` : `deal-${Date.now()}`;
      return {
        intent,
        operation: "commission.settle",
        action: "realestate.release_commission",
        prompt: `Fechar comissão imobiliária para o negócio ${dealId}.`,
        input: {
          dealId,
          brokerRef: operationalState?.flow === "commission.settle" ? (operationalState.commissionDraft?.brokerRef ?? "broker-pending") : "broker-pending",
          amountCents: operationalState?.flow === "commission.settle" ? (operationalState.commissionDraft?.amountCents ?? null) : null,
          settlementStatus: operationalState?.flow === "commission.settle" ? (operationalState.commissionDraft?.settlementStatus ?? null) : null,
          payoutChannel: operationalState?.flow === "commission.settle" ? (operationalState.commissionDraft?.payoutChannel ?? null) : null,
          approvalRequired: operationalState?.flow === "commission.settle" ? operationalState.commissionDraft?.approvalRequired ?? true : true,
          requestedAt: timestamp,
        },
      };
    }
    case "deal": {
      const dealId = operationalState?.flow === "deal.review"
        ? (operationalState.dealDraft?.dealId ?? (numericId ? `deal-${numericId}` : null))
        : numericId ? `deal-${numericId}` : null;
      const propertyId = operationalState?.flow === "deal.review"
        ? (operationalState.dealDraft?.propertyId ?? (propertyRef ? `property-${propertyRef}` : null))
        : propertyRef ? `property-${propertyRef}` : null;
      return {
        intent,
        operation: "deal.review",
        action: "realestate.review_deal",
        prompt: `Revisar negócio imobiliário${dealId ? ` ${dealId}` : propertyId ? ` para ${propertyId}` : ""}.`,
        input: {
          dealId,
          propertyId,
          reviewStage: operationalState?.flow === "deal.review" ? (operationalState.dealDraft?.reviewStage ?? null) : null,
          blockers: operationalState?.flow === "deal.review" ? (operationalState.dealDraft?.blockers ?? []) : [],
          handoffTarget: operationalState?.flow === "deal.review" ? (operationalState.dealDraft?.handoffTarget ?? "IMOB_OPS") : "IMOB_OPS",
          approvalRequired: operationalState?.flow === "deal.review" ? operationalState.dealDraft?.approvalRequired ?? true : true,
          requestedAt: timestamp,
        },
      };
    }
    case "contract": {
      const propertyId = propertyRef ? `property-${propertyRef}` : `property-${Date.now()}`;
      return {
        intent,
        operation: "contract.prepare",
        action: "realestate.create_contract",
        prompt: `Preparar contrato imobiliário para ${propertyId} com handoff jurídico.`,
        input: {
          propertyId: operationalState?.flow === "contract.prepare" ? (operationalState.contractDraft?.propertyId ?? propertyId) : propertyId,
          ownerRef: operationalState?.flow === "contract.prepare" ? (operationalState.contractDraft?.ownerName ?? "owner-pending") : "owner-pending",
          clientRef: operationalState?.flow === "contract.prepare" ? (operationalState.contractDraft?.counterpartyName ?? "client-pending") : "client-pending",
          contractType: operationalState?.flow === "contract.prepare" ? (operationalState.contractDraft?.contractType ?? detectContractType(message)) : detectContractType(message),
          documentPacketStatus: operationalState?.flow === "contract.prepare" ? (operationalState.contractDraft?.documentPacketStatus ?? null) : null,
          handoffTarget: operationalState?.flow === "contract.prepare" ? (operationalState.contractDraft?.handoffTarget ?? "LEGAL") : "LEGAL",
          approvalRequired: operationalState?.flow === "contract.prepare" ? operationalState.contractDraft?.approvalRequired ?? true : true,
          requestedAt: timestamp,
        },
      };
    }
    case "rules": {
      const propertyId = operationalState?.flow === "rules.configure"
        ? (operationalState.rulesDraft?.propertyId ?? (propertyRef ? `property-${propertyRef}` : null))
        : propertyRef ? `property-${propertyRef}` : null;
      return {
        intent,
        operation: "rules.configure",
        action: "realestate.configure_property_rules",
        prompt: `Configurar regras do imóvel${propertyId ? ` ${propertyId}` : ""} para aluguel por temporada.`,
        input: {
          propertyId,
          propertyFinality: operationalState?.flow === "rules.configure" ? (operationalState.rulesDraft?.propertyFinality ?? null) : null,
          checkin: operationalState?.flow === "rules.configure" ? (operationalState.rulesDraft?.checkin ?? null) : null,
          checkout: operationalState?.flow === "rules.configure" ? (operationalState.rulesDraft?.checkout ?? null) : null,
          minHospedes: operationalState?.flow === "rules.configure" ? (operationalState.rulesDraft?.minHospedes ?? null) : null,
          maxHospedes: operationalState?.flow === "rules.configure" ? (operationalState.rulesDraft?.maxHospedes ?? null) : null,
          regras: operationalState?.flow === "rules.configure" ? (operationalState.rulesDraft?.regras ?? null) : null,
          outrasRegras: operationalState?.flow === "rules.configure" ? (operationalState.rulesDraft?.outrasRegras ?? null) : null,
          approvalRequired: true,
          requestedAt: timestamp,
        },
      };
    }
    case "documents": {
      const referenceId = operationalState?.flow === "documents.collect"
        ? (operationalState.documentDraft?.referenceId ?? (propertyRef ? `property-${propertyRef}` : null))
        : propertyRef ? `property-${propertyRef}` : null;
      return {
        intent,
        operation: "documents.collect",
        action: "realestate.collect_documents",
        prompt: `Coletar documentos operacionais${referenceId ? ` para ${referenceId}` : ""}.`,
        input: {
          referenceId,
          subjectType: operationalState?.flow === "documents.collect" ? (operationalState.documentDraft?.subjectType ?? null) : null,
          documentTypes: operationalState?.flow === "documents.collect" ? (operationalState.documentDraft?.documentTypes ?? []) : [],
          deliveryChannel: operationalState?.flow === "documents.collect" ? (operationalState.documentDraft?.deliveryChannel ?? null) : null,
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
      const propertyId = operationalState?.flow === "listing.activate"
        ? (operationalState.listingDraft?.propertyId ?? (propertyRef ? `property-${propertyRef}` : `property-${Date.now()}`))
        : propertyRef ? `property-${propertyRef}` : `property-${Date.now()}`;
      return {
        intent,
        operation: "listing.activate",
        action: "realestate.apply_adjustment",
        prompt: `Ativar listing operacional do imóvel ${propertyId}.`,
        input: {
          propertyId,
          listingTitle: operationalState?.flow === "listing.activate" ? (operationalState.listingDraft?.listingTitle ?? null) : null,
          publicationChannels: operationalState?.flow === "listing.activate" ? (operationalState.listingDraft?.publicationChannels ?? []) : [],
          askingPrice: operationalState?.flow === "listing.activate" ? (operationalState.listingDraft?.askingPrice ?? null) : null,
          publicationGoal: operationalState?.flow === "listing.activate" ? (operationalState.listingDraft?.publicationGoal ?? null) : null,
          adjustmentType: "listing_activate",
          reason: "listing-operation",
          requestedAt: timestamp,
        },
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
      const propertyId = operationalState?.flow === "visit.schedule"
        ? (operationalState.visitDraft?.propertyId ?? (propertyRef ? `property-${propertyRef}` : `property-${Date.now()}`))
        : propertyRef ? `property-${propertyRef}` : `property-${Date.now()}`;
      return {
        intent,
        operation: "visit.schedule",
        action: "realestate.apply_adjustment",
        prompt: `Agendar visita operacional para ${propertyId}.`,
        input: {
          propertyId,
          visitorName: operationalState?.flow === "visit.schedule" ? (operationalState.visitDraft?.visitorName ?? null) : null,
          visitorPhone: operationalState?.flow === "visit.schedule" ? (operationalState.visitDraft?.visitorPhone ?? null) : null,
          preferredDate: operationalState?.flow === "visit.schedule" ? (operationalState.visitDraft?.preferredDate ?? null) : null,
          preferredWindow: operationalState?.flow === "visit.schedule" ? (operationalState.visitDraft?.preferredWindow ?? null) : null,
          adjustmentType: "visit_schedule",
          reason: "visit-scheduling",
          requestedAt: timestamp,
        },
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
  const finalize = (response: ImobResolveTurnResponse) => withImobAgentPresentationMetadata(response);
  const message = request.message.trim();
  const normalizedMessage = normalizeImobText(message);
  const parsedCatalogIntent = request.semanticIntent ?? parseImobIntent(message);
  const hasExplicitCatalogTarget = Boolean(parsedCatalogIntent.action && parsedCatalogIntent.entity);
  const catalogDrivenIntent = mapCatalogIntentToImobIntent(parsedCatalogIntent);
  const classifiedIntent = classifyImobIntent(message);
  const baseIntent = catalogDrivenIntent ?? classifiedIntent;
  const nextThreadState = createNextImobThreadState(request.threadState ?? undefined, message);
  const activeOperationalState = request.threadState?.operational ?? null;
  const turnDecision = resolveImobTurnDecision({
    activeOperationalState,
    message,
    nextSlots: nextThreadState.slots,
    baseIntent,
    hasExplicitCatalogTarget,
  });
  const isDocumentationStageRequest =
    normalizedMessage.includes("etapa documental") ||
    normalizedMessage.includes("fase documental") ||
    normalizedMessage.includes("fluxo documental");
  const intent = isDocumentationStageRequest ? "documents" : turnDecision.intent;
  const wantsDocumentValidation =
    (parsedCatalogIntent.action === "validate" && parsedCatalogIntent.entity === "documento") ||
    /\b(validar|conferir)\s+document/.test(normalizedMessage);
  const wantsContractHistory =
    (parsedCatalogIntent.action === "history" && parsedCatalogIntent.entity === "contrato") ||
    /historico\s+de\s+contrato/.test(normalizedMessage);
  const wantsSendForSignature =
    (parsedCatalogIntent.action === "sendForSignature" && parsedCatalogIntent.entity === "contrato") ||
    /(?:enviar|mandar)\s+contrato\s+para\s+assinatura|envio\s+para\s+assinatura/.test(normalizedMessage);
  const genericOperationalGuidanceIntent = resolveGenericOperationalGuidanceIntent(message);
  const semanticIntentSource = request.semanticIntentSource ?? "parser_fallback";
  if (!activeOperationalState && turnDecision.stage === "front_door_generic") {
    return finalize({
      mode: "consult",
      action: "crm.capture.flow_guidance",
      threadLabel: getIntentThreadLabel("capture"),
      conversationState: { ...nextThreadState, mode: "consult" },
      presentation: {
        text: "Posso te direcionar agora na jornada imobiliária.",
        suggestedNextAction: "Escolha por onde você quer continuar na captação.",
        metadata: {
          confidence: {
            source: semanticIntentSource,
            action: "create",
            entity: null,
          },
          choiceStyle: "inline",
          frontDoorAgentId: "EIAH",
        },
        card: {
          title: "Posso seguir com uma destas ações agora.",
          lines: ["Escolha a ação para continuar a jornada imobiliária."],
          ctas: buildCaptureEntryChoices(),
        },
      },
    });
  }
  if (activeOperationalState?.status === "collecting" && turnDecision.stage === "front_door_generic") {
    const guidanceChoices = buildCaptureFlowGuidanceChoices(activeOperationalState.flow);
    return finalize({
      mode: "consult",
      action: "crm.capture.flow_guidance",
      threadLabel: getIntentThreadLabel(mapOperationalFlowToIntent(activeOperationalState.flow)),
      conversationState: {
        ...(request.threadState ?? nextThreadState),
        mode: "consult",
      },
      presentation: {
        text: "Posso te direcionar agora no fluxo imobiliário.",
        suggestedNextAction: "Escolha se você quer continuar este cadastro ou mudar para outra ação da captação.",
        metadata: {
          confidence: {
            source: semanticIntentSource,
            action: "create",
            entity: null,
          },
          choiceStyle: "inline",
          frontDoorAgentId: "EIAH",
        },
        card: {
          title: "Posso seguir com uma destas ações agora.",
          lines: ["Escolha a ação para continuar a captação no IMOB."],
          ctas: guidanceChoices,
        },
      },
    });
  }
  const shouldPreferActiveAttachmentFlow =
    activeOperationalState?.status === "collecting" &&
    isAttachmentReferenceMessage(message);

  if (shouldPreferActiveAttachmentFlow && activeOperationalState) {
    const presentationMeta = buildOperationalPresentationMeta(activeOperationalState);
    return finalize({
      mode: "consult",
      action: "realestate.collect_documents",
      threadLabel: getIntentThreadLabel(mapOperationalFlowToIntent(activeOperationalState.flow)),
      conversationState: {
        slots: createEmptyImobSlots(),
        mode: "consult",
        pendingSlot: "none",
        resultOffset: 0,
        operational: activeOperationalState,
      },
      presentation: {
        ...presentationMeta,
        text: [
          "Posso receber esse documento por anexo nesta conversa.",
          "Use o botão de anexo para enviar o arquivo agora.",
          presentationMeta.nextStep ? `Próximo passo: ${presentationMeta.nextStep}` : null,
        ].filter(Boolean).join("\n"),
        suggestedNextAction: "Anexe o documento nesta conversa para validar e continuar o cadastro.",
        card: {
          title: "Anexo aguardado",
          lines: [
            "Envie o documento pelo botão de anexo desta conversa.",
            "Se preferir texto, informe o tipo do documento e os dados principais.",
          ],
          ctas: [
            {
              id: "open-attachment-menu",
              label: "Anexar agora",
              kind: "primary",
              action: "open_attachment_menu",
            },
          ],
        },
      },
    });
  }

  if (isKnowledgeSearchQuery(message) && !(intent === "documents" && isDocumentCollectionRequest(message))) {
    const region = nextThreadState.slots.city ?? nextThreadState.slots.region ?? extractRegion(normalizeImobText(message)) ?? "Brasil";
    const segment = nextThreadState.slots.goal ?? extractSegment(message);
    const sourceTypes = extractKnowledgeSourceTypes(message);
    if (!hasImobKnowledgeAccess(request)) {
      return finalize({
        mode: "blocked",
        action: "realestate.search_knowledge_base",
        threadLabel: "Busca de imóveis",
        conversationState: { ...nextThreadState, mode: "blocked" },
        presentation: {
          text: "O IMOB não está habilitado para este tenant/workspace. Ative a vertical antes de usar a busca documental.",
          suggestedNextAction: "Ativar o IMOB no workspace ou falar com comercial.",
        },
      });
    }
    const sources = buildImobSearchSources(message, region, segment);
    return finalize({
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
    });
  }

  if (genericOperationalGuidanceIntent) {
    return finalize(buildGenericOperationalGuidanceResponse(genericOperationalGuidanceIntent, { ...nextThreadState, mode: "consult" }));
  }

  const resolvedRegion = nextThreadState.slots.city ?? nextThreadState.slots.region ?? extractRegion(normalizeImobText(message)) ?? "Brasil";
  const resolvedSegment = nextThreadState.slots.goal ?? extractSegment(message);
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
    return finalize(response);
  }

  if (isCaptureEntryOptionsRequest(message)) {
    return finalize({
      mode: "consult",
      action: "crm.capture.entry_options",
      threadLabel: getIntentThreadLabel("capture"),
      conversationState: { ...nextThreadState, mode: "consult" },
      presentation: {
        text: "Posso seguir por uma destas opções agora.",
        suggestedNextAction: "Escolha se você quer cadastrar imóvel, cadastrar proprietário, qualificar lead ou consultar caso.",
        metadata: {
          confidence: {
            source: semanticIntentSource,
            action: "create",
            entity: null,
          },
          choiceStyle: "inline",
        },
        card: {
          title: "Escolha uma opção",
          lines: ["Selecione como você quer iniciar a captação no IMOB."],
          ctas: buildCaptureEntryChoices(),
        },
      },
    });
  }


  if (isGenericLeadRequest(parsedCatalogIntent, normalizedMessage)) {
    const leadChoices = buildLeadCreationChoices();
    return finalize({
      mode: "consult",
      action: "crm.lead.clarify_target",
      threadLabel: getIntentThreadLabel(intent),
      conversationState: { ...nextThreadState, mode: "consult" },
      presentation: {
        text: "",
        suggestedNextAction: "Escolha como você quer iniciar esse lead.",
        metadata: buildCatalogConfidenceMetadata(parsedCatalogIntent, false, { choiceStyle: "inline", source: semanticIntentSource }),
        card: {
          title: "Escolha uma opção",
          lines: ["Escolha como você quer iniciar o lead."],
          ctas: leadChoices.map((choice, index) => ({
            id: `lead-create-${choice.entity}`,
            label: choice.label,
            kind: index === 0 ? "primary" : index === 1 ? "secondary" : "neutral",
            action: "send_suggested_message" as const,
            nextMessage: choice.nextMessage,
          })),
        },
      },
    });
  }

  if (
    parsedCatalogIntent.action
    && !parsedCatalogIntent.entity
    && (parsedCatalogIntent.action === "create" || intent === "adjustment")
    && !["pending_field_parse", "same_journey_context", "explicit_continuity"].includes(turnDecision.stage)
  ) {
    const actionChoices = parsedCatalogIntent.action === "create" ? buildCadastroCreationChoices() : listImobIntentChoicesForAction(parsedCatalogIntent.action);
    if (actionChoices.length > 0) {
      const actionLabel = parsedCatalogIntent.matchedActionAlias ?? parsedCatalogIntent.action;
      return finalize({
        mode: "consult",
        action: parsedCatalogIntent.action === "create" ? "crm.capture.clarify_target" : "crm.catalog.clarify_entity",
        threadLabel: getIntentThreadLabel(intent),
        conversationState: { ...nextThreadState, mode: "consult" },
        presentation: {
          text: parsedCatalogIntent.action === "create"
            ? ""
            : [
                "Escolha uma opção.",
                `Selecione o alvo para ${actionLabel.toLowerCase()} agora.`,
              ].join("\n"),
          suggestedNextAction: parsedCatalogIntent.action === "create"
            ? "Escolha um cadastro para eu abrir a próxima etapa."
            : `Escolha o alvo para ${actionLabel.toLowerCase()} na próxima etapa.`,
          metadata: buildCatalogConfidenceMetadata(
            parsedCatalogIntent,
            false,
            parsedCatalogIntent.action === "create" ? { choiceStyle: "inline" } : undefined
          ),
          card: {
            title: "Escolha uma opção",
            lines: parsedCatalogIntent.action === "create"
              ? ["Escolha o cadastro que você quer iniciar."]
              : buildCatalogActionLines(actionLabel, actionChoices.map((choice) => choice.label.toLowerCase())),
            ctas: actionChoices.map((choice, index) => ({
              id: `${parsedCatalogIntent.action}-${choice.entity}`,
              label: choice.label,
              kind: index === 0 ? "primary" : index === 1 ? "secondary" : "neutral",
              action: "send_suggested_message",
              nextMessage: choice.nextMessage,
            })),
          },
        },
      });
    }
  }

  if (wantsContractHistory || (parsedCatalogIntent.action === "history" && parsedCatalogIntent.entity === "contrato")) {
    return finalize({
      mode: "consult",
      action: "crm.catalog.history",
      threadLabel: getIntentThreadLabel(intent),
      conversationState: { ...nextThreadState, mode: "consult" },
      presentation: {
        text: "",
        form: buildContractHistoryForm(),
        metadata: buildCatalogConfidenceMetadata(parsedCatalogIntent, false, { source: semanticIntentSource }),
      },
    });
  }

  if (wantsDocumentValidation) {
    const operationalState = createNextImobOperationalState(request.threadState?.operational ?? null, intent, message, nextThreadState.slots);
    return finalize({
      mode: "execute",
      action: "realestate.collect_documents",
      threadLabel: getIntentThreadLabel(intent),
      conversationState: { slots: createEmptyImobSlots(), mode: "execute", pendingSlot: "none", resultOffset: 0, operational: operationalState },
      executionRequest: buildOperationalExecution(intent === "documents" ? intent : "documents", message, new Date().toISOString(), operationalState),
      presentation: {
        ...buildOperationalPresentationMeta(operationalState),
        text: "",
        form: buildDocumentValidationForm(operationalState?.documentDraft),
        metadata: buildCatalogConfidenceMetadata(parsedCatalogIntent, false, { source: semanticIntentSource }),
      },
    });
  }

  if (intent === "documents" && isDocumentationStageRequest) {
    const operationalState = createNextImobOperationalState(request.threadState?.operational ?? null, intent, message, nextThreadState.slots);
    return finalize({
      mode: "consult",
      action: "realestate.collect_documents",
      threadLabel: getIntentThreadLabel(intent),
      conversationState: { slots: createEmptyImobSlots(), mode: "consult", pendingSlot: "none", resultOffset: 0, operational: operationalState },
      presentation: {
        ...buildOperationalPresentationMeta(operationalState),
        text: "Escolha qual etapa documental você quer abrir agora.",
        suggestedNextAction: "Selecione se vai enviar documentos do proprietário, do imóvel ou do lead.",
        metadata: buildCatalogConfidenceMetadata(parsedCatalogIntent, false, { choiceStyle: "inline", source: semanticIntentSource }),
        card: {
          title: "Etapa documental",
          lines: ["Posso abrir o fluxo documental já no contexto certo."],
          ctas: buildDocumentEntryChoices(),
        },
      },
    });
  }

  if (parsedCatalogIntent.action && parsedCatalogIntent.entity && parsedCatalogIntent.action !== "create" && !["listing", "documents", "proposal", "visit", "lead", "contract", "deal", "rules", "commission"].includes(intent)) {
    if (shouldClarifyCatalogIntent(parsedCatalogIntent)) {
      const clarification = buildCatalogActionClarification(parsedCatalogIntent, semanticIntentSource);
      if (clarification) {
        return finalize({
          ...clarification,
          threadLabel: getIntentThreadLabel(intent),
          conversationState: { ...nextThreadState, mode: "consult" },
        });
      }
    }

    const canonicalLabel = resolveCanonicalLabel(message);
    if (canonicalLabel) {
      return finalize({
        mode: "consult",
        action: `crm.catalog.${parsedCatalogIntent.action}`,
        threadLabel: getIntentThreadLabel(intent),
        conversationState: { ...nextThreadState, mode: "consult" },
        presentation: {
          ...buildCatalogEntityActionPresentation(
          humanizeCatalogEntity(parsedCatalogIntent.entity),
          parsedCatalogIntent.action,
          canonicalLabel,
          ),
          metadata: buildCatalogConfidenceMetadata(parsedCatalogIntent, false, { source: semanticIntentSource }),
        },
      });
    }
  }
  if (intent === "documents" && isDocumentUploadOnlyRequest(message)) {
    const operationalState = createNextImobOperationalState(request.threadState?.operational ?? null, intent, message, nextThreadState.slots);
    const presentationMeta = buildOperationalPresentationMeta(operationalState);
    return finalize({
      mode: "consult",
      action: "realestate.collect_documents",
      threadLabel: getIntentThreadLabel(intent),
      conversationState: { slots: createEmptyImobSlots(), mode: "consult", pendingSlot: "none", resultOffset: 0, operational: operationalState },
      presentation: {
        ...presentationMeta,
        text: [
          "Posso receber esse documento por anexo nesta conversa.",
          "Use o botão de anexo para enviar o arquivo agora.",
          presentationMeta.nextStep ? `Próximo passo: ${presentationMeta.nextStep}` : null,
        ].filter(Boolean).join("\n"),
        suggestedNextAction: "Anexe o documento nesta conversa para validar e continuar o cadastro.",
        card: {
          title: "Anexo aguardado",
          lines: [
            "Envie o documento pelo botão de anexo desta conversa.",
            "Se preferir texto, informe o tipo do documento e os dados principais.",
          ],
          ctas: [
            {
              id: "open-attachment-menu",
              label: "Anexar agora",
              kind: "primary",
              action: "open_attachment_menu",
            },
          ],
        },
      },
    });
  }

  if (intent === "match" && (isResearchQuery(message) || shouldStayInSearchThread || hasMeaningfulSearchFilters(nextThreadState.slots))) {
    return finalize({
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
    });
  }

  const operationalState = createNextImobOperationalState(request.threadState?.operational ?? null, intent, message, nextThreadState.slots);
  const operationalPendingLabels = operationalState
    ? operationalState.pendingFields.map((field) =>
        mapOperationalPendingFieldLabel(operationalState.flow, field, {
          leadPersona: operationalState.flow === "lead.qualify" ? (operationalState.leadDraft?.leadPersona ?? "lead") : null,
        })
      )
    : [];
  if (
    operationalState?.flow === "rules.configure" &&
    operationalState.rulesDraft?.propertyFinality &&
    operationalState.rulesDraft.propertyFinality !== "aluguel_por_temporada"
  ) {
    return finalize({
      mode: "blocked",
      action: "realestate.configure_property_rules",
      threadLabel: getIntentThreadLabel(intent),
      conversationState: { slots: createEmptyImobSlots(), mode: "blocked", pendingSlot: "none", resultOffset: 0, operational: operationalState },
      presentation: {
        ...buildOperationalPresentationMeta(operationalState),
        text: "Não vou abrir regras de hospedagem para esse imóvel porque a finalidade informada não é aluguel por temporada.",
        suggestedNextAction: "Confirme a finalidade do imóvel ou altere para aluguel por temporada antes de configurar check-in, check-out e hóspedes.",
        metadata: {
          ...buildCatalogConfidenceMetadata(parsedCatalogIntent, false, { source: semanticIntentSource }),
          reasonCode: "rules_configure_requires_seasonal_rental",
        } as any,
      },
    });
  }

  const executionRequest = buildOperationalExecution(intent, message, new Date().toISOString(), operationalState);
  const propertyReadyMenuCard =
    operationalState?.flow === "property.create" && operationalPendingLabels.length === 0
      ? {
          title: "Próximos passos",
          lines: [],
          actionsLayout: "inline" as const,
          ctas: [
            {
              id: "property-next-qualify-lead",
              label: "Qualificar lead",
              kind: "primary" as const,
              action: "send_suggested_message" as const,
              nextMessage: "qualificar lead deste caso",
            },
            {
              id: "property-next-consult-case",
              label: "Consultar caso",
              kind: "secondary" as const,
              action: "send_suggested_message" as const,
              nextMessage: "consultar caso deste imóvel",
            },
            {
              id: "property-next-documents",
              label: "Revisar documentos",
              kind: "neutral" as const,
              action: "send_suggested_message" as const,
              nextMessage: "coletar documentos deste imóvel",
            },
            {
              id: "property-next-owner",
              label: "Cadastrar proprietário",
              kind: "neutral" as const,
              action: "send_suggested_message" as const,
              nextMessage: "cadastrar proprietário",
            },
          ],
        }
      : undefined;
  const presentation = {
    ...buildOperationalPresentationMeta(operationalState),
    metadata: buildCatalogConfidenceMetadata(parsedCatalogIntent, false, { source: semanticIntentSource }),
    card: propertyReadyMenuCard,
    form:
      operationalState?.status === "collecting"
        ? operationalState.flow === "owner.create"
          ? buildOwnerCreateForm(operationalState.ownerDraft)
          : operationalState.flow === "property.create"
            ? buildPropertyCreateForm(operationalState.propertyDraft)
            : operationalState.flow === "lead.qualify"
              ? buildLeadCreateForm(operationalState.leadDraft)
              : operationalState.flow === "proposal.create"
                ? buildProposalCreateForm(operationalState.proposalDraft)
              : operationalState.flow === "rules.configure"
                ? buildRulesConfigureForm(operationalState.rulesDraft)
              : operationalState.flow === "listing.activate"
                ? buildListingActivateForm(operationalState.listingDraft)
                : operationalState.flow === "documents.collect"
                  ? buildDocumentValidationForm(operationalState.documentDraft)
                  : operationalState.flow === "contract.prepare"
                    ? buildContractActionForm(
                        operationalState.contractDraft,
                        wantsSendForSignature || (parsedCatalogIntent.action === "sendForSignature" && parsedCatalogIntent.entity === "contrato")
                          ? "sendForSignature"
                          : "create"
                      )
                    : undefined
        : undefined,
    text:
        intent === "capture"
          ? operationalState?.flow === "property.create"
            ? operationalPendingLabels.length > 0
              ? isStructuredOperationalDataSubmission(message)
                ? `Dados do imóvel salvos parcialmente. Pendências: ${operationalPendingLabels.join(", ")}.`
                : `Posso iniciar o cadastro do imóvel agora. Ainda preciso de: ${operationalPendingLabels.join(", ")}.`
              : "Posso iniciar o cadastro do imóvel agora."
            : operationalState?.flow === "owner.create"
              ? operationalPendingLabels.length > 0
                ? isStructuredOperationalDataSubmission(message)
                  ? `Cadastro do proprietário salvo parcialmente. Pendências: ${operationalPendingLabels.join(", ")}.`
                  : ""
                : "Cadastro do proprietário pronto para revisão."
              : "Posso iniciar a captação agora."
          : intent === "match"
            ? "Posso começar a busca de opções agora."
            : intent === "lead"
              ? operationalState?.flow === "lead.qualify" && operationalState.pendingFields.length > 0
                ? isStructuredOperationalDataSubmission(message)
                  ? `Cadastro ${getLeadPersonaCopy(operationalState.leadDraft).article} salvo parcialmente. Pendências: ${operationalPendingLabels.join(", ")}.`
                  : `Posso iniciar o cadastro ${getLeadPersonaCopy(operationalState.leadDraft).article} agora. Ainda preciso de: ${operationalPendingLabels.join(", ")}.`
                : `Posso iniciar o cadastro ${getLeadPersonaCopy(operationalState?.leadDraft).article} agora.`
              : intent === "visit"
                ? operationalState?.flow === "visit.schedule" && operationalState.pendingFields.length > 0
                  ? `Posso organizar o agendamento da visita agora. Ainda preciso de: ${operationalState.pendingFields.join(", ")}.`
                  : "Posso organizar o agendamento da visita agora."
                : intent === "listing"
                  ? operationalState?.flow === "listing.activate"
                    ? ""
                    : "Posso preparar a ativação do anúncio agora."
                    : intent === "proposal"
                      ? operationalState?.flow === "proposal.create" && operationalState.pendingFields.length > 0
                      ? `Posso preparar a proposta agora para ${getProposalPersonaCopy(operationalState.proposalDraft).singular}. Ainda preciso de: ${operationalPendingLabels.join(", ")}.`
                      : `Posso preparar a proposta para ${getProposalPersonaCopy(operationalState?.proposalDraft).singular} agora.`
                    : intent === "deal"
                      ? operationalState?.flow === "deal.review" && operationalState.pendingFields.length > 0
                        ? `Posso iniciar a revisão do negócio agora. Ainda preciso de: ${operationalState.pendingFields.join(", ")}.`
                        : "Posso iniciar a revisão do negócio agora."
                    : intent === "documents"
                      ? operationalState?.flow === "documents.collect"
                        ? wantsDocumentValidation
                          ? ""
                          : operationalState.pendingFields.length > 0
                            ? `Posso iniciar a coleta documental agora. Ainda preciso de: ${operationalState.pendingFields.join(", ")}.`
                            : "Posso iniciar a coleta documental agora."
                        : "Posso iniciar a coleta documental agora."
                    : intent === "contract"
                      ? operationalState?.flow === "contract.prepare"
                        ? wantsSendForSignature
                          ? ""
                          : operationalState.pendingFields.length > 0
                            ? `Posso preparar o handoff jurídico do contrato agora. Ainda preciso de: ${operationalState.pendingFields.join(", ")}.`
                            : "Posso preparar o handoff jurídico do contrato agora."
                        : "Posso preparar o handoff jurídico do contrato agora."
                      : intent === "rules"
                      ? operationalState?.flow === "rules.configure"
                        ? operationalState.rulesDraft?.propertyFinality && operationalState.rulesDraft.propertyFinality !== "aluguel_por_temporada"
                          ? "Esse fluxo de regras só segue para imóvel com finalidade de aluguel por temporada."
                          : operationalState.pendingFields.length > 0
                            ? `Posso configurar as regras de temporada agora. Ainda preciso de: ${operationalPendingLabels.join(", ")}.`
                            : "Regras de temporada prontas para revisão."
                        : "Posso configurar as regras do imóvel agora."
                    : intent === "commission"
                      ? operationalState?.flow === "commission.settle" && operationalState.pendingFields.length > 0
                          ? `Posso iniciar a liquidação da comissão agora. Ainda preciso de: ${operationalState.pendingFields.join(", ")}.`
                          : "Posso iniciar a liquidação da comissão agora."
      : "Posso aplicar esse ajuste agora.",
  };

  if (presentation.form && shouldReturnConsultWithForm({ message, operationalState })) {
    return finalize({
      mode: "consult",
      action: executionRequest.action,
      threadLabel: getIntentThreadLabel(intent),
      conversationState: { slots: createEmptyImobSlots(), mode: "consult", pendingSlot: "none", resultOffset: 0, operational: operationalState },
      presentation,
    });
  }

  if (presentation.form) {
    return finalize({
      mode: "execute",
      action: executionRequest.action,
      threadLabel: getIntentThreadLabel(intent),
      conversationState: { slots: createEmptyImobSlots(), mode: "execute", pendingSlot: "none", resultOffset: 0, operational: operationalState },
      executionRequest,
      presentation,
    });
  }

  return finalize({
    mode: "execute",
    action: executionRequest.action,
    threadLabel: getIntentThreadLabel(intent),
    conversationState: { slots: createEmptyImobSlots(), mode: "execute", pendingSlot: "none", resultOffset: 0, operational: operationalState },
    executionRequest,
    presentation,
  });
}
