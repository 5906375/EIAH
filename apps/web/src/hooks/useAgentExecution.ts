import { useCallback, useEffect, useMemo, useState } from "react";
import {
  apiCreateRunWithHeaders,
  apiListDelegations,
  apiListMarketplace,
  type DelegationPolicy,
  type MarketplaceItem,
} from "@/lib/api";
import { useSession } from "@/state/sessionStore";

type ExecutePayload = {
  agent?: string;
  prompt: string;
  workspaceId?: string;
  metadata?: Record<string, unknown>;
};

function normalizeAgentKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function isDelegationActive(delegation?: DelegationPolicy | null) {
  if (!delegation?.validUntil) return false;
  const expiry = new Date(delegation.validUntil).getTime();
  return Number.isFinite(expiry) && expiry > Date.now();
}

function findMarketplaceItemForAgent(items: MarketplaceItem[], agentId: string) {
  const normalized = normalizeAgentKey(agentId);
  return (
    items.find((item) => normalizeAgentKey(item.name) === normalized) ??
    items.find((item) => normalizeAgentKey(item.id) === normalized)
  );
}

export function useAgentExecution() {
  const session = useSession();
  const [marketplaceItems, setMarketplaceItems] = useState<MarketplaceItem[]>([]);
  const [delegations, setDelegations] = useState<DelegationPolicy[]>([]);

  useEffect(() => {
    let active = true;
    if (!session.token) {
      setMarketplaceItems([]);
      setDelegations([]);
      return () => {
        active = false;
      };
    }

    Promise.all([apiListMarketplace(), apiListDelegations({ role: "delegatee" })])
      .then(([marketplaceResponse, delegationResponse]) => {
        if (!active) return;
        setMarketplaceItems(marketplaceResponse.items ?? []);
        setDelegations(delegationResponse.items ?? []);
      })
      .catch(() => {
        if (!active) return;
        setMarketplaceItems([]);
        setDelegations([]);
      });

    return () => {
      active = false;
    };
  }, [session.token, session.tenantId, session.workspaceId]);

  const activeDelegations = useMemo(
    () => delegations.filter((delegation) => isDelegationActive(delegation)),
    [delegations]
  );

  const getDelegationHeaders = useCallback(
    (agentId: string) => {
      const item = findMarketplaceItemForAgent(marketplaceItems, agentId);
      const delegation = item
        ? activeDelegations.find((entry) => entry.marketplaceId === item.id)
        : activeDelegations.find((entry) => entry.marketplaceId === agentId);

      if (!delegation) return undefined;

      const headers: Record<string, string> = {
        "x-delegation-id": delegation.id,
        "x-delegator-id": delegation.delegatorId,
        "x-delegation-scope": delegation.scope,
      };
      if (delegation.marketplaceId) {
        headers["x-marketplace-id"] = delegation.marketplaceId;
      }
      return headers;
    },
    [marketplaceItems, activeDelegations]
  );

  const executeAgent = useCallback(
    async (agentId: string, payload: ExecutePayload) => {
      const headers = getDelegationHeaders(agentId);
      const body = payload.agent ? payload : { ...payload, agent: agentId };
      return apiCreateRunWithHeaders(body, headers);
    },
    [getDelegationHeaders]
  );

  return { executeAgent, delegations: activeDelegations };
}
