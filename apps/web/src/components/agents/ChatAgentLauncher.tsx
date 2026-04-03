import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { selfServiceConfigs } from "@/pages/self-service/config";
import {
  apiApproveRun,
  apiAdoptRecommendation,
  apiCreateSession,
  apiFinalizeConversation,
  apiGetBillingReconciliationSummary,
  apiGetGovernanceReport,
  apiGetQuota,
  apiGetRunCostBreakdown,
  apiGetTenantBillingSummary,
  apiListAgents,
  apiUploadDocuments,
  apiCreateHelpdeskSession,
  apiGetRun,
  apiListRunEvents,
  BASE_URL,
  type Agent,
  type RunEvent,
  type TenantBillingSummary,
  type UploadedDocumentInfo,
} from "@/lib/api";
import {
  buildLauncherDecisionTelemetry,
  buildLauncherHelpdeskSessionPayload,
  createLauncherExecutionSnapshot,
  buildInputPlaceholderForContext,
  createPresentationSnapshotV1,
  detectLauncherRouteIntent,
  enrichLegacyAssistantContent,
  normalizeLauncherPersistedIntentResult,
  prepareLauncherRunExecution,
  type EiahMode,
  resolveLauncherEiahUnifiedMode,
  resolveLauncherRunSummarySnapshot,
  selectLauncherAgentContract,
  type LegacyEnrichmentIntent,
  resolveAttachmentIntake,
  resolveLauncherTurnDecision,
} from "@/components/agents/chatLauncherEngine";
import {
  resolveSnapshotCompatibleRouteIntent,
  resolveSnapshotInputPlaceholder,
  resolveSnapshotQuickReplies,
  type MessagePresentationSnapshot,
} from "@/components/agents/chatPresentationSnapshot";
import { extractDocAndRecs, type ExtractedRec } from "@/utils";
import { useSession } from "@/state/sessionStore";
import { useAgentExecution } from "@/hooks/useAgentExecution";
import {
  useConversation,
  type ConversationStatus,
  type ConversationPolicy,
  type IntentResult,
} from "@/hooks/useConversation";
import { ContextualCostPanel } from "@/components/billing/ContextualCostPanel";

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  status?: "streaming" | "done";
  runId?: string;
  presentationSnapshot?: MessagePresentationSnapshot;
};

type ThreadSnapshot = {
  messages: ChatMessage[];
  runId: string | null;
};

type RunFinanceSummary = {
  amountCents: number;
  estimatedAmountCents: number | null;
  tokens: number;
  issueLabel: string;
  hasGap: boolean;
};

type WorkspaceBillingContext = {
  workspaceCostCents: number;
  workspaceRuns: number;
  quotaPercent: number;
  monthUsageCents: number;
  softLimitCents: number;
  hardLimitCents: number;
};

function normalizeAgentKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function isHelpCenterAgent(params: { id?: string | null; slug?: string | null; title?: string | null }) {
  const id = normalizeAgentKey(String(params.id ?? ""));
  const slug = normalizeAgentKey(String(params.slug ?? ""));
  const titleRaw = String(params.title ?? "").toLowerCase();
  const title = normalizeAgentKey(titleRaw);
  if (id === "eiah" || slug === "eiah") return true;
  if (title.includes("centraldeajuda") || titleRaw.includes("central de ajuda")) return true;
  if (slug.includes("help") || id.includes("help") || title.includes("help")) return true;
  return false;
}

function isUnifiedEiahAgent(params: { id?: string | null; slug?: string | null; title?: string | null }) {
  const id = normalizeAgentKey(String(params.id ?? ""));
  const slug = normalizeAgentKey(String(params.slug ?? ""));
  const title = normalizeAgentKey(String(params.title ?? ""));
  return id === "eiah" || slug === "eiah" || title === "eiahcore" || title === "eiah";
}

function getCatalogAgentDisplayName(agent: { id?: string; name?: string }) {
  const normalizedId = (agent.id ?? "").trim().toLowerCase();
  const normalizedName = (agent.name ?? "").trim().toLowerCase();
  if (normalizedId === "eiah" || normalizedName === "eiah core") {
    return "EIAH";
  }
  return agent.name?.trim() || agent.id?.trim() || "Agente";
}

export type LedgerEvent = {
  id: string;
  runId?: string;
  label: string;
  detail: string;
};

type GovernanceItem = {
  id: string;
  runId: string;
  agent: string | null;
  type: string;
  createdAt: string;
  ledgerHash: string | null;
  payload: {
    key: string | null;
    tatica: string | null;
    adopted: boolean | null;
    approvedBy: string | null;
    approvedAt: string | null;
    document?: string | null;
    runIds?: string[] | null;
  };
};

const baseLedger = (): LedgerEvent[] => [];
const FALLBACK_AGENT = {
  id: "EIAH",
  slug: "curator",
  title: "EIAH",
  description: "",
};

const CHAT_ROLLOUT_STAGE = (
  typeof import.meta.env.VITE_CHAT_ROLLOUT_STAGE === "string" &&
  import.meta.env.VITE_CHAT_ROLLOUT_STAGE.trim().length > 0
    ? import.meta.env.VITE_CHAT_ROLLOUT_STAGE.trim().toLowerCase()
    : "shadow"
) as "shadow" | "pilot" | "small";

function formatLedgerDetail(payload?: RunEvent["payload"]) {
  if (!payload || typeof payload !== "object") return "event recebido";
  const record = payload as Record<string, unknown>;
  const parts: string[] = [];
  if (record.stepId) parts.push(`step: ${String(record.stepId)}`);
  if (record.action) parts.push(`action: ${String(record.action)}`);
  if (record.status) parts.push(`status: ${String(record.status)}`);
  if (record.reason) parts.push(`reason: ${String(record.reason)}`);
  if (record.error) parts.push(`error: ${String(record.error)}`);
  if (record.description) parts.push(String(record.description));
  return parts.length > 0 ? parts.join(" • ") : "event recebido";
}

function eventToAssistantMessage(event: RunEvent) {
  const payload = event.payload as Record<string, unknown> | undefined;
  if (event.type === "run.action.result" && payload?.status === "error") {
    return `Falha na ação: ${String(payload?.error ?? "erro desconhecido")}.`;
  }
  return null;
}

function formatResultPreview(result: unknown): string | null {
  if (!result) return null;
  let parsed: any = result;
  if (typeof result === "string") {
    const trimmed = result.trim();
    if (!trimmed) return null;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      const recommendationLines: string[] = [];
      const blockRegex = /"tatica"\s*:\s*"([^"]+)"[\s\S]*?"prioridade"\s*:\s*([0-9.]+)/gi;
      let match: RegExpExecArray | null;
      while ((match = blockRegex.exec(trimmed)) !== null) {
        recommendationLines.push(`- ${match[1]} (prioridade: ${match[2]})`);
      }
      if (recommendationLines.length > 0) {
        return `Resultado:\nRecomendações:\n${recommendationLines.join("\n")}`;
      }
      return `Resultado:\n${trimmed}`;
    }
  }

  if (parsed && typeof parsed === "object") {
    const recommendations = parsed.recomendacoes;
    if (Array.isArray(recommendations) && recommendations.length > 0) {
      const lines = recommendations.map((item: any, index: number) => {
        const title = item?.tatica ?? item?.titulo ?? item?.title ?? item?.key ?? `Item ${index + 1}`;
        const priority = item?.prioridade ?? item?.priority ?? "—";
        return `- ${String(title)} (prioridade: ${String(priority)})`;
      });
      return `Resultado:\nRecomendações:\n${lines.join("\n")}`;
    }
    if (typeof parsed.message === "string") {
      return `Resultado:\n${parsed.message}`;
    }
    if (typeof parsed.summary === "string") {
      return `Resultado:\n${parsed.summary}`;
    }
    return `Resultado:\n${JSON.stringify(parsed, null, 2)}`;
  }

  return `Resultado:\n${String(result)}`;
}

function normalizeIntentText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function sanitizeAssistantContent(content: string) {
  return content
    .replace(/\"run_id\"\s*:\s*\"[^\"]+\"/gi, "\"run_id\":\"[redacted]\"")
    .replace(/\"trace_id\"\s*:\s*\"[^\"]+\"/gi, "\"trace_id\":\"[redacted]\"")
    .replace(/\"tx_id\"\s*:\s*\"[^\"]+\"/gi, "\"tx_id\":\"[redacted]\"")
    .replace(/\"policy_version\"\s*:\s*\"[^\"]+\"/gi, "\"policy_version\":\"[redacted]\"")
    .replace(/\brun_id:\s*[^\s,]+/gi, "run_id:[redacted]")
    .replace(/\btrace_id:\s*[^\s,]+/gi, "trace_id:[redacted]")
    .replace(/\btx_id:\s*[^\s,]+/gi, "tx_id:[redacted]")
    .replace(/\bpolicy_version:\s*[^\s,]+/gi, "policy_version:[redacted]");
}

function formatReconciliationIssue(issue: string) {
  if (issue === "missing_breakdown") return "Sem breakdown";
  if (issue === "missing_ledger") return "Sem ledger";
  if (issue === "run_vs_breakdown_mismatch") return "Run divergente";
  if (issue === "breakdown_vs_ledger_mismatch") return "Ledger divergente";
  return issue || "—";
}

function formatCurrencyCents(amountCents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format((amountCents ?? 0) / 100);
}

type HelpStructuredResponse = {
  mode: "help";
  summary: string;
  steps?: string[];
  sources: string[];
};

type ProposalStructuredResponse = {
  mode: "proposal";
  scenario: string;
  recommended_plan: "solo" | "starter" | "growth" | "scale" | "enterprise";
  estimated_cost: string;
  next_step: string;
};

function tryParseJsonObject(content: string): Record<string, unknown> | null {
  const trimmed = content.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function isHelpStructuredResponse(input: Record<string, unknown>): input is HelpStructuredResponse {
  return (
    input.mode === "help" &&
    typeof input.summary === "string" &&
    (input.steps === undefined || (Array.isArray(input.steps) && input.steps.every((v) => typeof v === "string"))) &&
    Array.isArray(input.sources) &&
    input.sources.every((v) => typeof v === "string")
  );
}

function isProposalStructuredResponse(input: Record<string, unknown>): input is ProposalStructuredResponse {
  const plan = input.recommended_plan;
  return (
    input.mode === "proposal" &&
    typeof input.scenario === "string" &&
    (plan === "solo" || plan === "starter" || plan === "growth" || plan === "scale" || plan === "enterprise") &&
    typeof input.estimated_cost === "string" &&
    typeof input.next_step === "string"
  );
}

function fallbackHelpMarkdown() {
  return [
    "**Resumo**",
    "Não consegui montar uma resposta útil com clareza para esse pedido.",
    "",
    "Se quiser, você pode me pedir de um destes jeitos:",
    "- `como usar o IMOB`",
    "- `como criar um run`",
    "- `quais agentes posso usar`",
    "- `como funciona o billing`",
  ].join("\n");
}

function toMarkdownFromStructuredResponse(
  raw: string,
  modeHint: IntentResult["intent"] | null
): { content: string; rejected: boolean; fallbackUsed: boolean } {
  const divider = "\n---\n";
  if (raw.includes(divider)) {
    const humanPart = raw.split(divider).slice(1).join(divider).trim();
    if (humanPart) {
      return { content: humanPart, rejected: false, fallbackUsed: false };
    }
  }
  const parsed = tryParseJsonObject(raw);
  if (!parsed) return { content: raw, rejected: false, fallbackUsed: false };

  if (modeHint === "help" || modeHint === "product_explain" || modeHint === "unknown") {
    if (isHelpStructuredResponse(parsed)) {
      const steps =
        parsed.steps && parsed.steps.length > 0
          ? `\n\n**Como fazer**\n${parsed.steps.map((step) => `- ${step}`).join("\n")}`
          : "";
      const sources =
        parsed.sources.length > 0
          ? `\n\n**Base usada**\n${parsed.sources
              .slice(0, 2)
              .map((source) => `- ${source}`)
              .join("\n")}`
          : "";
      return {
        content: `**Resumo**\n${parsed.summary}${steps}${sources}`,
        rejected: false,
        fallbackUsed: false,
      };
    }
    return { content: fallbackHelpMarkdown(), rejected: true, fallbackUsed: true };
  }

  if (modeHint === "proposal") {
    if (isProposalStructuredResponse(parsed)) {
      return {
        content: [
          `**Cenario**\n${parsed.scenario}`,
          `**Plano recomendado**\n${parsed.recommended_plan}`,
          `**Estimativa**\n${parsed.estimated_cost}`,
          `**Proximo passo**\n${parsed.next_step}`,
        ].join("\n\n"),
        rejected: false,
        fallbackUsed: false,
      };
    }
    return { content: fallbackHelpMarkdown(), rejected: true, fallbackUsed: true };
  }

  return { content: raw, rejected: false, fallbackUsed: false };
}

function buildLegacyMarkdownFromStructuredContent(params: {
  docMarkdown: string;
  recs: ExtractedRec[];
}) {
  const text = params.docMarkdown?.trim() ?? "";
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const paragraph =
    lines.find(
      (line) =>
        line.length > 0 &&
        !line.startsWith("#") &&
        !line.startsWith("-") &&
        !line.startsWith("•") &&
        !/^\d+\./.test(line)
    ) ??
    params.recs[0]?.rationale ??
    params.recs[0]?.tatica ??
    "";

  const bullets = lines
    .filter((line) => line.startsWith("- ") || line.startsWith("• "))
    .map((line) => line.replace(/^[-•]\s*/, ""))
    .slice(0, 4);

  const nextStepsRaw = params.recs[0]?.proximos_passos ?? "";
  const nextStepsFromText = lines.find((line) => line.toLowerCase().includes("próximos passos"));
  const nextStepsSource =
    typeof nextStepsRaw === "string" && nextStepsRaw.trim()
      ? nextStepsRaw
      : nextStepsFromText ?? "";

  const nextSteps = nextStepsSource
    ? nextStepsSource
        .split(/\d+\.\s+|;\s+/)
        .map((step) => step.trim())
        .filter(Boolean)
        .slice(0, 4)
    : [];

  const bulletsBlock =
    bullets.length > 0 ? `\n\n**Pontos-chave**\n${bullets.map((bullet) => `- ${bullet}`).join("\n")}` : "";
  const nextStepsBlock =
    nextSteps.length > 0 ? `\n\n**Próximos passos**\n${nextSteps.map((step) => `- ${step}`).join("\n")}` : "";

  return `${paragraph || "Resposta disponivel sem resumo estruturado."}${bulletsBlock}${nextStepsBlock}`;
}

function buildRenderableAssistantMarkdown(params: {
  messageContent: string;
  docMarkdown: string;
  technicalRaw: string;
  recs: ExtractedRec[];
  isHelpCenterMode: boolean;
  agentProfile: Agent | null;
  routeIntent: "proposal" | "imob" | "playbook" | "help" | "orchestrator";
  intentResult: LegacyEnrichmentIntent;
  runId?: string | null;
  presentationSnapshot?: MessagePresentationSnapshot | null;
}) {
  const content = params.isHelpCenterMode
    ? (params.docMarkdown ?? "").trim() ||
      sanitizeAssistantContent(params.messageContent).trim() ||
      params.technicalRaw.trim() ||
      "Ainda não encontrei conteúdo documental para essa pergunta."
    : buildLegacyMarkdownFromStructuredContent({
        docMarkdown: params.docMarkdown ?? "",
        recs: params.recs,
      });

  return enrichLegacyAssistantContent({
    content,
    agentProfile: params.agentProfile,
    routeIntent: params.routeIntent,
    intentResult: params.intentResult,
    runId: params.runId,
    presentationSnapshot: params.presentationSnapshot,
  });
}

function maskIdentity(value: string, fallbackPrefix: string) {
  const trimmed = value.trim();
  if (!trimmed) return `${fallbackPrefix}_…`;
  const prefix = `${fallbackPrefix}_`;
  if (trimmed.startsWith(prefix)) {
    if (trimmed.length <= prefix.length + 2) return `${prefix}…`;
    return `${trimmed.slice(0, prefix.length + 2)}…${trimmed.slice(-4)}`;
  }
  return `${prefix}…${trimmed.slice(-4)}`;
}

export default function ChatAgentLauncher({
  activeAgentId,
  onLedgerChange,
  onRunIdChange,
  onSseStatusChange,
  onPolicyChange,
  onPlaybookClick,
  headerControls,
  workspaceId,
  launcherContext,
}: {
  activeAgentId?: string;
  onLedgerChange?: (ledger: LedgerEvent[]) => void;
  onRunIdChange?: (runId: string | null) => void;
  onSseStatusChange?: (status: "idle" | "connecting" | "live" | "polling" | "error") => void;
  onPolicyChange?: (state: {
    intent: string | null;
    policy: ConversationPolicy | null;
    status: ConversationStatus;
  }) => void;
  onPlaybookClick?: () => void;
  headerControls?: React.ReactNode;
  workspaceId?: string;
  launcherContext?: {
    topic?: string | null;
    planHint?: string | null;
  };
}) {
  const agents = useMemo(
    () =>
      selfServiceConfigs.map((agent) => ({
        id: agent.agentId,
        slug: agent.slug,
        title: agent.title,
        description: agent.description,
      })),
    []
  );
  const [activeAgent, setActiveAgent] = useState(agents[0]);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [ledger, setLedger] = useState<LedgerEvent[]>(baseLedger());
  const [isStreaming, setIsStreaming] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [sseStatus, setSseStatus] = useState<"idle" | "connecting" | "live" | "polling" | "error">("idle");
  const [evidenceEvent, setEvidenceEvent] = useState<RunEvent | null>(null);
  const [identityShown, setIdentityShown] = useState(false);
  const [showIdentityDetails] = useState(false);
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const [showGovernanceReport, setShowGovernanceReport] = useState(false);
  const [governanceItems, setGovernanceItems] = useState<GovernanceItem[]>([]);
  const [governanceLoading, setGovernanceLoading] = useState(false);
  const [governanceError, setGovernanceError] = useState<string | null>(null);
  const [conversationFinalizing, setConversationFinalizing] = useState(false);
  const [lastRouteIntent, setLastRouteIntent] = useState<"proposal" | "imob" | "playbook" | "help" | "orchestrator" | null>(null);
  const [catalogAgents, setCatalogAgents] = useState<Agent[]>([]);
  const [selectedAgentLabel, setSelectedAgentLabel] = useState<string | null>(null);
  const [selectedCatalogAgent, setSelectedCatalogAgent] = useState<Agent | null>(null);
  const [runFinanceByRunId, setRunFinanceByRunId] = useState<Record<string, RunFinanceSummary>>({});
  const [workspaceBillingContext, setWorkspaceBillingContext] = useState<WorkspaceBillingContext | null>(null);
  const [attachmentMode, setAttachmentMode] = useState<"upload_file" | "paste_text">("upload_file");
  const [pastedArtifactText, setPastedArtifactText] = useState("");
  const [selectedAttachment, setSelectedAttachment] = useState<File | null>(null);
  const [attachmentDocumentType, setAttachmentDocumentType] = useState("contract");
  const [attachmentAnalysisMode, setAttachmentAnalysisMode] = useState("full_review");
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [attachmentUploadError, setAttachmentUploadError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  const seenEventsRef = useRef<Set<string>>(new Set());
  const lastEventIdRef = useRef<string | null>(null);
  const runSummaryLoadedRef = useRef<string | null>(null);
  const runPromptRef = useRef<Record<string, string>>({});
  const runIntentRef = useRef<Record<string, IntentResult>>({});
  const runPresentationRef = useRef<Record<string, MessagePresentationSnapshot>>({});
  const runGuardrailRef = useRef<
    Record<
      string,
      {
        rejected: boolean;
        fallbackUsed: boolean;
      }
    >
  >({});
  const loadingRunFinanceIdsRef = useRef<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const clearAttachmentComposer = useCallback(
    (options?: { resetMode?: boolean }) => {
      setPastedArtifactText("");
      setSelectedAttachment(null);
      setAttachmentUploadError(null);
      if (options?.resetMode ?? true) {
        setAttachmentMode("upload_file");
      }
      if (attachmentInputRef.current) {
        attachmentInputRef.current.value = "";
      }
    },
    []
  );
  const session = useSession();
  const effectiveWorkspaceId = workspaceId ?? session.workspaceId;
  const { executeAgent } = useAgentExecution();
  const conversation = useConversation();
  const threadKey = useMemo(() => {
    const tenant = session.tenantId ?? "tenant";
    const workspace = effectiveWorkspaceId ?? "workspace";
    const agent = activeAgentId ?? FALLBACK_AGENT.id;
    const topic =
      typeof launcherContext?.topic === "string" && launcherContext.topic.trim().length > 0
        ? launcherContext.topic.trim().toLowerCase()
        : "default";
    return `eiah:chat:${tenant}:${workspace}:${agent}:${topic}`;
  }, [session.tenantId, effectiveWorkspaceId, activeAgentId, launcherContext?.topic]);
  const proposalMode =
    (launcherContext?.topic ?? "").trim().toLowerCase() === "proposal" &&
    normalizeAgentKey(activeAgent?.id ?? FALLBACK_AGENT.id) === "eiah";
  const isUnifiedEiahMode = isUnifiedEiahAgent({
      id: activeAgent?.id ?? FALLBACK_AGENT.id,
      slug: activeAgent?.slug ?? FALLBACK_AGENT.slug,
      title: activeAgent?.title ?? FALLBACK_AGENT.title,
    });
  const isHelpCenterMode =
    isUnifiedEiahMode && (launcherContext?.topic ?? "").trim().toLowerCase() !== "proposal";
  const activeRunFinance = runId ? runFinanceByRunId[runId] ?? null : null;
  const estimatedRunCostCents =
    typeof selectedCatalogAgent?.pricing?.perRunCents === "number" && selectedCatalogAgent.pricing.perRunCents > 0
      ? selectedCatalogAgent.pricing.perRunCents
      : null;
  useEffect(() => {
    if (identityShown) return;
    if (!session.userId && !session.tenantId) return;
    const storageKey = `eiah:greeted:${session.tenantId ?? "tenant"}:${effectiveWorkspaceId ?? "workspace"}`;
    if (typeof window !== "undefined") {
      const storage = window.sessionStorage;
      if (storage.getItem(storageKey) === "1") {
        setIdentityShown(true);
        return;
      }
      storage.setItem(storageKey, "1");
    }
    const maskedUser = session.userId ? maskIdentity(session.userId, "usr") : "usr_…";
    const maskedTenant = session.tenantId ? maskIdentity(session.tenantId, "ten") : "ten_…";
    pushMessage({
      id: `system-identity-${Date.now()}`,
      role: "system",
      content: `👋 Bem-vindo! Identifiquei seu cadastro: Usuário ${maskedUser} (Empresa ${maskedTenant}).`,
      status: "done",
    });
    setIdentityShown(true);
  }, [identityShown, session.userId, session.tenantId, effectiveWorkspaceId]);

  useEffect(() => {
    if (!copyToast) return;
    const timer = window.setTimeout(() => setCopyToast(null), 2500);
    return () => window.clearTimeout(timer);
  }, [copyToast]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    stopStreaming();
    const raw = window.sessionStorage.getItem(threadKey);
    if (!raw) {
      setMessages([]);
      setRunId(null);
      onRunIdChange?.(null);
      return;
    }
    try {
      const parsed = JSON.parse(raw) as ThreadSnapshot;
      setMessages(parsed.messages ?? []);
      setRunId(parsed.runId ?? null);
      onRunIdChange?.(parsed.runId ?? null);
    } catch {
      setMessages([]);
      setRunId(null);
      onRunIdChange?.(null);
    }
  }, [threadKey, onRunIdChange]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const payload: ThreadSnapshot = { messages, runId };
    window.sessionStorage.setItem(threadKey, JSON.stringify(payload));
  }, [threadKey, messages, runId]);

  const explicitRunIds = useMemo(
    () =>
      Array.from(
        new Set(
          [runId, ...messages.map((message) => message.runId ?? null)].filter(
            (value): value is string => typeof value === "string" && value.trim().length > 0
          )
        )
      ),
    [messages, runId]
  );

  useEffect(() => {
    let cancelled = false;

    for (const currentRunId of explicitRunIds) {
      if (runFinanceByRunId[currentRunId] || loadingRunFinanceIdsRef.current.has(currentRunId)) continue;
      loadingRunFinanceIdsRef.current.add(currentRunId);
      void Promise.allSettled([
        apiGetRunCostBreakdown(currentRunId),
        apiGetBillingReconciliationSummary({ runId: currentRunId, limit: 1 }),
      ])
        .then((results) => {
          if (cancelled) return;
          const breakdownResult = results[0];
          if (breakdownResult.status !== "fulfilled") return;
          const reconciliationResult = results[1];
          const issue =
            reconciliationResult.status === "fulfilled"
              ? reconciliationResult.value.data.items.auditGaps[0]?.issue ?? null
              : null;
          setRunFinanceByRunId((prev) => ({
            ...prev,
            [currentRunId]: {
              amountCents: breakdownResult.value.data.totals.amountCents ?? 0,
              estimatedAmountCents: breakdownResult.value.data.estimate?.amountCents ?? null,
              tokens: breakdownResult.value.data.totals.tokens ?? 0,
              issueLabel: issue ? formatReconciliationIssue(issue) : "Reconciliado",
              hasGap: Boolean(issue),
            },
          }));
        })
        .finally(() => {
          loadingRunFinanceIdsRef.current.delete(currentRunId);
        });
    }

    return () => {
      cancelled = true;
    };
  }, [explicitRunIds, runFinanceByRunId]);

  useEffect(() => {
    if (!effectiveWorkspaceId) {
      setWorkspaceBillingContext(null);
      return;
    }
    let cancelled = false;
    void Promise.all([
      apiGetTenantBillingSummary().catch(() => null),
      apiGetQuota(effectiveWorkspaceId).catch(() => null),
    ]).then(([summaryResponse, quotaResponse]) => {
      if (cancelled) return;
      const billingSummary = summaryResponse?.data as TenantBillingSummary | undefined;
      const workspaceSummary = billingSummary?.byWorkspace?.find((item) => item.workspaceId === effectiveWorkspaceId);
      setWorkspaceBillingContext({
        workspaceCostCents: workspaceSummary?.costCents ?? 0,
        workspaceRuns: workspaceSummary?.runs ?? 0,
        quotaPercent: quotaResponse?.data?.percent ?? 0,
        monthUsageCents: quotaResponse?.data?.monthUsageCents ?? workspaceSummary?.costCents ?? 0,
        softLimitCents: quotaResponse?.data?.softLimitCents ?? 0,
        hardLimitCents: quotaResponse?.data?.hardLimitCents ?? 0,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [effectiveWorkspaceId]);

  useEffect(() => {
    if (!activeAgentId) {
      setSelectedAgentLabel(null);
      setSelectedCatalogAgent(null);
      return;
    }
    let cancelled = false;
    apiListAgents()
      .then((response: { items?: Agent[] }) => {
        if (cancelled) return;
        const items = Array.isArray(response?.items) ? response.items : [];
        setCatalogAgents(items);
        const found = items.find((item) => String(item?.id ?? "") === activeAgentId) ?? null;
        setSelectedAgentLabel(found ? getCatalogAgentDisplayName(found) : null);
        setSelectedCatalogAgent(found);
      })
      .catch(() => {
        if (!cancelled) {
          setCatalogAgents([]);
          setSelectedAgentLabel(null);
          setSelectedCatalogAgent(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeAgentId]);

  const updateSseStatus = (next: "idle" | "connecting" | "live" | "polling" | "error") => {
    setSseStatus(next);
    onSseStatusChange?.(next);
  };

  useEffect(() => {
    stopStreaming();
    const resetLedger = baseLedger();
    setLedger(resetLedger);
    onLedgerChange?.(resetLedger);
    setInput("");
    updateSseStatus("idle");

    if (!activeAgentId) {
      setActiveAgent(FALLBACK_AGENT);
      return;
    }

    const normalized = normalizeAgentKey(activeAgentId);
    const next =
      agents.find((agent) => normalizeAgentKey(agent.id) === normalized) ??
      agents.find((agent) => normalizeAgentKey(agent.slug) === normalized) ??
      null;
    setActiveAgent(
      next ?? {
        id: activeAgentId,
        slug: activeAgentId,
        title: activeAgentId,
        description: "",
      }
    );
  }, [activeAgentId, agents]);

  const pushMessage = (message: ChatMessage) => {
    setMessages((prev) => [...prev, message]);
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    });
  };

  const pushAssistantMessageWithTyping = useCallback(
    async (params: {
      idPrefix: string;
      content: string;
      runId?: string | null;
      presentationSnapshot?: MessagePresentationSnapshot;
    }) => {
      const chunks = params.content
        .split(/(\s+)/)
        .filter((chunk) => chunk.length > 0);
      const messageId = `${params.idPrefix}-${Date.now()}`;

      setMessages((prev) => [
        ...prev,
        {
          id: messageId,
          role: "assistant",
          content: "",
          status: "streaming",
          ...(params.runId ? { runId: params.runId } : {}),
          ...(params.presentationSnapshot ? { presentationSnapshot: params.presentationSnapshot } : {}),
        } as ChatMessage,
      ]);

      let rendered = "";
      for (const chunk of chunks) {
        rendered += chunk;
        setMessages((prev) =>
          prev.map((message) =>
            message.id === messageId
              ? {
                  ...message,
                  content: rendered,
                  status: "streaming",
                }
              : message
          )
        );
        requestAnimationFrame(() => {
          scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
        });
        // Mantém o ritmo de escrita sem travar a interface.
        // Respostas curtas ficam naturais; respostas longas continuam rápidas.
        await new Promise((resolve) => window.setTimeout(resolve, chunk.trim() ? 18 : 8));
      }

      setMessages((prev) =>
        prev.map((message) =>
          message.id === messageId
            ? {
                ...message,
                content: rendered,
                status: "done",
              }
            : message
        )
      );
    },
    []
  );

  const persistHelpdeskSession = useCallback(
    (params: {
      runId?: string | null;
      message: string;
      response: string;
      intentResult: IntentResult;
      responseRejected?: boolean;
      fallbackUsed?: boolean;
      clarificationIssued?: boolean;
      handoffOffered?: boolean;
      handoffEligible?: boolean;
      quickReplyUsed?: boolean;
      quickRepliesShown?: number;
      routeIntent?: MessagePresentationSnapshot["routeIntent"] | null;
      verticalContext?: MessagePresentationSnapshot["verticalContext"];
      proposalDomain?: MessagePresentationSnapshot["proposalDomain"];
      conversationStage?: MessagePresentationSnapshot["conversationStage"];
      proposalContextRecovered?: boolean;
      proposalContextLost?: boolean;
      proposalDomainMismatch?: boolean;
      recommendedPlan?: string | null;
      estimatedValue?: number | null;
      persist?: boolean;
    }) => {
      const payload = buildLauncherHelpdeskSessionPayload({
        tenantId: session.tenantId,
        workspaceId: effectiveWorkspaceId,
        runId: params.runId ?? null,
        message: params.message,
        response: params.response,
        intentResult: params.intentResult,
        responseRejected: params.responseRejected,
        fallbackUsed: params.fallbackUsed,
        clarificationIssued: params.clarificationIssued,
        handoffOffered: params.handoffOffered,
        handoffEligible: params.handoffEligible,
        quickReplyUsed: params.quickReplyUsed,
        quickRepliesShown: params.quickRepliesShown,
        routeIntent: params.routeIntent ?? null,
        verticalContext: params.verticalContext,
        proposalDomain: params.proposalDomain ?? null,
        conversationStage: params.conversationStage ?? null,
        proposalContextRecovered: params.proposalContextRecovered ?? false,
        proposalContextLost: params.proposalContextLost ?? false,
        proposalDomainMismatch: params.proposalDomainMismatch ?? false,
        recommendedPlan: params.recommendedPlan ?? null,
        estimatedValue: params.estimatedValue ?? null,
        persist: params.persist,
        rolloutStage: CHAT_ROLLOUT_STAGE,
        threadKey,
        activeAgentId: activeAgentId ?? FALLBACK_AGENT.id,
        activeAgentName: selectedCatalogAgent?.name ?? activeAgent?.title ?? FALLBACK_AGENT.title,
        chatRuntimeReadiness: selectedCatalogAgent?.chatRuntime?.readiness ?? "incomplete",
        chatRuntimeResolver: selectedCatalogAgent?.chatRuntime?.resolver ?? "legacy_compatible",
        chatRuntimeMissingFields: selectedCatalogAgent?.chatRuntime?.missingFields ?? [],
        attachmentOffered: attachmentIntake.enabled,
        attachmentKinds: attachmentIntake.acceptedKinds ?? [],
        attachmentIntakeModes: attachmentIntake.intakeModes ?? [],
        attachmentAnalysisModes: attachmentIntake.analysisModes ?? [],
        attachmentUsed: Boolean(selectedAttachment) || Boolean(pastedArtifactText.trim()),
        attachmentMode: selectedAttachment || pastedArtifactText.trim() ? attachmentMode : null,
      });
      if (!payload) return;
      void apiCreateHelpdeskSession(payload).catch(() => {
        // fire-and-forget sem bloquear UX
      });
    },
    [
      activeAgentId,
      activeAgent?.title,
      attachmentMode,
      effectiveWorkspaceId,
      pastedArtifactText,
      selectedCatalogAgent?.chatRuntime?.missingFields,
      selectedCatalogAgent?.name,
      selectedCatalogAgent?.chatRuntime?.readiness,
      selectedCatalogAgent?.chatRuntime?.resolver,
      selectedAttachment,
      session.tenantId,
      threadKey,
    ]
  );

  const stopStreaming = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (pollTimerRef.current) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    setIsStreaming(false);
    updateSseStatus("idle");
  };

  const handleIncomingEvent = (event: RunEvent) => {
    if (seenEventsRef.current.has(event.id)) return;
    seenEventsRef.current.add(event.id);
    lastEventIdRef.current = event.id;

    setLedger((prev) => {
      const next = [
        {
          id: event.id,
          runId: event.runId,
          label: event.type,
          detail: formatLedgerDetail(event.payload),
        },
        ...prev,
      ];
      onLedgerChange?.(next);
      return next;
    });

    const message = eventToAssistantMessage(event);
    if (message) {
      pushMessage({
        id: `assistant-${event.id}`,
        role: "assistant",
        content: message,
        status: "done",
        runId: event.runId,
        presentationSnapshot:
          event.runId && runPresentationRef.current[event.runId]
            ? {
                ...runPresentationRef.current[event.runId],
                showConfidence: true,
              }
            : undefined,
      });
    }

    if (event.type === "run.orchestrator.finished") {
      setIsStreaming(false);
    }

    if (event.type === "run.completed") {
      void fetchRunSummary(event.runId);
    }
  };

  const fetchRunSummary = async (targetRunId?: string | null) => {
    if (!targetRunId || runSummaryLoadedRef.current === targetRunId) return;
    runSummaryLoadedRef.current = targetRunId;
    try {
      const run = await apiGetRun(targetRunId);
      const responseText =
        typeof run.response === "string"
          ? run.response
          : JSON.stringify(run.response ?? "");
      const extracted = extractDocAndRecs(responseText);
      const meta = extracted.metaJson
        ? {
            agent: extracted.metaJson.agent,
            run_id: extracted.metaJson.run_id,
            recomendacoes: extracted.metaJson.recomendacoes ?? [],
            diagnostico: extracted.metaJson.diagnostico,
          }
        : null;
      const content = meta
        ? `${JSON.stringify(meta, null, 2)}\n---\n${extracted.docMarkdown}`
        : extracted.docMarkdown;
      if (content) {
        const intentResult = runIntentRef.current[targetRunId] ?? { intent: "unknown", confidence: 0 };
        const guarded = toMarkdownFromStructuredResponse(content, intentResult.intent);
        runGuardrailRef.current[targetRunId] = {
          rejected: guarded.rejected,
          fallbackUsed: guarded.fallbackUsed,
        };
        const summarySnapshot = resolveLauncherRunSummarySnapshot({
          existingSnapshot: runPresentationRef.current[targetRunId],
          selectedAgent: selectedCatalogAgent,
          isUnifiedEiah: isUnifiedEiahMode,
          launcherTopic: launcherContext?.topic,
          lastRouteIntent,
          activeEiahMode,
          intentResult,
          runId: targetRunId,
          isHelpCenterMode: isUnifiedEiahMode,
          proposalMode,
          attachmentIntake,
          usedReplyInputs: [...usedQuickReplyKeys],
        });
        pushMessage({
          id: `assistant-summary-${targetRunId}`,
          role: "assistant",
          content: guarded.content,
          status: "done",
          presentationSnapshot: {
            ...summarySnapshot,
            showConfidence: true,
            confidencePercent: Math.round(intentResult.confidence * 100),
          },
        });
        persistHelpdeskSession({
          runId: targetRunId,
          message: runPromptRef.current[targetRunId] ?? "",
          response: guarded.content,
          intentResult,
          responseRejected: guarded.rejected,
          fallbackUsed: guarded.fallbackUsed,
          quickRepliesShown: summarySnapshot.quickReplies.length,
          routeIntent: summarySnapshot.routeIntent,
          verticalContext: summarySnapshot.verticalContext ?? null,
          proposalDomain: summarySnapshot.proposalDomain ?? null,
          conversationStage: summarySnapshot.conversationStage ?? null,
        });
      }
    } catch (error) {
      console.warn("[ChatAgentLauncher] falha ao buscar resumo do run", error);
    }
  };

  const startPolling = (targetRunId: string) => {
    updateSseStatus("polling");
    const poll = async () => {
      try {
        const response = await apiListRunEvents(targetRunId, {
          cursor: lastEventIdRef.current ?? undefined,
        });
        response.items.forEach(handleIncomingEvent);
      } catch {
        updateSseStatus("error");
        setIsStreaming(false);
      }
    };
    poll();
    pollTimerRef.current = window.setInterval(poll, 4000);
  };

  const startSse = async (targetRunId: string) => {
    updateSseStatus("connecting");
    try {
      await apiCreateSession();
      const streamUrl = new URL(`${BASE_URL}/runs/${targetRunId}/stream`);
      if (lastEventIdRef.current) {
        streamUrl.searchParams.set("cursor", lastEventIdRef.current);
      }
      const source = new EventSource(streamUrl.toString(), { withCredentials: true });
      eventSourceRef.current = source;

      source.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data) as RunEvent;
          handleIncomingEvent(parsed);
          updateSseStatus("live");
        } catch {
          updateSseStatus("error");
        }
      };

      source.onerror = () => {
        source.close();
        eventSourceRef.current = null;
        startPolling(targetRunId);
      };
    } catch {
      startPolling(targetRunId);
    }
  };

  const handleSend = async () => {
    const trimmed = input.trim();
    const artifactText = pastedArtifactText.trim();
    const hasAttachmentPayload = Boolean(selectedAttachment) || Boolean(artifactText);
    if ((!trimmed && !hasAttachmentPayload) || isStreaming) return;
    const resolvedAgentId = activeAgentId ?? FALLBACK_AGENT.id;
    let uploadedArtifacts: UploadedDocumentInfo[] = [];
    if (attachmentIntake.enabled && selectedAttachment) {
      const formData = new FormData();
      formData.append("files", selectedAttachment);
      setIsUploadingAttachment(true);
      setAttachmentUploadError(null);
      try {
        const uploadResponse = await apiUploadDocuments(formData, normalizeAgentKey(resolvedAgentId));
        uploadedArtifacts = uploadResponse.data ?? [];
      } catch (error) {
        setIsUploadingAttachment(false);
        setAttachmentUploadError(error instanceof Error ? error.message : "Falha ao enviar arquivo.");
        return;
      } finally {
        setIsUploadingAttachment(false);
      }
    }
    const attachmentSummary = selectedAttachment
      ? `Arquivo anexado: ${selectedAttachment.name} (${Math.max(1, Math.round(selectedAttachment.size / 1024))} KB, ${selectedAttachment.type || "tipo não informado"}).`
      : "";
    const uploadedArtifactsBlock =
      uploadedArtifacts.length > 0
        ? [
            "[ARTEFATOS_UPLOADADOS]",
            ...uploadedArtifacts.map(
              (artifact) =>
                `- ${artifact.name} (${artifact.mimeType}, ${Math.max(1, Math.round(artifact.sizeBytes / 1024))} KB) -> ${artifact.url}`
            ),
          ].join("\n")
        : "";
    const effectiveInput = trimmed || (selectedAttachment ? "Quero revisar o arquivo anexado." : "Quero analisar o texto colado.");
    const intakeContext =
      attachmentIntake.enabled && hasAttachmentPayload
        ? [
            "[INTAKE_DE_ARTEFATO]",
            `modo=${attachmentMode}`,
            `document_type=${attachmentDocumentType}`,
            `analysis_mode=${attachmentAnalysisMode}`,
            attachmentSummary,
            uploadedArtifactsBlock,
            artifactText ? `texto_colado:\n${artifactText}` : "",
          ]
            .filter(Boolean)
            .join("\n")
        : "";
    const turnInput = [effectiveInput, intakeContext].filter(Boolean).join("\n\n");
    const quickReplyUsed = Boolean(
      lastAssistantSnapshot?.quickReplies?.some(
        (reply) => normalizeIntentText(reply) === normalizeIntentText(effectiveInput)
      )
    );
    const routeIntent = isUnifiedEiahMode ? detectLauncherRouteIntent(effectiveInput, proposalMode) : "help";
    const turnEiahMode = resolveLauncherEiahUnifiedMode({
      isUnifiedEiah: isUnifiedEiahMode,
      launcherTopic: launcherContext?.topic,
      routeIntent,
    });
    const turnContractProfile = selectLauncherAgentContract(selectedCatalogAgent, turnEiahMode);
    const isEiahHelpCenter = turnEiahMode === "help";
    if (isUnifiedEiahMode) setLastRouteIntent(routeIntent);
    setInput("");
    pushMessage({
      id: `user-${Date.now()}`,
      role: "user",
      content: [effectiveInput, attachmentSummary].filter(Boolean).join("\n"),
    });
    const localIntentResult = conversation.analyze(effectiveInput);
    const turnDecision = await resolveLauncherTurnDecision({
      input: turnInput,
      trimmedInput: effectiveInput,
      routeIntent,
      proposalMode,
      isUnifiedEiah: isUnifiedEiahMode,
      eiahMode: turnEiahMode,
      agentProfile: turnContractProfile,
      catalogAgents,
      intentUnknown: localIntentResult.intent === "unknown",
      confidence: localIntentResult.confidence,
      previousUserMessage: lastUserMessage,
      previousAssistantMessage: lastAssistantMessage,
      previousAssistantSnapshot: lastAssistantSnapshot,
      accessContext: {
        tenantId: session.tenantId,
        workspaceId: effectiveWorkspaceId,
        roleProfile: session.experience?.roleProfile ?? null,
        activeDomain: session.activeDomain ?? null,
        installedProducts: session.installedProducts ?? null,
        entitlements: session.entitlements ?? null,
      },
    });
    if (turnDecision?.content) {
      setLastRouteIntent(turnDecision.launcherRouteIntent);
      const confidenceFloor = turnDecision.persistIntent?.confidenceFloor;
      const persistedIntentResult = normalizeLauncherPersistedIntentResult({
        intentResult: localIntentResult,
        decision: turnDecision,
      });
      const decisionTelemetry = buildLauncherDecisionTelemetry({
        decision: turnDecision,
      });
      const localSnapshot = createPresentationSnapshot({
        agentProfile: turnContractProfile,
        routeIntent: turnDecision.presentationRouteIntent,
        eiahMode: turnDecision.eiahMode ?? turnEiahMode,
        confidence:
          typeof confidenceFloor === "number"
            ? Math.max(localIntentResult.confidence, confidenceFloor)
            : localIntentResult.confidence,
        renderVariant: turnDecision.renderVariant,
        excludeReplyInputs: [trimmed],
        sourceInput: effectiveInput,
        proposalDomain: turnDecision.proposalDomain ?? null,
        conversationStage: turnDecision.conversationStage ?? null,
        resolvedQuickReplies: turnDecision.resolvedQuickReplies,
        journeyContext: turnDecision.journeyContext ?? null,
      });
      await pushAssistantMessageWithTyping({
        idPrefix: `assistant-${turnDecision.kind}`,
        content: turnDecision.content,
        presentationSnapshot: localSnapshot,
      });
      persistHelpdeskSession({
        message: turnInput,
        response: turnDecision.content,
        intentResult: persistedIntentResult,
        responseRejected: decisionTelemetry.responseRejected,
        fallbackUsed: decisionTelemetry.fallbackUsed,
        quickReplyUsed,
        quickRepliesShown: localSnapshot.quickReplies.length,
        routeIntent: localSnapshot.routeIntent,
        verticalContext: localSnapshot.verticalContext ?? null,
        proposalDomain: localSnapshot.proposalDomain ?? null,
        conversationStage: localSnapshot.conversationStage ?? null,
        proposalContextRecovered: decisionTelemetry.proposalContextRecovered,
        proposalContextLost: decisionTelemetry.proposalContextLost,
        proposalDomainMismatch: decisionTelemetry.proposalDomainMismatch,
        clarificationIssued: decisionTelemetry.clarificationIssued,
        handoffOffered: decisionTelemetry.handoffOffered,
        handoffEligible: decisionTelemetry.handoffEligible,
      });
      clearAttachmentComposer();
      return;
    }
    stopStreaming();
    onRunIdChange?.(null);
    setIsStreaming(true);
    const resetLedger = baseLedger();
    setLedger(resetLedger);
    onLedgerChange?.(resetLedger);
    seenEventsRef.current = new Set();
    lastEventIdRef.current = null;
    runSummaryLoadedRef.current = null;
    const intentResult = localIntentResult;

    try {
      const preparedRun = await prepareLauncherRunExecution({
        turnInput,
        effectiveInput,
        routeIntent,
        eiahMode: turnEiahMode,
        isEiahHelpCenter,
        agentProfile: turnContractProfile,
        requiresConfirmation: Boolean(conversation.policy?.requiresConfirmation),
        planHint: launcherContext?.planHint ?? null,
        agentFallback: !activeAgentId,
      });

      const response = await conversation.executeWithPolicy(resolvedAgentId, {
        agent: resolvedAgentId,
        prompt: preparedRun.prompt,
        workspaceId: effectiveWorkspaceId,
        metadata: preparedRun.metadata,
      });
      const created = response.data;
      setRunId(created.id);
      onRunIdChange?.(created.id);
      runPromptRef.current[created.id] = turnInput;
      runIntentRef.current[created.id] = intentResult;
      runPresentationRef.current[created.id] = createLauncherExecutionSnapshot({
        agentProfile: turnContractProfile,
        routeIntent,
        eiahMode: turnEiahMode,
        confidence: intentResult.confidence,
        runId: created.id,
        sourceInput: effectiveInput,
        phase: "run_created",
        isHelpCenterMode: isUnifiedEiahMode,
        proposalMode,
        attachmentIntake,
        usedReplyInputs: [...usedQuickReplyKeys],
      });
      pushMessage({
        id: `system-${created.id}`,
        role: "system",
        content: `Run criada: ${created.id}. Aguardando eventos...`,
      });
      await startSse(created.id);
      clearAttachmentComposer();
    } catch (error) {
      setIsStreaming(false);
      updateSseStatus("error");
      const message = error instanceof Error ? error.message : "Falha ao iniciar run.";
      pushMessage({
        id: `assistant-error-${Date.now()}`,
        role: "assistant",
        content: message,
        status: "done",
        presentationSnapshot: createLauncherExecutionSnapshot({
          agentProfile: turnContractProfile,
          routeIntent,
          eiahMode: turnEiahMode,
          confidence: intentResult.confidence,
          sourceInput: effectiveInput,
          phase: "run_error",
          isHelpCenterMode: isUnifiedEiahMode,
          proposalMode,
          attachmentIntake,
          usedReplyInputs: [...usedQuickReplyKeys],
        }),
      });
      clearAttachmentComposer();
    }
  };

  const handleApprove = async () => {
    if (!runId) return;
    try {
      const response = await apiApproveRun(runId, { parentRunId: runId });
      conversation.markApproved();
      pushMessage({
        id: `system-approve-${runId}`,
        role: "system",
        content: "✅ Ação aprovada. O sistema está finalizando a execução e registrando no Ledger.",
        status: "done",
      });
      setEvidenceEvent(response.event ?? null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao registrar aprovacao.";
      pushMessage({ id: `system-approve-error-${Date.now()}`, role: "system", content: message, status: "done" });
    }
  };

  const handleAdoptRec = async (targetRunId: string, rec: ExtractedRec) => {
    if (!targetRunId) {
      setCopyToast("Run ID nao encontrado.");
      return;
    }
    try {
      await apiAdoptRecommendation(targetRunId, {
        key: rec.key,
        tatica: rec.tatica,
        adopted: true,
      });
      setCopyToast("Recomendacao marcada como adotada.");
    } catch {
      setCopyToast("Falha ao marcar recomendacao.");
    }
  };

  const handleFinalizeConversation = async () => {
    if (!runId || conversationFinalizing) return;
    setConversationFinalizing(true);
    try {
      const transcript = messages
        .filter((msg) => msg.role === "user" || msg.role === "assistant")
        .map((msg) => {
          if (msg.role === "assistant") {
            const extracted = extractDocAndRecs(msg.content);
            return `Assistente: ${extracted.docMarkdown || msg.content}`;
          }
          return `Usuario: ${msg.content}`;
        })
        .join("\n\n");
      const runIds = Array.from(
        new Set(
          messages
            .map((msg) => extractDocAndRecs(msg.content).runId)
            .filter((id) => Boolean(id))
        )
      ) as string[];
      await apiFinalizeConversation(runId, {
        document: transcript,
        runIds: runIds.length > 0 ? runIds : [runId],
        policySnapshot: {
          intent: conversation.intent,
          policy: conversation.policy,
        },
      });
      setCopyToast("Documento de conversa gerado no relatorio.");
    } catch {
      setCopyToast("Falha ao gerar documento.");
    } finally {
      setConversationFinalizing(false);
    }
  };

  const handleNewConversation = () => {
    stopStreaming();
    setMessages([]);
    setRunId(null);
    onRunIdChange?.(null);
    const resetLedger = baseLedger();
    setLedger(resetLedger);
    onLedgerChange?.(resetLedger);
    setEvidenceEvent(null);
    setCopyToast("Nova conversa iniciada.");
    seenEventsRef.current = new Set();
    lastEventIdRef.current = null;
    runSummaryLoadedRef.current = null;
    runPromptRef.current = {};
    runIntentRef.current = {};
    runPresentationRef.current = {};
    runGuardrailRef.current = {};
    setLastRouteIntent(null);
    clearAttachmentComposer();
    setAttachmentDocumentType("contract");
    setAttachmentAnalysisMode("full_review");
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(threadKey);
    }
  };

  const loadGovernanceReport = async () => {
    setGovernanceLoading(true);
    setGovernanceError(null);
    try {
      const response = await apiGetGovernanceReport({ limit: 200 });
      setGovernanceItems(response.items ?? []);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao carregar relatorio.";
      setGovernanceError(message);
    } finally {
      setGovernanceLoading(false);
    }
  };

  const openGovernanceReport = async () => {
    setShowGovernanceReport(true);
    if (governanceItems.length > 0 || governanceLoading) return;
    await loadGovernanceReport();
  };

  const buildSupportCopy = (items: GovernanceItem[]) => {
    const lines = [
      session.userId ? `User: ${session.userId}` : "User: n/a",
      session.tenantId ? `Tenant: ${session.tenantId}` : "Tenant: n/a",
      effectiveWorkspaceId ? `Workspace: ${effectiveWorkspaceId}` : "Workspace: n/a",
      "",
      "Adotadas:",
    ];
    items
      .filter((item) => item.type === "run.recommendation.adopted")
      .forEach((item) => {
        const title = item.payload.tatica ?? item.payload.key ?? "Recomendacao";
        const hash = item.ledgerHash ? `0x${item.ledgerHash}` : "0x?";
        lines.push(`- ${title} | run=${item.runId} | hash=${hash} | ${item.createdAt}`);
      });
    lines.push("", "Aprovadas:");
    items
      .filter((item) => item.type === "run.approved")
      .forEach((item) => {
        const hash = item.ledgerHash ? `0x${item.ledgerHash}` : "0x?";
        lines.push(`- Execucao aprovada | run=${item.runId} | hash=${hash} | ${item.createdAt}`);
      });
    lines.push("", "Conversas:");
    items
      .filter((item) => item.type === "conversation.finalized")
      .forEach((item) => {
        const hash = item.ledgerHash ? `0x${item.ledgerHash}` : "0x?";
        lines.push(`- Documento de conversa | run=${item.runId} | hash=${hash} | ${item.createdAt}`);
      });
    return lines.join("\n");
  };

  const exportGovernanceReport = (items: GovernanceItem[]) => {
    const createdAt = new Date().toLocaleString("pt-BR");
    const adopted = items.filter((item) => item.type === "run.recommendation.adopted");
    const approved = items.filter((item) => item.type === "run.approved");
    const conversations = items.filter((item) => item.type === "conversation.finalized");
    const rows = (list: GovernanceItem[]) =>
      list
        .map((item) => {
          const title = item.payload.tatica ?? item.payload.key ?? "Recomendacao";
          const hash = item.ledgerHash ? `0x${item.ledgerHash}` : "0x?";
          return `<tr><td>${title}</td><td>${item.runId}</td><td>${item.agent ?? "-"}</td><td>${hash}</td><td>${item.createdAt}</td></tr>`;
        })
        .join("");

    const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8"/>
  <title>Relatorio de Governanca</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 24px; color: #0f172a; }
    h1 { margin: 0 0 8px; }
    h2 { margin: 24px 0 8px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #e2e8f0; padding: 8px; text-align: left; }
    th { background: #f8fafc; }
    .meta { font-size: 12px; color: #475569; margin-bottom: 16px; }
  </style>
</head>
<body>
  <h1>Relatorio de Governanca</h1>
  <div class="meta">Gerado em ${createdAt}</div>
  <div class="meta">User: ${session.userId ?? "n/a"} | Tenant: ${session.tenantId ?? "n/a"} | Workspace: ${effectiveWorkspaceId ?? "n/a"}</div>
  <h2>Recomendacoes adotadas (${adopted.length})</h2>
  <table>
    <thead><tr><th>Recomendacao</th><th>Run</th><th>Agente</th><th>Ledger Hash</th><th>Data</th></tr></thead>
    <tbody>${rows(adopted)}</tbody>
  </table>
  <h2>Aprovacoes (${approved.length})</h2>
  <table>
    <thead><tr><th>Acao</th><th>Run</th><th>Agente</th><th>Ledger Hash</th><th>Data</th></tr></thead>
    <tbody>${rows(approved)}</tbody>
  </table>
  <h2>Conversas (${conversations.length})</h2>
  <table>
    <thead><tr><th>Documento</th><th>Run</th><th>Agente</th><th>Ledger Hash</th><th>Data</th></tr></thead>
    <tbody>${rows(conversations)}</tbody>
  </table>
</body>
</html>`;

    const reportWindow = window.open("", "_blank");
    if (!reportWindow) {
      setCopyToast("Nao foi possivel abrir o relatorio.");
      return;
    }
    reportWindow.document.write(html);
    reportWindow.document.close();
    reportWindow.focus();
    reportWindow.print();
  };

  useEffect(() => {
    onPolicyChange?.({
      intent: conversation.intent,
      policy: conversation.policy,
      status: conversation.status,
    });
  }, [conversation.intent, conversation.policy, conversation.status, onPolicyChange]);

  useEffect(() => {
    return () => {
      stopStreaming();
    };
  }, []);

  const adoptedItems = governanceItems.filter((item) => item.type === "run.recommendation.adopted");
  const approvedItems = governanceItems.filter((item) => item.type === "run.approved");
  const conversationItems = governanceItems.filter((item) => item.type === "conversation.finalized");
  const activeAgentTitle = selectedAgentLabel ?? activeAgent?.title ?? "Curator";
  const activeEiahMode = resolveLauncherEiahUnifiedMode({
    isUnifiedEiah: isUnifiedEiahMode,
    launcherTopic: launcherContext?.topic,
    routeIntent: lastRouteIntent,
  });
  const activeContractProfile = selectLauncherAgentContract(selectedCatalogAgent, activeEiahMode);
  const attachmentIntake = useMemo(
    () => resolveAttachmentIntake(activeContractProfile),
    [activeContractProfile]
  );
  const usedQuickReplyKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const message of messages) {
      if (message.role !== "user") continue;
      keys.add(normalizeIntentText(message.content));
    }
    return keys;
  }, [messages]);
  function createPresentationSnapshot(params: {
    agentProfile: Agent | null;
    routeIntent: MessagePresentationSnapshot["routeIntent"];
    eiahMode?: EiahMode | null;
    confidence?: number;
    runId?: string | null;
    renderVariant?: MessagePresentationSnapshot["renderVariant"];
    excludeReplyInputs?: string[];
    sourceInput?: string;
    proposalDomain?: MessagePresentationSnapshot["proposalDomain"];
    conversationStage?: MessagePresentationSnapshot["conversationStage"];
    resolvedQuickReplies?: string[];
    journeyContext?: MessagePresentationSnapshot["journeyContext"];
  }): MessagePresentationSnapshot {
    return createPresentationSnapshotV1({
      ...params,
      isHelpCenterMode: isUnifiedEiahMode,
      proposalMode,
      attachmentIntake,
      usedReplyInputs: [...usedQuickReplyKeys],
    });
  }

  useEffect(() => {
    if (!proposalMode) return;
    const storageKey = `eiah:proposal-mode-greeted:${threadKey}`;
    if (typeof window !== "undefined") {
      const storage = window.sessionStorage;
      if (storage.getItem(storageKey) === "1") return;
      storage.setItem(storageKey, "1");
    }
    pushMessage({
      id: `assistant-proposal-mode-${Date.now()}`,
      role: "assistant",
      content:
        "Estou em modo atendimento de proposta. Posso te recomendar o melhor plano e estimar valor mensal. Para começar, me diga: quantos usuários e quantos runs/mês você estima?",
      status: "done",
      presentationSnapshot: createPresentationSnapshot({
        agentProfile: activeContractProfile,
        routeIntent: "proposal",
        eiahMode: activeEiahMode,
        confidence: 0.85,
        renderVariant: "proposal",
        proposalDomain: "saas",
        conversationStage: "proposal_collecting_usage",
      }),
    });
  }, [activeContractProfile, activeEiahMode, proposalMode, threadKey]);

  const lastUserMessage = useMemo(
    () => [...messages].reverse().find((message) => message.role === "user")?.content ?? null,
    [messages]
  );
  const lastAssistantMessage = useMemo(
    () => [...messages].reverse().find((message) => message.role === "assistant")?.content ?? null,
    [messages]
  );
  const lastAssistantSnapshot = useMemo(
    () =>
      [...messages]
        .reverse()
        .find((message) => message.role === "assistant" && message.presentationSnapshot)
        ?.presentationSnapshot ?? null,
    [messages]
  );

  const quickReplies = useMemo(() => {
    return resolveSnapshotQuickReplies(lastAssistantSnapshot).filter(
      (reply) => !usedQuickReplyKeys.has(normalizeIntentText(reply))
    );
  }, [
    lastAssistantSnapshot,
    usedQuickReplyKeys,
  ]);
  const inputPlaceholder = useMemo(() => {
    const snapshotPlaceholder = resolveSnapshotInputPlaceholder(lastAssistantSnapshot);
    if (snapshotPlaceholder) {
      return snapshotPlaceholder;
    }
    return buildInputPlaceholderForContext({
      routeIntent: lastRouteIntent ?? "help",
      input: lastUserMessage,
    });
  }, [lastAssistantSnapshot, lastRouteIntent, lastUserMessage]);
  const attachmentHelpText =
    lastAssistantSnapshot?.attachmentHelpText?.trim() || attachmentIntake.helpText || "";
  const attachmentPrimaryActionLabel =
    lastAssistantSnapshot?.attachmentPrimaryActionLabel?.trim() || attachmentIntake.primaryActionLabel || "Anexar arquivo";
  const attachmentSecondaryActionLabel =
    lastAssistantSnapshot?.attachmentSecondaryActionLabel?.trim() || attachmentIntake.secondaryActionLabel || "Colar texto";
  const attachmentAnalysisOptions = attachmentIntake.analysisModes ?? [];
  const attachmentDocumentOptions = attachmentIntake.acceptedKinds ?? [];
  const canSend =
    Boolean(input.trim() || pastedArtifactText.trim() || selectedAttachment) && !isStreaming && !isUploadingAttachment;
  const mainComposerPlaceholder =
    attachmentIntake.enabled && (selectedAttachment || attachmentMode === "paste_text")
      ? "Descreva o ponto que você quer analisar neste documento"
      : inputPlaceholder;

  return (
    <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-surface/80 p-8 shadow-lg shadow-black/20">
      <div className="absolute -left-32 top-0 h-64 w-64 rounded-full bg-accent/20 blur-3xl" aria-hidden />
      <div className="absolute -right-10 top-40 h-72 w-72 rounded-full bg-white/5 blur-3xl" aria-hidden />

      <header className="relative z-10 mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="pt-1">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accent">Launcher</p>
          <h3 className="mt-1 text-lg font-semibold text-foreground sm:text-xl">Chat Agent Launcher</h3>
        </div>
        <div className="flex w-full flex-wrap items-center justify-start gap-3 sm:w-auto sm:justify-end">
          {headerControls}
          {onPlaybookClick ? (
            <button
              type="button"
              onClick={onPlaybookClick}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-surface-strong/70 px-4 text-xs font-semibold uppercase tracking-[0.2em] text-foreground shadow-lg shadow-black/20 transition hover:border-accent/40"
            >
              Playbook
            </button>
          ) : null}
        </div>
      </header>

      <div className="relative z-10 grid gap-6">
        <div className="flex h-full flex-col gap-4">
          <div className="glass-subtle flex-1 p-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-muted-foreground">
                  Conversa ativa • {activeAgentTitle}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {copyToast ? (
                    <div className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-[10px] uppercase tracking-[0.25em] text-emerald-200">
                      {copyToast}
                    </div>
                  ) : null}
                  {runId || activeRunFinance || estimatedRunCostCents != null || workspaceBillingContext ? (
                    <ContextualCostPanel
                      compact
                      run={{
                        runId,
                        actualCostCents: activeRunFinance?.amountCents ?? null,
                        estimatedCostCents: activeRunFinance?.estimatedAmountCents ?? estimatedRunCostCents ?? null,
                        tokens: activeRunFinance?.tokens ?? null,
                        issueLabel: activeRunFinance?.issueLabel ?? null,
                        hasGap: activeRunFinance?.hasGap ?? false,
                      }}
                      workspace={workspaceBillingContext}
                    />
                  ) : null}
                </div>
              </div>

              {workspaceBillingContext ? (
                <ContextualCostPanel
                  className="mb-4"
                  run={{
                    runId,
                    actualCostCents: activeRunFinance?.amountCents ?? null,
                    estimatedCostCents: activeRunFinance?.estimatedAmountCents ?? estimatedRunCostCents ?? null,
                    tokens: activeRunFinance?.tokens ?? null,
                    issueLabel: activeRunFinance?.issueLabel ?? null,
                    hasGap: activeRunFinance?.hasGap ?? false,
                  }}
                  workspace={workspaceBillingContext}
                />
              ) : null}

            <div
              ref={scrollRef}
              className="no-scrollbar h-[360px] overflow-y-auto rounded-3xl border border-white/5 bg-black/20 p-4"
            >
              <div className="space-y-4">
                {messages
                  .filter(
                    (message) =>
                      message.role !== "system" || message.id.startsWith("system-identity")
                  )
                  .map((message) => {
                    if (message.role === "assistant") {
                      return (
                        <div
                          key={message.id}
                          className="flex w-full max-w-full animate-in flex-col gap-3 overflow-hidden fade-in slide-in-from-bottom-2"
                        >
                          <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4 shadow-xl backdrop-blur-md">
                            {(() => {
                              const { recs, docMarkdown, technicalRaw, runId: extractedRunId } =
                                extractDocAndRecs(message.content);
                              const displayRunId = extractedRunId || message.runId || "";
                              const messageRunFinance = message.runId ? runFinanceByRunId[message.runId] ?? null : null;
                              const messageSnapshot = message.presentationSnapshot;
                              const messageQuickReplies =
                                messageSnapshot?.quickReplies && messageSnapshot.quickReplies.length > 0
                                  ? messageSnapshot.quickReplies
                                  : [];

                              return (
                                <div className="flex w-full flex-col gap-4 overflow-hidden">
                                  {recs.length > 0 ? (
                                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                                      {recs.map((rec, i) => (
                                        <button
                                          key={i}
                                          onClick={() => handleAdoptRec(displayRunId, rec)}
                                          className="flex flex-col rounded-xl border border-accent/20 bg-accent/5 p-3 text-left transition-all hover:bg-accent/10 active:scale-95"
                                        >
                                          <span className="text-[9px] font-bold uppercase tracking-tighter text-accent">
                                            Sugerido
                                          </span>
                                          <span className="line-clamp-2 text-sm font-semibold text-foreground">
                                            {rec.tatica ?? rec.key ?? "Recomendacao"}
                                          </span>
                                        </button>
                                      ))}
                                    </div>
                                  ) : null}

                                  <div className="prose prose-invert prose-sm max-w-full break-words leading-relaxed prose-pre:border prose-pre:border-white/10 prose-pre:bg-black/50">
                                    <ReactMarkdown>
                                      {(() => {
                                        return buildRenderableAssistantMarkdown({
                                          messageContent: message.content,
                                          docMarkdown: docMarkdown ?? "",
                                          technicalRaw,
                                          recs,
                                          isHelpCenterMode,
                                          agentProfile: activeContractProfile,
                                          routeIntent: resolveSnapshotCompatibleRouteIntent(messageSnapshot),
                                          intentResult: {
                                            intent: conversation.intentResult.intent,
                                            confidence:
                                              typeof messageSnapshot?.confidencePercent === "number"
                                                ? messageSnapshot.confidencePercent / 100
                                                : conversation.intentResult.confidence,
                                            fallbackReason: conversation.intentResult.fallbackReason,
                                          },
                                          runId: displayRunId || runId,
                                          presentationSnapshot: messageSnapshot,
                                        });
                                      })()}
                                    </ReactMarkdown>
                                  </div>

                                  {messageRunFinance ? (
                                    <div className="flex flex-wrap gap-2 text-[10px]">
                                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-muted-foreground">
                                        Custo: {formatCurrencyCents(messageRunFinance.amountCents)}
                                      </span>
                                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-muted-foreground">
                                        Tokens: {new Intl.NumberFormat("pt-BR").format(messageRunFinance.tokens)}
                                      </span>
                                      <span
                                        className={`rounded-full border px-3 py-1 ${
                                          messageRunFinance.hasGap
                                            ? "border-amber-300/30 bg-amber-500/10 text-amber-100"
                                            : "border-emerald-300/30 bg-emerald-500/10 text-emerald-100"
                                        }`}
                                      >
                                        {messageRunFinance.issueLabel}
                                      </span>
                                    </div>
                                  ) : null}

                                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                                    <span>Quer aprofundar algo?</span>
                                    <div className="flex flex-wrap gap-2">
                                      {messageQuickReplies.map((reply) => (
                                        <button
                                          key={reply}
                                          type="button"
                                          onClick={() => {
                                            setInput(reply);
                                          }}
                                          className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground transition hover:border-accent/40 hover:text-accent"
                                        >
                                          {reply}
                                        </button>
                                      ))}
                                    </div>
                                  </div>

                                  {null}
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={message.id}
                        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                          message.role === "user"
                            ? "ml-auto bg-accent/20 text-foreground"
                            : "mx-auto bg-white/10 text-muted-foreground"
                        }`}
                      >
                        <p className="whitespace-pre-line">{message.content}</p>
                        {message.role === "system" && showIdentityDetails ? (
                          <div className="mt-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                            {session.userId ? `User ID: ${session.userId}` : null}
                            {session.userId && session.tenantId ? " • " : null}
                            {session.tenantId ? `Company ID: ${session.tenantId}` : null}
                          </div>
                        ) : null}
                        {message.status === "streaming" ? (
                          <span className="mt-2 inline-block text-[10px] uppercase tracking-[0.2em] text-accent/70">
                            streaming...
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                {isStreaming ? (
                  <div className="max-w-[85%] rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-muted-foreground">
                    Pensando...
                  </div>
                ) : null}
              </div>
            </div>

          </div>

	          <div className="glass-subtle flex items-end gap-3 p-4">
            <div className="flex-1 space-y-3">
              {attachmentIntake.enabled ? (
                <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      ref={attachmentInputRef}
                      type="file"
                      accept={attachmentIntake.acceptedMimeTypes?.join(",")}
                      className="hidden"
                      onChange={(event) => {
                        setSelectedAttachment(event.target.files?.[0] ?? null);
                        setAttachmentMode("upload_file");
                        setPastedArtifactText("");
                        setAttachmentUploadError(null);
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => attachmentInputRef.current?.click()}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-foreground transition hover:border-accent/40"
                    >
                      {attachmentPrimaryActionLabel}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAttachmentMode("paste_text");
                        setSelectedAttachment(null);
                        if (attachmentInputRef.current) {
                          attachmentInputRef.current.value = "";
                        }
                        setAttachmentUploadError(null);
                      }}
                      className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] transition ${
                        attachmentMode === "paste_text"
                          ? "border-accent/40 bg-accent/15 text-accent"
                          : "border-white/10 bg-white/5 text-foreground"
                      }`}
                    >
                      {attachmentSecondaryActionLabel}
                    </button>
                    {attachmentDocumentOptions.length > 0 ? (
                      <select
                        value={attachmentDocumentType}
                        onChange={(event) => setAttachmentDocumentType(event.target.value)}
                        className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-foreground outline-none"
                      >
                        {attachmentDocumentOptions.map((option) => (
                          <option key={option} value={option}>
                            {option.replace(/_/g, " ")}
                          </option>
                        ))}
                      </select>
                    ) : null}
                    {attachmentAnalysisOptions.length > 0 ? (
                      <select
                        value={attachmentAnalysisMode}
                        onChange={(event) => setAttachmentAnalysisMode(event.target.value)}
                        className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-foreground outline-none"
                      >
                        {attachmentAnalysisOptions.map((option) => (
                          <option key={option} value={option}>
                            {option.replace(/_/g, " ")}
                          </option>
                        ))}
                      </select>
                    ) : null}
                  </div>
                  {attachmentHelpText ? (
                    <p className="mt-2 text-xs text-muted-foreground">{attachmentHelpText}</p>
                  ) : null}
                  {attachmentUploadError ? <p className="mt-2 text-xs text-red-400">{attachmentUploadError}</p> : null}
                  {selectedAttachment ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-foreground">
                      <span>{selectedAttachment.name}</span>
                      <span className="text-muted-foreground">
                        {Math.max(1, Math.round(selectedAttachment.size / 1024))} KB
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          clearAttachmentComposer({ resetMode: false });
                        }}
                        className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-muted-foreground transition hover:border-accent/40"
                      >
                        Remover
                      </button>
                    </div>
                  ) : null}
                  {attachmentMode === "paste_text" ? (
                    <textarea
                      value={pastedArtifactText}
                      onChange={(event) => setPastedArtifactText(event.target.value)}
                      placeholder="Cole aqui a cláusula, o trecho do contrato ou o texto que você quer analisar"
                      className="mt-3 min-h-[96px] w-full resize-none rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/30"
                    />
                  ) : null}
                </div>
              ) : null}
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder={mainComposerPlaceholder}
                className="min-h-[64px] w-full resize-none rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>
	            <button
	              type="button"
	              onClick={handleNewConversation}
	              className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground transition hover:border-accent/40"
	            >
	              Nova conversa
	            </button>
	            {conversation.policy?.requiresConfirmation && runId ? (
	              <button
                type="button"
                onClick={handleApprove}
                className="rounded-full border border-accent/60 bg-accent/20 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-accent transition hover:border-accent hover:bg-accent/30"
              >
                Aprovar
              </button>
            ) : null}
	            <button
	              type="button"
	              onClick={handleSend}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-foreground transition hover:border-accent/40 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!canSend}
            >
              {isUploadingAttachment ? "Enviando..." : "Enviar"}
            </button>
          </div>
        </div>

      </div>

      {showGovernanceReport ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-4xl overflow-hidden rounded-3xl border border-white/10 bg-surface/95 shadow-2xl">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 px-6 py-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent">Governanca</p>
                <h3 className="mt-2 text-2xl font-semibold text-foreground">Relatorio de Governanca</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  User: {session.userId ?? "n/a"} • Tenant: {session.tenantId ?? "n/a"} • Workspace: {effectiveWorkspaceId ?? "n/a"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.2em]">
                <button
                  type="button"
                  onClick={() => {
                    const details = buildSupportCopy(governanceItems);
                    navigator.clipboard
                      .writeText(details)
                      .then(() => setCopyToast("IDs completos copiados para suporte."))
                      .catch(() => setCopyToast("Nao foi possivel copiar."));
                  }}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 font-semibold text-foreground transition hover:border-accent/40"
                >
                  Copiar para suporte
                </button>
                <button
                  type="button"
                  onClick={() => exportGovernanceReport(governanceItems)}
                  className="rounded-full border border-accent/60 bg-accent/20 px-3 py-1.5 font-semibold text-accent transition hover:border-accent hover:bg-accent/30"
                >
                  Exportar PDF de Auditoria
                </button>
                <button
                  type="button"
                  onClick={() => setShowGovernanceReport(false)}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 font-semibold text-foreground transition hover:border-accent/40"
                >
                  Fechar
                </button>
              </div>
            </div>

            <div className="max-h-[70vh] overflow-y-auto px-6 py-6">
              {governanceLoading ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-muted-foreground">
                  Carregando relatorio...
                </div>
              ) : governanceError ? (
                <div className="rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
                  {governanceError}
                </div>
              ) : (
                <>
                  <div className="grid gap-6 lg:grid-cols-2">
                    <section className="space-y-3">
                      <header className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-foreground">Recomendacoes adotadas</h4>
                        <span className="pill text-[11px] text-muted-foreground">{adoptedItems.length}</span>
                      </header>
                      {adoptedItems.length === 0 ? (
                        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-muted-foreground">
                          Nenhuma recomendacao adotada registrada.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {adoptedItems.map((item) => {
                            const title = item.payload.tatica ?? item.payload.key ?? "Recomendacao";
                            const hash = item.ledgerHash ? `0x${item.ledgerHash}` : "0x?";
                            return (
                              <article key={item.id} className="rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-muted-foreground">
                                <p className="text-sm font-semibold text-foreground">{title}</p>
                                <p className="mt-1">Run: {item.runId} • Agente: {item.agent ?? "-"}</p>
                                <p className="mt-1">Ledger Hash: {hash}</p>
                                <p className="mt-1">Timestamp: {item.createdAt}</p>
                              </article>
                            );
                          })}
                        </div>
                      )}
                    </section>

                    <section className="space-y-3">
                      <header className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-foreground">Acoes aprovadas</h4>
                        <span className="pill text-[11px] text-muted-foreground">{approvedItems.length}</span>
                      </header>
                      {approvedItems.length === 0 ? (
                        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-muted-foreground">
                          Nenhuma aprovacao registrada.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {approvedItems.map((item) => {
                            const hash = item.ledgerHash ? `0x${item.ledgerHash}` : "0x?";
                            return (
                              <article key={item.id} className="rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-muted-foreground">
                                <p className="text-sm font-semibold text-foreground">Execucao aprovada</p>
                                <p className="mt-1">Run: {item.runId} • Agente: {item.agent ?? "-"}</p>
                                <p className="mt-1">Ledger Hash: {hash}</p>
                                <p className="mt-1">Timestamp: {item.createdAt}</p>
                              </article>
                            );
                          })}
                        </div>
                      )}
                    </section>
                  </div>
                  <section className="mt-6 space-y-3">
                    <header className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-foreground">Conversas finalizadas</h4>
                      <span className="pill text-[11px] text-muted-foreground">{conversationItems.length}</span>
                    </header>
                    {conversationItems.length === 0 ? (
                      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-muted-foreground">
                        Nenhuma conversa finalizada registrada.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {conversationItems.map((item) => {
                          const hash = item.ledgerHash ? `0x${item.ledgerHash}` : "0x?";
                          const document = item.payload.document ?? "";
                          return (
                            <article
                              key={item.id}
                              className="rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-muted-foreground"
                            >
                              <p className="text-sm font-semibold text-foreground">Documento de conversa</p>
                              <p className="mt-1">Run: {item.runId} • Agente: {item.agent ?? "-"}</p>
                              <p className="mt-1">Ledger Hash: {hash}</p>
                              <p className="mt-1">Timestamp: {item.createdAt}</p>
                              {document ? (
                                <details className="mt-2">
                                  <summary className="cursor-pointer text-[10px] uppercase tracking-widest text-muted-foreground/60">
                                    Ver documento
                                  </summary>
                                  <pre className="mt-2 whitespace-pre-wrap break-words rounded-lg border border-white/10 bg-black/40 p-3 text-[10px] text-emerald-200/80">
                                    {document}
                                  </pre>
                                </details>
                              ) : null}
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </section>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {evidenceEvent ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-surface/95 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent">Evidência</p>
                <h3 className="mt-2 text-xl font-semibold text-foreground">Registro no Ledger</h3>
              </div>
              <button
                type="button"
                onClick={() => setEvidenceEvent(null)}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-foreground transition hover:border-accent/40"
              >
                Fechar
              </button>
            </div>
            <div className="mt-4 space-y-3 text-xs text-muted-foreground">
              <div className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2">
                Evidência ID: {evidenceEvent.id}
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2">
                Evento: {evidenceEvent.type}
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2">
                Timestamp: {new Date(evidenceEvent.createdAt).toLocaleString("pt-BR")}
              </div>
              <p className="text-[11px]">
                Esta evidência comprova que a aprovação humana foi registrada e vinculada ao ledger de auditoria.
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
