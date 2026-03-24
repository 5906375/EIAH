import {
  createEmptyImobSlots,
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
  } satisfies ImobThreadConversationState;
}

export function hasMeaningfulSearchFilters(slots: ImobSearchSlots) {
  return Boolean(slots.city || slots.neighborhood || slots.budgetMax || slots.bedrooms || slots.bathrooms);
}
