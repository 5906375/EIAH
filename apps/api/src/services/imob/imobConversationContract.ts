export type ImobConversationMode = "consult" | "search" | "execute" | "search_knowledge" | "blocked";

export type ImobConversationIntent =
  | "discover_rent"
  | "discover_sale"
  | "refine_search"
  | "knowledge_search"
  | "operational";

export type ImobPropertyType =
  | "apartamento"
  | "casa"
  | "studio"
  | "sala"
  | "terreno"
  | "galpao"
  | null;

export type ImobSearchSlots = {
  goal: "locacao" | "venda" | null;
  city: string | null;
  region: string | null;
  neighborhood: string | null;
  budgetMax: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  propertyType: ImobPropertyType;
};

export type ImobPendingSlot =
  | "none"
  | "city"
  | "budget"
  | "bedrooms"
  | "bathrooms"
  | "propertyType";

export type ImobThreadConversationState = {
  slots: ImobSearchSlots;
  mode: ImobConversationMode;
  pendingSlot: ImobPendingSlot;
  resultOffset: number;
};

export type ImobIntent = "capture" | "match" | "proposal" | "contract" | "commission" | "adjustment";

export type ImobKnowledgeSourceFilter = "drive" | "upload" | "web" | "internal_doc";

export type ImobAccessContext = {
  tenantId?: string | null;
  workspaceId?: string | null;
  entitlements?: {
    REAL_ESTATE_CORE?: boolean;
    IMOB_INSTALLED?: boolean;
  } | null;
};

export type ImobResolveTurnRequest = {
  message: string;
  threadLabel?: string | null;
  threadState?: ImobThreadConversationState | null;
  access?: ImobAccessContext;
};

export type ImobPresentationCta = {
  id: string;
  label: string;
  kind?: "primary" | "secondary" | "neutral";
  href?: string;
  action?: "confirm_execution" | "reject_execution" | "export_contract_pdf" | "continue_inventory_search";
  nextMessage?: string;
};

export type ImobPresentationCard = {
  title: string;
  lines: string[];
  ctas?: ImobPresentationCta[];
};

export type ImobExecutionRequest = {
  intent: ImobIntent;
  action: string;
  prompt: string;
  input: Record<string, unknown>;
};

export type ImobSearchInventoryRequest = {
  query: string;
  region?: string | null;
  segment?: "locacao" | "venda" | "ambos" | null;
  slots?: Partial<ImobSearchSlots> | null;
  offset?: number;
  limit?: number;
};

export type ImobInventoryOption = {
  id: string;
  title: string;
  city: string;
  region: string;
  neighborhood?: string;
  segment: "locacao" | "venda";
  priceLabel: string;
  priceAmount?: number | null;
  bedrooms?: number;
  bathrooms?: number;
  propertyType?: string;
};

export type ImobSearchInventoryResponse = {
  query: string;
  region: string;
  segment: "locacao" | "venda" | "ambos";
  items: ImobInventoryOption[];
  total: number;
  offset: number;
  limit: number;
  presentation: {
    text: string;
    card?: ImobPresentationCard;
  };
};

export type ImobResolveTurnResponse = {
  mode: ImobConversationMode;
  action: string;
  threadLabel: string;
  conversationState: ImobThreadConversationState;
  presentation: {
    text: string;
    card?: ImobPresentationCard;
    suggestedNextAction?: string;
  };
  executionRequest?: ImobExecutionRequest;
  searchRequest?: ImobSearchInventoryRequest;
  knowledgeRequest?: {
    query: string;
    filters: {
      region?: string | null;
      segment?: "locacao" | "venda" | "ambos" | null;
      sourceTypes?: ImobKnowledgeSourceFilter[];
    };
  };
};

export const IMOB_MAX_USER_OPTIONS = 3;

export function createEmptyImobSlots(): ImobSearchSlots {
  return {
    goal: null,
    city: null,
    region: null,
    neighborhood: null,
    budgetMax: null,
    bedrooms: null,
    bathrooms: null,
    propertyType: null,
  };
}
