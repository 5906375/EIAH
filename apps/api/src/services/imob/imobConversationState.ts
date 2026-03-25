import {
  createEmptyImobSlots,
  type ImobIntent,
  type ImobLeadDraft,
  type ImobOperationalState,
  type ImobListingDraft,
  type ImobDocumentDraft,
  type ImobContractDraft,
  type ImobDealDraft,
  type ImobOwnerDraft,
  type ImobPropertyDraft,
  type ImobProposalDraft,
  type ImobVisitDraft,
  type ImobPendingSlot,
  type ImobSearchSlots,
  type ImobThreadConversationState,
} from "./imobConversationContract";

export function normalizeImobText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function titleCaseWords(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

const NUMBER_WORDS: Record<string, number> = {
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
};

function readNumber(token?: string | null) {
  if (!token) return null;
  if (/^\d+$/.test(token)) return Number.parseInt(token, 10);
  return NUMBER_WORDS[token] ?? null;
}

function extractCount(text: string, label: "quarto" | "banheiro") {
  const digitMatch = text.match(new RegExp(`(\\d+)\\s+${label}`));
  if (digitMatch) return Number.parseInt(digitMatch[1], 10);
  const wordMatch = text.match(new RegExp(`\\b(um|uma|dois|duas|tres|quatro|cinco|seis)\\b\\s+${label}`));
  return readNumber(wordMatch?.[1] ?? null);
}

export function extractBudgetMax(text: string) {
  const normalized = text.replace(/\./g, "").replace(",", ".");
  const currencyMatch = normalized.match(/(?:ate|até)\s*r?\$?\s*(\d+(?:\.\d+)?)/);
  if (!currencyMatch) return null;
  return Number.parseFloat(currencyMatch[1]);
}

export function extractGoal(text: string): ImobSearchSlots["goal"] {
  if (text.includes("alug") || text.includes("loca")) return "locacao";
  if (text.includes("compr") || text.includes("venda")) return "venda";
  return null;
}

function extractPropertyType(text: string): ImobSearchSlots["propertyType"] {
  if (text.includes("apto") || text.includes("apart")) return "apartamento";
  if (text.includes("casa")) return "casa";
  if (text.includes("studio") || text.includes("kitnet")) return "studio";
  if (text.includes("sala")) return "sala";
  if (text.includes("terreno")) return "terreno";
  if (text.includes("galpao")) return "galpao";
  return null;
}

export function extractCity(text: string) {
  if (text.includes("balnepario camboriu") || text.includes("balneario camboriu") || text.includes("camboriu") || /\bbc\b/.test(text)) {
    return "Balneário Camboriú";
  }
  if (text.includes("itapema")) return "Itapema";
  if (text.includes("itajai")) return "Itajaí";
  if (text.includes("sao paulo")) return "São Paulo";
  if (text.includes("rio de janeiro")) return "Rio de Janeiro";
  const genericMatch = text.match(/(?:^|\s)em\s+([a-z]+(?:\s+[a-z]+){0,3})$/);
  if (genericMatch?.[1]) {
    const candidate = genericMatch[1].trim();
    if (!["valor", "faixa", "bairro", "centro", "praia", "quartos", "banheiros"].includes(candidate)) {
      return titleCaseWords(candidate);
    }
  }
  return null;
}

export function extractRegion(text: string) {
  if (text.includes("santa catarina") || /\bsc\b/.test(text)) return "Santa Catarina";
  if (text.includes("sao paulo") || /\bsp\b/.test(text)) return "São Paulo";
  if (text.includes("rio de janeiro") || /\brj\b/.test(text)) return "Rio de Janeiro";
  if (text.includes("sul")) return "Sul";
  if (text.includes("sudeste")) return "Sudeste";
  if (text.includes("nordeste")) return "Nordeste";
  return null;
}

function extractNeighborhood(text: string) {
  if (text.includes("centro")) return "Centro";
  if (text.includes("praia brava")) return "Praia Brava";
  if (text.includes("pinheiros")) return "Pinheiros";
  return null;
}

function isShortChoice(text: string) {
  return text.split(/\s+/).length <= 4;
}

function extractPendingSlotChoice(text: string): ImobPendingSlot | null {
  if (
    text.includes("por cidade") ||
    text.includes("por cidada") ||
    text.includes("por cidades") ||
    text.includes("seguir por cidade") ||
    text.includes("seguir por cidada") ||
    text.includes("seguir por cidades") ||
    text.includes("quais cidades") ||
    text.includes("que cidades") ||
    text === "cidade" ||
    text === "cidada" ||
    text === "cidades"
  ) {
    return "city";
  }
  if (
    text.includes("faixa de valor") ||
    text.includes("orcamento") ||
    text.includes("orçamento") ||
    (text === "valor" && isShortChoice(text))
  ) {
    return "budget";
  }
  if (
    text.includes("numero de quartos") ||
    text.includes("número de quartos") ||
    text.includes("quantos quartos") ||
    text === "quartos" ||
    text === "quarto"
  ) {
    return "bedrooms";
  }
  if (text === "banheiros" || text === "banheiro") {
    return "bathrooms";
  }
  if (text.includes("tipo de imovel") || text.includes("tipo de imóvel")) {
    return "propertyType";
  }
  return null;
}

function isContinueSearchMessage(text: string) {
  return (
    text.includes("ver mais opcoes") ||
    text.includes("ver mais opções") ||
    text.includes("buscar mais opcoes") ||
    text.includes("buscar mais opções")
  );
}

export function extractImobSearchSlots(message: string) {
  const text = normalizeImobText(message);
  return {
    goal: extractGoal(text),
    city: extractCity(text),
    region: extractRegion(text),
    neighborhood: extractNeighborhood(text),
    budgetMax: extractBudgetMax(text),
    bedrooms: extractCount(text, "quarto"),
    bathrooms: extractCount(text, "banheiro"),
    propertyType: extractPropertyType(text),
  } satisfies Partial<ImobSearchSlots>;
}

export function mergeImobSearchSlots(previous: ImobSearchSlots | undefined, incoming: Partial<ImobSearchSlots>) {
  const base = previous ?? createEmptyImobSlots();
  return {
    goal: incoming.goal ?? base.goal,
    city: incoming.city ?? base.city,
    region: incoming.region ?? base.region,
    neighborhood: incoming.neighborhood ?? base.neighborhood,
    budgetMax: incoming.budgetMax ?? base.budgetMax,
    bedrooms: incoming.bedrooms ?? base.bedrooms,
    bathrooms: incoming.bathrooms ?? base.bathrooms,
    propertyType: incoming.propertyType ?? base.propertyType,
  } satisfies ImobSearchSlots;
}

export function createNextImobThreadState(previous: ImobThreadConversationState | undefined, message: string) {
  const normalizedMessage = normalizeImobText(message);
  const extractedSlots = extractImobSearchSlots(message);
  const nextSlots = mergeImobSearchSlots(previous?.slots, extractedSlots);
  const explicitPendingSlot = extractPendingSlotChoice(normalizedMessage);
  const fulfilledPendingSlot = previous?.pendingSlot
    ? (previous.pendingSlot === "city" && Boolean(extractedSlots.city || extractedSlots.region)) ||
      (previous.pendingSlot === "budget" && extractedSlots.budgetMax !== null) ||
      (previous.pendingSlot === "bedrooms" && extractedSlots.bedrooms !== null) ||
      (previous.pendingSlot === "bathrooms" && extractedSlots.bathrooms !== null) ||
      (previous.pendingSlot === "propertyType" && extractedSlots.propertyType !== null)
    : false;
  const continuesSearch = isContinueSearchMessage(normalizedMessage);
  return {
    slots: nextSlots,
    mode: previous?.mode ?? "consult",
    pendingSlot: explicitPendingSlot ?? (fulfilledPendingSlot ? "none" : previous?.pendingSlot ?? "none"),
    resultOffset: continuesSearch ? (previous?.resultOffset ?? 0) + 2 : 0,
    operational: previous?.operational ?? null,
  } satisfies ImobThreadConversationState;
}

export function hasMeaningfulSearchFilters(slots: ImobSearchSlots) {
  return Boolean(slots.city || slots.neighborhood || slots.budgetMax || slots.bedrooms || slots.bathrooms);
}


function extractEmail(raw: string) {
  const match = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0].toLowerCase() : null;
}

function extractPhone(raw: string) {
  const match = raw.match(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?\d{4,5}[-\s]?\d{4}/);
  if (!match) return null;
  return match[0].replace(/\s+/g, " ").trim();
}

function extractDocument(raw: string) {
  const cpfLabeled = raw.match(/(?:cpf|documento)\s*:?\s*(\d{3}\.?\d{3}\.?\d{3}-?\d{2})/i);
  if (cpfLabeled) return cpfLabeled[1];
  const cnpjLabeled = raw.match(/(?:cnpj|documento)\s*:?\s*(\d{2}\.?\d{3}\.?\d{3}\/\d{4}-?\d{2})/i);
  if (cnpjLabeled) return cnpjLabeled[1];
  const cpfFormatted = raw.match(/\d{3}\.\d{3}\.\d{3}-\d{2}/);
  if (cpfFormatted) return cpfFormatted[0];
  const cnpjFormatted = raw.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/);
  return cnpjFormatted ? cnpjFormatted[0] : null;
}

function trimNamedPartyCandidate(value: string) {
  return value
    .replace(/\b(no|na)\s+(imovel|imóvel|apartamento|apto|casa)\b.*$/i, "")
    .replace(/\b(com|por)\s+(oferta|proposta|valor)\b.*$/i, "")
    .replace(/\bcom\s+documentos?\b.*$/i, "")
    .replace(/\b(email|telefone|cpf|cnpj|documento|whatsapp)\b.*$/i, "")
    .trim();
}

function extractNamedParty(message: string, role: "owner" | "lead") {
  const normalized = normalizeImobText(message);
  const patterns =
    role === "owner"
      ? [
          /(?:proprietario|proprietaria|dono)\s+([a-z]+(?:\s+[a-z]+){0,2})/,
          /(?:captar|cadastrar)\s+(?:proprietario\s+)?([a-z]+(?:\s+[a-z]+){0,2})/,
        ]
      : [
          /(?:lead|cliente|comprador|locatario)\s+([a-z]+(?:\s+[a-z]+){0,2})/,
          /(?:qualificar|atender)\s+(?:lead\s+)?([a-z]+(?:\s+[a-z]+){0,2})/,
        ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    const candidate = match?.[1] ? trimNamedPartyCandidate(match[1]) : null;
    if (candidate) return titleCaseWords(candidate);
  }
  return null;
}

function extractOfferAmount(raw: string) {
  const match = raw.match(/(?:oferta|proposta|valor)\s*(?:de|por)?\s*r?\$?\s*(\d+(?:[\.,]\d+)?)/i);
  if (!match) return null;
  return Number.parseFloat(match[1].replace(/\./g, "").replace(",", "."));
}

function inferContractType(raw: string): ImobProposalDraft["contractType"] {
  if (/loca|alug/i.test(raw)) return "rent";
  if (/gest|administra/i.test(raw)) return "management";
  if (/venda|compr|proposta|oferta|contrato/i.test(raw)) return "sale";
  return null;
}

function buildProposalDraft(previous: ImobProposalDraft | undefined, message: string): ImobProposalDraft {
  const propertyId = message.match(/(?:imovel|imóvel|apartamento|apto|casa)\s*#?\s*(\d{2,})/i)?.[1] ?? previous?.propertyId ?? null;
  return {
    buyerName: extractNamedParty(message, "lead") ?? previous?.buyerName ?? null,
    buyerEmail: extractEmail(message) ?? previous?.buyerEmail ?? null,
    buyerPhone: extractPhone(message) ?? previous?.buyerPhone ?? null,
    propertyId: propertyId ? `property-${propertyId}` : null,
    offerAmount: extractOfferAmount(message) ?? previous?.offerAmount ?? null,
    contractType: /loca|alug/i.test(message) ? "rent" : /gest|administra/i.test(message) ? "management" : /venda|compr|proposta|oferta/i.test(message) ? "sale" : previous?.contractType ?? null,
  };
}

function buildProposalPendingFields(draft: ImobProposalDraft) {
  const pending: string[] = [];
  if (!draft.buyerName) pending.push("buyerName");
  if (!draft.buyerPhone) pending.push("buyerPhone");
  if (!draft.propertyId) pending.push("propertyId");
  if (!draft.offerAmount) pending.push("offerAmount");
  if (!draft.contractType) pending.push("contractType");
  return pending;
}

function extractAddress(raw: string) {
  const match = raw.match(/(?:endereco|endereço)\s*:?[ ]*([^,.;\n]+(?:,[^.;\n]+)?)/i);
  return match?.[1]?.trim() ?? null;
}

function hasPropertyCaptureSignal(message: string, slots: ImobSearchSlots) {
  const normalized = normalizeImobText(message);
  return Boolean(
    slots.propertyType ||
      slots.city ||
      slots.neighborhood ||
      slots.bedrooms ||
      slots.bathrooms ||
      slots.goal ||
      extractAddress(message) ||
      /(?:imovel|imóvel|apartamento|apto|casa|studio|kitnet|terreno|galpao|galpão|sala)\s*#?\d*/.test(normalized)
  );
}

function buildPropertyDraft(previous: ImobPropertyDraft | undefined, message: string, slots: ImobSearchSlots): ImobPropertyDraft {
  const propertyIdMatch = message.match(/(?:imovel|imóvel|apartamento|apto|casa)\s*#?\s*(\d{2,})/i)?.[1] ?? null;
  return {
    propertyId: propertyIdMatch ? `property-${propertyIdMatch}` : previous?.propertyId ?? null,
    propertyType: slots.propertyType ?? previous?.propertyType ?? null,
    goal: slots.goal ?? previous?.goal ?? null,
    city: slots.city ?? previous?.city ?? null,
    neighborhood: slots.neighborhood ?? previous?.neighborhood ?? null,
    bedrooms: slots.bedrooms ?? previous?.bedrooms ?? null,
    bathrooms: slots.bathrooms ?? previous?.bathrooms ?? null,
    address: extractAddress(message) ?? previous?.address ?? null,
  };
}

function buildPropertyPendingFields(draft: ImobPropertyDraft) {
  const pending: string[] = [];
  if (!draft.propertyType) pending.push("propertyType");
  if (!draft.goal) pending.push("goal");
  if (!draft.city) pending.push("city");
  if (!draft.address) pending.push("address");
  return pending;
}

function buildOwnerDraft(previous: ImobOwnerDraft | undefined, message: string): ImobOwnerDraft {
  return {
    ownerName: extractNamedParty(message, "owner") ?? previous?.ownerName ?? null,
    ownerEmail: extractEmail(message) ?? previous?.ownerEmail ?? null,
    ownerPhone: extractPhone(message) ?? previous?.ownerPhone ?? null,
    ownerDocument: extractDocument(message) ?? previous?.ownerDocument ?? null,
  };
}

function buildLeadDraft(previous: ImobLeadDraft | undefined, message: string, slots: ImobSearchSlots): ImobLeadDraft {
  return {
    leadName: extractNamedParty(message, "lead") ?? previous?.leadName ?? null,
    leadEmail: extractEmail(message) ?? previous?.leadEmail ?? null,
    leadPhone: extractPhone(message) ?? previous?.leadPhone ?? null,
    desiredGoal: slots.goal ?? previous?.desiredGoal ?? null,
    desiredCity: slots.city ?? previous?.desiredCity ?? null,
    budgetMax: slots.budgetMax ?? previous?.budgetMax ?? null,
  };
}

function buildOwnerPendingFields(draft: ImobOwnerDraft) {
  const pending: string[] = [];
  if (!draft.ownerName) pending.push("ownerName");
  if (!draft.ownerPhone) pending.push("ownerPhone");
  if (!draft.ownerEmail) pending.push("ownerEmail");
  if (!draft.ownerDocument) pending.push("ownerDocument");
  return pending;
}

function buildLeadPendingFields(draft: ImobLeadDraft) {
  const pending: string[] = [];
  if (!draft.leadName) pending.push("leadName");
  if (!draft.leadPhone) pending.push("leadPhone");
  if (!draft.desiredGoal) pending.push("desiredGoal");
  if (!draft.desiredCity) pending.push("desiredCity");
  if (!draft.budgetMax) pending.push("budgetMax");
  return pending;
}

function extractPreferredDate(raw: string) {
  const iso = raw.match(/(20\d{2}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const dayMonth = raw.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (!dayMonth) return null;
  const day = dayMonth[1].padStart(2, "0");
  const month = dayMonth[2].padStart(2, "0");
  const year = dayMonth[3] ? dayMonth[3].padStart(4, "20") : String(new Date().getUTCFullYear());
  return `${year}-${month}-${day}`;
}

function extractPreferredWindow(raw: string): ImobVisitDraft["preferredWindow"] {
  const normalized = normalizeImobText(raw);
  if (normalized.includes("manha") || normalized.includes("manhã")) return "manha";
  if (normalized.includes("tarde")) return "tarde";
  if (normalized.includes("noite")) return "noite";
  return null;
}

function buildVisitDraft(previous: ImobVisitDraft | undefined, message: string): ImobVisitDraft {
  const propertyIdMatch = message.match(/(?:imovel|imóvel|apartamento|apto|casa)\s*#?\s*(\d{2,})/i)?.[1] ?? null;
  return {
    propertyId: propertyIdMatch ? `property-${propertyIdMatch}` : previous?.propertyId ?? null,
    visitorName: extractNamedParty(message, "lead") ?? previous?.visitorName ?? null,
    visitorPhone: extractPhone(message) ?? previous?.visitorPhone ?? null,
    preferredDate: extractPreferredDate(message) ?? previous?.preferredDate ?? null,
    preferredWindow: extractPreferredWindow(message) ?? previous?.preferredWindow ?? null,
  };
}

function buildVisitPendingFields(draft: ImobVisitDraft) {
  const pending: string[] = [];
  if (!draft.propertyId) pending.push("propertyId");
  if (!draft.visitorName) pending.push("visitorName");
  if (!draft.visitorPhone) pending.push("visitorPhone");
  if (!draft.preferredDate) pending.push("preferredDate");
  return pending;
}

function extractPriceAmount(raw: string) {
  const match = raw.match(/(?:valor|preco|preço)\s*(?:de|por)?\s*r?\$?\s*(\d+(?:[\.,]\d+)?)/i);
  if (!match) return null;
  return Number.parseFloat(match[1].replace(/\./g, "").replace(",", "."));
}

function extractListingTitle(raw: string) {
  const match = raw.match(/(?:titulo|título)\s*:?[ ]*(.+)$/i);
  if (!match?.[1]) return null;
  return match[1]
    .split(/\s+(?:no|na)\s+(?:portal|site|instagram)\b|\s+whatsapp\b|\s+(?:valor|preco|preço)\b|\s+para\s+(?:venda|locacao|locação)\b/i)[0]
    .trim() || null;
}

function extractPublicationChannels(raw: string) {
  const normalized = normalizeImobText(raw);
  const channels: string[] = [];
  if (normalized.includes("portal") || normalized.includes("portais")) channels.push("portal");
  if (normalized.includes("whatsapp") || normalized.includes("what")) channels.push("whatsapp");
  if (normalized.includes("instagram") || normalized.includes("insta")) channels.push("instagram");
  if (normalized.includes("site")) channels.push("site");
  return [...new Set(channels)];
}

function buildListingDraft(previous: ImobListingDraft | undefined, message: string, slots: ImobSearchSlots): ImobListingDraft {
  const propertyIdMatch = message.match(/(?:imovel|imóvel|apartamento|apto|casa)\s*#?\s*(\d{2,})/i)?.[1] ?? null;
  return {
    propertyId: propertyIdMatch ? `property-${propertyIdMatch}` : previous?.propertyId ?? null,
    listingTitle: extractListingTitle(message) ?? previous?.listingTitle ?? null,
    publicationChannels: (() => {
      const next = extractPublicationChannels(message);
      return next.length > 0 ? next : previous?.publicationChannels ?? [];
    })(),
    askingPrice: extractPriceAmount(message) ?? previous?.askingPrice ?? null,
    publicationGoal: slots.goal ?? previous?.publicationGoal ?? null,
  };
}

function buildListingPendingFields(draft: ImobListingDraft) {
  const pending: string[] = [];
  if (!draft.propertyId) pending.push("propertyId");
  if (!draft.listingTitle) pending.push("listingTitle");
  if (!draft.publicationGoal) pending.push("publicationGoal");
  if (draft.publicationChannels.length === 0) pending.push("publicationChannels");
  return pending;
}

function extractDocumentTypes(raw: string) {
  const normalized = normalizeImobText(raw);
  const documentTypes: string[] = [];
  if (normalized.includes("matricula") || normalized.includes("matrícula")) documentTypes.push("matricula");
  if (normalized.includes("cpf")) documentTypes.push("cpf");
  if (normalized.includes("cnpj")) documentTypes.push("cnpj");
  if (normalized.includes("rg")) documentTypes.push("rg");
  if (normalized.includes("escritura")) documentTypes.push("escritura");
  if (normalized.includes("comprovante")) documentTypes.push("comprovante_residencia");
  if (normalized.includes("renda")) documentTypes.push("comprovante_renda");
  if (normalized.includes("contrato social")) documentTypes.push("contrato_social");
  return [...new Set(documentTypes)];
}

function extractDocumentSubjectType(raw: string): ImobDocumentDraft["subjectType"] {
  const normalized = normalizeImobText(raw);
  if (normalized.includes("propriet")) return "owner";
  if (normalized.includes("lead") || normalized.includes("cliente") || normalized.includes("comprador") || normalized.includes("locatario")) return "lead";
  if (normalized.includes("proposta") || normalized.includes("oferta")) return "proposal";
  if (normalized.includes("contrato") || normalized.includes("minuta")) return "contract";
  if (normalized.includes("imovel") || normalized.includes("imóvel") || normalized.includes("apartamento") || normalized.includes("apto") || normalized.includes("casa")) return "property";
  return null;
}

function extractDocumentDeliveryChannel(raw: string): ImobDocumentDraft["deliveryChannel"] {
  const normalized = normalizeImobText(raw);
  if (normalized.includes("upload") || normalized.includes("anexo") || normalized.includes("arquivo")) return "upload";
  if (normalized.includes("email") || normalized.includes("e-mail")) return "email";
  if (normalized.includes("whatsapp") || normalized.includes("what")) return "whatsapp";
  if (normalized.includes("drive")) return "drive";
  return null;
}

function buildDocumentDraft(previous: ImobDocumentDraft | undefined, message: string): ImobDocumentDraft {
  const propertyIdMatch = message.match(/(?:imovel|imóvel|apartamento|apto|casa)\s*#?\s*(\d{2,})/i)?.[1] ?? null;
  const referenceId = propertyIdMatch ? `property-${propertyIdMatch}` : previous?.referenceId ?? null;
  return {
    referenceId,
    subjectType: extractDocumentSubjectType(message) ?? previous?.subjectType ?? null,
    documentTypes: (() => {
      const next = extractDocumentTypes(message);
      return next.length > 0 ? next : previous?.documentTypes ?? [];
    })(),
    deliveryChannel: extractDocumentDeliveryChannel(message) ?? previous?.deliveryChannel ?? null,
  };
}

function buildDocumentPendingFields(draft: ImobDocumentDraft) {
  const pending: string[] = [];
  if (!draft.subjectType) pending.push("subjectType");
  if (draft.documentTypes.length === 0) pending.push("documentTypes");
  if (!draft.deliveryChannel) pending.push("deliveryChannel");
  return pending;
}

function extractDocumentPacketStatus(raw: string): ImobContractDraft["documentPacketStatus"] {
  const normalized = normalizeImobText(raw);
  if (normalized.includes("documentos completos") || normalized.includes("docs completos") || normalized.includes("checklist completo") || normalized.includes("pacote pronto")) return "ready";
  if (normalized.includes("documentos pendentes") || normalized.includes("docs pendentes") || normalized.includes("faltando documento") || normalized.includes("pendencia documental")) return "pending";
  return null;
}

function buildContractDraft(previous: ImobContractDraft | undefined, message: string): ImobContractDraft {
  const propertyIdMatch = message.match(/(?:imovel|imóvel|apartamento|apto|casa)\s*#?\s*(\d{2,})/i)?.[1] ?? null;
  return {
    propertyId: propertyIdMatch ? `property-${propertyIdMatch}` : previous?.propertyId ?? null,
    ownerName: extractNamedParty(message, "owner") ?? previous?.ownerName ?? null,
    counterpartyName: extractNamedParty(message, "lead") ?? previous?.counterpartyName ?? null,
    contractType: inferContractType(message) ?? previous?.contractType ?? null,
    documentPacketStatus: extractDocumentPacketStatus(message) ?? previous?.documentPacketStatus ?? null,
    handoffTarget: "LEGAL",
    approvalRequired: true,
  };
}

function buildContractPendingFields(draft: ImobContractDraft) {
  const pending: string[] = [];
  if (!draft.propertyId) pending.push("propertyId");
  if (!draft.counterpartyName) pending.push("counterpartyName");
  if (!draft.contractType) pending.push("contractType");
  if (!draft.documentPacketStatus) pending.push("documentPacketStatus");
  return pending;
}

function extractReviewStage(raw: string): ImobDealDraft["reviewStage"] {
  const normalized = normalizeImobText(raw);
  if (normalized.includes("fechamento") || normalized.includes("closing")) return "closing";
  if (normalized.includes("contrato") || normalized.includes("minuta")) return "contract";
  if (normalized.includes("document") || normalized.includes("matricula") || normalized.includes("matrícula")) return "documentation";
  if (normalized.includes("proposta") || normalized.includes("oferta")) return "proposal";
  return null;
}

function extractDealBlockers(raw: string) {
  const normalized = normalizeImobText(raw);
  const blockers: string[] = [];
  if (normalized.includes("documentos pendentes") || normalized.includes("faltando documento") || normalized.includes("pendencia documental")) blockers.push("document_packet_pending");
  if (normalized.includes("juridico") || normalized.includes("jurídico") || normalized.includes("minuta pendente") || normalized.includes("aprovacao juridica")) blockers.push("legal_review_pending");
  if (normalized.includes("comissao pendente") || normalized.includes("repasse pendente") || normalized.includes("pagamento pendente")) blockers.push("financial_pending");
  if (normalized.includes("aprovação humana") || normalized.includes("aprovacao humana") || normalized.includes("review humano")) blockers.push("human_approval_required");
  return [...new Set(blockers)];
}

function inferDealHandoffTarget(stage: ImobDealDraft["reviewStage"], blockers: string[]): ImobDealDraft["handoffTarget"] {
  if (blockers.includes("legal_review_pending") || stage === "contract") return "LEGAL";
  if (blockers.includes("financial_pending") || stage === "closing") return "FINANCE";
  return "IMOB_OPS";
}

function buildDealDraft(previous: ImobDealDraft | undefined, message: string): ImobDealDraft {
  const dealIdMatch = message.match(/(?:deal|negocio|negócio)\s*#?\s*(\d{2,})/i)?.[1] ?? null;
  const propertyIdMatch = message.match(/(?:imovel|imóvel|apartamento|apto|casa)\s*#?\s*(\d{2,})/i)?.[1] ?? null;
  const blockers = (() => {
    const next = extractDealBlockers(message);
    return next.length > 0 ? next : previous?.blockers ?? [];
  })();
  const reviewStage = extractReviewStage(message) ?? previous?.reviewStage ?? null;
  return {
    dealId: dealIdMatch ? `deal-${dealIdMatch}` : previous?.dealId ?? null,
    propertyId: propertyIdMatch ? `property-${propertyIdMatch}` : previous?.propertyId ?? null,
    reviewStage,
    blockers,
    handoffTarget: inferDealHandoffTarget(reviewStage, blockers),
    approvalRequired: true,
  };
}

function buildDealPendingFields(draft: ImobDealDraft) {
  const pending: string[] = [];
  if (!draft.dealId && !draft.propertyId) pending.push("dealReference");
  if (!draft.reviewStage) pending.push("reviewStage");
  if (draft.blockers.length === 0) pending.push("blockers");
  return pending;
}

export function createNextImobOperationalState(
  previous: ImobOperationalState | undefined | null,
  intent: ImobIntent,
  message: string,
  slots: ImobSearchSlots
): ImobOperationalState | null {
  if (intent === "capture") {
    if (hasPropertyCaptureSignal(message, slots)) {
      const draft = buildPropertyDraft(previous?.flow === "property.create" ? previous.propertyDraft : undefined, message, slots);
      const pendingFields = buildPropertyPendingFields(draft);
      return {
        flow: "property.create",
        status: pendingFields.length === 0 ? "ready_for_review" : "collecting",
        pendingFields,
        propertyDraft: draft,
      };
    }
    const draft = buildOwnerDraft(previous?.flow === "owner.create" ? previous.ownerDraft : undefined, message);
    const pendingFields = buildOwnerPendingFields(draft);
    return {
      flow: "owner.create",
      status: pendingFields.length === 0 ? "ready_for_review" : "collecting",
      pendingFields,
      ownerDraft: draft,
    };
  }
  if (intent === "lead" || intent === "match") {
    const draft = buildLeadDraft(previous?.flow === "lead.qualify" ? previous.leadDraft : undefined, message, slots);
    const pendingFields = buildLeadPendingFields(draft);
    return {
      flow: "lead.qualify",
      status: pendingFields.length === 0 ? "ready_for_review" : "collecting",
      pendingFields,
      leadDraft: draft,
    };
  }
  if (intent === "visit") {
    const draft = buildVisitDraft(previous?.flow === "visit.schedule" ? previous.visitDraft : undefined, message);
    const pendingFields = buildVisitPendingFields(draft);
    return {
      flow: "visit.schedule",
      status: pendingFields.length === 0 ? "ready_for_review" : "collecting",
      pendingFields,
      visitDraft: draft,
    };
  }
  if (intent === "listing") {
    const draft = buildListingDraft(previous?.flow === "listing.activate" ? previous.listingDraft : undefined, message, slots);
    const pendingFields = buildListingPendingFields(draft);
    return {
      flow: "listing.activate",
      status: pendingFields.length === 0 ? "ready_for_review" : "collecting",
      pendingFields,
      listingDraft: draft,
    };
  }
  if (intent === "documents") {
    const draft = buildDocumentDraft(previous?.flow === "documents.collect" ? previous.documentDraft : undefined, message);
    const pendingFields = buildDocumentPendingFields(draft);
    return {
      flow: "documents.collect",
      status: pendingFields.length === 0 ? "ready_for_review" : "collecting",
      pendingFields,
      documentDraft: draft,
    };
  }
  if (intent === "deal") {
    const draft = buildDealDraft(previous?.flow === "deal.review" ? previous.dealDraft : undefined, message);
    const pendingFields = buildDealPendingFields(draft);
    return {
      flow: "deal.review",
      status: pendingFields.length === 0 ? "ready_for_review" : "collecting",
      pendingFields,
      dealDraft: draft,
    };
  }
  if (intent === "contract") {
    const draft = buildContractDraft(previous?.flow === "contract.prepare" ? previous.contractDraft : undefined, message);
    const pendingFields = buildContractPendingFields(draft);
    return {
      flow: "contract.prepare",
      status: pendingFields.length === 0 ? "ready_for_review" : "collecting",
      pendingFields,
      contractDraft: draft,
    };
  }
  if (intent === "proposal") {
    const draft = buildProposalDraft(previous?.flow === "proposal.create" ? previous.proposalDraft : undefined, message);
    const pendingFields = buildProposalPendingFields(draft);
    return {
      flow: "proposal.create",
      status: pendingFields.length === 0 ? "ready_for_review" : "collecting",
      pendingFields,
      proposalDraft: draft,
    };
  }
  return previous ?? null;
}
