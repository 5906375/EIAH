import { Buffer } from "node:buffer";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

/* ──────────────────────────────────────────────
   CORE — Orquestração, Ações, Filas, Eventos
   ────────────────────────────────────────────── */
import {
  AgentOrchestrator,
  ConsoleTelemetryBridge,
  DefaultPlanManager,
  buildRecommendationPrompt,
  generateStatefulRecommendations,
  publishAction,
  createActionQueueEvents,
  consume,
  createLogger,
  bindLogger,
  withCostContext,
  enqueueRunAtivoUniversal,
  PlanStepStore,
  getRegisteredActionDefinitions,
  type AgentRecommendationState,
  type RecommendationCandidate,
  type PreviousRun as EnginePreviousRun,
  type GenerateRecommendationsResult,
  type PreviousRecommendation,
  type RecommendationExecution,
  type RegisteredAction,
  type RunEventStore,
  type OrchestratorPlanStep,
  type OrchestratorRunEvent,
  type RunQueuePayload,
  type RunAtivoUniversalJobPayload,
  defaultRunGuardrails,
  runGuardrails,
  recordGuardrailAudit,
} from "@eiah/core";

import { MCPExecutor, ToolRegistry } from "@repo/mcp-runner";
import type { MemoryRecord, MemoryScope, MemorySnapshot } from "@eiah/core";
import { prismaGlobal } from "@repo/db";

/* ──────────────────────────────────────────────
   LLM Execution (Gateway executor unificado)
   ────────────────────────────────────────────── */
import {
  executeLlmStep,
  type LlmExecutorResult,
} from "../orchestrator/llmExecutor";

/* ──────────────────────────────────────────────
   Queue Events
   ────────────────────────────────────────────── */
import type { QueueEvents } from "bullmq";

/* ──────────────────────────────────────────────
   Billing, Profiles, Runs, Run Events
   ────────────────────────────────────────────── */
import { estimateCostCents, chargeRun } from "../services/billing";
import { getAgentProfile, resolveAgentId } from "../services/agents";
import {
  finalizeRunRecord,
  updateRunStatus,
  listRecentRunsForAgent,
} from "../services/runs";
import { emitRunEvent } from "../services/runEventEmitter";
import { judgeResult } from "../services/judge";
import { resolveKnowledgeContext } from "../services/knowledgeGate";
import { resolveConversationPersistenceDecision } from "../services/conversationPersistencePolicy";

/* ──────────────────────────────────────────────
   Recommendations & Memory
   ────────────────────────────────────────────── */
import {
  getAgentRecommendationState,
  saveAgentRecommendationState,
  type StoredRecommendationState,
} from "../services/recommendations";

import { getMemoryService } from "../services/memory";
import { createGuardrailLedgerStore } from "../services/guardrailLedgerStore";
import { appendSclRecord } from "../services/sclLedger";

/* ──────────────────────────────────────────────
   Action Registry / Tenant Actions
   ────────────────────────────────────────────── */
import { tenantActionResolver } from "../actions/tenantActionRegistry";

/* ──────────────────────────────────────────────
   BullMQ Worker para consumir a RUNS queue
   ────────────────────────────────────────────── */
import { Worker } from "bullmq";
import { QueueName } from "@eiah/contracts"; // ajuste se o Enum estiver em outro pacote


const DEFAULT_PREVIOUS_RUN_LIMIT = 5;
const DEFAULT_PREVIOUS_ITEMS_LIMIT = 5;
const DEFAULT_PROMPT_CONTEXT_CHARS = 4000;
const DEFAULT_MAX_RECOMMENDATIONS = 5;
const DEFAULT_EXPLORATION_PCT = 20;
const DEFAULT_MEMORY_SNAPSHOT_TOPK = 20;
const DEFAULT_MEMORY_SHORT_TERM_MAX = 200;
const DEFAULT_MEMORY_CONTENT_MAX_CHARS = 2000;

let actionQueueEventsPromise: Promise<QueueEvents> | null = null;
let governanceWarningLogged = false;
const workerLogger = createLogger({ component: "run-worker" });
type RecentRunRecord = Awaited<ReturnType<typeof listRecentRunsForAgent>>[number];
type ScopedRunAtivoJobPayload = RunAtivoUniversalJobPayload & {
  tenantId: string;
  workspaceId: string;
};

function normalizeActionName(value: string) {
  return value.trim().toLowerCase();
}

async function resolveActionsForExecution(tenantId: string, workspaceId: string) {
  const configured = tenantActionResolver(tenantId) ?? {};
  const configuredCount = Object.keys(configured).length;
  const definitions = getRegisteredActionDefinitions();

  const registered = Object.keys(definitions).filter((name) => Boolean(name && name.trim()));
  const canonicalByNormalized = new Map<string, string>();
  for (const actionName of registered) {
    const normalized = normalizeActionName(actionName);
    if (!canonicalByNormalized.has(normalized)) {
      canonicalByNormalized.set(normalized, actionName);
    }
  }

  const dbPolicies = await prismaGlobal.tenantActionPolicy.findMany({
    where: {
      tenantId,
      OR: [{ workspaceId }, { workspaceId: null }],
      allowed: true,
    },
    select: { actionName: true },
  });

  const dbAllowedCanonical = dbPolicies
    .map((row) => canonicalByNormalized.get(normalizeActionName(row.actionName)))
    .filter((name): name is string => Boolean(name));
  const dbAllowedRaw = dbPolicies
    .map((row) => row.actionName.trim())
    .filter((name): name is string => Boolean(name));

  // Fallback seguro: sem policies resolvidas e sem resolver custom => libera catálogo registrado.
  if (dbAllowedCanonical.length === 0 && dbAllowedRaw.length === 0 && configuredCount === 0) {
    return definitions;
  }

  const merged: Record<string, RegisteredAction> = { ...(configured as Record<string, RegisteredAction>) };
  for (const actionName of dbAllowedCanonical) {
    const def = definitions[actionName];
    if (def) {
      merged[actionName] = def;
    }
  }
  // Quando a policy permite ações IMOB que não estão no catálogo core,
  // ainda marcamos como permitidas para não bloquear execução no guard local.
  for (const rawName of dbAllowedRaw) {
    if (merged[rawName]) continue;
    const canonical = canonicalByNormalized.get(normalizeActionName(rawName));
    if (canonical && definitions[canonical]) {
      merged[canonical] = definitions[canonical];
      continue;
    }
    merged[rawName] = {
      name: rawName,
      version: "1.0.0",
      description: "Tenant policy allowed action",
      handler: async () => ({ status: "error", error: `Action ${rawName} not registered in core catalog` }),
    };
  }
  return merged;
}

function normalizeStoredAgentState(
  state: StoredRecommendationState | null | undefined
): AgentRecommendationState | null {
  if (!state) {
    return null;
  }

  const version = typeof state.version === "number" ? state.version : 1;

  return {
    recommendations: { ...(state.recommendations ?? {}) },
    client_preferences: state.client_preferences ? { ...state.client_preferences } : undefined,
    best_performing_tactics: state.best_performing_tactics
      ? [...state.best_performing_tactics]
      : undefined,
    version,
  };
}

function toStoredState(state: AgentRecommendationState): StoredRecommendationState {
  return {
    ...state,
  };
}

function normalizeRecommendationExecution(raw: unknown): RecommendationExecution | null {

  if (!isPlainObject(raw)) {
    return null;
  }

  const record = raw as Record<string, unknown>;

  const api =
    typeof record.api_sugerida === "string"
      ? record.api_sugerida
      : typeof record.api === "string"
      ? record.api
      : null;
  const task =
    typeof record.tipo_tarefa === "string"
      ? record.tipo_tarefa
      : typeof record.tipo === "string"
      ? record.tipo
      : null;
  const cost =
    typeof record.custo_estimado_tokens === "number"
      ? record.custo_estimado_tokens
      : typeof record.tokens === "number"
      ? record.tokens
      : null;

  if (!api || !task || cost === null) {
    return null;
  }

  return {
    api_sugerida: api,
    tipo_tarefa: task,
    custo_estimado_tokens: cost,
    modelo_alternativo:
      typeof record.modelo_alternativo === "string" ? record.modelo_alternativo : undefined,
  };
}

async function loadMemorySnapshot(
  memoryService: ReturnType<typeof getMemoryService>,
  scope: MemoryScope
): Promise<MemorySnapshot | null> {
  try {
    return await memoryService.snapshot(scope, {
      topK: getEnvNumber("MEMORY_SNAPSHOT_TOP_K", DEFAULT_MEMORY_SNAPSHOT_TOPK),
    });
  } catch (error) {
    console.warn("[runWorker] Failed to load memory snapshot", {
      scope,
      error: error instanceof Error ? error.message : error,
    });
    return null;
  }
}

type ReplayInfo = {
  sourceRunId?: string;
  requestedAt?: string;
};

function extractReplayInfo(metadata: Record<string, unknown>) {
  const replay = metadata.replay;
  if (!replay || typeof replay !== "object") return null;
  const record = replay as Record<string, unknown>;
  const sourceRunId =
    typeof record.sourceRunId === "string" && record.sourceRunId.trim()
      ? record.sourceRunId.trim()
      : undefined;
  const requestedAt =
    typeof record.requestedAt === "string" && record.requestedAt.trim()
      ? record.requestedAt.trim()
      : undefined;
  if (!sourceRunId && !requestedAt) return null;
  return { sourceRunId, requestedAt };
}

async function emitRunTokenEvents(params: {
  runId: string;
  tenantId: string;
  workspaceId: string;
  userId?: string;
  outputText?: string | null;
}): Promise<{ charCount: number; eventCount: number; totalChunks: number; truncated: boolean; hash: string } | null> {
  const outputText = typeof params.outputText === "string" ? params.outputText : "";
  if (!outputText.trim()) return null;

  const maxChars = getEnvNumber("RUN_TOKEN_MAX_CHARS", 8000);
  const chunkSize = Math.max(getEnvNumber("RUN_TOKEN_CHUNK_SIZE", 200), 40);
  const maxEvents = Math.max(getEnvNumber("RUN_TOKEN_MAX_EVENTS", 200), 1);
  const trimmed = outputText.slice(0, maxChars);
  const hash = crypto.createHash("sha256").update(trimmed).digest("hex");
  const chunks: string[] = [];
  for (let i = 0; i < trimmed.length; i += chunkSize) {
    chunks.push(trimmed.slice(i, i + chunkSize));
  }
  const total = chunks.length;
  const truncated = total > maxEvents;
  const toEmit = chunks.slice(0, maxEvents);

  for (let index = 0; index < toEmit.length; index += 1) {
    await emitRunEvent({
      runId: params.runId,
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      userId: params.userId,
      type: "run.token",
      payload: {
        token: toEmit[index],
        index,
        total,
        truncated,
        source: "final-output",
      },
    });
  }

  return {
    charCount: trimmed.length,
    eventCount: toEmit.length,
    totalChunks: total,
    truncated,
    hash,
  };
}

async function recordReplayCompletedIfNeeded(params: {
  runId: string;
  tenantId: string;
  workspaceId: string;
  userId?: string;
  replayInfo: ReplayInfo | null;
  status: "success" | "error" | "blocked";
  reason?: string;
}) {
  if (!params.replayInfo) return;
  await emitRunEvent({
    runId: params.runId,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    userId: params.userId,
    type: "run.replay.completed",
    payload: {
      status: params.status,
      reason: params.reason,
      sourceRunId: params.replayInfo.sourceRunId ?? params.runId,
      requestedAt: params.replayInfo.requestedAt,
      finishedAt: new Date().toISOString(),
    },
  });
}



async function getActionQueueEvents() {
  if (!actionQueueEventsPromise) {
    actionQueueEventsPromise = createActionQueueEvents();
  }
  return actionQueueEventsPromise;
}

function createRunEventStoreAdapter(base: {
  runId: string;
  tenantId: string;
  workspaceId: string;
  userId?: string;
}): RunEventStore {
  return {
    async record(event: OrchestratorRunEvent) {
      await emitRunEvent({
        runId: event.runId ?? base.runId,
        tenantId: event.tenantId ?? base.tenantId,
        workspaceId: event.workspaceId ?? base.workspaceId,
        userId: event.userId ?? base.userId,
        type: event.type,
        payload: event.payload,
      });
    },
  };
}

function mcpConfigFromEnv() {
  const enforceRaw = (process.env.MCP_ENFORCE_CONTRACTS ?? "true").trim().toLowerCase();
  const enforceEnabled = enforceRaw === "1" || enforceRaw === "true" || enforceRaw === "on";

  const proxyRaw = (process.env.MCP_PROXY_ALL_ACTIONS ?? "false").trim().toLowerCase();
  const proxyAll = proxyRaw === "1" || proxyRaw === "true" || proxyRaw === "on";

  const defaultVersion = (process.env.MCP_DEFAULT_VERSION ?? "1.0.0").trim() || "1.0.0";
  return { enforceEnabled, proxyAll, defaultVersion };
}

function logGovernanceStatus(logger: ReturnType<typeof createLogger>) {
  if (governanceWarningLogged) return;
  governanceWarningLogged = true;

  const missing: string[] = [];
  if (!process.env.INTENT_SIGNATURE_SECRET) {
    missing.push("INTENT_SIGNATURE_SECRET");
  }

  const mcpConfig = mcpConfigFromEnv();
  if (!mcpConfig.enforceEnabled) {
    missing.push("MCP_ENFORCE_CONTRACTS");
  }
  if (!mcpConfig.proxyAll) {
    missing.push("MCP_PROXY_ALL_ACTIONS");
  }

  const outboxRaw = (process.env.RUN_EVENTS_USE_OUTBOX ?? "false").trim().toLowerCase();
  const outboxEnabled = outboxRaw === "1" || outboxRaw === "true" || outboxRaw === "on";
  if (!outboxEnabled) {
    missing.push("RUN_EVENTS_USE_OUTBOX");
  }

  const redisUrl = process.env.RUN_EVENTS_REDIS_URL || process.env.REDIS_URL;
  if (outboxEnabled && !redisUrl) {
    missing.push("REDIS_URL");
  }

  if (missing.length > 0) {
    logger.warn(
      {
        missing,
      },
      "run.worker.governance_mode_unconfigured"
    );
  }
}

function resolveMcpToolVersion(metadata: unknown, fallback: string) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return fallback;
  const record = metadata as Record<string, unknown>;
  const candidates = ["toolVersion", "contractVersion", "version"];
  for (const key of candidates) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return fallback;
}

function buildIntentSignature(params: {
  tenantId: string;
  workspaceId: string;
  runId: string;
  secret: string;
}) {
  const payload = `${params.tenantId}:${params.workspaceId}:${params.runId}`;
  return crypto.createHmac("sha256", params.secret).update(payload).digest("hex");
}

function verifyIntentSignature(params: {
  tenantId: string;
  workspaceId: string;
  runId: string;
  metadata?: unknown;
}) {
  const secret = process.env.INTENT_SIGNATURE_SECRET;
  if (!secret) {
    throw new Error("Intent signature secret not configured");
  }

  const intentSignature =
    params.metadata && typeof params.metadata === "object" && !Array.isArray(params.metadata)
      ? String((params.metadata as Record<string, unknown>).intentSignature ?? "")
      : "";
  if (!intentSignature) {
    throw new Error("Intent signature missing");
  }

  const expected = buildIntentSignature({
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    runId: params.runId,
    secret,
  });

  const receivedBuffer = Buffer.from(intentSignature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  if (
    receivedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(receivedBuffer, expectedBuffer)
  ) {
    throw new Error("Intent signature invalid");
  }
}

function isContentIntent(prompt: string) {
  const lower = prompt.toLowerCase();
  return lower.includes("documenta") || lower.includes("documentação") || lower.includes("documentacao") || lower.includes("exemplo");
}

type DocSection = {
  title: string;
  body: string;
};

let cachedDocSections: DocSection[] | null = null;

async function loadDocSections() {
  if (cachedDocSections) return cachedDocSections;
  const docPath = path.resolve(process.cwd(), "docs/eiah-user-guide.md");
  try {
    const content = await fs.readFile(docPath, "utf8");
    const lines = content.split(/\r?\n/);
    const sections: DocSection[] = [];
    let currentTitle = "Introducao";
    let currentBody: string[] = [];

    const pushSection = () => {
      const body = currentBody.join("\n").trim();
      if (body) {
        sections.push({ title: currentTitle, body });
      }
      currentBody = [];
    };

    lines.forEach((line) => {
      if (line.startsWith("#")) {
        pushSection();
        currentTitle = line.replace(/^#+\s*/, "").trim() || "Topico";
        return;
      }
      currentBody.push(line);
    });
    pushSection();
    cachedDocSections = sections;
    return sections;
  } catch {
    cachedDocSections = [];
    return [];
  }
}

function extractDocBullets(body: string, limit = 4) {
  const bullets = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line));
  if (bullets.length > 0) {
    return bullets.slice(0, limit).map((line) => line.replace(/^[-*]\s+/, ""));
  }
  return body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, limit);
}

async function buildDocumentationContext(prompt: string) {
  const sections = await loadDocSections();
  if (!sections.length) return "";
  const keywords = Array.from(
    new Set(
      prompt
        .toLowerCase()
        .split(/[^a-z0-9áàâãéêíóôõúç]+/i)
        .filter((word) => word.length >= 4)
    )
  );
  if (!keywords.length) return "";

  const wantsOrchestrator = prompt.toLowerCase().includes("orchestrator") || prompt.toLowerCase().includes("orquestrador");
  const scopeSections = wantsOrchestrator
    ? sections.filter((section) => section.title.toLowerCase().includes("orchestrator") || section.title.toLowerCase().includes("orquestrador"))
    : sections;
  const scored = scopeSections
    .map((section) => {
      const lower = `${section.title}\n${section.body}`.toLowerCase();
      const score = keywords.reduce((sum, word) => (lower.includes(word) ? sum + 1 : sum), 0);
      return { section, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  if (!scored.length) {
    const indexTitles = scopeSections.slice(0, 10).map((section) => `- ${section.title}`);
    return indexTitles.length > 0
      ? `Indice de topicos:\n${indexTitles.join("\n")}`
      : "";
  }

  const bullets = scored
    .flatMap((entry) => {
      const lines = extractDocBullets(entry.section.body);
      return lines.map((line) => `- ${entry.section.title}: ${line}`);
    })
    .slice(0, 8);

  return bullets.join("\n");
}

function getIntentKeyHints(prompt: string) {
  const lower = prompt.toLowerCase();
  if (lower.includes("orchestrator") || lower.includes("orquestrador")) {
    return [
      "agente_orquestrador_intro",
      "agente_orquestrador_practical_example",
      "bullmq_queues_ops",
      "run_observability_sse_polling",
      "failure_retries_timeouts",
    ];
  }
  return [];
}

export async function processRunPayload(payload: RunQueuePayload) {
    const { runId, tenantId, workspaceId, userId, prompt, metadata } = payload;
    const agent = resolveAgentId(payload.agent ?? "");
    if (!runId || !tenantId || !workspaceId || !agent || !prompt) {
      workerLogger.error(
        { runId, tenantId, workspaceId, agent: payload.agent, resolvedAgent: agent, hasPrompt: Boolean(prompt) },
        "run.worker.invalid_payload"
      );
      return;
    }

    const logger = bindLogger(workerLogger, {
      runId,
      tenantId,
      workspaceId,
      agentId: agent,
    });
    logger.info("run.worker.received");
    logGovernanceStatus(workerLogger);

    const profile = await getAgentProfile(tenantId, workspaceId, agent);
    if (!profile) {
      logger.warn(
        {
          reason: "agent_not_found",
        },
        "run.worker.aborted"
      );
      await finalizeRunRecord({
        runId,
        tenantId,
        workspaceId,
        status: "error",
        response: { error: `Agent ${agent} not found` },
        costCents: 0,
        errorCode: "AGENT_NOT_FOUND",
      });

      await emitRunEvent({
        runId,
        tenantId,
        workspaceId,
        userId,
        type: "run.failed",
        payload: {
          status: "error",
          message: `Agent ${agent} not found`,
        },
      });
      return;
    }

    await updateRunStatus({
      runId,
      tenantId,
      workspaceId,
      status: "running",
      startedAt: new Date(),
    });
    logger.info("run.worker.execution_started");

    const memoryService = getMemoryService(tenantId, workspaceId, prismaGlobal);
    const retryConfig = {
      timeoutMs: getEnvNumber("LLM_TIMEOUT_MS", 15000),
      retries: getEnvNumber("LLM_RETRIES", 3),
      baseDelayMs: getEnvNumber("LLM_RETRY_DELAY_MS", 150),
      maxDelayMs: getEnvNumber("LLM_RETRY_MAX_DELAY_MS", 2000),
      backoffFactor: getEnvNumber("LLM_RETRY_BACKOFF_FACTOR", 1.6),
      jitterRatio: getEnvNumber("LLM_RETRY_JITTER_RATIO", 0.3),
    };
    let retryConfigLogged = false;

    const baseMetadata =
      metadata && typeof metadata === "object" && !Array.isArray(metadata)
        ? { ...(metadata as Record<string, unknown>) }
        : {};
    const replayInfo = extractReplayInfo(baseMetadata);

    const memoryScope: MemoryScope = { tenantId, workspaceId, agentId: agent };
    const contentIntent = isContentIntent(prompt);
    const explorationPercentage = contentIntent
      ? 15
      : getEnvNumber("RECOMMENDATION_EXPLORATION_PCT", DEFAULT_EXPLORATION_PCT);

    const [previousRunRecords, existingStateRecord, memorySnapshot] = await Promise.all([
      listRecentRunsForAgent({
        tenantId,
        workspaceId,
        agent,
        limit: getEnvNumber("RECOMMENDATION_PREVIOUS_RUN_LIMIT", DEFAULT_PREVIOUS_RUN_LIMIT),
      }),
      getAgentRecommendationState({
        tenantId,
        workspaceId,
        agentId: agent,
      }),
      loadMemorySnapshot(memoryService, memoryScope),
    ]);

    const previousRunsForEngine: EnginePreviousRun[] = previousRunRecords.map(
      (run: RecentRunRecord) => ({
        id: run.id,
        createdAt: run.createdAt.toISOString(),
        recomendacoes: extractRecommendationsFromResponse(run.response),
      })
    );

    const trimmedPreviousRunsForPrompt = previousRunsForEngine.map((run) => ({
      id: run.id,
      createdAt: run.createdAt,
      recomendacoes: (run.recomendacoes ?? []).slice(
        0,
        getEnvNumber("RECOMMENDATION_PREVIOUS_RUN_ITEMS_LIMIT", DEFAULT_PREVIOUS_ITEMS_LIMIT)
      ),
    }));

    const agentStateForEngine = normalizeStoredAgentState(existingStateRecord?.state);

    const runtimeMetadata: Record<string, unknown> = {
      ...baseMetadata,
      previousRuns: trimmedPreviousRunsForPrompt,
      agentState: existingStateRecord?.state ?? null,
      memorySnapshot: memorySnapshot ?? undefined,
    };
    const knowledgeResolution = resolveKnowledgeContext({
      runId,
      tenantId,
      workspaceId,
      agentId: agent,
      prompt,
      metadata: runtimeMetadata,
      knowledgePolicy: (profile as { knowledgePolicy?: Record<string, unknown> | undefined }).knowledgePolicy as any,
    });
    const runtimeMetadataResolved = knowledgeResolution.metadata;

    const recommendationsPrompt = buildRecommendationPrompt({
      agentId: agent,
      runIdPlaceholder: runId,
      maxRecommendations: getEnvNumber("RECOMMENDATION_MAX_ITEMS", DEFAULT_MAX_RECOMMENDATIONS),
      explorationPercentage,
    });

    const historySnippet = [
      "### CONTEXTO HISTÓRICO (truncado)",
      `previousRuns=${truncateJson(
        trimmedPreviousRunsForPrompt,
        getEnvNumber("RECOMMENDATION_PROMPT_CONTEXT_MAX_CHARS", DEFAULT_PROMPT_CONTEXT_CHARS) / 2
      )}`,
      `agentState=${truncateJson(
        existingStateRecord?.state ?? {},
        getEnvNumber("RECOMMENDATION_PROMPT_CONTEXT_MAX_CHARS", DEFAULT_PROMPT_CONTEXT_CHARS) / 2
      )}`,
    ].join("\n");

    const intentKeyHints = getIntentKeyHints(prompt);
    const documentationContext = contentIntent ? await buildDocumentationContext(prompt) : "";
    const intentHintsBlock =
      intentKeyHints.length > 0
        ? `### CHAVES SUGERIDAS (diversidade por intenção)\n${intentKeyHints
            .map((key) => `- ${key}`)
            .join("\n")}`
        : "";
    const docContextBlock = documentationContext
      ? `### DOCUMENTACAO CONTEXTUAL (use para responder em bullets)\n${documentationContext}`
      : "";
    const promptForExecution = [
      recommendationsPrompt,
      historySnippet,
      intentHintsBlock,
      docContextBlock,
      "### SOLICITAÇÃO ORIGINAL",
      prompt,
    ]
      .filter(Boolean)
      .join("\n\n");

    await emitRunEvent({
      runId,
      tenantId,
      workspaceId,
      userId,
      type: "run.started",
        payload: {
          agent,
          promptPreview: promptForExecution.slice(0, 200),
          memory: {
            previousRuns: trimmedPreviousRunsForPrompt.length,
            hasState: Boolean(existingStateRecord),
            shortTerm: memorySnapshot?.shortTerm.length ?? 0,
            longTerm: memorySnapshot?.longTerm.length ?? 0,
            vectorMatches: memorySnapshot?.vectorMatches.length ?? 0,
          },
        },
      });

    await emitRunEvent({
      runId,
      tenantId,
      workspaceId,
      userId,
      type: "run.reco.exploration",
      payload: {
        exploration_used: contentIntent,
        epsilon: 0.15,
      },
    });

    await emitRunEvent({
      runId,
      tenantId,
      workspaceId,
      userId,
      type: "run.knowledge.resolved",
      payload: {
        blocked: knowledgeResolution.blocked,
        reasonCode: knowledgeResolution.reasonCode ?? null,
        groundedFactKeys: Object.keys(knowledgeResolution.groundedFacts),
        resolvedSources: knowledgeResolution.resolvedSources,
        provenance: knowledgeResolution.provenance,
      },
    });

    if (replayInfo) {
      await emitRunEvent({
        runId,
        tenantId,
        workspaceId,
        userId,
        type: "run.replay.started",
        payload: {
          sourceRunId: replayInfo.sourceRunId ?? runId,
          requestedAt: replayInfo.requestedAt,
        },
      });
    }

    const startedAt = Date.now();
    type ExecutionSnapshot = {
      outputText: string;
      rawResponse: unknown;
      traceId?: string;
      tookMs?: number;
    };
    let executionResult: ExecutionSnapshot | null = null;

    try {
      const planManager = new DefaultPlanManager({ agentId: agent });
      const eventStore = createRunEventStoreAdapter({
        runId,
        tenantId,
        workspaceId,
        userId,
      });
      const stepStore = new PlanStepStore(prismaGlobal);
      const mcpConfig = mcpConfigFromEnv();

      const mcpExecutorTool = {
        run: async (actionName: string, params: unknown, context: any) => {
          if (!mcpConfig.enforceEnabled) {
            throw new Error("MCP enforcement disabled (MCP_ENFORCE_CONTRACTS=false)");
          }

          const allowedActions = context?.actions ?? {};
          if (!allowedActions[actionName]) {
            throw new Error(`Action "${actionName}" is not allowed for tenant ${tenantId}`);
          }

          const actionMetadata =
            params && typeof params === "object" && !Array.isArray(params)
              ? (params as Record<string, unknown>).metadata
              : undefined;

          verifyIntentSignature({
            tenantId,
            workspaceId,
            runId,
            metadata:
              actionMetadata && typeof actionMetadata === "object" && !Array.isArray(actionMetadata)
                ? (actionMetadata as Record<string, unknown>)
                : runtimeMetadataResolved,
          });

          const effectivePayload =
            params ??
            {
              prompt: promptForExecution,
              metadata: runtimeMetadataResolved,
            };
          const version = resolveMcpToolVersion(payload.metadata, mcpConfig.defaultVersion);
          const tool = await ToolRegistry.get(actionName, version, tenantId);
          if (!tool) {
            if (actionName.startsWith("realestate.")) {
              await recordGuardrailAudit({
                prisma: prismaGlobal,
                tenantId,
                workspaceId,
                runId,
                eventType: "mcp.tool.simulated",
                severity: "warn",
                message: `ToolContract missing for ${actionName}@${version}; simulated execution used`,
                metadata: {
                  tool: actionName,
                  version,
                  stepId: context?.currentStep?.id,
                },
              }).catch(() => undefined);

              return {
                ok: true,
                simulated: true,
                action: actionName,
                version,
                status: "success",
                output: {
                  message: `Simulated ${actionName} execution`,
                  payloadPreview:
                    effectivePayload && typeof effectivePayload === "object"
                      ? Object.keys(effectivePayload as Record<string, unknown>).slice(0, 8)
                      : null,
                },
              };
            }
            throw new Error(`ToolContract missing: ${actionName}@${version}`);
          }

          const executor = new MCPExecutor(tool);
          const result = await executor.run(effectivePayload);

          try {
            await recordGuardrailAudit({
              prisma: prismaGlobal,
              tenantId,
              workspaceId,
              runId,
              eventType: "mcp.tool.executed",
              severity: "info",
              message: `Executed tool ${actionName}@${version}`,
              metadata: {
                tool: actionName,
                version,
                trustLevel: tool.trustLevel,
                stepId: context?.currentStep?.id,
              },
            });
          } catch {
            // best-effort
          }

          return result;
        },
      };

      const orchestrator = new AgentOrchestrator({
        planManager,
        mcpExecutor: mcpExecutorTool as any,
        act: async (step: OrchestratorPlanStep, orchestratorContext) => {
          if (step.action) {
            const catalog = orchestratorContext.actions ?? {};
            const referencedAction = catalog[step.action];
            if (!referencedAction) {
              throw new Error(`Action "${step.action}" is not available for tenant ${tenantId}`);
            }

            const inputPayload =
              step.params ??
              {
                prompt: promptForExecution,
                metadata: runtimeMetadataResolved,
              };

            if (knowledgeResolution.blocked) {
              throw new Error(
                `knowledge_policy.blocked: ${knowledgeResolution.reasonCode ?? "knowledge_gate_blocked"}`
              );
            }

            if (mcpConfig.proxyAll) {
              // When proxy is enabled, execute via MCP directly (no BullMQ hop).
              return await mcpExecutorTool.run(step.action, inputPayload, orchestratorContext);
            }

            const job = await publishAction({
              action: step.action,
              input: inputPayload,
              runId,
              stepId: step.id,
              tenantId,
              workspaceId,
              metadata,
            });

            await emitRunEvent({
              runId,
              tenantId,
              workspaceId,
              userId,
              type: "run.action.enqueued",
              payload: {
                action: step.action,
                stepId: step.id,
                jobId: job.id,
              },
            });

            try {
              const events = await getActionQueueEvents();
              const actionResult = await job.waitUntilFinished(events);

              if (isPlainObject(actionResult) && (actionResult as any).status === "error") {
                const message = String((actionResult as any).error ?? "Action failed");

                await emitRunEvent({
                  runId,
                  tenantId,
                  workspaceId,
                  userId,
                  type: "run.action.failed",
                  payload: {
                    action: step.action,
                    stepId: step.id,
                    jobId: job.id,
                    message,
                    retryable: Boolean((actionResult as any).retryable),
                  },
                });

                throw new Error(message);
              }

              await emitRunEvent({
                runId,
                tenantId,
                workspaceId,
                userId,
                type: "run.action.completed",
                payload: {
                  action: step.action,
                  stepId: step.id,
                  jobId: job.id,
                  outputPreview:
                    typeof actionResult === "string"
                      ? actionResult.slice(0, 200)
                      : (() => {
                          try {
                            return JSON.stringify(actionResult ?? "").slice(0, 200);
                          } catch {
                            return "[unserializable]";
                          }
                        })(),
                },
              });

              if (isPlainObject(actionResult) && (actionResult as any).status === "success") {
                return (actionResult as any).output;
              }

              return actionResult;
            } catch (actionError) {
              const message =
                actionError instanceof Error ? actionError.message : String(actionError);

              await emitRunEvent({
                runId,
                tenantId,
                workspaceId,
                userId,
                type: "run.action.failed",
                payload: {
                  action: step.action,
                  stepId: step.id,
                  jobId: job.id,
                  message,
                },
              });

              throw actionError;
            }
          }

          if (!retryConfigLogged) {
            retryConfigLogged = true;
            await emitRunEvent({
              runId,
              tenantId,
              workspaceId,
              userId,
              type: "llm.completion.retry_config",
              payload: retryConfig,
            });
          }

          if (knowledgeResolution.blocked) {
            throw new Error(
              `knowledge_policy.blocked: ${knowledgeResolution.reasonCode ?? "knowledge_gate_blocked"}`
            );
          }

          const result = await executeLlmStep({
            profile,
            userPrompt: promptForExecution,
            metadata: runtimeMetadataResolved,
          });

          executionResult = {
            outputText: result.outputText,
            rawResponse: result.rawResponse,
            traceId: result.traceId,
            tookMs: result.tookMs,
          };

          return result.outputText;
        },
        observe: async (orchestratorContext, lastResult) => {
          const observeText =
            typeof lastResult === "string"
              ? lastResult
              : isPlainObject(lastResult) && typeof (lastResult as { text?: unknown }).text === "string"
              ? ((lastResult as { text?: string }).text as string)
              : truncateJson(
                  lastResult,
                  getEnvNumber("MEMORY_OBSERVE_MAX_CHARS", DEFAULT_MEMORY_CONTENT_MAX_CHARS)
                );

          const { maskedText, flags } = await judgeResult(agentId, observeText, {
            runId,
            tenantId,
            workspaceId,
            userId,
          });

          const record: MemoryRecord = {
            key: `${runId}:${orchestratorContext.currentStep?.id ?? "step"}:observe`,
            content: maskedText,
            metadata: {
              runId,
              stepId: orchestratorContext.currentStep?.id ?? null,
              action: orchestratorContext.currentStep?.action ?? null,
              source: "orchestrator.observe",
            },
            createdAt: new Date(),
          };

          await memoryService.ingestShortTerm(memoryScope, [record]);

          await emitRunEvent({
            runId,
            tenantId,
            workspaceId,
            userId,
            type: "run.action.observe",
            payload: {
              stepId: orchestratorContext.currentStep?.id ?? null,
              action: orchestratorContext.currentStep?.action ?? null,
              masked: flags.length > 0,
              judgeFlags: flags,
            },
          });
        },
        eventStore,
        stepStore,
        telemetry: new ConsoleTelemetryBridge(),
      });

      const orchestratorMetadata =
        metadata && typeof metadata === "object" && !Array.isArray(metadata)
          ? { ...(metadata as Record<string, unknown>), userId }
          : { userId };

      const actionsForTenant = await resolveActionsForExecution(tenantId, workspaceId);

      const context = await orchestrator.run({
        objective: prompt,
        tenantId,
        workspaceId,
        runId,
        metadata: orchestratorMetadata,
        actions: actionsForTenant,
        maxSteps: (() => {
          const raw = process.env.RUN_MAX_STEPS;
          if (!raw) return undefined;
          const value = Number(raw);
          return Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined;
        })(),
        stepTimeoutMs: (() => {
          const raw = process.env.RUN_STEP_TIMEOUT_MS;
          if (!raw) return undefined;
          const value = Number(raw);
          return Number.isFinite(value) && value > 0 ? value : undefined;
        })(),
      });

      const inputBytes = Buffer.byteLength(prompt, "utf8");
      const toolIdentifiers = Array.isArray(profile.tools)
        ? (profile.tools as Array<unknown>)
            .map((entry) => {
              if (typeof entry === "string") {
                return entry;
              }
              if (
                entry &&
                typeof entry === "object" &&
                "name" in entry &&
                typeof (entry as { name?: unknown }).name === "string"
              ) {
                return (entry as { name: string }).name;
              }
              return undefined;
            })
            .filter((value): value is string => Boolean(value))
        : undefined;

      const estimate = await estimateCostCents({
        agent,
        inputBytes,
        tools: toolIdentifiers,
        tenantId,
        workspaceId,
      });
      if (estimate === null) {
        throw new Error("Workspace not found for tenant while estimating cost");
      }
      const costAwareLogger = withCostContext(logger, estimate);

      let snapshot = executionResult as ExecutionSnapshot | null;

      let finalRecommendations: GenerateRecommendationsResult | null = null;
      let candidatePayload: RecommendationCandidate[] = [];

      if (snapshot?.outputText) {
        const parsedCandidates = parseOutputCandidates(snapshot.outputText);
        if (parsedCandidates.length > 0) {
          candidatePayload = parsedCandidates;
        }
      }

      if (candidatePayload.length > 0) {
        finalRecommendations = generateStatefulRecommendations({
          agentId: agent,
          runId,
          candidates: candidatePayload,
          previousRuns: previousRunsForEngine,
          agentState: agentStateForEngine ?? undefined,
          maxRecommendations: getEnvNumber(
            "RECOMMENDATION_MAX_ITEMS",
            DEFAULT_MAX_RECOMMENDATIONS
          ),
          explorationPercentage,
        });

        if (existingStateRecord?.lastRunId !== runId) {
          const stateToPersist = toStoredState(finalRecommendations.agentState);
          await saveAgentRecommendationState({
            tenantId,
            workspaceId,
            agentId: agent,
            state: stateToPersist,
            lastRunId: runId,
          });
        }

        if (executionResult) {
          const previousExecution = executionResult as ExecutionSnapshot;
          const enrichedExecution: ExecutionSnapshot = {
            outputText: JSON.stringify(finalRecommendations, null, 2),
            rawResponse: previousExecution.rawResponse,
            traceId: previousExecution.traceId,
            tookMs: previousExecution.tookMs,
          };
          executionResult = enrichedExecution;
          snapshot = enrichedExecution;
        }
      }

      const conversationPersistence = resolveConversationPersistenceDecision({
        metadata: runtimeMetadataResolved,
        knowledgePolicy:
          (profile as { knowledgePolicy?: Record<string, unknown> | undefined }).knowledgePolicy ?? null,
      });

      if (conversationPersistence.persistShortTermMemory) {
        await persistRunMemory(memoryService, memoryScope, {
          runId,
          prompt: promptForExecution,
          outputText: snapshot?.outputText ?? null,
          rawResponse: snapshot?.rawResponse,
          metadata: {
            traceId: snapshot?.traceId,
            recommendations: finalRecommendations?.recomendacoes.length ?? 0,
            conversationPersistence,
          },
        });
      }

      const guardrailReport = await runGuardrails(
        {
          runId,
          tenantId,
          workspaceId,
          agent,
          prompt,
          outputText: snapshot?.outputText ?? null,
          rawResponse: snapshot?.rawResponse,
          plan: (context?.plan ?? []).map((step) => ({ action: (step as any)?.action ?? null })),
          outputs: (context?.outputs as any) ?? undefined,
        },
        defaultRunGuardrails()
      );

      await emitRunEvent({
        runId,
        tenantId,
        workspaceId,
        userId,
        type: "run.guardrails.evaluated",
        payload: {
          action: guardrailReport.action,
          maxSeverity: guardrailReport.maxSeverity,
          findings: guardrailReport.findings,
        },
      });

      if (guardrailReport.action === "block") {
        const reason = guardrailReport.findings.map((f) => f.message).join(" | ") || "Guardrails blocked";
        const guardrailMode = getEnvString(
          "GUARDRAIL_BLOCK_MODE",
          process.env.NODE_ENV === "development" ? "warn" : "block"
        );
        const shouldBlock = guardrailMode === "block";

        const auditSeverity = shouldBlock
          ? guardrailReport.maxSeverity === "critical" || guardrailReport.maxSeverity === "error"
            ? "error"
            : "warn"
          : "warn";

        await recordGuardrailAudit({
          prisma: prismaGlobal,
          tenantId,
          workspaceId,
          runId,
          eventType: "run.guardrails.blocked",
          severity: auditSeverity,
          message: shouldBlock ? reason : `Guardrails sinalizaram bloqueio; execução permitida (${guardrailMode}). ${reason}`,
          metadata: {
            report: guardrailReport,
            mode: guardrailMode,
            override: !shouldBlock,
          },
        });

        const scl = await appendSclRecord({
          prisma: prismaGlobal,
          tenantId,
          workspaceId,
          runId,
          payload: {
            status: shouldBlock ? "blocked" : "warning",
            reason,
            report: guardrailReport,
            mode: guardrailMode,
          },
          riskLevel: "high",
        });

        await emitRunEvent({
          runId,
          tenantId,
          workspaceId,
          userId,
          type: "run.blocked.guardrails",
          payload: {
            reason,
            report: guardrailReport,
            txId: scl.txId,
            criticalHash: scl.criticalHash,
            mode: guardrailMode,
            override: !shouldBlock,
          },
          criticalHash: scl.criticalHash,
          sclTxId: scl.txId,
        });

        const ledger = createGuardrailLedgerStore(tenantId, workspaceId, prismaGlobal);
        await ledger.register(
          JSON.stringify({
            tenantId,
            actionType: shouldBlock ? "blocked.guardrails" : "warning.guardrails",
            runId,
            idempotencyKey: runId,
          }),
          0
        );

        if (shouldBlock) {
          await recordReplayCompletedIfNeeded({
            runId,
            tenantId,
            workspaceId,
            userId,
            replayInfo,
            status: "blocked",
            reason,
          });

          await finalizeRunRecord({
            runId,
            tenantId,
            workspaceId,
            status: "blocked",
            response: { error: reason, guardrails: guardrailReport },
            costCents: 0,
            traceId: snapshot?.traceId ?? null,
            errorCode: "GUARDRAILS_BLOCKED",
          });

          return;
        }
      }

      const tokenSummary = await emitRunTokenEvents({
        runId,
        tenantId,
        workspaceId,
        userId,
        outputText: snapshot?.outputText ?? null,
      });
      if (tokenSummary) {
        await emitRunEvent({
          runId,
          tenantId,
          workspaceId,
          userId,
          type: "run.token.summary",
          payload: {
            ...tokenSummary,
            source: "final-output",
          },
        });
      }

      const succeededResponse = {
        optimized: finalRecommendations,
        originalOutput: snapshot?.rawResponse ?? snapshot?.outputText ?? null,
        plan: context.plan,
        outputs: context.outputs,
        memory: {
          previousRuns: trimmedPreviousRunsForPrompt,
          agentStateBefore: existingStateRecord?.state ?? null,
        },
      };

      const scl = await appendSclRecord({
        prisma: prismaGlobal,
        tenantId,
        workspaceId,
        runId,
        payload: succeededResponse,
        riskLevel: "medium",
      });

      await finalizeRunRecord({
        runId,
        tenantId,
        workspaceId,
        status: "success",
        response: succeededResponse,
        costCents: estimate,
        traceId: snapshot?.traceId ?? null,
      });

      const charged = await chargeRun({
        tenantId,
        workspaceId,
        runId,
        costCents: estimate,
      });
      if (!charged) {
        logger.warn(
          { runId, tenantId, workspaceId },
          "run.worker.charge_skipped_due_to_scope"
        );
      }

      await emitRunEvent({
        runId,
        tenantId,
        workspaceId,
        userId,
        type: "run.completed",
        payload: {
          status: "success",
          costCents: estimate,
          tools: toolIdentifiers,
          tookMs: snapshot?.tookMs ?? Date.now() - startedAt,
          traceId: snapshot?.traceId,
          planSteps: context.plan.length,
          recommendationsGenerated: finalRecommendations?.recomendacoes.length ?? 0,
          txId: scl.txId,
          criticalHash: scl.criticalHash,
        },
        criticalHash: scl.criticalHash,
        sclTxId: scl.txId,
      });
      costAwareLogger.info(
        {
          tookMs: snapshot?.tookMs ?? Date.now() - startedAt,
          recommendationsGenerated: finalRecommendations?.recomendacoes.length ?? 0,
          toolsUsed: toolIdentifiers?.length ?? 0,
        },
        "run.worker.completed"
      );

      await emitRunEvent({
        runId,
        tenantId,
        workspaceId,
        userId,
        type: "run.completed",
        payload: {
          status: "success",
          costCents: estimate,
          tools: toolIdentifiers,
          tookMs: snapshot?.tookMs ?? Date.now() - startedAt,
          traceId: snapshot?.traceId,
          planSteps: context.plan.length,
          recommendationsGenerated: finalRecommendations?.recomendacoes.length ?? 0,
        },
      });

      costAwareLogger.info(
        {
          tookMs: snapshot?.tookMs ?? Date.now() - startedAt,
          recommendationsGenerated: finalRecommendations?.recomendacoes.length ?? 0,
          toolsUsed: toolIdentifiers?.length ?? 0,
        },
        "run.worker.completed"
      );

      await recordReplayCompletedIfNeeded({
        runId,
        tenantId,
        workspaceId,
        userId,
        replayInfo,
        status: "success",
      });

      // ✔ DISPARA SEMPRE O RUN ATIVO UNIVERSAL (SEM IF)
      const runAtivoJob: ScopedRunAtivoJobPayload = { runId, tenantId, workspaceId };
      await enqueueRunAtivoUniversal(runAtivoJob);

    } catch (error) {
      const message = error instanceof Error ? error.message : "Execution failed";
      logger.error(
        {
          err: error,
        },
        "run.worker.failed"
      );

      const scl = await appendSclRecord({
        prisma: prismaGlobal,
        tenantId,
        workspaceId,
        runId,
        payload: { status: "error", message },
        riskLevel: "high",
      });

      await finalizeRunRecord({
        runId,
        tenantId,
        workspaceId,
        status: "error",
        response: { error: message },
        costCents: 0,
        errorCode: "EXECUTION_FAILED",
      });

      await emitRunEvent({
        runId,
        tenantId,
        workspaceId,
        userId,
        type: "run.failed",
        payload: {
          status: "error",
          message,
          txId: scl.txId,
          criticalHash: scl.criticalHash,
        },
        criticalHash: scl.criticalHash,
        sclTxId: scl.txId,
      });

      await recordReplayCompletedIfNeeded({
        runId,
        tenantId,
        workspaceId,
        userId,
        replayInfo,
        status: "error",
        reason: message,
      });
    }
  }

export async function startRunQueueWorker() {
  return consume(processRunPayload);
}

function getEnvNumber(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getEnvString(name: string, fallback: string) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function truncateJson(value: unknown, maxChars: number) {
  const safeMax = Number.isFinite(maxChars) && maxChars > 0 ? Math.floor(maxChars) : DEFAULT_PROMPT_CONTEXT_CHARS;
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    serialized = String(value ?? "");
  }

  if (serialized.length <= safeMax) {
    return serialized;
  }

  return `${serialized.slice(0, safeMax)}…(truncado)`;
}

function extractRecommendationsFromResponse(response: unknown) {
  const visited = new WeakSet();

  const findArray = (node: unknown): any[] | null => {
    if (!node || typeof node !== "object") return null;
    if (visited.has(node as object)) return null;
    visited.add(node as object);

    const objectNode = node as Record<string, unknown>;

    if (Array.isArray(objectNode.recomendacoes)) return objectNode.recomendacoes;
    if (Array.isArray(objectNode.recommendations)) return objectNode.recommendations;

    const nestedKeys = ["optimized", "data", "result", "response", "payload"];
    for (const key of nestedKeys) {
      if (objectNode[key]) {
        const nested = findArray(objectNode[key]);
        if (nested) return nested;
      }
    }

    return null;
  };

  let payload: unknown = response;
  if (typeof response === "string") {
    try {
      payload = JSON.parse(response);
    } catch {
      return [];
    }
  }

  const array = findArray(payload);
  if (!array) return [];

  const limit = getEnvNumber("RECOMMENDATION_PREVIOUS_RUN_ITEMS_LIMIT", DEFAULT_PREVIOUS_ITEMS_LIMIT);

  return array
    .filter((item) => item && typeof item === "object")
    .slice(0, limit)
    .map((item: any): PreviousRecommendation => {
      const feedback = isPlainObject(item.feedback)
        ? {
            explicit:
              typeof (item.feedback as Record<string, unknown>).explicit === "string"
                ? String((item.feedback as Record<string, unknown>).explicit)
                : undefined,
            click:
              typeof (item.feedback as Record<string, unknown>).click === "boolean"
                ? Boolean((item.feedback as Record<string, unknown>).click)
                : undefined,
            status:
              typeof (item.feedback as Record<string, unknown>).status === "string"
                ? String((item.feedback as Record<string, unknown>).status)
                : undefined,
          }
        : undefined;

      const motive = isPlainObject(item.motivo_da_priorizacao)
        ? {
            accepts:
              typeof (item.motivo_da_priorizacao as Record<string, unknown>).accepts === "number"
                ? Number((item.motivo_da_priorizacao as Record<string, unknown>).accepts)
                : undefined,
            rejects:
              typeof (item.motivo_da_priorizacao as Record<string, unknown>).rejects === "number"
                ? Number((item.motivo_da_priorizacao as Record<string, unknown>).rejects)
                : undefined,
            w:
              typeof (item.motivo_da_priorizacao as Record<string, unknown>).w === "number"
                ? Number((item.motivo_da_priorizacao as Record<string, unknown>).w)
                : undefined,
            s:
              typeof (item.motivo_da_priorizacao as Record<string, unknown>).s === "number"
                ? Number((item.motivo_da_priorizacao as Record<string, unknown>).s)
                : undefined,
            score:
              typeof (item.motivo_da_priorizacao as Record<string, unknown>).score === "number"
                ? Number((item.motivo_da_priorizacao as Record<string, unknown>).score)
                : undefined,
          }
        : undefined;

      const execucao = normalizeRecommendationExecution(item.execucao ?? null) ?? undefined;

      return {
        key: typeof item.key === "string" ? item.key : undefined,
        tatica: typeof item.tatica === "string" ? item.tatica : undefined,
        prioridade: typeof item.prioridade === "number" ? item.prioridade : undefined,
        score: typeof item.score === "number" ? item.score : undefined,
        adopted: typeof item.adopted === "boolean" ? item.adopted : undefined,
        status: typeof item.status === "string" ? item.status : undefined,
        feedback,
        rationale: typeof item.rationale === "string" ? item.rationale : undefined,
        proximos_passos:
          typeof item.proximos_passos === "string"
            ? item.proximos_passos
            : typeof item.nextSteps === "string"
            ? item.nextSteps
            : undefined,
        motivo_da_priorizacao: motive ?? undefined,
        execucao: execucao ?? undefined,
        parametros: item.parametros ?? item.parameters ?? undefined,
      };
    });
  
}
      
function parseOutputCandidates(outputText: string): RecommendationCandidate[] {
  try {
    const parsed = JSON.parse(outputText);
    const list =
      Array.isArray(parsed?.recomendacoes) && parsed.recomendacoes.length > 0
        ? parsed.recomendacoes
        : Array.isArray(parsed) ? parsed : [];

    return list
      .filter((item: any) => item && (typeof item.tatica === "string" || typeof item.key === "string"))
      .map(
        (item: any, index: number): RecommendationCandidate => ({
          key: typeof item.key === "string" ? item.key : undefined,
          tatica:
            typeof item.tatica === "string"
              ? item.tatica
              : `Recomendação ${index + 1}`,
          rationale:
            typeof item.rationale === "string"
              ? item.rationale
              : typeof item.justificativa === "string"
              ? item.justificativa
              : undefined,
          proximos_passos:
            typeof item.proximos_passos === "string"
              ? item.proximos_passos
              : typeof item.nextSteps === "string"
              ? item.nextSteps
              : undefined,
          execucao:
            item.execucao && typeof item.execucao === "object"
              ? {
                  api_sugerida: String(item.execucao.api_sugerida ?? item.execucao.api ?? "GEMINI_PRO"),
                  tipo_tarefa: String(item.execucao.tipo_tarefa ?? item.execucao.tipo ?? "ESTRATEGIA_COMPLEXA"),
                  custo_estimado_tokens: Number(item.execucao.custo_estimado_tokens ?? item.execucao.tokens ?? 800),
                  modelo_alternativo: item.execucao.modelo_alternativo
                    ? String(item.execucao.modelo_alternativo)
                    : undefined,
                }
              : undefined,
          parametros: item.parametros ?? item.parameters ?? undefined,
          metadata: item.metadata ?? undefined,
        })
      );
  } catch {
    return [];
  }
}

async function persistRunMemory(
  memoryService: ReturnType<typeof getMemoryService>,
  scope: MemoryScope,
  payload: {
    runId: string;
    prompt?: string | null;
    outputText?: string | null;
    rawResponse?: unknown;
    metadata?: Record<string, unknown>;
  }
) {
  const records: MemoryRecord[] = [];
  const now = new Date();

  const promptContent = sanitizeMemoryContent(payload.prompt);
  if (promptContent) {
    records.push({
      key: `${payload.runId}:prompt`,
      content: promptContent,
      metadata: {
        kind: "prompt",
        runId: payload.runId,
        ...(payload.metadata ?? {}),
      },
      createdAt: now,
    });
  }

  const outputCandidate =
    payload.outputText && payload.outputText.length > 0
      ? payload.outputText
      : formatUnknownContent(payload.rawResponse);
  const outputContent = sanitizeMemoryContent(outputCandidate);
  if (outputContent) {
    records.push({
      key: `${payload.runId}:output`,
      content: outputContent,
      metadata: {
        kind: "output",
        runId: payload.runId,
        ...(payload.metadata ?? {}),
      },
      createdAt: now,
    });
  }

  if (records.length === 0) {
    return;
  }

  try {
    await memoryService.ingestShortTerm(scope, records);
    const keepLatest = getEnvNumber("MEMORY_SHORT_TERM_MAX_RECORDS", DEFAULT_MEMORY_SHORT_TERM_MAX);
    if (keepLatest > 0) {
      await memoryService.truncateShortTerm(scope, keepLatest);
    }
  } catch (error) {
    console.warn("[runWorker] Failed to persist short-term memory", {
      runId: payload.runId,
      error: error instanceof Error ? error.message : error,
    });
  }
}

function sanitizeMemoryContent(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  const limit = getEnvNumber("MEMORY_CONTENT_MAX_CHARS", DEFAULT_MEMORY_CONTENT_MAX_CHARS);
  if (trimmed.length <= limit) {
    return trimmed;
  }

  return `${trimmed.slice(0, limit)}…`;
}

function formatUnknownContent(payload: unknown): string | null {
  if (payload === undefined || payload === null) {
    return null;
  }
  if (typeof payload === "string") {
    return payload;
  }
  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
}

/**
 * Conecta o EIAH_Builder à runQueue do IA_Gateway via BullMQ
 * sem alterar a lógica existente do orquestrador.
 *
 * O IA_Gateway só produz jobs. Este worker consome e executa o ReAct completo.
 */
export function startRunQueueBullMqWorker() {
  const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
  const concurrency = Number(process.env.RUN_WORKER_CONCURRENCY || 5);

  const worker = new Worker(
    QueueName.RUNS,
    async job => {
      try {
        const payload = job.data;

        console.log("[EIAH_BUILDER runQueueWorker] Received job", payload.runId);

        await processRunPayload(payload);

        console.log("[EIAH_BUILDER runQueueWorker] Completed run:", payload.runId);
      } catch (err) {
        console.error("[EIAH_BUILDER runQueueWorker] Failed job", job.id, err);
        throw err;
      }
    },
    {
      concurrency,
      connection: { url: redisUrl }
    }
  );

  worker.on("ready", () => {
    console.log(
      `[EIAH_BUILDER runQueueWorker] Listening on queue=${QueueName.RUNS} redis=${redisUrl} concurrency=${concurrency}`
    );
  });

  worker.on("failed", (job, err) => {
    console.error(
      `[EIAH_BUILDER runQueueWorker] Job failed runId=${job?.data?.runId ?? job?.id}`,
      err
    );

    const payload = job?.data as Partial<RunQueuePayload> | undefined;
    if (!payload?.runId || !payload.tenantId || !payload.workspaceId) return;
    const attemptsMade = job?.attemptsMade ?? 0;
    const maxAttempts = job?.opts?.attempts ?? 1;
    const willRetry = attemptsMade < maxAttempts;
    const backoff = job?.opts?.backoff ?? null;

    const eventPayload = {
      attemptsMade,
      maxAttempts,
      willRetry,
      backoff,
      error: err instanceof Error ? err.message : String(err),
    };

    void emitRunEvent({
      runId: payload.runId,
      tenantId: payload.tenantId,
      workspaceId: payload.workspaceId,
      userId: payload.userId,
      type: willRetry ? "job.retry_scheduled" : "job.failed",
      payload: eventPayload,
    }).catch(() => undefined);
  });

  worker.on("completed", job => {
    console.log(
      `[EIAH_BUILDER runQueueWorker] Job completed runId=${job?.data?.runId ?? job?.id}`
    );

    const payload = job?.data as Partial<RunQueuePayload> | undefined;
    if (!payload?.runId || !payload.tenantId || !payload.workspaceId) return;
    void emitRunEvent({
      runId: payload.runId,
      tenantId: payload.tenantId,
      workspaceId: payload.workspaceId,
      userId: payload.userId,
      type: "job.completed",
      payload: {
        attemptsMade: job?.attemptsMade ?? 0,
      },
    }).catch(() => undefined);
  });

  return worker;
}
