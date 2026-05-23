import {
  createEmptyImobSlots,
  type ImobLeadBudgetFlexibility,
  type ImobLeadDecisionMaker,
  type ImobLeadDiscoverySignalKey,
  type ImobLeadDiscoverySignals,
  type ImobIntent,
  type ImobLeadDraft,
  type ImobLeadPersona,
  type ImobOwnerPersona,
  type ImobOperationalState,
  type ImobListingDraft,
  type ImobDocumentDraft,
  type ImobContractDraft,
  type ImobRulesDraft,
  type ImobDealDraft,
  type ImobCommissionDraft,
  type ImobOwnerDraft,
  type ImobPropertyDraft,
  type ImobMarketScanContext,
  type ImobMarketScanResultItem,
  type ImobMarketScanSelection,
  type ImobProposalDraft,
  type ImobVisitDraft,
  type ImobPendingSlot,
  type ImobSearchSlots,
  type ImobThreadConversationState,
} from "./imobConversationContract";
import {
  findImobCrmPropertyTypeInText,
  IMOB_CRM_PROPERTY_TYPE_OPTIONS,
  normalizeImobCrmPropertyType,
  type ImobCrmPropertyType,
} from "./crm/imobCrmPropertyTypes";
import {
  canonicalizeImobCity,
  canonicalizeImobCityName,
} from "./imobGeoCanonicalizer";

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
  const normalized = text.replace(/\./g, "").replace(/,/g, ".");
  const patterns = [
    /(?:ate|até)\s*r?\$?\s*(\d+(?:\.\d+)?)/,
    /(?:orcamento|orçamento|budget|faixa)(?:\s+(?:de|do|da|em|ate|até|para|por|lead|comprador|locatario|locatário|cliente|orçamento))*\s*r?\$?\s*(\d+(?:\.\d+)?)/,
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match?.[1]) return Number.parseFloat(match[1]);
  }
  return null;
}

function parsePriceValue(raw: string, magnitude?: string | null) {
  const normalized = raw.replace(/\./g, "").replace(/,/g, ".");
  const base = Number.parseFloat(normalized);
  if (!Number.isFinite(base)) return null;
  if (!magnitude) return base;
  if (magnitude.startsWith("milh")) return base * 1_000_000;
  if (magnitude === "mil") return base * 1_000;
  return base;
}

export function extractMarketScanPriceRange(text: string, goals: string[]) {
  const normalized = normalizeImobText(text).replace(/\./g, "").replace(/,/g, ".");
  const betweenMatch = normalized.match(
    /(?:entre|de)\s*r?\$?\s*(\d+(?:\.\d+)?)\s*(mil|milhao|milhoes)?\s*(?:e|a)\s*r?\$?\s*(\d+(?:\.\d+)?)\s*(mil|milhao|milhoes)?/i,
  );
  const upToMatch = normalized.match(/(?:ate|maximo|maximo de|no maximo)\s*r?\$?\s*(\d+(?:\.\d+)?)\s*(mil|milhao|milhoes)?/i);

  let min: number | null = null;
  let max: number | null = null;
  if (betweenMatch) {
    min = parsePriceValue(betweenMatch[1], betweenMatch[2]);
    max = parsePriceValue(betweenMatch[3], betweenMatch[4]);
  } else if (upToMatch) {
    max = parsePriceValue(upToMatch[1], upToMatch[2]);
  } else {
    max = extractBudgetMax(text);
  }

  if (min === null && max === null) return null;

  const period: NonNullable<ImobMarketScanContext["priceRange"]>["period"] =
    normalized.includes("diaria") || normalized.includes("por dia")
      ? "daily"
      : goals.length === 1 && goals[0] === "locacao"
        ? "monthly"
        : goals.every((goal) => goal === "compra" || goal === "venda")
          ? "total"
          : null;

  return {
    min,
    max,
    currency: "BRL" as const,
    period,
    confidence: "high" as const,
    ambiguityReason: null,
  };
}

export function extractGoal(text: string): ImobSearchSlots["goal"] {
  if (text.includes("temporada")) return "aluguel_por_temporada";
  if (text.includes("alug") || text.includes("loca")) return "locacao";
  if (text.includes("compr") || text.includes("vend")) return "venda";
  return null;
}

export function extractGoalCandidates(text: string) {
  const normalized = normalizeImobText(text);
  const candidates: string[] = [];
  const hasSeasonalGoal = normalized.includes("temporada");
  const hasExplicitLongTermRent =
    normalized.includes("locacao anual") ||
    normalized.includes("locação anual") ||
    normalized.includes("aluguel anual") ||
    normalized.includes("locacao mensal") ||
    normalized.includes("locação mensal") ||
    normalized.includes("aluguel mensal");
  if (normalized.includes("compr")) candidates.push("compra");
  if (normalized.includes("vend")) candidates.push("venda");
  if ((normalized.includes("alug") || normalized.includes("loca")) && (!hasSeasonalGoal || hasExplicitLongTermRent)) {
    candidates.push("locacao");
  }
  if (hasSeasonalGoal) candidates.push("aluguel_por_temporada");
  return Array.from(new Set(candidates));
}

export function normalizeMarketScanGoalCandidates(goals: string[]) {
  return Array.from(new Set(goals.map((goal) => {
    if (goal === "locação") return "locacao";
    return normalizeImobText(goal);
  }))).sort((left, right) => left.localeCompare(right));
}

function extractPropertyType(text: string): ImobSearchSlots["propertyType"] {
  return findImobCrmPropertyTypeInText(text);
}

export function extractMarketScanPropertyTypes(text: string) {
  const normalized = normalizeImobText(text);
  const propertyTypes = new Set<ImobCrmPropertyType>();
  for (const option of IMOB_CRM_PROPERTY_TYPE_OPTIONS) {
    const synonyms = [option.value, option.label, ...option.synonyms];
    if (synonyms.some((synonym) => {
      const normalizedSynonym = normalizeImobText(synonym);
      return new RegExp(`(^|[^a-z0-9])${normalizedSynonym.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i").test(normalized);
    })) {
      const canonical = normalizeImobCrmPropertyType(option.value);
      if (canonical) propertyTypes.add(canonical);
    }
  }
  return Array.from(propertyTypes).sort((left, right) => left.localeCompare(right));
}

export function extractMarketScanBedrooms(text: string) {
  const normalized = normalizeImobText(text);
  const matches = normalized.matchAll(/\b(\d+|um|uma|dois|duas|tres|quatro|cinco|seis)\b\s+quartos?\b/g);
  const values = new Set<number>();
  for (const match of matches) {
    const count = readNumber(match[1] ?? null);
    if (typeof count === "number") values.add(count);
  }
  return Array.from(values).sort((left, right) => left - right);
}

export function extractCity(text: string) {
  const explicitCityMatch = text.match(
    /(?:cidade(?:\s+de\s+interesse)?(?:\s+do\s+(?:lead|imovel|imóvel))?)\s*:?\s*([a-z]+(?:\s+[a-z]+){0,4})/i,
  );
  if (explicitCityMatch?.[1]) {
    const rawCandidate = explicitCityMatch[1]
      .split(/\b(?:faixa|orcamento|orçamento|telefone|email|e-mail|documento|endereco|endereço|tipo|finalidade)\b/i)[0]
      ?.trim();
    if (rawCandidate && rawCandidate.length >= 2) {
      return canonicalizeImobCityName(rawCandidate);
    }
  }
  if (text.includes("balnepario camboriu") || text.includes("balneario camboriu") || /\bbc\b/.test(text)) {
    return "Balneário Camboriú";
  }
  if (text.includes("camboriu")) return "Camboriú";
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

export function extractCityCandidates(text: string) {
  const normalizedText = normalizeImobText(text);
  const candidates: string[] = [];
  const hasBalnearioCamboriu = normalizedText.includes("balnepario camboriu") || normalizedText.includes("balneario camboriu") || /\bbc\b/.test(normalizedText);
  const explicitCityMatch = normalizedText.match(
    /(?:cidade(?:\s+de\s+interesse)?(?:\s+do\s+(?:lead|imovel|imóvel))?)\s*:?\s*([a-z]+(?:\s+[a-z]+){0,8})/i,
  );
  if (explicitCityMatch?.[1]) {
    const values = explicitCityMatch[1]
      .split(/\b(?:faixa|orcamento|orçamento|telefone|email|e-mail|documento|endereco|endereço|tipo|finalidade)\b/i)[0]
      ?.split(/\s*(?:,| e )\s*/i)
      .map((item) => item.trim())
      .filter(Boolean) ?? [];
    for (const value of values) {
      const canonical = canonicalizeImobCityName(value);
      if (canonical) candidates.push(canonical);
    }
  }
  if (hasBalnearioCamboriu) {
    candidates.push("Balneário Camboriú");
  }
  if (normalizedText.includes("camboriu") && !hasBalnearioCamboriu) candidates.push("Camboriú");
  if (normalizedText.includes("itapema")) candidates.push("Itapema");
  if (normalizedText.includes("itajai")) candidates.push("Itajaí");
  if (normalizedText.includes("sao paulo")) candidates.push("São Paulo");
  if (normalizedText.includes("rio de janeiro")) candidates.push("Rio de Janeiro");
  return Array.from(new Set(candidates)).sort((left, right) => left.localeCompare(right));
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
  const cpfLabeled = raw.match(
    /(?:cpf|documento)(?:\s+do\s+(?:proprietario|proprietário|proprietária|proprietaria|vendedor|locador))?\s*:?\s*(\d{3}\.?\d{3}\.?\d{3}-?\d{2}|\d{11})/i
  );
  if (cpfLabeled) return cpfLabeled[1];
  const cnpjLabeled = raw.match(
    /(?:cnpj|documento)(?:\s+do\s+(?:proprietario|proprietário|proprietária|proprietaria|vendedor|locador))?\s*:?\s*(\d{2}\.?\d{3}\.?\d{3}\/\d{4}-?\d{2}|\d{14})/i
  );
  if (cnpjLabeled) return cnpjLabeled[1];
  const cpfFormatted = raw.match(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/);
  if (cpfFormatted) return cpfFormatted[0];
  const cnpjFormatted = raw.match(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/);
  return cnpjFormatted ? cnpjFormatted[0] : null;
}

function trimNamedPartyCandidate(value: string) {
  const trimmed = value
    .replace(/^(?:chamado|chamada|nomeado|nomeada)\s+/i, "")
    .replace(/\b(no|na)\s+(imovel|imóvel|apartamento|apto|casa)\b.*$/i, "")
    .replace(/\b(com|por)\s+(oferta|proposta|valor)\b.*$/i, "")
    .replace(/\bcom\s+documentos?\b.*$/i, "")
    .replace(/\b(email|telefone|cpf|cnpj|documento|whatsapp)\b.*$/i, "")
    .trim();
  const normalized = normalizeImobText(trimmed);
  if (
    !trimmed
    || [
      "proprietario",
      "proprietaria",
      "dono",
      "lead",
      "cliente",
      "comprador",
      "locatario",
      "existente",
      "novo",
      "um proprietario",
      "uma proprietaria",
      "um dono",
      "um lead",
      "um cliente",
      "um comprador",
      "um locatario",
      "cadastro",
      "caso",
      "do caso",
      "do lead do",
      "a um imovel",
      "um imovel",
      "imovel",
    ].includes(normalized)
    || /^(?:este|esse|deste|desse|nesse)\s+caso$/.test(normalized)
  ) return "";
  return trimmed;
}

function extractNamedParty(message: string, role: "owner" | "lead") {
  const normalized = normalizeImobText(message);
  if (role === "lead" && /\b(?:este|esse|deste|desse|nesse)\s+caso\b/.test(normalized)) {
    return null;
  }
  if (role === "lead" && normalized.includes("vincular") && normalized.includes("lead") && normalized.includes("imovel")) {
    return null;
  }
  const patterns =
    role === "owner"
      ? [
          /(?:proprietario|proprietaria|dono)\s+([a-z]+(?:\s+[a-z]+){0,2})/,
          /(?:captar|cadastrar)\s+(?:um\s+|uma\s+)?(?:proprietario\s+|proprietaria\s+|dono\s+)?([a-z]+(?:\s+[a-z]+){0,2})/,
        ]
      : [
          /(?:lead|cliente|comprador|locatario)\s+(?:chamado|chamada|nomeado|nomeada)\s+([a-z]+(?:\s+[a-z]+){0,2})/,
          /(?:lead|cliente|comprador|locatario)\s+([a-z]+(?:\s+[a-z]+){0,2})/,
          /(?:qualificar|atender)\s+(?:um\s+|uma\s+)?(?:lead\s+|cliente\s+|comprador\s+|locatario\s+)?(?:chamado|chamada|nomeado|nomeada)\s+([a-z]+(?:\s+[a-z]+){0,2})/,
          /(?:qualificar|atender)\s+(?:um\s+|uma\s+)?(?:lead\s+|cliente\s+|comprador\s+|locatario\s+)?([a-z]+(?:\s+[a-z]+){0,2})/,
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
  const propertyIdMatch = message.match(/(?:imovel|imóvel|apartamento|apto|casa)\s*#?\s*(\d{2,})/i)?.[1] ?? null;
  return {
    buyerName: extractNamedParty(message, "lead") ?? previous?.buyerName ?? null,
    buyerEmail: extractEmail(message) ?? previous?.buyerEmail ?? null,
    buyerPhone: extractPhone(message) ?? previous?.buyerPhone ?? null,
    propertyId: propertyIdMatch ? `property-${propertyIdMatch}` : previous?.propertyId ?? null,
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
  const match = raw.match(/(?:endereco|endereço)(?: do imovel| do imóvel)?\s*:?[ ]*([^,.;\n]+(?:,[^.;\n]+)?)/i);
  return match?.[1]?.trim() ?? null;
}

function formatCep(raw: string) {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length !== 8) return digits || null;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function extractCep(raw: string) {
  const labeled = raw.match(/(?:\bcep\b)(?:\s+do\s+imovel|\s+do\s+imóvel)?\s*:?\s*(\d{5}-?\d{3})/i);
  if (labeled?.[1]) return formatCep(labeled[1]);
  const generic = raw.match(/\b\d{5}-?\d{3}\b/);
  return generic?.[0] ? formatCep(generic[0]) : null;
}

function hasPropertyCaptureSignal(message: string, slots: ImobSearchSlots) {
  const normalized = normalizeImobText(message);
  const hasOwnerOnlyContext =
    (normalized.includes("propriet") || normalized.includes("vendedor") || normalized.includes("locador"))
    && !/(imovel|imóvel|imoveis|imóveis|apartamento|apartamentos|apto|aptos|casa|casas|studio|studios|kitnet|kitnets|terreno|terrenos|galpao|galpão|galpoes|galpões|sala|salas)/.test(normalized);
  if (hasOwnerOnlyContext) return false;
  const explicitPropertySignal = Boolean(
    slots.propertyType ||
      slots.city ||
      slots.neighborhood ||
      slots.bedrooms ||
      slots.bathrooms ||
      extractAddress(message) ||
      /(?:imovel|imóvel|imoveis|imóveis|apartamento|apartamentos|apto|aptos|casa|casas|studio|studios|kitnet|kitnets|terreno|terrenos|galpao|galpão|galpoes|galpões|sala|salas)\s*#?\d*/.test(normalized)
  );
  if (normalized.includes("locador") || normalized.includes("locadora")) {
    return explicitPropertySignal;
  }
  return Boolean(explicitPropertySignal || slots.goal);
}

function hasExplicitOwnerCreateRequest(message: string) {
  const normalized = normalizeImobText(message);
  const wantsCreate = normalized.includes("cadastrar")
    || normalized.includes("cadastro")
    || normalized.includes("incluir")
    || normalized.includes("registrar");
  const hasOwner = normalized.includes("proprietario")
    || normalized.includes("proprietaria")
    || normalized.includes("locador")
    || normalized.includes("vendedor")
    || normalized.includes("dono");
  return wantsCreate && hasOwner;
}

function buildPropertyDraft(previous: ImobPropertyDraft | undefined, message: string, slots: ImobSearchSlots): ImobPropertyDraft {
  const propertyIdMatch = message.match(/(?:imovel|imóvel|apartamento|apto|casa)\s*#?\s*(\d{2,})/i)?.[1] ?? null;
  const lockedCityCanonical = previous?.cityCanonical?.locked
    ? previous.cityCanonical
    : previous?.origin?.scanId && previous?.city
      ? canonicalizeImobCity(previous.city, {
        source: previous.origin.providerId === "tenant_inventory_import" ? "tenant_inventory" : "scan",
        locked: true,
      })
      : null;
  const incomingCityCanonical = lockedCityCanonical
    ?? canonicalizeImobCity(slots.city ?? previous?.city ?? null, {
      source: previous?.cityCanonical?.source ?? "user",
      locked: previous?.cityCanonical?.locked ?? false,
    });
  return {
    propertyId: propertyIdMatch ? `property-${propertyIdMatch}` : previous?.propertyId ?? null,
    propertyType: slots.propertyType ?? previous?.propertyType ?? null,
    goal: slots.goal ?? previous?.goal ?? null,
    cep: extractCep(message) ?? previous?.cep ?? null,
    city: lockedCityCanonical?.canonicalName ?? incomingCityCanonical?.canonicalName ?? null,
    cityCanonical: lockedCityCanonical ?? incomingCityCanonical,
    neighborhood: slots.neighborhood ?? previous?.neighborhood ?? null,
    bedrooms: slots.bedrooms ?? previous?.bedrooms ?? null,
    bathrooms: slots.bathrooms ?? previous?.bathrooms ?? null,
    address: extractAddress(message) ?? previous?.address ?? null,
    origin: previous?.origin ?? null,
  };
}

function extractMarketScanSelectionSourceId(message: string) {
  const normalized = normalizeImobText(message);
  const match = normalized.match(
    /(?:selecionar|usar|salvar|confirmar)\s+(?:imovel|imóvel|item)?(?:\s+do\s+scan)?\s+([a-z0-9][a-z0-9:_-]+)/i,
  );
  return match?.[1]?.trim() ?? null;
}

function extractMarketScanSelectionOrdinal(message: string) {
  const normalized = normalizeImobText(message);
  const match = normalized.match(
    /(?:selecionar|usar|salvar)\s+(?:imovel|imóvel|item)\s+(\d+)(?:\s+do\s+scan)?/i,
  );
  const ordinal = Number(match?.[1]);
  return Number.isInteger(ordinal) && ordinal > 0 ? ordinal : null;
}

function findMarketScanItemBySourceId(
  snapshot: ImobOperationalState["marketScanSnapshot"] | undefined,
  sourceId: string | null,
): ImobMarketScanResultItem | null {
  if (!snapshot || !sourceId) return null;
  for (const group of snapshot.groups) {
    const item = group.items.find((candidate) => candidate.sourceId.toLowerCase() === sourceId.toLowerCase());
    if (item) return item;
  }
  return null;
}

function findMarketScanItemByOrdinal(
  snapshot: ImobOperationalState["marketScanSnapshot"] | undefined,
  ordinal: number | null,
): ImobMarketScanResultItem | null {
  if (!snapshot || !ordinal) return null;
  const items = snapshot.groups.flatMap((group) => group.items);
  return items[ordinal - 1] ?? null;
}

function buildMarketScanSelection(
  snapshot: ImobOperationalState["marketScanSnapshot"] | undefined,
  item: ImobMarketScanResultItem | null,
): ImobMarketScanSelection | null {
  if (!snapshot || !item) return null;
  return {
    status: "pending_confirmation",
    scanId: snapshot.scanId,
    source: item.source,
    sourceId: item.sourceId,
    providerId: item.providerId,
    retrievedAt: item.retrievedAt,
    city: item.city,
    goal: item.goal,
    propertyType: item.propertyType ?? null,
    bedrooms: item.bedrooms ?? null,
    price: item.price ?? null,
    currency: item.currency ?? null,
    neighborhood: item.neighborhood ?? null,
    address: item.address ?? null,
    title: item.title ?? null,
    url: item.url ?? null,
  };
}

function sanitizeMarketScanAddress(address: string | null | undefined) {
  const normalized = typeof address === "string" ? address.trim() : "";
  if (!normalized) return null;

  return normalized
    .replace(/\s+(?:proprietari[oa]|owner)\b.*$/i, "")
    .replace(/\s+(?:valor|preco|preço)\b.*$/i, "")
    .trim() || null;
}

function buildPropertyDraftFromMarketScanSelection(
  previous: ImobPropertyDraft | undefined,
  selection: ImobMarketScanSelection,
): ImobPropertyDraft {
  const cityCanonical = canonicalizeImobCity(selection.city ?? previous?.city ?? null, {
    source: selection.providerId === "tenant_inventory_import" ? "tenant_inventory" : "scan",
    locked: true,
  });
  return {
    propertyId: selection.sourceId,
    propertyType: selection.propertyType ?? previous?.propertyType ?? null,
    goal: (selection.goal as ImobPropertyDraft["goal"]) ?? previous?.goal ?? null,
    cep: previous?.cep ?? null,
    city: cityCanonical?.canonicalName ?? previous?.city ?? null,
    cityCanonical: cityCanonical ?? previous?.cityCanonical ?? null,
    neighborhood: selection.neighborhood ?? previous?.neighborhood ?? null,
    bedrooms: selection.bedrooms ?? previous?.bedrooms ?? null,
    bathrooms: previous?.bathrooms ?? null,
    address: sanitizeMarketScanAddress(selection.address) ?? previous?.address ?? null,
    origin: {
      source: selection.source,
      sourceId: selection.sourceId,
      providerId: selection.providerId,
      retrievedAt: selection.retrievedAt,
      scanId: selection.scanId,
    },
  };
}

function isMarketScanRequest(message: string) {
  const normalized = normalizeImobText(message);
  return (
    normalized.includes("varredura de mercado")
    || normalized.includes("fazer varredura")
    || normalized.includes("market scan")
    || normalized.includes("scan de mercado")
  );
}

function buildMarketScanContext(params: {
  previous?: ImobMarketScanContext | null;
  message: string;
  slots: ImobSearchSlots;
}) {
  const normalized = normalizeImobText(params.message);
  const cityCandidates = extractCityCandidates(normalized);
  const goalCandidates = extractGoalCandidates(normalized);
  const inheritedCities = params.previous?.cities ?? [];
  const inheritedGoals = params.previous?.goals ?? [];
  const cities = cityCandidates.length > 0
    ? cityCandidates
    : params.slots.city
      ? [params.slots.city]
      : inheritedCities;
  const goals = goalCandidates.length > 0
    ? normalizeMarketScanGoalCandidates(goalCandidates)
    : params.slots.goal
      ? [params.slots.goal]
      : inheritedGoals;
  const propertyTypes = extractMarketScanPropertyTypes(normalized);
  const bedrooms = extractMarketScanBedrooms(normalized);
  const priceRange = extractMarketScanPriceRange(normalized, goals);

  return {
    cities: Array.from(new Set(cities)).sort((left, right) => left.localeCompare(right)),
    cityCandidates,
    uf: params.slots.region === "Santa Catarina" ? "SC" : params.slots.region ?? params.previous?.uf ?? null,
    goals,
    goalCandidates: normalizeMarketScanGoalCandidates(goalCandidates),
    propertyTypes,
    bedrooms,
    priceRange,
    readOnly: true,
    limitPerGroup: 10,
  } satisfies ImobMarketScanContext;
}

function buildPropertyPendingFields(draft: ImobPropertyDraft) {
  const pending: string[] = [];
  if (!draft.propertyType) pending.push("propertyType");
  if (!draft.goal) pending.push("goal");
  if (!draft.city) pending.push("city");
  if (!draft.address) pending.push("address");
  return pending;
}

function detectOwnerPersona(message: string, previous?: ImobOwnerDraft): ImobOwnerPersona {
  const normalized = normalizeImobText(message);
  if (normalized.includes("locador") || normalized.includes("locadora")) {
    return "locador";
  }
  if (normalized.includes("vendedor") || normalized.includes("vendedora")) {
    return "vendedor";
  }
  return previous?.ownerPersona ?? "proprietario";
}

function buildOwnerDraft(previous: ImobOwnerDraft | undefined, message: string): ImobOwnerDraft {
  return {
    ownerPersona: detectOwnerPersona(message, previous),
    ownerName: extractNamedParty(message, "owner") ?? previous?.ownerName ?? null,
    ownerEmail: extractEmail(message) ?? previous?.ownerEmail ?? null,
    ownerPhone: extractPhone(message) ?? previous?.ownerPhone ?? null,
    ownerDocument: extractDocument(message) ?? previous?.ownerDocument ?? null,
  };
}

function detectLeadPersona(message: string, previous?: ImobLeadDraft): ImobLeadPersona {
  const normalized = normalizeImobText(message);
  if (normalized.includes("locatario") || normalized.includes("locatário") || normalized.includes("inquilino") || normalized.includes("inquilina")) {
    return "locatario";
  }
  if (normalized.includes("comprador") || normalized.includes("compradora")) {
    return "comprador";
  }
  return previous?.leadPersona ?? "lead";
}

function normalizeLeadGoal(goal: "locacao" | "venda" | "aluguel_por_temporada" | null | undefined): "locacao" | "venda" | "aluguel_por_temporada" | null {
  return goal ?? null;
}

function buildLeadDraft(previous: ImobLeadDraft | undefined, message: string, slots: ImobSearchSlots): ImobLeadDraft {
  const desiredCityCanonical = canonicalizeImobCity(slots.city ?? previous?.desiredCity ?? null, {
    source: "user",
    locked: previous?.desiredCityCanonical?.locked ?? false,
  });
  return {
    leadPersona: detectLeadPersona(message, previous),
    leadName: extractNamedParty(message, "lead") ?? previous?.leadName ?? null,
    leadEmail: extractEmail(message) ?? previous?.leadEmail ?? null,
    leadPhone: extractPhone(message) ?? previous?.leadPhone ?? null,
    desiredGoal: normalizeLeadGoal(slots.goal ?? previous?.desiredGoal ?? null),
    desiredCity: desiredCityCanonical?.canonicalName ?? previous?.desiredCity ?? null,
    desiredCityCanonical,
    budgetMax: slots.budgetMax ?? previous?.budgetMax ?? null,
    discoverySignals: buildLeadDiscoverySignals(previous?.discoverySignals, message),
  };
}

function extractLeadDiscoveryUrgency(message: string): ImobLeadDiscoverySignals["urgency"] {
  const normalized = normalizeImobText(message);
  if (
    normalized.includes("urgente")
    || normalized.includes("quanto antes")
    || normalized.includes("imediat")
    || normalized.includes("essa semana")
    || normalized.includes("esta semana")
    || normalized.includes("este mes")
    || normalized.includes("esse mes")
    || normalized.includes("preciso mudar ja")
    || normalized.includes("preciso mudar logo")
  ) {
    return "high";
  }
  if (
    normalized.includes("nas proximas semanas")
    || normalized.includes("proximas semanas")
    || normalized.includes("proximo mes")
    || normalized.includes("mês que vem")
    || normalized.includes("mes que vem")
    || /ate\s+[a-z]+\b/.test(normalized)
  ) {
    return "medium";
  }
  if (
    normalized.includes("sem pressa")
    || normalized.includes("sem urgencia")
    || normalized.includes("sem urgência")
    || normalized.includes("quando der")
    || normalized.includes("sem correr")
  ) {
    return "low";
  }
  return null;
}

function extractLeadPainPoint(message: string) {
  const normalized = normalizeImobText(message);
  if (normalized.includes("home office") || normalized.includes("trabalhar de casa")) {
    return "precisa de espaço para home office";
  }
  if (normalized.includes("escola")) {
    return "quer proximidade de escola";
  }
  if (normalized.includes("mais espaco") || normalized.includes("mais espaço")) {
    return "precisa de mais espaço";
  }
  if (normalized.includes("seguranca") || normalized.includes("segurança")) {
    return "busca mais segurança";
  }
  if (normalized.includes("perto do trabalho") || normalized.includes("proximo do trabalho") || normalized.includes("próximo do trabalho")) {
    return "quer ficar perto do trabalho";
  }
  if (normalized.includes("sem elevador")) {
    return "precisa evitar imóvel sem elevador";
  }
  return null;
}

function extractLeadMotivation(message: string) {
  const normalized = normalizeImobText(message);
  if (normalized.includes("mudar com a familia") || normalized.includes("mudar com a família") || normalized.includes("familia crescendo") || normalized.includes("família crescendo")) {
    return "mudança por necessidade familiar";
  }
  if (normalized.includes("casando") || normalized.includes("casamento")) {
    return "mudança por casamento";
  }
  if (normalized.includes("transferencia") || normalized.includes("transferência") || normalized.includes("novo trabalho") || normalized.includes("mudanca de trabalho") || normalized.includes("mudança de trabalho")) {
    return "mudança por trabalho";
  }
  if (normalized.includes("invest")) {
    return "busca imóvel para investimento";
  }
  if (normalized.includes("sair do aluguel")) {
    return "quer sair do aluguel";
  }
  return null;
}

function extractLeadBudgetFlexibility(message: string): ImobLeadBudgetFlexibility | null {
  const normalized = normalizeImobText(message);
  if (
    normalized.includes("nao posso passar")
    || normalized.includes("não posso passar")
    || normalized.includes("limite fechado")
    || normalized.includes("orcamento apertado")
    || normalized.includes("orçamento apertado")
    || normalized.includes("teto maximo")
    || normalized.includes("teto máximo")
  ) {
    return "strict";
  }
  if (
    normalized.includes("posso esticar um pouco")
    || normalized.includes("consigo subir um pouco")
    || normalized.includes("tenho alguma flexibilidade")
  ) {
    return "moderate";
  }
  if (
    normalized.includes("orcamento flexivel")
    || normalized.includes("orçamento flexível")
    || normalized.includes("orçamento flexivel")
    || normalized.includes("posso aumentar")
    || normalized.includes("tenho flexibilidade")
  ) {
    return "flexible";
  }
  return null;
}

function extractLeadDecisionMaker(message: string): ImobLeadDecisionMaker | null {
  const normalized = normalizeImobText(message);
  if (
    normalized.includes("eu decido")
    || normalized.includes("decido sozinho")
    || normalized.includes("sou o decisor")
  ) {
    return "solo";
  }
  if (
    normalized.includes("minha esposa")
    || normalized.includes("meu marido")
    || normalized.includes("com minha esposa")
    || normalized.includes("com meu marido")
    || normalized.includes("com a familia")
    || normalized.includes("com a família")
    || normalized.includes("juntos")
  ) {
    return "shared";
  }
  if (
    normalized.includes("meu socio")
    || normalized.includes("meu sócio")
    || normalized.includes("diretoria")
    || normalized.includes("investidor")
    || normalized.includes("meu pai")
    || normalized.includes("minha mae")
    || normalized.includes("minha mãe")
  ) {
    return "third_party";
  }
  return null;
}

function extractLeadTimeline(message: string) {
  const normalized = normalizeImobText(message);
  if (normalized.includes("este mes") || normalized.includes("esse mes")) return "resolver ainda este mês";
  if (normalized.includes("essa semana") || normalized.includes("esta semana")) return "resolver ainda esta semana";
  if (normalized.includes("nas proximas semanas") || normalized.includes("próximas semanas")) return "resolver nas próximas semanas";
  if (normalized.includes("sem pressa")) return "sem prazo imediato";
  const untilMatch = normalized.match(/\bate\s+([a-z]+(?:\s+de\s+\d{4})?)\b/);
  if (untilMatch?.[1]) return `resolver até ${untilMatch[1]}`;
  return null;
}

export function hasLeadDiscoveryContent(message: string) {
  const signals = buildLeadDiscoverySignals(null, message);
  return Boolean(
    signals.urgency
    || signals.painPoint
    || signals.motivation
    || signals.budgetFlexibility
    || signals.decisionMaker
    || signals.timeline
  );
}

function buildLeadDiscoverySignals(
  previous: ImobLeadDiscoverySignals | undefined | null,
  message: string,
): ImobLeadDiscoverySignals {
  const next = {
    urgency: extractLeadDiscoveryUrgency(message) ?? previous?.urgency ?? null,
    painPoint: extractLeadPainPoint(message) ?? previous?.painPoint ?? null,
    motivation: extractLeadMotivation(message) ?? previous?.motivation ?? null,
    budgetFlexibility: extractLeadBudgetFlexibility(message) ?? previous?.budgetFlexibility ?? null,
    decisionMaker: extractLeadDecisionMaker(message) ?? previous?.decisionMaker ?? null,
    timeline: extractLeadTimeline(message) ?? previous?.timeline ?? null,
    pendingSignals: [] as ImobLeadDiscoverySignalKey[],
  };

  next.pendingSignals = ([
    !next.urgency ? "urgency" : null,
    !next.painPoint ? "painPoint" : null,
    !next.motivation ? "motivation" : null,
    !next.budgetFlexibility ? "budgetFlexibility" : null,
    !next.decisionMaker ? "decisionMaker" : null,
    !next.timeline ? "timeline" : null,
  ].filter(Boolean) as ImobLeadDiscoverySignalKey[]);

  return next;
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
    publicationGoal: slots.goal === "aluguel_por_temporada" ? "locacao" : slots.goal ?? previous?.publicationGoal ?? null,
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

function extractPropertyFinality(raw: string, slots: ImobSearchSlots): ImobRulesDraft["propertyFinality"] {
  const normalized = normalizeImobText(raw);
  if (
    normalized.includes("aluguel por temporada") ||
    normalized.includes("locacao por temporada") ||
    normalized.includes("locação por temporada") ||
    normalized.includes("temporada") ||
    normalized.includes("hospedagem") ||
    normalized.includes("diaria") ||
    normalized.includes("diária")
  ) {
    return "aluguel_por_temporada";
  }
  if (normalized.includes("venda") || normalized.includes("compr")) return "venda";
  if (normalized.includes("locacao") || normalized.includes("locação") || normalized.includes("aluguel") || slots.goal === "locacao") return "locacao";
  return null;
}

function extractPropertyId(raw: string) {
  const propertyIdMatch = raw.match(/(?:imovel|imóvel|apartamento|apto|casa)\s*#?\s*(\d{2,})/i)?.[1] ?? null;
  return propertyIdMatch ? `property-${propertyIdMatch}` : null;
}

function extractRuleTime(raw: string, label: "checkin" | "checkout") {
  const normalized = normalizeImobText(raw).replace(/check\s*in/g, "checkin").replace(/check\s*out/g, "checkout");
  const match = normalized.match(new RegExp(`${label}\\s*(?:as|às|a partir das|de)?\\s*(\\d{1,2})(?::|h)?(\\d{2})?`));
  if (!match?.[1]) return null;
  const hour = match[1].padStart(2, "0");
  const minute = (match[2] ?? "00").padStart(2, "0");
  return `${hour}:${minute}`;
}

function extractGuestCount(raw: string, kind: "min" | "max") {
  const normalized = normalizeImobText(raw);
  const labelPattern = kind === "min" ? "(?:minimo|min|mínimo)" : "(?:maximo|max|máximo)";
  const labeled = normalized.match(new RegExp(`${labelPattern}\\s*(?:de)?\\s*(\\d+)\\s*(?:hospedes|hóspedes|pessoas)?`));
  if (labeled?.[1]) return Number.parseInt(labeled[1], 10);
  const range = normalized.match(/(\d+)\s*(?:a|ate|até|-)\s*(\d+)\s*(?:hospedes|hóspedes|pessoas)/);
  if (range?.[1] && range?.[2]) return Number.parseInt(kind === "min" ? range[1] : range[2], 10);
  return null;
}

function extractRulesText(raw: string) {
  const match = raw.match(/(?:regras?|observacoes|observações)\s*:?[ ]*(.+)$/i);
  if (!match?.[1]) return null;
  return match[1].trim() || null;
}

function buildRulesDraft(previous: ImobRulesDraft | undefined, message: string, slots: ImobSearchSlots): ImobRulesDraft {
  return {
    propertyId: extractPropertyId(message) ?? previous?.propertyId ?? null,
    propertyFinality: extractPropertyFinality(message, slots) ?? previous?.propertyFinality ?? null,
    checkin: extractRuleTime(message, "checkin") ?? previous?.checkin ?? null,
    checkout: extractRuleTime(message, "checkout") ?? previous?.checkout ?? null,
    minHospedes: extractGuestCount(message, "min") ?? previous?.minHospedes ?? null,
    maxHospedes: extractGuestCount(message, "max") ?? previous?.maxHospedes ?? null,
    regras: extractRulesText(message) ?? previous?.regras ?? null,
    outrasRegras: previous?.outrasRegras ?? null,
  };
}

function buildRulesPendingFields(draft: ImobRulesDraft) {
  const pending: string[] = [];
  if (!draft.propertyId) pending.push("propertyId");
  if (!draft.propertyFinality) pending.push("propertyFinality");
  if (draft.propertyFinality !== "aluguel_por_temporada") return pending;
  if (!draft.checkin) pending.push("checkin");
  if (!draft.checkout) pending.push("checkout");
  if (!draft.minHospedes) pending.push("minHospedes");
  if (!draft.maxHospedes) pending.push("maxHospedes");
  if (draft.minHospedes && draft.maxHospedes && draft.minHospedes > draft.maxHospedes) pending.push("guestRange");
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

function extractSettlementStatus(raw: string): ImobCommissionDraft["settlementStatus"] {
  const normalized = normalizeImobText(raw);
  if (normalized.includes("pago") || normalized.includes("liquidado") || normalized.includes("settled")) return "paid";
  if (normalized.includes("pronto para pagar") || normalized.includes("ready") || normalized.includes("liberar comissao") || normalized.includes("liberar comissão")) return "ready";
  if (normalized.includes("pendente") || normalized.includes("aguardando") || normalized.includes("em aberto")) return "pending";
  return null;
}

function extractPayoutChannel(raw: string): ImobCommissionDraft["payoutChannel"] {
  const normalized = normalizeImobText(raw);
  if (normalized.includes("pix")) return "pix";
  if (normalized.includes("ted") || normalized.includes("transferencia") || normalized.includes("transferência")) return "ted";
  if (normalized.includes("boleto")) return "boleto";
  return null;
}

function extractCommissionAmountCents(raw: string) {
  const match = raw.match(/(?:comissao|comissão|valor)\s*(?:de|por)?\s*r?\$?\s*(\d+(?:[\.,]\d+)?)/i);
  if (!match) return null;
  const amount = Number.parseFloat(match[1].replace(/\./g, "").replace(",", "."));
  return Number.isFinite(amount) ? Math.round(amount * 100) : null;
}

function extractBrokerRef(raw: string) {
  const normalized = normalizeImobText(raw);
  const markerMatch = normalized.match(/(?:corretor|broker)\s+(.+)/i);
  const tail = markerMatch?.[1]?.trim();
  if (!tail) return null;

  const stopTokens = new Set(["valor", "comissao", "comissão", "via", "pix", "ted", "boleto", "pronto", "pagar", "negocio", "negócio"]);
  const tokens = tail.split(/\s+/).filter(Boolean);
  const nameTokens: string[] = [];
  for (const token of tokens) {
    if (stopTokens.has(token)) break;
    nameTokens.push(token);
    if (nameTokens.length === 3) break;
  }

  if (nameTokens.length === 0) return null;
  return `broker-${nameTokens.join("-")}`;
}

function buildCommissionDraft(previous: ImobCommissionDraft | undefined, message: string): ImobCommissionDraft {
  const dealIdMatch = message.match(/(?:deal|negocio|negócio)\s*#?\s*(\d{2,})/i)?.[1] ?? null;
  return {
    dealId: dealIdMatch ? `deal-${dealIdMatch}` : previous?.dealId ?? null,
    brokerRef: extractBrokerRef(message) ?? previous?.brokerRef ?? null,
    amountCents: extractCommissionAmountCents(message) ?? previous?.amountCents ?? null,
    settlementStatus: extractSettlementStatus(message) ?? previous?.settlementStatus ?? null,
    payoutChannel: extractPayoutChannel(message) ?? previous?.payoutChannel ?? null,
    approvalRequired: true,
  };
}

function buildCommissionPendingFields(draft: ImobCommissionDraft) {
  const pending: string[] = [];
  if (!draft.dealId) pending.push("dealId");
  if (!draft.brokerRef) pending.push("brokerRef");
  if (!draft.amountCents) pending.push("amountCents");
  if (!draft.settlementStatus) pending.push("settlementStatus");
  if (!draft.payoutChannel) pending.push("payoutChannel");
  return pending;
}

function buildMissionContext(
  previous: ImobOperationalState | undefined | null,
  message: string,
  slots: ImobSearchSlots,
): ImobOperationalState["missionContext"] | undefined {
  const normalized = normalizeImobText(message);
  const previousMission = previous?.missionContext;
  const explicitSale = slots.goal === "venda" || normalized.includes("venda") || normalized.includes("vender");
  const explicitLongTermRent =
    slots.goal === "locacao"
    || normalized.includes("locacao anual")
    || normalized.includes("locação anual")
    || normalized.includes("aluguel anual")
    || normalized.includes("locacao mensal")
    || normalized.includes("locação mensal")
    || normalized.includes("aluguel mensal");
  const explicitSeasonal =
    slots.goal === "aluguel_por_temporada"
    || normalized.includes("temporada")
    || normalized.includes("aluguel por temporada")
    || normalized.includes("locacao por temporada")
    || normalized.includes("locação por temporada");

  if (explicitSeasonal) {
    return {
      mission: "capture_seasonal_property",
      defaultGoal: "aluguel_por_temporada",
      startedFromMessage: previousMission?.startedFromMessage ?? message,
      recipeId: previousMission?.recipeId ?? null,
      lockedUntilExplicitChange: true,
    };
  }
  if (explicitSale) {
    return {
      mission: "capture_sale_property",
      defaultGoal: "venda",
      startedFromMessage: previousMission?.startedFromMessage ?? message,
      recipeId: previousMission?.recipeId ?? null,
      lockedUntilExplicitChange: false,
    };
  }
  if (explicitLongTermRent) {
    return {
      mission: "capture_rental_property",
      defaultGoal: "locacao",
      startedFromMessage: previousMission?.startedFromMessage ?? message,
      recipeId: previousMission?.recipeId ?? null,
      lockedUntilExplicitChange: false,
    };
  }
  return previousMission;
}

function applyMissionDefaultGoal(
  slots: ImobSearchSlots,
  missionContext: ImobOperationalState["missionContext"] | undefined,
): ImobSearchSlots {
  if (slots.goal || missionContext?.defaultGoal !== "aluguel_por_temporada") return slots;
  if (!missionContext.lockedUntilExplicitChange) return slots;
  return {
    ...slots,
    goal: "aluguel_por_temporada",
  };
}

export function createNextImobOperationalState(
  previous: ImobOperationalState | undefined | null,
  intent: ImobIntent,
  message: string,
  slots: ImobSearchSlots
): ImobOperationalState | null {
  const missionContext = buildMissionContext(previous, message, slots);
  if (intent === "capture") {
    if (previous?.flow === "property.market_scan" && (previous.marketScanSnapshot || previous.marketScanSelection)) {
      const normalized = normalizeImobText(message);
      const wantsSelect =
        normalized.includes("selecionar imóvel")
        || normalized.includes("selecionar imovel")
        || normalized.includes("selecionar item")
        || normalized.includes("usar imóvel do scan")
        || normalized.includes("usar imovel do scan")
        || normalized.includes("salvar imóvel do scan")
        || normalized.includes("salvar imovel do scan");
      const wantsConfirmSelection =
        normalized.includes("confirmar seleção do scan")
        || normalized.includes("confirmar selecao do scan")
        || normalized.includes("confirmar imóvel do scan")
        || normalized.includes("confirmar imovel do scan")
        || normalized.includes("confirmar captação do scan")
        || normalized.includes("confirmar captacao do scan");

      if (wantsConfirmSelection && previous.marketScanSelection) {
        const propertyDraft = buildPropertyDraftFromMarketScanSelection(
          previous.propertyDraft,
          previous.marketScanSelection,
        );
        const pendingFields = buildPropertyPendingFields(propertyDraft);
        return {
          flow: "property.create",
          status: pendingFields.length === 0 ? "ready_for_review" : "collecting",
          pendingFields,
          missionContext,
          propertyDraft,
        };
      }
      if (wantsConfirmSelection) return previous;

      const selectedOrdinal = extractMarketScanSelectionOrdinal(message);
      const selectedSourceId = extractMarketScanSelectionSourceId(message);
      const selectedItem =
        findMarketScanItemByOrdinal(previous.marketScanSnapshot, selectedOrdinal)
        ?? findMarketScanItemBySourceId(previous.marketScanSnapshot, selectedSourceId);

      if (wantsSelect && selectedItem) {
        const selection = buildMarketScanSelection(previous.marketScanSnapshot, selectedItem);
        return {
          ...previous,
          missionContext,
          status: "ready_for_review",
          pendingFields: [],
          propertyDraft: selection
            ? buildPropertyDraftFromMarketScanSelection(previous.propertyDraft, selection)
            : previous.propertyDraft,
          marketScanSelection: selection,
        };
      }
      if (wantsSelect) return previous;
    }

    if (previous?.flow === "property.market_scan" && isMarketScanRequest(message)) {
      return {
        ...previous,
        missionContext,
        marketScanContext: buildMarketScanContext({
          previous: previous.marketScanContext ?? null,
          message,
          slots,
        }),
        marketScanSelection: null,
      };
    }
    if (hasPropertyCaptureSignal(message, slots) && !hasExplicitOwnerCreateRequest(message)) {
      const previousMarketScanContext = previous?.flow === "property.market_scan"
        ? previous.marketScanContext ?? null
        : null;
      const marketScanContext = buildMarketScanContext({
        previous: previousMarketScanContext,
        message,
        slots,
      });
      const hasMultipleCandidates =
        marketScanContext.cityCandidates.length > 1
        || marketScanContext.goalCandidates.length > 1;
      const inheritedSlots: ImobSearchSlots = previous?.flow === "lead.qualify"
        ? {
            ...slots,
            goal: slots.goal ?? previous.leadDraft?.desiredGoal ?? null,
            city: slots.city ?? previous.leadDraft?.desiredCity ?? null,
          }
        : applyMissionDefaultGoal(slots, missionContext);
      const draft = buildPropertyDraft(
        previous?.flow === "property.create" ? previous.propertyDraft : undefined,
        message,
        inheritedSlots,
      );
      const preserveResolvedMarketScanSelection = Boolean(
        previous?.flow === "property.create"
        && previous.propertyDraft?.origin
        && previous.propertyDraft?.city
        && previous.propertyDraft?.goal,
      );
      if (marketScanContext.cityCandidates.length > 1 && !preserveResolvedMarketScanSelection) draft.city = null;
      if (marketScanContext.goalCandidates.length > 1 && !preserveResolvedMarketScanSelection) draft.goal = null;
      const pendingFields = buildPropertyPendingFields(draft);
      if (isMarketScanRequest(message) || (hasMultipleCandidates && !preserveResolvedMarketScanSelection)) {
        return {
          flow: "property.market_scan",
          status: "collecting",
          pendingFields: Array.from(new Set([
            ...(marketScanContext.cityCandidates.length > 1 ? ["city"] : []),
            ...(marketScanContext.goalCandidates.length > 1 ? ["goal"] : []),
          ])),
          missionContext,
          propertyDraft: draft,
          marketScanContext,
          marketScanSnapshot: previous?.flow === "property.market_scan" ? previous.marketScanSnapshot : undefined,
          marketScanSelection: previous?.flow === "property.market_scan" ? previous.marketScanSelection ?? null : null,
        };
      }
      return {
        flow: "property.create",
        status: pendingFields.length === 0 ? "ready_for_review" : "collecting",
        pendingFields,
        missionContext,
        propertyDraft: draft,
      };
    }
    const draft = buildOwnerDraft(previous?.flow === "owner.create" ? previous.ownerDraft : undefined, message);
    const pendingFields = buildOwnerPendingFields(draft);
    return {
      flow: "owner.create",
      status: pendingFields.length === 0 ? "ready_for_review" : "collecting",
      pendingFields,
      missionContext,
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
  if (intent === "commission") {
    const draft = buildCommissionDraft(previous?.flow === "commission.settle" ? previous.commissionDraft : undefined, message);
    const pendingFields = buildCommissionPendingFields(draft);
    return {
      flow: "commission.settle",
      status: pendingFields.length === 0 ? "ready_for_review" : "collecting",
      pendingFields,
      commissionDraft: draft,
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
  if (intent === "rules") {
    const draft = buildRulesDraft(previous?.flow === "rules.configure" ? previous.rulesDraft : undefined, message, slots);
    const pendingFields = buildRulesPendingFields(draft);
    return {
      flow: "rules.configure",
      status: pendingFields.length === 0 ? "ready_for_review" : "collecting",
      pendingFields,
      rulesDraft: draft,
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
