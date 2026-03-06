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
  const { workspaceId, token } = useSession();

  useEffect(() => {
    setIsLoading(true);
    setLoadError(null);
    apiListAgents()
      .then((agentsResponse) => {
        const nextAgents = Array.isArray((agentsResponse as any)?.items)
          ? ((agentsResponse as any).items as Agent[]).sort((a, b) =>
              (a.name ?? a.id).localeCompare(b.name ?? b.id)
            )
          : [];
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
  }, [workspaceId, token]);

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
                  : loadError ?? "Nenhum agente assinado no marketplace"}
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
