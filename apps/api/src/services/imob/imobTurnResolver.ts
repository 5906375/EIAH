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
  type ImobExecutionRequest,
  type ImobIntent,
  type ImobKnowledgeSourceFilter,
  type ImobOperationalOwner,
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
  if (text.includes("deal") || text.includes("negocio") || text.includes("negócio") || text.includes("review do negocio") || text.includes("review do negócio") || text.includes("revisar negocio") || text.includes("revisar negócio")) return "deal";
  if (text.includes("contrato") || text.includes("assinatura") || text.includes("minuta")) return "contract";
  if (isDocumentCollectionRequest(message)) return "documents";
  if (text.includes("proposta") || text.includes("oferta") || text.includes("negocia")) return "proposal";
  if (text.includes("visita") || text.includes("agendar") || text.includes("agenda") || text.includes("tour")) return "visit";
  if (text.includes("lead") || text.includes("triagem") || text.includes("qualificar cliente") || text.includes("qualificar lead")) return "lead";
  if (text.includes("publicar") || text.includes("anuncio") || text.includes("anúncio") || text.includes("listing") || text.includes("portal")) return "listing";
  if (text.includes("cadastrar") || text.includes("capta") || text.includes("propriet") || text.includes("imovel") || text.includes("imóvel")) return "capture";
  if (text.includes("alugar") || text.includes("loca") || text.includes("procur") || text.includes("quartos")) return "match";
  return "adjustment";
}

function mapCatalogIntentToImobIntent(parsed: { entity: string | null; action: string | null }): ImobIntent | null {
  if (!parsed.entity || !parsed.action) return null;

  if (["proprietario", "imovel", "vendedor", "locador"].includes(parsed.entity) && parsed.action === "create") {
    return "capture";
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
  if (flow === "commission.settle") return "commission";
  return "adjustment";
}

function shouldContinueCurrentOperationalFlow(
  previous: ImobResolveTurnRequest["threadState"]["operational"] | null | undefined,
  intent: ImobIntent
) {
  if (!previous || previous.status !== "collecting") return false;
  if (intent === "adjustment") return true;
  return mapOperationalFlowToIntent(previous.flow) === intent;
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
        label: "Continuar cadastro",
        kind: "primary" as const,
      },
    ],
  };
}

function buildPropertyCreateForm(propertyDraft?: {
  propertyType?: string | null;
  goal?: "locacao" | "venda" | null;
  city?: string | null;
  address?: string | null;
} | null) {
  return {
    entity: "imovel",
    action: "create",
    label: "Cadastrar imóvel",
    description: "Preencha os dados abaixo para iniciar o cadastro do imóvel.",
    fields: [
      {
        name: "propertyType",
        label: "Tipo do imóvel",
        type: "text" as const,
        required: true,
        placeholder: "Ex.: apartamento, casa, terreno",
        value: propertyDraft?.propertyType ?? "",
      },
      {
        name: "goal",
        label: "Finalidade do imóvel",
        type: "text" as const,
        required: true,
        placeholder: "Ex.: venda ou locação",
        value: propertyDraft?.goal ?? "",
      },
      {
        name: "city",
        label: "Cidade do imóvel",
        type: "text" as const,
        required: true,
        placeholder: "Ex.: Itapema",
        value: propertyDraft?.city ?? "",
      },
      {
        name: "address",
        label: "Endereço do imóvel",
        type: "text" as const,
        required: true,
        placeholder: "Ex.: Rua 1000, 123",
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
        label: "Continuar cadastro",
        kind: "primary" as const,
      },
    ],
  };
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
        label: "Continuar cadastro",
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
    propertyType: "tipo do imóvel",
    goal: "finalidade do imóvel",
    city: "cidade do imóvel",
    neighborhood: "bairro do imóvel",
    bedrooms: "quantidade de quartos",
    bathrooms: "quantidade de banheiros",
    address: "endereço do imóvel",
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
    brokerRef: "corretor responsável",
    amountCents: "valor da comissão",
    payoutChannel: "canal de repasse",
    settlementStatus: "status da liquidação",
    dealId: "negócio",
    approvalRequired: "aprovação humana",
  };
  if (flow === "proposal.create" && field === "propertyId") return "imóvel da proposta";
  if (flow === "visit.schedule" && field === "propertyId") return "imóvel da visita";
  if (flow === "contract.prepare" && field === "propertyId") return "imóvel do contrato";
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
                : "Qualificar interesse e vincular o próximo imóvel ou etapa comercial."
              : flow === "owner.create"
                ? pendingFieldLabels.length > 0
                  ? getOwnerPersonaCopy(operationalState.ownerDraft).nextStep
                  : `Vincular ${getOwnerPersonaCopy(operationalState.ownerDraft).article} ao próximo imóvel ou etapa documental.`
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
    case "deal":
      return "Deal Review";
    case "documents":
      return "Documentos";
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
  const message = request.message.trim();
  const normalizedMessage = normalizeImobText(message);
  const parsedCatalogIntent = request.semanticIntent ?? parseImobIntent(message);
  const hasExplicitCatalogTarget = Boolean(parsedCatalogIntent.action && parsedCatalogIntent.entity);
  const catalogDrivenIntent = mapCatalogIntentToImobIntent(parsedCatalogIntent);
  const classifiedIntent = classifyImobIntent(message);
  const baseIntent = catalogDrivenIntent ?? classifiedIntent;
  const intent = !hasExplicitCatalogTarget && shouldContinueCurrentOperationalFlow(request.threadState?.operational ?? null, baseIntent)
    ? mapOperationalFlowToIntent(request.threadState!.operational!.flow)
    : baseIntent;
  const wantsDocumentValidation =
    (parsedCatalogIntent.action === "validate" && parsedCatalogIntent.entity === "documento") ||
    /\b(validar|conferir)\s+document/.test(normalizedMessage);
  const wantsContractHistory =
    (parsedCatalogIntent.action === "history" && parsedCatalogIntent.entity === "contrato") ||
    /historico\s+de\s+contrato/.test(normalizedMessage);
  const wantsSendForSignature =
    (parsedCatalogIntent.action === "sendForSignature" && parsedCatalogIntent.entity === "contrato") ||
    /(?:enviar|mandar)\s+contrato\s+para\s+assinatura|envio\s+para\s+assinatura/.test(normalizedMessage);
  const nextThreadState = createNextImobThreadState(request.threadState ?? undefined, message);
  const semanticIntentSource = request.semanticIntentSource ?? "parser_fallback";
  const activeOperationalState = request.threadState?.operational ?? null;
  const shouldPreferActiveAttachmentFlow =
    activeOperationalState?.status === "collecting" &&
    isAttachmentReferenceMessage(message);

  if (shouldPreferActiveAttachmentFlow && activeOperationalState) {
    const presentationMeta = buildOperationalPresentationMeta(activeOperationalState);
    return {
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
    };
  }

  if (isKnowledgeSearchQuery(message) && !(intent === "documents" && isDocumentCollectionRequest(message))) {
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


  if (isGenericLeadRequest(parsedCatalogIntent, normalizedMessage)) {
    const leadChoices = buildLeadCreationChoices();
    return {
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
    };
  }

  if (parsedCatalogIntent.action && !parsedCatalogIntent.entity && (parsedCatalogIntent.action === "create" || intent === "adjustment")) {
    const actionChoices = parsedCatalogIntent.action === "create" ? buildCadastroCreationChoices() : listImobIntentChoicesForAction(parsedCatalogIntent.action);
    if (actionChoices.length > 0) {
      const actionLabel = parsedCatalogIntent.matchedActionAlias ?? parsedCatalogIntent.action;
      return {
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
      };
    }
  }

  if (wantsContractHistory || (parsedCatalogIntent.action === "history" && parsedCatalogIntent.entity === "contrato")) {
    return {
      mode: "consult",
      action: "crm.catalog.history",
      threadLabel: getIntentThreadLabel(intent),
      conversationState: { ...nextThreadState, mode: "consult" },
      presentation: {
        text: "",
        form: buildContractHistoryForm(),
        metadata: buildCatalogConfidenceMetadata(parsedCatalogIntent, false, { source: semanticIntentSource }),
      },
    };
  }

  if (wantsDocumentValidation) {
    const operationalState = createNextImobOperationalState(request.threadState?.operational ?? null, intent, message, nextThreadState.slots);
    return {
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
    };
  }

  if (parsedCatalogIntent.action && parsedCatalogIntent.entity && parsedCatalogIntent.action !== "create" && !["listing", "documents", "proposal", "visit", "lead", "contract", "deal", "commission"].includes(intent)) {
    if (shouldClarifyCatalogIntent(parsedCatalogIntent)) {
      const clarification = buildCatalogActionClarification(parsedCatalogIntent, semanticIntentSource);
      if (clarification) {
        return {
          ...clarification,
          threadLabel: getIntentThreadLabel(intent),
          conversationState: { ...nextThreadState, mode: "consult" },
        };
      }
    }

    const canonicalLabel = resolveCanonicalLabel(message);
    if (canonicalLabel) {
      return {
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
      };
    }
  }
  if (intent === "documents" && isDocumentUploadOnlyRequest(message)) {
    const operationalState = createNextImobOperationalState(request.threadState?.operational ?? null, intent, message, nextThreadState.slots);
    const presentationMeta = buildOperationalPresentationMeta(operationalState);
    return {
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
    };
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
  const operationalPendingLabels = operationalState
    ? operationalState.pendingFields.map((field) =>
        mapOperationalPendingFieldLabel(operationalState.flow, field, {
          leadPersona: operationalState.flow === "lead.qualify" ? (operationalState.leadDraft?.leadPersona ?? "lead") : null,
        })
      )
    : [];
  const executionRequest = buildOperationalExecution(intent, message, new Date().toISOString(), operationalState);
  const presentation = {
    ...buildOperationalPresentationMeta(operationalState),
    metadata: buildCatalogConfidenceMetadata(parsedCatalogIntent, false, { source: semanticIntentSource }),
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
              ? `Posso iniciar o cadastro do imóvel agora. Ainda preciso de: ${operationalPendingLabels.join(", ")}.`
              : "Posso iniciar o cadastro do imóvel agora."
            : operationalState?.flow === "owner.create"
              ? operationalPendingLabels.length > 0
                ? ""
                : "Cadastro do proprietário pronto para revisão."
              : "Posso iniciar a captação agora."
          : intent === "match"
            ? "Posso começar a busca de opções agora."
            : intent === "lead"
              ? operationalState?.flow === "lead.qualify" && operationalState.pendingFields.length > 0
                ? `Posso iniciar o cadastro ${getLeadPersonaCopy(operationalState.leadDraft).article} agora. Ainda preciso de: ${operationalPendingLabels.join(", ")}.`
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
                      ? `Posso preparar a proposta para ${getProposalPersonaCopy(operationalState.proposalDraft).singular} agora. Ainda preciso de: ${operationalPendingLabels.join(", ")}.`
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
                      : intent === "commission"
                      ? operationalState?.flow === "commission.settle" && operationalState.pendingFields.length > 0
                          ? `Posso iniciar a liquidação da comissão agora. Ainda preciso de: ${operationalState.pendingFields.join(", ")}.`
                          : "Posso iniciar a liquidação da comissão agora."
      : "Posso aplicar esse ajuste agora.",
  };

  if (presentation.form) {
    return {
      mode: "consult",
      action: executionRequest.action,
      threadLabel: getIntentThreadLabel(intent),
      conversationState: { slots: createEmptyImobSlots(), mode: "consult", pendingSlot: "none", resultOffset: 0, operational: operationalState },
      presentation,
    };
  }

  return {
    mode: "execute",
    action: executionRequest.action,
    threadLabel: getIntentThreadLabel(intent),
    conversationState: { slots: createEmptyImobSlots(), mode: "execute", pendingSlot: "none", resultOffset: 0, operational: operationalState },
    executionRequest,
    presentation,
  };
}
