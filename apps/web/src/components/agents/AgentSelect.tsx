import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiListAgents } from "@/lib/api";
import { useSession } from "@/state/sessionStore";

type Agent = {
  id: string;
  name: string;
  description?: string;
  pricing?: { perRunCents?: number };
};

export default function AgentSelect({
  value,
  onChange,
}: {
  value?: string;
  onChange: (v: string) => void;
}) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { workspaceId, token } = useSession();

  useEffect(() => {
    setIsLoading(true);

    const ensureGuardian = (items: Agent[] | null | undefined): Agent[] => {
      const normalized = [...(items ?? [])];
      const hasGuardian = normalized.some((agent) => agent.id?.toLowerCase() === "guardian");
      if (!hasGuardian) {
        normalized.push({
          id: "guardian",
          name: "Guardian",
          description: "Registros probatórios com compliance LGPD e verificabilidade pública.",
          pricing: { perRunCents: 240 },
        });
      }
      return normalized;
    };

    apiListAgents()
      .then((data) => {
        setAgents(ensureGuardian(data.items));
      })
      .catch((err) => {
        console.error("Failed to load agents", err);
        setAgents(ensureGuardian([]));
      })
      .finally(() => setIsLoading(false));
  }, [workspaceId, token]);

  return (
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
              {isLoading ? "Carregando..." : "Nenhum agente cadastrado"}
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
        <p className="text-xs text-muted-foreground" aria-live="polite">
          ID: {value}
        </p>
      )}
    </div>
  );
}
