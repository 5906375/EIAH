import {
  executeRegisteredAction,
  publishAction,
  type ActionExecutionResult,
  registerAllActions,
  VersionedActionRegistry,
} from "@eiah/core";
import type { RunAtivoReportingInput, RunAtivoEvents } from "@eiah/core";
import { Prisma, prismaGlobal } from "@repo/db";

type PrismaRun = {
  id: string;
  tenantId: string;
  workspaceId: string;
  agent: string;
  status: string;
  costCents?: number | null;
  request: unknown;
  response: unknown;
  userId?: string | null;
};
import { emitRunEvent } from "../runEventEmitter";
import { interpretPayload } from "./interpreters";
import {
  RunAtivoUniversalInputSchema,
  type RunAtivoUniversalInput,
} from "./validator/runAtivoUniversalInput.schema";

const ACTIONS = {
  landing: "reporting.runAtivo.renderLandingPage",
  pdf: "reporting.runAtivo.renderPdf",
  alert: "reporting.runAtivo.buildAlert",
} as const;

// Ensure core action registry is initialized for reporting actions in this module context.
registerAllActions(new VersionedActionRegistry());

type Mode = "sync" | "queue";

export type RunAtivoUniversalAgentOptions = {
  mode?: Mode;
  logger?: (_event: string, _payload?: Record<string, unknown>) => void;
};

export type RunAtivoUniversalAgentResult =
  | {
      mode: "sync";
      normalized: RunAtivoReportingInput;
      landing: ActionExecutionResult["output"];
      pdf: ActionExecutionResult["output"];
      alert: ActionExecutionResult["output"];
    }
  | {
      mode: "queue";
      normalized: RunAtivoReportingInput;
      jobs: {
        landingJobId: string;
        pdfJobId: string;
        alertJobId: string;
      };
    };

function assertSuccess(result: ActionExecutionResult, actionName: string) {
  if (result.status === "error") {
    throw new Error(result.error ?? `Action ${actionName} failed`);
  }
  return result.output;
}

export async function runAtivoUniversalAgent(
  rawInput: RunAtivoUniversalInput,
  options: RunAtivoUniversalAgentOptions = {}
): Promise<RunAtivoUniversalAgentResult> {
  const parsed = RunAtivoUniversalInputSchema.parse(rawInput);
  const normalized = interpretPayload(parsed);
  const ctx = createRunAtivoContext(parsed, normalized);
  const mode: Mode = options.mode ?? "sync";

  options.logger?.("runAtivo.interpreter.normalized", {
    agent: parsed.agent,
    runId: parsed.runId,
  });

  await ctx.runEvents.append({
    type: "runAtivo.interpreted",
    payload: { traceId: ctx.traceId },
  });

  if (mode === "queue") {
    const [landingJob, pdfJob, alertJob] = await Promise.all([
      publishAction({
        action: ACTIONS.landing,
        input: normalized,
        runId: parsed.runId,
        tenantId: parsed.tenantId,
        workspaceId: parsed.workspaceId,
        metadata: { agent: parsed.agent },
      }),
      publishAction({
        action: ACTIONS.pdf,
        input: normalized,
        runId: parsed.runId,
        tenantId: parsed.tenantId,
        workspaceId: parsed.workspaceId,
        metadata: { agent: parsed.agent },
      }),
      publishAction({
        action: ACTIONS.alert,
        input: normalized,
        runId: parsed.runId,
        tenantId: parsed.tenantId,
        workspaceId: parsed.workspaceId,
        metadata: { agent: parsed.agent },
      }),
    ]);

    options.logger?.("runAtivo.actions.queued", {
      landingJobId: landingJob.id,
      pdfJobId: pdfJob.id,
      alertJobId: alertJob.id,
    });

    return {
      mode: "queue",
      normalized,
      jobs: {
        landingJobId: landingJob.id ?? "unknown",
        pdfJobId: pdfJob.id ?? "unknown",
        alertJobId: alertJob.id ?? "unknown",
      },
    };
  }

  const [landing, pdf, alert] = await Promise.all([
    executeRegisteredAction(ACTIONS.landing, {
      action: ACTIONS.landing,
      input: normalized,
      runId: parsed.runId,
      tenantId: parsed.tenantId,
      workspaceId: parsed.workspaceId,
      metadata: { agent: parsed.agent },
    }),
    executeRegisteredAction(ACTIONS.pdf, {
      action: ACTIONS.pdf,
      input: normalized,
      runId: parsed.runId,
      tenantId: parsed.tenantId,
      workspaceId: parsed.workspaceId,
      metadata: { agent: parsed.agent },
    }),
    executeRegisteredAction(ACTIONS.alert, {
      action: ACTIONS.alert,
      input: normalized,
      runId: parsed.runId,
      tenantId: parsed.tenantId,
      workspaceId: parsed.workspaceId,
      metadata: { agent: parsed.agent },
    }),
  ]);

  options.logger?.("runAtivo.actions.completed", {
    runId: parsed.runId,
    agent: parsed.agent,
  });

  return {
    mode: "sync",
    normalized,
    landing: await emitSuccessAndReturn({
      actionName: ACTIONS.landing,
      result: landing,
      eventType: "runAtivo.landing.generated",
      ctx,
    }),
    pdf: await emitSuccessAndReturn({
      actionName: ACTIONS.pdf,
      result: pdf,
      eventType: "runAtivo.pdf.generated",
      ctx,
    }),
    alert: await emitSuccessAndReturn({
      actionName: ACTIONS.alert,
      result: alert,
      eventType: "runAtivo.alert.generated",
      ctx,
    }),
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractMetadata(request: unknown): Record<string, unknown> {
  if (!isPlainObject(request)) return {};
  const meta = (request as Record<string, unknown>).metadata;
  return isPlainObject(meta) ? (meta as Record<string, unknown>) : {};
}

function extractForm(metadata: Record<string, unknown>) {
  const form = metadata["form"];
  return isPlainObject(form) ? (form as Record<string, unknown>) : {};
}

function extractRecommendations(response: unknown) {
  if (!isPlainObject(response)) return undefined;
  const optimized = (response as Record<string, unknown>).optimized;
  if (!isPlainObject(optimized)) return undefined;
  return mapRecommendations((optimized as Record<string, unknown>).recomendacoes);
}

type RecommendationRow = {
  titulo: string;
  descricao?: string;
  prioridade?: number;
  proximosPassos?: string;
  score?: number;
  tags: string[];
  modeloSugerido?: string;
  tokensEstimados?: number;
};

function mapRecommendations(raw: unknown): RecommendationRow[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const mapped = raw
    .map((entry): RecommendationRow | null => {
      if (!isPlainObject(entry)) return null;
      const titleSource = entry.tatica ?? entry.titulo;
      const titulo = typeof titleSource === "string" ? titleSource : null;
      if (!titulo) return null;
      const descricaoSource = entry.rationale ?? entry.descricao;
      const proximosSource = entry.proximos_passos ?? entry.proximosPassos;
      const execucao = isPlainObject(entry.execucao) ? entry.execucao : undefined;
      return {
        titulo,
        descricao: typeof descricaoSource === "string" ? descricaoSource : undefined,
        prioridade: typeof entry.prioridade === "number" ? entry.prioridade : undefined,
        proximosPassos: typeof proximosSource === "string" ? proximosSource : undefined,
        score: typeof entry.score === "number" ? entry.score : undefined,
        tags: Array.isArray(entry.canais)
          ? (entry.canais as unknown[]).filter((tag) => typeof tag === "string")
          : [],
        modeloSugerido:
          (execucao && typeof execucao.api_sugerida === "string" && execucao.api_sugerida) || undefined,
        tokensEstimados:
          execucao && typeof execucao.custo_estimado_tokens === "number"
            ? execucao.custo_estimado_tokens
            : undefined,
      };
    })
    .filter((item): item is RecommendationRow => Boolean(item));
  return mapped.length ? mapped : undefined;
}

function extractInsights(response: unknown) {
  if (!isPlainObject(response)) return undefined;
  const optimized = (response as Record<string, unknown>).optimized;
  if (!isPlainObject(optimized)) return undefined;
  const insights = (optimized as Record<string, unknown>).insights;
  if (!Array.isArray(insights)) return undefined;
  const normalized = insights.filter((entry) => typeof entry === "string");
  return normalized.length ? (normalized as string[]) : undefined;
}

function buildInputFromRun(run: PrismaRun): RunAtivoUniversalInput {
  const requestPayload = run.request as Record<string, unknown> | null;
  const responsePayload = run.response as Record<string, unknown> | null;
  const metadata = extractMetadata(requestPayload ?? {});
  const form = extractForm(metadata);
  const recommendations = extractRecommendations(
    responsePayload ?? undefined
  ) as RunAtivoUniversalInput["recommendations"];
  const insights = extractInsights(responsePayload ?? undefined);

  const userMetadata = metadata["user"];
  const summaryValue = metadata["summary"];
  const contextValue = metadata["context"];

  return {
    agent: run.agent,
    tenantId: run.tenantId,
    workspaceId: run.workspaceId,
    runId: run.id,
    status: run.status,
    costCents: run.costCents ?? undefined,
    user: isPlainObject(userMetadata) ? userMetadata : undefined,
    form,
    resumo: typeof summaryValue === "string" ? summaryValue : undefined,
    contexto: typeof contextValue === "string" ? contextValue : undefined,
    recommendations,
    insights,
    metadata,
  };
}

async function persistRunAtivoOutputs(
  scope: { runId: string; tenantId: string; workspaceId: string },
  payload: { landingHtml: string; pdfHtml: string; alert: unknown }
) {
  const existing = await prismaGlobal.run.findFirst({
    where: { id: scope.runId, tenantId: scope.tenantId, workspaceId: scope.workspaceId },
    select: { response: true },
  });

  if (!existing) {
    return;
  }

  const currentResponse = isPlainObject(existing.response)
    ? { ...(existing.response as Record<string, unknown>) }
    : {};

  const reporting = isPlainObject(currentResponse.reporting)
    ? { ...(currentResponse.reporting as Record<string, unknown>) }
    : {};

  reporting.runAtivoUniversal = {
    landingHtml: payload.landingHtml,
    pdfHtml: payload.pdfHtml,
    alert: payload.alert,
    updatedAt: new Date().toISOString(),
  };

  currentResponse.reporting = reporting;

  await prismaGlobal.run.update({
    where: { id: scope.runId },
    data: {
      response: currentResponse as Prisma.InputJsonValue,
    },
  });
}

export async function runAtivoUniversalAgentFromRunId(params: {
  runId: string;
  tenantId: string;
  workspaceId: string;
  mode?: Mode;
  logger?: (_event: string, _payload?: Record<string, unknown>) => void;
}) {
  const run = await prismaGlobal.run.findFirst({
    where: {
      id: params.runId,
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
    },
  });
  if (!run) {
    throw new Error(
      `Run ${params.runId} not found for tenant=${params.tenantId} workspace=${params.workspaceId}`
    );
  }

  const input = buildInputFromRun(run);
  const result = await runAtivoUniversalAgent(input, {
    mode: params.mode ?? "sync",
    logger: params.logger,
  });

  if (result.mode === "sync") {
    await persistRunAtivoOutputs(
      {
        runId: params.runId,
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
      },
      {
        landingHtml: (result.landing as { html?: string })?.html ?? "",
        pdfHtml: (result.pdf as { html?: string })?.html ?? "",
        alert: result.alert,
      }
    );
  }

  return result;
}

async function emitSuccessAndReturn({
  actionName,
  result,
  eventType,
  ctx,
}: {
  actionName: string;
  result: ActionExecutionResult;
  eventType: RunAtivoEvents["type"];
  ctx: RunAtivoAgentContext;
}) {
  const output = assertSuccess(result, actionName);
  await ctx.runEvents.append({
    type: eventType,
    payload: { traceId: ctx.traceId },
  });
  return output;
}

type RunAtivoAgentContext = {
  traceId?: string | null;
  runEvents: {
    append: (_event: { type: RunAtivoEvents["type"]; payload?: Record<string, unknown> }) => Promise<void>;
  };
};

function createRunAtivoContext(
  parsed: RunAtivoUniversalInput,
  normalized: RunAtivoReportingInput
): RunAtivoAgentContext {
  const traceId = resolvedTraceId(parsed, normalized);

  return {
    traceId,
    runEvents: {
      append: async (event) => {
        if (!parsed.runId) return;
        await emitRunEvent({
          runId: parsed.runId,
          tenantId: parsed.tenantId,
          workspaceId: parsed.workspaceId,
          type: event.type,
          payload: {
            timestamp: Date.now(),
            traceId: traceId ?? null,
            ...(event.payload ?? {}),
          },
        });
      },
    },
  };
}

function resolvedTraceId(
  parsed: RunAtivoUniversalInput,
  normalized: RunAtivoReportingInput
): string | null | undefined {
  return parsed.traceId ?? normalized.metadata.traceId ?? null;
}
