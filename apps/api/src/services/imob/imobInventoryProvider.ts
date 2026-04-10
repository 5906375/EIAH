import { IMOB_MAX_USER_OPTIONS, type ImobInventoryOption, type ImobPresentationCard, type ImobSearchInventoryRequest, type ImobSearchInventoryResponse } from "./imobConversationContract";

const SYNTHETIC_SEARCH_CATALOG: ImobInventoryOption[] = [
  {
    id: "inventory-bc-loc-2q",
    title: "Apto Centro 2Q",
    city: "Balneário Camboriú",
    region: "Santa Catarina",
    neighborhood: "Centro",
    segment: "locacao",
    priceLabel: "R$ 4.200/mês",
    priceAmount: 4200,
    bedrooms: 2,
    bathrooms: 2,
    propertyType: "apartamento",
  },
  {
    id: "inventory-itajai-venda-casa",
    title: "Casa Praia Brava",
    city: "Itajaí",
    region: "Santa Catarina",
    neighborhood: "Praia Brava",
    segment: "venda",
    priceLabel: "R$ 1.450.000",
    priceAmount: 1450000,
    bedrooms: 4,
    bathrooms: 3,
    propertyType: "casa",
  },
  {
    id: "inventory-sp-loc-studio",
    title: "Studio Pinheiros",
    city: "São Paulo",
    region: "São Paulo",
    neighborhood: "Pinheiros",
    segment: "locacao",
    priceLabel: "R$ 3.800/mês",
    priceAmount: 3800,
    bedrooms: 1,
    bathrooms: 1,
    propertyType: "studio",
  },
  {
    id: "inventory-sp-venda-apto",
    title: "Apto Vila Mariana",
    city: "São Paulo",
    region: "São Paulo",
    neighborhood: "Vila Mariana",
    segment: "venda",
    priceLabel: "R$ 980.000",
    priceAmount: 980000,
    bedrooms: 2,
    bathrooms: 2,
    propertyType: "apartamento",
  },
  {
    id: "inventory-rj-venda-cobertura",
    title: "Cobertura Copacabana",
    city: "Rio de Janeiro",
    region: "Rio de Janeiro",
    neighborhood: "Copacabana",
    segment: "venda",
    priceLabel: "R$ 2.200.000",
    priceAmount: 2200000,
    bedrooms: 3,
    bathrooms: 3,
    propertyType: "apartamento",
  },
];

function segmentLabel(segment: "locacao" | "venda" | "ambos") {
  return segment === "locacao" ? "locação" : segment === "venda" ? "venda" : "locação e venda";
}

function formatInventoryLine(item: ImobInventoryOption) {
  return [item.title, item.city, item.priceLabel, item.segment === "locacao" ? "Locação" : "Venda"].join(" • ");
}

function buildCard(items: ImobInventoryOption[], request: Required<Pick<ImobSearchInventoryResponse, "segment">> & { city?: string | null }) : ImobPresentationCard | undefined {
  if (items.length === 0) return undefined;
  const nextMessage = request.city
    ? `buscar mais opções de ${segmentLabel(request.segment)} em ${request.city}`
    : `buscar mais opções de ${segmentLabel(request.segment)}`;
  return {
    title: "Opções para começar",
    lines: items.map(formatInventoryLine),
    ctas: [
      {
        id: "continue-inventory-search",
        label: "Ver mais opções",
        kind: "primary" as const,
        action: "continue_inventory_search",
        nextMessage,
      },
    ].slice(0, IMOB_MAX_USER_OPTIONS),
  };
}

function buildPresentationText(params: { region: string; segment: "locacao" | "venda" | "ambos"; city?: string | null; bedrooms?: number | null; bathrooms?: number | null; offset: number; hasResults: boolean; }) {
  if (!params.hasResults) {
    const cityLabel = params.city ? ` em ${params.city}` : "";
    return `Posso refinar essa busca${cityLabel}. Me diga faixa de valor ou número de quartos.`;
  }

  const regionLabel = params.city ?? params.region;
  const base = regionLabel && regionLabel !== "Brasil"
    ? `Separei algumas opções de ${segmentLabel(params.segment)} em ${regionLabel} para começar.`
    : `Separei algumas opções de ${segmentLabel(params.segment)} para começar.`;
  const continuedBase = regionLabel && regionLabel !== "Brasil"
    ? `Aqui vão mais opções de ${segmentLabel(params.segment)} em ${regionLabel}.`
    : `Aqui vão mais opções de ${segmentLabel(params.segment)}.`;
  const refinement = params.bedrooms || params.bathrooms
    ? " Se quiser, eu continuo refinando por valor, bairro ou tipo de imóvel."
    : params.city
      ? " Quer refinar por faixa de valor ou número de quartos?"
      : " Se quiser, eu refino por cidade, faixa de valor ou número de quartos.";
  return `${params.offset > 0 ? continuedBase : base}${refinement}`;
}

export function searchImobInventory(request: ImobSearchInventoryRequest): ImobSearchInventoryResponse {
  const region = request.region ?? "Brasil";
  const segment = request.segment ?? "ambos";
  const offset = request.offset ?? 0;
  const limit = request.limit ?? 2;
  const slots = request.slots ?? null;

  const filtered = SYNTHETIC_SEARCH_CATALOG.filter((item) => {
    const regionMatch = !region || region === "Brasil" ? true : item.region === region || item.city === region;
    const segmentMatch = !segment || segment === "ambos" ? true : item.segment === segment;
    const cityMatch = !slots?.city ? true : item.city === slots.city;
    const neighborhoodMatch = !slots?.neighborhood ? true : item.neighborhood === slots.neighborhood;
    const bedroomsMatch = !slots?.bedrooms ? true : (item.bedrooms ?? 0) >= slots.bedrooms;
    const bathroomsMatch = !slots?.bathrooms ? true : (item.bathrooms ?? 0) >= slots.bathrooms;
    const propertyTypeMatch = !slots?.propertyType ? true : item.propertyType === slots.propertyType;
    const budgetMatch = !slots?.budgetMax ? true : (item.priceAmount ?? Number.MAX_SAFE_INTEGER) <= slots.budgetMax;

    return regionMatch && segmentMatch && cityMatch && neighborhoodMatch && bedroomsMatch && bathroomsMatch && propertyTypeMatch && budgetMatch;
  });

  const items = filtered.slice(offset, offset + limit);
  return {
    query: request.query,
    region,
    segment,
    items,
    total: filtered.length,
    offset,
    limit,
    presentation: {
      text: buildPresentationText({
        region,
        segment,
        city: slots?.city ?? null,
        bedrooms: slots?.bedrooms ?? null,
        bathrooms: slots?.bathrooms ?? null,
        offset,
        hasResults: items.length > 0,
      }),
      card: buildCard(items, { segment, city: slots?.city ?? null }),
      widget:
        items.length > 0
          ? {
              kind: "inventory_showcase" as const,
              title: "Vitrine IMOB",
              subtitle:
                slots?.city ?? region
                  ? `Imóveis compatíveis para ${segmentLabel(segment)} em ${slots?.city ?? region}.`
                  : `Imóveis compatíveis para ${segmentLabel(segment)}.`,
              items: items.map((item) => ({
                ...item,
                autoprompt: `mostrar detalhes do imóvel ${item.title} em ${item.city}`,
              })),
            }
          : undefined,
    },
  };
}
