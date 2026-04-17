import React from "react";
import { useSearchParams, Link } from "react-router-dom";
import { useSession } from "@/state/sessionStore";
import {
  ApiError,
  apiGetImobChatTelemetrySummary,
  apiGetImobExecutiveSummary,
  apiGetImobKpiFunnel,
  apiGetImobKpiPerformance,
  apiListImobApprovalContext,
  apiListImobBottleneckHeatmap,
  apiListImobCases,
  apiListImobChatThreads,
  apiListImobFollowUps,
  apiListImobOwners,
  apiPostImobApprovalAction,
  apiListImobPriorityQueue,
  apiListImobProperties,
  apiListImobWaitingOnBoard,
  apiListRuns,
  type ImobCase,
  type ImobChatThread,
  type ImobPriorityQueueItem,
  type ImobCrmFollowUpItem,
  type ImobKpiFunnel,
  type ImobKpiPerformance,
  type ImobHeatmapCell,
  type ImobApprovalContextItem,
  type ImobOwner,
  type ImobProperty,
  type ImobWaitingOnBucket,
  type ImobRescueMetric,
  type ImobSpecialistLoadMetric,
  type ImobReasonCode,
  type Run,
} from "@/lib/api";
import { getImobPropertyTypeLabel } from "@/features/imob/propertyTypes";
import { ImobAccessGateCard } from "@/components/imob/ImobAccessGateCard";
import { resolveImobAccessGateCopy } from "@/features/imob/accessGateCatalog";
import { IMOB_BUSINESS_QUICK_ACTIONS } from "@/features/imob/businessQuickActions";
import { ThreadPanel } from "@/features/imob/ThreadPanel";
import { ImobPriorityQueue } from "@/features/imob/ImobPriorityQueue";
import { ImobWaitingOnBoard } from "@/features/imob/ImobWaitingOnBoard";
import { ImobBottleneckHeatmap } from "@/features/imob/ImobBottleneckHeatmap";
import { ImobSpecialistLoadBoard } from "@/features/imob/ImobSpecialistLoadBoard";
import { ImobRescueIndex } from "@/features/imob/ImobRescueIndex";
import { ImobApprovalContextCard } from "@/features/imob/ImobApprovalContextCard";
import { formatPct } from "@/lib/formatters";

type Section = "imoveis" | "processos" | "parceiros";

type DashboardSource = "real" | "empty";

const syntheticThreads: ImobChatThread[] = [
  {
    threadId: "th-captacao",
    label: "Captação",
    status: "active",
    firstMessageAt: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
    lastMessageAt: new Date(Date.now() - 19 * 60 * 1000).toISOString(),
    messageCount: 2,
  },
  {
    threadId: "th-contrato",
    label: "Contrato",
    status: "active",
    firstMessageAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    lastMessageAt: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
    messageCount: 6,
  },
  {
    threadId: "th-comissao",
    label: "Comissão",
    status: "blocked",
    firstMessageAt: new Date(Date.now() - 120 * 60 * 1000).toISOString(),
    lastMessageAt: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
    messageCount: 4,
  },
];

function currencyFromCents(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Preço não informado";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value / 100);
}

function sectionLabel(section: Section) {
  if (section === "imoveis") return "Imóveis";
  if (section === "processos") return "Processos";
  return "Parceiros";
}

function formatLatencyMs(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  if (value >= 1000) return `${(value / 1000).toFixed(1)} s`;
  return `${Math.round(value)} ms`;
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
}

function formatJourneyTypeLabel(value: string | null | undefined) {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "property_capture") return "Captação";
  if (normalized === "lead_qualification") return "Qualificação";
  if (normalized === "proposal") return "Proposta";
  if (normalized === "visit_follow_up") return "Visita";
  if (normalized === "negotiation") return "Negociação";
  if (normalized === "documentation") return "Documentação";
  if (normalized === "contract") return "Contrato";
  if (normalized === "commission") return "Comissão";
  if (normalized === "closing") return "Fechamento";
  if (normalized === "temporada_rules") return "Regras de temporada";
  return "Operação";
}

function buildCasePriority(item: ImobCase) {
  const blocked = asStringList(item.canonical?.blockedActions).length;
  const missing = asStringList(item.canonical?.missingContext).length;
  const recommended = item.canonical?.recommendedActions?.length ?? 0;
  const ageHours = (() => {
    const parsed = Date.parse(item.updatedAt);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, (Date.now() - parsed) / 36e5);
  })();
  const score = blocked * 5 + missing * 3 + Math.min(4, Math.floor(ageHours / 12)) + (recommended === 0 ? 2 : 0);
  const label = blocked > 0 ? "alta" : missing > 0 || ageHours >= 24 ? "média" : "normal";
  return { score, label };
}

function priorityTone(label: string) {
  if (label === "alta") return "text-rose-300 border-rose-400/40";
  if (label === "média") return "text-amber-200 border-amber-300/30";
  return "text-emerald-300 border-emerald-400/40";
}

function buildRecommendedCaseHref(base: {
  conversationId: string | null;
  caseId: string | null;
  threadId: string | null;
  actionLabel?: string | null;
  actionHint?: string | null;
}) {
  return buildImobChatHref({
    conversationId: base.conversationId,
    caseId: base.caseId,
    threadId: base.threadId,
    autoprompt: base.actionHint?.trim() || base.actionLabel?.trim() || "mostrar próximo passo deste caso",
  });
}

function formatImobStatusLabel(status: string | null | undefined) {
  const normalized = (status ?? "").trim().toLowerCase();
  if (!normalized) return "sem status";
  if (normalized === "pending_data") return "pendente de dados";
  if (normalized === "ready_for_review") return "pronto para revisão";
  if (normalized === "qualified") return "qualificado";
  if (normalized === "running") return "em andamento";
  if (normalized === "blocked") return "bloqueado";
  if (normalized === "success" || normalized === "completed") return "concluído";
  return normalized.replace(/_/g, " ");
}

function formatCaseFlowLabel(flow: string | null | undefined) {
  const normalized = (flow ?? "").trim().toLowerCase();
  if (normalized === "owner.create" || normalized === "property.create") return "Captação";
  if (normalized === "lead.qualify") return "Lead";
  if (normalized === "visit.schedule") return "Visita";
  if (normalized === "proposal.create") return "Proposta";
  if (normalized === "documents.collect") return "Documentos";
  if (normalized === "deal.review") return "Deal review";
  if (normalized === "contract.prepare") return "Contrato";
  if (normalized === "commission.settle") return "Comissão";
  if (normalized === "listing.activate") return "Listing";
  return flow?.trim() || "Caso";
}

function propertyTitle(item: ImobProperty) {
  const address = item.address?.trim();
  if (address) return address;
  const propertyType = getImobPropertyTypeLabel(item.propertyType?.trim());
  if (propertyType) return propertyType;
  return "Imóvel em cadastro";
}

function propertyStatusTone(status: string | null | undefined) {
  const normalized = (status ?? "").trim().toLowerCase();
  if (normalized === "ready_for_review") return "text-accent border-accent/40";
  if (normalized === "pending_data") return "text-amber-200 border-amber-300/30";
  if (normalized === "qualified" || normalized === "completed" || normalized === "success") return "text-emerald-300 border-emerald-400/40";
  if (normalized === "blocked") return "text-rose-300 border-rose-400/40";
  return "text-muted-foreground border-white/15";
}

function processStatusTone(status: string | null | undefined) {
  const normalized = (status ?? "").trim().toLowerCase();
  if (normalized === "success" || normalized === "completed" || normalized === "ready_for_review") return "text-emerald-300 border-emerald-400/40";
  if (normalized === "blocked") return "text-rose-300 border-rose-400/40";
  if (normalized === "running" || normalized === "collecting") return "text-amber-200 border-amber-300/30";
  return "text-muted-foreground border-white/15";
}

function partnerStatusTone(status: string | null | undefined) {
  const normalized = (status ?? "").trim().toLowerCase();
  if (normalized === "ready_for_review" || normalized === "qualified") return "text-emerald-300 border-emerald-400/40";
  if (normalized === "pending_data") return "text-amber-200 border-amber-300/30";
  if (normalized === "blocked") return "text-rose-300 border-rose-400/40";
  return "text-muted-foreground border-white/15";
}

function buildImobChatHref(base: {
  conversationId: string | null;
  caseId?: string | null;
  threadId?: string | null;
  autoprompt?: string | null;
}) {
  const params = new URLSearchParams();
  if (base.conversationId) params.set("conversationId", base.conversationId);
  if (base.caseId) params.set("caseId", base.caseId);
  if (base.threadId) params.set("threadId", base.threadId);
  if (base.autoprompt) params.set("autoprompt", base.autoprompt);
  const query = params.toString();
  return `/app/imob/chat${query ? `?${query}` : ""}`;
}

function buildPriorityQueueChatHref(
  conversationId: string | null,
  item: ImobPriorityQueueItem,
) {
  return buildImobChatHref({
    conversationId,
    caseId: item.caseId,
    threadId: item.threadId ?? null,
    autoprompt: item.autoprompt,
  });
}

function buildApprovalContextHref(
  conversationId: string | null,
  item: ImobApprovalContextItem,
) {
  return buildImobChatHref({
    conversationId,
    caseId: item.caseId,
    threadId: item.threadId ?? null,
    autoprompt: item.autoprompt,
  });
}

function buildApprovalDelegateTarget(item: ImobApprovalContextItem) {
  if (item.waitingOn === "legal") return "juridico";
  if (item.waitingOn === "finance") return "financeiro";
  if (item.waitingOn === "broker") return "corretor";
  if (item.waitingOn === "lead") return "comercial";
  if (item.waitingOn === "owner") return "captacao";
  return "imob-ops";
}

function buildApprovalEscalationTarget(item: ImobApprovalContextItem) {
  if (item.reasonCode === "AUDIT_BLOCKER") return "governanca";
  if (item.reasonCode === "FINANCIAL_BLOCKER") return "diretoria-financeira";
  if (item.reasonCode === "DOCUMENT_BLOCKER") return "coordenacao-juridica";
  if (item.reasonCode === "COMMERCIAL_PRIORITY") return "lider-comercial";
  return "lider-operacional";
}

function reasonCodeLabel(value: ImobReasonCode) {
  if (value === "COMMERCIAL_PRIORITY") return "prioridade comercial";
  if (value === "FOLLOW_UP_DISCIPLINE") return "disciplina de follow-up";
  if (value === "DOCUMENT_BLOCKER") return "bloqueio documental";
  if (value === "FINANCIAL_BLOCKER") return "bloqueio financeiro";
  return "bloqueio de auditoria/evidência";
}

function formatDashboardCaseLabel(item: ImobCase | null) {
  if (!item) return "Sem caso vinculado";
  const flowLabel = formatCaseFlowLabel(item.flow);
  const propertyCity = item.property?.city?.trim();
  if (propertyCity) return `${flowLabel} • ${propertyCity}`;
  const ownerName = item.owner?.name?.trim();
  if (ownerName) return `${flowLabel} • ${ownerName}`;
  return flowLabel;
}

function buildCaseFallbackActions(item: ImobCase): Array<{ id: string; label: string; inputHint: string }> {
  const pending = asStringList(item.pendingItems).map((entry) => entry.toLowerCase());
  const flow = (item.flow ?? "").trim().toLowerCase();
  const joined = pending.join(" ");
  const actions: Array<{ id: string; label: string; inputHint: string }> = [];
  const addAction = (id: string, label: string, inputHint: string) => {
    if (actions.some((current) => current.id === id)) return;
    actions.push({ id, label, inputHint });
  };

  if (flow.includes("owner.create") || joined.includes("propriet")) {
    addAction("owner.register", "Cadastrar proprietário", "cadastrar proprietário deste caso");
  }
  if (flow.includes("property.create") || joined.includes("imóvel") || joined.includes("imovel")) {
    addAction("property.create", "Cadastrar imóvel", "cadastrar imóvel deste caso");
  }
  if (joined.includes("document") || flow.includes("documents.collect")) {
    addAction("documents.review", "Revisar documentos", "revisar documentos deste caso");
  }
  if (flow.includes("lead.qualify") || joined.includes("lead")) {
    addAction("lead.qualify", "Qualificar lead", "qualificar lead deste caso");
  }
  addAction("case.consult", "Consultar caso", "consultar caso deste atendimento");

  return actions.slice(0, 4);
}

const ImobDashboardPage: React.FC = () => {
  const session = useSession();
  const imobAccessGate = session.accessGate?.product === "IMOB" ? session.accessGate : null;
  const brandName = session.branding?.brandName?.trim() || "Tenant";
  const workspaceLabel = session.branding?.workspaceLabel?.trim() || session.workspaceId;
  const [searchParams, setSearchParams] = useSearchParams();
  const conversationId = (searchParams.get("conversationId") || "").trim() || null;
  const requestedThreadId = (searchParams.get("threadId") || "").trim() || null;
  const requestedCaseId = (searchParams.get("caseId") || "").trim() || null;
  const rawSection = (searchParams.get("section") || "imoveis").toLowerCase();
  const section: Section = rawSection === "processos" || rawSection === "parceiros" ? rawSection : "imoveis";
  const [selectedThreadId, setSelectedThreadId] = React.useState<string | null>(requestedThreadId);
  const [threads, setThreads] = React.useState<ImobChatThread[]>(syntheticThreads);
  const [telemetrySummary, setTelemetrySummary] = React.useState<{
    generatedAt: string;
    totals: {
      events: number;
      messageToPlanAvgMs: number | null;
      planToExecuteAvgMs: number | null;
      chatToRunCoveragePct: number;
      persistSuccessRatePct: number;
    };
  } | null>(null);
  const [telemetryLoading, setTelemetryLoading] = React.useState(false);
  const [owners, setOwners] = React.useState<ImobOwner[]>([]);
  const [properties, setProperties] = React.useState<ImobProperty[]>([]);
  const [cases, setCases] = React.useState<ImobCase[]>([]);
  const [runs, setRuns] = React.useState<Run[]>([]);
  const [priorityQueue, setPriorityQueue] = React.useState<ImobPriorityQueueItem[]>([]);
  const [waitingOnBoard, setWaitingOnBoard] = React.useState<ImobWaitingOnBucket[]>([]);
  const [bottleneckHeatmap, setBottleneckHeatmap] = React.useState<ImobHeatmapCell[]>([]);
  const [specialistLoad, setSpecialistLoad] = React.useState<ImobSpecialistLoadMetric[]>([]);
  const [rescueIndex, setRescueIndex] = React.useState<ImobRescueMetric[]>([]);
  const [approvalContext, setApprovalContext] = React.useState<ImobApprovalContextItem[]>([]);
  const [followUps, setFollowUps] = React.useState<ImobCrmFollowUpItem[]>([]);
  const [followUpLoading, setFollowUpLoading] = React.useState(false);
  const [kpiFunnel, setKpiFunnel] = React.useState<ImobKpiFunnel | null>(null);
  const [kpiPerformance, setKpiPerformance] = React.useState<ImobKpiPerformance | null>(null);
  const [kpiLoading, setKpiLoading] = React.useState(false);
  const [dashboardLoading, setDashboardLoading] = React.useState(true);
  const [dashboardError, setDashboardError] = React.useState<string | null>(null);
  const [dashboardSource, setDashboardSource] = React.useState<DashboardSource>("empty");

  const reloadApprovalContext = React.useCallback(async () => {
    const response = await apiListImobApprovalContext({ limit: 8 });
    setApprovalContext(response.data.items ?? []);
  }, []);

  const handleApprovalAction = React.useCallback(async (
    item: ImobApprovalContextItem,
    action: "approve" | "delegate" | "escalate",
  ) => {
    try {
      setDashboardError(null);
      const delegatedTo = action === "delegate" ? buildApprovalDelegateTarget(item) : undefined;
      const escalationTarget = action === "escalate" ? buildApprovalEscalationTarget(item) : undefined;
      const note = action === "approve"
        ? `Aprovado via command center para ${reasonCodeLabel(item.reasonCode)}.`
        : action === "delegate"
          ? `Delegado via command center para ${delegatedTo}.`
          : `Escalado via command center para ${escalationTarget}.`;

      await apiPostImobApprovalAction({
        caseId: item.caseId,
        action,
        reasonCode: item.reasonCode,
        specialistId: item.specialistId,
        delegatedTo,
        escalationTarget,
        note,
      });

      await reloadApprovalContext();
    } catch (error) {
      if (error instanceof ApiError && error.body && typeof error.body === "object") {
        const payload = error.body as { error?: { message?: string } };
        setDashboardError(payload.error?.message ?? "Falha ao registrar ação de approval no caso");
      } else {
        setDashboardError(error instanceof Error ? error.message : "Falha ao registrar ação de approval no caso");
      }
    }
  }, [reloadApprovalContext]);

  const setSection = (next: Section) => {
    const params = new URLSearchParams(searchParams);
    params.set("section", next);
    setSearchParams(params, { replace: true });
  };

  React.useEffect(() => {
    setSelectedThreadId(requestedThreadId);
  }, [requestedThreadId]);

  React.useEffect(() => {
    const params = new URLSearchParams(searchParams);
    if (selectedThreadId) {
      params.set("threadId", selectedThreadId);
    } else {
      params.delete("threadId");
    }
    const current = searchParams.toString();
    const next = params.toString();
    if (current !== next) {
      setSearchParams(params, { replace: true });
    }
  }, [searchParams, selectedThreadId, setSearchParams]);

  React.useEffect(() => {
    let mounted = true;
    if (!conversationId) {
      setThreads(syntheticThreads);
      return () => {
        mounted = false;
      };
    }
    void apiListImobChatThreads(conversationId)
      .then((result) => {
        if (!mounted) return;
        if (result.items.length > 0) {
          setThreads(result.items);
          if (requestedThreadId && !result.items.some((item) => item.threadId === requestedThreadId)) {
            setSelectedThreadId(null);
          }
          return;
        }
        setThreads(syntheticThreads);
      })
      .catch(() => {
        if (!mounted) return;
        setThreads(syntheticThreads);
      });
    return () => {
      mounted = false;
    };
  }, [conversationId, requestedThreadId]);

  React.useEffect(() => {
    let mounted = true;
    if (imobAccessGate) {
      setOwners([]);
      setProperties([]);
      setCases([]);
      setRuns([]);
      setPriorityQueue([]);
      setWaitingOnBoard([]);
      setBottleneckHeatmap([]);
      setSpecialistLoad([]);
      setRescueIndex([]);
      setApprovalContext([]);
      setDashboardSource("empty");
      setDashboardError(null);
      setDashboardLoading(false);
      return () => {
        mounted = false;
      };
    }
    setDashboardLoading(true);
    setDashboardError(null);

    Promise.all([
      apiListImobOwners(),
      apiListImobProperties(),
      apiListImobCases(),
      apiListRuns({ page: 1, size: 100, workspaceId: session.workspaceId }),
      apiListImobPriorityQueue({ limit: 8 }),
      apiListImobWaitingOnBoard(),
      apiListImobBottleneckHeatmap(),
      apiGetImobExecutiveSummary(),
      apiListImobApprovalContext({ limit: 8 }),
    ])
      .then(([ownersResponse, propertiesResponse, casesResponse, runsResponse, priorityQueueResponse, waitingOnBoardResponse, heatmapResponse, executiveSummaryResponse, approvalContextResponse]) => {
        if (!mounted) return;
        const nextOwners = ownersResponse.data.items ?? [];
        const nextProperties = propertiesResponse.data.items ?? [];
        const nextCases = casesResponse.data.items ?? [];
        const nextPriorityQueue = priorityQueueResponse.data.items ?? [];
        const nextWaitingOnBoard = waitingOnBoardResponse.data.items ?? [];
        const nextHeatmap = heatmapResponse.data.items ?? [];
        const nextSpecialistLoad = executiveSummaryResponse.data.specialistLoad ?? [];
        const nextRescueIndex = executiveSummaryResponse.data.rescueIndex ?? [];
        const nextApprovalContext = approvalContextResponse.data.items ?? [];
        const nextRuns = (runsResponse.items ?? []).filter((run) => {
          const request =
            run.request && typeof run.request === "object" ? (run.request as Record<string, unknown>) : null;
          const action = typeof request?.action === "string" ? String(request.action) : run.agent;
          return action.includes("realestate.") || action.toLowerCase().includes("imob") || Boolean(run.caseId) || Boolean(run.threadId);
        });
        setOwners(nextOwners);
        setProperties(nextProperties);
        setCases(nextCases);
        setRuns(nextRuns);
        setPriorityQueue(nextPriorityQueue);
        setWaitingOnBoard(nextWaitingOnBoard);
        setBottleneckHeatmap(nextHeatmap);
        setSpecialistLoad(nextSpecialistLoad);
        setRescueIndex(nextRescueIndex);
        setApprovalContext(nextApprovalContext);
        setDashboardSource(
          nextOwners.length > 0 ||
          nextProperties.length > 0 ||
          nextCases.length > 0 ||
          nextRuns.length > 0 ||
          nextPriorityQueue.length > 0 ||
          nextWaitingOnBoard.length > 0 ||
          nextHeatmap.length > 0 ||
          nextSpecialistLoad.length > 0 ||
          nextRescueIndex.length > 0 ||
          nextApprovalContext.length > 0
            ? "real"
            : "empty"
        );
      })
      .catch((error) => {
        if (!mounted) return;
        setOwners([]);
        setProperties([]);
        setCases([]);
        setRuns([]);
        setPriorityQueue([]);
        setWaitingOnBoard([]);
        setBottleneckHeatmap([]);
        setSpecialistLoad([]);
        setRescueIndex([]);
        setApprovalContext([]);
        setDashboardSource("empty");
        if (error instanceof ApiError && error.status === 403 && error.body && typeof error.body === "object") {
          const payload = error.body as { error?: { message?: string; reasonCode?: string } };
          setDashboardError(resolveImobAccessGateCopy(payload.error).body);
        } else {
          setDashboardError(error instanceof Error ? error.message : "Falha ao carregar CRM operacional do IMOB");
        }
      })
      .finally(() => {
        if (!mounted) return;
        setDashboardLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [imobAccessGate, session.workspaceId]);

  React.useEffect(() => {
    let mounted = true;
    if (imobAccessGate) {
      setFollowUps([]);
      setFollowUpLoading(false);
      return () => {
        mounted = false;
      };
    }
    setFollowUpLoading(true);
    void apiListImobFollowUps({ onlyOverdue: false, limit: 120, caseId: requestedCaseId ?? undefined })
      .then((response) => {
        if (!mounted) return;
        setFollowUps(response.data.items ?? []);
      })
      .catch(() => {
        if (!mounted) return;
        setFollowUps([]);
      })
      .finally(() => {
        if (!mounted) return;
        setFollowUpLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [imobAccessGate, requestedCaseId]);

  React.useEffect(() => {
    let mounted = true;
    if (imobAccessGate) {
      setKpiFunnel(null);
      setKpiPerformance(null);
      setKpiLoading(false);
      return () => {
        mounted = false;
      };
    }
    setKpiLoading(true);
    Promise.all([
      apiGetImobKpiFunnel({ windowDays: 30 }),
      apiGetImobKpiPerformance({ windowDays: 30 }),
    ])
      .then(([funnelResponse, performanceResponse]) => {
        if (!mounted) return;
        setKpiFunnel(funnelResponse.data);
        setKpiPerformance(performanceResponse.data);
      })
      .catch(() => {
        if (!mounted) return;
        setKpiFunnel(null);
        setKpiPerformance(null);
      })
      .finally(() => {
        if (!mounted) return;
        setKpiLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [imobAccessGate]);

  React.useEffect(() => {
    let mounted = true;
    if (!conversationId) {
      setTelemetrySummary(null);
      setTelemetryLoading(false);
      return () => {
        mounted = false;
      };
    }

    const loadTelemetry = async () => {
      setTelemetryLoading(true);
      try {
        const summary = await apiGetImobChatTelemetrySummary({
          conversationId,
          windowHours: 24,
        });
        if (!mounted) return;
        setTelemetrySummary({
          generatedAt: summary.data.generatedAt,
          totals: summary.data.totals,
        });
      } catch {
        if (!mounted) return;
        setTelemetrySummary(null);
      } finally {
        if (mounted) setTelemetryLoading(false);
      }
    };

    void loadTelemetry();
    const interval = setInterval(() => {
      void loadTelemetry();
    }, 15000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [conversationId]);

  const backToChatHref = React.useMemo(() => {
    const params = new URLSearchParams();
    if (conversationId) params.set("conversationId", conversationId);
    if (selectedThreadId) params.set("threadId", selectedThreadId);
    const query = params.toString();
    return `/app/imob/chat${query ? `?${query}` : ""}`;
  }, [conversationId, selectedThreadId]);
  const buildImobRunHref = React.useCallback(
    (runId: string, options?: { threadId?: string | null; caseId?: string | null }) => {
      const params = new URLSearchParams();
      params.set("domain", "imob");
      params.set("runId", runId);
      if (conversationId) params.set("conversationId", conversationId);
      const scopedThreadId = options?.threadId ?? selectedThreadId ?? null;
      if (scopedThreadId) params.set("threadId", scopedThreadId);
      const scopedCaseId = options?.caseId ?? null;
      if (scopedCaseId) params.set("caseId", scopedCaseId);
      return `/app/runs?${params.toString()}`;
    },
    [conversationId, selectedThreadId]
  );

  const metricSource = telemetrySummary?.totals ?? {
    events: 0,
    messageToPlanAvgMs: 138,
    planToExecuteAvgMs: 2100,
    chatToRunCoveragePct: 100,
    persistSuccessRatePct: 100,
  };

  const ownerPropertyCount = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of properties) {
      if (!item.ownerId) continue;
      counts.set(item.ownerId, (counts.get(item.ownerId) ?? 0) + 1);
    }
    return counts;
  }, [properties]);

  const ownerCaseCount = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of cases) {
      if (!item.ownerId) continue;
      counts.set(item.ownerId, (counts.get(item.ownerId) ?? 0) + 1);
    }
    return counts;
  }, [cases]);

  const activeProcessCount = cases.filter((item) => item.status === "collecting" || item.status === "running").length;
  const blockedProcessCount = cases.filter((item) => item.status === "blocked").length;
  const evidencedProcessCount = cases.filter((item) => (item._count?.events ?? 0) > 0).length;
  const readyForReviewCount = properties.filter((item) => item.status === "ready_for_review").length;
  const ownerPendingCount = owners.filter((item) => asStringList(item.pendingItems).length > 0).length;
  const caseRunMap = React.useMemo(() => {
    const map = new Map<string, Run[]>();
    for (const run of runs) {
      const keys = [run.caseId ?? null, run.threadId ?? null].filter(
        (value): value is string => typeof value === "string" && value.trim().length > 0
      );
      for (const key of keys) {
        const current = map.get(key) ?? [];
        current.push(run);
        map.set(key, current);
      }
    }
    return map;
  }, [runs]);
  const totalImobRunCostCents = React.useMemo(
    () => runs.reduce((sum, run) => sum + (typeof run.costCents === "number" ? run.costCents : 0), 0),
    [runs]
  );
  const casesWithRunCount = React.useMemo(
    () =>
      cases.filter((item) => {
        const byCase = caseRunMap.get(item.id)?.length ?? 0;
        const byThread = item.threadId ? caseRunMap.get(item.threadId)?.length ?? 0 : 0;
        return byCase + byThread > 0;
      }).length,
    [caseRunMap, cases]
  );
  const averageCaseCostCents = casesWithRunCount > 0 ? Math.round(totalImobRunCostCents / casesWithRunCount) : 0;
  const stageCostSummary = React.useMemo(() => {
    const grouped = new Map<string, { cases: number; costCents: number }>();
    for (const item of cases) {
      const relatedRuns = [
        ...(caseRunMap.get(item.id) ?? []),
        ...(item.threadId ? caseRunMap.get(item.threadId) ?? [] : []),
      ];
      const costCents = relatedRuns.reduce(
        (sum, run) => sum + (typeof run.costCents === "number" ? run.costCents : 0),
        0
      );
      const key = formatCaseFlowLabel(item.flow);
      const current = grouped.get(key) ?? { cases: 0, costCents: 0 };
      current.cases += 1;
      current.costCents += costCents;
      grouped.set(key, current);
    }
    return Array.from(grouped.entries())
      .map(([label, value]) => ({ label, ...value }))
      .sort((a, b) => b.costCents - a.costCents);
  }, [caseRunMap, cases]);
  const topCostStage = stageCostSummary[0] ?? null;

  const latestCaseByOwnerId = React.useMemo(() => {
    const map = new Map<string, ImobCase>();
    for (const item of cases) {
      if (item.ownerId && !map.has(item.ownerId)) map.set(item.ownerId, item);
    }
    return map;
  }, [cases]);

  const latestCaseByPropertyId = React.useMemo(() => {
    const map = new Map<string, ImobCase>();
    for (const item of cases) {
      if (item.propertyId && !map.has(item.propertyId)) map.set(item.propertyId, item);
    }
    return map;
  }, [cases]);

  const prioritizedCases = React.useMemo(
    () =>
      [...cases]
        .map((item) => ({ item, priority: buildCasePriority(item) }))
        .sort((a, b) => b.priority.score - a.priority.score)
        .slice(0, 5),
    [cases]
  );
  const selectedThread = React.useMemo(
    () => threads.find((item) => item.threadId === selectedThreadId) ?? null,
    [threads, selectedThreadId]
  );
  const contextCase = React.useMemo(() => {
    if (requestedCaseId) return cases.find((item) => item.id === requestedCaseId) ?? null;
    if (selectedThreadId) {
      const byThread = cases
        .filter((item) => item.threadId === selectedThreadId)
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
      if (byThread[0]) return byThread[0];

      const byRun = [...runs]
        .filter((run) => run.threadId === selectedThreadId && typeof run.caseId === "string" && run.caseId.trim().length > 0)
        .sort((a, b) => Date.parse(b.createdAt ?? b.updatedAt ?? "") - Date.parse(a.createdAt ?? a.updatedAt ?? ""));
      for (const run of byRun) {
        const fromRun = cases.find((item) => item.id === run.caseId);
        if (fromRun) return fromRun;
      }
    }

    const threadLabel = selectedThread?.label?.trim().toLowerCase() ?? "";
    if (threadLabel.includes("imóvel") || threadLabel.includes("imovel") || threadLabel.includes("captação") || threadLabel.includes("captacao")) {
      const byFlow = [...cases]
        .filter((item) => {
          const flow = (item.flow ?? "").toLowerCase();
          return flow.includes("property.create") || flow.includes("owner.create");
        })
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
      if (byFlow[0]) return byFlow[0];
    }
    if (threadLabel.includes("lead")) {
      const byFlow = [...cases]
        .filter((item) => (item.flow ?? "").toLowerCase().includes("lead.qualify"))
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
      if (byFlow[0]) return byFlow[0];
    }
    if (threadLabel.includes("document")) {
      const byFlow = [...cases]
        .filter((item) => (item.flow ?? "").toLowerCase().includes("documents.collect"))
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
      if (byFlow[0]) return byFlow[0];
    }

    return null;
  }, [cases, requestedCaseId, runs, selectedThread, selectedThreadId]);
  const contextConversationLabel = conversationId ? "Conversa ativa no chat" : "Visão geral";
  const contextThreadLabel = selectedThread?.label?.trim() || "Sem thread selecionada";
  const contextCaseLabel = formatDashboardCaseLabel(contextCase);
  const contextPendingItems = contextCase ? asStringList(contextCase.pendingItems) : [];
  const followUpsByCaseId = React.useMemo(() => {
    const map = new Map<string, ImobCrmFollowUpItem[]>();
    for (const item of followUps) {
      const current = map.get(item.caseId) ?? [];
      current.push(item);
      map.set(item.caseId, current);
    }
    return map;
  }, [followUps]);
  const overdueFollowUpCount = React.useMemo(
    () => followUps.filter((item) => item.isOverdue).length,
    [followUps]
  );
  const contextFollowUps = React.useMemo(
    () => (contextCase ? followUpsByCaseId.get(contextCase.id) ?? [] : []),
    [contextCase, followUpsByCaseId]
  );
  const contextActions = React.useMemo(() => {
    if (!contextCase) return [];
    if (contextCase.canonical?.recommendedActions?.length) {
      return contextCase.canonical.recommendedActions.map((item) => ({
        id: item.id,
        label: item.label,
        inputHint: item.inputHint?.trim() || item.label,
      }));
    }
    return buildCaseFallbackActions(contextCase);
  }, [contextCase]);

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-white/10 bg-gradient-to-r from-accent/10 via-surface/80 to-transparent p-8">
        <p className="text-xs uppercase tracking-[0.35em] text-accent">IMOB</p>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">Dashboard</h1>
        <p className="mt-2 text-sm text-muted-foreground">Visão unificada de imóveis, processos e parceiros.</p>
        <p className="mt-3 text-xs uppercase tracking-[0.22em] text-muted-foreground/80">
          {brandName} • {workspaceLabel}
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-2xl border border-white/10 bg-surface/60 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Custo operacional IMOB</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{currencyFromCents(totalImobRunCostCents)}</p>
          </article>
          <article className="rounded-2xl border border-white/10 bg-surface/60 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Casos com run</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{casesWithRunCount}</p>
          </article>
          <article className="rounded-2xl border border-white/10 bg-surface/60 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Custo médio por caso</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{currencyFromCents(averageCaseCostCents)}</p>
          </article>
          <article className="rounded-2xl border border-white/10 bg-surface/60 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Etapa mais custosa</p>
            <p className="mt-2 text-sm font-semibold text-foreground">{topCostStage?.label ?? "-"}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {topCostStage ? currencyFromCents(topCostStage.costCents) : "Sem custo ainda"}
            </p>
          </article>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-2xl border border-white/10 bg-surface/60 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Conversão proposta → fechamento</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">
              {kpiLoading ? "..." : formatPct(kpiFunnel?.conversions.proposalToClosingPct)}
            </p>
          </article>
          <article className="rounded-2xl border border-white/10 bg-surface/60 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Tempo médio até fechamento</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">
              {kpiLoading
                ? "..."
                : kpiFunnel?.averageDurationHours != null
                  ? `${kpiFunnel.averageDurationHours.toFixed(1)}h`
                  : "—"}
            </p>
          </article>
          <article className="rounded-2xl border border-white/10 bg-surface/60 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Pendências resolvidas em 48h</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">
              {kpiLoading ? "..." : formatPct(kpiFunnel?.docsResolved48hPct)}
            </p>
          </article>
          <article className="rounded-2xl border border-white/10 bg-surface/60 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Receita por corretor (30d)</p>
            <p className="mt-2 text-sm font-semibold text-foreground">
              {kpiLoading
                ? "..."
                : kpiPerformance?.ranking?.[0]
                  ? `${kpiPerformance.ranking[0].broker}: ${currencyFromCents(kpiPerformance.ranking[0].revenueCents)}`
                  : "Sem dados"}
            </p>
          </article>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {prioritizedCases.slice(0, 3).map(({ item, priority }) => {
            const primaryAction = item.canonical?.recommendedActions?.[0];
            const href = buildRecommendedCaseHref({
              conversationId,
              caseId: item.id,
              threadId: item.threadId ?? null,
              actionLabel: primaryAction?.label,
              actionHint: primaryAction?.inputHint,
            });
            return (
              <Link
                key={`priority-chip-${item.id}`}
                to={href}
                className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.18em] ${priorityTone(priority.label)}`}
              >
                {formatJourneyTypeLabel(item.canonical?.journeyType)}: {primaryAction?.label ?? "revisar caso"}
              </Link>
            );
          })}
          <Link
            to={backToChatHref}
            className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-foreground hover:border-accent/40"
          >
            Voltar ao chat
          </Link>
          {(["imoveis", "processos", "parceiros"] as Section[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setSection(item)}
              className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.18em] transition ${
                section === item
                  ? "border-accent/50 bg-accent/20 text-accent"
                  : "border-white/20 bg-white/10 text-foreground hover:border-accent/40"
              }`}
            >
              {sectionLabel(item)}
            </button>
          ))}
          <span className="rounded-full border border-amber-300/30 bg-amber-500/10 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-amber-100">
            SLA em atraso: {followUpLoading ? "..." : overdueFollowUpCount}
          </span>
        </div>
      </header>

      {imobAccessGate ? (
        <ImobAccessGateCard gate={imobAccessGate} />
      ) : null}

      {dashboardError ? (
        <section className="rounded-3xl border border-rose-400/20 bg-rose-500/5 p-4 text-sm text-rose-100 sm:p-6">
          Falha ao carregar o CRM operacional do IMOB: {dashboardError}
        </section>
      ) : null}

      <section className="rounded-3xl border border-white/10 bg-surface/60 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Soluções rápidas</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Atalhos da conversa ativa para resolver pendências e avançar a jornada.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-accent/35 bg-accent/10 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-accent">
              Contexto do Chat
            </span>
            <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              lead • venda • locação
            </span>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <article className="rounded-2xl border border-white/10 bg-black/20 p-3">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Conversa</p>
            <p className="mt-1 text-sm font-medium text-foreground">{contextConversationLabel}</p>
          </article>
          <article className="rounded-2xl border border-white/10 bg-black/20 p-3">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Thread</p>
            <p className="mt-1 text-sm font-medium text-foreground">{contextThreadLabel}</p>
          </article>
          <article className="rounded-2xl border border-white/10 bg-black/20 p-3">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Caso</p>
            <p className="mt-1 text-sm font-medium text-foreground">{contextCaseLabel}</p>
          </article>
        </div>
        {contextCase ? (
          <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-3">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Pendências do caso ativo</p>
            <p className="mt-1 text-sm text-foreground">
              {contextPendingItems.length > 0 ? `${contextPendingItems.length} item(ns) pendente(s)` : "Sem pendências"}
            </p>
            {contextPendingItems.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {contextPendingItems.slice(0, 6).map((item) => (
                  <span
                    key={`context-pending-${item}`}
                    className="rounded-full border border-amber-300/35 bg-amber-500/10 px-3 py-1 text-[10px] uppercase tracking-[0.12em] text-amber-100"
                  >
                    {item}
                  </span>
                ))}
              </div>
            ) : null}
            {contextFollowUps.length > 0 ? (
              <div className="mt-3 rounded-xl border border-amber-300/25 bg-amber-500/5 p-3">
                <p className="text-[10px] uppercase tracking-[0.16em] text-amber-200">
                  Follow-up com SLA ({contextFollowUps.length})
                </p>
                <p className="mt-1 text-xs text-amber-100/90">
                  {contextFollowUps[0]?.title} • {contextFollowUps[0]?.isOverdue ? "em atraso" : "a vencer"} • ação:{" "}
                  {contextFollowUps[0]?.nextAction}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Link
                    to={buildImobChatHref({
                      conversationId,
                      caseId: contextCase.id,
                      threadId: contextCase.threadId ?? selectedThreadId ?? null,
                      autoprompt: contextFollowUps[0]?.suggestedMessage ?? "cobrar retorno deste caso",
                    })}
                    className="rounded-full border border-amber-300/45 bg-amber-500/15 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-amber-100 hover:border-amber-200/70"
                  >
                    Enviar follow-up
                  </Link>
                </div>
              </div>
            ) : null}
            {contextActions.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {contextActions.map((item) => (
                  <Link
                    key={`context-action-${item.id}`}
                    to={buildImobChatHref({
                      conversationId,
                      caseId: contextCase.id,
                      threadId: contextCase.threadId ?? selectedThreadId ?? null,
                      autoprompt: item.inputHint,
                    })}
                    className="rounded-full border border-accent/45 bg-accent/15 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-accent hover:border-accent/70"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {IMOB_BUSINESS_QUICK_ACTIONS.map((item) => (
            <Link
              key={`business-quick-action-${item.id}`}
              to={buildImobChatHref({
                conversationId,
                caseId: contextCase?.id ?? null,
                threadId: contextCase?.threadId ?? selectedThreadId ?? null,
                autoprompt: item.autoprompt,
              })}
              className="rounded-2xl border border-white/10 bg-black/20 p-4 transition hover:border-accent/40"
            >
              <p className="text-sm font-semibold text-foreground">{item.title}</p>
              <p className="mt-2 text-xs text-muted-foreground">{item.summary}</p>
              <p className="mt-3 text-[10px] uppercase tracking-[0.16em] text-accent">Abrir no chat</p>
            </Link>
          ))}
        </div>
      </section>

      {section === "imoveis" ? (
        <section className="rounded-3xl border border-white/10 bg-surface/60 p-4 sm:p-6">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Imóveis</h2>
            <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              {dashboardLoading ? "atualizando" : dashboardSource === "real" ? "dados ao vivo" : "sem imóveis cadastrados"}
            </span>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {properties.map((item) => {
              const relatedCase = latestCaseByPropertyId.get(item.id) ?? null;
              const href = buildImobChatHref({
                conversationId,
                caseId: relatedCase?.id ?? null,
                threadId: relatedCase?.threadId ?? null,
                autoprompt: item.address?.trim()
                  ? `mostrar imóvel endereço ${item.address.trim()}`
                  : relatedCase?.id
                    ? "mostrar imóvel deste caso"
                    : "mostrar imóvel selecionado",
              });
              const pendingItems = asStringList(item.pendingItems);
              const resolveHref = pendingItems.length > 0
                ? buildImobChatHref({
                    conversationId,
                    caseId: relatedCase?.id ?? null,
                    threadId: relatedCase?.threadId ?? null,
                    autoprompt: item.address?.trim()
                      ? `o que falta para imóvel endereço ${item.address.trim()}`
                      : relatedCase?.id
                        ? "o que falta para este imóvel deste caso"
                        : "o que falta para este imóvel",
                  })
                : null;
              return (
              <div key={item.id} className="rounded-2xl border border-white/10 bg-black/20 p-4 transition hover:border-accent/40">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Link to={href} className="text-sm font-semibold text-foreground hover:text-accent">{propertyTitle(item)}</Link>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.city?.trim() || "Cidade não informada"}
                    </p>
                  </div>
                  <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.15em] ${propertyStatusTone(item.status)}`}>
                    {formatImobStatusLabel(item.status)}
                  </span>
                </div>
                <p className="mt-3 text-base font-semibold text-foreground">{currencyFromCents(item.askingPriceCents)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {(item.goal?.trim() || "finalidade não informada")} • {(getImobPropertyTypeLabel(item.propertyType?.trim()) || "tipo não informado")}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Proprietário: {item.owner?.name?.trim() || "não vinculado"}
                </p>
                {resolveHref ? (
                  <div className="mt-3 flex justify-end">
                    <Link to={resolveHref} className="text-[10px] uppercase tracking-[0.16em] text-accent hover:text-accent/80">
                      Resolver no chat
                    </Link>
                  </div>
                ) : null}
              </div>
              );
            })}
          </div>
          {!dashboardLoading && properties.length === 0 ? (
            <p className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-muted-foreground">
              Nenhum imóvel cadastrado no CRM operacional do IMOB.
            </p>
          ) : null}
        </section>
      ) : null}

      {section === "processos" ? (
        <section className="space-y-4">
          <section className="grid gap-4 sm:grid-cols-3">
            <article className="rounded-2xl border border-white/10 bg-surface/60 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Processos ativos</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{activeProcessCount}</p>
            </article>
            <article className="rounded-2xl border border-white/10 bg-surface/60 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Bloqueados</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{blockedProcessCount}</p>
            </article>
            <article className="rounded-2xl border border-white/10 bg-surface/60 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Com evidências</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{evidencedProcessCount}</p>
            </article>
          </section>

          <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
            <ImobPriorityQueue
              items={priorityQueue}
              buildHref={(item) => buildPriorityQueueChatHref(conversationId, item)}
            />
            <ImobWaitingOnBoard
              items={waitingOnBoard}
              buildHref={(item) => buildPriorityQueueChatHref(conversationId, item)}
            />
          </div>

          <ImobBottleneckHeatmap items={bottleneckHeatmap} />

          <div className="grid gap-4 xl:grid-cols-2">
            <ImobSpecialistLoadBoard items={specialistLoad} />
            <ImobRescueIndex items={rescueIndex} />
          </div>

          <ImobApprovalContextCard
            items={approvalContext}
            buildHref={(item) => buildApprovalContextHref(conversationId, item)}
            onAction={handleApprovalAction}
          />

          <section className="rounded-3xl border border-white/10 bg-surface/60 p-4 sm:p-6">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Custo resumido do funil</h2>
              <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                {stageCostSummary.length} etapa(s)
              </span>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {stageCostSummary.slice(0, 6).map((item) => (
                <article key={item.label} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="text-sm font-semibold text-foreground">{item.label}</p>
                  <p className="mt-2 text-lg font-semibold text-foreground">{currencyFromCents(item.costCents)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{item.cases} caso(s)</p>
                </article>
              ))}
              {stageCostSummary.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum custo operacional associado ao funil IMOB neste recorte.</p>
              ) : null}
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-surface/60 p-4 sm:p-6">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Processos</h2>
              <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                {dashboardLoading ? "atualizando" : dashboardSource === "real" ? "dados ao vivo" : "sem processos cadastrados"}
              </span>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    <th className="px-3 py-2">Processo</th>
                    <th className="px-3 py-2">Contexto</th>
                    <th className="px-3 py-2">Etapa</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Responsável</th>
                    <th className="px-3 py-2">Evidências</th>
                  </tr>
                </thead>
                <tbody>
                  {cases.map((item) => {
                    const href = buildImobChatHref({
                      conversationId,
                      caseId: item.id,
                      threadId: item.threadId ?? null,
                      autoprompt: "o que falta nesse caso",
                    });
                    const priority = buildCasePriority(item);
                    const primaryAction = item.canonical?.recommendedActions?.[0];
                    const actionHref = buildRecommendedCaseHref({
                      conversationId,
                      caseId: item.id,
                      threadId: item.threadId ?? null,
                      actionLabel: primaryAction?.label,
                      actionHint: primaryAction?.inputHint,
                    });
                    const relatedRuns = [
                      ...(caseRunMap.get(item.id) ?? []),
                      ...(item.threadId ? caseRunMap.get(item.threadId) ?? [] : []),
                    ];
                    const latestRun = relatedRuns[0] ?? null;
                    const relatedCostCents = relatedRuns.reduce(
                      (sum, run) => sum + (typeof run.costCents === "number" ? run.costCents : 0),
                      0
                    );
                    return (
                    <tr key={item.id} className="border-b border-white/5 text-muted-foreground">
                      <td className="px-3 py-3 text-foreground"><Link to={href} className="hover:text-accent">{formatCaseFlowLabel(item.flow)}</Link></td>
                      <td className="px-3 py-3">{item.lead?.name || item.owner?.name || item.property?.city || "Sem contexto vinculado"}</td>
                      <td className="px-3 py-3">
                        <div className="space-y-1">
                          <p>{item.nextStep?.trim() || item.stage}</p>
                          <p className="text-[10px] text-foreground/80">{primaryAction?.label ?? "Revisar caso"}</p>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-2">
                          <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.15em] ${processStatusTone(item.status)}`}>
                            {formatImobStatusLabel(item.status)}
                          </span>
                          <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.15em] ${priorityTone(priority.label)}`}>
                            prioridade {priority.label}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3">{item.ownerResponsible || "Responsável não definido"}</td>
                      <td className="px-3 py-3 text-xs">
                        <div className="space-y-1">
                          <p>{item._count?.events ?? 0} evento(s)</p>
                          <p className="text-foreground">{currencyFromCents(relatedCostCents)}</p>
                          <Link
                            to={actionHref}
                            className="text-[10px] text-accent underline-offset-2 hover:text-accent/80 hover:underline"
                          >
                            agir: {primaryAction?.label ?? "revisar caso"}
                          </Link>
                          {latestRun ? (
                            <div className="flex flex-wrap gap-2">
                              <Link
                                to={buildImobRunHref(latestRun.id, { threadId: item.threadId ?? null, caseId: item.id })}
                                className="text-[10px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                              >
                                execução
                              </Link>
                              <Link
                                to={`/app/billing?runId=${encodeURIComponent(latestRun.id)}`}
                                className="text-[10px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                              >
                                reconciliação
                              </Link>
                            </div>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!dashboardLoading && cases.length === 0 ? (
              <p className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-muted-foreground">
                Nenhum processo cadastrado no CRM operacional do IMOB.
              </p>
            ) : null}
          </section>
        </section>
      ) : null}

      {section === "parceiros" ? (
        <section className="space-y-4">
          <section className="grid gap-4 sm:grid-cols-3">
            <article className="rounded-2xl border border-white/10 bg-surface/60 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Proprietários</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{owners.length}</p>
            </article>
            <article className="rounded-2xl border border-white/10 bg-surface/60 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Com pendências</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{ownerPendingCount}</p>
            </article>
            <article className="rounded-2xl border border-white/10 bg-surface/60 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Imóveis prontos para revisão</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{readyForReviewCount}</p>
            </article>
          </section>

          <section className="rounded-3xl border border-white/10 bg-surface/60 p-4 sm:p-6">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Parceiros</h2>
              <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                {dashboardLoading ? "atualizando" : dashboardSource === "real" ? "dados ao vivo" : "sem parceiros cadastrados"}
              </span>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {owners.map((item) => {
                const relatedCase = latestCaseByOwnerId.get(item.id) ?? null;
                const href = buildImobChatHref({
                  conversationId,
                  caseId: relatedCase?.id ?? null,
                  threadId: relatedCase?.threadId ?? null,
                  autoprompt: `abrir proprietário ${item.name}`,
                });
                const pendingItems = asStringList(item.pendingItems);
                const resolveHref = pendingItems.length > 0
                  ? buildImobChatHref({
                      conversationId,
                      caseId: relatedCase?.id ?? null,
                      threadId: relatedCase?.threadId ?? null,
                      autoprompt: `o que falta para proprietário ${item.name}`,
                    })
                  : null;
                const primaryAction = relatedCase?.canonical?.recommendedActions?.[0];
                const actionHref = relatedCase
                  ? buildRecommendedCaseHref({
                      conversationId,
                      caseId: relatedCase.id,
                      threadId: relatedCase.threadId ?? null,
                      actionLabel: primaryAction?.label,
                      actionHint: primaryAction?.inputHint,
                    })
                  : null;
                return (
                <div key={item.id} className="rounded-2xl border border-white/10 bg-black/20 p-4 transition hover:border-accent/40">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Link to={href} className="text-sm font-semibold text-foreground hover:text-accent">{item.name}</Link>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.email?.trim() || item.phone?.trim() || "Contato não informado"}
                      </p>
                    </div>
                    <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.15em] ${partnerStatusTone(item.status)}`}>
                      {formatImobStatusLabel(item.status)}
                    </span>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Imóveis: {ownerPropertyCount.get(item.id) ?? 0} • Casos: {ownerCaseCount.get(item.id) ?? 0}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Pendências: {pendingItems.length > 0 ? pendingItems.join(", ") : "sem pendências"}
                  </p>
                  {resolveHref || actionHref ? (
                    <div className="mt-3 flex justify-end gap-3">
                      {actionHref ? (
                        <Link to={actionHref} className="text-[10px] uppercase tracking-[0.16em] text-foreground hover:text-accent">
                          {primaryAction?.label ?? "agir no caso"}
                        </Link>
                      ) : null}
                      {resolveHref ? (
                      <Link to={resolveHref} className="text-[10px] uppercase tracking-[0.16em] text-accent hover:text-accent/80">
                        Resolver no chat
                      </Link>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                );
              })}
            </div>
            {!dashboardLoading && owners.length === 0 ? (
              <p className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-muted-foreground">
                Nenhum parceiro cadastrado no CRM operacional do IMOB.
              </p>
            ) : null}
          </section>
        </section>
      ) : null}

      <footer id="dashboard-hub" className="space-y-4">
        <section className="rounded-3xl border border-white/10 bg-surface/60 p-4 text-xs text-muted-foreground sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Métricas Operacionais</h3>
            <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/80">
              {conversationId
                ? telemetryLoading
                  ? "Atualizando..."
                  : `Conversa ativa${telemetrySummary?.generatedAt ? ` • ${new Date(telemetrySummary.generatedAt).toLocaleTimeString("pt-BR")}` : ""}`
                : "Sem conversa ativa"}
            </p>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-white/10 bg-surface/40 p-2">
              <p className="text-[10px] uppercase tracking-[0.12em]">msg→plan</p>
              <p className="mt-1 text-sm text-foreground">{formatLatencyMs(metricSource.messageToPlanAvgMs)}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-surface/40 p-2">
              <p className="text-[10px] uppercase tracking-[0.12em]">plan→execute</p>
              <p className="mt-1 text-sm text-foreground">{formatLatencyMs(metricSource.planToExecuteAvgMs)}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-surface/40 p-2">
              <p className="text-[10px] uppercase tracking-[0.12em]">cobertura chat→run</p>
              <p className="mt-1 text-sm text-foreground">{formatPct(metricSource.chatToRunCoveragePct)}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-surface/40 p-2">
              <p className="text-[10px] uppercase tracking-[0.12em]">persistência</p>
              <p className="mt-1 text-sm text-foreground">{formatPct(metricSource.persistSuccessRatePct)}</p>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-surface/60 p-4 text-xs text-muted-foreground sm:p-6">
          <ThreadPanel
            threads={threads}
            selectedThreadId={selectedThreadId}
            groupByJourneyActiveOnly
            onSelectThread={(thread) => setSelectedThreadId(thread.threadId)}
            onClearSelection={() => setSelectedThreadId(null)}
            maxItems={3}
            showNavigationCtas={false}
            showTimelineLegend={false}
          />
        </section>

        <section className="rounded-3xl border border-white/10 bg-surface/60 p-4 text-xs text-muted-foreground sm:p-6">
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Significado da timeline</p>
          <ul className="mt-2 space-y-2 text-[11px] text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">Entendimento</span>: o chat interpretou sua intenção corretamente.
              Exemplo: identificou que você quer uma operação de captação.
            </li>
            <li>
              <span className="font-medium text-foreground">Preparação</span>: o plano operacional está sendo montado.
              Valida contexto, regras e próximos passos antes de executar.
            </li>
            <li>
              <span className="font-medium text-foreground">Execução</span>: a ação está rodando no motor EIAH.
              Cria/atualiza processo (run) e acompanha status.
            </li>
            <li>
              <span className="font-medium text-foreground">Concluído</span>: operação finalizada com sucesso.
              Quando aplicável, gera comprovante (receipt/tx) e fecha a etapa.
            </li>
          </ul>
        </section>
      </footer>
    </div>
  );
};

export default ImobDashboardPage;
