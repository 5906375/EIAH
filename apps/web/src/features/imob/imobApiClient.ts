import {
  apiResolveImobTurn,
  apiSearchImobInventory,
  type ImobExecutionRequest,
  type ImobInventorySearchResponse,
  type ImobResolveTurnResponse,
  type ImobThreadConversationState,
} from "@/lib/api";

export type { ImobExecutionRequest, ImobInventorySearchResponse, ImobResolveTurnResponse, ImobThreadConversationState };

export async function resolveImobTurn(body: {
  message: string;
  threadLabel?: string | null;
  threadId?: string | null;
  caseId?: string | null;
  threadState?: ImobThreadConversationState | null;
}): Promise<ImobResolveTurnResponse> {
  const response = await apiResolveImobTurn(body);
  return response.data;
}

export async function searchImobInventory(body: {
  query: string;
  region?: string | null;
  segment?: "locacao" | "venda" | "ambos" | null;
  slots?: Partial<ImobThreadConversationState["slots"]> | null;
  offset?: number;
  limit?: number;
}): Promise<ImobInventorySearchResponse> {
  const response = await apiSearchImobInventory(body);
  return response.data;
}
