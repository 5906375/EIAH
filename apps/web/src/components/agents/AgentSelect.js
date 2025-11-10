import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from "@/components/ui/select";
import { apiListAgents } from "@/lib/api";
import { useSession } from "@/state/sessionStore";
export default function AgentSelect({ value, onChange, }) {
    const [agents, setAgents] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const { workspaceId, token } = useSession();
    useEffect(() => {
        setIsLoading(true);
        const ensureGuardian = (items) => {
            const normalized = [...(items ?? [])];
            const hasGuardian = normalized.some((agent) => { var _a; return ((_a = agent.id) === null || _a === void 0 ? void 0 : _a.toLowerCase()) === "guardian"; });
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
            .then((data) => setAgents(ensureGuardian(data.items)))
            .catch((err) => {
            console.error("Failed to load agents", err);
            setAgents(ensureGuardian([]));
        })
            .finally(() => setIsLoading(false));
    }, [workspaceId, token]);
    return (_jsxs("div", { className: "flex flex-col gap-2", children: [_jsx("label", { id: "agent-label", className: "text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground", children: "Agente" }), _jsxs(Select, { value: value, onValueChange: onChange, children: [_jsx(SelectTrigger, { "aria-labelledby": "agent-label", className: "w-full whitespace-nowrap border-white/10 bg-surface-strong/70 text-foreground shadow-lg shadow-black/20", children: _jsx(SelectValue, { placeholder: "Selecione um agente" }) }), _jsxs(SelectContent, { children: [agents.length === 0 && (_jsx(SelectItem, { disabled: true, value: "__empty", children: isLoading ? "Carregando..." : "Nenhum agente cadastrado" })), agents.map((agent) => {
                                const pricingText = agent.pricing?.perRunCents
                                    ? ` - R$ ${(agent.pricing.perRunCents / 100).toFixed(2)}/run`
                                    : "";
                                return (_jsxs(SelectItem, { value: agent.id, children: [agent.name, pricingText] }, agent.id));
                            })] })] }), value && (_jsxs("p", { className: "text-xs text-muted-foreground", "aria-live": "polite", children: ["ID: ", value] }))] }));
}
