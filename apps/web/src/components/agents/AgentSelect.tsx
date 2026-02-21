import { useEffect, useMemo, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  apiGetAuthMe,
  apiListAgents,
  apiListDelegations,
  apiListMarketplace,
  type DelegationPolicy,
  type MarketplaceItem,
} from "@/lib/api";
import { useSession } from "@/state/sessionStore";

type Agent = {
  id: string;
  name: string;
  description?: string;
  pricing?: { perRunCents?: number };
};

const ACTIVE_AGENTS: Agent[] = [
  { id: "fin-nexus", name: "Fin Nexus", pricing: { perRunCents: 320 } },
  { id: "flow-orchestrator", name: "Flow Orchestrator", pricing: { perRunCents: 250 } },
  { id: "risk-analyzer", name: "Risk Analyzer", pricing: { perRunCents: 180 } },
  { id: "onchain-monitor", name: "Onchain Monitor", pricing: { perRunCents: 120 } },
  { id: "I_BC", name: "I_BC", pricing: { perRunCents: 150 } },
  { id: "Diarias", name: "Diarias", pricing: { perRunCents: 200 } },
  { id: "NFT_PY", name: "NFT_PY", pricing: { perRunCents: 220 } },
  { id: "ImageNFTDiarias", name: "ImageNFTDiarias", pricing: { perRunCents: 260 } },
  { id: "DeFi_1", name: "DeFi_1", pricing: { perRunCents: 280 } },
  { id: "Pitch", name: "Pitch", pricing: { perRunCents: 190 } },
  { id: "MKT", name: "MKT", pricing: { perRunCents: 210 } },
  { id: "J_360", name: "J_360", pricing: { perRunCents: 230 } },
  { id: "EIAH", name: "EIAH", pricing: { perRunCents: 170 } },
  { id: "guardian", name: "Guardian", pricing: { perRunCents: 240 } },
];

function normalizeAgentKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function isDelegationActive(delegation?: DelegationPolicy | null) {
  if (!delegation?.validUntil) return false;
  const expiry = new Date(delegation.validUntil).getTime();
  return Number.isFinite(expiry) && expiry > Date.now();
}

export default function AgentSelect({
  value,
  onChange,
  showPlaybook = false,
  onPlaybookClick,
}: {
  value?: string;
  onChange: (v: string) => void;
  showPlaybook?: boolean;
  onPlaybookClick?: () => void;
}) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { workspaceId, tenantId, userId } = useSession();

  useEffect(() => {
    setIsLoading(true);
    setLoadError(null);

    const mergeAgents = (
      items: Agent[] | null | undefined,
      marketplaceItems: MarketplaceItem[],
      delegations: DelegationPolicy[],
      auth?: { role?: string; tenantRole?: string | null; permissions?: string[] } | null
    ): Agent[] => {
      const activeDelegations = new Set(
        delegations
          .filter((delegation) => isDelegationActive(delegation))
          .map((delegation) => delegation.marketplaceId)
          .filter(Boolean) as string[]
      );
      const activeMarketplaceAgents = marketplaceItems.filter(
        (item) => item.type === "agent" && activeDelegations.has(item.id)
      );
      const allowedKeys = new Set(
        activeMarketplaceAgents.map((item) => normalizeAgentKey(item.name))
      );
      const roleRaw = String(auth?.tenantRole ?? auth?.role ?? "").toUpperCase();
      const permissions = auth?.permissions ?? [];
      const canExecuteRuns = permissions.includes("runs.execute");
      const isAdminOrOperatorRole =
        roleRaw.includes("GLOBAL_ADMIN") ||
        roleRaw.includes("TENANT_ADMIN") ||
        roleRaw.includes("TENANT_OPERATOR");
      const isAdminTenant = (tenantId || "").toLowerCase().includes("admin");
      const allowAllAgents =
        isAdminTenant ||
        isAdminOrOperatorRole ||
        canExecuteRuns ||
        (import.meta.env.DEV && activeMarketplaceAgents.length === 0);
      const catalog = new Map<string, Agent>();

      const upsert = (agent: Agent) => {
        if (!agent?.id) return;
        if (agent.id.includes(".")) return;
        const key = normalizeAgentKey(agent.id);
        if (
          !allowAllAgents &&
          !allowedKeys.has(key) &&
          !allowedKeys.has(normalizeAgentKey(agent.name || ""))
        ) {
          return;
        }
        const existing = catalog.get(key);
        catalog.set(key, {
          ...existing,
          ...agent,
          id: agent.id,
          name: agent.name || existing?.name || agent.id,
          pricing: agent.pricing ?? existing?.pricing,
        });
      };

      ACTIVE_AGENTS.forEach(upsert);
      (items ?? []).forEach(upsert);
      activeMarketplaceAgents.forEach((item) =>
        upsert({
          id: item.name,
          name: item.name,
          description: item.description,
        })
      );

      return Array.from(catalog.values()).sort((a, b) => a.name.localeCompare(b.name));
    };

    Promise.all([
      apiListAgents(),
      apiListMarketplace(),
      apiListDelegations({ role: "delegatee" }),
      apiGetAuthMe().catch(() => null),
    ])
      .then(([agentsResponse, marketplaceResponse, delegationsResponse, authResponse]) => {
        const fromApi = Array.isArray((agentsResponse as any)?.items)
          ? (agentsResponse as any).items
          : [];
        const marketplaceItems = marketplaceResponse.items ?? [];
        const delegations = delegationsResponse.items ?? [];
        const auth = authResponse?.data
          ? {
              role: authResponse.data.role,
              tenantRole: authResponse.data.tenantRole ?? null,
              permissions: authResponse.data.permissions ?? [],
            }
          : null;
        const nextAgents = mergeAgents(fromApi, marketplaceItems, delegations, auth);
        setAgents(nextAgents);
        if (value && !nextAgents.some((agent) => agent.id === value)) {
          onChange("");
        }
      })
      .catch((err) => {
        console.error("Failed to load agents", err);
        setLoadError("Nao foi possivel carregar agentes assinados.");
        setAgents([]);
      })
      .finally(() => setIsLoading(false));
  }, [workspaceId, tenantId, userId]);

  return (
    <div className="rounded-3xl border border-white/10 bg-surface/70 p-4 shadow-lg shadow-black/20">
      <div className="flex flex-col gap-2">
        <label
          id="agent-label"
          className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground"
        >
          Agente
        </label>
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger
            aria-labelledby="agent-label"
            className="w-full whitespace-nowrap border-white/10 bg-surface-strong/70 text-foreground shadow-lg shadow-black/20"
          >
            <SelectValue placeholder="Selecione um agente" />
          </SelectTrigger>
          <SelectContent>
            {agents.length === 0 && (
              <SelectItem disabled value="__empty">
                {isLoading
                  ? "Carregando..."
                  : loadError ?? "Nenhum agente disponivel para este contexto de tenant/workspace"}
              </SelectItem>
            )}
            {agents.map((agent) => {
              const pricingText = agent.pricing?.perRunCents
                ? ` - R$ ${(agent.pricing.perRunCents / 100).toFixed(2)}/run`
                : "";
              return (
                <SelectItem key={agent.id} value={agent.id}>
                  {agent.name}
                  {pricingText}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        {value && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground" aria-live="polite">
              ID: {value}
            </p>
            {showPlaybook ? (
              <button
                type="button"
                onClick={onPlaybookClick}
                disabled={!onPlaybookClick}
                className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-foreground transition hover:border-accent/40 disabled:cursor-not-allowed disabled:opacity-60"
                title={!onPlaybookClick ? "Playbook indisponivel para este agente" : undefined}
              >
                Playbook
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
