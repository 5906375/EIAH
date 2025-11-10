import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { apiListRunEvents } from "@/lib/api";
import RunTimeline from "../apps/web/src/components/runs/RunTimeline";
const PITCH_FIGMA_URL = "https://www.figma.com/community";
const PITCH_CANVA_URL = "https://www.canva.com/templates/search/startup-pitch/";
const PITCH_COPY_BLOCKS = [
    {
        title: "Landing Page — Hero + CTA",
        description: "Mensagem de impacto para a dobra inicial da landing.",
        content: `Título:\n🚀 Participe da nova era da IA e Blockchain\n\nSubtítulo:\nAprenda com especialistas, desbloqueie conteúdos VIP e receba um NFT exclusivo de acesso.\n\nCTA:\n👉 Quero meu acesso antecipado`,
    },
    {
        title: "Email de Nutrição — Convite com NFT",
        description: "Use como disparo de confirmação pós-cadastro.",
        content: `Assunto: [Acesso exclusivo] Sua vaga + NFT de participação está garantida?\n\nOlá, [nome]!\nVocê está prestes a entrar para uma comunidade que está moldando o futuro com IA e Blockchain.\n\n🔐 Evento fechado com especialistas\n🎟️ NFT de acesso colecionável\n📅 Data: 05/12 – Vagas limitadas\n\nGaranta sua vaga agora e receba seu NFT exclusivo → [botão CTA]`,
    },
    {
        title: "Chatbot IA — Captação consultiva",
        description: "Mensagem de abertura para o bot nas páginas estratégicas.",
        content: `Mensagem inicial:\n"Olá! 👋 Está pronto para explorar o impacto real da IA e do Blockchain nos seus resultados? Me diga seu interesse e te guio por conteúdos, eventos e materiais personalizados. Vamos nessa?"\n\nOpções sugeridas:\n- Quero participar de eventos\n- Busco e-books e conteúdo técnico\n- Quero entender como usar IA no meu negócio`,
    },
];
const statusStyles = {
    pending: { badge: "bg-amber-500/20 text-amber-200 animate-pulse", label: "Na fila" },
    running: { badge: "bg-amber-400/20 text-amber-100 animate-pulse", label: "Em Execucao" },
    success: { badge: "bg-emerald-500/20 text-emerald-200", label: "Sucesso" },
    error: { badge: "bg-red-500/20 text-red-200", label: "Erro" },
    blocked: { badge: "bg-yellow-500/20 text-yellow-200", label: "Revisão" },
};
export default function RunViewer({ run }) {
    const [events, setEvents] = useState([]);
    const [eventsError, setEventsError] = useState(null);
    const [isLoadingEvents, setIsLoadingEvents] = useState(false);
    useEffect(() => {
        if (!run?.id || run.id === "run_1234") {
            setEvents([]);
            setEventsError(null);
            setIsLoadingEvents(false);
            return;
        }
        let cancelled = false;
        let pollTimer;
        let firstLoad = true;
        const loadEvents = async () => {
            if (cancelled) {
                return;
            }
            if (firstLoad) {
                setIsLoadingEvents(true);
                setEventsError(null);
            }
            try {
                const response = await apiListRunEvents(run.id);
                if (cancelled)
                    return;
                setEvents(response.items ?? []);
                setEventsError(null);
            }
            catch (err) {
                if (cancelled)
                    return;
                const message = err instanceof Error ? err.message : "Falha ao carregar eventos.";
                setEventsError(message);
                if (firstLoad) {
                    setEvents([]);
                }
            }
            finally {
                if (!cancelled && firstLoad) {
                    setIsLoadingEvents(false);
                    firstLoad = false;
                }
            }
        };
        loadEvents();
        if (run.status === "pending" || run.status === "running" || run.status === "blocked") {
            pollTimer = setInterval(() => {
                loadEvents();
            }, 3000);
        }
        return () => {
            cancelled = true;
            if (pollTimer)
                clearInterval(pollTimer);
        };
    }, [run?.id, run?.status]);
    const statusInfo = useMemo(() => statusStyles[run.status] ?? statusStyles.success, [run.status]);
    const isInProgress = run.status === "pending" || run.status === "running" || run.status === "blocked";
    const { structured: structuredOutput, text: outputText } = useMemo(() => {
        return normalizeRunResponse(run.response);
    }, [run.response]);
    const markdownComponents = useMemo(() => ({
        table: ({ node: _node, ...props }) => {
            const { className, ...rest } = props;
            return (_jsx("div", { className: "my-4 overflow-x-auto rounded-2xl border border-white/10 bg-white/5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]", children: _jsx("table", { ...rest, className: mergeClassName("w-full border-collapse text-left text-xs text-foreground/90 md:text-sm", className) }) }));
        },
        thead: ({ node: _node, ...props }) => {
            const { className, ...rest } = props;
            return (_jsx("thead", { ...rest, className: mergeClassName("bg-white/10 text-[11px] uppercase tracking-[0.2em] text-muted-foreground md:text-xs", className) }));
        },
        tbody: ({ node: _node, ...props }) => {
            const { className, ...rest } = props;
            return (_jsx("tbody", { ...rest, className: mergeClassName("divide-y divide-white/10", className) }));
        },
        tr: ({ node: _node, ...props }) => {
            const { className, ...rest } = props;
            return (_jsx("tr", { ...rest, className: mergeClassName("transition-colors hover:bg-accent/10 even:bg-white/5", className) }));
        },
        th: ({ node: _node, ...props }) => {
            const { className, ...rest } = props;
            return (_jsx("th", { ...rest, className: mergeClassName("px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground md:text-xs", className) }));
        },
        td: ({ node: _node, ...props }) => {
            const { className, ...rest } = props;
            return (_jsx("td", { ...rest, className: mergeClassName("px-4 py-3 align-top text-xs leading-relaxed text-foreground/80 md:text-sm", className) }));
        },
    }), []);
    const handleDownloadJson = useCallback(() => {
        const blob = new Blob([JSON.stringify(run, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `run-${run.id}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }, [run]);
    const handleDownloadPdf = useCallback(async () => {
        const { jsPDF } = await import("jspdf");
        const doc = new jsPDF({ unit: "pt", format: "a4" });
        if (structuredOutput) {
            renderStructuredPdf(doc, { run, data: structuredOutput });
            doc.save(`run-${run.id}.pdf`);
            return;
        }
        doc.setFontSize(11);
        const text = outputText || "Sem conteudo disponivel.";
        const lines = doc.splitTextToSize(text, 520);
        doc.text(lines, 40, 60);
        const pageCount = doc.getNumberOfPages();
        const lastPage = pageCount > 0 ? pageCount : 1;
        doc.setPage(lastPage);
        doc.setFontSize(10);
        const pageHeight = doc.internal.pageSize.getHeight();
        doc.text(`Run ${run.id}`, 40, pageHeight - 40);
        doc.save(`run-${run.id}.pdf`);
    }, [run, outputText, structuredOutput]);
    const handleSendAlert = useCallback(() => {
        const summary = `Run ${run.id.slice(0, 8)} (${run.agent})`;
        const payload = {
            id: run.id,
            agent: run.agent,
            status: run.status,
            costCents: run.costCents,
            tookMs: run.meta?.tookMs,
        };
        if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("eiah:run-alert", {
                detail: { summary, payload },
            }));
        }
        console.info("[RunViewer] alerta emitido", payload);
    }, [run]);
    return (_jsxs("div", { className: "glass-subtle flex h-full flex-col gap-4 p-6", children: [_jsxs("header", { className: "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", children: [_jsxs("div", { children: [_jsx("p", { className: "text-xs uppercase tracking-[0.3em] text-muted-foreground", children: "Run ativo" }), _jsxs("h3", { className: "text-lg font-semibold text-foreground", children: ["#", run.id.slice(0, 8), " \u2014 ", run.agent] })] }), _jsxs("div", { className: "flex flex-wrap items-center gap-3 text-xs text-muted-foreground", children: [_jsx("span", { className: `rounded-full px-3 py-1 font-semibold ${statusInfo.badge}`, children: statusInfo.label }), typeof run.meta?.tookMs === "number" && _jsxs("span", { className: "pill", children: [run.meta.tookMs, " ms"] }), typeof run.costCents === "number" && (_jsxs("span", { className: "pill", children: ["R$ ", (run.costCents / 100).toFixed(2)] }))] })] }), _jsx("div", { className: "glass-panel flex-1 overflow-hidden", children: isInProgress ? (_jsxs("div", { className: "flex h-full min-h-[160px] flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-amber-400/40 bg-amber-400/10 p-6 text-xs text-amber-100", children: [_jsx("div", { className: "h-8 w-8 animate-spin rounded-full border-2 border-amber-200 border-t-transparent" }), _jsx("p", { className: "text-center text-xs leading-relaxed text-amber-100/90", children: "Execucao em andamento. A timeline abaixo sera atualizada automaticamente." })] })) : (_jsx("div", { className: "max-h-[60vh] overflow-auto rounded-3xl bg-black/40 p-4 text-sm leading-relaxed text-foreground/90 md:max-h-[50vh]", children: structuredOutput ? (_jsx(StructuredRecommendationView, { run: run, data: structuredOutput, markdownComponents: markdownComponents })) : outputText ? (_jsx(ReactMarkdown, { components: markdownComponents, children: outputText })) : (_jsx("p", { className: "text-xs text-muted-foreground", children: "Resultado dispon\u00EDvel no painel." })) })) }), _jsx(RunTimeline, { events: events, isLoading: isLoadingEvents, error: eventsError, status: run.status }), _jsxs("footer", { className: "flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground", children: [_jsxs("span", { children: ["traceId: ", run.meta?.traceId ?? "-"] }), _jsx("button", { type: "button", className: "rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-foreground transition hover:border-accent/60 hover:text-accent", onClick: handleDownloadJson, children: "Baixar JSON" }), _jsx("button", { type: "button", className: "rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-foreground transition hover:border-accent/60 hover:text-accent", onClick: handleDownloadPdf, children: "Baixar PDF" }), _jsx("button", { type: "button", className: "rounded-full border border-accent/40 bg-accent/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-accent transition hover:border-accent/70 hover:bg-accent/25", onClick: handleSendAlert, children: "Enviar alertas" })] })] }));
}
function StructuredRecommendationView({ run, data, markdownComponents }) {
    const [copiedCopyKey, setCopiedCopyKey] = useState(null);
    const recommendations = Array.isArray(data.recomendacoes)
        ? data.recomendacoes
        : [];
    const diagnostico = isPlainObject(data.diagnostico) ? data.diagnostico : null;
    const agentState = isPlainObject(data.agentState) ? data.agentState : null;
    const briefingMarkdown = typeof data.breafing_markdown === "string"
        ? data.breafing_markdown
        : typeof data.briefing_markdown === "string"
            ? data.briefing_markdown
            : undefined;
    const structuredForm = useMemo(() => extractCampaignForm(data), [data]);
    const requestForm = useMemo(() => {
        if (!isPlainObject(run.request))
            return null;
        return extractCampaignForm(run.request);
    }, [run.request]);
    const form = structuredForm ?? requestForm;
    const structuredPitchForm = useMemo(() => extractPitchForm(data), [data]);
    const requestPitchForm = useMemo(() => {
        if (!isPlainObject(run.request))
            return null;
        return extractPitchForm(run.request);
    }, [run.request]);
    const pitchForm = structuredPitchForm ?? requestPitchForm;
    const structuredJ360Form = useMemo(() => extractJ360Form(data), [data]);
    const requestJ360Form = useMemo(() => {
        if (!isPlainObject(run.request))
            return null;
        return extractJ360Form(run.request);
    }, [run.request]);
    const j360Form = structuredJ360Form ?? requestJ360Form;
    const memory = isPlainObject(data.memory) ? data.memory : null;
    const previousAgentState = isPlainObject(memory?.agentStateBefore) &&
        isPlainObject((memory?.agentStateBefore).recommendations)
        ? (memory?.agentStateBefore).recommendations
        : null;
    const isPitchAgent = run.agent.toLowerCase() === "pitch";
    const isJ360Agent = run.agent.toLowerCase() === "j_360";
    const exploitationPct = typeof diagnostico?.exploracao_pct === "number" ? 100 - diagnostico.exploracao_pct : null;
    const summaryItems = useMemo(() => {
        if (isPitchAgent && pitchForm) {
            return [
                { key: "product", label: "Produto / solução", icon: "🎁", value: pitchForm.product },
                { key: "audience", label: "Audiência", icon: "👥", value: pitchForm.audience },
                { key: "pain", label: "Dor principal", icon: "⚠️", value: pitchForm.pain },
                { key: "solution", label: "Prova / diferenciais", icon: "✨", value: pitchForm.solution },
                { key: "proof", label: "Provas sociais / métricas", icon: "📈", value: pitchForm.proof },
                { key: "cta", label: "CTA desejado", icon: "📣", value: pitchForm.cta },
            ];
        }
        if (isJ360Agent && j360Form) {
            return [
                { key: "customerName", label: "Conta / Cliente", icon: "🏢", value: j360Form.customerName },
                { key: "segment", label: "Segmento", icon: "🏷️", value: j360Form.segment },
                {
                    key: "journeyStages",
                    label: "Jornada",
                    icon: "🧭",
                    value: j360Form.journeyStages && j360Form.journeyStages.length > 0
                        ? j360Form.journeyStages.join(", ")
                        : undefined,
                },
                { key: "painPoints", label: "Dores principais", icon: "⚠️", value: j360Form.painPoints },
                { key: "opportunities", label: "Oportunidades", icon: "🚀", value: j360Form.opportunities },
                { key: "risks", label: "Riscos / bloqueios", icon: "🛑", value: j360Form.risks },
                { key: "nextSteps", label: "Próximos passos", icon: "✅", value: j360Form.nextSteps },
            ];
        }
        if (form) {
            return [
                { key: "goal", label: "Objetivo", icon: "🎯", value: form.goal },
                { key: "audience", label: "Público-alvo", icon: "👥", value: form.audience },
                { key: "budget", label: "Orçamento", icon: "💰", value: form.budget },
                { key: "kpis", label: "KPIs", icon: "📊", value: form.kpis },
                { key: "toneProfile", label: "Tom / Perfil", icon: "🗣️", value: form.toneProfile },
            ];
        }
        return [];
    }, [form, isPitchAgent, pitchForm, isJ360Agent, j360Form]);
    const summarySubtitle = useMemo(() => {
        if (isPitchAgent) {
            return "Produto, dor e CTA informados no briefing original.";
        }
        if (isJ360Agent) {
            return "Conta, jornada e riscos informados no briefing original.";
        }
        return "Objetivo, público e canais informados no briefing original.";
    }, [isPitchAgent, isJ360Agent]);
    const hasSummaryData = summaryItems.length > 0;
    const handleRecommendationAction = (action, payload) => {
        if (typeof window === "undefined")
            return;
        window.dispatchEvent(new CustomEvent("eiah:run-recommendation-action", {
            detail: {
                action,
                runId: run.id,
                agent: run.agent,
                recommendation: payload,
            },
        }));
    };
    const handleCopyBlock = async (title, content) => {
        try {
            await navigator.clipboard.writeText(content);
            setCopiedCopyKey(title);
            setTimeout(() => setCopiedCopyKey(null), 2000);
        }
        catch (error) {
            console.warn("Falha ao copiar", error);
        }
    };
    return (_jsxs("div", { className: "space-y-6 text-sm", children: [!briefingMarkdown && hasSummaryData && (_jsxs("section", { className: "space-y-2", children: [_jsxs("header", { className: "space-y-1", children: [_jsx("h4", { className: "text-base font-semibold text-foreground", children: "Resumo estrat\u00E9gico" }), _jsx("p", { className: "text-xs text-muted-foreground", children: summarySubtitle })] }), _jsxs("ul", { className: "space-y-1 text-sm text-foreground/90", children: [summaryItems.map((item) => (_jsxs("li", { className: "flex items-start gap-2", children: [_jsx("span", { className: "text-lg", "aria-hidden": true, children: item.icon }), _jsxs("span", { children: [_jsxs("span", { className: "font-semibold text-foreground", children: [item.label, ":"] }), item.value ? (_jsxs(_Fragment, { children: [" ", item.value] })) : (_jsx("span", { className: "italic text-muted-foreground", children: " Informe este campo no formul\u00E1rio." }))] })] }, item.key))), !isPitchAgent && !isJ360Agent && form && (_jsxs(_Fragment, { children: [_jsxs("li", { className: "flex items-start gap-2", children: [_jsx("span", { className: "text-lg", "aria-hidden": true, children: "\uD83D\uDCC5" }), _jsxs("span", { children: [_jsx("span", { className: "font-semibold text-foreground", children: "Lan\u00E7amento:" }), form.launchDate ? (_jsxs(_Fragment, { children: [" ", form.launchDate] })) : (_jsx("span", { className: "italic text-muted-foreground", children: " Informe a data-alvo." }))] })] }), _jsxs("li", { className: "flex items-start gap-2", children: [_jsx("span", { className: "text-lg", "aria-hidden": true, children: "\uD83D\uDDD3\uFE0F" }), _jsxs("span", { children: [_jsx("span", { className: "font-semibold text-foreground", children: "Marcos:" }), form.deadline ? (_jsxs(_Fragment, { children: [" ", form.deadline] })) : (_jsx("span", { className: "italic text-muted-foreground", children: " Adicione marcos para orientar o cronograma." }))] })] })] }))] }), !isPitchAgent && !isJ360Agent && form ? (_jsxs(_Fragment, { children: [form.channels.length > 0 ? (_jsx("div", { className: "flex flex-wrap gap-2 text-[11px] text-muted-foreground", children: form.channels.map((channel) => (_jsx("span", { className: "pill", children: channel }, channel))) })) : (_jsx("p", { className: "text-xs italic text-muted-foreground", children: "Selecione os canais priorit\u00E1rios para visualizar recomenda\u00E7\u00F5es dedicadas." })), form.toneNotes && (_jsxs("p", { className: "text-xs text-muted-foreground", children: [_jsx("span", { className: "font-semibold text-foreground", children: "Observa\u00E7\u00F5es de tom:" }), " ", form.toneNotes] })), form.notes && (_jsxs("p", { className: "text-xs text-muted-foreground", children: [_jsx("span", { className: "font-semibold text-foreground", children: "Observa\u00E7\u00F5es adicionais:" }), " ", form.notes] }))] })) : null, isJ360Agent && j360Form ? (_jsxs(_Fragment, { children: [j360Form.currentTools && (_jsxs("p", { className: "text-xs text-muted-foreground", children: [_jsx("span", { className: "font-semibold text-foreground", children: "Ferramentas atuais:" }), " ", j360Form.currentTools] })), j360Form.recentEvents && (_jsxs("p", { className: "text-xs text-muted-foreground", children: [_jsx("span", { className: "font-semibold text-foreground", children: "Eventos recentes:" }), " ", j360Form.recentEvents] }))] })) : null] })), diagnostico && (_jsxs("div", { className: "flex flex-wrap gap-2 text-[11px] text-muted-foreground", children: [_jsxs("span", { className: "pill bg-white/10 text-foreground", children: ["Runs analisados: ", diagnostico.total_prev_runs ?? 0] }), _jsxs("span", { className: "pill bg-white/10 text-foreground", children: ["Explora\u00E7\u00E3o: ", diagnostico.exploracao_pct ?? 0, "% \u2022 Explora\u00E7\u00E3o: ", exploitationPct ?? 0, "%"] }), _jsxs("span", { className: "pill bg-emerald-500/10 text-emerald-200", children: ["Filtrados adotados: ", diagnostico.filtrados_adotados ?? 0] }), _jsxs("span", { className: "pill bg-amber-500/10 text-amber-200", children: ["Filtrados rejeitados: ", diagnostico.filtrados_rejeitados ?? 0] })] })), recommendations.length > 0 && (_jsxs("section", { className: "space-y-3", children: [_jsxs("header", { children: [_jsx("h4", { className: "text-base font-semibold text-foreground", children: "Recomenda\u00E7\u00F5es priorizadas" }), _jsx("p", { className: "text-xs text-muted-foreground", children: "Resultado do motor com mem\u00F3ria persistente, ordenado por prioridade e score." })] }), _jsx("div", { className: "space-y-3", children: recommendations.map((rec, index) => {
                            const key = typeof rec.key === "string" ? rec.key : `rec-${index}`;
                            const rawScore = typeof rec.score === "number" ? rec.score : Number(rec.score ?? 0);
                            const score = Number.isFinite(rawScore) ? rawScore : 0;
                            const previousEntry = previousAgentState && isPlainObject(previousAgentState[key])
                                ? previousAgentState[key]
                                : null;
                            const previousScore = typeof previousEntry?.score === "number" ? previousEntry.score : null;
                            const scoreDelta = previousScore !== null ? score - previousScore : null;
                            const critical = score >= 0.8;
                            const scoreDeltaLabel = scoreDelta !== null ? (scoreDelta > 0 ? `+${scoreDelta.toFixed(2)}` : scoreDelta.toFixed(2)) : null;
                            return (_jsxs("article", { className: "rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:border-accent/40 hover:bg-accent/10", children: [_jsxs("div", { className: "flex flex-wrap items-baseline justify-between gap-2", children: [_jsxs("div", { children: [_jsxs("p", { className: "text-xs uppercase tracking-[0.3em] text-muted-foreground", children: ["Prioridade ", rec.prioridade ?? index + 1] }), _jsx("h5", { className: "text-base font-semibold text-foreground", children: rec.tatica ?? rec.key ?? `Recomendação ${index + 1}` })] }), _jsxs("div", { className: "flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground", children: [_jsxs("span", { className: "pill", children: ["Score ", score.toFixed(2)] }), scoreDelta !== null ? (_jsx("span", { className: `pill ${scoreDelta > 0
                                                            ? "bg-emerald-500/15 text-emerald-200"
                                                            : scoreDelta < 0
                                                                ? "bg-rose-500/15 text-rose-200"
                                                                : "bg-white/10 text-foreground"}`, children: scoreDelta !== null ? `Score ${scoreDeltaLabel}` : null })) : null, critical && _jsx("span", { className: "pill bg-amber-500/15 text-amber-200", children: "Pontua\u00E7\u00E3o cr\u00EDtica" }), rec.adopted ? _jsx("span", { className: "pill bg-emerald-500/20 text-emerald-200", children: "Adotada" }) : null] })] }), rec.rationale && _jsx("p", { className: "mt-3 text-sm text-foreground/90", children: rec.rationale }), rec.proximos_passos && (_jsxs("p", { className: "mt-2 text-xs text-muted-foreground", children: [_jsx("span", { className: "font-semibold text-foreground", children: "Pr\u00F3ximos passos:" }), " ", rec.proximos_passos] })), isPlainObject(rec.execucao) && (_jsxs("ul", { className: "mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground", children: [_jsx("li", { className: "pill", children: String(rec.execucao.api_sugerida ?? "LLM") }), _jsx("li", { className: "pill", children: String(rec.execucao.tipo_tarefa ?? "Tarefa") }), "custo_estimado_tokens" in rec.execucao && (_jsxs("li", { className: "pill", children: [rec.execucao.custo_estimado_tokens, " tokens"] }))] })), _jsxs("div", { className: "mt-4 flex flex-wrap items-center gap-2 text-[11px]", children: [_jsx("button", { type: "button", onClick: () => handleRecommendationAction("adopt", rec), className: "rounded-full border border-emerald-400/50 bg-emerald-400/10 px-3 py-1 font-semibold uppercase tracking-[0.3em] text-emerald-200 transition hover:border-emerald-400/70 hover:bg-emerald-400/20", children: "Marcar como adotada" }), _jsx("button", { type: "button", onClick: () => handleRecommendationAction("feedback", rec), className: "rounded-full border border-white/15 bg-white/5 px-3 py-1 font-semibold uppercase tracking-[0.3em] text-foreground transition hover:border-accent/40 hover:text-accent", children: "Adicionar feedback" })] })] }, key));
                        }) })] })), isPitchAgent && (_jsxs("section", { className: "space-y-4", children: [_jsxs("header", { className: "space-y-1", children: [_jsx("p", { className: "text-xs uppercase tracking-[0.35em] text-accent", children: "Entrega visual" }), _jsx("h4", { className: "text-base font-semibold text-foreground", children: "Ap\u00F3s a simula\u00E7\u00E3o" }), _jsx("p", { className: "text-xs text-muted-foreground", children: "Gere o deck e utilize copys aprovadas para ativar o pitch imediatamente." })] }), _jsxs("div", { className: "glass-panel flex flex-wrap items-center gap-3 rounded-3xl p-5", children: [_jsx("a", { href: PITCH_FIGMA_URL, target: "_blank", rel: "noreferrer", className: "rounded-full border border-accent/60 bg-accent/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-accent transition hover:border-accent hover:bg-accent/30", children: "Gerar deck \u2192 Figma" }), _jsx("a", { href: PITCH_CANVA_URL, target: "_blank", rel: "noreferrer", className: "rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-foreground transition hover:border-accent/40 hover:text-accent", children: "Gerar deck \u2192 Canva" })] }), _jsx("div", { className: "grid gap-4 md:grid-cols-3", children: PITCH_COPY_BLOCKS.map((block) => (_jsxs("div", { className: "glass-subtle flex flex-col gap-3 rounded-3xl p-5", children: [_jsxs("div", { children: [_jsx("h5", { className: "text-sm font-semibold text-foreground", children: block.title }), _jsx("p", { className: "text-xs text-muted-foreground", children: block.description })] }), _jsx("pre", { className: "flex-1 overflow-auto rounded-2xl bg-black/50 p-3 text-[11px] leading-relaxed text-foreground/90 whitespace-pre-wrap", children: block.content }), _jsx("button", { type: "button", onClick: () => handleCopyBlock(block.title, block.content), className: "rounded-full border border-accent/50 bg-accent/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-accent transition hover:border-accent hover:bg-accent/25", children: copiedCopyKey === block.title ? "Copiado!" : "Copiar copy" })] }, block.title))) })] })), agentState && (_jsxs("section", { className: "space-y-2", children: [_jsx("h4", { className: "text-base font-semibold text-foreground", children: "Estado persistido" }), _jsx("pre", { className: "max-h-48 overflow-auto rounded-2xl bg-black/60 p-4 text-xs text-foreground/80", children: JSON.stringify(agentState, null, 2) })] })), briefingMarkdown && (_jsxs("section", { className: "space-y-2", children: [_jsx("h4", { className: "text-base font-semibold text-foreground", children: "Briefing estruturado" }), _jsx("div", { className: "prose prose-invert max-w-none text-sm", children: _jsx(ReactMarkdown, { components: markdownComponents, children: briefingMarkdown }) })] })), !recommendations.length && !briefingMarkdown && !form && (_jsx(ReactMarkdown, { components: markdownComponents, children: JSON.stringify(data, null, 2) }))] }));
}
function normalizeRunResponse(raw) {
    if (raw === null || raw === undefined) {
        return { structured: null, text: "" };
    }
    if (typeof raw === "string") {
        const candidate = extractJsonCandidate(raw.trim());
        if (candidate) {
            const parsed = safeParseJson(candidate);
            if (parsed) {
                const payload = findRecommendationPayload(parsed) ?? parsed;
                const structured = mergeStructured(parsed, payload);
                return {
                    structured,
                    text: safeStringify(parsed, raw),
                };
            }
        }
        return { structured: null, text: raw };
    }
    if (isPlainObject(raw) && typeof raw.outputText === "string") {
        const nested = normalizeRunResponse(raw.outputText);
        if (nested.structured) {
            const merged = mergeStructured(raw, nested.structured);
            return { structured: merged, text: nested.text };
        }
    }
    if (isPlainObject(raw)) {
        const payload = findRecommendationPayload(raw) ?? raw;
        return {
            structured: mergeStructured(raw, payload),
            text: safeStringify(raw),
        };
    }
    return { structured: null, text: String(raw) };
}
function extractJsonCandidate(input) {
    if (!input)
        return null;
    const fenceMatch = input.match(/^```(?:json)?\s*\n([\s\S]*?)```$/i);
    let content = fenceMatch ? fenceMatch[1].trim() : input;
    const firstBrace = content.indexOf("{");
    const lastBrace = content.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace)
        return null;
    content = content.slice(firstBrace, lastBrace + 1);
    return content;
}
function safeParseJson(value) {
    try {
        return JSON.parse(value);
    }
    catch {
        return null;
    }
}
function safeStringify(value, fallback) {
    try {
        return JSON.stringify(value, null, 2);
    }
    catch {
        return fallback ?? String(value);
    }
}
function mergeStructured(source, payload) {
    if (payload === source)
        return payload;
    return { ...source, ...payload };
}
function isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function renderStructuredPdf(doc, context) {
    const { run, data } = context;
    const margin = 40;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const usableWidth = pageWidth - margin * 2;
    let cursorY = margin;
    const ensureSpace = (needed = 18) => {
        if (cursorY + needed > pageHeight - margin) {
            doc.addPage();
            cursorY = margin;
        }
    };
    const addHeading = (text) => {
        ensureSpace(26);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(16);
        doc.text(text, margin, cursorY);
        cursorY += 20;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
    };
    const addSubheading = (text) => {
        ensureSpace(22);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(13);
        doc.text(text, margin, cursorY);
        cursorY += 16;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
    };
    const addParagraph = (text) => {
        if (!text)
            return;
        const lines = doc.splitTextToSize(text, usableWidth);
        lines.forEach((line) => {
            ensureSpace(14);
            doc.text(line, margin, cursorY);
            cursorY += 14;
        });
    };
    const addBulletList = (items) => {
        items
            .filter(Boolean)
            .forEach((item) => {
            const lines = doc.splitTextToSize(item, usableWidth - 14);
            ensureSpace(14);
            doc.text("•", margin, cursorY);
            lines.forEach((line, index) => {
                doc.text(line, margin + 12, cursorY);
                if (index < lines.length - 1) {
                    cursorY += 14;
                    ensureSpace(14);
                }
            });
            cursorY += 14;
        });
    };
    const addSpacer = (size = 12) => {
        ensureSpace(size);
        cursorY += size;
    };
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(`Run ${run.id} — ${run.agent}`, margin, cursorY);
    cursorY += 22;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    addParagraph(`Status: ${run.status.toUpperCase()} | Custo estimado: ${run.costCents ? `R$ ${(run.costCents / 100).toFixed(2)}` : "—"} | Tempo: ${typeof run.meta?.tookMs === "number" ? `${run.meta.tookMs} ms` : "—"}`);
    addParagraph(`Diagnóstico: ${formatDiagnostic(data.diagnostico)}`);
    const briefingMarkdown = typeof data.breafing_markdown === "string"
        ? data.breafing_markdown
        : typeof data.briefing_markdown === "string"
            ? data.briefing_markdown
            : "";
    const sections = parseMarkdownSections(briefingMarkdown);
    const formFromStructured = extractCampaignForm(data);
    const formFromRequest = isPlainObject(run.request)
        ? extractCampaignForm(run.request)
        : null;
    const form = formFromStructured ?? formFromRequest;
    const summary = splitSectionContent(sections.get("1. Resumo e KPIs") ?? []);
    if (summary.paragraphs.length || summary.bullets.length) {
        addHeading("Resumo estratégico");
        summary.paragraphs.forEach(addParagraph);
        if (summary.bullets.length) {
            addSubheading("KPIs simulados");
            addBulletList(summary.bullets);
        }
    }
    else if (form) {
        addHeading("Resumo estratégico");
        addParagraph(`Objetivo: ${form.goal ?? "—"}`);
        addParagraph(`Público-alvo: ${form.audience ?? "—"}`);
        addParagraph(`Orçamento: ${form.budget ?? "—"}`);
        addParagraph(`KPIs: ${form.kpis ?? "—"}`);
        addParagraph(`Perfil de tom: ${form.toneProfile ?? "—"}`);
        if (form.launchDate)
            addParagraph(`Lançamento: ${form.launchDate}`);
        if (form.deadline)
            addParagraph(`Marcos: ${form.deadline}`);
        if (form.channels.length) {
            addSubheading("Canais selecionados");
            addBulletList(form.channels);
        }
        if (form.toneNotes)
            addParagraph(`Notas de tom: ${form.toneNotes}`);
        if (form.notes)
            addParagraph(`Observações: ${form.notes}`);
    }
    const recommendations = Array.isArray(data.recomendacoes)
        ? data.recomendacoes
        : [];
    if (recommendations.length) {
        addHeading("Recomendações priorizadas");
        recommendations.forEach((rec, index) => {
            const title = `${rec.prioridade ?? index + 1}. ${String(rec.tatica ?? rec.key ?? "Recomendação")}`;
            addSubheading(title);
            if (typeof rec.rationale === "string") {
                addParagraph(rec.rationale);
            }
            const items = [];
            if (typeof rec.proximos_passos === "string") {
                items.push(`Próximos passos: ${rec.proximos_passos}`);
            }
            if (isPlainObject(rec.execucao)) {
                const exec = rec.execucao;
                items.push(`Execução sugerida: ${String(exec.tipo_tarefa ?? "Tarefa")} via ${String(exec.api_sugerida ?? "LLM")} (~${exec.custo_estimado_tokens ?? "?"} tokens)`);
            }
            items.push(`Score: ${typeof rec.score === "number" ? rec.score.toFixed(2) : rec.score ?? "0"} | Status: ${rec.adopted ? "ADOTADA" : "PENDENTE"}`);
            addBulletList(items);
        });
    }
    const timelineRows = extractTimelineRows(sections.get("2. Timeline") ?? []);
    if (timelineRows.length) {
        addHeading("Cronograma detalhado");
        timelineRows.forEach((row) => {
            addParagraph(`[${row.periodo}] ${row.atividade}`);
            addParagraph(row.descricao);
            addSpacer(4);
        });
    }
    const observations = splitSectionContent(sections.get("7. Insights automatizados") ?? []);
    if (observations.bullets.length || observations.paragraphs.length) {
        addHeading("Observações táticas");
        observations.paragraphs.forEach(addParagraph);
        addBulletList(observations.bullets);
    }
    const ctaSection = splitSectionContent(sections.get("5. Próximos passos com datas-chave") ?? []);
    if (ctaSection.bullets.length || ctaSection.paragraphs.length) {
        addHeading("CTA e próximos passos");
        ctaSection.paragraphs.forEach(addParagraph);
        addBulletList(ctaSection.bullets);
    }
    if (run.agent.toLowerCase() === "pitch") {
        addHeading("Entregáveis pós-run");
        addParagraph("Utilize os links de deck e as copys aprovadas para acelerar a próxima reunião.");
        addBulletList([
            `Deck visual no Figma: ${PITCH_FIGMA_URL}`,
            `Deck visual no Canva: ${PITCH_CANVA_URL}`,
        ]);
        addSubheading("Copys recomendadas");
        PITCH_COPY_BLOCKS.forEach((block) => {
            addParagraph(`${block.title}:`);
            addParagraph(block.content.replace(/\n+/g, " "));
            addSpacer(6);
        });
    }
    if (isPlainObject(data.agentState) && isPlainObject(data.agentState.recommendations)) {
        const stateEntries = Object.entries(data.agentState.recommendations);
        if (stateEntries.length) {
            addHeading("Memória do agente");
            stateEntries.forEach(([key, value]) => {
                if (isPlainObject(value)) {
                    const entry = value;
                    addParagraph(`${key}: status ${String(entry.status ?? "PENDENTE")} | score ${typeof entry.score === "number" ? entry.score.toFixed(2) : entry.score ?? "0"} | accepts ${entry.accepts ?? 0} | rejects ${entry.rejects ?? 0}`);
                }
            });
        }
    }
    addSpacer();
    doc.setFont("helvetica", "italic");
    doc.text(`Gerado em ${new Date().toLocaleString()} • Run ${run.id}`, margin, cursorY);
}
function parseMarkdownSections(markdown) {
    const sections = new Map();
    let current = "Conteúdo";
    sections.set(current, []);
    markdown.split(/\r?\n/).forEach((line) => {
        if (line.trim().startsWith("## ")) {
            current = line.replace(/^##\s*/, "").trim();
            if (!sections.has(current))
                sections.set(current, []);
        }
        else {
            sections.get(current).push(line);
        }
    });
    return sections;
}
function splitSectionContent(lines) {
    const paragraphs = [];
    const bullets = [];
    let buffer = [];
    lines.forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed === "<details><summary>Detalhar canais</summary>" || trimmed === "</details>") {
            if (buffer.length) {
                paragraphs.push(buffer.join(" "));
                buffer = [];
            }
            return;
        }
        if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
            if (buffer.length) {
                paragraphs.push(buffer.join(" "));
                buffer = [];
            }
            bullets.push(trimmed.replace(/^[-*]\s*/, "").trim());
        }
        else if (!trimmed.startsWith("|")) {
            buffer.push(trimmed);
        }
    });
    if (buffer.length) {
        paragraphs.push(buffer.join(" "));
    }
    return { paragraphs, bullets };
}
function extractTimelineRows(lines) {
    const rows = [];
    lines
        .filter((line) => line.trim().startsWith("|"))
        .filter((line) => !line.includes("---"))
        .forEach((line) => {
        const cells = line
            .split("|")
            .map((cell) => cell.trim())
            .filter(Boolean);
        if (cells.length >= 3) {
            rows.push({
                periodo: cells[0],
                atividade: cells[1],
                descricao: cells[2],
            });
        }
    });
    return rows;
}
function formatDiagnostic(value) {
    if (!isPlainObject(value))
        return "Sem histórico disponível.";
    const diag = value;
    return `prevRuns: ${diag.total_prev_runs ?? 0} • exploração: ${diag.exploracao_pct ?? 0}% • filtrados adotados: ${diag.filtrados_adotados ?? 0} • filtrados rejeitados: ${diag.filtrados_rejeitados ?? 0}`;
}
const mergeClassName = (...classes) => classes.filter(Boolean).join(" ");
function extractCampaignForm(data) {
    const tryFromObject = (obj) => {
        if (!obj)
            return null;
        const channels = Array.isArray(obj.channels)
            ? obj.channels.filter((item) => typeof item === "string")
            : [];
        return {
            goal: typeof obj.goal === "string" ? obj.goal : undefined,
            audience: typeof obj.audience === "string" ? obj.audience : undefined,
            budget: typeof obj.budget === "string" ? obj.budget : undefined,
            channels,
            kpis: typeof obj.kpis === "string" ? obj.kpis : undefined,
            notes: typeof obj.notes === "string" ? obj.notes : undefined,
            toneProfile: typeof obj.toneProfile === "string" ? obj.toneProfile : undefined,
            toneNotes: typeof obj.toneNotes === "string" ? obj.toneNotes : undefined,
            launchDate: typeof obj.launchDate === "string" ? obj.launchDate : undefined,
            deadline: typeof obj.deadline === "string" ? obj.deadline : undefined,
        };
    };
    if (isPlainObject(data.form)) {
        return tryFromObject(data.form);
    }
    if (isPlainObject(data.params) && isPlainObject(data.params.form)) {
        return tryFromObject(data.params.form);
    }
    if (Array.isArray(data.plan)) {
        for (const entry of data.plan) {
            if (isPlainObject(entry) && isPlainObject(entry.params) && isPlainObject(entry.params.form)) {
                const result = tryFromObject(entry.params.form);
                if (result)
                    return result;
            }
        }
    }
    if (isPlainObject(data.metadata) && isPlainObject(data.metadata.form)) {
        return tryFromObject(data.metadata.form);
    }
    if (isPlainObject(data.rawPayload)) {
        return tryFromObject(data.rawPayload);
    }
    return null;
}
function extractPitchForm(data) {
    const tryFromObject = (obj) => {
        if (!obj)
            return null;
        return {
            product: typeof obj.product === "string" ? obj.product : undefined,
            audience: typeof obj.audience === "string" ? obj.audience : undefined,
            pain: typeof obj.pain === "string" ? obj.pain : undefined,
            solution: typeof obj.solution === "string" ? obj.solution : undefined,
            proof: typeof obj.proof === "string" ? obj.proof : undefined,
            cta: typeof obj.cta === "string" ? obj.cta : undefined,
        };
    };
    if (isPlainObject(data.form)) {
        return tryFromObject(data.form);
    }
    if (isPlainObject(data.metadata) && isPlainObject(data.metadata.form)) {
        return tryFromObject(data.metadata.form);
    }
    if (isPlainObject(data.rawPayload)) {
        return tryFromObject(data.rawPayload);
    }
    if (isPlainObject(data.params) && isPlainObject(data.params.form)) {
        return tryFromObject(data.params.form);
    }
    if (Array.isArray(data.plan)) {
        for (const entry of data.plan) {
            if (isPlainObject(entry) && isPlainObject(entry.params)) {
                const params = entry.params;
                if (isPlainObject(params.form)) {
                    const result = tryFromObject(params.form);
                    if (result)
                        return result;
                }
            }
        }
    }
    return null;
}
function extractJ360Form(data) {
    const tryFromObject = (obj) => {
        if (!obj)
            return null;
        const stages = Array.isArray(obj.journeyStages)
            ? obj.journeyStages.filter((item) => typeof item === "string")
            : undefined;
        return {
            customerName: typeof obj.customerName === "string" ? obj.customerName : undefined,
            segment: typeof obj.segment === "string" ? obj.segment : undefined,
            painPoints: typeof obj.painPoints === "string" ? obj.painPoints : undefined,
            currentTools: typeof obj.currentTools === "string" ? obj.currentTools : undefined,
            journeyStages: stages,
            recentEvents: typeof obj.recentEvents === "string" ? obj.recentEvents : undefined,
            opportunities: typeof obj.opportunities === "string" ? obj.opportunities : undefined,
            risks: typeof obj.risks === "string" ? obj.risks : undefined,
            nextSteps: typeof obj.nextSteps === "string" ? obj.nextSteps : undefined,
        };
    };
    if (isPlainObject(data.form)) {
        return tryFromObject(data.form);
    }
    if (isPlainObject(data.metadata) && isPlainObject(data.metadata.form)) {
        return tryFromObject(data.metadata.form);
    }
    if (isPlainObject(data.rawPayload)) {
        return tryFromObject(data.rawPayload);
    }
    if (isPlainObject(data.params) && isPlainObject(data.params.form)) {
        return tryFromObject(data.params.form);
    }
    if (Array.isArray(data.plan)) {
        for (const entry of data.plan) {
            if (isPlainObject(entry) && isPlainObject(entry.params)) {
                const params = entry.params;
                if (isPlainObject(params.form)) {
                    const result = tryFromObject(params.form);
                    if (result)
                        return result;
                }
            }
        }
    }
    return null;
}
function findRecommendationPayload(node, depth = 0) {
    if (depth > 6 || node === null || node === undefined)
        return null;
    if (typeof node === "string") {
        const candidate = extractJsonCandidate(node.trim());
        if (candidate) {
            const parsed = safeParseJson(candidate);
            if (parsed) {
                return findRecommendationPayload(parsed, depth + 1);
            }
        }
        return null;
    }
    if (isPlainObject(node)) {
        const obj = node;
        if (Array.isArray(obj.recomendacoes)) {
            return obj;
        }
        if (isPlainObject(obj.optimized) && Array.isArray(obj.optimized.recomendacoes)) {
            return obj.optimized;
        }
        if (Array.isArray(obj.outputs)) {
            for (const entry of obj.outputs) {
                if (isPlainObject(entry)) {
                    const data = entry.data ?? entry;
                    const payload = findRecommendationPayload(data, depth + 1);
                    if (payload)
                        return payload;
                }
                else {
                    const payload = findRecommendationPayload(entry, depth + 1);
                    if (payload)
                        return payload;
                }
            }
        }
        const candidates = [];
        if (isPlainObject(obj.result))
            candidates.push(obj.result);
        if (isPlainObject(obj.metadata))
            candidates.push(obj.metadata);
        if (Array.isArray(obj.data))
            candidates.push(...obj.data);
        Object.values(obj).forEach((value) => candidates.push(value));
        for (const value of candidates) {
            const payload = findRecommendationPayload(value, depth + 1);
            if (payload)
                return payload;
        }
    }
    if (Array.isArray(node)) {
        for (const item of node) {
            const payload = findRecommendationPayload(item, depth + 1);
            if (payload)
                return payload;
        }
    }
    return null;
}
