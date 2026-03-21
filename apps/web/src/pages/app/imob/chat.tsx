import React from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ApiError,
  apiAgentsDiscovery,
  apiAgentsExecute,
  apiAgentsNegotiate,
  apiCreateImobChatConversation,
  apiCreateImobChatMessage,
  apiCreateImobChatTelemetry,
  apiGenerateImobContract,
  apiGetImobChatInterviewState,
  apiGetImobChatConversationExport,
  apiGetImobChatTelemetrySummary,
  apiGetRun,
  apiSearchImobKnowledge,
  apiListImobChatConversations,
  apiListImobChatMessages,
  apiListImobChatThreads,
  apiUpsertImobChatInterviewState,
  type ImobChatConversation,
  type ImobContractInterviewState,
  type ImobChatMessage,
  type ImobChatThread,
  type ImobKnowledgeSearchResponse,
  type AgentProtocolActionContract,
} from "@/lib/api";
import { useSession } from "@/state/sessionStore";
import { buildImobActionPlan, type ImobActionPlan } from "@/features/imob/chatOrchestrator";
import {
  applySingleFieldEditAnswer,
  applyContractInterviewAnswer,
  createInitialContractInterviewState,
  extractEditFieldQuery,
  getContractTypeLabel,
  getStepQuestionText,
  getContractTypePrompt,
  isAffirmativeAnswer,
  isNegativeAnswer,
  moveInterviewToEditableField,
  type ContractInterviewState,
} from "@/features/imob/contractInterviewEngine";
import { ThreadPanel } from "@/features/imob/ThreadPanel";
import { formatDataInputTemplate, getDataInputTemplate } from "@/domain/inputTemplates";
import { CONTRACT_SCHEMAS } from "@/features/imob/contractSchemas";

type ChatState = "idle" | "typing" | "executing" | "awaiting_user_action" | "blocked" | "done";

type CardType = "action" | "risk" | "evidence" | "queue";

type CardCta = {
  id: string;
  label: string;
  kind?: "primary" | "secondary" | "neutral";
  href?: string;
  action?: "confirm_execution" | "reject_execution" | "export_contract_pdf";
};

type MessageCard = {
  type: CardType;
  title: string;
  lines: string[];
  compactConfirm?: boolean;
  thread?: {
    id: string;
    label: string;
    status?: "active" | "done" | "blocked";
  };
  runId?: string;
  ctas?: CardCta[];
  risk?: {
    level: "low" | "medium" | "high";
    trustScore?: number;
    reason?: string;
  };
  queue?: {
    status?: string;
    step?: string;
  };
  proof?: {
    txId?: string | null;
    receiptPath?: string | null;
    bundlePath?: string | null;
  };
  contract?: {
    title?: string;
    contractType?: string;
    schemaVersion?: string;
    legalVersion?: string;
    generatedAt?: string;
    hash?: string;
    text: string;
  };
  showConfirm?: boolean;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  thread?: {
    id: string;
    label: string;
    status?: "active" | "done" | "blocked";
  };
  card?: MessageCard;
};

type PendingExecution = {
  plan: ImobActionPlan;
  contract: AgentProtocolActionContract;
  messageId: string;
  thread: {
    id: string;
    label: string;
  };
  receiptEndpointTemplate?: string;
  preparedAt: number;
};

function buildSessionRunMapFromMessages(items: ChatMessage[]) {
  const map: Record<string, string> = {};
  for (const message of items) {
    const threadId = message.thread?.id ?? message.card?.thread?.id ?? null;
    const runId = message.card?.runId ?? null;
    if (!threadId || !runId) continue;
    if (!map[threadId]) {
      map[threadId] = runId;
    }
  }
  return map;
}

const SHOW_TECHNICAL_CHAT = false;
const HISTORY_PAGE_SIZE = 30;
const QUICK_PROMPTS = [
  "Captar apartamento 2 quartos em Itapema",
  "Gerar proposta para cliente João",
  "Iniciar contrato do imóvel 82912",
  "Fechar comissão da venda X",
];

type SyntheticSearchProperty = {
  title: string;
  city: string;
  region: string;
  segment: "locacao" | "venda";
  priceLabel: string;
};

const SYNTHETIC_SEARCH_CATALOG: SyntheticSearchProperty[] = [
  { title: "Apto Centro 2Q", city: "Balneário Camboriú", region: "Santa Catarina", segment: "locacao", priceLabel: "R$ 4.200/mês" },
  { title: "Casa Praia Brava", city: "Itajaí", region: "Santa Catarina", segment: "venda", priceLabel: "R$ 1.450.000" },
  { title: "Studio Pinheiros", city: "São Paulo", region: "São Paulo", segment: "locacao", priceLabel: "R$ 3.800/mês" },
  { title: "Apto Vila Mariana", city: "São Paulo", region: "São Paulo", segment: "venda", priceLabel: "R$ 980.000" },
  { title: "Cobertura Copacabana", city: "Rio de Janeiro", region: "Rio de Janeiro", segment: "venda", priceLabel: "R$ 2.200.000" },
];

function statusLabel(status: ChatState) {
  switch (status) {
    case "typing":
      return "Pensando...";
    case "executing":
      return "Processando";
    case "awaiting_user_action":
      return "Aguardando sua confirmação";
    case "blocked":
      return "Precisa de atenção";
    case "done":
      return "Concluído";
    case "idle":
    default:
      return "Pronto";
  }
}

function statusTone(status: ChatState) {
  if (status === "blocked") return "text-rose-300 border-rose-400/40";
  if (status === "executing" || status === "typing") return "text-amber-200 border-amber-300/30";
  if (status === "done") return "text-emerald-300 border-emerald-400/40";
  return "text-muted-foreground border-white/15";
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeHumanText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isCardLeadRedundant(messageText: string, cardTitle: string, firstLine?: string) {
  if (!firstLine) return false;
  const msg = normalizeHumanText(messageText);
  const title = normalizeHumanText(cardTitle);
  const line = normalizeHumanText(firstLine);
  if (!msg || !line) return false;
  if (msg === line || msg.includes(line) || line.includes(msg)) return true;
  if (title && (msg === title || msg.includes(title) || title.includes(msg))) return true;
  return false;
}

function resolveRunTemplatePath(template: string | undefined, runId: string): string | null {
  if (!template) return null;
  return template.replaceAll("{runId}", runId).replaceAll(":runId", runId);
}

function isLegacyImobSectionHref(href?: string) {
  if (!href) return false;
  return href === "/app/imob/properties" || href === "/app/imob/processes" || href === "/app/imob/partners";
}

function normalizeCardCta(cta: CardCta): CardCta {
  if (!isLegacyImobSectionHref(cta.href)) return cta;
  const section =
    cta.href === "/app/imob/properties" ? "imoveis" : cta.href === "/app/imob/partners" ? "parceiros" : "processos";
  return {
    ...cta,
    label: "Abrir Dashboard",
    href: `/app/imob/dashboard?section=${section}#dashboard-hub`,
  };
}

function normalizeCardCtas(ctas?: CardCta[]) {
  if (!ctas || ctas.length === 0) return ctas;
  return ctas.map(normalizeCardCta);
}

function isExternalHref(href?: string) {
  return typeof href === "string" && /^https?:\/\//i.test(href);
}

function getIntentActionCtas(intent: ImobActionPlan["intent"]): CardCta[] {
  switch (intent) {
    case "capture":
      return [{ id: "go-dashboard", label: "Abrir Dashboard", kind: "neutral", href: "/app/imob/dashboard?section=imoveis#dashboard-hub" }];
    case "match":
      return [{ id: "go-dashboard", label: "Abrir Dashboard", kind: "neutral", href: "/app/imob/dashboard?section=parceiros#dashboard-hub" }];
    case "proposal":
    case "contract":
    case "commission":
    case "adjustment":
    default:
      return [{ id: "go-dashboard", label: "Abrir Dashboard", kind: "neutral", href: "/app/imob/dashboard?section=processos#dashboard-hub" }];
  }
}

function getCardTypeChip(type: CardType) {
  if (type === "risk") return "Atenção";
  if (type === "evidence") return "Comprovante";
  if (type === "queue") return "Andamento";
  return "Próximo passo";
}

function getIntentThreadLabel(intent: ImobActionPlan["intent"]) {
  switch (intent) {
    case "capture":
      return "Captação";
    case "match":
      return "Busca de imóveis";
    case "proposal":
      return "Proposta";
    case "contract":
      return "Contrato";
    case "commission":
      return "Comissão";
    case "adjustment":
    default:
      return "Ajuste";
  }
}

function getCtaClass(kind: CardCta["kind"]) {
  if (kind === "primary") {
    return "border-accent/60 bg-accent/20 text-accent transition hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50";
  }
  if (kind === "secondary") {
    return "border-rose-300/50 bg-rose-500/10 text-rose-200 transition hover:bg-rose-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/40";
  }
  return "border-white/20 bg-white/10 text-foreground transition hover:border-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40";
}

function formatRelativeTime(timestamp?: string | null) {
  if (!timestamp) return "sem atividade";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "sem atividade";
  const diffMinutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (diffMinutes < 1) return "agora";
  if (diffMinutes < 60) return `${diffMinutes}m`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d`;
}

function buildContractPdfFileName(contractType?: string) {
  const type = (contractType ?? "imob").replace(/[^a-z0-9_-]/gi, "_").toLowerCase();
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return `contrato-${type}-${stamp}.pdf`;
}

function deriveConversationStatus(conversation: ImobChatConversation): "normal" | "attention" | "success" {
  const preview = (conversation.lastMessagePreview ?? "").toLowerCase();
  if (preview.includes("error") || preview.includes("bloquead")) return "attention";
  if (conversation.lastTxId) return "success";
  return "normal";
}

function getNextConversationTitle(conversations: ImobChatConversation[]) {
  const prefix = "Chat Operacional IMOB";
  let max = 0;
  for (const conversation of conversations) {
    const title = conversation.title.trim();
    if (title === prefix) {
      max = Math.max(max, 1);
      continue;
    }
    const match = title.match(/^Chat Operacional IMOB #([0-9]+)$/);
    if (match) {
      const n = Number(match[1]);
      if (Number.isFinite(n)) max = Math.max(max, n);
    }
  }
  const next = max + 1;
  return next <= 1 ? prefix : `${prefix} #${next}`;
}

function getConversationTitleFromMessage(message: string, conversations: ImobChatConversation[]) {
  const cleaned = message.replace(/\s+/g, " ").trim();
  if (cleaned.length < 4) return getNextConversationTitle(conversations);
  return cleaned.length > 72 ? `${cleaned.slice(0, 72)}...` : cleaned;
}

function formatMs(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${Math.round(value)} ms`;
}

function formatPct(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}%`;
}

function getHumanPlanLines(intent: ImobActionPlan["intent"]) {
  switch (intent) {
    case "capture":
      return ["Posso iniciar a captação agora."];
    case "match":
      return ["Posso começar a busca de opções agora."];
    case "proposal":
      return ["Posso preparar a proposta agora."];
    case "contract":
      return ["Posso iniciar o fluxo de contrato agora."];
    case "commission":
      return ["Posso iniciar o fluxo de comissão agora."];
    case "adjustment":
    default:
      return ["Posso aplicar esse ajuste agora."];
  }
}

function humanRunStatus(status: string) {
  if (status === "pending") return "Estou preparando os próximos passos.";
  if (status === "running") return "Estou processando sua solicitação.";
  if (status === "success") return "Concluí essa etapa com sucesso.";
  if (status === "blocked") return "Essa etapa precisa da sua revisão para continuar.";
  if (status === "error") return "Tive um problema nessa etapa. Posso tentar novamente.";
  return "Estou avançando com a operação.";
}

function getThreadBusinessArea(threadLabel?: string | null) {
  const normalized = (threadLabel ?? "").toLowerCase();
  if (normalized.includes("contrato")) return "contract";
  if (normalized.includes("capta")) return "capture";
  if (normalized.includes("proposta")) return "proposal";
  if (normalized.includes("comiss")) return "commission";
  if (normalized.includes("busca") || normalized.includes("imove")) return "match";
  if (normalized.includes("ajuste")) return "adjustment";
  return "general";
}

function humanRunStatusBusiness(status: string, threadLabel?: string | null) {
  const area = getThreadBusinessArea(threadLabel);
  if (status === "success" && area === "contract") return "Contrato iniciado com sucesso.";
  if (status === "success" && area === "proposal") return "Proposta registrada com sucesso.";
  return humanRunStatus(status);
}

function nextBusinessStep(status: string, threadLabel?: string | null) {
  const area = getThreadBusinessArea(threadLabel);
  if ((status === "pending" || status === "running" || status === "success") && area === "contract") {
    return [
      "Próximo passo: para contrato de locação, preciso destes dados:",
      "Checklist: Nome • CPF/CNPJ • Imóvel • Prazo • Valor",
    ];
  }
  if ((status === "pending" || status === "running" || status === "success") && area === "capture") {
    return ["Próximo passo: confirmar endereço, tipo do imóvel e valor desejado."];
  }
  return [];
}

function buildRentalContractTemplateMessage(thread: { id: string; label: string; status?: "active" | "done" | "blocked" }): ChatMessage {
  const rentalTemplate = getDataInputTemplate("imob.locacao_contrato_v2");
  const fallbackLines = [
    "Locador: Nome completo | CPF/CNPJ | Telefone | E-mail",
    "Locatario: Nome completo | CPF | Telefone | E-mail",
    "Imovel: Endereco completo | Tipo | Matricula (se houver)",
    "Condicoes: Prazo (meses) | Valor aluguel | Vencimento | Garantia",
  ];
  const formattedTemplate = rentalTemplate
    ? formatDataInputTemplate(rentalTemplate)
    : `TEMPLATE DE DADOS (LOCACAO)\n${fallbackLines
        .map((line) => {
          const [label, values] = line.split(": ");
          const withBrackets = (values ?? "")
            .split("|")
            .map((field) => `[${field.trim()}]`)
            .join(" | ");
          return `${label}: ${withBrackets}`;
        })
        .join("\n")}`;
  const cardLines = rentalTemplate
    ? rentalTemplate.sections.map((section) => `${section.label}: ${section.fields.join(" | ")}`)
    : fallbackLines;

  return {
    id: makeId("assistant"),
    role: "assistant",
    text: ["Para concluir o contrato, preencha este template:", "", formattedTemplate].join("\n"),
    thread,
    card: {
      type: "action",
      title: rentalTemplate?.title ?? "Template de dados (locacao)",
      thread,
      lines: cardLines,
    },
  };
}

function mapStoredMessageToChat(message: ImobChatMessage): ChatMessage {
  const metadata = (message.metadata && typeof message.metadata === "object"
    ? message.metadata
    : null) as Record<string, unknown> | null;
  const cardCandidate = metadata?.card;
  const card =
    cardCandidate && typeof cardCandidate === "object" && !Array.isArray(cardCandidate)
      ? (cardCandidate as MessageCard)
      : undefined;
  const normalizedCard = card
    ? {
        ...card,
        ctas: normalizeCardCtas(card.ctas),
      }
    : undefined;

  return {
    id: message.id,
    role: message.role,
    text: message.content,
    thread: message.threadId
      ? {
          id: message.threadId,
          label: message.threadLabel ?? "Operação",
          status: message.threadStatus ?? "active",
        }
      : undefined,
    card: normalizedCard,
  };
}

const ImobChatPage: React.FC = () => {
  const session = useSession();
  const [searchParams] = useSearchParams();
  const brandName = session.branding?.brandName?.trim() || "Tenant";
  const workspaceLabel = session.branding?.workspaceLabel?.trim() || session.workspaceId;
  const requestedConversationId = React.useMemo(() => {
    const raw = searchParams.get("conversationId");
    return raw && raw.trim().length > 0 ? raw.trim() : null;
  }, [searchParams]);
  const requestedThreadId = React.useMemo(() => {
    const raw = searchParams.get("threadId");
    return raw && raw.trim().length > 0 ? raw.trim() : null;
  }, [searchParams]);

  const [state, setState] = React.useState<ChatState>("idle");
  const [input, setInput] = React.useState("");
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [pendingExecution, setPendingExecution] = React.useState<PendingExecution | null>(null);
  const [activeThread, setActiveThread] = React.useState<{ id: string; label: string } | null>(null);
  const [activeAssistantMessageId, setActiveAssistantMessageId] = React.useState<string | null>(null);
  const [activeRunId, setActiveRunId] = React.useState<string | null>(null);
  const [runStatus, setRunStatus] = React.useState<string | null>(null);
  const [conversationId, setConversationId] = React.useState<string | null>(null);
  const [conversations, setConversations] = React.useState<ImobChatConversation[]>([]);
  const [threads, setThreads] = React.useState<ImobChatThread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = React.useState<string | null>(null);
  const [showThreadPanel, setShowThreadPanel] = React.useState(false);
  const [conversationSearch, setConversationSearch] = React.useState("");
  const [historyLoading, setHistoryLoading] = React.useState(true);
  const [historyLimit, setHistoryLimit] = React.useState(HISTORY_PAGE_SIZE);
  const [historyLoadingMore, setHistoryLoadingMore] = React.useState(false);
  const [hasMoreHistory, setHasMoreHistory] = React.useState(false);
  const [telemetrySummary, setTelemetrySummary] = React.useState<{
    totals: {
      events: number;
      messageToPlanAvgMs: number | null;
      planToExecuteAvgMs: number | null;
      chatToRunCoveragePct: number;
      persistSuccessRatePct: number;
    };
    generatedAt: string;
  } | null>(null);
  const [telemetryLoading, setTelemetryLoading] = React.useState(false);
  const [exportingFormat, setExportingFormat] = React.useState<"json" | "pdf" | null>(null);
  const [messageFeedback, setMessageFeedback] = React.useState<Record<string, "up" | "down">>({});
  const [openOptionsMessageId, setOpenOptionsMessageId] = React.useState<string | null>(null);
  const [rejectLockedMessageId, setRejectLockedMessageId] = React.useState<string | null>(null);
  const [isNearBottom, setIsNearBottom] = React.useState(true);
  const [showJumpToLatest, setShowJumpToLatest] = React.useState(false);
  const [contractInterviewState, setContractInterviewState] = React.useState<ContractInterviewState | null>(null);
  const [compactTimelineMode, setCompactTimelineMode] = React.useState(true);
  const [draftEditFieldId, setDraftEditFieldId] = React.useState("");
  const [singleEditFieldId, setSingleEditFieldId] = React.useState<string | null>(null);
  const [reviewActionLoading, setReviewActionLoading] = React.useState<"edit" | "confirm" | "decline" | null>(null);
  const contractEditableFields = React.useMemo(() => {
    if (!contractInterviewState?.contractType) return [];
    return CONTRACT_SCHEMAS[contractInterviewState.contractType].fields.map((step) => ({
      id: step.id,
      label: step.question.replace(/\?$/, ""),
    }));
  }, [contractInterviewState?.contractType]);

  const listRef = React.useRef<HTMLDivElement | null>(null);
  const sessionRunByThreadRef = React.useRef<Record<string, string>>({});
  const rejectedExecutionKeysRef = React.useRef<Set<string>>(new Set());
  const persistedRunStatusKeysRef = React.useRef<Set<string>>(new Set());
  const persistedContractTemplateKeysRef = React.useRef<Set<string>>(new Set());

  const loadConversationMessages = React.useCallback(
    async (targetConversationId: string, limit: number) => {
      const history = await apiListImobChatMessages(targetConversationId, { limit });
      const mapped = history.items.map(mapStoredMessageToChat);
      setMessages(mapped);
      sessionRunByThreadRef.current = buildSessionRunMapFromMessages(mapped);
      setHasMoreHistory(history.items.length >= limit);
    },
    []
  );

  const appendMessage = React.useCallback((message: ChatMessage) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  const updateMessageById = React.useCallback((messageId: string, patch: Partial<ChatMessage>) => {
    setMessages((prev) =>
      prev.map((item) => {
        if (item.id !== messageId) return item;
        return {
          ...item,
          ...patch,
          card: patch.card === undefined ? item.card : patch.card,
          thread: patch.thread === undefined ? item.thread : patch.thread,
        };
      })
    );
  }, []);

  const trackUxEvent = React.useCallback(
    (action: string, metadata?: Record<string, unknown>) => {
      if (!conversationId) return;
      void apiCreateImobChatTelemetry({
        conversationId,
        event: "ux_interaction",
        value: 1,
        metadata: { action, ...metadata },
      });
    },
    [conversationId]
  );

  const clearPendingExecution = React.useCallback(
    (reason: string, metadata?: Record<string, unknown>) => {
      if (!pendingExecution) return;
      trackUxEvent("pending_execution_cleared", {
        reason,
        threadId: pendingExecution.thread.id,
        action: pendingExecution.plan.action,
        ...metadata,
      });
      setPendingExecution(null);
      setOpenOptionsMessageId(null);
      setRejectLockedMessageId(null);
      setState("idle");
    },
    [pendingExecution, trackUxEvent]
  );

  const withDashboardContext = React.useCallback(
    (href: string, explicitThreadId?: string | null) => {
      if (!href.startsWith("/app/imob/dashboard")) return href;
      const hashIndex = href.indexOf("#");
      const hash = hashIndex >= 0 ? href.slice(hashIndex) : "";
      const base = hashIndex >= 0 ? href.slice(0, hashIndex) : href;
      const [path, query = ""] = base.split("?");
      const params = new URLSearchParams(query);
      if (conversationId) {
        params.set("conversationId", conversationId);
      }
      const threadIdForLink = explicitThreadId ?? selectedThreadId;
      if (threadIdForLink) {
        params.set("threadId", threadIdForLink);
      }
      const queryString = params.toString();
      return `${path}${queryString ? `?${queryString}` : ""}${hash}`;
    },
    [conversationId, selectedThreadId]
  );

  const refreshConversations = React.useCallback(async (preferredConversationId?: string | null) => {
    try {
      const list = await apiListImobChatConversations({ limit: 20 });
      const withHistory = list.items.filter((item) => item.lastMessageAt || item.lastMessagePreview);
      setConversations(withHistory);
      const preferred = preferredConversationId ?? conversationId;
      if (preferred && withHistory.some((item) => item.conversationId === preferred)) return;
      if (!conversationId && withHistory[0]?.conversationId) {
        setConversationId(withHistory[0].conversationId);
      }
    } catch {
      // F2: falha da lista nao bloqueia chat em conversa atual.
    }
  }, [conversationId]);

  const refreshThreads = React.useCallback(async (forConversationId?: string | null) => {
    const currentConversationId = forConversationId ?? conversationId;
    if (!currentConversationId) {
      setThreads([]);
      setSelectedThreadId(null);
      return;
    }
    try {
      const list = await apiListImobChatThreads(currentConversationId);
      setThreads(list.items);
      if (selectedThreadId && list.items.some((item) => item.threadId === selectedThreadId)) return;
      setSelectedThreadId(null);
    } catch {
      // Falha de threads nao bloqueia o chat.
    }
  }, [conversationId, selectedThreadId]);

  const refreshTelemetry = React.useCallback(async (forConversationId?: string | null) => {
    const currentConversationId = forConversationId ?? conversationId;
    if (!currentConversationId) return;
    setTelemetryLoading(true);
    try {
      const summary = await apiGetImobChatTelemetrySummary({
        conversationId: currentConversationId,
        windowHours: 24,
      });
      setTelemetrySummary({
        totals: summary.data.totals,
        generatedAt: summary.data.generatedAt,
      });
    } catch {
      // Não quebra UX.
    } finally {
      setTelemetryLoading(false);
    }
  }, [conversationId]);

  const persistMessage = React.useCallback(
    async (
      message: ChatMessage,
      extra?: { intent?: string; action?: string; conversationId?: string | null; metadata?: Record<string, unknown> }
    ) => {
      const targetConversationId = extra?.conversationId ?? conversationId;
      if (!targetConversationId) return;
      try {
        await apiCreateImobChatMessage(targetConversationId, {
          role: message.role,
          content: message.text,
          intent: extra?.intent,
          action: extra?.action,
          threadId: message.thread?.id ?? message.card?.thread?.id,
          threadLabel: message.thread?.label ?? message.card?.thread?.label,
          threadStatus: message.thread?.status ?? message.card?.thread?.status,
          runId: message.card?.runId,
          txId: message.card?.proof?.txId ?? undefined,
          receiptPath: message.card?.proof?.receiptPath ?? undefined,
          bundlePath: message.card?.proof?.bundlePath ?? undefined,
          metadata: {
            card: message.card ?? null,
            ...(extra?.metadata ?? {}),
          },
        });
        void apiCreateImobChatTelemetry({
          conversationId: targetConversationId,
          event: "message_persist_success_rate",
          value: 1,
          metadata: { role: message.role },
        });
        void refreshConversations(targetConversationId);
        void refreshThreads(targetConversationId);
        void refreshTelemetry(targetConversationId);
      } catch {
        void apiCreateImobChatTelemetry({
          conversationId: targetConversationId,
          event: "message_persist_success_rate",
          value: 0,
          metadata: { role: message.role },
        });
        // F1: falha de persistencia nao bloqueia o fluxo operacional do chat.
      }
    },
    [conversationId, refreshConversations, refreshTelemetry, refreshThreads]
  );

  const persistInterviewState = React.useCallback(
    async (targetConversationId: string, state: ContractInterviewState) => {
      const payload: ImobContractInterviewState = {
        contractType: state.contractType,
        currentStep: state.currentStep,
        answers: state.answers,
        status: state.status,
        runId: state.runId,
        updatedAt: state.updatedAt,
      };
      try {
        await apiUpsertImobChatInterviewState(targetConversationId, { state: payload });
      } catch {
        // Persistencia de entrevista nao deve bloquear o chat.
      }
    },
    []
  );

  React.useEffect(() => {
    const container = listRef.current;
    if (!container) return;
    if (historyLoadingMore) return;
    if (isNearBottom) {
      container.scrollTop = container.scrollHeight;
      setShowJumpToLatest(false);
      return;
    }
    setShowJumpToLatest(true);
  }, [historyLoadingMore, isNearBottom, messages]);

  React.useEffect(() => {
    let mounted = true;
    setHistoryLoading(true);

    const bootstrap = async () => {
      try {
        const list = await apiListImobChatConversations({ limit: 20 });
        if (!mounted) return;
        const withHistory = list.items.filter((item) => item.lastMessageAt || item.lastMessagePreview);
        setConversations(withHistory);
        const selectedConversationId =
          (requestedConversationId && withHistory.some((item) => item.conversationId === requestedConversationId)
            ? requestedConversationId
            : withHistory[0]?.conversationId) ?? null;
        if (!mounted) return;
        setConversationId(selectedConversationId);
        if (selectedConversationId) {
          const initialLimit = HISTORY_PAGE_SIZE;
          setHistoryLimit(initialLimit);
          const history = await apiListImobChatMessages(selectedConversationId, { limit: initialLimit });
          if (!mounted) return;
          const mappedHistory = history.items.map(mapStoredMessageToChat);
          setMessages(mappedHistory);
          sessionRunByThreadRef.current = buildSessionRunMapFromMessages(mappedHistory);
          setHasMoreHistory(history.items.length >= initialLimit);
          const threadList = await apiListImobChatThreads(selectedConversationId);
          if (!mounted) return;
          setThreads(threadList.items);
          if (requestedThreadId && threadList.items.some((item) => item.threadId === requestedThreadId)) {
            setSelectedThreadId(requestedThreadId);
          }
          const interview = await apiGetImobChatInterviewState(selectedConversationId);
          if (!mounted) return;
          setContractInterviewState((interview.state as ContractInterviewState | null) ?? null);
          setSingleEditFieldId(null);
        } else {
          setMessages([]);
          setThreads([]);
          setContractInterviewState(null);
          setSingleEditFieldId(null);
          sessionRunByThreadRef.current = {};
        }
      } catch {
        if (!mounted) return;
        setMessages([]);
        setThreads([]);
        setContractInterviewState(null);
        setSingleEditFieldId(null);
        sessionRunByThreadRef.current = {};
      } finally {
        if (mounted) setHistoryLoading(false);
      }
    };

    void bootstrap();
    return () => {
      mounted = false;
    };
  }, [requestedConversationId, requestedThreadId]);

  const loadConversation = React.useCallback(async (nextConversationId: string) => {
    setHistoryLoading(true);
    setConversationId(nextConversationId);
    setMessages([]);
    setPendingExecution(null);
    setActiveThread(null);
    setActiveAssistantMessageId(null);
    setOpenOptionsMessageId(null);
    setRejectLockedMessageId(null);
    setSelectedThreadId(null);
    setContractInterviewState(null);
    setSingleEditFieldId(null);
    sessionRunByThreadRef.current = {};
    trackUxEvent("conversation_selected", { nextConversationId });
    setHistoryLimit(HISTORY_PAGE_SIZE);
    setHasMoreHistory(false);
    try {
      await loadConversationMessages(nextConversationId, HISTORY_PAGE_SIZE);
      const threadList = await apiListImobChatThreads(nextConversationId);
      setThreads(threadList.items);
      const interview = await apiGetImobChatInterviewState(nextConversationId);
      setContractInterviewState((interview.state as ContractInterviewState | null) ?? null);
      setSingleEditFieldId(null);
    } catch {
      setMessages([]);
      setThreads([]);
      setContractInterviewState(null);
      setSingleEditFieldId(null);
      sessionRunByThreadRef.current = {};
    } finally {
      setHistoryLoading(false);
    }
    void refreshThreads(nextConversationId);
    void refreshTelemetry(nextConversationId);
  }, [loadConversationMessages, refreshTelemetry, refreshThreads, trackUxEvent]);

  const handleNewConversation = async () => {
    if (pendingExecution) {
      clearPendingExecution("new_conversation");
    }
    setConversationId(null);
    setMessages([]);
    setPendingExecution(null);
    setActiveThread(null);
    setActiveAssistantMessageId(null);
    setOpenOptionsMessageId(null);
    setRejectLockedMessageId(null);
    setThreads([]);
    setSelectedThreadId(null);
    setActiveRunId(null);
    setRunStatus(null);
    setContractInterviewState(null);
    setSingleEditFieldId(null);
    sessionRunByThreadRef.current = {};
    setHistoryLimit(HISTORY_PAGE_SIZE);
    setHasMoreHistory(false);
    trackUxEvent("conversation_new");
  };

  const handleLoadOlder = async () => {
    if (!conversationId || historyLoadingMore || historyLoading) return;
    setHistoryLoadingMore(true);
    setIsNearBottom(false);
    const container = listRef.current;
    const previousHeight = container?.scrollHeight ?? 0;
    const nextLimit = historyLimit + HISTORY_PAGE_SIZE;
    try {
      await loadConversationMessages(conversationId, nextLimit);
      setHistoryLimit(nextLimit);
      requestAnimationFrame(() => {
        const target = listRef.current;
        if (!target) return;
        const delta = target.scrollHeight - previousHeight;
        target.scrollTop = Math.max(0, target.scrollTop + delta);
      });
    } finally {
      setHistoryLoadingMore(false);
    }
  };

  const buildSearchResponse = React.useCallback(
    (plan: ImobActionPlan) => {
      const region = plan.search?.region ?? "Brasil";
      const segment = plan.search?.segment ?? "ambos";
      const searchSources = plan.search?.sources ?? [];
      const driveSearchSource = searchSources.find((source) => source.id === "drive-search");
      const driveFolderSource = searchSources.find((source) => source.id === "drive-folder");
      const internal = SYNTHETIC_SEARCH_CATALOG.filter((item) => {
        const regionMatch = region === "Brasil" ? true : item.region === region;
        const segmentMatch = segment === "ambos" ? true : item.segment === segment;
        return regionMatch && segmentMatch;
      }).slice(0, 4);

      const entitlements = (session.entitlements ?? {}) as Record<string, unknown>;
      const externalProviderAvailable = entitlements.IMOB_EXTERNAL_PROVIDER === true;
      const internalLines =
        internal.length > 0
          ? internal.map((item) => `- ${item.title} • ${item.city} • ${item.priceLabel}`)
          : ["- Não encontrei resultados internos com esse recorte."];
      const externalLines = externalProviderAvailable
        ? [
            driveSearchSource ? `- ${driveSearchSource.label} (Drive do IMOB)` : "- Drive do IMOB disponível para consulta direta.",
            "- Zap Imóveis (portal nacional)",
            "- Viva Real (portal nacional)",
            "- OLX Imóveis (regional e nacional)",
          ]
        : [
            driveSearchSource ? `- ${driveSearchSource.label} (Drive do IMOB)` : "- Drive do IMOB disponível para consulta direta.",
            "- Provider externo não habilitado neste tenant/workspace.",
          ];

      const segmentLabel = segment === "locacao" ? "locação" : segment === "venda" ? "venda" : "locação e venda";
      return [
        `Encontrei opções para ${segmentLabel} em ${region}.`,
        "",
        "Base interna (prioridade):",
        ...internalLines,
        "",
        "Fontes externas:",
        ...externalLines,
        "",
        driveFolderSource ? `Pasta base: ${driveFolderSource.href}` : "",
        driveSearchSource ? "Use os atalhos abaixo para abrir a busca do acervo IMOB já filtrada." : "",
        driveSearchSource || driveFolderSource ? "" : "",
        "Sugestões de busca no Brasil:",
        "- Região: Sul, Sudeste, Nordeste",
        "- Segmento: locação, venda ou ambos",
        "- Faixa: até R$ 500 mil, R$ 500 mil a R$ 1,5 mi, acima de R$ 1,5 mi",
      ]
        .filter(Boolean)
        .join("\n");
    },
    [session.entitlements]
  );

  const buildKnowledgeSearchResponse = React.useCallback(
    (result: ImobKnowledgeSearchResponse, plan: ImobActionPlan) => {
      const items = result.items.slice(0, 4);
      const itemLines =
        items.length > 0
          ? items.map(
              (item) =>
                `- ${item.title} • ${item.sourceType} • ${item.documentType} • ${item.region}\n  ${item.snippet}`
            )
          : ["- Não encontrei documentos com esse recorte no acervo atual."];
      const sourceLines =
        plan.search?.sources?.map((source) => `- ${source.label}: ${source.description}`) ?? [];

      return [
        `Encontrei ${result.total} resultado(s) documentais para esta busca no IMOB.`,
        "",
        "Resultados:",
        ...itemLines,
        "",
        sourceLines.length > 0 ? "Fontes complementares:" : "",
        ...sourceLines,
      ]
        .filter(Boolean)
        .join("\n");
    },
    []
  );

  const buildSearchCard = React.useCallback(
    (plan: ImobActionPlan, thread: { id: string; label: string; status?: "active" | "done" | "blocked" }): MessageCard | undefined => {
      const sources = plan.search?.sources ?? [];
      if (sources.length === 0) return undefined;
      return {
        type: "action",
        title: "Fontes de busca",
        thread,
        lines: sources.map((source) => source.description),
        ctas: sources.map((source, index) => ({
          id: source.id,
          label: source.label,
          kind: index === 0 ? "primary" : "neutral",
          href: source.href,
        })),
      };
    },
    []
  );

  const buildKnowledgeSearchCard = React.useCallback(
    (
      result: ImobKnowledgeSearchResponse,
      plan: ImobActionPlan,
      thread: { id: string; label: string; status?: "active" | "done" | "blocked" }
    ): MessageCard | undefined => {
      const items = result.items.slice(0, 3);
      const sourceCtas =
        plan.search?.sources?.map((source, index) => ({
          id: source.id,
          label: source.label,
          kind: index === 0 ? ("primary" as const) : ("neutral" as const),
          href: source.href,
        })) ?? [];
      const itemCtas = items.map((item) => ({
        id: item.id,
        label: `Abrir: ${item.title.slice(0, 36)}`,
        kind: "secondary" as const,
        href: item.href,
      }));
      return {
        type: "action",
        title: "Resultados do acervo IMOB",
        thread,
        lines:
          items.length > 0
            ? items.map((item) => `${item.title} • ${item.sourceType} • ${item.documentType}`)
            : ["Nenhum documento encontrado com esse recorte."],
        ctas: [...itemCtas, ...sourceCtas].slice(0, 5),
      };
    },
    []
  );

  React.useEffect(() => {
    if (!conversationId) return;
    void refreshTelemetry(conversationId);
    void refreshThreads(conversationId);
    const interval = setInterval(() => {
      void refreshTelemetry(conversationId);
    }, 15000);
    return () => clearInterval(interval);
  }, [conversationId, refreshTelemetry, refreshThreads]);

  React.useEffect(() => {
    if (!activeRunId) return;
    if (!(state === "executing" || state === "done")) return;

    let cancelled = false;
    const intervalId = setInterval(() => {
      void apiGetRun(activeRunId)
        .then((run) => {
          if (cancelled) return;
          if (run.status === runStatus) return;

          setRunStatus(run.status);
          const updatedThread =
            activeThread
              ? {
                  id: activeThread.id,
                  label: activeThread.label,
                  status:
                    run.status === "success"
                      ? ("done" as const)
                      : run.status === "blocked" || run.status === "error"
                        ? ("blocked" as const)
                        : ("active" as const),
                }
              : undefined;
          const updatedCard: MessageCard = {
            type: run.status === "blocked" || run.status === "error" ? "risk" : "queue",
            title:
              run.status === "success"
                ? "Concluído"
                : run.status === "blocked" || run.status === "error"
                  ? "Precisa de atenção"
                  : "Andamento",
            thread: updatedThread,
            lines: [humanRunStatusBusiness(run.status, updatedThread?.label), ...nextBusinessStep(run.status, updatedThread?.label)],
            runId: activeRunId,
            queue: {
              status: run.status,
              step: run.status === "running" ? "processing" : run.status,
            },
            proof: {
              txId: run.txId ?? null,
              receiptPath: run.txId ? `/api/ledger/${encodeURIComponent(run.txId)}` : null,
              bundlePath: run.criticalHash ? `/api/runs/${encodeURIComponent(activeRunId)}/bundle` : null,
            },
            ctas: [
              {
                id: "view-run",
                label: "Ver execução",
                kind: "neutral",
                href: `/app/runs?domain=imob&runId=${encodeURIComponent(activeRunId)}`,
              },
            ],
          };

          if (activeAssistantMessageId) {
            updateMessageById(activeAssistantMessageId, {
              text: humanRunStatusBusiness(run.status, updatedThread?.label),
              thread: updatedThread,
              card: updatedCard,
            });
          } else {
            appendMessage({
              id: makeId("assistant"),
              role: "assistant",
              text: humanRunStatusBusiness(run.status, updatedThread?.label),
              thread: updatedThread,
              card: updatedCard,
            });
          }

          if (run.status === "success") {
            setState("done");
          } else if (run.status === "blocked" || run.status === "error") {
            setState("blocked");
          }

          const isTerminal = run.status === "success" || run.status === "blocked" || run.status === "error";
          if (isTerminal) {
            const persistKey = `${activeRunId}:${run.status}`;
            if (!persistedRunStatusKeysRef.current.has(persistKey)) {
              persistedRunStatusKeysRef.current.add(persistKey);
              const terminalMessage: ChatMessage = {
                id: makeId("assistant"),
                role: "assistant",
                text: humanRunStatusBusiness(run.status, updatedThread?.label),
                thread: updatedThread,
                card: updatedCard,
              };
              void persistMessage(terminalMessage);
            }
          }

          const area = getThreadBusinessArea(updatedThread?.label);
          if (run.status === "success" && area === "contract") {
            const templateKey = `${activeRunId}:contract-template`;
            if (!persistedContractTemplateKeysRef.current.has(templateKey)) {
              persistedContractTemplateKeysRef.current.add(templateKey);
              const threadForTemplate = updatedThread ?? {
                id: makeId("thread"),
                label: "Contrato",
                status: "done" as const,
              };
              const templateMessage = buildRentalContractTemplateMessage(threadForTemplate);
              appendMessage(templateMessage);
              void persistMessage(templateMessage);
            }
          }
        })
        .catch(() => undefined);
    }, 3500);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [activeAssistantMessageId, activeRunId, activeThread, appendMessage, persistMessage, runStatus, state, updateMessageById]);

  const startPlanExecution = async (
    plan: ImobActionPlan,
    operationThread: { id: string; label: string },
    activeConversationId: string,
    startedAt: number
  ) => {
      try {
        const discovery = await apiAgentsDiscovery({
          domain: "imob",
          actions: [plan.action],
        });
        const discovered = discovery.data.actions.find((entry) => entry.action === plan.action);

        if (!discovered) {
          throw new Error(`Ação ${plan.action} não disponível para este tenant/workspace.`);
        }

        const negotiation = await apiAgentsNegotiate({
          domain: "imob",
          action: plan.action,
        });
        const contract = negotiation.data.contract;
        const thread = operationThread;
        const liveMessageId = makeId("assistant");
        const executionPending: PendingExecution = {
          plan,
          contract,
          messageId: liveMessageId,
          thread,
          receiptEndpointTemplate: negotiation.data.verification.endpointTemplate,
          preparedAt: Date.now(),
        };
        setOpenOptionsMessageId(null);
        setRejectLockedMessageId(null);
        setActiveAssistantMessageId(liveMessageId);
        setState("executing");

        const planMessage: ChatMessage = {
          id: liveMessageId,
          role: "assistant",
          text: "Preparando...",
          thread: {
            id: thread.id,
            label: thread.label,
            status: "active",
          },
          card: {
            type: "queue",
            title: "Preparando",
            thread: {
              id: thread.id,
              label: thread.label,
              status: "active",
            },
            lines: [],
            queue: {
              status: "running",
              step: "prepare",
            },
          },
        };
        appendMessage(planMessage);
        void persistMessage(planMessage, {
          intent: plan.intent,
          action: plan.action,
          conversationId: activeConversationId,
          metadata: contractInterviewState ? { contractInterview: contractInterviewState } : undefined,
        });
        void apiCreateImobChatTelemetry({
          conversationId: activeConversationId,
          event: "message_to_plan_ms",
          value: Date.now() - startedAt,
          metadata: { intent: plan.intent, action: plan.action },
        });
        await runExecutionFlow(executionPending);
      } catch (error) {
        const message =
          error instanceof ApiError
            ? `${error.message} (${error.status})`
            : error instanceof Error
              ? error.message
              : "Falha ao orquestrar mensagem";
        setState("blocked");
        const blockedMessage: ChatMessage = {
          id: makeId("assistant"),
          role: "assistant",
          text: "Não consegui continuar essa solicitação agora.",
          thread: {
            id: operationThread.id,
            label: operationThread.label,
            status: "blocked",
          },
          card: {
            type: "risk",
            title: "Ação pausada",
            thread: {
              id: operationThread.id,
              label: operationThread.label,
              status: "blocked",
            },
            lines: ["Identifiquei uma restrição de segurança para este passo."],
            risk: {
              level: "high",
              reason: message,
            },
          },
        };
        appendMessage(blockedMessage);
        void persistMessage(blockedMessage, { conversationId: activeConversationId });
      }
  };

  const resolveInterviewOperationThread = React.useCallback(() => {
    const selectedThread = selectedThreadId ? threads.find((item) => item.threadId === selectedThreadId) : null;
    return selectedThread
      ? { id: selectedThread.threadId, label: selectedThread.label }
      : activeThread ?? {
          id: makeId("thread"),
          label: "Contrato",
        };
  }, [activeThread, selectedThreadId, threads]);

  const handleReviewEditAction = React.useCallback(
    async (
      fieldQuery: string,
      state: ContractInterviewState,
      activeConversationId: string,
      threadForInterview: { id: string; label: string; status: "active" }
    ) => {
      const editResult = moveInterviewToEditableField(state, fieldQuery);
      if (!editResult.ok) {
        const invalidEditMessage: ChatMessage = {
          id: makeId("assistant"),
          role: "assistant",
          text: editResult.message,
          thread: threadForInterview,
        };
        appendMessage(invalidEditMessage);
        void persistMessage(invalidEditMessage, {
          conversationId: activeConversationId,
          intent: "contract",
          action: "realestate.create_contract",
          metadata: { contractInterview: state },
        });
        setState("awaiting_user_action");
        return;
      }
      const editedState = editResult.state;
      setContractInterviewState(editedState);
      setSingleEditFieldId(editResult.fieldId);
      await persistInterviewState(activeConversationId, editedState);
      const editPromptMessage: ChatMessage = {
        id: makeId("assistant"),
        role: "assistant",
        text: `Perfeito, vamos editar este campo.\n\n${editResult.question}`,
        thread: threadForInterview,
      };
      appendMessage(editPromptMessage);
      void persistMessage(editPromptMessage, {
        conversationId: activeConversationId,
        intent: "contract",
        action: "realestate.create_contract",
        metadata: { contractInterview: editedState },
      });
      setState("awaiting_user_action");
    },
    [appendMessage, persistInterviewState, persistMessage]
  );

  const handleReviewDeclineAction = React.useCallback(
    async (
      state: ContractInterviewState,
      activeConversationId: string,
      threadForInterview: { id: string; label: string; status: "active" }
    ) => {
      const restarted: ContractInterviewState = {
        ...createInitialContractInterviewState(),
        contractType: state.contractType,
        updatedAt: new Date().toISOString(),
      };
      setContractInterviewState(restarted);
      setSingleEditFieldId(null);
      await persistInterviewState(activeConversationId, restarted);
      const restartMessage: ChatMessage = {
        id: makeId("assistant"),
        role: "assistant",
        text: `Sem problemas. Vamos revisar desde o inicio deste tipo de contrato.\n\n${getStepQuestionText(restarted) ?? "Qual o primeiro dado?"}`,
        thread: threadForInterview,
      };
      appendMessage(restartMessage);
      void persistMessage(restartMessage, {
        conversationId: activeConversationId,
        intent: "contract",
        action: "realestate.create_contract",
        metadata: { contractInterview: restarted },
      });
      setState("awaiting_user_action");
    },
    [appendMessage, persistInterviewState, persistMessage]
  );

  const handleReviewConfirmAction = React.useCallback(
    async (
      state: ContractInterviewState,
      activeConversationId: string,
      threadForInterview: { id: string; label: string; status: "active" }
    ) => {
      const generatingState: ContractInterviewState = {
        ...state,
        status: "generating",
        updatedAt: new Date().toISOString(),
      };
      setContractInterviewState(generatingState);
      setSingleEditFieldId(null);
      await persistInterviewState(activeConversationId, generatingState);
      const confirmMessage: ChatMessage = {
        id: makeId("assistant"),
        role: "assistant",
        text: "Perfeito. Vou gerar o contrato com os dados validados.",
        thread: threadForInterview,
      };
      appendMessage(confirmMessage);
      void persistMessage(confirmMessage, {
        conversationId: activeConversationId,
        intent: "contract",
        action: "realestate.create_contract",
        metadata: { contractInterview: generatingState },
      });
      try {
        if (!generatingState.contractType) {
          throw new Error("Tipo de contrato nao definido.");
        }
        const generated = await apiGenerateImobContract({
          contractType: generatingState.contractType,
          answers: generatingState.answers ?? {},
          conversationId: activeConversationId,
          legalVersion: "BR_CIVIL_LOCACAO_2026_v1",
        });
        const generatedState: ContractInterviewState = {
          ...generatingState,
          status: "generated",
          updatedAt: new Date().toISOString(),
        };
        setContractInterviewState(generatedState);
        setSingleEditFieldId(null);
        await persistInterviewState(activeConversationId, generatedState);

        const reviewWarnings = generated.data.review.warnings ?? [];
        const generatedMessage: ChatMessage = {
          id: makeId("assistant"),
          role: "assistant",
          text: ["Contrato gerado com sucesso.", "", generated.data.contractText].join("\n"),
          thread: {
            ...threadForInterview,
            status: "done",
          },
          card: {
            type: "evidence",
            title: "Contrato gerado",
            thread: {
              id: threadForInterview.id,
              label: threadForInterview.label,
              status: "done",
            },
            lines: [
              `Tipo: ${getContractTypeLabel(generated.data.contractType)}`,
              `Schema: ${generated.data.schemaVersion}`,
              `Base legal: ${generated.data.legalVersion}`,
              `Risco: ${generated.data.review.riskLevel}`,
              ...reviewWarnings.slice(0, 2).map((warning) => `Alerta: ${warning}`),
              `Evidencia: ${generated.data.evidence.eventId}`,
              `Hash: ${generated.data.hash.slice(0, 16)}...`,
            ],
            contract: {
              title: `Contrato IMOB - ${getContractTypeLabel(generated.data.contractType)}`,
              contractType: generated.data.contractType,
              schemaVersion: generated.data.schemaVersion,
              legalVersion: generated.data.legalVersion,
              generatedAt: generated.data.evidence.createdAt,
              hash: generated.data.hash,
              text: generated.data.contractText,
            },
            ctas: [
              {
                id: "export-contract-pdf",
                label: "Exportar PDF",
                kind: "neutral",
                action: "export_contract_pdf",
              },
            ],
          },
        };
        appendMessage(generatedMessage);
        void persistMessage(generatedMessage, {
          conversationId: activeConversationId,
          intent: "contract",
          action: "realestate.create_contract",
          metadata: {
            contractInterview: generatedState,
            contractPreview: generated.data,
          },
        });
        setState("done");
      } catch (error) {
        const recoveryState: ContractInterviewState = {
          ...state,
          status: "review",
          updatedAt: new Date().toISOString(),
        };
        setContractInterviewState(recoveryState);
        setSingleEditFieldId(null);
        await persistInterviewState(activeConversationId, recoveryState);
        const message =
          error instanceof ApiError
            ? `${error.message} (${error.status})`
            : error instanceof Error
              ? error.message
              : "Falha ao gerar contrato";
        const failedMessage: ChatMessage = {
          id: makeId("assistant"),
          role: "assistant",
          text: "Nao consegui gerar o contrato agora. Revise os dados e tente novamente.",
          thread: {
            ...threadForInterview,
            status: "blocked",
          },
          card: {
            type: "risk",
            title: "Geracao de contrato pausada",
            thread: {
              id: threadForInterview.id,
              label: threadForInterview.label,
              status: "blocked",
            },
            lines: ["A revisao segue disponivel no rascunho."],
            risk: {
              level: "high",
              reason: message,
            },
          },
        };
        appendMessage(failedMessage);
        void persistMessage(failedMessage, {
          conversationId: activeConversationId,
          intent: "contract",
          action: "realestate.create_contract",
          metadata: { contractInterview: recoveryState },
        });
        setState("awaiting_user_action");
      }
    },
    [appendMessage, persistInterviewState, persistMessage]
  );

  const sendMessageText = async (rawText: string) => {
    const text = rawText.trim();
    if (!text) return;
    const plan = buildImobActionPlan(text, {
      tenantId: session.tenantId,
      workspaceId: session.workspaceId,
      entitlements: session.entitlements ?? null,
    });
    const selectedThread = selectedThreadId ? threads.find((item) => item.threadId === selectedThreadId) : null;
    const operationThread = selectedThread
      ? { id: selectedThread.threadId, label: selectedThread.label }
      : activeThread ?? {
          id: makeId("thread"),
          label: getIntentThreadLabel(plan.intent),
        };
    let activeConversationId = conversationId;
    if (!activeConversationId) {
      try {
        const created = await apiCreateImobChatConversation({
          title: getConversationTitleFromMessage(text, conversations),
        });
        activeConversationId = created.conversation.conversationId;
        setConversationId(activeConversationId);
        setConversations((prev) => [created.conversation, ...prev]);
        sessionRunByThreadRef.current = {};
      } catch {
        return;
      }
    }

    const userMessage: ChatMessage = {
      id: makeId("user"),
      role: "user",
      text,
      thread: {
        id: operationThread.id,
        label: operationThread.label,
        status: "active",
      },
    };
    appendMessage(userMessage);
    void persistMessage(userMessage, {
      conversationId: activeConversationId,
      metadata: contractInterviewState ? { contractInterview: contractInterviewState } : undefined,
    });
    setInput("");
    setState("typing");
    const startedAt = Date.now();

    const interviewIsActive =
      !!contractInterviewState &&
      (contractInterviewState.status === "collecting" ||
        contractInterviewState.status === "review" ||
        contractInterviewState.status === "generating");
    if (interviewIsActive || plan.intent === "contract") {
      const threadForInterview = {
        id: operationThread.id,
        label: "Contrato",
        status: "active" as const,
      };

      if (!contractInterviewState || contractInterviewState.status === "generated") {
        const initialInterview = createInitialContractInterviewState();
        setContractInterviewState(initialInterview);
        setSingleEditFieldId(null);
        await persistInterviewState(activeConversationId, initialInterview);
        const kickoffMessage: ChatMessage = {
          id: makeId("assistant"),
          role: "assistant",
          text: getContractTypePrompt(),
          thread: threadForInterview,
        };
        appendMessage(kickoffMessage);
        void persistMessage(kickoffMessage, {
          conversationId: activeConversationId,
          intent: "contract",
          action: "realestate.create_contract",
          metadata: { contractInterview: initialInterview },
        });
        setState("awaiting_user_action");
        return;
      }

      if (contractInterviewState.status === "review") {
        const editQuery = extractEditFieldQuery(text);
        if (editQuery) {
          await handleReviewEditAction(editQuery, contractInterviewState, activeConversationId, threadForInterview);
          return;
        }
        if (isAffirmativeAnswer(text)) {
          await handleReviewConfirmAction(contractInterviewState, activeConversationId, threadForInterview);
          return;
        }
        if (isNegativeAnswer(text)) {
          await handleReviewDeclineAction(contractInterviewState, activeConversationId, threadForInterview);
          return;
        }
        const reminderMessage: ChatMessage = {
          id: makeId("assistant"),
          role: "assistant",
          text: "Use os controles no rascunho para editar, confirmar ou nao gerar.",
          thread: threadForInterview,
        };
        appendMessage(reminderMessage);
        void persistMessage(reminderMessage, {
          conversationId: activeConversationId,
          intent: "contract",
          action: "realestate.create_contract",
          metadata: { contractInterview: contractInterviewState },
        });
        setState("awaiting_user_action");
        return;
      }

      if (singleEditFieldId) {
        const editApplied = applySingleFieldEditAnswer(contractInterviewState, singleEditFieldId, text);
        const updatedEditState: ContractInterviewState = {
          ...editApplied.state,
          updatedAt: new Date().toISOString(),
        };
        setContractInterviewState(updatedEditState);
        await persistInterviewState(activeConversationId, updatedEditState);
        const editMessage: ChatMessage = {
          id: makeId("assistant"),
          role: "assistant",
          text: editApplied.ok
            ? editApplied.message ?? "Rascunho atualizado."
            : `${editApplied.message}\n\n${getStepQuestionText(contractInterviewState) ?? "Informe novamente este campo."}`,
          thread: threadForInterview,
        };
        appendMessage(editMessage);
        void persistMessage(editMessage, {
          conversationId: activeConversationId,
          intent: "contract",
          action: "realestate.create_contract",
          metadata: { contractInterview: updatedEditState },
        });
        if (editApplied.ok) {
          setSingleEditFieldId(null);
        }
        setState("awaiting_user_action");
        return;
      }

      const result = applyContractInterviewAnswer(contractInterviewState, text);
      const nextInterviewState: ContractInterviewState = {
        ...result.state,
        updatedAt: new Date().toISOString(),
      };
      setContractInterviewState(nextInterviewState);
      await persistInterviewState(activeConversationId, nextInterviewState);
      const interviewMessage: ChatMessage = {
        id: makeId("assistant"),
        role: "assistant",
        text: result.message ?? "Resumo atualizado. Responda: sim, nao ou editar <campo>.",
        thread: threadForInterview,
      };
      appendMessage(interviewMessage);
      void persistMessage(interviewMessage, {
        conversationId: activeConversationId,
        intent: "contract",
        action: "realestate.create_contract",
        metadata: { contractInterview: nextInterviewState },
      });
      setState("awaiting_user_action");
      return;
    }

    if (plan.mode === "blocked") {
      const blockedReply: ChatMessage = {
        id: makeId("assistant"),
        role: "assistant",
        text: plan.prompt,
        thread: {
          id: operationThread.id,
          label: operationThread.label,
          status: "blocked",
        },
      };
      appendMessage(blockedReply);
      void persistMessage(blockedReply, {
        intent: plan.intent,
        action: plan.action,
        conversationId: activeConversationId,
      });
      setState("blocked");
      return;
    }

    if (plan.mode === "search_knowledge") {
      const searchThread = {
        id: operationThread.id,
        label: operationThread.label,
        status: "active" as const,
      };
      try {
        const search = await apiSearchImobKnowledge({
          query: plan.search?.query ?? text,
          filters: {
            region: plan.search?.region ?? null,
            segment: plan.search?.segment ?? null,
          },
        });
        const searchReply: ChatMessage = {
          id: makeId("assistant"),
          role: "assistant",
          text: buildKnowledgeSearchResponse(search.data, plan),
          thread: searchThread,
          card: buildKnowledgeSearchCard(search.data, plan, searchThread),
        };
        appendMessage(searchReply);
        void persistMessage(searchReply, {
          intent: plan.intent,
          action: plan.action,
          conversationId: activeConversationId,
          metadata: { knowledgeSearch: search.data },
        });
        if (activeConversationId) {
          void apiCreateImobChatTelemetry({
            conversationId: activeConversationId,
            event: "message_to_plan_ms",
            value: Date.now() - startedAt,
            metadata: { intent: plan.intent, action: plan.action, mode: plan.mode, resultTotal: search.data.total },
          });
        }
        setState("done");
      } catch (error) {
        const errorMessage =
          error instanceof ApiError && error.status === 403
            ? "A busca documental do IMOB não está habilitada para este tenant/workspace."
            : "Não consegui consultar o acervo IMOB agora. Tente novamente em instantes.";
        const failureReply: ChatMessage = {
          id: makeId("assistant"),
          role: "assistant",
          text: errorMessage,
          thread: { ...searchThread, status: "blocked" },
        };
        appendMessage(failureReply);
        setState("blocked");
      }
      return;
    }

    if (plan.mode === "search") {
      const searchThread = {
        id: operationThread.id,
        label: operationThread.label,
        status: "active" as const,
      };
      const searchReply: ChatMessage = {
        id: makeId("assistant"),
        role: "assistant",
        text: buildSearchResponse(plan),
        thread: searchThread,
        card: buildSearchCard(plan, searchThread),
      };
      appendMessage(searchReply);
      void persistMessage(searchReply, {
        intent: plan.intent,
        action: plan.action,
        conversationId: activeConversationId,
      });
      if (activeConversationId) {
        void apiCreateImobChatTelemetry({
          conversationId: activeConversationId,
          event: "message_to_plan_ms",
          value: Date.now() - startedAt,
          metadata: { intent: plan.intent, action: plan.action, mode: plan.mode },
        });
      }
      setState("done");
      return;
    }

    await startPlanExecution(plan, operationThread, activeConversationId, startedAt);
  };

  React.useEffect(() => {
    if (contractInterviewState?.status !== "review") return;
    if (contractEditableFields.length === 0) return;
    const found = contractEditableFields.some((item) => item.id === draftEditFieldId);
    if (!found) {
      setDraftEditFieldId(contractEditableFields[0].id);
    }
  }, [contractEditableFields, contractInterviewState?.status, draftEditFieldId]);

  const handleDraftEditFromPanel = React.useCallback(async () => {
    if (!conversationId || !contractInterviewState || contractInterviewState.status !== "review") return;
    const query = draftEditFieldId || contractEditableFields[0]?.id;
    if (!query) return;
    const operationThread = resolveInterviewOperationThread();
    const threadForInterview = {
      id: operationThread.id,
      label: "Contrato",
      status: "active" as const,
    };
    setReviewActionLoading("edit");
    try {
      await handleReviewEditAction(query, contractInterviewState, conversationId, threadForInterview);
    } finally {
      setReviewActionLoading(null);
    }
  }, [
    contractEditableFields,
    contractInterviewState,
    conversationId,
    draftEditFieldId,
    handleReviewEditAction,
    resolveInterviewOperationThread,
  ]);

  const handleDraftConfirmFromPanel = React.useCallback(async () => {
    if (!conversationId || !contractInterviewState || contractInterviewState.status !== "review") return;
    const operationThread = resolveInterviewOperationThread();
    const threadForInterview = {
      id: operationThread.id,
      label: "Contrato",
      status: "active" as const,
    };
    setReviewActionLoading("confirm");
    try {
      await handleReviewConfirmAction(
        contractInterviewState,
        conversationId,
        threadForInterview
      );
    } finally {
      setReviewActionLoading(null);
    }
  }, [contractInterviewState, conversationId, handleReviewConfirmAction, resolveInterviewOperationThread]);

  const handleDraftDeclineFromPanel = React.useCallback(async () => {
    if (!conversationId || !contractInterviewState || contractInterviewState.status !== "review") return;
    const operationThread = resolveInterviewOperationThread();
    const threadForInterview = {
      id: operationThread.id,
      label: "Contrato",
      status: "active" as const,
    };
    setReviewActionLoading("decline");
    try {
      await handleReviewDeclineAction(contractInterviewState, conversationId, threadForInterview);
    } finally {
      setReviewActionLoading(null);
    }
  }, [contractInterviewState, conversationId, handleReviewDeclineAction, resolveInterviewOperationThread]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    await sendMessageText(text);
  };

  const runExecutionFlow = React.useCallback(
    async (executionPending: PendingExecution, options?: { trackConfirm?: boolean }) => {
      if (options?.trackConfirm) {
        trackUxEvent("execution_confirmed", {
          threadId: executionPending.thread.id,
          messageId: executionPending.messageId,
          action: executionPending.plan.action,
        });
      }
      setOpenOptionsMessageId(null);
      setState("executing");
      updateMessageById(executionPending.messageId, {
        text: "Vou preparar esta operação agora.",
        thread: {
          id: executionPending.thread.id,
          label: executionPending.thread.label,
          status: "active",
        },
        card: {
          type: "queue",
          title: "Preparando",
          thread: {
            id: executionPending.thread.id,
            label: executionPending.thread.label,
            status: "active",
          },
          lines: [],
          queue: {
            status: "running",
            step: "prepare",
          },
        },
      });

      try {
        const sessionRunId = sessionRunByThreadRef.current[executionPending.thread.id] ?? null;
        const parentRunId = sessionRunId;
        const execution = await apiAgentsExecute({
          domain: "imob",
          action: executionPending.plan.action,
          version: executionPending.contract.version,
          input: executionPending.plan.input,
          prompt: executionPending.plan.prompt,
          parentRunId: parentRunId ?? undefined,
          metadata: {
            chatFlow: "imob-operational-chat",
            intent: executionPending.plan.intent,
            conversationId: conversationId ?? undefined,
            threadId: executionPending.thread.id,
            threadLabel: executionPending.thread.label,
            sessionRunId: sessionRunId ?? undefined,
          },
        });

        const runId = execution.data.runId;
        if (!sessionRunByThreadRef.current[executionPending.thread.id]) {
          sessionRunByThreadRef.current[executionPending.thread.id] = runId;
        }
        setActiveRunId(runId);
        setActiveThread(executionPending.thread);
        setRunStatus(execution.data.status);
        if (contractInterviewState?.status === "generating") {
          const generatedState: ContractInterviewState = {
            ...contractInterviewState,
            status: "generated",
            runId,
            updatedAt: new Date().toISOString(),
          };
          setContractInterviewState(generatedState);
          if (conversationId) {
            void persistInterviewState(conversationId, generatedState);
          }
        }
        persistedRunStatusKeysRef.current.delete(`${runId}:success`);
        persistedRunStatusKeysRef.current.delete(`${runId}:blocked`);
        persistedRunStatusKeysRef.current.delete(`${runId}:error`);
        setPendingExecution(null);
        setState("executing");

        updateMessageById(executionPending.messageId, {
          text: "Operação iniciada.",
          thread: {
            id: executionPending.thread.id,
            label: executionPending.thread.label,
            status: "active",
          },
          card: {
            type: "queue",
            title: "Em andamento",
            thread: {
              id: executionPending.thread.id,
              label: executionPending.thread.label,
              status: "active",
            },
            lines: ["Atualizando progresso em tempo real."],
            runId,
            queue: {
              status: execution.data.status,
              step: "execute",
            },
            proof: {
              txId: execution.data.verify.txId,
              bundlePath: execution.data.verify.runBundlePath,
              receiptPath: resolveRunTemplatePath(executionPending.receiptEndpointTemplate, runId),
            },
            ctas: [
              {
                id: "view-run",
                label: "Ver execução",
                kind: "neutral",
                href: `/app/runs?domain=imob&runId=${encodeURIComponent(runId)}`,
              },
              ...(execution.data.verify.runBundlePath
                ? [{ id: "open-bundle", label: "Ver dossiê", kind: "neutral" as const, href: execution.data.verify.runBundlePath }]
                : []),
            ],
          },
        });
        const startedKey = `${runId}:started`;
        if (!persistedRunStatusKeysRef.current.has(startedKey)) {
          persistedRunStatusKeysRef.current.add(startedKey);
          void persistMessage({
            id: makeId("assistant"),
            role: "assistant",
            text: "Operação iniciada.",
            thread: {
              id: executionPending.thread.id,
              label: executionPending.thread.label,
              status: "active",
            },
            card: {
              type: "queue",
              title: "Em andamento",
              thread: {
                id: executionPending.thread.id,
                label: executionPending.thread.label,
                status: "active",
              },
              lines: ["Atualizando progresso em tempo real."],
              runId,
              queue: {
                status: execution.data.status,
                step: "execute",
              },
              proof: {
                txId: execution.data.verify.txId,
                bundlePath: execution.data.verify.runBundlePath,
                receiptPath: resolveRunTemplatePath(executionPending.receiptEndpointTemplate, runId),
              },
              ctas: [
                {
                  id: "view-run",
                  label: "Ver execução",
                  kind: "neutral",
                  href: `/app/runs?domain=imob&runId=${encodeURIComponent(runId)}`,
                },
              ],
            },
          });
        }

        if (conversationId) {
          void apiCreateImobChatTelemetry({
            conversationId,
            event: "plan_to_execute_ms",
            value: Date.now() - executionPending.preparedAt,
            metadata: {
              runId,
              action: executionPending.plan.action,
              parentRunId: parentRunId ?? null,
              sessionRunId: sessionRunByThreadRef.current[executionPending.thread.id] ?? runId,
              threadId: executionPending.thread.id,
            },
          });
          void apiCreateImobChatTelemetry({
            conversationId,
            event: "chat_to_run_link_coverage",
            value: runId ? 1 : 0,
            metadata: {
              runId,
              hasCta: true,
              parentRunId: parentRunId ?? null,
              threadId: executionPending.thread.id,
            },
          });
        }
      } catch (error) {
        const message =
          error instanceof ApiError
            ? `${error.message} (${error.status})`
            : error instanceof Error
              ? error.message
              : "Falha na execução";
        setState("blocked");
        setActiveThread(executionPending.thread);
        const execBlockedMessage: ChatMessage = {
          id: makeId("assistant"),
          role: "assistant",
          text: "Esta etapa não foi concluída desta vez.",
          thread: {
            id: executionPending.thread.id,
            label: executionPending.thread.label,
            status: "blocked",
          },
          card: {
            type: "risk",
            title: "Precisa de atenção",
            thread: {
              id: executionPending.thread.id,
              label: executionPending.thread.label,
              status: "blocked",
            },
            lines: ["Posso tentar novamente ou seguir por outro caminho."],
            risk: {
              level: "high",
              reason: message,
            },
          },
        };
        updateMessageById(executionPending.messageId, {
          text: execBlockedMessage.text,
          thread: execBlockedMessage.thread,
          card: execBlockedMessage.card,
        });
        void persistMessage(execBlockedMessage);
      }
    },
    [contractInterviewState, conversationId, persistInterviewState, persistMessage, trackUxEvent, updateMessageById]
  );

  const handleConfirmExecution = async (message: ChatMessage) => {
    if (!pendingExecution) return;
    const messageThreadId = message.thread?.id ?? message.card?.thread?.id ?? null;
    if (!messageThreadId) return;
    if (pendingExecution.messageId !== message.id || pendingExecution.thread.id !== messageThreadId) return;
    await runExecutionFlow(pendingExecution, { trackConfirm: true });
  };

  const handleRejectExecution = (message: ChatMessage) => {
    if (!pendingExecution) return;
    const messageThreadId = message.thread?.id ?? message.card?.thread?.id ?? null;
    if (!messageThreadId) return;
    if (pendingExecution.messageId !== message.id || pendingExecution.thread.id !== messageThreadId) return;
    const rejectKey = `${conversationId ?? "none"}:${pendingExecution.thread.id}:${pendingExecution.plan.action}:awaiting_user_action`;
    if (rejectedExecutionKeysRef.current.has(rejectKey)) return;
    rejectedExecutionKeysRef.current.add(rejectKey);

    const currentThread = pendingExecution.thread ?? activeThread;
    const targetMessageId = pendingExecution.messageId;
    setRejectLockedMessageId(targetMessageId);
    setOpenOptionsMessageId(null);
    setPendingExecution(null);
    setActiveThread(null);
    setState("idle");
    trackUxEvent("execution_rejected", {
      threadId: currentThread?.id ?? null,
      messageId: targetMessageId,
      action: pendingExecution.plan.action,
    });
    const rejectedMessage: ChatMessage = {
      id: makeId("assistant"),
      role: "assistant",
      text: "Execução cancelada. Envie uma nova instrução para montar outro plano.",
      thread: currentThread
        ? {
            id: currentThread.id,
            label: currentThread.label,
            status: "blocked",
          }
        : undefined,
    };
    if (targetMessageId) {
      updateMessageById(targetMessageId, {
        text: rejectedMessage.text,
        thread: rejectedMessage.thread,
        card: rejectedMessage.card,
      });
    } else {
      appendMessage(rejectedMessage);
    }
    void persistMessage(rejectedMessage);
  };

  const exportConversation = async (format: "json" | "pdf") => {
    if (!conversationId) return;
    setExportingFormat(format);
    try {
      const payload = await apiGetImobChatConversationExport(conversationId);
      const exported = payload.export;
      const safeId = exported.conversation.conversationId.replace(/[^a-zA-Z0-9_-]/g, "");
      if (format === "json") {
        const jsonBlob = new Blob([JSON.stringify(exported, null, 2)], {
          type: "application/json;charset=utf-8",
        });
        const url = URL.createObjectURL(jsonBlob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `imob-chat-${safeId}-audit.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        return;
      }

      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const margin = 36;
      const lineH = 16;
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const maxW = pageW - margin * 2;
      let y = margin;

      const push = (text: string, size = 10, bold = false) => {
        doc.setFont("helvetica", bold ? "bold" : "normal");
        doc.setFontSize(size);
        const lines = doc.splitTextToSize(text, maxW) as string[];
        for (const line of lines) {
          if (y > pageH - margin) {
            doc.addPage();
            y = margin;
          }
          doc.text(line, margin, y);
          y += lineH;
        }
      };

      push("IMOB Chat Audit Export", 14, true);
      push(`Conversation: ${exported.conversation.title} (${exported.conversation.conversationId})`);
      push(`GeneratedAt: ${exported.generatedAt}`);
      push(`Tenant/Workspace: ${exported.tenantId} / ${exported.workspaceId}`);
      push(`Audit Hash (${exported.audit.hashAlgo}): ${exported.audit.hash}`);
      y += 6;
      push("Totals", 12, true);
      push(`message_to_plan_avg_ms: ${exported.telemetry.totals.messageToPlanAvgMs ?? "-"}`);
      push(`plan_to_execute_avg_ms: ${exported.telemetry.totals.planToExecuteAvgMs ?? "-"}`);
      push(`chat_to_run_coverage_pct: ${exported.telemetry.totals.chatToRunCoveragePct}`);
      push(`persist_success_rate_pct: ${exported.telemetry.totals.persistSuccessRatePct}`);
      y += 6;
      push("Threads", 12, true);
      if (!exported.threads.length) {
        push("nenhuma thread registrada");
      } else {
        for (const thread of exported.threads) {
          push(
            `${thread.label} (${thread.threadId}) • status=${thread.status} • msgs=${thread.messageCount}`
          );
        }
      }
      y += 6;
      push("Messages", 12, true);
      for (const msg of exported.messages) {
        push(`[${msg.createdAt}] ${msg.role.toUpperCase()}: ${msg.content}`);
        push(`intent=${msg.intent ?? "-"} action=${msg.action ?? "-"}`);
        push(`thread=${msg.threadLabel ?? "-"} (${msg.threadId ?? "-"}) status=${msg.threadStatus ?? "-"}`);
        push(`runId=${msg.runId ?? "-"} txId=${msg.txId ?? "-"}`);
        push(`receipt=${msg.receiptPath ?? "-"} bundle=${msg.bundlePath ?? "-"}`);
        y += 4;
      }

      doc.save(`imob-chat-${safeId}-audit.pdf`);
    } finally {
      setExportingFormat(null);
    }
  };

  const exportGeneratedContractPdf = React.useCallback(
    async (message: ChatMessage) => {
      const payload = message.card?.contract;
      if (!payload?.text) return;
      try {
        const { jsPDF } = await import("jspdf");
        const doc = new jsPDF({ unit: "pt", format: "a4" });
        const margin = 36;
        const lineH = 16;
        const pageW = doc.internal.pageSize.getWidth();
        const pageH = doc.internal.pageSize.getHeight();
        const maxW = pageW - margin * 2;
        let y = margin;

        const push = (text: string, size = 10, bold = false) => {
          doc.setFont("helvetica", bold ? "bold" : "normal");
          doc.setFontSize(size);
          const lines = doc.splitTextToSize(text, maxW) as string[];
          for (const line of lines) {
            if (y > pageH - margin) {
              doc.addPage();
              y = margin;
            }
            doc.text(line, margin, y);
            y += lineH;
          }
        };

        push(payload.title ?? `Contrato IMOB - ${payload.contractType ?? "N/A"}`, 14, true);
        push(`Tipo: ${payload.contractType ?? "N/A"}`);
        push(`Schema: ${payload.schemaVersion ?? "N/A"}`);
        push(`Base legal: ${payload.legalVersion ?? "N/A"}`);
        push(`Gerado em: ${payload.generatedAt ? new Date(payload.generatedAt).toLocaleString("pt-BR") : new Date().toLocaleString("pt-BR")}`);
        if (payload.hash) push(`Hash: ${payload.hash}`);
        y += 8;
        push(payload.text, 11, false);

        doc.save(buildContractPdfFileName(payload.contractType));
        trackUxEvent("contract_pdf_exported", {
          contractType: payload.contractType ?? null,
          schemaVersion: payload.schemaVersion ?? null,
        });
      } catch {
        const failedMessage: ChatMessage = {
          id: makeId("assistant"),
          role: "assistant",
          text: "Nao consegui exportar o PDF agora. Tente novamente em instantes.",
          thread: message.thread ?? message.card?.thread,
        };
        appendMessage(failedMessage);
        void persistMessage(failedMessage, {
          conversationId: conversationId ?? undefined,
          intent: "contract",
          action: "realestate.create_contract",
        });
      }
    },
    [appendMessage, conversationId, persistMessage, trackUxEvent]
  );

  const filteredConversations = conversations.filter((conversation) => {
    const search = conversationSearch.trim().toLowerCase();
    if (!search) return true;
    return (
      conversation.title.toLowerCase().includes(search) ||
      (conversation.lastMessagePreview ?? "").toLowerCase().includes(search)
    );
  });
  const visibleMessages = selectedThreadId
    ? messages.filter((message) => {
        const threadId = message.thread?.id ?? message.card?.thread?.id ?? null;
        return threadId === selectedThreadId;
      })
    : messages;
  const compactVisibleLimit = 34;
  const hiddenMessageCount = compactTimelineMode ? Math.max(0, visibleMessages.length - compactVisibleLimit) : 0;
  const renderedMessages = compactTimelineMode ? visibleMessages.slice(-compactVisibleLimit) : visibleMessages;
  const lastVisibleMessage = visibleMessages.length > 0 ? visibleMessages[visibleMessages.length - 1] : null;
  const activeThreadCount = threads.filter((item) => item.status === "active").length;
  const shouldShowThreadPanel = showThreadPanel || activeThreadCount > 1 || Boolean(selectedThreadId);
  const contractDraftLines = React.useMemo(() => {
    if (!contractInterviewState?.contractType) return [];
    const schema = CONTRACT_SCHEMAS[contractInterviewState.contractType];
    const lines = schema.fields
      .filter((step) => contractInterviewState.answers[step.id] !== undefined && contractInterviewState.answers[step.id] !== null)
      .map((step) => `${step.question.replace(/\?$/, "")}: ${String(contractInterviewState.answers[step.id])}`);
    return lines;
  }, [contractInterviewState]);
  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border border-white/10 bg-surface/70">
        <div className="grid min-h-[70vh] lg:h-[78vh] lg:max-h-[78vh] lg:grid-cols-[300px,1fr]">
          <aside className="flex h-full min-h-[70vh] flex-col border-b border-white/10 bg-black/30 p-3 lg:min-h-0 lg:border-b-0 lg:border-r">
            <div className="space-y-3 border-b border-white/10 pb-3">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => void handleNewConversation()}
                  className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm font-medium text-foreground transition hover:border-accent/40"
                >
                  + Nova conversa
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const next = !shouldShowThreadPanel;
                    setShowThreadPanel(next);
                    trackUxEvent(next ? "thread_panel_opened" : "thread_panel_hidden", { activeThreads: activeThreadCount });
                  }}
                  className="rounded-full border border-white/15 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-muted-foreground hover:border-white/30"
                >
                  {shouldShowThreadPanel ? "Ocultar operações" : "Ver operações"}
                </button>
              </div>

              <input
                value={conversationSearch}
                onChange={(event) => setConversationSearch(event.target.value)}
                placeholder="Buscar conversa..."
                className="w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-accent/40 focus:outline-none"
              />

              {conversationId && shouldShowThreadPanel ? (
                <div className="max-h-56 overflow-y-auto pr-1">
                  <ThreadPanel
                    threads={threads}
                    selectedThreadId={selectedThreadId}
                    onSelectThread={(thread) => {
                      if (pendingExecution && pendingExecution.thread.id !== thread.threadId) {
                        clearPendingExecution("thread_switched", { nextThreadId: thread.threadId });
                      }
                      setSelectedThreadId(thread.threadId);
                      setActiveThread({ id: thread.threadId, label: thread.label });
                      trackUxEvent("thread_selected", { threadId: thread.threadId, source: "shared_panel" });
                    }}
                    onClearSelection={() => {
                      if (pendingExecution) {
                        clearPendingExecution("thread_filter_cleared");
                      }
                      setSelectedThreadId(null);
                      setActiveThread(null);
                      trackUxEvent("thread_filter_cleared");
                    }}
                    resolveDashboardHref={(href, thread) => withDashboardContext(href, thread.threadId)}
                  />
                </div>
              ) : null}
            </div>

            <div className="mt-3 flex-1 space-y-1 overflow-y-auto pr-1">
              {filteredConversations.length === 0 ? (
                <p className="px-1 text-xs text-muted-foreground">Nenhuma conversa registrada.</p>
              ) : (
                filteredConversations.map((conversation) => {
                  const selected = conversation.conversationId === conversationId;
                  return (
                    <button
                      key={conversation.conversationId}
                      type="button"
                      onClick={() => void loadConversation(conversation.conversationId)}
                      className={`w-full rounded-lg px-3 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
                        selected ? "bg-accent/10 text-foreground" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                      }`}
                    >
                      <p className="truncate text-sm font-medium">{conversation.title}</p>
                      <p className="mt-1 truncate text-xs opacity-80">
                        {conversation.lastMessagePreview ?? "Sem mensagens ainda"}
                      </p>
                    </button>
                  );
                })
              )}
            </div>

            <div className="mt-3 border-t border-white/10 pt-3 text-xs text-muted-foreground">
              <div className="flex items-center justify-between">
                <Link to="/self-service" className="rounded-md px-2 py-1 hover:bg-white/5 hover:text-foreground">
                  Configurações e ajuda
                </Link>
                <Link to="/profile" className="rounded-md px-2 py-1 hover:bg-white/5 hover:text-foreground">
                  Perfil
                </Link>
              </div>
              <p className="mt-2 truncate text-[11px] text-foreground/90">
                {brandName} • {workspaceLabel}
              </p>
            </div>
          </aside>

          <article className="relative flex min-h-[70vh] flex-col lg:min-h-0">
            <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">Chat Operacional</p>
                <p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground/80">
                  {brandName} • {workspaceLabel}
                </p>
                {selectedThreadId ? (
                  <p className="mt-1 text-[11px] text-accent">
                    Thread ativa: {threads.find((t) => t.threadId === selectedThreadId)?.label ?? "Operação"}
                  </p>
                ) : null}
              </div>
              <span className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.2em] ${statusTone(state)}`}>
                {statusLabel(state)}
              </span>
            </header>
            {contractInterviewState?.contractType &&
            contractDraftLines.length > 0 &&
            (contractInterviewState.status === "review" ||
              contractInterviewState.status === "generating" ||
              contractInterviewState.status === "generated") ? (
              <div className="border-b border-white/10 bg-black/20 px-4 py-2 sm:px-6">
                <p className="text-[10px] uppercase tracking-[0.2em] text-accent">
                  Rascunho de contrato • {getContractTypeLabel(contractInterviewState.contractType)}
                </p>
                <div className="mt-1 max-h-16 space-y-0.5 overflow-y-auto pr-1 text-[11px] text-muted-foreground">
                  {contractDraftLines.slice(-8).map((line, idx) => (
                    <p key={`draft-${idx}`} className="truncate">{line}</p>
                  ))}
                </div>
                {contractInterviewState.status === "review" ? (
                  <div className="mt-2 flex flex-col gap-2 border-t border-white/10 pt-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <select
                        value={draftEditFieldId}
                        onChange={(event) => setDraftEditFieldId(event.target.value)}
                        className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/30 px-2 py-1 text-xs text-foreground focus:border-accent/40 focus:outline-none"
                      >
                        {contractEditableFields.map((field) => (
                          <option key={`draft-field-${field.id}`} value={field.id}>
                            {field.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => void handleDraftEditFromPanel()}
                        disabled={reviewActionLoading !== null || !draftEditFieldId}
                        className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-foreground transition hover:border-accent/40 disabled:opacity-50"
                      >
                        Editar
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleDraftDeclineFromPanel()}
                        disabled={reviewActionLoading !== null}
                        className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-foreground transition hover:border-rose-300/40 disabled:opacity-50"
                      >
                        Nao gerar
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDraftConfirmFromPanel()}
                        disabled={reviewActionLoading !== null}
                        className="rounded-full border border-accent/40 bg-accent/15 px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-accent transition hover:bg-accent/25 disabled:opacity-50"
                      >
                        Confirmar e gerar
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div
              ref={listRef}
              onScroll={(event) => {
                const container = event.currentTarget;
                const distanceToBottom = container.scrollHeight - (container.scrollTop + container.clientHeight);
                const nearBottom = distanceToBottom < 56;
                setIsNearBottom(nearBottom);
                if (nearBottom) setShowJumpToLatest(false);
              }}
              className="flex-1 space-y-3 overflow-y-auto px-4 py-3 sm:px-6 sm:py-4"
            >
              {hiddenMessageCount > 0 ? (
                <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                  <p className="text-[11px] text-muted-foreground">
                    Mostrando {compactVisibleLimit} de {visibleMessages.length} mensagens.
                  </p>
                  <button
                    type="button"
                    onClick={() => setCompactTimelineMode(false)}
                    className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px] uppercase tracking-[0.15em] text-foreground hover:border-accent/40"
                  >
                    Ver histórico completo
                  </button>
                </div>
              ) : null}
              {!compactTimelineMode && visibleMessages.length > compactVisibleLimit ? (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setCompactTimelineMode(true)}
                    className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px] uppercase tracking-[0.15em] text-foreground hover:border-accent/40"
                  >
                    Voltar ao modo compacto
                  </button>
                </div>
              ) : null}
              {historyLoading ? (
                <p className="text-sm text-muted-foreground">Carregando histórico da conversa...</p>
              ) : visibleMessages.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-black/15 p-4">
                  <p className="text-sm text-foreground">
                    {selectedThreadId ? "Sem mensagens nesta thread." : "Comece descrevendo uma operação imobiliária."}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {selectedThreadId
                      ? "Selecione outra thread ou remova o filtro para ver toda a conversa."
                      : "Exemplo: \"Tenho um proprietário com apartamento em Itapema\"."}
                  </p>
                </div>
              ) : null}
              {!historyLoading && hasMoreHistory && !selectedThreadId ? (
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => void handleLoadOlder()}
                    disabled={historyLoadingMore}
                    className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-foreground transition hover:border-accent/40 disabled:opacity-50"
                  >
                    {historyLoadingMore ? "Carregando..." : "Carregar anteriores"}
                  </button>
                </div>
              ) : null}

              {renderedMessages.map((message, index) => {
                const isUser = message.role === "user";
                const messageThread = message.thread ?? message.card?.thread;
                const prevMessageThread = index > 0 ? renderedMessages[index - 1]?.thread ?? renderedMessages[index - 1]?.card?.thread : null;
                const showThreadPill = Boolean(messageThread?.id && messageThread.id !== prevMessageThread?.id);
                const threadTone =
                  messageThread?.status === "blocked"
                    ? "border-rose-300/40 bg-rose-500/10 text-rose-200"
                    : messageThread?.status === "done"
                      ? "border-emerald-300/40 bg-emerald-500/10 text-emerald-200"
                      : "border-accent/40 bg-accent/10 text-accent";
                return (
                  <div key={message.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[94%] space-y-1.5 sm:max-w-[82%] ${isUser ? "items-end" : "items-start"}`}>
                      {showThreadPill ? (
                        <div className={`inline-flex rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.16em] ${threadTone}`}>
                          {messageThread?.label}
                        </div>
                      ) : null}
                      <div
                        className={`rounded-2xl border px-4 py-3 text-sm ${
                          isUser
                            ? "border-accent/35 bg-accent/15 text-foreground"
                            : "border-white/10 bg-black/20 text-foreground"
                        } transition`}
                      >
                        <p className="whitespace-pre-wrap">{message.text}</p>

                        {message.card &&
                        message.card.type === "queue" &&
                        !(message.card.type === "action" && message.card.compactConfirm) ? (
                          <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] text-muted-foreground">
                            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                            <span className="font-medium text-foreground">
                              {message.card.title || "Em andamento"}...
                            </span>
                            {message.card.lines?.[0] &&
                            !isCardLeadRedundant(message.text, message.card?.title ?? "", message.card.lines[0]) ? (
                              <span className="hidden sm:inline">• {message.card.lines[0]}</span>
                            ) : null}
                          </div>
                        ) : null}

                        {message.card &&
                        message.card.type !== "queue" &&
                        !(message.card.type === "action" && message.card.compactConfirm) ? (
                          <div className="mt-3 rounded-xl border border-white/10 bg-surface/50 p-3">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">{message.card.title}</p>
                              {message.card.type !== "action" ? (
                                <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                                  {getCardTypeChip(message.card.type)}
                                </span>
                              ) : null}
                            </div>

                            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                              {message.card.lines
                                .filter((line, idx) => {
                                  if (idx !== 0) return true;
                                  return !isCardLeadRedundant(message.text, message.card?.title ?? "", line);
                                })
                                .map((line, idx) => (
                                <li key={`${message.id}-line-${idx}`}>{line}</li>
                                ))}
                            </ul>

                            {SHOW_TECHNICAL_CHAT && message.card.risk ? (
                              <div className="mt-3 rounded-lg border border-white/10 bg-surface/40 p-2">
                                <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Risco</p>
                                <p className="mt-1 text-xs text-foreground">
                                  Nível: <span className="uppercase">{message.card.risk.level}</span>
                                  {typeof message.card.risk.trustScore === "number"
                                    ? ` • Trust min ${message.card.risk.trustScore}`
                                    : ""}
                                </p>
                                {message.card.risk.reason ? (
                                  <p className="mt-1 text-xs text-muted-foreground">{message.card.risk.reason}</p>
                                ) : null}
                              </div>
                            ) : null}

                            {SHOW_TECHNICAL_CHAT && message.card.queue ? (
                              <div className="mt-3 rounded-lg border border-white/10 bg-surface/40 p-2">
                                <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Fila</p>
                                <p className="mt-1 text-xs text-foreground">
                                  Status: {message.card.queue.status ?? "—"} • Step: {message.card.queue.step ?? "—"}
                                </p>
                              </div>
                            ) : null}

                            {SHOW_TECHNICAL_CHAT && message.card.proof ? (
                              <div className="mt-3 rounded-lg border border-white/10 bg-surface/40 p-2">
                                <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Bloco de prova</p>
                                <p className="mt-1 text-xs text-foreground">txId: {message.card.proof.txId ?? "pendente"}</p>
                                <p className="mt-1 text-xs text-foreground">
                                  receipt: {message.card.proof.receiptPath ?? "não disponível"}
                                </p>
                                <p className="mt-1 text-xs text-foreground">
                                  bundle: {message.card.proof.bundlePath ?? "não disponível"}
                                </p>
                              </div>
                            ) : null}

                            {SHOW_TECHNICAL_CHAT &&
                            message.card.runId &&
                            !message.card.ctas?.some((cta) => cta.href?.includes("/app/runs")) ? (
                              <div className="mt-3 flex flex-wrap gap-2">
                                <Link
                                  to={`/app/runs?domain=imob&runId=${encodeURIComponent(message.card.runId)}`}
                                  className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-foreground hover:border-accent/40"
                                >
                                  Ver execução
                                </Link>
                              </div>
                            ) : null}

                            {message.card.showConfirm &&
                            pendingExecution &&
                            pendingExecution.messageId === message.id &&
                            pendingExecution.thread.id === (message.thread?.id ?? message.card?.thread?.id) ? (
                              <p className="mt-3 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                                Aguardando sua decisão para seguir.
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                      </div>

                      <div className={`flex flex-wrap items-center gap-2 px-1 text-[10px] uppercase tracking-[0.15em] text-muted-foreground/80 ${isUser ? "justify-end" : "justify-start"}`}>
                        {message.role === "assistant" && message.card?.ctas?.length ? (
                          <>
                            {(() => {
                              const messageThreadId = message.thread?.id ?? message.card?.thread?.id ?? null;
                              const isPendingTarget =
                                Boolean(pendingExecution) &&
                                pendingExecution?.messageId === message.id &&
                                pendingExecution?.thread.id === messageThreadId;
                              const actionableCtas = normalizeCardCtas(message.card.ctas)?.filter((cta) => {
                                if (!cta.action) return true;
                                if (cta.action === "export_contract_pdf") return true;
                                return isPendingTarget;
                              }) ?? [];
                              if (actionableCtas.length === 0) return null;
                              const primary = actionableCtas[0];
                              const secondary = actionableCtas.slice(1);
                              const isRejectLocked = rejectLockedMessageId === message.id;
                              const renderCta = (cta: CardCta) =>
                                cta.href ? (
                                  isExternalHref(cta.href) ? (
                                    <a
                                      key={`${message.id}-footer-cta-${cta.id}`}
                                      href={cta.href}
                                      target="_blank"
                                      rel="noreferrer"
                                      onClick={() => setOpenOptionsMessageId(null)}
                                      className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.2em] ${getCtaClass(cta.kind)}`}
                                    >
                                      {cta.label}
                                    </a>
                                  ) : (
                                    <Link
                                      key={`${message.id}-footer-cta-${cta.id}`}
                                      to={withDashboardContext(cta.href, messageThreadId)}
                                      onClick={() => setOpenOptionsMessageId(null)}
                                      className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.2em] ${getCtaClass(cta.kind)}`}
                                    >
                                      {cta.label}
                                    </Link>
                                  )
                                ) : (
                                  <button
                                    key={`${message.id}-footer-cta-${cta.id}`}
                                    type="button"
                                    onClick={() => {
                                      if (cta.action === "confirm_execution") {
                                        void handleConfirmExecution(message);
                                        return;
                                      }
                                      if (cta.action === "reject_execution") {
                                        handleRejectExecution(message);
                                        return;
                                      }
                                      if (cta.action === "export_contract_pdf") {
                                        void exportGeneratedContractPdf(message);
                                      }
                                    }}
                                    disabled={cta.action === "reject_execution" && isRejectLocked}
                                    className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.2em] ${getCtaClass(cta.kind)}`}
                                  >
                                    {cta.label}
                                  </button>
                                );
                              return (
                                <>
                                  {renderCta(primary)}
                                  {secondary.length > 0 ? (
                                    message.card?.showConfirm ? (
                                      <>{secondary.map((cta) => renderCta(cta))}</>
                                    ) : (
                                      <details
                                        className="group relative"
                                        open={openOptionsMessageId === message.id}
                                        onToggle={(event) => {
                                          if (event.currentTarget.open) {
                                            setOpenOptionsMessageId(message.id);
                                          } else {
                                            setOpenOptionsMessageId((prev) => (prev === message.id ? null : prev));
                                          }
                                        }}
                                      >
                                        <summary className="cursor-pointer list-none rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-foreground hover:border-accent/40">
                                          Ver opções
                                        </summary>
                                        <div className="absolute left-0 top-8 z-20 min-w-[180px] rounded-xl border border-white/10 bg-surface/95 p-2 shadow-xl backdrop-blur">
                                          <div className="flex flex-col gap-1">{secondary.map((cta) => renderCta(cta))}</div>
                                        </div>
                                      </details>
                                    )
                                  ) : null}
                                </>
                              );
                            })()}
                          </>
                        ) : null}

                        {message.role === "assistant" && message.card?.proof ? (
                          <details className="w-full rounded-lg border border-white/10 bg-black/15 p-2">
                            <summary className="cursor-pointer list-none text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                              Ver detalhes
                            </summary>
                            <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                              <p>Recibo e histórico desta etapa estão registrados.</p>
                              {message.card.proof.receiptPath ? <p className="truncate">Recibo: {message.card.proof.receiptPath}</p> : null}
                              {message.card.proof.bundlePath ? <p className="truncate">Dossiê: {message.card.proof.bundlePath}</p> : null}
                            </div>
                          </details>
                        ) : null}

                      </div>
                    </div>
                  </div>
                );
              })}

              {lastVisibleMessage ? (
                <div className="flex items-center gap-2 px-1 text-[10px] uppercase tracking-[0.15em] text-muted-foreground/80">
                  <button
                    type="button"
                    onClick={() => {
                      if (navigator?.clipboard?.writeText) {
                        void navigator.clipboard.writeText(lastVisibleMessage.text);
                      }
                    }}
                    aria-label="Copiar mensagem"
                    title="Copiar mensagem"
                    className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/15 bg-white/5 hover:border-white/30"
                  >
                    ⧉
                  </button>
                  {lastVisibleMessage.role === "assistant" ? (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          setMessageFeedback((prev) => ({ ...prev, [lastVisibleMessage.id]: "up" }))
                        }
                        aria-label="Resposta útil"
                        title="Resposta útil"
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-full border hover:border-white/30 ${
                          messageFeedback[lastVisibleMessage.id] === "up"
                            ? "border-emerald-300/40 text-emerald-200"
                            : "border-white/15 bg-white/5"
                        }`}
                      >
                        👍
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setMessageFeedback((prev) => ({ ...prev, [lastVisibleMessage.id]: "down" }))
                        }
                        aria-label="Resposta não útil"
                        title="Resposta não útil"
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-full border hover:border-white/30 ${
                          messageFeedback[lastVisibleMessage.id] === "down"
                            ? "border-rose-300/40 text-rose-200"
                            : "border-white/15 bg-white/5"
                        }`}
                      >
                        👎
                      </button>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>

            {showJumpToLatest ? (
              <div className="pointer-events-none absolute bottom-24 right-4 z-20 sm:right-6">
                <button
                  type="button"
                  onClick={() => {
                    const container = listRef.current;
                    if (container) container.scrollTop = container.scrollHeight;
                    setIsNearBottom(true);
                    setShowJumpToLatest(false);
                  }}
                  className="pointer-events-auto rounded-full border border-accent/50 bg-accent/20 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-accent transition hover:bg-accent/30"
                >
                  Voltar ao final
                </button>
              </div>
            ) : null}

            <div className="sticky bottom-0 z-20 border-t border-white/10 bg-black/40 px-4 py-3 backdrop-blur sm:px-6">
              {messages.length === 0 ? (
                <div className="mb-3 flex flex-wrap gap-2">
                  {QUICK_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => setInput(prompt)}
                      className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground hover:border-accent/40"
                    >
                      {prompt.length > 34 ? `${prompt.slice(0, 34)}...` : prompt}
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="flex items-end gap-2 rounded-2xl border border-white/10 bg-surface/80 p-2 backdrop-blur">
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void handleSend();
                    }
                  }}
                  placeholder="Descreva uma operação imobiliária..."
                  rows={1}
                  className="max-h-40 min-h-[46px] w-full resize-y rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
                />
                <button
                  type="button"
                  onClick={() => void handleSend()}
                  disabled={state === "typing" || state === "executing"}
                  className="h-[46px] shrink-0 rounded-xl border border-accent/50 bg-accent/20 px-4 text-xs font-semibold uppercase tracking-[0.2em] text-accent transition hover:bg-accent/30 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {state === "typing" || state === "executing" ? "Enviando..." : "Enviar"}
                </button>
              </div>
            </div>
          </article>
        </div>
      </section>

    </div>
  );
};

export default ImobChatPage;
