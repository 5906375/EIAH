import { Buffer } from "node:buffer";
import { simpleExecuteAgentRun } from "../orchestrator/simpleExecutor";
import {
  AgentOrchestrator,
  ConsoleTelemetryBridge,
  DefaultPlanManager,
  buildRecommendationPrompt,
  generateStatefulRecommendations,
  publishAction,
  createActionQueueEvents,
  consume,
  type AgentRecommendationState,
  type RecommendationCandidate,
  type PreviousRun as EnginePreviousRun,
  type GenerateRecommendationsResult,
  type PreviousRecommendation,
  type RecommendationExecution,
  type RunEventStore,
  type MemoryRecord,
  type MemoryScope,
  type MemorySnapshot,
} from "@eiah/core";
import type { QueueEvents } from "bullmq";
import { estimateCostCents, chargeRun } from "../services/billing";
import { getAgentProfile } from "../services/agents";
import {
  finalizeRunRecord,
  updateRunStatus,
  listRecentRunsForAgent,
} from "../services/runs";
import { recordRunEvent } from "../services/runEvents";
import {
  getAgentRecommendationState,
  saveAgentRecommendationState,
  type StoredRecommendationState,
} from "../services/recommendations";
import { getMemoryService } from "../services/memory";

const DEFAULT_PREVIOUS_RUN_LIMIT = 5;
const DEFAULT_PREVIOUS_ITEMS_LIMIT = 5;
const DEFAULT_PROMPT_CONTEXT_CHARS = 4000;
const DEFAULT_MAX_RECOMMENDATIONS = 5;
const DEFAULT_EXPLORATION_PCT = 20;
const DEFAULT_MEMORY_SNAPSHOT_TOPK = 20;
const DEFAULT_MEMORY_SHORT_TERM_MAX = 200;
const DEFAULT_MEMORY_CONTENT_MAX_CHARS = 2000;

let actionQueueEventsPromise: Promise<QueueEvents> | null = null;
const memoryService = getMemoryService();

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
    async record(event) {
      await recordRunEvent({
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

export async function startRunQueueWorker() {
  return consume(async (payload) => {
    const { runId, tenantId, workspaceId, userId, agent, prompt, metadata } = payload;

    const profile = await getAgentProfile(agent);
    if (!profile) {
      await finalizeRunRecord({
        runId,
        tenantId,
        workspaceId,
        status: "error",
        response: { error: `Agent ${agent} not found` },
        costCents: 0,
        errorCode: "AGENT_NOT_FOUND",
      });

      await recordRunEvent({
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

    const baseMetadata =
      metadata && typeof metadata === "object" && !Array.isArray(metadata)
        ? { ...(metadata as Record<string, unknown>) }
        : {};

    const memoryScope: MemoryScope = { tenantId, workspaceId, agentId: agent };

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
      loadMemorySnapshot(memoryScope),
    ]);

    const previousRunsForEngine = previousRunRecords.map((run) => ({
      id: run.id,
      createdAt: run.createdAt.toISOString(),
      recomendacoes: extractRecommendationsFromResponse(run.response),
    })) as EnginePreviousRun[];

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

    const recommendationsPrompt = buildRecommendationPrompt({
      agentId: agent,
      runIdPlaceholder: runId,
      maxRecommendations: getEnvNumber("RECOMMENDATION_MAX_ITEMS", DEFAULT_MAX_RECOMMENDATIONS),
      explorationPercentage: getEnvNumber(
        "RECOMMENDATION_EXPLORATION_PCT",
        DEFAULT_EXPLORATION_PCT
      ),
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

    const promptForExecution = [
      recommendationsPrompt,
      historySnippet,
      "### SOLICITAÇÃO ORIGINAL",
      prompt,
    ].join("\n\n");

    await recordRunEvent({
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

      const orchestrator = new AgentOrchestrator({
        planManager,
        act: async (step) => {
          if (step.action) {
            const inputPayload =
              step.params ??
              {
                prompt: promptForExecution,
                metadata: runtimeMetadata,
              };

            const job = await publishAction({
              action: step.action,
              input: inputPayload,
              runId,
              stepId: step.id,
              tenantId,
              workspaceId,
              metadata,
            });

            await recordRunEvent({
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

              await recordRunEvent({
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

              return actionResult;
            } catch (actionError) {
              const message =
                actionError instanceof Error ? actionError.message : String(actionError);

              await recordRunEvent({
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

          const result = await simpleExecuteAgentRun({
            profile,
            userPrompt: promptForExecution,
            metadata: runtimeMetadata,
          });

          executionResult = {
            outputText: result.outputText,
            rawResponse: result.rawResponse,
            traceId: result.traceId,
            tookMs: result.tookMs,
          };

          return result.outputText;
        },
        eventStore,
        telemetry: new ConsoleTelemetryBridge(),
      });

      const orchestratorMetadata =
        metadata && typeof metadata === "object" && !Array.isArray(metadata)
          ? { ...(metadata as Record<string, unknown>), userId }
          : { userId };

      const context = await orchestrator.run({
        objective: prompt,
        tenantId,
        workspaceId,
        runId,
        metadata: orchestratorMetadata,
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
        workspaceId,
      });

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
          explorationPercentage: getEnvNumber(
            "RECOMMENDATION_EXPLORATION_PCT",
            DEFAULT_EXPLORATION_PCT
          ),
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

      await persistRunMemory(memoryScope, {
        runId,
        prompt: promptForExecution,
        outputText: snapshot?.outputText ?? null,
        rawResponse: snapshot?.rawResponse,
        metadata: {
          traceId: snapshot?.traceId,
          recommendations: finalRecommendations?.recomendacoes.length ?? 0,
        },
      });

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

      await finalizeRunRecord({
        runId,
        tenantId,
        workspaceId,
        status: "success",
        response: succeededResponse,
        costCents: estimate,
        traceId: snapshot?.traceId ?? null,
      });

      await chargeRun(workspaceId, runId, estimate);

      await recordRunEvent({
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
    } catch (error) {
      const message = error instanceof Error ? error.message : "Execution failed";

      await finalizeRunRecord({
        runId,
        tenantId,
        workspaceId,
        status: "error",
        response: { error: message },
        costCents: 0,
        errorCode: "EXECUTION_FAILED",
      });

      await recordRunEvent({
        runId,
        tenantId,
        workspaceId,
        userId,
        type: "run.failed",
        payload: {
          status: "error",
          message,
        },
      });
    }
  });
}

function getEnvNumber(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
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

async function loadMemorySnapshot(scope: MemoryScope): Promise<MemorySnapshot | null> {
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

async function persistRunMemory(
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
