export type ImobIntent = "capture" | "match" | "proposal" | "contract" | "commission" | "adjustment";

export type ImobActionPlan = {
  intent: ImobIntent;
  action: string;
  prompt: string;
  input: Record<string, unknown>;
  suggestedNextAction?: string;
  mode?: "execute" | "search";
  search?: {
    query: string;
    region: string;
    segment: "locacao" | "venda" | "ambos";
  };
};

function extractNumericToken(text: string) {
  const match = text.match(/#?([0-9]{2,})/);
  return match ? match[1] : null;
}

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function detectContractType(message: string): "rent" | "sale" | "management" {
  const text = normalizeText(message);
  if (text.includes("loca") || text.includes("alug")) return "rent";
  if (text.includes("gest") || text.includes("administra")) return "management";
  return "sale";
}

export function classifyImobIntent(message: string): ImobIntent {
  const text = normalizeText(message);
  if (text.includes("comissao") || text.includes("comissão")) return "commission";
  if (text.includes("contrato") || text.includes("assinatura")) return "contract";
  if (text.includes("proposta") || text.includes("oferta")) return "proposal";
  if (text.includes("cadastrar") || text.includes("capta") || text.includes("propriet") || text.includes("imovel") || text.includes("imóvel")) return "capture";
  if (text.includes("alugar") || text.includes("loca") || text.includes("procur") || text.includes("quartos")) return "match";
  return "adjustment";
}

function extractRegion(text: string) {
  const normalized = normalizeText(text);
  if (normalized.includes("santa catarina") || normalized.includes("sc")) return "Santa Catarina";
  if (normalized.includes("sao paulo") || normalized.includes("sp")) return "São Paulo";
  if (normalized.includes("rio de janeiro") || normalized.includes("rj")) return "Rio de Janeiro";
  if (normalized.includes("sul")) return "Sul";
  if (normalized.includes("sudeste")) return "Sudeste";
  if (normalized.includes("nordeste")) return "Nordeste";
  return "Brasil";
}

function extractSegment(text: string): "locacao" | "venda" | "ambos" {
  const normalized = normalizeText(text);
  const hasRent = normalized.includes("loca") || normalized.includes("alug");
  const hasSale = normalized.includes("venda") || normalized.includes("compr");
  if (hasRent && hasSale) return "ambos";
  if (hasRent) return "locacao";
  if (hasSale) return "venda";
  return "ambos";
}

function isResearchQuery(message: string) {
  const text = normalizeText(message);
  return (
    text.includes("buscar") ||
    text.includes("busca") ||
    text.includes("pesquisa") ||
    text.includes("consultar portais") ||
    text.includes("portais imobili") ||
    text.includes("site imobili") ||
    text.includes("sites imobili") ||
    text.includes("mercado") ||
    text.includes("regi") ||
    text.includes("brasil")
  );
}

export function buildImobActionPlan(message: string): ImobActionPlan {
  if (isResearchQuery(message)) {
    const region = extractRegion(message);
    const segment = extractSegment(message);
    const timestamp = new Date().toISOString();
    return {
      intent: "match",
      action: "realestate.search_inventory",
      mode: "search",
      prompt: `Pesquisar opções de imóveis em ${region} para ${segment}.`,
      input: {
        query: message,
        region,
        segment,
        requestedAt: timestamp,
      },
      search: {
        query: message,
        region,
        segment,
      },
      suggestedNextAction: "Refinar região, faixa de preço e tipologia.",
    };
  }

  const intent = classifyImobIntent(message);
  const numericId = extractNumericToken(message);
  const timestamp = new Date().toISOString();

  switch (intent) {
    case "commission": {
      const dealId = numericId ? `deal-${numericId}` : `deal-${Date.now()}`;
      return {
        intent,
        action: "realestate.release_commission",
        prompt: `Fechar comissão imobiliária para o negócio ${dealId}.`,
        input: {
          dealId,
          brokerId: "broker-default",
          amountCents: 100000,
          requestedAt: timestamp,
        },
        suggestedNextAction: "Validar settlement e comprovante.",
      };
    }
    case "contract": {
      const propertyId = numericId ? `property-${numericId}` : `property-${Date.now()}`;
      const contractType = detectContractType(message);
      return {
        intent,
        action: "realestate.create_contract",
        prompt: `Gerar contrato imobiliário para ${propertyId}.`,
        input: {
          propertyId,
          partyA: "proprietario-default",
          partyB: "cliente-default",
          contractType,
          requestedAt: timestamp,
        },
        suggestedNextAction: "Enviar para aprovação de partes.",
      };
    }
    case "proposal": {
      const propertyId = numericId ? `property-${numericId}` : `property-${Date.now()}`;
      const contractType = detectContractType(message);
      return {
        intent,
        action: "realestate.create_contract",
        prompt: `Converter proposta em minuta contratual para ${propertyId}.`,
        input: {
          propertyId,
          partyA: "proprietario-default",
          partyB: "cliente-default",
          contractType,
          requestedAt: timestamp,
        },
        suggestedNextAction: "Confirmar valor final da proposta.",
      };
    }
    case "capture": {
      const propertyId = numericId ? `property-${numericId}` : `property-${Date.now()}`;
      return {
        intent,
        action: "realestate.register_property",
        prompt: `Cadastrar imóvel ${propertyId} para operação imobiliária.`,
        input: {
          propertyId,
          address: "endereco-pendente",
          ownerDocument: "documento-pendente",
          requestedAt: timestamp,
        },
        suggestedNextAction: "Completar dados e publicar no catálogo.",
      };
    }
    case "match": {
      const propertyId = numericId ? `property-${numericId}` : `property-${Date.now()}`;
      return {
        intent,
        action: "realestate.apply_adjustment",
        prompt: `Ajustar condições para matching operacional do imóvel ${propertyId}.`,
        input: {
          propertyId,
          adjustmentType: "discount",
          amountCents: 5000,
          reason: "matching-request",
          requestedAt: timestamp,
        },
        suggestedNextAction: "Apresentar imóveis e iniciar visita.",
      };
    }
    case "adjustment":
    default: {
      const propertyId = numericId ? `property-${numericId}` : `property-${Date.now()}`;
      return {
        intent: "adjustment",
        action: "realestate.apply_adjustment",
        prompt: `Aplicar ajuste operacional ao imóvel ${propertyId}.`,
        input: {
          propertyId,
          adjustmentType: "correction",
          amountCents: 1000,
          reason: "operational-adjustment",
          requestedAt: timestamp,
        },
        suggestedNextAction: "Verificar impacto na proposta/comissão.",
      };
    }
  }
}
