import { useCallback, useEffect, useMemo, useState, type ComponentPropsWithoutRef } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import { apiListRunEvents, RunEvent, RunStatus } from "@/lib/api";
import RunTimeline from "./RunTimeline";

type RunData = {
  id: string;
  agent: string;
  status: RunStatus;
  meta?: { tookMs?: number; traceId?: string };
  request?: unknown;
  response?: unknown;
  costCents?: number;
};

type MarkdownElementProps<T extends keyof JSX.IntrinsicElements> = ComponentPropsWithoutRef<T> & { node?: unknown };

function mergeClassName(...classes: Array<string | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type AgentTheme = {
  id: string;
  heroGradient: string;
  panelBg: string;
  panelGlow: string;
  textOnHero: string;
  accent: string;
  accentSoft: string;
  badgeBg: string;
  badgeColor: string;
};

const AGENT_THEMES: Record<string, AgentTheme> = {
  pitch: {
    id: "pitch",
    heroGradient: "linear-gradient(120deg,#2a0f4d,#5c2bd6)",
    panelBg: "#160b29",
    panelGlow: "rgba(92,43,214,0.35)",
    textOnHero: "#fef9ff",
    accent: "#c084fc",
    accentSoft: "rgba(192,132,252,0.18)",
    badgeBg: "rgba(255,255,255,0.18)",
    badgeColor: "#fef9ff",
  },
  j_360: {
    id: "j360",
    heroGradient: "linear-gradient(135deg,#052f5f,#2491e3)",
    panelBg: "#06203b",
    panelGlow: "rgba(36,145,227,0.4)",
    textOnHero: "#e0f2ff",
    accent: "#5eead4",
    accentSoft: "rgba(94,234,212,0.14)",
    badgeBg: "rgba(255,255,255,0.14)",
    badgeColor: "#e0f2ff",
  },
  guardian: {
    id: "guardian",
    heroGradient: "linear-gradient(135deg,#3a0a00,#bf360c)",
    panelBg: "#1d0500",
    panelGlow: "rgba(191,54,12,0.35)",
    textOnHero: "#fde7e1",
    accent: "#f97316",
    accentSoft: "rgba(249,115,22,0.18)",
    badgeBg: "rgba(255,255,255,0.18)",
    badgeColor: "#fde7e1",
  },
  default: {
    id: "default",
    heroGradient: "linear-gradient(135deg,#0f172a,#1e3a8a)",
    panelBg: "#0f172a",
    panelGlow: "rgba(59,130,246,0.35)",
    textOnHero: "#f8fafc",
    accent: "#60a5fa",
    accentSoft: "rgba(96,165,250,0.18)",
    badgeBg: "rgba(255,255,255,0.15)",
    badgeColor: "#f8fafc",
  },
};

function getAgentTheme(agent: string): AgentTheme {
  const normalized = agent.toLowerCase();
  if (normalized in AGENT_THEMES) {
    return AGENT_THEMES[normalized];
  }
  if (normalized.includes("guardian")) {
    return AGENT_THEMES.guardian;
  }
  return AGENT_THEMES.default;
}

const PITCH_FIGMA_URL = "https://www.figma.com/community";
const PITCH_CANVA_URL = "https://www.canva.com/templates/search/startup-pitch/";
const PITCH_COPY_BLOCKS: Array<{ title: string; description: string; content: string }> = [
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

type SummaryItem = { key: string; label: string; icon: string; value?: string };

const statusStyles: Record<RunStatus, { badge: string; label: string }> = {
  pending: { badge: "bg-amber-500/20 text-amber-200 animate-pulse", label: "Na fila" },
  running: { badge: "bg-amber-400/20 text-amber-100 animate-pulse", label: "Em Execucao" },
  success: { badge: "bg-emerald-500/20 text-emerald-200", label: "Sucesso" },
  error: { badge: "bg-red-500/20 text-red-200", label: "Erro" },
  blocked: { badge: "bg-yellow-500/20 text-yellow-200", label: "Revisão" },
};

export default function RunViewer({ run }: { run: RunData }) {
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [alertFeedback, setAlertFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    if (!run?.id || run.id === "run_1234") {
      setEvents([]);
      setEventsError(null);
      setIsLoadingEvents(false);
      return;
    }

    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | undefined;
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
        if (cancelled) return;
        setEvents(response.items ?? []);
        setEventsError(null);
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Falha ao carregar eventos.";
        setEventsError(message);
        if (firstLoad) {
          setEvents([]);
        }
      } finally {
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
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [run?.id, run?.status]);

  const statusInfo = useMemo(() => statusStyles[run.status] ?? statusStyles.success, [run.status]);
  const isInProgress = run.status === "pending" || run.status === "running" || run.status === "blocked";

  const { structured: structuredOutput, text: outputText } = useMemo(() => {
    return normalizeRunResponse(run.response);
  }, [run.response]);

  const markdownComponents = useMemo<Components>(
    () => ({
      table: ({ node: _node, className, ...rest }: MarkdownElementProps<"table">) => (
        <div className="my-4 overflow-x-auto rounded-2xl border border-white/10 bg-white/5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
          <table
            {...rest}
            className={mergeClassName(
              "w-full border-collapse text-left text-xs text-foreground/90 md:text-sm",
              className
            )}
          />
        </div>
      ),
      thead: ({ node: _node, className, ...rest }: MarkdownElementProps<"thead">) => (
        <thead
          {...rest}
          className={mergeClassName(
            "bg-white/10 text-[11px] uppercase tracking-[0.2em] text-muted-foreground md:text-xs",
            className
          )}
        />
      ),
      tbody: ({ node: _node, className, ...rest }: MarkdownElementProps<"tbody">) => (
        <tbody {...rest} className={mergeClassName("divide-y divide-white/10", className)} />
      ),
      tr: ({ node: _node, className, ...rest }: MarkdownElementProps<"tr">) => (
        <tr
          {...rest}
          className={mergeClassName("transition-colors hover:bg-accent/10 even:bg-white/5", className)}
        />
      ),
      th: ({ node: _node, className, ...rest }: MarkdownElementProps<"th">) => (
        <th
          {...rest}
          className={mergeClassName(
            "px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-foreground md:text-xs",
            className
          )}
        />
      ),
      td: ({ node: _node, className, ...rest }: MarkdownElementProps<"td">) => (
        <td
          {...rest}
          className={mergeClassName(
            "px-4 py-3 align-top text-xs leading-relaxed text-foreground/80 md:text-sm",
            className
          )}
        />
      ),
    }),
    []
  );

  const createReportHtml = useCallback(
    (options?: { editable?: boolean; autoPrint?: boolean }) => {
      const reportData = structuredOutput ?? createFallbackStructuredData(run, outputText ?? "");
      const reportForms = deriveFormsForReport(reportData);
      const reportSummary = deriveSummaryForReport(reportForms, run.agent);
      return buildRunReportHtml(
        {
          run,
          data: reportData,
          summaryItems: reportSummary.items,
          summarySubtitle: reportSummary.subtitle,
          fallbackForms: reportForms,
        },
        options
      );
    },
    [run, structuredOutput, outputText]
  );

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

  const handleDownloadPdf = useCallback(() => {
    if (typeof window === "undefined") return;
    const html = createReportHtml({ editable: false, autoPrint: true });
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const pdfWindow = window.open(url, "_blank", "noopener,noreferrer");
    if (!pdfWindow) {
      const link = document.createElement("a");
      link.href = url;
      link.download = `run-${run.id}-report.html`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }, [createReportHtml, run.id]);

  const handleDownloadHtml = useCallback(() => {
    if (typeof document === "undefined") return;
    const html = createReportHtml({ editable: true });
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `run-${run.id}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [createReportHtml, run.id]);

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
      try {
        window.dispatchEvent(
          new CustomEvent("eiah:run-alert", {
            detail: { summary, payload },
          })
        );
        setAlertFeedback({
          type: "success",
          message: `Alerta emitido para ${summary}`,
        });
        setTimeout(() => setAlertFeedback(null), 3000);
      } catch (error) {
        console.warn("[RunViewer] falha ao emitir alerta", error);
        setAlertFeedback({
          type: "error",
          message: "Falha ao emitir alerta. Verifique o console.",
        });
      }
    } else {
      setAlertFeedback({
        type: "error",
        message: "Ambiente sem window disponível para emitir alerta.",
      });
    }

    console.info("[RunViewer] alerta emitido", payload);
  }, [run]);

  return (
    <div className="glass-subtle flex h-full flex-col gap-4 p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Run ativo</p>
          <h3 className="text-lg font-semibold text-foreground">
            #{run.id.slice(0, 8)} — {run.agent}
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className={`rounded-full px-3 py-1 font-semibold ${statusInfo.badge}`}>
            {statusInfo.label}
          </span>
          {typeof run.meta?.tookMs === "number" && <span className="pill">{run.meta.tookMs} ms</span>}
          {typeof run.costCents === "number" && (
            <span className="pill">R$ {(run.costCents / 100).toFixed(2)}</span>
          )}
        </div>
      </header>

      <div className="glass-panel flex-1 overflow-hidden">
        {isInProgress ? (
          <div className="flex h-full min-h-[160px] flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-amber-400/40 bg-amber-400/10 p-6 text-xs text-amber-100">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-200 border-t-transparent" />
            <p className="text-center text-xs leading-relaxed text-amber-100/90">
              Execucao em andamento. A timeline abaixo sera atualizada automaticamente.
            </p>
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-auto rounded-3xl bg-black/40 p-4 text-sm leading-relaxed text-foreground/90 md:max-h-[50vh]">
            {structuredOutput ? (
              <StructuredRecommendationView
                run={run}
                data={structuredOutput}
                markdownComponents={markdownComponents}
              />
            ) : outputText ? (
              <ReactMarkdown components={markdownComponents}>{outputText}</ReactMarkdown>
            ) : (
              <p className="text-xs text-muted-foreground">Resultado disponível no painel.</p>
            )}
          </div>
        )}
      </div>

      <RunTimeline
        events={events}
        isLoading={isLoadingEvents}
        error={eventsError}
        status={run.status}
      />

      <footer className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>traceId: {run.meta?.traceId ?? "-"}</span>
        <button
          type="button"
          className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-foreground transition hover:border-accent/60 hover:text-accent"
          onClick={handleDownloadJson}
        >
          Baixar JSON
        </button>
        <button
          type="button"
          className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-foreground transition hover:border-accent/60 hover:text-accent"
          onClick={handleDownloadPdf}
        >
          Baixar PDF
        </button>
        <button
          type="button"
          className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-foreground transition hover:border-accent/60 hover:text-accent"
          onClick={handleDownloadHtml}
        >
          Baixar HTML
        </button>
        <button
          type="button"
          className="rounded-full border border-accent/40 bg-accent/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-accent transition hover:border-accent/70 hover:bg-accent/25"
          onClick={handleSendAlert}
        >
          Enviar alertas
        </button>
        {alertFeedback && (
          <span
            className={`text-xs ${
              alertFeedback.type === "success" ? "text-emerald-300" : "text-rose-300"
            }`}
          >
            {alertFeedback.message}
          </span>
        )}
      </footer>
    </div>
  );
}

type StructuredRecommendationViewProps = {
  run: RunData;
  data: Record<string, unknown>;
  markdownComponents: Components;
};

function StructuredRecommendationView({ run, data, markdownComponents }: StructuredRecommendationViewProps) {
  const [copiedCopyKey, setCopiedCopyKey] = useState<string | null>(null);
  const recommendations = Array.isArray(data.recomendacoes)
    ? (data.recomendacoes as Record<string, unknown>[])
    : [];
  const diagnostico = isPlainObject(data.diagnostico) ? (data.diagnostico as Record<string, unknown>) : null;
  const agentState = isPlainObject(data.agentState) ? (data.agentState as Record<string, unknown>) : null;
  const briefingMarkdown =
    typeof data.breafing_markdown === "string"
      ? (data.breafing_markdown as string)
      : typeof data.briefing_markdown === "string"
      ? (data.briefing_markdown as string)
      : undefined;
  const structuredForm = useMemo(() => extractCampaignForm(data), [data]);
  const requestForm = useMemo(() => {
    if (!isPlainObject(run.request)) return null;
    return extractCampaignForm(run.request as Record<string, unknown>);
  }, [run.request]);
  const form = structuredForm ?? requestForm;
  const structuredPitchForm = useMemo(() => extractPitchForm(data), [data]);
  const requestPitchForm = useMemo(() => {
    if (!isPlainObject(run.request)) return null;
    return extractPitchForm(run.request as Record<string, unknown>);
  }, [run.request]);
  const pitchForm = structuredPitchForm ?? requestPitchForm;
  const structuredJ360Form = useMemo(() => extractJ360Form(data), [data]);
  const requestJ360Form = useMemo(() => {
    if (!isPlainObject(run.request)) return null;
    return extractJ360Form(run.request as Record<string, unknown>);
  }, [run.request]);
  const j360Form = structuredJ360Form ?? requestJ360Form;
  const memory = isPlainObject(data.memory) ? (data.memory as Record<string, unknown>) : null;
  const previousAgentState =
    isPlainObject(memory?.agentStateBefore) &&
    isPlainObject((memory?.agentStateBefore as Record<string, unknown>).recommendations)
      ? (((memory?.agentStateBefore as Record<string, unknown>).recommendations as Record<string, unknown>))
      : null;
  const isPitchAgent = run.agent.toLowerCase() === "pitch";
  const isJ360Agent = run.agent.toLowerCase() === "j_360";
  const exploitationPct = typeof diagnostico?.exploracao_pct === "number" ? 100 - diagnostico.exploracao_pct : null;
  const diagnosticStats = {
    totalPrevRuns:
      typeof diagnostico?.total_prev_runs === "number"
        ? diagnostico.total_prev_runs
        : Number(diagnostico?.total_prev_runs ?? 0),
    exploracaoPct: typeof diagnostico?.exploracao_pct === "number" ? diagnostico.exploracao_pct : Number(diagnostico?.exploracao_pct ?? 0),
    filtradosAdotados:
      typeof diagnostico?.filtrados_adotados === "number"
        ? diagnostico.filtrados_adotados
        : Number(diagnostico?.filtrados_adotados ?? 0),
    filtradosRejeitados:
      typeof diagnostico?.filtrados_rejeitados === "number"
        ? diagnostico.filtrados_rejeitados
        : Number(diagnostico?.filtrados_rejeitados ?? 0),
  };

  const summaryItems = useMemo<SummaryItem[]>(() => {
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
          value:
            j360Form.journeyStages && j360Form.journeyStages.length > 0
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


  const handleRecommendationAction = (action: "adopt" | "feedback", payload: { key?: unknown; tatica?: unknown }) => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent("eiah:run-recommendation-action", {
        detail: {
          action,
          runId: run.id,
          agent: run.agent,
          recommendation: payload,
        },
      })
    );
  };

  const handleCopyBlock = async (title: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedCopyKey(title);
      setTimeout(() => setCopiedCopyKey(null), 2000);
    } catch (error) {
      console.warn("Falha ao copiar", error);
    }
  };

  return (
    <div className="space-y-6 text-sm">
      {!briefingMarkdown && hasSummaryData && (
        <section className="space-y-2">
          <header className="space-y-1">
            <h4 className="text-base font-semibold text-foreground">Resumo estratégico</h4>
            <p className="text-xs text-muted-foreground">{summarySubtitle}</p>
          </header>
          <ul className="space-y-1 text-sm text-foreground/90">
            {summaryItems.map((item) => (
              <li key={item.key} className="flex items-start gap-2">
                <span className="text-lg" aria-hidden>
                  {item.icon}
                </span>
                <span>
                  <span className="font-semibold text-foreground">{item.label}:</span>
                  {item.value ? (
                    <> {item.value}</>
                  ) : (
                    <span className="italic text-muted-foreground"> Informe este campo no formulário.</span>
                  )}
                </span>
              </li>
            ))}
            {!isPitchAgent && !isJ360Agent && form && (
              <>
                <li className="flex items-start gap-2">
                  <span className="text-lg" aria-hidden>
                    📅
                  </span>
                  <span>
                    <span className="font-semibold text-foreground">Lançamento:</span>
                    {form.launchDate ? (
                      <> {form.launchDate}</>
                    ) : (
                      <span className="italic text-muted-foreground"> Informe a data-alvo.</span>
                    )}
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-lg" aria-hidden>
                    🗓️
                  </span>
                  <span>
                    <span className="font-semibold text-foreground">Marcos:</span>
                    {form.deadline ? (
                      <> {form.deadline}</>
                    ) : (
                      <span className="italic text-muted-foreground"> Adicione marcos para orientar o cronograma.</span>
                    )}
                  </span>
                </li>
              </>
            )}
          </ul>
          {!isPitchAgent && !isJ360Agent && form ? (
            <>
              {form.channels.length > 0 ? (
                <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                  {form.channels.map((channel) => (
                    <span key={channel} className="pill">
                      {channel}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs italic text-muted-foreground">
                  Selecione os canais prioritários para visualizar recomendações dedicadas.
                </p>
              )}
              {form.toneNotes && (
                <p className="text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">Observações de tom:</span> {form.toneNotes}
                </p>
              )}
              {form.notes && (
                <p className="text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">Observações adicionais:</span> {form.notes}
                </p>
              )}
            </>
          ) : null}
          {isJ360Agent && j360Form ? (
            <>
              {j360Form.currentTools && (
                <p className="text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">Ferramentas atuais:</span> {j360Form.currentTools}
                </p>
              )}
              {j360Form.recentEvents && (
                <p className="text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">Eventos recentes:</span> {j360Form.recentEvents}
                </p>
              )}
            </>
          ) : null}
        </section>
      )}

      {diagnostico && (
        <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
          <span className="pill bg-white/10 text-foreground">Runs analisados: {diagnosticStats.totalPrevRuns}</span>
          <span className="pill bg-white/10 text-foreground">
            Exploração: {diagnosticStats.exploracaoPct}% • Exploração: {exploitationPct ?? 0}%
          </span>
          <span className="pill bg-emerald-500/10 text-emerald-200">
            Filtrados adotados: {diagnosticStats.filtradosAdotados}
          </span>
          <span className="pill bg-amber-500/10 text-amber-200">
            Filtrados rejeitados: {diagnosticStats.filtradosRejeitados}
          </span>
        </div>
      )}

      {recommendations.length > 0 && (
        <section className="space-y-3">
          <header>
            <h4 className="text-base font-semibold text-foreground">Recomendações priorizadas</h4>
            <p className="text-xs text-muted-foreground">
              Resultado do motor com memória persistente, ordenado por prioridade e score.
            </p>
          </header>
          <div className="space-y-3">
            {recommendations.map((rec, index) => {
              const key = typeof rec.key === "string" ? rec.key : `rec-${index}`;
              const rawScore = typeof rec.score === "number" ? rec.score : Number(rec.score ?? 0);
              const score = Number.isFinite(rawScore) ? rawScore : 0;
              const previousEntry =
                previousAgentState && isPlainObject(previousAgentState[key])
                  ? (previousAgentState[key] as Record<string, unknown>)
                  : null;
              const previousScore = typeof previousEntry?.score === "number" ? previousEntry.score : null;
              const scoreDelta = previousScore !== null ? score - previousScore : null;
              const critical = score >= 0.8;
              const scoreDeltaLabel =
                scoreDelta !== null ? (scoreDelta > 0 ? `+${scoreDelta.toFixed(2)}` : scoreDelta.toFixed(2)) : null;
              const priority =
                typeof rec.prioridade === "number"
                  ? rec.prioridade
                  : Number.isFinite(Number(rec.prioridade))
                  ? Number(rec.prioridade)
                  : index + 1;
              const title =
                typeof rec.tatica === "string"
                  ? rec.tatica
                  : typeof rec.key === "string"
                  ? rec.key
                  : `Recomendação ${index + 1}`;
              const rationale = typeof rec.rationale === "string" ? rec.rationale : undefined;
              const nextSteps = typeof rec.proximos_passos === "string" ? rec.proximos_passos : undefined;
              const execucao = isPlainObject(rec.execucao) ? (rec.execucao as Record<string, unknown>) : null;
              const execApi = execucao ? String(execucao.api_sugerida ?? execucao.api ?? "LLM") : null;
              const execTask = execucao ? String(execucao.tipo_tarefa ?? execucao.tipo ?? "Tarefa") : null;
              const execTokens =
                execucao && typeof execucao.custo_estimado_tokens === "number"
                  ? `${execucao.custo_estimado_tokens} tokens`
                  : execucao && typeof execucao.tokens === "number"
                  ? `${execucao.tokens} tokens`
                  : null;

              return (
                <article
                  key={key}
                  className="rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:border-accent/40 hover:bg-accent/10"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                        Prioridade {priority}
                      </p>
                      <h5 className="text-base font-semibold text-foreground">
                        {title}
                      </h5>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="pill">
                        Score {score.toFixed(2)}
                      </span>
                      {scoreDelta !== null ? (
                        <span
                          className={`pill ${
                            scoreDelta > 0
                              ? "bg-emerald-500/15 text-emerald-200"
                              : scoreDelta < 0
                              ? "bg-rose-500/15 text-rose-200"
                              : "bg-white/10 text-foreground"
                          }`}
                        >
                          {scoreDelta !== null ? `Score ${scoreDeltaLabel}` : null}
                        </span>
                      ) : null}
                      {critical && <span className="pill bg-amber-500/15 text-amber-200">Pontuação crítica</span>}
                      {rec.adopted ? <span className="pill bg-emerald-500/20 text-emerald-200">Adotada</span> : null}
                    </div>
                  </div>
                  {rationale && <p className="mt-3 text-sm text-foreground/90">{rationale}</p>}
                  {nextSteps && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">Próximos passos:</span> {nextSteps}
                    </p>
                  )}
                  {execucao && (
                    <ul className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                      {execApi && <li className="pill">{execApi}</li>}
                      {execTask && <li className="pill">{execTask}</li>}
                      {execTokens && <li className="pill">{execTokens}</li>}
                    </ul>
                  )}
                  <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px]">
                    <button
                      type="button"
                      onClick={() => handleRecommendationAction("adopt", rec)}
                      className="rounded-full border border-emerald-400/50 bg-emerald-400/10 px-3 py-1 font-semibold uppercase tracking-[0.3em] text-emerald-200 transition hover:border-emerald-400/70 hover:bg-emerald-400/20"
                    >
                      Marcar como adotada
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRecommendationAction("feedback", rec)}
                      className="rounded-full border border-white/15 bg-white/5 px-3 py-1 font-semibold uppercase tracking-[0.3em] text-foreground transition hover:border-accent/40 hover:text-accent"
                    >
                      Adicionar feedback
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {isPitchAgent && (
        <section className="space-y-4">
          <header className="space-y-1">
            <p className="text-xs uppercase tracking-[0.35em] text-accent">Entrega visual</p>
            <h4 className="text-base font-semibold text-foreground">Após a simulação</h4>
            <p className="text-xs text-muted-foreground">
              Gere o deck e utilize copys aprovadas para ativar o pitch imediatamente.
            </p>
          </header>
          <div className="glass-panel flex flex-wrap items-center gap-3 rounded-3xl p-5">
            <a
              href={PITCH_FIGMA_URL}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-accent/60 bg-accent/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-accent transition hover:border-accent hover:bg-accent/30"
            >
              Gerar deck → Figma
            </a>
            <a
              href={PITCH_CANVA_URL}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-foreground transition hover:border-accent/40 hover:text-accent"
            >
              Gerar deck → Canva
            </a>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {PITCH_COPY_BLOCKS.map((block) => (
              <div key={block.title} className="glass-subtle flex flex-col gap-3 rounded-3xl p-5">
                <div>
                  <h5 className="text-sm font-semibold text-foreground">{block.title}</h5>
                  <p className="text-xs text-muted-foreground">{block.description}</p>
                </div>
                <pre className="flex-1 overflow-auto rounded-2xl bg-black/50 p-3 text-[11px] leading-relaxed text-foreground/90 whitespace-pre-wrap">
                  {block.content}
                </pre>
                <button
                  type="button"
                  onClick={() => handleCopyBlock(block.title, block.content)}
                  className="rounded-full border border-accent/50 bg-accent/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-accent transition hover:border-accent hover:bg-accent/25"
                >
                  {copiedCopyKey === block.title ? "Copiado!" : "Copiar copy"}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {agentState && (
        <section className="space-y-2">
          <h4 className="text-base font-semibold text-foreground">Estado persistido</h4>
          <pre className="max-h-48 overflow-auto rounded-2xl bg-black/60 p-4 text-xs text-foreground/80">
            {JSON.stringify(agentState, null, 2)}
          </pre>
        </section>
      )}

      {briefingMarkdown && (
        <section className="space-y-2">
          <h4 className="text-base font-semibold text-foreground">Briefing estruturado</h4>
          <div className="prose prose-invert max-w-none text-sm">
            <ReactMarkdown components={markdownComponents}>{briefingMarkdown}</ReactMarkdown>
          </div>
        </section>
      )}

      {!recommendations.length && !briefingMarkdown && !form && (
        <ReactMarkdown components={markdownComponents}>{JSON.stringify(data, null, 2)}</ReactMarkdown>
      )}
    </div>
  );
}

function normalizeRunResponse(raw: unknown): { structured: Record<string, unknown> | null; text: string } {
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
      const merged = mergeStructured(raw as Record<string, unknown>, nested.structured);
      return { structured: merged, text: nested.text };
    }
  }

  if (isPlainObject(raw)) {
    const payload = findRecommendationPayload(raw) ?? (raw as Record<string, unknown>);
    return {
      structured: mergeStructured(raw as Record<string, unknown>, payload),
      text: safeStringify(raw),
    };
  }

  return { structured: null, text: String(raw) };
}

function extractJsonCandidate(input: string) {
  if (!input) return null;
  const fenceMatch = input.match(/^```(?:json)?\s*\n([\s\S]*?)```$/i);
  let content = fenceMatch ? fenceMatch[1].trim() : input;
  const firstBrace = content.indexOf("{");
  const lastBrace = content.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;
  content = content.slice(firstBrace, lastBrace + 1);
  return content;
}

function safeParseJson(value: string) {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function safeStringify(value: unknown, fallback?: string) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return fallback ?? String(value);
  }
}

function mergeStructured(source: Record<string, unknown>, payload: Record<string, unknown>) {
  if (payload === source) return payload;
  return { ...source, ...payload };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type BuildRunReportHtmlOptions = {
  run: RunData;
  data: Record<string, unknown>;
  summaryItems: SummaryItem[];
  summarySubtitle: string;
  fallbackForms: ReportForms;
};

type ReportForms = {
  campaign?: CampaignForm | null;
  pitch?: PitchForm | null;
  j360?: J360Form | null;
};

function deriveFormsForReport(data: Record<string, unknown>): ReportForms {
  return {
    campaign: extractCampaignForm(data),
    pitch: extractPitchForm(data),
    j360: extractJ360Form(data),
  };
}

function deriveSummaryForReport(forms: ReportForms, agent: string): { items: SummaryItem[]; subtitle: string } {
  if (forms.pitch) {
    return {
      items: [
        { key: "product", label: "Produto / solução", icon: "🎁", value: forms.pitch.product },
        { key: "audience", label: "Audiência", icon: "👥", value: forms.pitch.audience },
        { key: "pain", label: "Dor principal", icon: "⚠️", value: forms.pitch.pain },
        { key: "solution", label: "Prova / diferenciais", icon: "✨", value: forms.pitch.solution },
        { key: "proof", label: "Provas sociais / métricas", icon: "📈", value: forms.pitch.proof },
        { key: "cta", label: "CTA desejado", icon: "📣", value: forms.pitch.cta },
      ],
      subtitle: "Produto, dor e CTA informados no briefing original.",
    };
  }

  if (forms.j360) {
    return {
      items: [
        { key: "customerName", label: "Conta / Cliente", icon: "🏢", value: forms.j360.customerName },
        { key: "segment", label: "Segmento", icon: "🏷️", value: forms.j360.segment },
        {
          key: "journeyStages",
          label: "Jornada",
          icon: "🧭",
          value:
            forms.j360.journeyStages && forms.j360.journeyStages.length > 0
              ? forms.j360.journeyStages.join(", ")
              : undefined,
        },
        { key: "painPoints", label: "Dores principais", icon: "⚠️", value: forms.j360.painPoints },
        { key: "opportunities", label: "Oportunidades", icon: "🚀", value: forms.j360.opportunities },
        { key: "risks", label: "Riscos / bloqueios", icon: "🛑", value: forms.j360.risks },
        { key: "nextSteps", label: "Próximos passos", icon: "✅", value: forms.j360.nextSteps },
      ],
      subtitle: "Conta, jornada e riscos informados no briefing original.",
    };
  }

  if (forms.campaign) {
    return {
      items: [
        { key: "goal", label: "Objetivo", icon: "🎯", value: forms.campaign.goal },
        { key: "audience", label: "Público-alvo", icon: "👥", value: forms.campaign.audience },
        { key: "budget", label: "Orçamento", icon: "💰", value: forms.campaign.budget },
        { key: "kpis", label: "KPIs", icon: "📊", value: forms.campaign.kpis },
        { key: "toneProfile", label: "Tom / Perfil", icon: "🗣️", value: forms.campaign.toneProfile },
      ],
      subtitle: "Objetivo, público e canais informados no briefing original.",
    };
  }

  return {
    items: [],
    subtitle: agent.toLowerCase() === "pitch" ? "Resumo indisponível no briefing." : "Resumo não fornecido.",
  };
}

function buildRunReportHtml(
  options: BuildRunReportHtmlOptions,
  opts: { editable?: boolean; autoPrint?: boolean } = {}
): string {
  const { run, data, summaryItems, summarySubtitle, fallbackForms } = options;
  const editable = Boolean(opts.editable);
  const autoPrint = Boolean(opts.autoPrint);
  const theme = getAgentTheme(run.agent);
  const usage = computeUsageStats(isPlainObject(data.usage) ? (data.usage as Record<string, unknown>) : data.usage);
  const memoryStats = computeMemoryStats(isPlainObject(data.memory) ? (data.memory as Record<string, unknown>) : data.memory);
  const recommendations = extractRecommendationsForReport(data);
  const briefingMarkdown =
    typeof data.breafing_markdown === "string"
      ? (data.breafing_markdown as string)
      : typeof data.briefing_markdown === "string"
      ? (data.briefing_markdown as string)
      : "";
  const sections = parseMarkdownSections(briefingMarkdown);
  const summarySection = splitSectionContent(sections.get("1. Resumo e KPIs") ?? []);
  const timelineRows = extractTimelineRows(sections.get("2. Timeline") ?? []);
  const observationSection = splitSectionContent(sections.get("7. Insights automatizados") ?? []);
  const ctaSection = splitSectionContent(sections.get("5. Próximos passos com datas-chave") ?? []);
  const now = new Date();
  const insightBullets =
    observationSection.bullets.length > 0
      ? observationSection.bullets
      : [
          "Ativar DLQs e health-checks reduz riscos de instabilidade em execuções concorrentes.",
          "Memória persistente desbloqueia recomendações melhores — priorize rollout Redis/Postgres.",
        ];

  const metricCards = [
    { label: "Status", value: run.status.toUpperCase(), icon: "⦿" },
    { label: "Custo estimado", value: formatCurrency(run.costCents), icon: "💰" },
    { label: "Memória short", value: formatNumberPtBR(memoryStats.shortTerm), icon: "🧮" },
    { label: "Memória long", value: formatNumberPtBR(memoryStats.longTerm), icon: "🗂️" },
    { label: "Memória vetorial", value: formatNumberPtBR(memoryStats.vectorMatches), icon: "🧭" },
  ];

  const summaryBlock = renderSummaryBlock({
    summaryItems,
    summarySubtitle,
    summarySection,
    fallbackForms,
  });

  const recommendationsBlock = renderRecommendationsBlock(recommendations);
  const timelineCardsHtml = timelineRows
    .map((row, index) => {
      const progress = Math.min(100, Math.max(10, Math.round(((index + 1) / timelineRows.length) * 100)));
      return `
        <article class="timeline-row">
          <p class="timeline-periodo">${sanitizeTextContent(row.periodo)}</p>
          <h3>${sanitizeTextContent(row.atividade)}</h3>
          <div class="timeline-progress"><span style="width:${progress}%"></span></div>
          <p>${sanitizeTextContent(row.descricao)}</p>
        </article>`;
    })
    .join("");
  const timelineBlock = timelineRows.length
    ? `<section class="section">
        <header>
          <h2>Timeline e marcos</h2>
          <p class="muted">Períodos e atividades prioritárias recomendadas.</p>
        </header>
        <div class="timeline">${timelineCardsHtml}</div>
      </section>`
    : "";

  const insightCardsHtml = insightBullets
    .map(
      (insight, index) => `
      <article class="insight-card ${index === 1 ? "danger" : ""}">
        ${sanitizeTextContent(insight)}
      </article>`
    )
    .join("");
  const insightsBlock = `<section class="section">
      <header>
        <h2>Insights automatizados</h2>
        <p class="muted">Pontos de atenção detectados na execução.</p>
      </header>
      <div class="insight-grid">
        ${insightCardsHtml}
      </div>
    </section>`;

  const ctaContent = `${renderParagraphMarkup(ctaSection.paragraphs)}${createListMarkup(ctaSection.bullets)}`.trim() ||
    "<p>Use os links de deck e o piloto supervisionado para acelerar o rollout.</p>";
  const ctaBlock = `<section class="section">
      <header>
        <h2>CTA e próximos passos</h2>
        <p class="muted">Ações sugeridas para a continuidade.</p>
      </header>
      <div class="insight-card" style="background:#e0f2fe;border-color:#bae6fd;color:#0f172a;">
        ${ctaContent}
      </div>
    </section>`;

  const healthUrl = getHealthUrl();
  const linkEntries = [
    { label: "Deck no Figma", url: PITCH_FIGMA_URL, description: "Base visual para storytelling." },
    { label: "Deck no Canva", url: PITCH_CANVA_URL, description: "Modelos editáveis para adaptação rápida." },
    { label: "API healthcheck", url: healthUrl, description: "Status do cluster de execução /health." },
  ];
  const linksBlock = `<section class="section">
    <header>
      <h2>Links úteis</h2>
      <p class="muted">Referências e entregáveis associados a este run.</p>
    </header>
    <ul class="link-list">
      ${linkEntries
        .map(
          (link) => `
        <li>
          <span class="link-label">${sanitizeTextContent(link.label)}</span>
          <a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.url)}</a>
          <small>${sanitizeTextContent(link.description)}</small>
        </li>`
        )
        .join("")}
    </ul>
  </section>`;

  const auditBlock = `<section class="section">
    <header>
      <h2>Audit trail</h2>
      <p class="muted">Metadados para rastreabilidade e reprocessamento.</p>
    </header>
    <dl class="audit-grid">
      <div><dt>Run ID</dt><dd>${sanitizeTextContent(run.id)}</dd></div>
      <div><dt>Trace ID</dt><dd>${sanitizeTextContent(run.meta?.traceId ?? "—")}</dd></div>
      <div><dt>Modelo</dt><dd>${sanitizeTextContent(usage.model ?? run.agent)}</dd></div>
      <div><dt>Tokens</dt><dd>${sanitizeTextContent(
        `prompt ${formatNumberPtBR(usage.promptTokens)} • completion ${formatNumberPtBR(
          usage.completionTokens
        )} • total ${formatNumberPtBR(usage.totalTokens)}`
      )}</dd></div>
      <div><dt>Memória</dt><dd>${sanitizeTextContent(
        `short ${formatNumberPtBR(memoryStats.shortTerm)} • long ${formatNumberPtBR(
          memoryStats.longTerm
        )} • vetor ${formatNumberPtBR(memoryStats.vectorMatches)}`
      )}</dd></div>
      <div><dt>Cursor</dt><dd>${sanitizeTextContent(memoryStats.cursor ?? "—")}</dd></div>
    </dl>
  </section>`;

  const metricGridHtml = metricCards.length
    ? metricCards
        .map(
          (metric) => `
        <article class="metric-card">
          <div class="metric-icon" aria-hidden="true">${sanitizeTextContent(metric.icon ?? "•")}</div>
          <div class="metric-details">
            <p class="metric-label">${sanitizeTextContent(metric.label)}</p>
            <strong>${sanitizeTextContent(metric.value)}</strong>
          </div>
        </article>`
        )
        .join("")
    : `<p class="muted">Sem métricas registradas para esta execução.</p>`;

  const recommendationsHtml =
    recommendationsBlock || `<section class="section"><p class="muted">Nenhuma recomendação estruturada disponível.</p></section>`;
  const agentSignature = renderAgentSignature(run.agent, fallbackForms);

  const wrapEditable = (html: string) =>
    !editable || !html ? html : html.replace("<section", '<section data-editable contenteditable="false"');

  return `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>Run ${escapeHtml(run.id)}</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;600;700&family=Noto+Serif:wght@400;600&family=Noto+Emoji:wght@400&display=swap');
      @page {
        size: A4;
        margin: 18mm;
      }
      :root {
        color-scheme: light;
        --hero-gradient: ${theme.heroGradient};
        --panel-bg: ${theme.panelBg};
        --panel-glow: ${theme.panelGlow};
        --hero-text: ${theme.textOnHero};
        --accent-color: ${theme.accent};
        --accent-soft: ${theme.accentSoft};
        --badge-bg: ${theme.badgeBg};
        --badge-color: ${theme.badgeColor};
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        padding: 0;
        background: #f8fafc;
        color: #0f172a;
        font-family: 'Noto Sans', 'Noto Emoji', sans-serif;
        font-size: 12px;
        line-height: 1.6;
        font-variant-ligatures: none;
        -webkit-font-smoothing: antialiased;
      }
      #toolbar {
        position: sticky;
        top: 0;
        z-index: 9999;
        display: flex;
        gap: 8px;
        padding: 8px 16px;
        background: #0f172a;
        color: #e2e8f0;
        font-family: 'Noto Sans', sans-serif;
      }
      #toolbar button {
        padding: 6px 14px;
        border-radius: 999px;
        border: none;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
      }
      #toolbar button#toggle-edit {
        background: #6366f1;
        color: #fff;
      }
      #toolbar button#save-html,
      #toolbar button#print-pdf {
        background: transparent;
        border: 1px solid rgba(255,255,255,0.45);
        color: #e2e8f0;
      }
      #toolbar button#print-pdf {
        background: #0ea5e9;
        border-color: transparent;
        color: #0f172a;
      }
      main {
        background: #ffffff;
        border-radius: 24px;
        padding: 36px 40px 48px;
        box-shadow: 0 24px 48px rgba(15, 23, 42, 0.08);
      }
      h1, h2, h3 {
        font-family: 'Noto Serif', 'Noto Emoji', serif;
        margin: 0 0 12px;
        color: #0f172a;
      }
      h1 {
        font-size: 26px;
        letter-spacing: -0.02em;
      }
      h2 {
        font-size: 18px;
      }
      h3 {
        font-size: 15px;
      }
      p {
        margin: 0 0 8px;
      }
      .muted {
        color: #475569;
        font-size: 11px;
      }
      .hero {
        background: var(--hero-gradient);
        border-radius: 30px;
        padding: 28px 32px;
        color: var(--hero-text);
        margin-bottom: 28px;
        box-shadow: 0 22px 50px rgba(15, 23, 42, 0.35);
        position: relative;
        overflow: hidden;
      }
      .hero::after {
        content: "";
        position: absolute;
        inset: 0;
        background: radial-gradient(circle at top right, rgba(59,130,246,0.45), transparent 60%);
      }
      .hero-content {
        position: relative;
        display: flex;
        justify-content: space-between;
        gap: 18px;
        flex-wrap: wrap;
      }
      .hero h1 {
        color: var(--hero-text);
        margin: 0 0 6px;
        font-size: 30px;
      }
      .hero small {
        color: rgba(248,250,252,0.85);
      }
      .hero-badges {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        align-items: center;
      }
      .badge {
        padding: 8px 14px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        background: var(--badge-bg);
        color: var(--badge-color);
      }
      .badge.status-success { background: rgba(52,211,153,0.25); color: #bbf7d0; }
      .badge.status-error { background: rgba(248,113,113,0.25); color: #fecaca; }
      .badge.status-running,
      .badge.status-pending,
      .badge.status-blocked { background: rgba(253,224,71,0.35); color: #fef9c3; }
      .metric-grid {
        display: flex;
        gap: 18px;
        margin-bottom: 32px;
        padding: 10px;
        border-radius: 28px;
        background: linear-gradient(180deg, rgba(15, 23, 42, 0.04), rgba(148, 163, 184, 0.08));
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.5);
        overflow-x: auto;
      }
      .metric-grid::-webkit-scrollbar {
        height: 6px;
      }
      .metric-grid::-webkit-scrollbar-thumb {
        background: rgba(30, 64, 175, 0.35);
        border-radius: 999px;
      }
      .metric-card {
        flex: 1;
        min-width: 190px;
        border-radius: 26px;
        padding: 20px 26px;
        background: radial-gradient(circle at top left, rgba(59, 130, 246, 0.25), transparent 55%), var(--panel-bg);
        color: var(--hero-text);
        box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.25), 0 24px 35px rgba(15, 23, 42, 0.35);
        display: flex;
        align-items: center;
        gap: 16px;
        position: relative;
      }
      .metric-card:not(:last-child)::after {
        content: "";
        position: absolute;
        right: -14px;
        top: 18%;
        bottom: 18%;
        width: 28px;
        background: radial-gradient(circle at left, rgba(15, 23, 42, 0.6), transparent 70%);
        z-index: 0;
      }
      .metric-card > * {
        position: relative;
        z-index: 1;
      }
      .metric-icon {
        width: 44px;
        height: 44px;
        border-radius: 14px;
        background: rgba(248, 250, 252, 0.1);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 22px;
        box-shadow: inset 0 0 0 1px rgba(248, 250, 252, 0.15);
      }
      .metric-label {
        text-transform: uppercase;
        font-size: 11px;
        letter-spacing: 0.15em;
        color: rgba(248, 250, 252, 0.65);
        margin-bottom: 4px;
      }
      .metric-details {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .metric-card strong {
        font-size: 18px;
        letter-spacing: 0.04em;
      }
      .insight-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 12px;
      }
      .insight-card {
        border-radius: 16px;
        padding: 14px;
        font-weight: 600;
        background: #fef3c7;
        border: 1px solid #fcd34d;
        color: #92400e;
      }
      .signature-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 12px;
      }
      .signature-card {
        border-radius: 18px;
        padding: 16px 18px;
        border: 1px solid rgba(226, 232, 240, 0.8);
        background: #ffffff;
        box-shadow: 0 14px 25px rgba(15, 23, 42, 0.08);
      }
      .signature-card.pitch {
        border-color: rgba(192, 132, 252, 0.4);
        background: rgba(249, 245, 255, 0.9);
      }
      .signature-card.j360 {
        border-color: rgba(45, 212, 191, 0.4);
        background: rgba(240, 253, 250, 0.92);
      }
      .signature-card.guardian {
        border-color: rgba(251, 191, 36, 0.5);
        background: rgba(255, 248, 235, 0.92);
      }
      .signature-card h3 {
        margin-bottom: 6px;
        font-size: 14px;
        color: #0f172a;
      }
      .signature-card p {
        margin: 0;
        font-size: 13px;
        color: #475569;
      }
      .section {
        margin-bottom: 28px;
      }
      .section:last-of-type {
        margin-bottom: 0;
      }
      .summary-list {
        list-style: none;
        padding: 0;
        margin: 12px 0 0;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 10px 16px;
      }
      .summary-list li {
        display: flex;
        gap: 8px;
        padding: 12px;
        border-radius: 14px;
        background: var(--accent-soft);
      }
      .summary-list span.icon {
        font-size: 18px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 11px;
      }
      thead {
        background: #e2e8f0;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      th, td {
        padding: 10px 12px;
        border-bottom: 1px solid #e2e8f0;
        text-align: left;
        vertical-align: top;
      }
      tbody tr:nth-of-type(odd) td {
        background: #f8fafc;
      }
      .timeline {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 12px;
      }
      .timeline-row {
        border-radius: 16px;
        padding: 16px;
        border: 1px solid #e2e8f0;
        background: #fff;
        box-shadow: inset 0 1px 0 rgba(15, 23, 42, 0.03);
      }
      .timeline-periodo {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #64748b;
        margin-bottom: 4px;
      }
      .link-list {
        list-style: none;
        padding: 0;
        margin: 0;
        display: grid;
        gap: 12px;
      }
      .link-list li {
        padding: 12px 14px;
        border-radius: 14px;
        border: 1px solid #e2e8f0;
        background: #fff;
      }
      .link-list a {
        color: #2563eb;
        text-decoration: none;
        font-weight: 600;
        display: inline-block;
        margin: 2px 0;
      }
      .link-label {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #475569;
        display: block;
      }
      .audit-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 12px;
      }
      .audit-grid dt {
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #475569;
        margin-bottom: 4px;
      }
      .audit-grid dd {
        margin: 0;
        font-weight: 600;
      }
      .report-footer {
        margin-top: 28px;
        padding-top: 14px;
        border-top: 1px solid #e2e8f0;
        display: flex;
        justify-content: space-between;
        font-size: 11px;
        color: #475569;
      }
      @media print {
        body {
          background: #fff;
        }
        #toolbar {
          display: none !important;
        }
        main {
          box-shadow: none;
          margin: 0;
          padding: 20px;
        }
        .hero {
          box-shadow: none;
        }
      }
    </style>
  </head>
  <body>
    <div id="toolbar">
      <button id="print-pdf">Exportar PDF</button>
      ${
        editable
          ? `<button id="toggle-edit">Editar</button>
      <button id="save-html">Salvar HTML</button>`
          : ""
      }
    </div>
    <div class="hero" ${editable ? 'data-editable contenteditable="false"' : ""}>
      <div class="hero-content">
        <div>
          <p class="muted">Operação #${sanitizeTextContent(run.id.slice(0, 8))}</p>
          <h1>Run ${sanitizeTextContent(run.agent)}</h1>
          <small>${sanitizeTextContent(formatDiagnostic(data.diagnostico))}</small>
          <div class="chip-group">
            ${(summaryItems.slice(0, 3) as SummaryItem[])
              .map((item) => `<span class="chip">${sanitizeTextContent(item.label)}</span>`)
              .join("")}
          </div>
        </div>
        <div class="hero-badges">
          <span class="badge status-${run.status}">${sanitizeTextContent(run.status)}</span>
          <span class="badge">Custo ${sanitizeTextContent(formatCurrency(run.costCents))}</span>
          <span class="badge">Tokens ${sanitizeTextContent(formatNumberPtBR(usage.totalTokens))}</span>
          <span class="badge">Tempo ${sanitizeTextContent(formatDuration(run.meta?.tookMs))}</span>
        </div>
      </div>
    </div>
    <main ${editable ? 'data-editable-root' : ""}>
      <section class="metric-grid"${editable ? ' data-editable contenteditable="false"' : ""}>
        ${metricGridHtml}
      </section>

      ${wrapEditable(summaryBlock)}
      ${wrapEditable(agentSignature)}
      ${wrapEditable(recommendationsHtml)}
      ${wrapEditable(timelineBlock)}
      ${wrapEditable(insightsBlock)}
      ${wrapEditable(ctaBlock)}
      ${wrapEditable(linksBlock)}
      ${wrapEditable(auditBlock)}
      <footer class="report-footer"${editable ? ' data-editable contenteditable="false"' : ""}>
        <span>Confidencial — EIAH Builder</span>
        <span>${sanitizeTextContent(now.toLocaleDateString("pt-BR"))} · Página 1 de 1</span>
      </footer>
    </main>
    <script>
(function(){
  const printBtn = document.getElementById('print-pdf');
  if (printBtn) {
    printBtn.addEventListener('click', () => {
      window.print();
    });
  }
  ${
    editable
      ? `const root = document.querySelector('[data-editable-root]');
  const toggleBtn = document.getElementById('toggle-edit');
  const saveBtn = document.getElementById('save-html');
  if (root && toggleBtn && saveBtn) {
    const editableNodes = () => root.querySelectorAll('[data-editable]');
    let editing = false;
    toggleBtn.addEventListener('click', () => {
      editing = !editing;
      editableNodes().forEach((el) => el.setAttribute('contenteditable', editing ? 'true' : 'false'));
      toggleBtn.textContent = editing ? 'Concluir edição' : 'Editar';
    });
    saveBtn.addEventListener('click', () => {
      const blob = new Blob([document.documentElement.outerHTML], { type: 'text/html;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = (document.title || 'run-report') + '.html';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(a.href), 0);
    });
  }`
      : ""
  }
  if (${autoPrint ? "true" : "false"}) {
    window.addEventListener('load', () => {
      setTimeout(() => window.print(), 350);
    }, { once: true });
  }
})();
</script>
  </body>
</html>`;
}

function renderSummaryBlock({
  summaryItems,
  summarySubtitle,
  summarySection,
  fallbackForms,
}: {
  summaryItems: SummaryItem[];
  summarySubtitle: string;
  summarySection: ReturnType<typeof splitSectionContent>;
  fallbackForms: ReportForms;
}) {
  const normalizedItems = summaryItems.filter((item) => item.value && item.value.trim().length > 0);
  let content = "";
  if (summarySection.paragraphs.length || summarySection.bullets.length) {
    content = `${renderParagraphMarkup(summarySection.paragraphs)}${createListMarkup(summarySection.bullets)}`;
  } else if (normalizedItems.length) {
    content = `<ul class="summary-list">
      ${normalizedItems
        .map(
          (item) => `
        <li>
          <span class="icon" aria-hidden="true">${item.icon}</span>
          <div>
            <strong>${sanitizeTextContent(item.label)}:</strong>
            <p>${sanitizeTextContent(item.value ?? "—")}</p>
          </div>
        </li>`
        )
        .join("")}
    </ul>`;
  } else {
    content = buildFallbackSummary(fallbackForms);
  }

  if (!content) return "";

  return `<section class="section">
    <header>
      <h2>Resumo estratégico</h2>
      <p class="muted">${sanitizeTextContent(summarySubtitle)}</p>
    </header>
    ${content}
  </section>`;
}

function renderAgentSignature(agent: string, forms: ReportForms) {
  const key = agent.toLowerCase();
  if (key === "pitch" && forms.pitch) {
    const entries = [
      { title: "Produto / solução", value: forms.pitch.product },
      { title: "Audiência", value: forms.pitch.audience },
      { title: "Dor principal", value: forms.pitch.pain },
      { title: "CTA desejado", value: forms.pitch.cta },
      { title: "Provas sociais", value: forms.pitch.proof },
    ].filter((entry) => entry.value && entry.value.trim().length > 0);
    if (!entries.length) return "";
    return `<section class="section" data-editable contenteditable="false">
      <header>
        <h2>DNA do Pitch</h2>
        <p class="muted">Resumo rápido do briefing publicitário informado.</p>
      </header>
      <div class="signature-grid">
        ${entries
          .map(
            (entry) => `
          <article class="signature-card pitch">
            <h3>${sanitizeTextContent(entry.title)}</h3>
            <p>${sanitizeTextContent(entry.value ?? "—")}</p>
          </article>`
          )
          .join("")}
      </div>
    </section>`;
  }

  if (key === "j_360" && forms.j360) {
    const entries = [
      { title: "Conta / Cliente", value: forms.j360.customerName },
      { title: "Segmento", value: forms.j360.segment },
      { title: "Ferramentas atuais", value: forms.j360.currentTools },
      { title: "Jornada", value: forms.j360.journeyStages?.join(", ") },
      { title: "Riscos", value: forms.j360.risks },
      { title: "Próximos passos", value: forms.j360.nextSteps },
    ].filter((entry) => entry.value && entry.value.trim().length > 0);
    if (!entries.length) return "";
    return `<section class="section" data-editable contenteditable="false">
      <header>
        <h2>Contexto da conta</h2>
        <p class="muted">Principais pontos da visão 360º.</p>
      </header>
      <div class="signature-grid">
        ${entries
          .map(
            (entry) => `
          <article class="signature-card j360">
            <h3>${sanitizeTextContent(entry.title)}</h3>
            <p>${sanitizeTextContent(entry.value ?? "—")}</p>
          </article>`
          )
          .join("")}
      </div>
    </section>`;
  }

  const guardianLike = key.includes("guardian");
  const source = forms.campaign;
  if (source) {
    const entries = [
      { title: "Objetivo", value: source.goal },
      { title: "Público", value: source.audience },
      { title: "Orçamento", value: source.budget },
      { title: "KPIs", value: source.kpis },
      { title: "Tom / Perfil", value: source.toneProfile },
      { title: "Canais", value: source.channels?.join(", ") },
    ].filter((entry) => entry.value && entry.value.trim().length > 0);
    if (!entries.length) return "";
    return `<section class="section" data-editable contenteditable="false">
      <header>
        <h2>${guardianLike ? "Checklist de confiabilidade" : "Contexto de campanha"}</h2>
        <p class="muted">${
          guardianLike
            ? "Campos necessários para o agente Guardian validar e ancorar evidências."
            : "Briefing base usado para gerar as recomendações."
        }</p>
      </header>
      <div class="signature-grid">
        ${entries
          .map(
            (entry) => `
          <article class="signature-card ${guardianLike ? "guardian" : ""}">
            <h3>${sanitizeTextContent(entry.title)}</h3>
            <p>${sanitizeTextContent(entry.value ?? "—")}</p>
          </article>`
          )
          .join("")}
      </div>
    </section>`;
  }

  return "";
}

function buildFallbackSummary(forms: ReportForms) {
  const pitch = forms.pitch;
  if (pitch) {
    const entries = [
      { label: "Produto / Solução", value: pitch.product },
      { label: "Audiência", value: pitch.audience },
      { label: "Dor principal", value: pitch.pain },
      { label: "Prova / Diferenciais", value: pitch.solution },
      { label: "Provas sociais", value: pitch.proof },
      { label: "CTA desejado", value: pitch.cta },
    ];
    return renderDefinitionGrid(entries);
  }

  const j360 = forms.j360;
  if (j360) {
    const entries = [
      { label: "Conta", value: j360.customerName },
      { label: "Segmento", value: j360.segment },
      { label: "Dores", value: j360.painPoints },
      { label: "Ferramentas atuais", value: j360.currentTools },
      { label: "Jornada", value: j360.journeyStages?.join(", ") },
      { label: "Oportunidades", value: j360.opportunities },
      { label: "Riscos", value: j360.risks },
      { label: "Próximos passos", value: j360.nextSteps },
    ];
    return renderDefinitionGrid(entries);
  }

  const campaign = forms.campaign;
  if (campaign) {
    const entries = [
      { label: "Objetivo", value: campaign.goal },
      { label: "Público", value: campaign.audience },
      { label: "Orçamento", value: campaign.budget },
      { label: "KPIs", value: campaign.kpis },
      { label: "Tom", value: campaign.toneProfile },
      { label: "Lançamento", value: campaign.launchDate },
      { label: "Marcos", value: campaign.deadline },
      { label: "Canais", value: campaign.channels.join(", ") },
    ];
    return renderDefinitionGrid(entries);
  }

  return "";
}

function renderDefinitionGrid(entries: Array<{ label: string; value?: string }>) {
  return `<dl class="audit-grid">
    ${entries
      .filter((entry) => Boolean(entry.value))
      .map(
        (entry) => `
      <div>
        <dt>${sanitizeTextContent(entry.label)}</dt>
        <dd>${sanitizeTextContent(entry.value ?? "—")}</dd>
      </div>`
      )
      .join("")}
  </dl>`;
}

function createFallbackStructuredData(run: RunData, fallbackText: string): Record<string, unknown> {
  const request = isPlainObject(run.request) ? (run.request as Record<string, unknown>) : {};
  const metadata = isPlainObject(request?.metadata as Record<string, unknown>) ? (request!.metadata as Record<string, unknown>) : {};
  const form = isPlainObject(metadata.form) ? (metadata.form as Record<string, unknown>) : undefined;
  const rawPayload = isPlainObject(metadata.rawPayload) ? (metadata.rawPayload as Record<string, unknown>) : undefined;
  const campaignForm =
    form ??
    (isPlainObject(rawPayload?.form) ? (rawPayload!.form as Record<string, unknown>) : undefined);

  const summaryLines: string[] = [];
  if (typeof form?.product === "string") summaryLines.push(`- Produto / solução: ${form.product}`);
  if (typeof form?.pain === "string") summaryLines.push(`- Dor principal: ${form.pain}`);
  if (typeof form?.cta === "string") summaryLines.push(`- CTA desejado: ${form.cta}`);
  if (typeof form?.audience === "string") summaryLines.push(`- Audiência: ${form.audience}`);

  const fallbackTimeline = [
    "| Período | Atividade | Descrição |",
    "| --- | --- | --- |",
    "| Semana 1 | Preparação | Configurar conectores, validar tokens e health-checks. |",
    "| Semana 2 | Execução | Rodar pilotos, observar DLQ e memória persistente. |",
    "| Semana 3 | Avaliação | Consolidar métricas, definir CTA do próximo ciclo. |",
  ].join("\n");

  const fallbackMarkdown = [
    "## 1. Resumo e KPIs",
    ...summaryLines,
    "",
    "## 2. Timeline",
    fallbackTimeline,
    "",
    "## 5. Próximos passos com datas-chave",
    "- Solicitar piloto supervisionado e ativar guardrails persistentes.",
    "- Configurar dashboards de tokens/custos para executivos.",
    "",
    "## 7. Insights automatizados",
    fallbackText.trim().length > 0 ? fallbackText.slice(0, 800) : "Sem conteúdo adicional.",
  ].join("\n");

  const diagnostic = isPlainObject(metadata.diagnostico)
    ? (metadata.diagnostico as Record<string, unknown>)
    : {};

  const recommendationFromText =
    fallbackText.trim().length > 0
      ? [
          {
            tatica: "Resumo textual",
            rationale: fallbackText.slice(0, 480),
            proximos_passos: typeof form?.cta === "string" ? form.cta : undefined,
            execucao: null,
            score: null,
            adopted: false,
          },
        ]
      : [];

  return {
    breafing_markdown: fallbackMarkdown,
    diagnostico: {
      total_prev_runs: diagnostic.total_prev_runs ?? 0,
      exploracao_pct: diagnostic.exploracao_pct ?? 0,
      filtrados_adotados: diagnostic.filtrados_adotados ?? 0,
      filtrados_rejeitados: diagnostic.filtrados_rejeitados ?? 0,
    },
    usage: metadata.usage ?? {
      total_tokens: null,
      prompt_tokens: null,
      completion_tokens: null,
      model: metadata.model ?? run.agent,
    },
    memory: metadata.memory ?? {
      shortTerm: [],
      longTerm: [],
      vectorMatches: [],
      agentStateBefore: metadata.agentState ?? null,
    },
    recomendacoes: recommendationFromText,
    metadata: {
      form: campaignForm,
    },
  };
}

function renderRecommendationsBlock(recommendations: ReturnType<typeof extractRecommendationsForReport>) {
  if (!recommendations.length) return "";
  const rows = recommendations
    .map(
      (rec, index) => `
      <tr>
        <td>${sanitizeTextContent(String(rec.index ?? index + 1))}</td>
        <td><strong>${sanitizeTextContent(rec.title)}</strong><br/>${formatRichText(rec.rationale)}</td>
        <td>${sanitizeTextContent(rec.nextSteps ?? "—")}</td>
        <td>${sanitizeTextContent(recommendationExecSummary(rec.execucao))}</td>
        <td>${sanitizeTextContent(rec.score !== null ? Number(rec.score).toFixed(2) : "—")}</td>
        <td>${rec.adopted ? "Adotada" : "Pendente"}</td>
      </tr>`
    )
    .join("");

  return `<section class="section">
    <header>
      <h2>Recomendações priorizadas</h2>
      <p class="muted">Tabela ordenada por prioridade, score e próximos passos.</p>
    </header>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Tática &amp; racional</th>
          <th>Próximos passos</th>
          <th>Execução</th>
          <th>Score</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  </section>`;
}

function recommendationExecSummary(execucao: Record<string, unknown> | null) {
  if (!execucao) return "—";
  const api = typeof execucao.api_sugerida === "string" ? execucao.api_sugerida : typeof execucao.api === "string" ? execucao.api : "LLM";
  const task =
    typeof execucao.tipo_tarefa === "string"
      ? execucao.tipo_tarefa
      : typeof execucao.tipo === "string"
      ? execucao.tipo
      : "Tarefa";
  const tokens =
    typeof execucao.custo_estimado_tokens === "number"
      ? `${execucao.custo_estimado_tokens} tokens`
      : typeof execucao.tokens === "number"
      ? `${execucao.tokens} tokens`
      : "tokens n/d";
  return `${task} • ${api} • ${tokens}`;
}

function formatCurrency(value?: number) {
  if (typeof value !== "number") return "—";
  return (value / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDuration(value?: number) {
  if (typeof value !== "number") return "—";
  if (value < 1000) return `${value} ms`;
  return `${(value / 1000).toFixed(1)} s`;
}

function formatNumberPtBR(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("pt-BR").format(value);
}

function computeMemoryStats(memoryRecord: unknown) {
  if (!isPlainObject(memoryRecord)) {
    return { shortTerm: 0, longTerm: 0, vectorMatches: 0, cursor: undefined as string | undefined };
  }
  const memory = memoryRecord as Record<string, unknown>;
  const toCount = (input: unknown) => {
    if (Array.isArray(input)) return input.length;
    const parsed = Number(input);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  return {
    shortTerm: toCount(memory.shortTerm ?? memory.short ?? memory.lastShort),
    longTerm: toCount(memory.longTerm ?? memory.long ?? memory.lastLong),
    vectorMatches: toCount(memory.vectorMatches ?? memory.vector ?? memory.lastVector),
    cursor: typeof memory.cursor === "string" ? memory.cursor : undefined,
  };
}

function computeUsageStats(usageRecord: unknown) {
  if (!isPlainObject(usageRecord)) {
    return { totalTokens: null, promptTokens: null, completionTokens: null, model: null as string | null };
  }
  const usage = usageRecord as Record<string, unknown>;
  const parse = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  return {
    totalTokens: parse(usage.total_tokens ?? usage.totalTokens),
    promptTokens: parse(usage.prompt_tokens ?? usage.promptTokens),
    completionTokens: parse(usage.completion_tokens ?? usage.completionTokens),
    model: typeof usage.model === "string" ? usage.model : typeof usage.model_name === "string" ? usage.model_name : null,
  };
}

function extractRecommendationsForReport(payload: Record<string, unknown>) {
  if (!Array.isArray(payload.recomendacoes)) return [];
  return (payload.recomendacoes as unknown[])
    .map((entry, index) => {
      if (!isPlainObject(entry)) return null;
      const rec = entry as Record<string, unknown>;
      return {
        index: typeof rec.prioridade === "number" ? rec.prioridade : index + 1,
        title:
          typeof rec.tatica === "string"
            ? rec.tatica
            : typeof rec.key === "string"
            ? rec.key
            : `Recomendação ${index + 1}`,
        rationale: typeof rec.rationale === "string" ? rec.rationale : undefined,
        nextSteps: typeof rec.proximos_passos === "string" ? rec.proximos_passos : undefined,
        execucao: isPlainObject(rec.execucao) ? (rec.execucao as Record<string, unknown>) : null,
        score: typeof rec.score === "number" ? rec.score : null,
        adopted: Boolean(rec.adopted),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeTextContent(value: string | undefined | null) {
  if (!value) return "";
  return escapeHtml(normalizeTextChunk(value));
}

function normalizeTextChunk(value: string) {
  try {
    return value.normalize("NFC");
  } catch {
    return value;
  }
}

function formatRichText(value: string | undefined) {
  if (!value) return "—";
  return sanitizeTextContent(value).replace(/\n/g, "<br />");
}

function renderParagraphMarkup(paragraphs: string[]) {
  if (!paragraphs.length) return "";
  return paragraphs.map((paragraph) => `<p>${sanitizeTextContent(paragraph)}</p>`).join("");
}

function createListMarkup(items: string[]) {
  if (!items.length) return "";
  return `<ul>${items.map((item) => `<li>${sanitizeTextContent(item)}</li>`).join("")}</ul>`;
}

function getHealthUrl() {
  if (typeof window === "undefined") {
    return "https://status.eiah.ai/healthz";
  }
  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:8080/health`;
}

function normalizePlainText(value: string) {
  try {
    return value.normalize("NFC");
  } catch {
    return value;
  }
}

function parseMarkdownSections(markdown: string) {
  const sections = new Map<string, string[]>();
  let current = "Conteúdo";
  sections.set(current, []);

  markdown.split(/\r?\n/).forEach((line) => {
    if (line.trim().startsWith("## ")) {
      current = line.replace(/^##\s*/, "").trim();
      if (!sections.has(current)) sections.set(current, []);
    } else {
      sections.get(current)!.push(line);
    }
  });

  return sections;
}

function splitSectionContent(lines: string[]) {
  const paragraphs: string[] = [];
  const bullets: string[] = [];
  let buffer: string[] = [];

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
    } else if (!trimmed.startsWith("|")) {
      buffer.push(trimmed);
    }
  });

  if (buffer.length) {
    paragraphs.push(buffer.join(" "));
  }

  return { paragraphs, bullets };
}

function extractTimelineRows(lines: string[]) {
  const rows: Array<{ periodo: string; atividade: string; descricao: string }> = [];

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

function formatDiagnostic(value: unknown) {
  if (!isPlainObject(value)) return "Sem histórico disponível.";
  const diag = value as Record<string, unknown>;
  return `prevRuns: ${diag.total_prev_runs ?? 0} • exploração: ${diag.exploracao_pct ?? 0}% • filtrados adotados: ${
    diag.filtrados_adotados ?? 0
  } • filtrados rejeitados: ${diag.filtrados_rejeitados ?? 0}`;
}

type CampaignForm = {
  goal?: string;
  audience?: string;
  budget?: string;
  channels: string[];
  kpis?: string;
  notes?: string;
  toneProfile?: string;
  toneNotes?: string;
  launchDate?: string;
  deadline?: string;
};

function extractCampaignForm(data: Record<string, unknown>): CampaignForm | null {
  const tryFromObject = (obj: Record<string, unknown> | undefined | null): CampaignForm | null => {
    if (!obj) return null;
    const channels = Array.isArray(obj.channels)
      ? obj.channels.filter((item): item is string => typeof item === "string")
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
    return tryFromObject(data.form as Record<string, unknown>);
  }

  if (isPlainObject(data.params) && isPlainObject((data.params as Record<string, unknown>).form)) {
    return tryFromObject((data.params as Record<string, unknown>).form as Record<string, unknown>);
  }

  if (Array.isArray(data.plan)) {
    for (const entry of data.plan as unknown[]) {
      if (isPlainObject(entry) && isPlainObject(entry.params) && isPlainObject(entry.params.form)) {
        const result = tryFromObject(entry.params.form as Record<string, unknown>);
        if (result) return result;
      }
    }
  }

  if (isPlainObject(data.metadata) && isPlainObject((data.metadata as Record<string, unknown>).form)) {
    return tryFromObject((data.metadata as Record<string, unknown>).form as Record<string, unknown>);
  }

  if (isPlainObject(data.rawPayload)) {
    return tryFromObject(data.rawPayload as Record<string, unknown>);
  }

  return null;
}

type PitchForm = {
  product?: string;
  audience?: string;
  pain?: string;
  solution?: string;
  proof?: string;
  cta?: string;
};

function extractPitchForm(data: Record<string, unknown>): PitchForm | null {
  const tryFromObject = (obj: Record<string, unknown> | undefined | null): PitchForm | null => {
    if (!obj) return null;
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
    return tryFromObject(data.form as Record<string, unknown>);
  }

  if (isPlainObject(data.metadata) && isPlainObject((data.metadata as Record<string, unknown>).form)) {
    return tryFromObject((data.metadata as Record<string, unknown>).form as Record<string, unknown>);
  }

  if (isPlainObject(data.rawPayload)) {
    return tryFromObject(data.rawPayload as Record<string, unknown>);
  }

  if (isPlainObject(data.params) && isPlainObject((data.params as Record<string, unknown>).form)) {
    return tryFromObject((data.params as Record<string, unknown>).form as Record<string, unknown>);
  }

  if (Array.isArray(data.plan)) {
    for (const entry of data.plan as unknown[]) {
      if (isPlainObject(entry) && isPlainObject((entry as Record<string, unknown>).params)) {
        const params = (entry as Record<string, unknown>).params as Record<string, unknown>;
        if (isPlainObject(params.form)) {
          const result = tryFromObject(params.form as Record<string, unknown>);
          if (result) return result;
        }
      }
    }
  }

  return null;
}

type J360Form = {
  customerName?: string;
  segment?: string;
  painPoints?: string;
  currentTools?: string;
  journeyStages?: string[];
  recentEvents?: string;
  opportunities?: string;
  risks?: string;
  nextSteps?: string;
};

function extractJ360Form(data: Record<string, unknown>): J360Form | null {
  const tryFromObject = (obj: Record<string, unknown> | undefined | null): J360Form | null => {
    if (!obj) return null;
    const stages = Array.isArray(obj.journeyStages)
      ? obj.journeyStages.filter((item): item is string => typeof item === "string")
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
    return tryFromObject(data.form as Record<string, unknown>);
  }

  if (isPlainObject(data.metadata) && isPlainObject((data.metadata as Record<string, unknown>).form)) {
    return tryFromObject((data.metadata as Record<string, unknown>).form as Record<string, unknown>);
  }

  if (isPlainObject(data.rawPayload)) {
    return tryFromObject(data.rawPayload as Record<string, unknown>);
  }

  if (isPlainObject(data.params) && isPlainObject((data.params as Record<string, unknown>).form)) {
    return tryFromObject((data.params as Record<string, unknown>).form as Record<string, unknown>);
  }

  if (Array.isArray(data.plan)) {
    for (const entry of data.plan as unknown[]) {
      if (isPlainObject(entry) && isPlainObject((entry as Record<string, unknown>).params)) {
        const params = (entry as Record<string, unknown>).params as Record<string, unknown>;
        if (isPlainObject(params.form)) {
          const result = tryFromObject(params.form as Record<string, unknown>);
          if (result) return result;
        }
      }
    }
  }

  return null;
}

function findRecommendationPayload(node: unknown, depth = 0): Record<string, unknown> | null {
  if (depth > 6 || node === null || node === undefined) return null;

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
    const obj = node as Record<string, unknown>;

    if (Array.isArray(obj.recomendacoes)) {
      return obj;
    }

    if (isPlainObject(obj.optimized) && Array.isArray((obj.optimized as Record<string, unknown>).recomendacoes)) {
      return obj.optimized as Record<string, unknown>;
    }

    if (Array.isArray(obj.outputs)) {
      for (const entry of obj.outputs as unknown[]) {
        if (isPlainObject(entry)) {
          const data = (entry as Record<string, unknown>).data ?? entry;
          const payload = findRecommendationPayload(data, depth + 1);
          if (payload) return payload;
        } else {
          const payload = findRecommendationPayload(entry, depth + 1);
          if (payload) return payload;
        }
      }
    }

    const candidates: unknown[] = [];
    if (isPlainObject(obj.result)) candidates.push(obj.result);
    if (isPlainObject(obj.metadata)) candidates.push(obj.metadata);
    if (Array.isArray(obj.data)) candidates.push(...(obj.data as unknown[]));
    Object.values(obj).forEach((value) => candidates.push(value));

    for (const value of candidates) {
      const payload = findRecommendationPayload(value, depth + 1);
      if (payload) return payload;
    }
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      const payload = findRecommendationPayload(item, depth + 1);
      if (payload) return payload;
    }
  }

  return null;
}
