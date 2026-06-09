import { useCallback, useEffect, useMemo, useState, type ComponentPropsWithoutRef } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import {
  apiAdoptRecommendation,
  apiCancelRun,
  apiCreateSession,
  apiListRunEvents,
  BASE_URL,
  RunEvent,
  RunStatus,
} from "@/lib/api";
import { centsToBRL, formatAgentLabel, formatClockTime, formatDuration } from "./utils";
import RunTimeline from "./RunTimeline";
import GovernancePanel from "./GovernancePanel";
import { maskPII } from "@repo/utils";
import {
  buildJ360LandingPageHtml as buildCoreJ360LandingPageHtml,
  buildJ360PdfHtml as buildCoreJ360PdfHtml,
} from "@eiah/core/actions/reporting/j360LegalReportRenderer";
import {
  buildMktLandingPageHtml as buildCoreMktLandingPageHtml,
  buildMktPdfHtml as buildCoreMktPdfHtml,
} from "@eiah/core/actions/reporting/mktCampaignReportRenderer";
import type { RunAtivoReportingInput } from "@eiah/core/actions/reporting/runAtivoSchema";

type RunData = {
  id: string;
  agent: string;
  status: RunStatus;
  meta?: { tookMs?: number; traceId?: string };
  request?: unknown;
  response?: unknown;
  costCents?: number;
  startedAt?: string;
  finishedAt?: string;
};

type DelegationInfo = {
  id?: string;
  delegatorId?: string;
  marketplaceId?: string | null;
  scope?: string;
  trustMin?: number;
  validUntil?: string;
};

type MarkdownElementProps<T extends keyof JSX.IntrinsicElements> = ComponentPropsWithoutRef<T> & { node?: unknown };

function mergeClassName(...classes: Array<string | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function buildJ360ReportingPayload(params: {
  run: RunData;
  data: Record<string, unknown>;
  j360LegalReport: J360LegalReportView;
  recipeOrchestration?: RecipeOrchestrationView | null;
}): RunAtivoReportingInput {
  const { run, data, j360LegalReport, recipeOrchestration } = params;
  return {
    metadata: {
      agente: run.agent,
      tenantId:
        typeof data.tenantId === "string"
          ? (data.tenantId as string)
          : typeof data.tenant_id === "string"
          ? (data.tenant_id as string)
          : "tenant-local",
      workspaceId:
        typeof data.workspaceId === "string"
          ? (data.workspaceId as string)
          : typeof data.workspace_id === "string"
          ? (data.workspace_id as string)
          : "workspace-local",
      runId: run.id,
      traceId: run.meta?.traceId,
      status: run.status,
      custoCents: typeof run.costCents === "number" ? run.costCents : undefined,
      j360LegalReport,
      recipeOrchestration: recipeOrchestration ?? undefined,
    },
    usuario: {},
    resumo: typeof data.resumo === "string" ? (data.resumo as string) : "Nenhum resumo informado.",
    contexto: typeof data.contexto === "string" ? (data.contexto as string) : "Nenhum contexto informado.",
    recomendacoes: [],
    insights: [],
    linksUteis: [],
    auditTrail: [],
    timeline: [],
  } as unknown as RunAtivoReportingInput;
}

function buildMktReportingPayload(params: {
  run: RunData;
  data: Record<string, unknown>;
  mktCampaignReport: MktCampaignReportView;
  recipeOrchestration?: RecipeOrchestrationView | null;
}): RunAtivoReportingInput {
  const { run, data, mktCampaignReport, recipeOrchestration } = params;
  return {
    metadata: {
      agente: run.agent,
      tenantId:
        typeof data.tenantId === "string"
          ? (data.tenantId as string)
          : typeof data.tenant_id === "string"
          ? (data.tenant_id as string)
          : "tenant-local",
      workspaceId:
        typeof data.workspaceId === "string"
          ? (data.workspaceId as string)
          : typeof data.workspace_id === "string"
          ? (data.workspace_id as string)
          : "workspace-local",
      runId: run.id,
      traceId: run.meta?.traceId,
      status: run.status,
      custoCents: typeof run.costCents === "number" ? run.costCents : undefined,
      mktCampaignReport,
      recipeOrchestration: recipeOrchestration ?? undefined,
    },
    usuario: {},
    resumo: typeof data.resumo === "string" ? (data.resumo as string) : mktCampaignReport.campaignSummary,
    contexto: typeof data.contexto === "string" ? (data.contexto as string) : mktCampaignReport.objective,
    recomendacoes: [],
    insights: [],
    linksUteis: [],
    auditTrail: [],
    timeline: [],
  } as unknown as RunAtivoReportingInput;
}

function getDisplayAgent(agent: string) {
  return formatAgentLabel(agent);
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
const GENERIC_RUN_ATIVO_MARKERS = [
  "deck no figma",
  "deck no canva",
  "produto, dor e cta informados",
  "briefing original",
];
const GUARDIAN_RUN_ATIVO_MARKERS = ["guardian", "evid", "dns", "waf", "rollback", "health"];
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

type DiagnosticSummary = {
  totalPrevRuns: number;
  exploracaoPct: number;
  filtradosAdotados: number;
  filtradosRejeitados: number;
};

function extractDiagnosticPayload(payload?: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!payload) return null;
  if (isPlainObject(payload.optimized) && isPlainObject((payload.optimized as Record<string, unknown>).diagnostico)) {
    return (payload.optimized as Record<string, unknown>).diagnostico as Record<string, unknown>;
  }
  if (isPlainObject(payload.diagnostico)) {
    return payload.diagnostico as Record<string, unknown>;
  }
  return null;
}

function extractDiagnosticSummary(payload?: Record<string, unknown> | null): DiagnosticSummary | null {
  const diagnostico = extractDiagnosticPayload(payload);
  if (!diagnostico) return null;
  const toNumber = (value: unknown) => {
    if (typeof value === "number") return value;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  return {
    totalPrevRuns: toNumber(diagnostico.total_prev_runs),
    exploracaoPct: toNumber(diagnostico.exploracao_pct),
    filtradosAdotados: toNumber(diagnostico.filtrados_adotados),
    filtradosRejeitados: toNumber(diagnostico.filtrados_rejeitados),
  };
}

function hasTextValue(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function splitGuardianEvidenceChecklist(value: string | undefined) {
  if (!value) return [];
  return value
    .replace(/^Você é o Guardian[\s\S]*?Pontos de verificação:\s*/i, "")
    .replace(/^Pontos de verificação:\s*/i, "")
    .split(/\n|;|,/)
    .map((item) => item.trim().replace(/\.$/, ""))
    .filter((item) => Boolean(item) && !/^você é o guardian/i.test(item));
}

type GuardianChecklistStepResult = {
  step: string;
  status: string;
  reasonCode?: string;
  summary?: string;
  evidenceRefs: string[];
  findings: string[];
  nextAction?: string | null;
};

type RecommendationChecklistStep = {
  step: string;
  status: string;
  reasonCode?: string;
  summary?: string;
  nextAction?: string | null;
  evidenceRefs?: string[];
};

function extractGuardianChecklistResults(node: unknown): GuardianChecklistStepResult[] {
  if (!node || typeof node !== "object") return [];
  const record = node as Record<string, unknown>;
  const nestedResponse = isPlainObject(record.response)
    ? (record.response as Record<string, unknown>)
    : null;
  const outputs = Array.isArray(record.outputs)
    ? record.outputs
    : nestedResponse && Array.isArray(nestedResponse.outputs)
    ? nestedResponse.outputs
    : [];

  return outputs
    .map<GuardianChecklistStepResult | null>((entry) => {
      const data =
        isPlainObject(entry) && isPlainObject((entry as Record<string, unknown>).data)
          ? ((entry as Record<string, unknown>).data as Record<string, unknown>)
          : isPlainObject(entry)
          ? (entry as Record<string, unknown>)
          : null;
      if (!data || typeof data.step !== "string" || typeof data.status !== "string") return null;
      return {
        step: data.step,
        status: data.status,
        reasonCode: typeof data.reasonCode === "string" ? data.reasonCode : undefined,
        summary: typeof data.summary === "string" ? data.summary : undefined,
        evidenceRefs: Array.isArray(data.evidenceRefs)
          ? data.evidenceRefs.filter((item): item is string => typeof item === "string")
          : [],
        findings: Array.isArray(data.findings)
          ? data.findings.filter((item): item is string => typeof item === "string")
          : [],
        nextAction: typeof data.nextAction === "string" ? data.nextAction : null,
      } satisfies GuardianChecklistStepResult;
    })
    .filter((item): item is GuardianChecklistStepResult => item !== null);
}

function extractRecommendationChecklistSteps(node: unknown): RecommendationChecklistStep[] {
  if (!isPlainObject(node) || !Array.isArray((node as Record<string, unknown>).checklistSteps)) return [];
  return ((node as Record<string, unknown>).checklistSteps as unknown[])
    .map<RecommendationChecklistStep | null>((entry) => {
      if (!isPlainObject(entry)) return null;
      const record = entry as Record<string, unknown>;
      if (typeof record.step !== "string" || typeof record.status !== "string") return null;
      return {
        step: record.step,
        status: record.status,
        reasonCode: typeof record.reasonCode === "string" ? record.reasonCode : undefined,
        summary: typeof record.summary === "string" ? record.summary : undefined,
        nextAction: typeof record.nextAction === "string" ? record.nextAction : null,
        evidenceRefs: Array.isArray(record.evidenceRefs)
          ? record.evidenceRefs.filter((item): item is string => typeof item === "string")
          : undefined,
      } satisfies RecommendationChecklistStep;
    })
    .filter((item): item is RecommendationChecklistStep => item !== null);
}

function truncateReportText(value: string | undefined, maxLength = 220) {
  if (!value) return "";
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function looksLikeGuardianForm(obj: Record<string, unknown>) {
  const guardianSignals =
    hasTextValue(obj.requestType) ||
    hasTextValue(obj.evidence) ||
    hasTextValue(obj.piiSignals) ||
    hasTextValue(obj.finops);
  const campaignSignals =
    hasTextValue(obj.goal) ||
    hasTextValue(obj.audience) ||
    hasTextValue(obj.budget) ||
    hasTextValue(obj.kpis) ||
    hasTextValue(obj.toneProfile) ||
    Array.isArray(obj.channels);
  return guardianSignals && !campaignSignals;
}

export default function RunViewer({ run }: { run: RunData }) {
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [alertFeedback, setAlertFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [cancelFeedback, setCancelFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [isCancellingRun, setIsCancellingRun] = useState(false);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
  const [includeDetailsInExport, setIncludeDetailsInExport] = useState(false);
  const delegationInfo = useMemo(() => extractDelegationInfo(run.request), [run.request]);
  const guardrailBlockMessage =
    "Sua solicitação foi interceptada pela nossa camada de Governança Cognitiva. O agente tentou responder que realizaria uma tarefa, mas não acionou a ferramenta técnica necessária para isso. Por segurança, bloqueamos essa resposta para evitar informações imprecisas sobre execuções que não foram registradas no nosso sistema de auditoria imutável (SCL/Ledger).";
  const guardrailWarning = useMemo(() => {
    if (run.status === "blocked") return null;
    const evaluated = events.find((event) => event.type === "run.guardrails.evaluated");
    if (!evaluated || typeof evaluated.payload !== "object" || evaluated.payload === null) return null;
    const payload = evaluated.payload as { action?: string; maxSeverity?: string; findings?: unknown[] };
    if (payload.action !== "block") return null;
    const messages = Array.isArray(payload.findings)
      ? payload.findings
          .map((finding) =>
            typeof finding === "object" && finding && "message" in finding
              ? String((finding as { message?: unknown }).message ?? "")
              : ""
          )
          .filter((message) => message)
      : [];
    return {
      reason: messages.join(" | ") || "Guardrails sinalizaram bloqueio.",
      severity: payload.maxSeverity ?? "warn",
    };
  }, [events, run.status]);
  const guardrailBlocked = useMemo(() => {
    if (run.status !== "blocked") return null;
    const blocked = events.find((event) => event.type === "run.blocked.guardrails");
    if (!blocked) return null;
    return guardrailBlockMessage;
  }, [events, guardrailBlockMessage, run.status]);
  const promptText = useMemo(() => {
    if (!isPlainObject(run.request)) return null;
    const request = run.request as Record<string, unknown>;
    const metadata = isPlainObject(request.metadata) ? (request.metadata as Record<string, unknown>) : null;
    if (metadata && typeof metadata.originalPrompt === "string") return metadata.originalPrompt;
    if (typeof request.prompt === "string") return request.prompt;
    if (typeof request.message === "string") return request.message;
    return null;
  }, [run.request]);

  const { structured: structuredOutput, text: outputText } = useMemo(() => {
    return normalizeRunResponse(run.response);
  }, [run.response]);
  const maskedOutputText = useMemo(() => (outputText ? maskPII(outputText) : outputText), [outputText]);
  const recipeOrchestration = useMemo(
    () => (structuredOutput ? extractRecipeOrchestrationData(structuredOutput) : null),
    [structuredOutput]
  );
  const topLevelMktCampaignReport = useMemo(
    () => (structuredOutput && run.agent.toLowerCase() === "mkt" ? extractMktCampaignReportData(structuredOutput) : null),
    [structuredOutput, run.agent]
  );
  const isTopLevelMktCampaignRun = Boolean(
    run.agent.toLowerCase() === "mkt" &&
      topLevelMktCampaignReport &&
      (recipeOrchestration?.intent === "marketing_campaign" || recipeOrchestration?.domain === "marketing")
  );
  const runAtivoArtifacts = useMemo(() => {
    if (isTopLevelMktCampaignRun) return null;
    return extractRunAtivoArtifacts(run.agent, run.response);
  }, [isTopLevelMktCampaignRun, run.agent, run.response]);

  const diagnosticSummary = useMemo(() => extractDiagnosticSummary(structuredOutput), [structuredOutput]);
  const primaryRecommendation = useMemo(() => {
    if (!structuredOutput || !Array.isArray(structuredOutput.recomendacoes)) return null;
    const first = structuredOutput.recomendacoes[0];
    if (!isPlainObject(first)) return null;
    const rec = first as Record<string, unknown>;
    return {
      title: typeof rec.tatica === "string" ? rec.tatica : typeof rec.key === "string" ? rec.key : null,
      rationale: typeof rec.rationale === "string" ? rec.rationale : null,
      nextSteps: typeof rec.proximos_passos === "string" ? rec.proximos_passos : null,
    };
  }, [structuredOutput]);
  const technicalJson = useMemo(() => safeStringify(run), [run]);
  const startedAtLabel = useMemo(() => formatClockTime(run.startedAt), [run.startedAt]);
  const durationLabel = useMemo(() => {
    const tookMs =
      typeof run.meta?.tookMs === "number"
        ? run.meta.tookMs
        : run.startedAt && run.finishedAt
        ? Math.max(0, new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime())
        : undefined;
    return formatDuration(Number.isFinite(tookMs ?? Number.NaN) ? tookMs : undefined);
  }, [run.startedAt, run.finishedAt, run.meta?.tookMs]);
  const costLabel = useMemo(() => centsToBRL(run.costCents), [run.costCents]);
  const startedAtMs = useMemo(() => {
    if (!run.startedAt) return null;
    const parsed = Date.parse(run.startedAt);
    return Number.isFinite(parsed) ? parsed : null;
  }, [run.startedAt]);

  useEffect(() => {
    if (!run?.id || run.id === "run_1234") {
      setEvents([]);
      setEventsError(null);
      setIsLoadingEvents(false);
      return;
    }

    let cancelled = false;
    let eventSource: EventSource | null = null;
    let pollTimer: ReturnType<typeof setInterval> | undefined;
    let retryDelay = 2000;
    let lastEventId: string | null = null;

    const connectSSE = () => {
      if (cancelled) return;
      try {
        const baseUrl =
          BASE_URL.startsWith("http") || BASE_URL.startsWith("https")
            ? BASE_URL
            : `${window.location.origin}${BASE_URL}`;
        const url = new URL(`${baseUrl}/runs/${run.id}/stream`);
        if (lastEventId) url.searchParams.set("cursor", lastEventId);

        apiCreateSession()
          .then(() => {
            if (cancelled) return;
            eventSource = new EventSource(url.toString(), { withCredentials: true });

            eventSource.onmessage = (e) => {
              try {
                const parsed = JSON.parse(e.data) as RunEvent;
                setEvents((prev) => {
                  // evita duplicação de eventos no replay
                  if (prev.find((ev) => ev.id === parsed.id)) return prev;
                  return [...prev, parsed];
                });
                lastEventId = parsed.id;
                retryDelay = 2000; // reset do backoff em sucesso
              } catch (err) {
                console.warn("[RunViewer] evento SSE inválido", err);
              }
            };

            eventSource.onerror = () => {
              console.warn("[RunViewer] erro SSE — tentando reconectar...");
              eventSource?.close();
              if (!cancelled) {
                setTimeout(connectSSE, retryDelay);
                retryDelay = Math.min(retryDelay * 2, 15000); // backoff exponencial
              }
            };

            eventSource.onopen = () => {
              console.info("[RunViewer] conexão SSE aberta");
            };
          })
          .catch((err) => {
            console.warn("[RunViewer] falha ao criar sessão SSE", err);
            fallbackToPolling();
          });
      } catch (err) {
        console.warn("[RunViewer] falha ao conectar SSE", err);
        fallbackToPolling();
      }
    };

    const fallbackToPolling = () => {
      if (pollTimer) clearInterval(pollTimer);
      console.info("[RunViewer] fallback → polling");
      const loadEvents = async () => {
        if (cancelled) return;
        try {
          const response = await apiListRunEvents(run.id, {
            cursor: lastEventId ?? undefined,
          });
          if (cancelled) return;
          const incoming = response.items ?? [];
          if (!lastEventId) {
            setEvents(incoming);
          } else if (incoming.length > 0) {
            setEvents((prev) => {
              const seen = new Set(prev.map((ev) => ev.id));
              const next = [...prev];
              incoming.forEach((ev) => {
                if (!seen.has(ev.id)) next.push(ev);
              });
              return next;
            });
          }
          if (incoming.length > 0) {
            lastEventId = incoming[incoming.length - 1]?.id ?? lastEventId;
          }
          setEventsError(null);
        } catch (err) {
          const message = err instanceof Error ? err.message : "Falha ao carregar eventos.";
          setEventsError(message);
        }
      };
      loadEvents();
      pollTimer = setInterval(loadEvents, 4000);
    };

    setIsLoadingEvents(true);
    setEventsError(null);
    connectSSE();

    return () => {
      cancelled = true;
      if (eventSource) eventSource.close();
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [run?.id]);

  const isPendingWithoutEvents = run.status === "pending" && events.length === 0;
  const pendingWithoutEventsMs =
    isPendingWithoutEvents && startedAtMs ? Math.max(0, nowTick - startedAtMs) : 0;
  const pendingWithoutEventsExpired = isPendingWithoutEvents && pendingWithoutEventsMs >= 2 * 60 * 1000;

  useEffect(() => {
    if (!isPendingWithoutEvents || pendingWithoutEventsExpired) {
      return;
    }
    const interval = setInterval(() => {
      setNowTick(Date.now());
    }, 5000);
    return () => clearInterval(interval);
  }, [isPendingWithoutEvents, pendingWithoutEventsExpired]);

  const statusInfo = useMemo(() => {
    if (pendingWithoutEventsExpired) {
      return {
        badge: "bg-rose-500/20 text-rose-200",
        label: "Run preso/expirado",
      };
    }
    return statusStyles[run.status] ?? statusStyles.success;
  }, [pendingWithoutEventsExpired, run.status]);
  const isInProgress = run.status === "pending" || run.status === "running";

  const handleCancelRun = useCallback(async () => {
    if (!isInProgress || isCancellingRun) return;
    const confirmed =
      typeof window === "undefined"
        ? true
        : window.confirm("Cancelar este run agora? A execução será marcada como interrompida pelo usuário.");
    if (!confirmed) return;

    setIsCancellingRun(true);
    setCancelFeedback(null);
    try {
      const response = await apiCancelRun(run.id);
      const cancelEvent = response.event;
      if (cancelEvent) {
        setEvents((prev) => {
          if (prev.some((event) => event.id === cancelEvent.id)) return prev;
          return [...prev, cancelEvent];
        });
      }
      setCancelFeedback({
        type: "success",
        message: "Cancelamento solicitado. Atualize o run para confirmar o estado final.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao cancelar o run.";
      setCancelFeedback({ type: "error", message });
    } finally {
      setIsCancellingRun(false);
    }
  }, [isCancellingRun, isInProgress, run.id]);

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

  const legacyContent = structuredOutput ? (
    <StructuredRecommendationView run={run} data={structuredOutput} markdownComponents={markdownComponents} />
  ) : maskedOutputText ? (
    <ReactMarkdown components={markdownComponents}>{maskedOutputText}</ReactMarkdown>
  ) : (
    <p className="text-xs text-muted-foreground">Resultado disponível no painel.</p>
  );

  const legacyPanel = (
    <div className="max-h-[60vh] overflow-auto rounded-3xl bg-black/40 p-4 text-sm leading-relaxed text-foreground/90 md:max-h-[50vh]">
      {legacyContent}
    </div>
  );

  const summaryPanel = (
    <section className="rounded-3xl border border-white/10 bg-white/5 p-4 text-sm text-foreground/90">
      <header className="space-y-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-accent/80">Resumo do run</p>
        <p className="text-xs text-muted-foreground">Leitura rápida para decisão e impressão.</p>
      </header>
      <div className="mt-3 space-y-3 text-xs text-muted-foreground">
        <p>
          <span className="font-semibold text-foreground">Agente:</span> {getDisplayAgent(run.agent)}
        </p>
        <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
          <span className="pill bg-white/10 text-foreground">
            Iniciado: {startedAtLabel ?? "—"}
          </span>
          <span className="pill bg-white/10 text-foreground">
            Tempo: {durationLabel ?? "—"}
          </span>
          <span className="pill bg-white/10 text-foreground">
            Custo: {costLabel ?? "—"}
          </span>
        </div>
        {promptText && (
          <p className="whitespace-pre-line">
            <span className="font-semibold text-foreground">Pergunta original:</span> {promptText}
          </p>
        )}
        {primaryRecommendation?.title && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
              Recomendação principal
            </p>
            <p className="mt-1 text-sm text-foreground">{primaryRecommendation.title}</p>
            {primaryRecommendation.rationale && (
              <p className="mt-2 text-xs text-foreground/85">{primaryRecommendation.rationale}</p>
            )}
            {primaryRecommendation.nextSteps && (
              <p className="mt-2 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">Próximos passos:</span>{" "}
                {primaryRecommendation.nextSteps}
              </p>
            )}
          </div>
        )}
        {diagnosticSummary ? null : null}
      </div>
    </section>
  );

  const technicalDetailsPanel = (
    <section className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-muted-foreground">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2"
        onClick={() => setShowTechnicalDetails((value) => !value)}
      >
        <span className="text-[10px] font-semibold uppercase tracking-[0.35em] text-foreground/80">
          Detalhes técnicos
        </span>
        <span className="pill bg-white/10 text-foreground">
          {showTechnicalDetails ? "Fechar detalhes" : "Abrir detalhes completos"}
        </span>
      </button>
      {showTechnicalDetails && (
        <pre className="mt-3 max-h-64 overflow-auto rounded-2xl bg-black/60 p-4 text-[11px] text-foreground/80">
          {technicalJson}
        </pre>
      )}
    </section>
  );

  const createReportHtml = useCallback(
    (options?: { editable?: boolean; autoPrint?: boolean; includeRaw?: boolean }) => {
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
          promptText: promptText ?? undefined,
          rawDetail: technicalJson,
        },
        options
      );
    },
    [run, structuredOutput, outputText, promptText, technicalJson]
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
    if (!isTopLevelMktCampaignRun && runAtivoArtifacts?.pdfHtml) {
      downloadString(runAtivoArtifacts.pdfHtml, `run-${run.id}-report.html`, "text/html;charset=utf-8");
      return;
    }
    if (typeof window === "undefined") return;
    const html = createReportHtml({ editable: false, autoPrint: true, includeRaw: includeDetailsInExport });
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
  }, [createReportHtml, run.id, runAtivoArtifacts, includeDetailsInExport, isTopLevelMktCampaignRun]);

  const handleDownloadHtml = useCallback(() => {
    if (!isTopLevelMktCampaignRun && runAtivoArtifacts?.landingHtml) {
      downloadString(runAtivoArtifacts.landingHtml, `run-${run.id}-landing.html`, "text/html;charset=utf-8");
      return;
    }
    if (typeof document === "undefined") return;
    const html = createReportHtml({ editable: true, includeRaw: includeDetailsInExport });
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `run-${run.id}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [createReportHtml, run.id, runAtivoArtifacts, includeDetailsInExport, isTopLevelMktCampaignRun]);

    const handleSendAlert = useCallback(() => {
    const summary = `Run ${run.id.slice(0, 8)} (${getDisplayAgent(run.agent)})`;
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
            #{run.id.slice(0, 8)} — {getDisplayAgent(run.agent)}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">ID completo: {run.id}</p>
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

      {delegationInfo && (
        <section className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-muted-foreground">
          <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-accent/80">
            Delegacao ativa
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-foreground/85">
            {delegationInfo.delegatorId && (
              <span className="pill bg-white/10 text-foreground">
                Delegador: {delegationInfo.delegatorId.slice(0, 8)}
              </span>
            )}
            {delegationInfo.scope && (
              <span className="pill bg-white/10 text-foreground">Escopo: {delegationInfo.scope}</span>
            )}
            {typeof delegationInfo.trustMin === "number" && (
              <span className="pill bg-white/10 text-foreground">Trust min: {delegationInfo.trustMin}</span>
            )}
            {delegationInfo.validUntil && (
              <span className="pill bg-white/10 text-foreground">
                Valido ate: {new Date(delegationInfo.validUntil).toLocaleDateString("pt-BR")}
              </span>
            )}
          </div>
        </section>
      )}
      {guardrailWarning && (
        <section className="rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-xs text-amber-100">
          <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-amber-200">
            Aviso de guardrail
          </p>
          <p className="mt-2 text-xs text-amber-100/90">
            {guardrailWarning.reason}
          </p>
        </section>
      )}
      {guardrailBlocked && (
        <section className="rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-xs text-amber-100">
          <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-amber-200">
            Bloqueio de governanca
          </p>
          <p className="mt-2 text-xs text-amber-100/90">
            {guardrailBlocked}
          </p>
        </section>
      )}
      {promptText && (
        <section className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-muted-foreground">
          <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-accent/80">
            Pergunta enviada
          </p>
          <p className="mt-2 whitespace-pre-line text-sm text-foreground/90">
            {promptText}
          </p>
        </section>
      )}

      <div className="glass-panel flex-1 overflow-hidden">
        {isInProgress && !pendingWithoutEventsExpired ? (
          <div className="flex h-full min-h-[160px] flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-amber-400/40 bg-amber-400/10 p-6 text-xs text-amber-100">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-200 border-t-transparent" />
            <p className="text-center text-xs leading-relaxed text-amber-100/90">
              Execucao em andamento. A timeline abaixo sera atualizada automaticamente.
            </p>
          </div>
        ) : pendingWithoutEventsExpired ? (
          <div className="flex h-full min-h-[160px] flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-rose-400/40 bg-rose-400/10 p-6 text-xs text-rose-100">
            <p className="text-center text-sm font-semibold text-rose-100">
              Run preso/expirado
            </p>
            <p className="text-center text-xs leading-relaxed text-rose-100/90">
              Este run está em fila há mais de 2 minutos sem eventos do worker. Atualize, reexecute ou verifique o worker.
            </p>
            <button
              type="button"
              className="rounded-full border border-rose-300/30 bg-rose-400/15 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-rose-100 transition hover:border-rose-200/60 hover:bg-rose-400/25 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={handleCancelRun}
              disabled={isCancellingRun || !isInProgress}
            >
              {isCancellingRun ? "Cancelando..." : "Cancelar execução"}
            </button>
          </div>
        ) : runAtivoArtifacts ? (
          <div className="space-y-6">
            <RunAtivoArtifactsView artifacts={runAtivoArtifacts} runId={run.id} />
            {!isTopLevelMktCampaignRun ? summaryPanel : null}
            {legacyPanel}
            {!isTopLevelMktCampaignRun ? technicalDetailsPanel : null}
          </div>
        ) : (
          <div className="space-y-6">
            {!isTopLevelMktCampaignRun ? summaryPanel : null}
            {legacyPanel}
            {!isTopLevelMktCampaignRun ? technicalDetailsPanel : null}
          </div>
        )}
      </div>

      <RunTimeline
        events={events}
        isLoading={pendingWithoutEventsExpired ? false : isLoadingEvents}
        error={eventsError}
        status={run.status}
        emptyStateMessage={
          pendingWithoutEventsExpired
            ? "Run preso/expirado: pendente há mais de 2 minutos e sem eventos do worker."
            : undefined
        }
      />

      <GovernancePanel runId={run.id} />

      <footer className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>traceId: {run.meta?.traceId ?? "-"}</span>
        {isInProgress ? (
          <button
            type="button"
            className="rounded-full border border-rose-300/20 bg-rose-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-rose-200 transition hover:border-rose-200/50 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={handleCancelRun}
            disabled={isCancellingRun}
          >
            {isCancellingRun ? "Cancelando..." : "Cancelar run"}
          </button>
        ) : null}
        <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <input
            type="checkbox"
            className="h-3 w-3 accent-accent"
            checked={includeDetailsInExport}
            onChange={(event) => setIncludeDetailsInExport(event.target.checked)}
          />
          Incluir detalhes completos no export
        </label>
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
        {cancelFeedback && (
          <span
            className={`text-xs ${
              cancelFeedback.type === "success" ? "text-emerald-300" : "text-rose-300"
            }`}
          >
            {cancelFeedback.message}
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
  const [adoptedOverrides, setAdoptedOverrides] = useState<Record<string, boolean>>({});
  const [showMktTechnicalView, setShowMktTechnicalView] = useState(false);
  const recommendations = Array.isArray(data.recomendacoes)
    ? (data.recomendacoes as Record<string, unknown>[])
    : [];
  const diagnostico = extractDiagnosticPayload(data);
  const agentState = isPlainObject(data.agentState) ? (data.agentState as Record<string, unknown>) : null;
  const maskedAgentState = useMemo(
    () => (agentState ? maskPII(JSON.stringify(agentState, null, 2)) : ""),
    [agentState]
  );
  const briefingMarkdown =
    typeof data.breafing_markdown === "string"
      ? (data.breafing_markdown as string)
      : typeof data.briefing_markdown === "string"
      ? (data.briefing_markdown as string)
      : undefined;
  const maskedBriefingMarkdown = useMemo(
    () => (briefingMarkdown ? maskPII(briefingMarkdown) : briefingMarkdown),
    [briefingMarkdown]
  );
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
  const maskedFallbackJson = useMemo(() => maskPII(JSON.stringify(data, null, 2)), [data]);
  const memory = isPlainObject(data.memory) ? (data.memory as Record<string, unknown>) : null;
  const previousAgentState =
    isPlainObject(memory?.agentStateBefore) &&
    isPlainObject((memory?.agentStateBefore as Record<string, unknown>).recommendations)
      ? (((memory?.agentStateBefore as Record<string, unknown>).recommendations as Record<string, unknown>))
      : null;
  const isPitchAgent = run.agent.toLowerCase() === "pitch";
  const isJ360Agent = run.agent.toLowerCase() === "j_360";
  const isMktAgent = run.agent.toLowerCase() === "mkt";
  const isGuardianAgent = run.agent.toLowerCase() === "guardian";
  const guardianForm = useMemo(() => {
    if (!isGuardianAgent) return null;
    const structured = extractGuardianForm(data);
    if (structured) return structured;
    if (!isPlainObject(run.request)) return null;
    return extractGuardianForm(run.request as Record<string, unknown>);
  }, [data, isGuardianAgent, run.request]);
  const guardianEvidenceChecklist = useMemo(
    () => splitGuardianEvidenceChecklist(guardianForm?.evidence),
    [guardianForm?.evidence]
  );
  const guardianChecklistResults = useMemo(
    () => (isGuardianAgent ? extractGuardianChecklistResults(data) : []),
    [data, isGuardianAgent]
  );
  const guardianReport = useMemo(
    () => (isGuardianAgent ? extractGuardianReportData(data) : null),
    [data, isGuardianAgent]
  );
  const j360LegalReport = useMemo(
    () => (isJ360Agent ? extractJ360LegalReportData(data) : null),
    [data, isJ360Agent]
  );
  const mktCampaignReport = useMemo(
    () => (isMktAgent ? extractMktCampaignReportData(data) : null),
    [data, isMktAgent]
  );
  const recipeOrchestration = useMemo(() => extractRecipeOrchestrationData(data), [data]);
  const isMktCampaignRun = Boolean(
    isMktAgent &&
      mktCampaignReport &&
      (recipeOrchestration?.intent === "marketing_campaign" || recipeOrchestration?.domain === "marketing")
  );
  const isJ360LegalReviewRun = Boolean(
    isJ360Agent &&
      j360LegalReport &&
      (recipeOrchestration?.intent === "legal_review" || recipeOrchestration?.domain === "legal")
  );
  const mktReportingPayload = useMemo(
    () =>
      isMktCampaignRun && mktCampaignReport
        ? buildMktReportingPayload({
            run,
            data,
            mktCampaignReport,
            recipeOrchestration,
          })
        : null,
    [data, isMktCampaignRun, mktCampaignReport, recipeOrchestration, run]
  );
  const j360ReportingPayload = useMemo(
    () =>
      isJ360LegalReviewRun && j360LegalReport
        ? buildJ360ReportingPayload({
            run,
            data,
            j360LegalReport,
            recipeOrchestration,
          })
        : null,
    [data, isJ360LegalReviewRun, j360LegalReport, recipeOrchestration, run]
  );
  const mktViewerHtml = useMemo(
    () => (mktReportingPayload ? buildCoreMktLandingPageHtml(mktReportingPayload) : null),
    [mktReportingPayload]
  );
  const j360ViewerHtml = useMemo(
    () => (j360ReportingPayload ? buildCoreJ360LandingPageHtml(j360ReportingPayload) : null),
    [j360ReportingPayload]
  );
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
    if (isGuardianAgent) {
      return [];
    }

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
  }, [form, isGuardianAgent, isPitchAgent, pitchForm, isJ360Agent, j360Form]);

  const summarySubtitle = useMemo(() => {
    if (isGuardianAgent) {
      return "Objetivo operacional, evidências e trilha de validação informados na execução.";
    }
    if (isPitchAgent) {
      return "Produto, dor e CTA informados no briefing original.";
    }
    if (isJ360Agent) {
      return "Conta, jornada e riscos informados no briefing original.";
    }
    return "Objetivo, público e canais informados no briefing original.";
  }, [isGuardianAgent, isPitchAgent, isJ360Agent]);

  const hasSummaryData = summaryItems.length > 0;


  const handleRecommendationAction = async (
    action: "adopt" | "feedback",
    payload: { key?: unknown; tatica?: unknown }
  ) => {
    if (typeof window === "undefined") return;
    if (action === "adopt") {
      const key = typeof payload.key === "string" ? payload.key : undefined;
      const tatica = typeof payload.tatica === "string" ? payload.tatica : undefined;
      try {
        await apiAdoptRecommendation(run.id, { key, tatica, adopted: true });
        const fallbackKey = key ?? tatica ?? `rec-${run.id}`;
        setAdoptedOverrides((prev) => ({ ...prev, [fallbackKey]: true }));
      } catch (error) {
        console.warn("[RunViewer] falha ao marcar recomendacao como adotada", error);
      }
    }
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

  useEffect(() => {
    setAdoptedOverrides({});
  }, [run.id]);

  useEffect(() => {
    if (!isMktCampaignRun) {
      setShowMktTechnicalView(false);
    }
  }, [isMktCampaignRun]);

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
      {isMktCampaignRun && mktViewerHtml ? (
        <section className="space-y-3">
          <header className="space-y-1">
            <p className="text-xs uppercase tracking-[0.35em] text-accent">Visão do usuário</p>
            <h4 className="text-base font-semibold text-foreground">Campanha estruturada do MKT</h4>
            <p className="text-xs text-muted-foreground">
              Prévia unificada do mesmo renderer usado em `Salvar HTML` e `Exportar PDF`.
            </p>
          </header>
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-white">
            <iframe
              title={`Campanha MKT ${run.id}`}
              srcDoc={mktViewerHtml}
              className="h-[1400px] w-full border-0 bg-white"
            />
          </div>
          <section className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-muted-foreground">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-foreground/80">
                  Visão técnica interna
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Auditoria, governança e artefatos operacionais permanecem disponíveis apenas para consulta interna.
                </p>
              </div>
              <button
                type="button"
                className="pill bg-white/10 text-foreground transition hover:border-accent/40 hover:text-accent"
                onClick={() => setShowMktTechnicalView((value) => !value)}
              >
                {showMktTechnicalView ? "Ocultar técnico" : "Abrir técnico"}
              </button>
            </div>
          </section>
        </section>
      ) : null}

      <div className={isMktCampaignRun && !showMktTechnicalView ? "hidden" : "space-y-6"}>
      {!briefingMarkdown && hasSummaryData && !isMktCampaignRun && (
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

      {isGuardianAgent && guardianForm && (
        <section className="space-y-3">
          <header className="space-y-1">
            <h4 className="text-base font-semibold text-foreground">Contexto probatório</h4>
            <p className="text-xs text-muted-foreground">{summarySubtitle}</p>
          </header>
          <div className="space-y-2 text-sm text-foreground/90">
            {hasTextValue(guardianForm.requestType) && (
              <p>
                <span className="font-semibold text-foreground">Rota alvo:</span> {guardianForm.requestType}
              </p>
            )}
            {hasTextValue(guardianForm.objective) && (
              <p>
                <span className="font-semibold text-foreground">Objetivo:</span> {guardianForm.objective}
              </p>
            )}
            {guardianEvidenceChecklist.length > 0 && (
              <div className="space-y-2">
                <p className="font-semibold text-foreground">Checklist probatório</p>
                <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                  {guardianEvidenceChecklist.map((item) => (
                    <span key={item} className="pill bg-white/10 text-foreground">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {guardianChecklistResults.length > 0 && (
              <div className="space-y-2">
                <p className="font-semibold text-foreground">Checks executados</p>
                <div className="space-y-2">
                  {guardianChecklistResults.map((item) => (
                    <div key={`${item.step}:${item.reasonCode ?? item.status}`} className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-foreground">{item.step}</span>
                        <span
                          className={mergeClassName(
                            "pill text-[10px]",
                            item.status === "verified"
                              ? "bg-emerald-500/15 text-emerald-200"
                              : item.status === "degraded" || item.status === "warning"
                              ? "bg-amber-500/15 text-amber-200"
                              : "bg-red-500/15 text-red-200"
                          )}
                        >
                          {item.status}
                        </span>
                        {item.reasonCode ? (
                          <span className="text-[10px] text-muted-foreground">{item.reasonCode}</span>
                        ) : null}
                      </div>
                      {item.summary ? <p className="mt-2 text-xs text-muted-foreground">{item.summary}</p> : null}
                      {item.evidenceRefs.length > 0 ? (
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          <span className="font-semibold text-foreground">Evidências:</span> {item.evidenceRefs.join(", ")}
                        </p>
                      ) : null}
                      {item.nextAction ? (
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          <span className="font-semibold text-foreground">Próxima ação:</span> {item.nextAction}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {hasTextValue(guardianForm.finops) && (
              <p>
                <span className="font-semibold text-foreground">FinOps:</span> {guardianForm.finops}
              </p>
            )}
            {hasTextValue(guardianForm.piiSignals) && (
              <p>
                <span className="font-semibold text-foreground">PII / termos sensíveis:</span> {guardianForm.piiSignals}
              </p>
            )}
            {hasTextValue(guardianForm.notes) && (
              <p className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">Observações adicionais:</span> {guardianForm.notes}
              </p>
            )}
          </div>
        </section>
      )}

      {isGuardianAgent && (
        <section className="space-y-3">
          <header className="space-y-1">
            <h4 className="text-base font-semibold text-foreground">Parecer estruturado do Guardian</h4>
            <p className="text-xs text-muted-foreground">
              Separação explícita entre status técnico do run e decisão probatória final.
            </p>
          </header>
          {guardianReport ? (
            <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                <span className="pill bg-white/10 text-foreground">runStatus: {guardianReport.runStatus}</span>
                {guardianReport.evaluationScope ? (
                  <span className="pill bg-white/10 text-foreground">scope: {guardianReport.evaluationScope}</span>
                ) : null}
                {guardianReport.riskLevel ? <span className="pill bg-white/10 text-foreground">risk: {guardianReport.riskLevel}</span> : null}
                <span
                  className={mergeClassName(
                    "pill",
                    guardianReport.guardianDecision === "GO"
                      ? "bg-emerald-500/15 text-emerald-200"
                      : guardianReport.guardianDecision === "DEGRADED"
                      ? "bg-amber-500/15 text-amber-200"
                      : "bg-red-500/15 text-red-200"
                  )}
                >
                  guardianDecision: {guardianReport.guardianDecision}
                </span>
                <span className="pill bg-white/10 text-foreground">reasonCode: {guardianReport.reasonCode}</span>
                <span className="pill bg-white/10 text-foreground">evidenceStatus: {guardianReport.evidenceStatus}</span>
                <span className="pill bg-white/10 text-foreground">exportStatus: {guardianReport.exportStatus}</span>
                {guardianReport.stageDecision ? (
                  <span className="pill bg-white/10 text-foreground">stageDecision: {guardianReport.stageDecision}</span>
                ) : null}
                {guardianReport.globalDecision ? (
                  <span className="pill bg-white/10 text-foreground">globalDecision: {guardianReport.globalDecision}</span>
                ) : null}
              </div>
              <p className="text-sm text-muted-foreground">{guardianReport.summary}</p>
              {guardianReport.activeStepTitle ? (
                <p className="text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">Etapa ativa:</span> {guardianReport.activeStepTitle}
                </p>
              ) : null}
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.25em] text-foreground/70">Bloqueios</p>
                  <ul className="mt-2 space-y-2 text-xs text-muted-foreground">
                    {guardianReport.blockingIssues.length > 0 ? (
                      guardianReport.blockingIssues.map((issue) => (
                        <li key={`${issue.severity}:${issue.code}`}>
                          <span className="font-semibold text-foreground">{issue.severity}</span> {issue.code}: {issue.message}
                        </li>
                      ))
                    ) : (
                      <li>Nenhum bloqueio crítico reportado.</li>
                    )}
                  </ul>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.25em] text-foreground/70">FinOps</p>
                  <ul className="mt-2 space-y-2 text-xs text-muted-foreground">
                    <li>status: {formatGuardianFinopsStatusLabel(guardianReport)}</li>
                    <li>modelo: {guardianReport.finops.model ?? "não reportado"}</li>
                    <li>tokens: {formatGuardianTokenValue(guardianReport.finops.totalTokens)}</li>
                    <li>custo: {formatGuardianCurrencyValue(guardianReport.finops.estimatedCost, guardianReport.finops.currency ?? "BRL")}</li>
                  </ul>
                </div>
                {guardianReport.governance ? (
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3 md:col-span-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.25em] text-foreground/70">Governança aplicada</p>
                    <div className="mt-2 grid gap-3 md:grid-cols-2">
                      <ul className="space-y-1 text-xs text-muted-foreground">
                        <li>tenant/workspace: {guardianReport.governance.tenantIdPresent && guardianReport.governance.workspaceIdPresent ? "ok" : "ausente"}</li>
                        <li>policyDecision: {guardianReport.governance.policyDecision}</li>
                        <li>RBAC: {guardianReport.governance.rbacEvaluated ? "avaliado" : "não avaliado"}</li>
                        <li>Entitlement: {guardianReport.governance.entitlementEvaluated ? "avaliado" : "não avaliado"}</li>
                      </ul>
                      <ul className="space-y-1 text-xs text-muted-foreground">
                        <li>TrustScore: {guardianReport.governance.trustScoreEvaluated ? "avaliado" : "não avaliado"}</li>
                        <li>CostGuard: {guardianReport.governance.costGuardEvaluated ? "avaliado" : "não avaliado"}</li>
                        <li>trustLevel: {guardianReport.governance.trustLevel ?? "não informado"}</li>
                        <li>trustScore: {guardianReport.governance.trustScore != null ? guardianReport.governance.trustScore.toFixed(2) : "não informado"}</li>
                      </ul>
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="min-w-full text-left text-xs text-muted-foreground">
                  <thead className="bg-white/5 text-foreground">
                    <tr>
                      <th className="px-3 py-2">Item</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Evidência esperada</th>
                      <th className="px-3 py-2">Evidência coletada</th>
                      <th className="px-3 py-2">SHA-256</th>
                    </tr>
                  </thead>
                  <tbody>
                    {guardianReport.checklist.length > 0 ? (
                      guardianReport.checklist.map((item) => (
                        <tr key={`${item.item}:${item.expectedEvidence}`} className="border-t border-white/10 align-top">
                          <td className="px-3 py-2 text-foreground">{item.item}</td>
                          <td className="px-3 py-2">{item.status}</td>
                          <td className="px-3 py-2">{item.expectedEvidence}</td>
                          <td className="px-3 py-2">{item.collectedEvidence ?? "não coletada"}</td>
                          <td className="px-3 py-2">{item.sha256 ?? "não coletado"}</td>
                        </tr>
                      ))
                    ) : (
                      <tr className="border-t border-white/10">
                        <td className="px-3 py-3" colSpan={5}>
                          Nenhuma evidência estruturada foi reportada.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="space-y-2 rounded-xl border border-white/10 bg-black/20 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-foreground/70">Matriz de cobertura do parecer</p>
                <p className="text-xs text-muted-foreground">
                  Explicação da plataforma sobre o que o parecer técnico pediu, o que este run realmente validou e o que ainda depende de revisão manual ou arquitetural.
                </p>
                <div className="overflow-x-auto rounded-xl border border-white/10">
                  <table className="min-w-full text-left text-xs text-muted-foreground">
                    <thead className="bg-white/5 text-foreground">
                      <tr>
                        <th className="px-3 py-2">O que o parecer pede</th>
                        <th className="px-3 py-2">O que o run respondeu</th>
                        <th className="px-3 py-2">O que ainda depende de revisão manual/arquitetural</th>
                      </tr>
                    </thead>
                    <tbody>
                      {guardianReport.coverageMatrix.length > 0 ? (
                        guardianReport.coverageMatrix.map((item, index) => (
                          <tr key={`${item.whatParecerAsks}:${index}`} className="border-t border-white/10 align-top">
                            <td className="px-3 py-2 text-foreground">{item.whatParecerAsks}</td>
                            <td className="px-3 py-2">{item.whatRunAnswered}</td>
                            <td className="px-3 py-2">{item.whatStillNeedsManualReview ?? "Nenhuma pendência adicional reportada."}</td>
                          </tr>
                        ))
                      ) : (
                        <tr className="border-t border-white/10">
                          <td className="px-3 py-3" colSpan={3}>
                            Nenhuma matriz de cobertura estruturada foi reportada.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
              Payload probatório Guardian ausente ou incompatível. O export HTML/PDF opera em fail-closed para evitar template genérico.
            </div>
          )}
        </section>
      )}

      {isJ360LegalReviewRun && j360ViewerHtml ? (
        <section className="space-y-3">
          <header className="space-y-1">
            <h4 className="text-base font-semibold text-foreground">Parecer jurídico do J_360</h4>
            <p className="text-xs text-muted-foreground">
              Prévia unificada do mesmo renderer usado em `Salvar HTML` e `Exportar PDF`.
            </p>
          </header>
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-white">
            <iframe
              title={`Parecer jurídico ${run.id}`}
              srcDoc={j360ViewerHtml}
              className="h-[1400px] w-full border-0 bg-white"
            />
          </div>
        </section>
      ) : null}

      {!isJ360LegalReviewRun && isJ360Agent && j360LegalReport ? (
        <section className="space-y-3">
          <header className="space-y-1">
            <h4 className="text-base font-semibold text-foreground">Parecer jurídico estruturado do J_360</h4>
            <p className="text-xs text-muted-foreground">
              Consolidação jurídica preliminar separando decisão, riscos, ajustes e o que ainda depende de revisão humana.
            </p>
          </header>
          <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
              <span
                className={mergeClassName(
                  "pill",
                  j360LegalReport.legalDecision === "APROVADO_BAIXO_RISCO"
                    ? "bg-emerald-500/15 text-emerald-200"
                    : j360LegalReport.legalDecision === "APROVADO_COM_RESSALVAS"
                    ? "bg-amber-500/15 text-amber-200"
                    : "bg-red-500/15 text-red-200"
                )}
              >
                decisão: {formatJ360LegalDecisionLabel(j360LegalReport.legalDecision)}
              </span>
              <span className="pill bg-white/10 text-foreground">risk: {j360LegalReport.riskLevel}</span>
              {j360LegalReport.documentType ? (
                <span className="pill bg-white/10 text-foreground">documentType: {j360LegalReport.documentType}</span>
              ) : null}
              <span className="pill bg-white/10 text-foreground">
                revisão humana: {j360LegalReport.manualReviewRequired ? "recomendada" : "não obrigatória"}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">{j360LegalReport.summary}</p>
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Escopo:</span> {j360LegalReport.analysisScope}
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-foreground/70">O que ajustar agora</p>
                <ul className="mt-2 space-y-2 text-xs text-muted-foreground">
                  {j360LegalReport.executiveGuidance.adjustNow.length > 0 ? (
                    j360LegalReport.executiveGuidance.adjustNow.map((item) => <li key={item}>{item}</li>)
                  ) : (
                    <li>Nenhum ajuste executivo adicional foi estruturado.</li>
                  )}
                </ul>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-foreground/70">O que ainda depende de advogado humano</p>
                <ul className="mt-2 space-y-2 text-xs text-muted-foreground">
                  {j360LegalReport.executiveGuidance.dependsOnHumanReview.length > 0 ? (
                    j360LegalReport.executiveGuidance.dependsOnHumanReview.map((item) => <li key={item}>{item}</li>)
                  ) : (
                    <li>
                      {j360LegalReport.manualReviewRequired
                        ? "A revisão jurídica humana final continua recomendada."
                        : "Nenhuma dependência humana adicional foi estruturada."}
                    </li>
                  )}
                </ul>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-foreground/70">Quando voltar para rerun</p>
                <ul className="mt-2 space-y-2 text-xs text-muted-foreground">
                  {j360LegalReport.executiveGuidance.rerunWhen.length > 0 ? (
                    j360LegalReport.executiveGuidance.rerunWhen.map((item) => <li key={item}>{item}</li>)
                  ) : (
                    <li>Após incorporar os ajustes sensíveis e consolidar a nova versão da minuta.</li>
                  )}
                </ul>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-foreground/70">Quando pode seguir para uso interno</p>
                <ul className="mt-2 space-y-2 text-xs text-muted-foreground">
                  {j360LegalReport.executiveGuidance.readyForInternalUseWhen.length > 0 ? (
                    j360LegalReport.executiveGuidance.readyForInternalUseWhen.map((item) => <li key={item}>{item}</li>)
                  ) : (
                    <li>Quando a redação final estiver validada e coerente com a prática operacional.</li>
                  )}
                </ul>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-foreground/70">Pontos fortes</p>
                <ul className="mt-2 space-y-2 text-xs text-muted-foreground">
                  {j360LegalReport.strengths.length > 0 ? (
                    j360LegalReport.strengths.map((item) => <li key={item}>{item}</li>)
                  ) : (
                    <li>Nenhum ponto forte estruturado foi reportado.</li>
                  )}
                </ul>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-foreground/70">Pontos de atenção</p>
                <ul className="mt-2 space-y-2 text-xs text-muted-foreground">
                  {j360LegalReport.attentionPoints.length > 0 ? (
                    j360LegalReport.attentionPoints.map((item) => <li key={item}>{item}</li>)
                  ) : (
                    <li>Nenhum ponto de atenção estruturado foi reportado.</li>
                  )}
                </ul>
              </div>
            </div>
            <div className="overflow-x-auto rounded-xl border border-white/10">
              <table className="min-w-full text-left text-xs text-muted-foreground">
                <thead className="bg-white/5 text-foreground">
                  <tr>
                    <th className="px-3 py-2">Risco identificado</th>
                    <th className="px-3 py-2">Severidade</th>
                    <th className="px-3 py-2">Impacto possível</th>
                    <th className="px-3 py-2">Mitigação recomendada</th>
                  </tr>
                </thead>
                <tbody>
                  {j360LegalReport.riskMatrix.length > 0 ? (
                    j360LegalReport.riskMatrix.map((item, index) => (
                      <tr key={`${item.risk}:${index}`} className="border-t border-white/10 align-top">
                        <td className="px-3 py-2 text-foreground">{item.risk}</td>
                        <td className="px-3 py-2">{item.severity}</td>
                        <td className="px-3 py-2">{item.impact}</td>
                        <td className="px-3 py-2">{item.mitigation}</td>
                      </tr>
                    ))
                  ) : (
                    <tr className="border-t border-white/10">
                      <td className="px-3 py-3" colSpan={4}>
                        Nenhuma matriz de risco estruturada foi reportada.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-foreground/70">Ajustes recomendados</p>
                <ul className="mt-2 space-y-2 text-xs text-muted-foreground">
                  {j360LegalReport.recommendedAdjustments.length > 0 ? (
                    j360LegalReport.recommendedAdjustments.map((item) => <li key={item}>{item}</li>)
                  ) : (
                    <li>Nenhum ajuste estruturado foi reportado.</li>
                  )}
                </ul>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-foreground/70">Validação humana</p>
                <ul className="mt-2 space-y-2 text-xs text-muted-foreground">
                  {j360LegalReport.humanValidationQuestions.length > 0 ? (
                    j360LegalReport.humanValidationQuestions.map((item) => <li key={item}>{item}</li>)
                  ) : (
                    <li>Nenhuma pergunta adicional foi estruturada.</li>
                  )}
                </ul>
              </div>
            </div>
            {(j360LegalReport.howToProceedNow.length > 0 || j360LegalReport.nextBestImplementationAction) && (
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-foreground/70">Como seguir agora</p>
                {j360LegalReport.nextBestImplementationAction ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">Próxima melhor ação:</span> {j360LegalReport.nextBestImplementationAction}
                  </p>
                ) : null}
                <ul className="mt-2 space-y-2 text-xs text-muted-foreground">
                  {j360LegalReport.howToProceedNow.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            )}
            <div className="space-y-2 rounded-xl border border-white/10 bg-black/20 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-foreground/70">Matriz de cobertura do parecer</p>
              <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="min-w-full text-left text-xs text-muted-foreground">
                  <thead className="bg-white/5 text-foreground">
                    <tr>
                      <th className="px-3 py-2">O que o parecer pede</th>
                      <th className="px-3 py-2">O que o run respondeu</th>
                      <th className="px-3 py-2">O que ainda depende de revisão manual/jurídica</th>
                    </tr>
                  </thead>
                  <tbody>
                    {j360LegalReport.coverageMatrix.length > 0 ? (
                      j360LegalReport.coverageMatrix.map((item, index) => (
                        <tr key={`${item.whatParecerAsks}:${index}`} className="border-t border-white/10 align-top">
                          <td className="px-3 py-2 text-foreground">{item.whatParecerAsks}</td>
                          <td className="px-3 py-2">{item.whatRunAnswered}</td>
                          <td className="px-3 py-2">{item.whatStillNeedsManualReview ?? "Nenhuma pendência adicional reportada."}</td>
                        </tr>
                      ))
                    ) : (
                      <tr className="border-t border-white/10">
                        <td className="px-3 py-3" colSpan={3}>
                          Nenhuma matriz de cobertura estruturada foi reportada.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {recipeOrchestration && !isJ360LegalReviewRun && !isMktCampaignRun && (
        <section className="space-y-3">
          <header className="space-y-1">
            <h4 className="text-base font-semibold text-foreground">Recipe_Orchestrator — Como concluir esta receita</h4>
            <p className="text-xs text-muted-foreground">
              Plano consultivo inspirado no roteamento do Chat IMOB: agente líder, apoios válidos, limitações e critérios para rerun.
            </p>
          </header>
          <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
              <span className="pill bg-white/10 text-foreground">intent: {recipeOrchestration.intent}</span>
              <span className="pill bg-white/10 text-foreground">domain: {recipeOrchestration.domain}</span>
              <span className="pill bg-white/10 text-foreground">risk: {recipeOrchestration.riskLevel}</span>
              <span className="pill bg-white/10 text-foreground">supportMode: {recipeOrchestration.supportMode}</span>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-foreground/70">Agente líder recomendado</p>
              <p className="mt-2 text-sm font-semibold text-foreground">
                {recipeOrchestration.primaryAgent.displayName} ({recipeOrchestration.primaryAgent.key})
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{recipeOrchestration.primaryAgent.selectionReason}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Confiança: {recipeOrchestration.primaryAgent.confidence.toFixed(2)}
              </p>
              {recipeOrchestration.recipeGoal ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">Objetivo:</span> {recipeOrchestration.recipeGoal}
                </p>
              ) : null}
              {recipeOrchestration.recipeExpectedOutcome ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">Resultado esperado:</span> {recipeOrchestration.recipeExpectedOutcome}
                </p>
              ) : null}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-black/20 p-3 md:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-foreground/70">Etapas estruturadas da recipe</p>
                {recipeOrchestration.recipeSteps.length > 0 ? (
                  <div className="mt-2 grid gap-3 md:grid-cols-2">
                    {recipeOrchestration.recipeSteps.map((step, index) => (
                      <div key={step.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                        <p className="text-sm font-semibold text-foreground">
                          {index + 1}. {step.title}
                        </p>
                        {step.objective ? <p className="mt-1 text-xs text-muted-foreground">{step.objective}</p> : null}
                        {step.checks.length > 0 ? (
                          <p className="mt-2 text-[11px] text-muted-foreground">
                            <span className="font-semibold text-foreground">Checks:</span> {step.checks.join(" · ")}
                          </p>
                        ) : null}
                        {step.evidence.length > 0 ? (
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            <span className="font-semibold text-foreground">Evidências:</span> {step.evidence.join(" · ")}
                          </p>
                        ) : null}
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Bloqueia avanço: {step.blocking ? "sim" : "não"}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">
                    A recipe não reportou etapas estruturadas; o runtime caiu no fallback textual.
                  </p>
                )}
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-foreground/70">Guardian será acionado?</p>
                <p className="mt-2 text-sm text-foreground">
                  {recipeOrchestration.requiresGuardianReview ? "Sim" : "Não"}
                </p>
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {recipeOrchestration.guardianReviewReason.length > 0 ? (
                    recipeOrchestration.guardianReviewReason.map((item) => <li key={item}>{item}</li>)
                  ) : (
                    <li>Nenhum gatilho adicional de governança informado.</li>
                  )}
                </ul>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-foreground/70">Governança aplicada</p>
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  <li>tenant/workspace: {recipeOrchestration.governance.tenantIdPresent && recipeOrchestration.governance.workspaceIdPresent ? "ok" : "ausente"}</li>
                  <li>policyDecision: {recipeOrchestration.governance.policyDecision}</li>
                  <li>RBAC: {recipeOrchestration.governance.rbacEvaluated ? "avaliado" : "não avaliado"}</li>
                  <li>Entitlement: {recipeOrchestration.governance.entitlementEvaluated ? "avaliado" : "não avaliado"}</li>
                  <li>TrustScore: {recipeOrchestration.governance.trustScoreEvaluated ? "avaliado" : "não avaliado"}</li>
                  <li>CostGuard: {recipeOrchestration.governance.costGuardEvaluated ? "avaliado" : "não avaliado"}</li>
                </ul>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-foreground/70">Agentes self-service que podem ajudar</p>
                {recipeOrchestration.suggestedSelfServiceAgents.length > 0 ? (
                  <div className="mt-2 space-y-2">
                    <div className="flex flex-wrap gap-2">
                      {recipeOrchestration.suggestedSelfServiceAgents.map((agent) => (
                        <span key={`${agent.key}:${agent.displayName}:pill`} className="pill bg-emerald-500/10 text-emerald-200">
                          {agent.displayName}
                        </span>
                      ))}
                    </div>
                    <ul className="space-y-2 text-xs text-muted-foreground">
                      {recipeOrchestration.suggestedSelfServiceAgents.map((agent) => (
                        <li key={`${agent.key}:${agent.displayName}`}>
                          <span className="font-semibold text-foreground">{agent.displayName}</span>: {agent.purpose}
                          <div className="mt-1 text-[11px] text-muted-foreground">
                            Pode orientar: {agent.canAdvise ? "sim" : "não"} · Pode executar: {agent.canExecute ? "sim" : "não"} · Custo: {agent.estimatedCostStatus}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <ul className="mt-2 space-y-2 text-xs text-muted-foreground">
                    <li>Nenhum agente auxiliar sugerido para esta receita.</li>
                  </ul>
                )}
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-foreground/70">Limitações</p>
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {recipeOrchestration.limitations.length > 0 ? (
                    recipeOrchestration.limitations.map((item) => <li key={item}>{item}</li>)
                  ) : (
                    <li>Nenhuma limitação adicional reportada.</li>
                  )}
                </ul>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-foreground/70">Passos práticos</p>
                <ol className="mt-2 space-y-1 pl-4 text-xs text-muted-foreground">
                  {recipeOrchestration.practicalSteps.length > 0 ? (
                    recipeOrchestration.practicalSteps.map((item) => <li key={item}>{item}</li>)
                  ) : (
                    <li>Nenhum passo prático estruturado.</li>
                  )}
                </ol>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-foreground/70">Pronto para rerun quando</p>
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {recipeOrchestration.readyForRerunWhen.length > 0 ? (
                    recipeOrchestration.readyForRerunWhen.map((item) => <li key={item}>{item}</li>)
                  ) : (
                    <li>Sem critérios objetivos de rerun.</li>
                  )}
                </ul>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-foreground/70">Como seguir agora</p>
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {recipeOrchestration.howToProceedNow.length > 0 ? (
                    recipeOrchestration.howToProceedNow.map((item) => <li key={item}>{item}</li>)
                  ) : (
                    <li>Nenhuma orientação adicional de implementação.</li>
                  )}
                </ul>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-foreground/70">Próxima melhor ação para implementação</p>
                <p className="mt-2 text-sm text-foreground">
                  {recipeOrchestration.nextBestImplementationAction ?? "Nenhuma ação adicional estruturada."}
                </p>
                {recipeOrchestration.externalPlatformsInvolved.length > 0 ? (
                  <div className="mt-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-foreground/70">Plataformas externas envolvidas</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {recipeOrchestration.externalPlatformsInvolved.map((platform) => (
                        <span key={platform} className="pill bg-white/10 text-foreground">
                          {platform}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-foreground/70">Recipes recomendadas em ordem</p>
              <ol className="mt-2 space-y-2 pl-4 text-xs text-muted-foreground">
                {recipeOrchestration.recommendedRecipes.length > 0 ? (
                  recipeOrchestration.recommendedRecipes.map((item) => (
                    <li key={`${item.order}:${item.title}`}>
                      <span className="font-semibold text-foreground">{item.order}. {item.title}</span>
                      <div className="mt-1 text-[11px] text-muted-foreground">{item.objective}</div>
                      {item.externalPlatform ? <div className="mt-1 text-[11px] text-muted-foreground">Plataforma: {item.externalPlatform}</div> : null}
                    </li>
                  ))
                ) : (
                  <li>Nenhuma recipe adicional recomendada.</li>
                )}
              </ol>
            </div>
          </div>
        </section>
      )}

      {diagnostico && !isMktCampaignRun && (
        <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
          <span className="pill bg-white/10 text-foreground">Runs analisados: {diagnosticStats.totalPrevRuns}</span>
          <span className="pill bg-white/10 text-foreground">
            Exploração: {diagnosticStats.exploracaoPct}%
          </span>
          <span className="pill bg-emerald-500/10 text-emerald-200">
            Filtrados adotados: {diagnosticStats.filtradosAdotados}
          </span>
          <span className="pill bg-amber-500/10 text-amber-200">
            Filtrados rejeitados: {diagnosticStats.filtradosRejeitados}
          </span>
        </div>
      )}

      {recommendations.length > 0 && !isMktCampaignRun && (
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
              const showScoreDelta = scoreDelta !== null && Math.abs(scoreDelta) >= 0.01;
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
              const recommendationMetadata = isPlainObject(rec.metadata)
                ? (rec.metadata as Record<string, unknown>)
                : null;
              const recommendationChecklistSteps = extractRecommendationChecklistSteps(recommendationMetadata);
              const linkedRecipeTitle =
                recommendationMetadata && typeof recommendationMetadata.recipeTitle === "string"
                  ? recommendationMetadata.recipeTitle
                  : null;
              const execApi = execucao ? String(execucao.api_sugerida ?? execucao.api ?? "LLM") : null;
              const execTask = execucao ? String(execucao.tipo_tarefa ?? execucao.tipo ?? "Tarefa") : null;
              const execTokens =
                execucao && typeof execucao.custo_estimado_tokens === "number"
                  ? `${execucao.custo_estimado_tokens} tokens`
                  : execucao && typeof execucao.tokens === "number"
                  ? `${execucao.tokens} tokens`
                  : null;
              const identityKey =
                typeof rec.key === "string"
                  ? rec.key
                  : typeof rec.tatica === "string"
                  ? rec.tatica
                  : `rec-${index}`;
              const adopted = adoptedOverrides[identityKey] ?? Boolean(rec.adopted);

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
                      {showScoreDelta ? (
                        <span
                          className={`pill ${
                            (scoreDelta ?? 0) > 0
                              ? "bg-emerald-500/15 text-emerald-200"
                              : (scoreDelta ?? 0) < 0
                              ? "bg-rose-500/15 text-rose-200"
                              : "bg-white/10 text-foreground"
                          }`}
                        >
                          {scoreDeltaLabel ? `Delta ${scoreDeltaLabel}` : null}
                        </span>
                      ) : null}
                      {critical && <span className="pill bg-amber-500/15 text-amber-200">Pontuação crítica</span>}
                      {adopted ? <span className="pill bg-emerald-500/20 text-emerald-200">Adotada</span> : null}
                    </div>
                  </div>
                  {rationale && <p className="mt-3 text-sm text-foreground/90">{rationale}</p>}
                  {nextSteps && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">Próximos passos sugeridos:</span> {nextSteps}
                    </p>
                  )}
                  {execucao && (
                    <ul className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                      {execApi && <li className="pill">{execApi}</li>}
                      {execTask && <li className="pill">{execTask}</li>}
                      {execTokens && <li className="pill">{execTokens}</li>}
                    </ul>
                  )}
                  {linkedRecipeTitle || recommendationChecklistSteps.length > 0 ? (
                    <div className="mt-3 space-y-2 text-[11px] text-muted-foreground">
                      {linkedRecipeTitle ? (
                        <p>
                          <span className="font-semibold text-foreground">Recipe:</span> {linkedRecipeTitle}
                        </p>
                      ) : null}
                      {recommendationChecklistSteps.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {recommendationChecklistSteps.map((item) => (
                            <span
                              key={`${item.step}:${item.status}`}
                              className={mergeClassName(
                                "pill",
                                item.status === "verified"
                                  ? "bg-emerald-500/15 text-emerald-200"
                                  : item.status === "warning" || item.status === "degraded"
                                  ? "bg-amber-500/15 text-amber-200"
                                  : "bg-red-500/15 text-red-200"
                              )}
                            >
                              {item.step}: {item.status}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
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

      {agentState && !isMktCampaignRun && (
        <section className="space-y-2">
          <h4 className="text-base font-semibold text-foreground">Estado persistido</h4>
          <pre className="max-h-48 overflow-auto rounded-2xl bg-black/60 p-4 text-xs text-foreground/80">
            {maskedAgentState}
          </pre>
        </section>
      )}

      {briefingMarkdown && !isMktCampaignRun && (
        <section className="space-y-2">
          <h4 className="text-base font-semibold text-foreground">Briefing estruturado</h4>
          <div className="prose prose-invert max-w-none text-sm">
            <ReactMarkdown components={markdownComponents}>{maskedBriefingMarkdown}</ReactMarkdown>
          </div>
        </section>
      )}

      {!recommendations.length && !briefingMarkdown && !form && !isMktCampaignRun && (
        <ReactMarkdown components={markdownComponents}>{maskedFallbackJson}</ReactMarkdown>
      )}
      </div>
    </div>
  );
}

type RunAtivoArtifacts = {
  landingHtml?: string;
  pdfHtml?: string;
  alert?: {
    message?: string;
    severity?: string;
    highlight?: string;
  };
};

function RunAtivoArtifactsView({ artifacts, runId }: { artifacts: RunAtivoArtifacts; runId: string }) {
  return (
    <section className="space-y-4">
      <header>
        <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">Run Ativo Universal</p>
        <h4 className="text-base font-semibold text-foreground">Landing generada automaticamente</h4>
        <p className="text-xs text-muted-foreground">
          Este preview mostra o HTML que ja esta disponível para exportação e streaming no front-end.
        </p>
      </header>

      {artifacts.landingHtml ? (
        <div className="h-[520px] w-full overflow-hidden rounded-3xl border border-white/10 bg-black/30 shadow-inner">
          <iframe
            title={`run-${runId}-landing`}
            srcDoc={artifacts.landingHtml}
            className="h-full w-full rounded-3xl border-0"
            sandbox="allow-same-origin"
          />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Landing ainda nao disponível neste run. Assim que o agente terminar, ela aparecerá aqui.
        </p>
      )}

      {artifacts.alert && (
        <div className="rounded-3xl border border-white/10 bg-white/5 p-4 text-sm leading-relaxed text-foreground/90">
          <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">Alerta priorizado</p>
          <h5 className="text-base font-semibold text-foreground">
            {artifacts.alert.highlight ?? "Prioridade do run"}
          </h5>
          {artifacts.alert.severity && (
            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-0.5 text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
              {artifacts.alert.severity}
            </span>
          )}
          <p className="mt-2 text-sm text-foreground/90">
            {artifacts.alert.message ?? "Sem descrição adicional."}
          </p>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        As opcoes de download abaixo utilizam estes artefatos prontos. Você também pode exportar via API ou CLI com
        `eiah runs download`.
      </p>
    </section>
  );
}

function shouldUseRunAtivoHtml(agent: string, html: string | undefined) {
  if (!html) return false;
  const normalizedAgent = agent.toLowerCase();
  if (normalizedAgent !== "guardian") return true;

  const haystack = html.toLowerCase();
  const hasGuardianMarkers = GUARDIAN_RUN_ATIVO_MARKERS.some((marker) => haystack.includes(marker));
  const hasGenericPitchMarkers = GENERIC_RUN_ATIVO_MARKERS.some((marker) => haystack.includes(marker));
  return hasGuardianMarkers || !hasGenericPitchMarkers;
}

function extractRunAtivoArtifacts(agent: string, response: unknown): RunAtivoArtifacts | null {
  if (!isPlainObject(response)) return null;
  const reporting = response.reporting;
  if (!isPlainObject(reporting)) return null;
  const runAtivo = reporting.runAtivoUniversal;
  if (!isPlainObject(runAtivo)) return null;

  const rawLandingHtml = typeof runAtivo.landingHtml === "string" ? runAtivo.landingHtml : undefined;
  const rawPdfHtml = typeof runAtivo.pdfHtml === "string" ? runAtivo.pdfHtml : undefined;
  const landingHtml = shouldUseRunAtivoHtml(agent, rawLandingHtml) ? rawLandingHtml : undefined;
  const pdfHtml = shouldUseRunAtivoHtml(agent, rawPdfHtml) ? rawPdfHtml : undefined;

  let alert: RunAtivoArtifacts["alert"];
  const rawAlert = runAtivo.alert;
  if (typeof rawAlert === "string") {
    alert = { message: rawAlert };
  } else if (isPlainObject(rawAlert)) {
    alert = {
      message: typeof rawAlert.message === "string" ? rawAlert.message : undefined,
      severity: typeof rawAlert.severity === "string" ? rawAlert.severity : undefined,
      highlight: typeof rawAlert.highlight === "string" ? rawAlert.highlight : undefined,
    };
  }

  if (!landingHtml && !pdfHtml && !alert) {
    return null;
  }

  return { landingHtml, pdfHtml, alert };
}

function downloadString(content: string, filename: string, mime: string) {
  if (typeof document === "undefined") return;
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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

function extractDelegationInfo(request: unknown): DelegationInfo | null {
  if (!isPlainObject(request)) return null;
  const metadata = request.metadata;
  if (!isPlainObject(metadata)) return null;
  const delegation = metadata.delegation;
  if (!isPlainObject(delegation)) return null;

  return {
    id: typeof delegation.id === "string" ? delegation.id : undefined,
    delegatorId: typeof delegation.delegatorId === "string" ? delegation.delegatorId : undefined,
    marketplaceId:
      typeof delegation.marketplaceId === "string" ? delegation.marketplaceId : null,
    scope: typeof delegation.scope === "string" ? delegation.scope : undefined,
    trustMin: typeof delegation.trustMin === "number" ? delegation.trustMin : undefined,
    validUntil: typeof delegation.validUntil === "string" ? delegation.validUntil : undefined,
  };
}

type BuildRunReportHtmlOptions = {
  run: RunData;
  data: Record<string, unknown>;
  summaryItems: SummaryItem[];
  summarySubtitle: string;
  fallbackForms: ReportForms;
  promptText?: string;
  rawDetail?: string;
};

type ReportForms = {
  campaign?: CampaignForm | null;
  pitch?: PitchForm | null;
  j360?: J360Form | null;
  guardian?: GuardianForm | null;
};

function deriveFormsForReport(data: Record<string, unknown>): ReportForms {
  return {
    campaign: extractCampaignForm(data),
    pitch: extractPitchForm(data),
    j360: extractJ360Form(data),
    guardian: extractGuardianForm(data),
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

  if (agent.toLowerCase() === "guardian") {
    return {
      items: [],
      subtitle: "Objetivo operacional, evidências e trilha de validação informados na execução.",
    };
  }

  return {
    items: [],
    subtitle: agent.toLowerCase() === "pitch" ? "Resumo indisponível no briefing." : "Resumo não fornecido.",
  };
}

function formatGuardianCurrencyValue(value: number | null | undefined, currency = "BRL") {
  if (typeof value !== "number" || !Number.isFinite(value)) return "não calculado";
  return value.toLocaleString("pt-BR", { style: "currency", currency });
}

function formatGuardianTokenValue(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "não reportados";
  return new Intl.NumberFormat("pt-BR").format(value);
}

function formatGuardianFinopsStatusLabel(report: GuardianReportView) {
  if (report.finopsStatus === "not_calculated" && typeof report.finops.totalTokens === "number" && report.finops.totalTokens > 0) {
    return "uso reportado, custo monetário não consolidado";
  }
  if (report.finopsStatus === "calculated") return "calculado";
  if (report.finopsStatus === "not_calculated") return "parcial";
  return "não reportado";
}

function formatJ360LegalDecisionLabel(value: J360LegalReportView["legalDecision"]) {
  if (value === "APROVADO_BAIXO_RISCO") return "aprovado para uso interno com baixo risco";
  if (value === "APROVADO_COM_RESSALVAS") return "aprovado com ressalvas e ajustes recomendados";
  return "não recomendado sem revisão jurídica";
}

function buildRecipeOrchestrationHtmlBlock(orchestration: RecipeOrchestrationView | null) {
  if (!orchestration) return "";
  const suggestedAgentPills =
    orchestration.suggestedSelfServiceAgents.length > 0
      ? orchestration.suggestedSelfServiceAgents
          .map(
            (agent) =>
              `<span class="pill" style="background:rgba(16,185,129,.12);color:#86efac;border-color:rgba(16,185,129,.18);">${sanitizeTextContent(
                agent.displayName
              )}</span>`
          )
          .join(" ")
      : "";
  const suggestedAgents =
    orchestration.suggestedSelfServiceAgents.length > 0
      ? orchestration.suggestedSelfServiceAgents
          .map(
            (agent) => `<li><strong>${sanitizeTextContent(agent.displayName)}</strong>: ${sanitizeTextContent(
              agent.purpose
            )}<br /><small class="muted">Pode orientar: ${agent.canAdvise ? "sim" : "não"} · Pode executar: ${agent.canExecute ? "sim" : "não"} · Custo: ${sanitizeTextContent(
              agent.estimatedCostStatus
            )}</small></li>`
          )
          .join("")
      : "<li>Nenhum agente auxiliar sugerido para esta receita.</li>";
  const limitations =
    orchestration.limitations.length > 0
      ? orchestration.limitations.map((item) => `<li>${sanitizeTextContent(item)}</li>`).join("")
      : "<li>Nenhuma limitação adicional reportada.</li>";
  const practicalSteps =
    orchestration.practicalSteps.length > 0
      ? orchestration.practicalSteps.map((item) => `<li>${sanitizeTextContent(item)}</li>`).join("")
      : "<li>Nenhum passo prático estruturado.</li>";
  const rerunWhen =
    orchestration.readyForRerunWhen.length > 0
      ? orchestration.readyForRerunWhen.map((item) => `<li>${sanitizeTextContent(item)}</li>`).join("")
      : "<li>Sem critérios objetivos de rerun.</li>";
  const howToProceedNow =
    orchestration.howToProceedNow.length > 0
      ? orchestration.howToProceedNow.map((item) => `<li>${sanitizeTextContent(item)}</li>`).join("")
      : "<li>Nenhuma orientação adicional de implementação.</li>";
  const recommendedRecipes =
    orchestration.recommendedRecipes.length > 0
      ? orchestration.recommendedRecipes
          .map(
            (item) => `<li><strong>${sanitizeTextContent(`${item.order}. ${item.title}`)}</strong><br /><small class="muted">${sanitizeTextContent(
              item.objective
            )}</small>${item.externalPlatform ? `<br /><small class="muted">Plataforma: ${sanitizeTextContent(item.externalPlatform)}</small>` : ""}</li>`
          )
          .join("")
      : "<li>Nenhuma recipe adicional recomendada.</li>";
  const externalPlatforms =
    orchestration.externalPlatformsInvolved.length > 0
      ? orchestration.externalPlatformsInvolved
          .map((platform) => `<span class="pill">${sanitizeTextContent(platform)}</span>`)
          .join(" ")
      : "";
  const guardianReasons =
    orchestration.guardianReviewReason.length > 0
      ? orchestration.guardianReviewReason.map((item) => `<li>${sanitizeTextContent(item)}</li>`).join("")
      : "<li>Nenhum gatilho adicional de governança informado.</li>";

  return `<section class="card">
      <h2>Recipe_Orchestrator — Como concluir esta receita</h2>
      <div class="summary-grid">
        <div><small class="muted">Intenção detectada</small><p>${sanitizeTextContent(orchestration.intent)}</p></div>
        <div><small class="muted">Domínio detectado</small><p>${sanitizeTextContent(orchestration.domain)}</p></div>
        <div><small class="muted">Risco</small><p>${sanitizeTextContent(orchestration.riskLevel)}</p></div>
        <div><small class="muted">Support mode</small><p>${sanitizeTextContent(orchestration.supportMode)}</p></div>
      </div>
      <div class="card" style="margin-top:12px;">
        <small class="muted">Agente líder recomendado</small>
        <p><strong>${sanitizeTextContent(orchestration.primaryAgent.displayName)}</strong> (${sanitizeTextContent(orchestration.primaryAgent.key)})</p>
        <p>${sanitizeTextContent(orchestration.primaryAgent.selectionReason)}</p>
      </div>
      <div class="summary-grid" style="margin-top:12px;">
        <div>
          <h3>Guardian será acionado?</h3>
          <p>${orchestration.requiresGuardianReview ? "Sim" : "Não"}</p>
          <ul>${guardianReasons}</ul>
        </div>
        <div>
          <h3>Governança aplicada</h3>
          <ul>
            <li>tenant/workspace: ${orchestration.governance.tenantIdPresent && orchestration.governance.workspaceIdPresent ? "ok" : "ausente"}</li>
            <li>policyDecision: ${sanitizeTextContent(orchestration.governance.policyDecision)}</li>
            <li>RBAC: ${orchestration.governance.rbacEvaluated ? "avaliado" : "não avaliado"}</li>
            <li>Entitlement: ${orchestration.governance.entitlementEvaluated ? "avaliado" : "não avaliado"}</li>
            <li>TrustScore: ${orchestration.governance.trustScoreEvaluated ? "avaliado" : "não avaliado"}</li>
            <li>CostGuard: ${orchestration.governance.costGuardEvaluated ? "avaliado" : "não avaliado"}</li>
          </ul>
        </div>
      </div>
      <div class="summary-grid" style="margin-top:12px;">
        <div>
          ${suggestedAgentPills ? `<p style="margin:0 0 10px;"><small class="muted">Apoio sugerido agora</small><br />${suggestedAgentPills}</p>` : ""}
          <h3>Agentes self-service que podem ajudar</h3>
          <ul>${suggestedAgents}</ul>
        </div>
        <div>
          <h3>Limitações</h3>
          <ul>${limitations}</ul>
        </div>
      </div>
      <div class="summary-grid" style="margin-top:12px;">
        <div>
          <h3>Passos práticos</h3>
          <ol>${practicalSteps}</ol>
        </div>
        <div>
          <h3>Pronto para rerun quando</h3>
          <ul>${rerunWhen}</ul>
        </div>
      </div>
      <div class="summary-grid" style="margin-top:12px;">
        <div>
          <h3>Como seguir agora</h3>
          <ul>${howToProceedNow}</ul>
        </div>
        <div>
          <h3>Próxima melhor ação para implementação</h3>
          <p>${sanitizeTextContent(orchestration.nextBestImplementationAction ?? "Nenhuma ação adicional estruturada.")}</p>
          ${externalPlatforms ? `<p><small class="muted">Plataformas externas envolvidas</small><br />${externalPlatforms}</p>` : ""}
        </div>
      </div>
      <div style="margin-top:12px;">
        <h3>Recipes recomendadas em ordem</h3>
        <ol>${recommendedRecipes}</ol>
      </div>
    </section>`;
}

function buildJ360LegalReportHtmlBlock(report: J360LegalReportView | null) {
  if (!report) return "";

  const strengths = report.strengths.length
    ? report.strengths.map((item) => `<li>${sanitizeTextContent(item)}</li>`).join("")
    : "<li>Nenhum ponto forte estruturado foi reportado.</li>";
  const attentionPoints = report.attentionPoints.length
    ? report.attentionPoints.map((item) => `<li>${sanitizeTextContent(item)}</li>`).join("")
    : "<li>Nenhum ponto de atenção estruturado foi reportado.</li>";
  const adjustments = report.recommendedAdjustments.length
    ? report.recommendedAdjustments.map((item) => `<li>${sanitizeTextContent(item)}</li>`).join("")
    : "<li>Nenhum ajuste estruturado foi reportado.</li>";
  const humanQuestions = report.humanValidationQuestions.length
    ? report.humanValidationQuestions.map((item) => `<li>${sanitizeTextContent(item)}</li>`).join("")
    : "<li>Nenhuma pergunta adicional foi estruturada.</li>";
  const howToProceed = report.howToProceedNow.length
    ? report.howToProceedNow.map((item) => `<li>${sanitizeTextContent(item)}</li>`).join("")
    : "<li>Nenhuma orientação adicional foi estruturada.</li>";
  const executiveAdjustNow = report.executiveGuidance.adjustNow.length
    ? report.executiveGuidance.adjustNow.map((item) => `<li>${sanitizeTextContent(item)}</li>`).join("")
    : "<li>Nenhum ajuste executivo adicional foi estruturado.</li>";
  const executiveHumanReview = report.executiveGuidance.dependsOnHumanReview.length
    ? report.executiveGuidance.dependsOnHumanReview.map((item) => `<li>${sanitizeTextContent(item)}</li>`).join("")
    : `<li>${
        report.manualReviewRequired
          ? "A revisão jurídica humana final continua recomendada."
          : "Nenhuma dependência humana adicional foi estruturada."
      }</li>`;
  const executiveRerunWhen = report.executiveGuidance.rerunWhen.length
    ? report.executiveGuidance.rerunWhen.map((item) => `<li>${sanitizeTextContent(item)}</li>`).join("")
    : "<li>Após incorporar os ajustes sensíveis e consolidar a nova versão da minuta.</li>";
  const executiveReadyForUse = report.executiveGuidance.readyForInternalUseWhen.length
    ? report.executiveGuidance.readyForInternalUseWhen.map((item) => `<li>${sanitizeTextContent(item)}</li>`).join("")
    : "<li>Quando a redação final estiver validada e coerente com a prática operacional.</li>";
  const riskMatrixRows = report.riskMatrix.length
    ? report.riskMatrix
        .map(
          (item) => `<tr>
            <td>${sanitizeTextContent(item.risk)}</td>
            <td>${sanitizeTextContent(item.severity)}</td>
            <td>${sanitizeTextContent(item.impact)}</td>
            <td>${sanitizeTextContent(item.mitigation)}</td>
            <td>${(item.evidenceRefs ?? [])
              .map(
                (ref) =>
                  `${sanitizeTextContent(ref.document)}${ref.page ? ` · p. ${sanitizeTextContent(ref.page)}` : ""}${
                    ref.section ? ` · ${sanitizeTextContent(ref.section)}` : ""
                  }${ref.excerpt ? `<br /><small>${sanitizeTextContent(ref.excerpt)}</small>` : ""}`
              )
              .join("<br />") || "Documento jurídico anexado"}</td>
          </tr>`
        )
        .join("")
    : `<tr><td colspan="5">Nenhuma matriz de risco estruturada foi reportada.</td></tr>`;
  const coverageRows = report.coverageMatrix.length
    ? report.coverageMatrix
        .map(
          (item) => `<tr>
            <td>${sanitizeTextContent(item.whatParecerAsks)}</td>
            <td>${sanitizeTextContent(item.whatRunAnswered)}</td>
            <td>${sanitizeTextContent(item.whatStillNeedsManualReview ?? "Nenhuma pendência adicional reportada.")}</td>
          </tr>`
        )
        .join("")
    : `<tr><td colspan="3">Nenhuma matriz de cobertura estruturada foi reportada.</td></tr>`;

  return `<section class="section">
    <header>
      <h2>Parecer jurídico estruturado do J_360</h2>
      <p class="muted">Consolidação jurídica preliminar separando decisão, riscos, ajustes e revisão humana.</p>
    </header>
    <div class="chip-group">
      <span class="chip">${sanitizeTextContent(formatJ360LegalDecisionLabel(report.legalDecision))}</span>
      <span class="chip">Risco: ${sanitizeTextContent(report.riskLevel)}</span>
      <span class="chip">Revisão humana: ${report.manualReviewRequired ? "recomendada" : "não obrigatória"}</span>
    </div>
    <p>${sanitizeTextContent(report.summary)}</p>
    <p class="muted"><strong>Escopo:</strong> ${sanitizeTextContent(report.analysisScope)}</p>
    <div class="signature-grid">
      <article class="signature-card j360">
        <h3>O que ajustar agora</h3>
        <ul>${executiveAdjustNow}</ul>
      </article>
      <article class="signature-card j360">
        <h3>O que ainda depende de advogado humano</h3>
        <ul>${executiveHumanReview}</ul>
      </article>
    </div>
    <div class="signature-grid">
      <article class="signature-card j360">
        <h3>Quando voltar para rerun</h3>
        <ul>${executiveRerunWhen}</ul>
      </article>
      <article class="signature-card j360">
        <h3>Quando pode seguir para uso interno</h3>
        <ul>${executiveReadyForUse}</ul>
      </article>
    </div>
    <div class="signature-grid">
      <article class="signature-card j360">
        <h3>Pontos fortes</h3>
        <ul>${strengths}</ul>
      </article>
      <article class="signature-card j360">
        <h3>Pontos de atenção</h3>
        <ul>${attentionPoints}</ul>
      </article>
    </div>
    <div class="section-table">
      <h3>Matriz de riscos</h3>
      <table>
        <thead>
          <tr>
            <th>Risco identificado</th>
            <th>Severidade</th>
            <th>Impacto possível</th>
            <th>Mitigação recomendada</th>
            <th>Evidência referenciada</th>
          </tr>
        </thead>
        <tbody>${riskMatrixRows}</tbody>
      </table>
    </div>
    <div class="signature-grid">
      <article class="signature-card j360">
        <h3>Ajustes recomendados</h3>
        <ul>${adjustments}</ul>
      </article>
      <article class="signature-card j360">
        <h3>Validação humana</h3>
        <ul>${humanQuestions}</ul>
      </article>
    </div>
    <div class="section-table">
      <h3>Como seguir agora</h3>
      ${report.nextBestImplementationAction ? `<p><strong>Próxima melhor ação:</strong> ${sanitizeTextContent(report.nextBestImplementationAction)}</p>` : ""}
      <ul>${howToProceed}</ul>
    </div>
    <div class="section-table">
      <h3>Matriz de cobertura do parecer</h3>
      <table>
        <thead>
          <tr>
            <th>O que o parecer pede</th>
            <th>O que o run respondeu</th>
            <th>O que ainda depende de revisão manual/jurídica</th>
          </tr>
        </thead>
        <tbody>${coverageRows}</tbody>
      </table>
    </div>
  </section>`;
}

function buildJ360RunReportHtml(options: {
  run: RunData;
  report: J360LegalReportView;
  recipeOrchestration?: RecipeOrchestrationView | null;
  promptText?: string;
  rawDetail?: string;
  includeRaw?: boolean;
  autoPrint?: boolean;
}) {
  const { run, report, recipeOrchestration, promptText, rawDetail, includeRaw, autoPrint } = options;
  const promptBlock = promptText
    ? `<section class="section">
        <header>
          <h2>Pergunta original</h2>
          <p class="muted">Texto enviado pelo solicitante.</p>
        </header>
        <p>${sanitizeTextContent(promptText)}</p>
      </section>`
    : "";
  const recipeOrchestrationBlock = buildRecipeOrchestrationHtmlBlock(recipeOrchestration ?? null);
  const legalBlock = buildJ360LegalReportHtmlBlock(report);
  const rawBlock =
    includeRaw && rawDetail
      ? `<section class="section">
          <header>
            <h2>Detalhes técnicos completos</h2>
            <p class="muted">Registro integral do run para auditoria.</p>
          </header>
          <pre style="white-space: pre-wrap; font-size: 10px; background: #0f172a; color: #e2e8f0; padding: 16px; border-radius: 16px; overflow-wrap: break-word;">${sanitizeTextContent(
            rawDetail
          )}</pre>
        </section>`
      : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>Parecer jurídico ${escapeHtml(run.id)}</title>
    <style>
      @page { size: A4; margin: 18mm; }
      :root { color-scheme: light; font-family: "Noto Sans", "Inter", sans-serif; }
      * { box-sizing: border-box; }
      body { margin: 0; background: #f8fafc; color: #0f172a; font-size: 12px; line-height: 1.6; }
      .hero { padding: 28px 20px; background: linear-gradient(135deg, #eff6ff, #ffffff); border-bottom: 1px solid #dbe3ee; }
      .hero-shell, main { width: min(1120px, calc(100vw - 32px)); margin: 0 auto; }
      main { padding: 24px 0 40px; display: grid; gap: 18px; }
      .eyebrow { margin: 0 0 8px; color: #64748b; text-transform: uppercase; letter-spacing: .22em; font-size: .72rem; }
      .hero h1 { margin: 0 0 8px; font-size: clamp(1.7rem, 3vw, 2.3rem); }
      .muted { color: #475569; }
      .section { background: #fff; border: 1px solid #dbe3ee; border-radius: 18px; padding: 18px; box-shadow: 0 18px 50px rgba(15,23,42,.08); }
      .section h2 { margin: 0 0 12px; font-size: 1.08rem; }
      .section h3 { margin: 0 0 10px; font-size: .98rem; }
      .chip-group { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0 14px; }
      .chip { display: inline-flex; padding: 6px 12px; border-radius: 999px; border: 1px solid #dbe3ee; background: #f8fafc; font-size: .82rem; }
      .signature-grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
      .signature-card { background: #fff; border: 1px solid #dbe3ee; border-radius: 16px; padding: 16px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #dbe3ee; padding: 10px; text-align: left; vertical-align: top; }
      th { background: #eff6ff; }
      ul { margin: 0; padding-left: 18px; }
      a { color: #2563eb; text-decoration: none; }
      pre { margin: 0; }
      @media print {
        body { background: #fff; }
        .section, .signature-card { box-shadow: none; break-inside: avoid; }
        .hero { background: transparent; }
      }
    </style>
    ${autoPrint ? `<script>window.addEventListener("load", () => window.print());</script>` : ""}
  </head>
  <body>
    <header class="hero">
      <div class="hero-shell">
        <p class="eyebrow">EIAH J_360 — legal_review</p>
        <h1>${escapeHtml(report.analysisScope)}</h1>
        <p class="muted">Run ID: ${escapeHtml(run.id)} · Agente: ${escapeHtml(run.agent)} · Status: ${escapeHtml(
          run.status
        )}</p>
      </div>
    </header>
    <main>
      ${promptBlock}
      ${legalBlock}
      ${recipeOrchestrationBlock}
      ${rawBlock}
    </main>
  </body>
</html>`;
}

function buildGuardianReportHtml(options: {
  run: RunData;
  report: GuardianReportView;
  recipeOrchestration?: RecipeOrchestrationView | null;
  promptText?: string;
  rawDetail?: string;
  includeRaw?: boolean;
  autoPrint?: boolean;
}) {
  const { run, report, recipeOrchestration, promptText, rawDetail, includeRaw, autoPrint } = options;
  const theme = getAgentTheme(run.agent);
  const border = "rgba(148,163,184,0.18)";
  const accent =
    report.guardianDecision === "GO" ? "#10b981" : report.guardianDecision === "DEGRADED" ? "#f59e0b" : "#ef4444";
  const promptBlock = promptText
    ? `<section class="card">
        <h2>Pergunta original</h2>
        <p>${sanitizeTextContent(promptText)}</p>
      </section>`
    : "";
  const checklistRows =
    report.checklist.length > 0
      ? report.checklist
          .map(
            (item) => `<tr>
              <td>${sanitizeTextContent(item.item)}</td>
              <td>${sanitizeTextContent(item.status)}</td>
              <td>${sanitizeTextContent(item.expectedEvidence)}</td>
              <td>${sanitizeTextContent(item.collectedEvidence ?? "não coletada")}</td>
              <td>${sanitizeTextContent(item.sha256 ?? "não coletado")}</td>
              <td>${item.blocking ? "sim" : "não"}</td>
            </tr>`
          )
          .join("")
      : `<tr><td colspan="6">Nenhuma evidência estruturada foi reportada.</td></tr>`;
  const blockingIssues =
    report.blockingIssues.length > 0
      ? report.blockingIssues
          .map(
            (issue) =>
              `<li><strong>${sanitizeTextContent(issue.severity)}</strong> · ${sanitizeTextContent(
                issue.code
              )} — ${sanitizeTextContent(issue.message)}</li>`
          )
          .join("")
      : "<li>Nenhum bloqueio crítico reportado.</li>";
  const nextSteps =
    report.nextSteps.length > 0
      ? report.nextSteps.map((step) => `<li>${sanitizeTextContent(step)}</li>`).join("")
      : "<li>Nenhuma próxima ação estruturada.</li>";
  const coverageMatrixRows =
    report.coverageMatrix.length > 0
      ? report.coverageMatrix
          .map(
            (item) => `<tr>
              <td>${sanitizeTextContent(item.whatParecerAsks)}</td>
              <td>${sanitizeTextContent(item.whatRunAnswered)}</td>
              <td>${sanitizeTextContent(item.whatStillNeedsManualReview ?? "Nenhuma pendência adicional reportada.")}</td>
            </tr>`
          )
          .join("")
      : `<tr><td colspan="3">Nenhuma matriz de cobertura estruturada foi reportada.</td></tr>`;
  const rawBlock =
    includeRaw && rawDetail
      ? `<section class="card">
          <h2>Anexo técnico</h2>
          <pre>${sanitizeTextContent(rawDetail)}</pre>
        </section>`
      : "";
  const recipeOrchestrationBlock = buildRecipeOrchestrationHtmlBlock(recipeOrchestration ?? null);

  return `<!DOCTYPE html>
  <html lang="pt-BR">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>EIAH Guardian — Parecer Probatório</title>
      <style>
        :root { color-scheme: dark; font-family: "Inter", system-ui, sans-serif; }
        body { margin: 0; background: #020617; color: #e2e8f0; }
        header.hero { padding: 28px 16px; background: linear-gradient(135deg, ${accent}22, #0f172a); border-bottom: 1px solid ${border}; }
        main { max-width: 1120px; margin: 0 auto; padding: 28px 16px 48px; display: grid; gap: 20px; }
        .hero-shell { max-width: 1120px; margin: 0 auto; display: grid; gap: 16px; }
        .hero-grid, .summary-grid, .finops-grid, .audit-grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
        .card { background: #0f172a; border: 1px solid ${border}; border-radius: 18px; padding: 18px; box-shadow: 0 24px 80px rgba(0,0,0,.34); }
        .pill { display: inline-flex; align-items: center; padding: 6px 12px; border-radius: 999px; border: 1px solid ${border}; font-size: 0.8rem; }
        table { width: 100%; border-collapse: collapse; font-size: 0.92rem; }
        th, td { border: 1px solid ${border}; padding: 10px; text-align: left; vertical-align: top; }
        th { background: #111827; }
        pre { margin: 0; white-space: pre-wrap; overflow-wrap: break-word; font-size: 0.78rem; background: #020617; padding: 14px; border-radius: 12px; border: 1px solid ${border}; }
        .muted { color: #94a3b8; }
        h1 { margin: 0; font-size: clamp(1.6rem, 3vw, 2.1rem); }
        h2 { margin: 0 0 12px; font-size: 1.05rem; }
        p, li, td, th, small { line-height: 1.5; }
        @media (max-width: 720px) {
          main { padding: 20px 12px 36px; }
          header.hero { padding: 20px 12px; }
          th, td { font-size: 0.84rem; }
        }
        @media print {
          body { background: #fff; color: #000; }
          .card { box-shadow: none; break-inside: avoid; }
          header.hero { background: transparent; }
        }
      </style>
      ${autoPrint ? `<script>window.addEventListener("load", () => window.print());</script>` : ""}
    </head>
    <body>
      <header class="hero">
        <div class="hero-shell">
          <div>
            <p class="muted" style="margin:0 0 10px;text-transform:uppercase;letter-spacing:.22em;font-size:.72rem;">EIAH Guardian — Parecer Probatório</p>
            <h1>Rota: ${sanitizeTextContent(report.route)}</h1>
            <small class="muted">Run ID: ${sanitizeTextContent(report.auditTrail.runId)} · Ambiente: ${sanitizeTextContent(
              report.environment ?? "não informado"
            )}</small>
          </div>
          <div class="hero-grid">
            <span class="pill">Status técnico do run: ${sanitizeTextContent(report.runStatus.toUpperCase())}</span>
            <span class="pill">Decisão Guardian: ${sanitizeTextContent(report.guardianDecision)}</span>
            ${report.riskLevel ? `<span class="pill">Risco: ${sanitizeTextContent(report.riskLevel)}</span>` : ""}
            <span class="pill">Status das evidências: ${sanitizeTextContent(report.evidenceStatus)}</span>
            <span class="pill">Export: ${sanitizeTextContent(report.exportStatus)}</span>
          </div>
        </div>
      </header>
      <main>
        <section class="card">
          <h2>Decisão executiva</h2>
          <div class="summary-grid">
            <div><small class="muted">ReasonCode</small><p>${sanitizeTextContent(report.reasonCode)}</p></div>
            <div><small class="muted">Próxima ação recomendada</small><p>${sanitizeTextContent(report.nextAction ?? "não informada")}</p></div>
            <div><small class="muted">PII / dados sensíveis</small><p>${sanitizeTextContent(report.piiStatus)}</p></div>
            <div><small class="muted">FinOps</small><p>${sanitizeTextContent(formatGuardianFinopsStatusLabel(report))}</p></div>
            ${report.governance ? `<div><small class="muted">Governança</small><p>${sanitizeTextContent(report.governance.policyDecision)}</p></div>` : ""}
          </div>
          <p>${sanitizeTextContent(report.summary)}</p>
        </section>
        ${recipeOrchestrationBlock}
        ${promptBlock}
        <section class="card">
          <h2>Bloqueios críticos</h2>
          <ul>${blockingIssues}</ul>
        </section>
        <section class="card">
          <h2>Tabela de evidências esperadas vs coletadas</h2>
          <table>
            <thead>
              <tr>
                <th>Item verificado</th>
                <th>Status</th>
                <th>Evidência esperada</th>
                <th>Evidência coletada</th>
                <th>Hash SHA-256</th>
                <th>Bloqueia avanço?</th>
              </tr>
            </thead>
            <tbody>${checklistRows}</tbody>
          </table>
        </section>
        <section class="card">
          <h2>Matriz de cobertura do parecer</h2>
          <p class="muted">Explicação da plataforma sobre o que o parecer técnico pediu, o que este run realmente validou e o que ainda depende de revisão manual ou arquitetural.</p>
          <table>
            <thead>
              <tr>
                <th>O que o parecer pede</th>
                <th>O que o run respondeu</th>
                <th>O que ainda depende de revisão manual/arquitetural</th>
              </tr>
            </thead>
            <tbody>${coverageMatrixRows}</tbody>
          </table>
        </section>
        <section class="card">
          <h2>FinOps</h2>
          <div class="finops-grid">
            <div><small class="muted">Modelo</small><p>${sanitizeTextContent(report.finops.model ?? "não reportado")}</p></div>
            <div><small class="muted">Prompt tokens</small><p>${sanitizeTextContent(formatGuardianTokenValue(report.finops.promptTokens))}</p></div>
            <div><small class="muted">Completion tokens</small><p>${sanitizeTextContent(formatGuardianTokenValue(report.finops.completionTokens))}</p></div>
            <div><small class="muted">Total tokens</small><p>${sanitizeTextContent(formatGuardianTokenValue(report.finops.totalTokens))}</p></div>
            <div><small class="muted">Custo</small><p>${sanitizeTextContent(formatGuardianCurrencyValue(report.finops.estimatedCost, report.finops.currency ?? "BRL"))}</p></div>
            <div><small class="muted">Moeda</small><p>${sanitizeTextContent(report.finops.currency ?? "não reportada")}</p></div>
          </div>
        </section>
        ${
          report.governance
            ? `<section class="card">
          <h2>Governança aplicada</h2>
          <div class="summary-grid">
            <div><small class="muted">tenant/workspace</small><p>${report.governance.tenantIdPresent && report.governance.workspaceIdPresent ? "ok" : "ausente"}</p></div>
            <div><small class="muted">RBAC</small><p>${report.governance.rbacEvaluated ? "avaliado" : "não avaliado"}</p></div>
            <div><small class="muted">Entitlement</small><p>${report.governance.entitlementEvaluated ? "avaliado" : "não avaliado"}</p></div>
            <div><small class="muted">TrustScore</small><p>${report.governance.trustScoreEvaluated ? "avaliado" : "não avaliado"}</p></div>
            <div><small class="muted">CostGuard</small><p>${report.governance.costGuardEvaluated ? "avaliado" : "não avaliado"}</p></div>
            <div><small class="muted">Policy decision</small><p>${sanitizeTextContent(report.governance.policyDecision)}</p></div>
            ${
              typeof report.governance.trustScore === "number"
                ? `<div><small class="muted">Trust score</small><p>${sanitizeTextContent(report.governance.trustScore.toFixed(2))}</p></div>`
                : ""
            }
            ${report.governance.trustLevel ? `<div><small class="muted">Trust level</small><p>${sanitizeTextContent(report.governance.trustLevel)}</p></div>` : ""}
          </div>
        </section>`
            : ""
        }
        <section class="card">
          <h2>Próximos passos</h2>
          <ul>${nextSteps}</ul>
        </section>
        <section class="card">
          <h2>Audit trail</h2>
          <div class="audit-grid">
            <div><small class="muted">Run ID</small><p>${sanitizeTextContent(report.auditTrail.runId)}</p></div>
            <div><small class="muted">Trace ID</small><p>${sanitizeTextContent(report.auditTrail.traceId ?? "não informado")}</p></div>
            <div><small class="muted">Receipt ID</small><p>${sanitizeTextContent(report.auditTrail.receiptId ?? "não informado")}</p></div>
            <div><small class="muted">Verify URL</small><p>${sanitizeTextContent(report.auditTrail.verifyUrl ?? "não informado")}</p></div>
            <div><small class="muted">Evidence bundle</small><p>${sanitizeTextContent(report.auditTrail.evidenceBundleId ?? "não informado")}</p></div>
          </div>
        </section>
        ${rawBlock}
      </main>
    </body>
  </html>`;
}

function buildRunReportHtml(
  options: BuildRunReportHtmlOptions,
  opts: { editable?: boolean; autoPrint?: boolean; includeRaw?: boolean } = {}
): string {
  const { run, data, summaryItems, summarySubtitle, fallbackForms, promptText, rawDetail } = options;
  const editable = Boolean(opts.editable);
  const autoPrint = Boolean(opts.autoPrint);
  const includeRaw = Boolean(opts.includeRaw);
  const recipeOrchestration = extractRecipeOrchestrationData(data);
  if (run.agent.toLowerCase() === "guardian") {
    const guardianReport = extractGuardianReportData(data) ?? buildGuardianTemplateMismatchView(run);
    return buildGuardianReportHtml({
      run,
      report: guardianReport,
      recipeOrchestration,
      promptText,
      rawDetail,
      includeRaw,
      autoPrint,
    });
  }
  const j360LegalReport = extractJ360LegalReportData(data);
  const mktCampaignReport = extractMktCampaignReportData(data);
  const isMarketingCampaignRun =
    run.agent.toLowerCase() === "mkt" &&
    mktCampaignReport &&
    (recipeOrchestration?.intent === "marketing_campaign" || recipeOrchestration?.domain === "marketing");
  if (isMarketingCampaignRun) {
    const payload = buildMktReportingPayload({
      run,
      data,
      mktCampaignReport,
      recipeOrchestration,
    });
    const html = autoPrint ? buildCoreMktPdfHtml(payload) : buildCoreMktLandingPageHtml(payload);
    return autoPrint
      ? html.replace(
          "</body>",
          `<script>window.addEventListener("load", () => window.print());</script></body>`
        )
      : html;
  }
  const isLegalReviewRun =
    run.agent.toLowerCase() === "j_360" &&
    j360LegalReport &&
    (recipeOrchestration?.intent === "legal_review" || recipeOrchestration?.domain === "legal");
  if (isLegalReviewRun) {
    const payload = buildJ360ReportingPayload({
      run,
      data,
      j360LegalReport,
      recipeOrchestration,
    });
    const html = autoPrint ? buildCoreJ360PdfHtml(payload) : buildCoreJ360LandingPageHtml(payload);
    return autoPrint
      ? html.replace(
          "</body>",
          `<script>window.addEventListener("load", () => window.print());</script></body>`
        )
      : html;
  }
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
          "Memória persistente desbloqueia recomendações melhores - priorize rollout Redis/Postgres.",
        ];
  const recipeOrchestrationBlock = buildRecipeOrchestrationHtmlBlock(recipeOrchestration);
  const j360LegalReportBlock = buildJ360LegalReportHtmlBlock(j360LegalReport);

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

  const promptBlock = promptText
    ? `<section class="section">
        <header>
          <h2>Pergunta original</h2>
          <p class="muted">Texto enviado pelo solicitante.</p>
        </header>
        <p>${sanitizeTextContent(promptText)}</p>
      </section>`
    : "";

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
  const normalizedAgent = run.agent.toLowerCase();
  const linkEntries =
    normalizedAgent === "guardian"
      ? [{ label: "API healthcheck", url: healthUrl, description: "Status do cluster de execução /health." }]
      : [
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

  const rawBlock =
    includeRaw && rawDetail
      ? `<section class="section">
          <header>
            <h2>Detalhes técnicos completos</h2>
            <p class="muted">Registro integral do run para auditoria.</p>
          </header>
          <pre style="white-space: pre-wrap; font-size: 10px; background: #0f172a; color: #e2e8f0; padding: 16px; border-radius: 16px; overflow-wrap: break-word;">${sanitizeTextContent(
            rawDetail
          )}</pre>
        </section>`
      : "";

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
          <h1>Run ${sanitizeTextContent(getDisplayAgent(run.agent))}</h1>
          <small>${sanitizeTextContent(formatDiagnostic(extractDiagnosticPayload(data)))}</small>
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
      ${wrapEditable(recipeOrchestrationBlock)}
      ${wrapEditable(promptBlock)}
      ${wrapEditable(agentSignature)}
      ${wrapEditable(j360LegalReportBlock)}
      ${wrapEditable(recommendationsHtml)}
      ${wrapEditable(timelineBlock)}
      ${wrapEditable(insightsBlock)}
      ${wrapEditable(ctaBlock)}
      ${wrapEditable(linksBlock)}
      ${wrapEditable(auditBlock)}
      ${wrapEditable(rawBlock)}
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
  if (fallbackForms.guardian) {
    content = buildGuardianSummaryMarkup(fallbackForms.guardian);
  } else if (summarySection.paragraphs.length || summarySection.bullets.length) {
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
      <h2>${fallbackForms.guardian ? "Resumo probatório" : "Resumo estratégico"}</h2>
      <p class="muted">${sanitizeTextContent(summarySubtitle)}</p>
    </header>
    ${content}
  </section>`;
}

function renderAgentSignature(agent: string, forms: ReportForms) {
  const key = agent.toLowerCase();
  if (key === "guardian" && forms.guardian) {
    const guardian = forms.guardian;
    const checklist = splitGuardianEvidenceChecklist(guardian.evidence);
    const entries = [
      { title: "Rota alvo", value: guardian.requestType },
      { title: "Objetivo", value: truncateReportText(guardian.objective, 220) },
      { title: "Checklist probatório", value: checklist.join(", ") || truncateReportText(guardian.evidence, 180) },
      { title: "PII / termos sensíveis", value: guardian.piiSignals },
      { title: "FinOps", value: guardian.finops },
    ].filter((entry) => entry.value && entry.value.trim().length > 0);
    if (!entries.length) return "";
    return `<section class="section" data-editable contenteditable="false">
      <header>
        <h2>Contexto do Guardian</h2>
        <p class="muted">Resumo operacional para trilha probatória e decisão GO / NO-GO.</p>
      </header>
      <div class="signature-grid">
        ${entries
          .map(
            (entry) => `
          <article class="signature-card guardian">
            <h3>${sanitizeTextContent(entry.title)}</h3>
            <p>${sanitizeTextContent(entry.value ?? "—")}</p>
          </article>`
          )
          .join("")}
      </div>
    </section>`;
  }

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
        <h2>Contexto de campanha</h2>
        <p class="muted">Briefing base usado para gerar as recomendações.</p>
      </header>
      <div class="signature-grid">
        ${entries
          .map(
            (entry) => `
          <article class="signature-card">
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
  const guardian = forms.guardian;
  if (guardian) {
    const checklist = splitGuardianEvidenceChecklist(guardian.evidence);
    return buildGuardianSummaryMarkup({
      ...guardian,
      evidence: checklist.join(", ") || truncateReportText(guardian.evidence, 180),
      notes: truncateReportText(guardian.notes, 320),
      objective: truncateReportText(guardian.objective, 240),
    });
  }

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

function buildGuardianSummaryMarkup(guardian: GuardianForm) {
  const checklist = splitGuardianEvidenceChecklist(guardian.evidence);
  const chips = checklist
    .slice(0, 6)
    .map((item) => `<span class="chip">${sanitizeTextContent(item)}</span>`)
    .join("");

  const details = [
    { label: "Rota alvo", value: guardian.requestType },
    { label: "Objetivo", value: truncateReportText(guardian.objective, 240) },
    { label: "PII / termos sensíveis", value: guardian.piiSignals },
    { label: "FinOps", value: guardian.finops },
    { label: "Observações", value: truncateReportText(guardian.notes, 320) },
  ].filter((entry) => entry.value && entry.value.trim().length > 0);

  const detailsHtml = details
    .map(
      (entry) => `
      <div>
        <dt>${sanitizeTextContent(entry.label)}</dt>
        <dd>${sanitizeTextContent(entry.value ?? "—")}</dd>
      </div>`
    )
    .join("");

  return `
    <div class="space-y-4">
      ${chips ? `<div class="chip-group">${chips}</div>` : ""}
      <dl class="audit-grid">
        ${detailsHtml}
      </dl>
    </div>
  `;
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
  const normalizedAgent = run.agent.toLowerCase();
  const campaignForm =
    normalizedAgent === "guardian"
      ? undefined
      : form ??
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
    if (looksLikeGuardianForm(obj)) return null;
    const channels = Array.isArray(obj.channels)
      ? obj.channels.filter((item): item is string => typeof item === "string")
      : [];
    const form = {
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
    const hasMeaningfulField =
      hasTextValue(form.goal) ||
      hasTextValue(form.audience) ||
      hasTextValue(form.budget) ||
      hasTextValue(form.kpis) ||
      hasTextValue(form.notes) ||
      hasTextValue(form.toneProfile) ||
      hasTextValue(form.toneNotes) ||
      hasTextValue(form.launchDate) ||
      hasTextValue(form.deadline) ||
      form.channels.length > 0;
    return hasMeaningfulField ? form : null;
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

type GuardianForm = {
  requestType?: string;
  objective?: string;
  evidence?: string;
  piiSignals?: string;
  finops?: string;
  notes?: string;
};

type GuardianReportView = {
  route: string;
  runStatus: "success" | "error";
  guardianDecision: "GO" | "NO-GO" | "DEGRADED";
  riskLevel?: "low" | "medium" | "high" | "critical";
  evaluationScope?: "single_route" | "single_step" | "plan_overview";
  activeStepId?: string | null;
  activeStepTitle?: string | null;
  stageDecision?: "GO" | "NO-GO" | "DEGRADED" | null;
  globalDecision?: "GO" | "NO-GO" | "DEGRADED" | "PENDING_OTHER_STEPS" | null;
  reasonCode: string;
  evidenceStatus: "missing" | "partial" | "complete";
  exportStatus: "valid" | "invalid" | "template_mismatch";
  piiStatus: "safe" | "masking_required" | "sensitive_business_data" | "unknown";
  finopsStatus: "calculated" | "not_calculated" | "not_reported";
  summary: string;
  blockingIssues: Array<{ code: string; message: string; severity: "P0" | "P1" | "P2" | "P3" | "P4" }>;
  checklist: Array<{
    item: string;
    status: "missing" | "partial" | "complete" | "degraded";
    expectedEvidence: string;
    collectedEvidence: string | null;
    sha256: string | null;
    blocking: boolean;
  }>;
  coverageMatrix: Array<{
    whatParecerAsks: string;
    whatRunAnswered: string;
    whatStillNeedsManualReview: string | null;
  }>;
  nextSteps: string[];
  finops: {
    model: string | null;
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
    estimatedCost: number | null;
    currency: string | null;
  };
  auditTrail: {
    runId: string;
    traceId: string | null;
    receiptId: string | null;
    verifyUrl: string | null;
    evidenceBundleId: string | null;
  };
  governance?: {
    tenantIdPresent: boolean;
    workspaceIdPresent: boolean;
    rbacEvaluated: boolean;
    entitlementEvaluated: boolean;
    trustScoreEvaluated: boolean;
    costGuardEvaluated: boolean;
    policyDecision: "allowed" | "denied" | "needs_review";
    reasonCode?: string | null;
    trustScore?: number | null;
    trustLevel?: "high" | "medium" | "low";
  };
  environment?: string | null;
  nextAction?: string | null;
};

type J360LegalReportView = {
  schemaVersion: "j360_legal_report.v1";
  documentType: string | null;
  analysisScope: string;
  legalDecision:
    | "APROVADO_BAIXO_RISCO"
    | "APROVADO_COM_RESSALVAS"
    | "NAO_RECOMENDADO_SEM_REVISAO";
  riskLevel: "low" | "medium" | "high" | "critical";
  summary: string;
  strengths: string[];
  attentionPoints: string[];
  riskMatrix: Array<{
    risk: string;
    severity: "low" | "medium" | "high" | "critical";
    relatedClause: string | null;
    impact: string;
    mitigation: string;
    evidenceRefs: Array<{
      document: string;
      page: string | null;
      section: string | null;
      excerpt?: string | null;
    }>;
  }>;
  ambiguities: string[];
  recommendedAdjustments: string[];
  recommendedEvidence: string[];
  humanValidationQuestions: string[];
  manualReviewRequired: boolean;
  executiveGuidance: {
    adjustNow: string[];
    dependsOnHumanReview: string[];
    rerunWhen: string[];
    readyForInternalUseWhen: string[];
  };
  howToProceedNow: string[];
  nextBestImplementationAction: string | null;
  coverageMatrix: Array<{
    whatParecerAsks: string;
    whatRunAnswered: string;
    whatStillNeedsManualReview: string | null;
  }>;
};

type MktCampaignReportView = {
  schemaVersion: "mkt_campaign_report.v1";
  campaignTitle: string | null;
  objective: string;
  campaignSummary: string;
  positioning: string | null;
  audience: {
    primary: string;
    segments: string[];
    geography: string[];
    notes: string | null;
  };
  icp: Array<{
    label: string;
    description: string;
    priority: number;
  }>;
  coreMessage: string | null;
  cta: string | null;
  priorityChannels: Array<
    "email" | "linkedin" | "whatsapp" | "partnerships" | "events" | "communities" | "blog_seo" | "paid_media" | "social" | "other"
  >;
  channelPlans: Array<{
    channel: string;
    label: string;
    objective: string;
    approach: string;
    contentFocus: string[];
    targetMetric: string | null;
    cadence: string | null;
  }>;
  timeline: Array<{
    period: string;
    activity: string;
    description: string;
    owner: string | null;
  }>;
  requiredAssets: Array<{
    name: string;
    objective: string;
    format: string | null;
    owner: string | null;
  }>;
  kpis: Array<{
    name: string;
    target: string;
    channel: string | null;
    notes: string | null;
  }>;
  qualificationCriteria: Array<{
    category: "lead" | "partner" | "pilot";
    criteria: string[];
  }>;
  risks: string[];
  riskLevel: "low" | "medium" | "high";
  nextActions: string[];
  executiveGuidance: {
    adjustNow: string[];
    dependsOnInternalReview: string[];
    rerunWhen: string[];
    readyToLaunchWhen: string[];
  };
};

type RecipeOrchestrationView = {
  schemaVersion: "recipe_orchestration.v1";
  source: "recipe_run";
  recipeId: string | null;
  recipeTitle: string | null;
  recipeGoal: string | null;
  recipeExpectedOutcome: string | null;
  recipeSteps: Array<{
    id: string;
    title: string;
    objective: string;
    checks: string[];
    evidence: string[];
    blocking: boolean;
  }>;
  intent:
    | "go_live_validation"
    | "marketing_campaign"
    | "evidence_collection"
    | "imob_task"
    | "legal_review"
    | "report_generation"
    | "pitch_creation"
    | "financial_analysis"
    | "urban_service"
    | "general_task"
    | "unknown";
  domain: "guardian" | "marketing" | "imob" | "legal" | "finance" | "urban" | "pitch" | "general" | "unknown";
  riskLevel: "low" | "medium" | "high" | "critical";
  primaryAgent: {
    key: "guardian" | "eiah" | "mkt" | "j_360" | "pitch" | "imob" | "legal" | "finance" | "urban" | "other";
    displayName: string;
    selectionReason: string;
    confidence: number;
  };
  requiresGuardianReview: boolean;
  guardianReviewReason: string[];
  supportMode: "none" | "suggest_only" | "delegate_assisted" | "external_handoff";
  allowedSelfServiceAgents: string[];
  suggestedSelfServiceAgents: Array<{
    key: string;
    displayName: string;
    purpose: string;
    canExecute: boolean;
    canAdvise: boolean;
    requiresApproval: boolean;
    requiredScope: string | null;
    estimatedCostStatus: "calculated" | "not_calculated" | "not_reported";
  }>;
  limitations: string[];
  howToProceedNow: string[];
  recommendedRecipes: Array<{
    order: number;
    title: string;
    objective: string;
    externalPlatform: string | null;
  }>;
  externalPlatformsInvolved: string[];
  nextBestImplementationAction: string | null;
  practicalSteps: string[];
  readyForRerunWhen: string[];
  governance: {
    tenantIdPresent: boolean;
    workspaceIdPresent: boolean;
    rbacEvaluated: boolean;
    entitlementEvaluated: boolean;
    trustScoreEvaluated: boolean;
    costGuardEvaluated: boolean;
    policyDecision: "allowed" | "denied" | "approval_required" | "not_evaluated";
    reasonCode: string | null;
  };
  audit: {
    orchestrationDecisionId: string | null;
    selectedAt: string | null;
    basedOnPattern: "chat_imob_orchestrator";
  };
};

function extractGuardianForm(data: Record<string, unknown>): GuardianForm | null {
  const tryFromObject = (obj: Record<string, unknown> | undefined | null): GuardianForm | null => {
    if (!obj) return null;
    const form = {
      requestType: typeof obj.requestType === "string" ? obj.requestType : undefined,
      objective: typeof obj.objective === "string" ? obj.objective : undefined,
      evidence: typeof obj.evidence === "string" ? obj.evidence : undefined,
      piiSignals: typeof obj.piiSignals === "string" ? obj.piiSignals : undefined,
      finops: typeof obj.finops === "string" ? obj.finops : undefined,
      notes: typeof obj.notes === "string" ? obj.notes : undefined,
    };
    const hasMeaningfulField =
      hasTextValue(form.requestType) ||
      hasTextValue(form.objective) ||
      hasTextValue(form.evidence) ||
      hasTextValue(form.piiSignals) ||
      hasTextValue(form.finops) ||
      hasTextValue(form.notes);
    return hasMeaningfulField ? form : null;
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

function extractGuardianReportData(data: Record<string, unknown>): GuardianReportView | null {
  const source = isPlainObject(data.guardianReport)
    ? (data.guardianReport as Record<string, unknown>)
    : isPlainObject(data.metadata) && isPlainObject((data.metadata as Record<string, unknown>).guardianReport)
    ? (((data.metadata as Record<string, unknown>).guardianReport as Record<string, unknown>))
    : null;

  if (!source) return null;
  if (
    typeof source.route !== "string" ||
    typeof source.guardianDecision !== "string" ||
    typeof source.reasonCode !== "string" ||
    typeof source.evidenceStatus !== "string"
  ) {
    return null;
  }

  return source as unknown as GuardianReportView;
}

function extractJ360LegalReportData(data: Record<string, unknown>): J360LegalReportView | null {
  const source = isPlainObject(data.j360LegalReport)
    ? (data.j360LegalReport as Record<string, unknown>)
    : isPlainObject(data.metadata) && isPlainObject((data.metadata as Record<string, unknown>).j360LegalReport)
    ? ((data.metadata as Record<string, unknown>).j360LegalReport as Record<string, unknown>)
    : null;

  if (!source) return null;
  if (
    source.schemaVersion !== "j360_legal_report.v1" ||
    typeof source.analysisScope !== "string" ||
    typeof source.legalDecision !== "string" ||
    typeof source.summary !== "string"
  ) {
    return null;
  }

  return source as unknown as J360LegalReportView;
}

function extractMktCampaignReportData(data: Record<string, unknown>): MktCampaignReportView | null {
  const source = isPlainObject(data.mktCampaignReport)
    ? (data.mktCampaignReport as Record<string, unknown>)
    : isPlainObject(data.metadata) && isPlainObject((data.metadata as Record<string, unknown>).mktCampaignReport)
    ? ((data.metadata as Record<string, unknown>).mktCampaignReport as Record<string, unknown>)
    : null;

  if (!source) return null;
  if (
    source.schemaVersion !== "mkt_campaign_report.v1" ||
    typeof source.objective !== "string" ||
    typeof source.campaignSummary !== "string"
  ) {
    return null;
  }

  return source as unknown as MktCampaignReportView;
}

function extractRecipeOrchestrationData(data: Record<string, unknown>): RecipeOrchestrationView | null {
  const source = isPlainObject(data.recipeOrchestration)
    ? (data.recipeOrchestration as Record<string, unknown>)
    : isPlainObject(data.metadata) && isPlainObject((data.metadata as Record<string, unknown>).recipeOrchestration)
    ? ((data.metadata as Record<string, unknown>).recipeOrchestration as Record<string, unknown>)
    : null;

  if (!source) return null;
  if (
    source.schemaVersion !== "recipe_orchestration.v1" ||
    typeof source.intent !== "string" ||
    typeof source.domain !== "string" ||
    !isPlainObject(source.primaryAgent) ||
    typeof (source.primaryAgent as Record<string, unknown>).displayName !== "string"
  ) {
    return null;
  }

  return source as unknown as RecipeOrchestrationView;
}

function buildGuardianTemplateMismatchView(run: RunData): GuardianReportView {
  return {
    route: "go_live_controlado.domain_dns_api_evidencias",
    runStatus: run.status === "error" ? "error" : "success",
    guardianDecision: "NO-GO",
    reasonCode: "EXPORT_TEMPLATE_MISMATCH",
    evidenceStatus: "missing",
    exportStatus: "template_mismatch",
    piiStatus: "unknown",
    finopsStatus: "not_reported",
    summary:
      "O relatório Guardian não recebeu um payload probatório válido. A exportação local foi bloqueada em modo fail-closed para evitar um parecer incompatível.",
    blockingIssues: [
      {
        code: "EXPORT_TEMPLATE_MISMATCH",
        message: "Payload Guardian ausente ou incompatível com o template probatório.",
        severity: "P0",
      },
    ],
    checklist: [],
    coverageMatrix: [],
    nextSteps: [
      "Reexecutar o run Guardian com payload probatório estruturado.",
      "Validar a rota e os checks executados antes de gerar novo export.",
    ],
    finops: {
      model: null,
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
      estimatedCost: null,
      currency: null,
    },
    auditTrail: {
      runId: run.id,
      traceId: run.meta?.traceId ?? null,
      receiptId: null,
      verifyUrl: null,
      evidenceBundleId: null,
    },
    environment: null,
    nextAction: "Corrigir o payload probatório antes de exportar.",
  };
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
