import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback } from "react";
import AgentFormShell from "./components/AgentFormShell";
import SelfServiceNav from "./components/SelfServiceNav";
const channelOptions = [
    "Email",
    "Redes sociais",
    "Eventos",
    "Paid media",
    "Influencers",
    "LinkedIn",
    "TikTok",
    "Instagram",
    "YouTube",
    "Twitter / X",
    "WhatsApp",
    "SMS",
    "Blog / SEO",
    "Podcasts",
    "Comunidades",
    "Parcerias",
];
const initialValues = {
    goal: "",
    kpis: "",
    audience: "",
    channels: [],
    budget: "",
    toneProfile: "Inspirador",
    toneNotes: "",
    launchDate: "",
    deadline: "",
    notes: "",
};
export default function SelfServiceMktPage() {
    const buildRequest = useCallback((values) => {
        const now = new Date();
        const todayIso = now.toISOString().split("T")[0];
        const todayDisplay = now.toLocaleDateString("pt-BR");
        const launchDate = values.launchDate ? new Date(`${values.launchDate}T00:00:00`) : null;
        const isValidLaunchDate = launchDate instanceof Date && !Number.isNaN(launchDate.getTime());
        const launchDateDisplay = isValidLaunchDate ? launchDate.toLocaleDateString("pt-BR") : "não informado";
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const msPerDay = 1000 * 60 * 60 * 24;
        const daysToLaunch = isValidLaunchDate
            ? Math.ceil((launchDate.getTime() - startOfToday) / msPerDay)
            : null;
        const sprintMode = typeof daysToLaunch === "number" && daysToLaunch >= 0 && daysToLaunch <= 30;
        let launchTimingSuffix = "";
        if (typeof daysToLaunch === "number") {
            if (daysToLaunch > 0) {
                launchTimingSuffix = ` (faltam ${daysToLaunch} dias)`;
            }
            else if (daysToLaunch === 0) {
                launchTimingSuffix = " (lançamento ocorre hoje)";
            }
            else {
                launchTimingSuffix = ` (lançamento ocorreu há ${Math.abs(daysToLaunch)} dias)`;
            }
        }
        const channelList = values.channels.length > 0 ? values.channels.join(", ") : "não informado";
        const instructions = [
            "Você é o agente MKT. Aplique o modelo padronizado abaixo para entregar um briefing coeso.",
            `Data-base (hoje): ${todayDisplay} (ISO ${todayIso}).`,
            `Data de lançamento informada: ${launchDateDisplay}${launchTimingSuffix}.`,
            sprintMode
                ? "Ative MODO SPRINT: detalhe checkpoints semanais, priorize tarefas críticas e indicativos de risco para execução em até 30 dias."
                : typeof daysToLaunch === "number" && daysToLaunch < 0
                    ? "Lançamento já ocorreu: foque em retroativo, quick wins de pós-lançamento e planos de reengajamento imediato."
                    : "Modo padrão: organize a jornada com marcos quinzenais/mensais e monitoramento contínuo.",
            "Estrutura obrigatória da resposta (use Markdown):",
            "## 1. Resumo e KPIs — objetivo, público, orçamento e KPIs com metas quantitativas por canal (ex.: CTR ≥ 2,5%, CPL ≤ R$ 40).",
            "## 2. Timeline — tabela Markdown com cabeçalho '| Período | Atividade | Descrição |'. Utilize datas relativas ao dia de hoje e/ou ao lançamento (ex.: 'Semana 0-1', 'T-15 dias', '+30 dias').",
            "   - Concentre-se em 4 a 6 linhas que cubram fases de pré, lançamento e pós-campanha.",
            "## 3. Canais e estratégias — para cada canal selecionado, descreva abordagem, conteúdo-chave e meta numérica. Inclua recomendação de revisão semanal.",
            "   - Utilize um bloco <details><summary>Detalhar canais</summary> ... </details> quando possível para listar táticas por canal sem perder legibilidade.",
            "## 4. Integração e mensuração — detalhe fontes de dados (GA4, HubSpot, RD Station, etc.), frequência de atualização e formato de relatório (dashboard, PDF).",
            "## 5. Próximos passos com datas-chave — lista numerada com responsável sugerido e prazo (relativo ou data).",
            "## 6. Aprendizados e cross-run — se houver histórico em metadata.previousRuns, compare resultados e extraia 3 recomendações. Caso contrário, registre que nenhum histórico foi informado.",
            "## 7. Insights automatizados — destaque top 3 recomendações priorizadas para a próxima semana, como se fossem um mini dashboard de aprendizado.",
            `Perfil de tom selecionado: ${values.toneProfile}. Ajuste linguagem, CTA e exemplos para refletir esse tom.`,
            values.toneNotes
                ? `Notas adicionais sobre tom/voz: ${values.toneNotes}.`
                : "Sem notas adicionais sobre tom além do preset.",
            "Sempre indique quando algum dado não foi fornecido e evite anos absolutos inconsistentes; prefira datas relativas com referência à data-base.",
            "",
            "Dados fornecidos pelo usuário:",
            `Objetivo principal: ${values.goal || "não informado"}.`,
            `KPIs/métricas informados: ${values.kpis || "não informado"}.`,
            `Audiência alvo: ${values.audience || "não informado"}.`,
            `Canais selecionados: ${channelList}.`,
            `Data de lançamento (ISO): ${values.launchDate || "não informada"}.`,
            `Budget disponível: ${values.budget || "não informado"}.`,
            `Notas sobre marcos/cronograma: ${values.deadline || "não informado"}.`,
            `Observações adicionais: ${values.notes || "não informado"}.`,
        ];
        return {
            prompt: instructions.join("\n"),
            metadata: {
                form: values,
                domain: "marketing",
                baseDate: todayIso,
                launchDate: isValidLaunchDate ? values.launchDate : null,
                daysToLaunch,
                sprintMode,
                toneProfile: values.toneProfile,
                toneNotes: values.toneNotes || null,
                compareRuns: true,
            },
            rawPayload: values,
        };
    }, []);
    return (_jsxs("div", { className: "space-y-6", children: [_jsx(SelfServiceNav, { currentSlug: "mkt" }), _jsx(AgentFormShell, { agentId: "MKT", title: "Briefing de Campanha", description: "Re\u00FAna os dados principais e receba um plano de campanha multicanal personalizado pelo agente MKT.", initialValues: initialValues, buildRequest: buildRequest, children: ({ values, setValue }) => {
                    const toggleChannel = (channel) => {
                        const exists = values.channels.includes(channel);
                        const next = exists
                            ? values.channels.filter((c) => c !== channel)
                            : [...values.channels, channel];
                        setValue("channels", next);
                    };
                    return (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "grid gap-4 md:grid-cols-2", children: [_jsxs("label", { className: "flex flex-col gap-2 text-sm text-foreground", children: ["Objetivo principal", _jsx("input", { type: "text", value: values.goal, onChange: (e) => setValue("goal", e.target.value), placeholder: "Ex.: aumentar leads em 30% no Q1", className: "rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none" })] }), _jsxs("label", { className: "flex flex-col gap-2 text-sm text-foreground", children: ["KPIs / M\u00E9tricas", _jsx("input", { type: "text", value: values.kpis, onChange: (e) => setValue("kpis", e.target.value), placeholder: "CPL, CAC, visitas, engajamento...", className: "rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none" })] })] }), _jsxs("label", { className: "flex flex-col gap-2 text-sm text-foreground", children: ["Audi\u00EAncia alvo", _jsx("textarea", { value: values.audience, onChange: (e) => setValue("audience", e.target.value), placeholder: "Quem queremos alcan\u00E7ar? Perfil demogr\u00E1fico, interesses, geografia...", rows: 3, className: "rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none" })] }), _jsxs("div", { className: "space-y-2", children: [_jsx("p", { className: "text-sm font-semibold text-foreground", children: "Canais priorit\u00E1rios" }), _jsx("div", { className: "flex flex-wrap gap-2", children: channelOptions.map((channel) => {
                                            const active = values.channels.includes(channel);
                                            return (_jsx("button", { type: "button", onClick: () => toggleChannel(channel), className: `rounded-full border px-3 py-1 text-xs uppercase tracking-[0.2em] ${active
                                                    ? "border-accent bg-accent/20 text-accent"
                                                    : "border-white/10 bg-white/5 text-foreground hover:border-accent/40 hover:text-accent"}`, children: channel }, channel));
                                        }) })] }), _jsxs("div", { className: "grid gap-4 md:grid-cols-3", children: [_jsxs("label", { className: "flex flex-col gap-2 text-sm text-foreground", children: ["Budget dispon\u00EDvel", _jsx("input", { type: "text", value: values.budget, onChange: (e) => setValue("budget", e.target.value), placeholder: "Ex.: R$ 50.000", className: "rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none" })] }), _jsxs("label", { className: "flex flex-col gap-2 text-sm text-foreground", children: ["Data de lan\u00E7amento (opcional)", _jsx("input", { type: "date", value: values.launchDate, onChange: (e) => setValue("launchDate", e.target.value), className: "rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none" })] }), _jsxs("label", { className: "flex flex-col gap-2 text-sm text-foreground", children: ["Perfil de tom", _jsxs("select", { value: values.toneProfile, onChange: (e) => setValue("toneProfile", e.target.value), className: "rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none", children: [_jsx("option", { value: "Institucional", children: "Institucional \u2014 eventos / B2B" }), _jsx("option", { value: "Inspirador", children: "Inspirador \u2014 campanhas sociais / engajamento" }), _jsx("option", { value: "Pragm\u00E1tico", children: "Pragm\u00E1tico \u2014 SaaS e convers\u00E3o" })] })] })] }), _jsxs("label", { className: "flex flex-col gap-2 text-sm text-foreground", children: ["Notas adicionais sobre tom / linguagem", _jsx("input", { type: "text", value: values.toneNotes, onChange: (e) => setValue("toneNotes", e.target.value), placeholder: "Ex.: manter CTA direto, evitar jarg\u00F5es...", className: "rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none" })] }), _jsxs("label", { className: "flex flex-col gap-2 text-sm text-foreground", children: ["Notas de marcos / cronograma", _jsx("input", { type: "text", value: values.deadline, onChange: (e) => setValue("deadline", e.target.value), placeholder: "Ex.: Pr\u00E9-campanha T-45 dias, revis\u00E3o legal T-20 dias...", className: "rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none" })] }), _jsxs("label", { className: "flex flex-col gap-2 text-sm text-foreground", children: ["Observa\u00E7\u00F5es adicionais", _jsx("textarea", { value: values.notes, onChange: (e) => setValue("notes", e.target.value), placeholder: "Restri\u00E7\u00F5es, aprendizados de campanhas anteriores, integra\u00E7\u00F5es de CRM, stakeholders...", rows: 3, className: "rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none" })] })] }));
                } })] }));
}
