import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
const formatEventTimestamp = (iso) => {
    try {
        return new Intl.DateTimeFormat("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        }).format(new Date(iso));
    }
    catch {
        return iso;
    }
};
const EVENT_LABELS = {
    "run.requested": "Briefing recebido",
    "run.enqueued": "Run enfileirado",
    "run.started": "Execução iniciada",
    "run.completed": "Execução concluída",
    "run.failed": "Execução falhou",
    "run.action.enqueued": "Ação enfileirada",
    "run.action.completed": "Ação concluída",
    "run.action.failed": "Ação falhou",
};
const ACTION_BADGES = {
    "run.action.enqueued": "border-cyan-400/40 bg-cyan-400/10 text-cyan-100",
    "run.action.completed": "border-emerald-400/40 bg-emerald-400/10 text-emerald-200",
    "run.action.failed": "border-rose-500/40 bg-rose-500/15 text-rose-100",
    "run.completed": "border-emerald-400/40 bg-emerald-400/10 text-emerald-200",
    "run.failed": "border-rose-500/40 bg-rose-500/15 text-rose-100",
    "run.started": "border-amber-400/40 bg-amber-400/15 text-amber-100",
    "run.enqueued": "border-cyan-400/40 bg-cyan-400/10 text-cyan-100",
    "run.requested": "border-white/10 bg-white/5 text-foreground",
};
export default function RunTimeline({ events, isLoading, error, status }) {
    return (_jsxs("section", { className: "glass-panel max-h-[26vh] overflow-hidden", children: [_jsxs("div", { className: "mb-3 flex items-center justify-between gap-2", children: [_jsx("h4", { className: "text-sm font-semibold text-foreground", children: "Timeline do run" }), isLoading ? (_jsx("span", { className: "pill", children: "Carregando" })) : (_jsxs("span", { className: "pill", children: [events.length, " eventos"] }))] }), error ? (_jsx("div", { className: "rounded-2xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200", children: error })) : events.length === 0 ? (_jsx("div", { className: "rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-muted-foreground", children: status === "pending" || status === "running" || status === "blocked"
                    ? "Aguardando eventos do worker. Atualizaremos assim que o agente registrar progresso."
                    : "Nenhum evento registrado ainda para este run." })) : (_jsx("ul", { className: "no-scrollbar flex max-h-[18vh] flex-col gap-2 overflow-y-auto pr-1 text-xs text-muted-foreground", children: events.map((event) => {
                    const label = EVENT_LABELS[event.type] ?? event.type;
                    const badgeClass = ACTION_BADGES[event.type] ?? "border-white/10 bg-white/5 text-foreground";
                    return (_jsxs("li", { className: "rounded-2xl border border-white/5 bg-white/5 px-3 py-2 text-left", children: [_jsxs("div", { className: "flex items-center justify-between gap-3", children: [_jsx("span", { className: "text-[10px] uppercase tracking-[0.3em] text-accent", children: formatEventTimestamp(event.createdAt) }), _jsx("div", { className: "flex items-center gap-2", children: _jsx("span", { className: `rounded-full px-2 py-0.5 text-[10px] font-semibold ${badgeClass}`, children: label }) })] }), event.payload ? (_jsxs("details", { className: "mt-1 text-[11px] leading-snug text-muted-foreground", children: [_jsx("summary", { className: "cursor-pointer text-foreground/80", children: "Ver detalhes t\u00E9cnicos" }), _jsx("pre", { className: "mt-1 max-h-40 overflow-auto rounded-2xl bg-black/50 p-3 text-[10px] leading-relaxed text-foreground/80 whitespace-pre-wrap", children: JSON.stringify(event.payload, null, 2) })] })) : null] }, event.id));
                }) }))] }));
}
