import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { selfServiceConfigs } from "@/pages/self-service/config";
import {
  apiApproveRun,
  apiAdoptRecommendation,
  apiCreateSession,
  apiFinalizeConversation,
  apiGetGovernanceReport,
  apiGetRun,
  apiListRunEvents,
  BASE_URL,
  type RunEvent,
} from "@/lib/api";
import { extractDocAndRecs, type ExtractedRec } from "@/utils";
import { useSession } from "@/state/sessionStore";
import { useAgentExecution } from "@/hooks/useAgentExecution";
import { useConversation, type ConversationStatus, type ConversationPolicy } from "@/hooks/useConversation";

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  status?: "streaming" | "done";
};

type ThreadSnapshot = {
  messages: ChatMessage[];
  runId: string | null;
};

function normalizeAgentKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
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

function buildOptimizedPrompt(input: string) {
  const cleaned = input.trim().replace(/\s+/g, " ");
  return [
    "Contexto: usuário precisa de uma resposta clara e acionável.",
    "Instruções: responda com estrutura, destaque próximos passos e evite jargão.",
    `Pedido: ${cleaned}`,
  ].join("\n");
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
  workspaceId,
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
  workspaceId?: string;
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
  const eventSourceRef = useRef<EventSource | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  const seenEventsRef = useRef<Set<string>>(new Set());
  const lastEventIdRef = useRef<string | null>(null);
  const runSummaryLoadedRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const session = useSession();
  const effectiveWorkspaceId = workspaceId ?? session.workspaceId;
  const { executeAgent } = useAgentExecution();
  const conversation = useConversation();
  const threadKey = useMemo(() => {
    const tenant = session.tenantId ?? "tenant";
    const workspace = effectiveWorkspaceId ?? "workspace";
    const agent = activeAgentId ?? FALLBACK_AGENT.id;
    return `eiah:chat:${tenant}:${workspace}:${agent}`;
  }, [session.tenantId, effectiveWorkspaceId, activeAgentId]);

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
      pushMessage({ id: `assistant-${event.id}`, role: "assistant", content: message, status: "done" });
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
        pushMessage({
          id: `assistant-summary-${targetRunId}`,
          role: "assistant",
          content,
          status: "done",
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
    if (!trimmed || isStreaming) return;
    const resolvedAgentId = activeAgentId ?? FALLBACK_AGENT.id;
    setInput("");
    pushMessage({ id: `user-${Date.now()}`, role: "user", content: trimmed });
    stopStreaming();
    onRunIdChange?.(null);
    setIsStreaming(true);
    const resetLedger = baseLedger();
    setLedger(resetLedger);
    onLedgerChange?.(resetLedger);
    seenEventsRef.current = new Set();
    lastEventIdRef.current = null;
    runSummaryLoadedRef.current = null;
    conversation.analyze(trimmed);

    try {
      const response = await conversation.executeWithPolicy(resolvedAgentId, {
        agent: resolvedAgentId,
        prompt: buildOptimizedPrompt(trimmed),
        workspaceId: effectiveWorkspaceId,
        metadata: {
          source: "chat-agent-launcher",
          promptOptimized: true,
          originalPrompt: trimmed,
          agentFallback: !activeAgentId,
        },
      });
      const created = response.data;
      setRunId(created.id);
      onRunIdChange?.(created.id);
      pushMessage({
        id: `system-${created.id}`,
        role: "system",
        content: `Run criada: ${created.id}. Aguardando eventos...`,
      });
      await startSse(created.id);
    } catch (error) {
      setIsStreaming(false);
      updateSseStatus("error");
      const message = error instanceof Error ? error.message : "Falha ao iniciar run.";
      pushMessage({ id: `assistant-error-${Date.now()}`, role: "assistant", content: message, status: "done" });
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

  const buildStagedResponse = (docMarkdown: string, recs: ExtractedRec[]) => {
    const text = docMarkdown?.trim() ?? "";
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
      recs[0]?.rationale ??
      recs[0]?.tatica ??
      "";

    const bullets = lines
      .filter((line) => line.startsWith("- ") || line.startsWith("• "))
      .map((line) => line.replace(/^[-•]\s*/, ""))
      .slice(0, 4);

    const nextStepsRaw = recs[0]?.proximos_passos ?? "";
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

    return { paragraph, bullets, nextSteps };
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

  return (
    <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-surface/80 p-8 shadow-lg shadow-black/20">
      <div className="absolute -left-32 top-0 h-64 w-64 rounded-full bg-accent/20 blur-3xl" aria-hidden />
      <div className="absolute -right-10 top-40 h-72 w-72 rounded-full bg-white/5 blur-3xl" aria-hidden />

      <header className="relative z-10 mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accent">Chat Agent Launcher</p>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Converse com o EIAH (Curator), gere prompts otimizados e acompanhe políticas de acesso + ledger nos painéis. Atualização em tempo real via SSE, com fallback em polling quando necessário.
          </p>
        </div>
      </header>

      <div className="relative z-10 grid gap-6">
        <div className="flex h-full flex-col gap-4">
          <div className="glass-subtle flex-1 p-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-muted-foreground">
                  Conversa ativa • {activeAgent?.title ?? "Curator"}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {(session.userId || session.tenantId) ? (
                    <div className="flex flex-wrap items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                      {session.userId ? `Usuário ${maskIdentity(session.userId, "usr")}` : "Usuário usr_…"}
                      {session.tenantId ? `• Empresa ${maskIdentity(session.tenantId, "ten")}` : "• Empresa ten_…"}
                      <button
                        type="button"
                        onClick={openGovernanceReport}
                        className="rounded-full border border-white/10 bg-white/10 px-2 py-0.5 text-[9px] uppercase tracking-[0.25em] text-muted-foreground transition hover:border-accent/40 hover:text-accent"
                      >
                        Relatorio de Governanca
                      </button>
                    </div>
                  ) : null}
                  {(session.tenantId || effectiveWorkspaceId || activeAgentId) ? (
                    <div className="flex flex-wrap items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                      {session.tenantId ? `Tenant ${session.tenantId}` : "Tenant —"}
                      {effectiveWorkspaceId ? `• Workspace ${effectiveWorkspaceId}` : "• Workspace —"}
                      {activeAgentId ? `• Agente ${activeAgentId}` : "• Agente —"}
                    </div>
                  ) : null}
                  {copyToast ? (
                    <div className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-[10px] uppercase tracking-[0.25em] text-emerald-200">
                      {copyToast}
                    </div>
                  ) : null}
                  {runId ? (
                    <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                      Run: {runId}
                    </div>
                  ) : null}
                </div>
              </div>

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
                              const displayRunId = extractedRunId || (message as any).runId || "";

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
                                        const staged = buildStagedResponse(docMarkdown ?? "", recs);
                                        const paragraph = staged.paragraph || "Resumo indisponível.";
                                        const bulletsBlock =
                                          staged.bullets.length > 0
                                            ? `\n\n**Pontos-chave**\n${staged.bullets.map((b) => `- ${b}`).join("\n")}`
                                            : "";
                                        const nextStepsBlock =
                                          staged.nextSteps.length > 0
                                            ? `\n\n**Próximos passos**\n${staged.nextSteps.map((step) => `- ${step}`).join("\n")}`
                                            : "";
                                        return `${paragraph}${bulletsBlock}${nextStepsBlock}`;
                                      })()}
                                    </ReactMarkdown>
                                  </div>

                                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                                    <span>Quer aprofundar algo?</span>
                                    <div className="flex flex-wrap gap-2">
                                      {[
                                        "Mostre um exemplo pratico",
                                        "Explique integracao com BullMQ",
                                        "Quais riscos comuns?",
                                      ].map((reply) => (
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

                                  {technicalRaw?.trim() ? (
                                    <details className="group mt-2 rounded-2xl border border-white/5 bg-black/20 px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground/50">
                                      <summary className="cursor-pointer list-none">
                                        <span className="mr-1 inline-block transition-transform group-open:rotate-90">
                                          ▶
                                        </span>
                                        Ledger Tecnico
                                      </summary>
                                      <div className="mt-2 overflow-x-auto rounded-lg border border-white/5 bg-black/40 p-3">
                                        <pre className="whitespace-pre-wrap break-all font-mono text-[10px] leading-tight text-emerald-500/80">
                                          {technicalRaw}
                                        </pre>
                                      </div>
                                    </details>
                                  ) : null}
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
              </div>
            </div>

          </div>

          <div className="glass-subtle flex items-end gap-3 p-4">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Descreva o objetivo, contexto e restricoes..."
              className="min-h-[64px] flex-1 resize-none rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
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
              onClick={handleFinalizeConversation}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground transition hover:border-accent/40 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!runId || conversationFinalizing}
            >
              Encerrar conversa
            </button>
            <button
              type="button"
              onClick={handleSend}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-foreground transition hover:border-accent/40 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!input.trim() || isStreaming}
            >
              Enviar
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
