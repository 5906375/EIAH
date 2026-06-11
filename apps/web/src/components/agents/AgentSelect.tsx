import { useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Agent } from "@/lib/api";
import { useAgents } from "@/hooks/useAgents";

function getDisplayAgentName(agent: Agent) {
  const normalizedId = (agent.id ?? "").trim().toLowerCase();
  const normalizedName = (agent.name ?? "").trim().toLowerCase();
  if (normalizedId === "eiah" || normalizedName === "eiah core") {
    return "EIAH";
  }
  return agent.name;
}

export default function AgentSelect({
  value,
  onChange,
  showPlaybook = false,
  onPlaybookClick,
  inline = false,
}: {
  value?: string;
  onChange: (v: string) => void;
  showPlaybook?: boolean;
  onPlaybookClick?: () => void;
  inline?: boolean;
}) {
  const { items, status, error } = useAgents();
  const agents = [...items].sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id));
  const isLoading = status === "idle" || status === "loading";

  useEffect(() => {
    if (value && status === "ready" && !items.some((agent) => agent.id === value)) {
      onChange("");
    }
  }, [status, items, value, onChange]);

  return (
    <div
      className={
        inline
          ? "w-full sm:w-[300px]"
          : "rounded-3xl border border-white/10 bg-surface/70 p-4 shadow-lg shadow-black/20"
      }
    >
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
            className={`w-full whitespace-nowrap border-white/10 bg-surface-strong/70 text-foreground shadow-lg shadow-black/20 ${
              inline ? "h-10 rounded-xl" : ""
            }`}
          >
            <SelectValue placeholder="Selecione um agente" />
          </SelectTrigger>
          <SelectContent>
            {agents.length === 0 && (
              <SelectItem disabled value="__empty">
                {isLoading
                  ? "Carregando..."
                  : error ?? "Nenhum agente assinado no marketplace"}
              </SelectItem>
            )}
            {agents.map((agent) => {
              const pricingText = agent.pricing?.perRunCents
                ? ` - R$ ${(agent.pricing.perRunCents / 100).toFixed(2)}/run`
                : "";
              return (
                <SelectItem key={agent.id} value={agent.id}>
                  {getDisplayAgentName(agent)}
                  {pricingText}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        {value && (
          <div className="space-y-2">
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
