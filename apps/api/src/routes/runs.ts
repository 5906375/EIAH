import { Buffer } from "node:buffer";
import { Router } from "express";
import { z } from "zod";
import { enforceTenant, TenantAwareRequest } from "../middlewares/enforceTenant";
import { getAgentProfile } from "../services/agents";
import { bindLogger, publishRun } from "@eiah/core";
import { estimateCostCents } from "../services/billing";
import { createRunRecord, finalizeRunRecord, getRun, listRuns } from "../services/runs";
import { listRunEvents, recordRunEvent } from "../services/runEvents";

export const runsRouter = Router();
runsRouter.use(enforceTenant);

const serializeRun = (run: any) => ({
  ...run,
  projectId: run?.workspaceId,
});

const serializeRunEvent = (event: any) => ({
  id: event.id,
  runId: event.runId,
  type: event.type,
  payload: event.payload ?? null,
  createdAt: event.createdAt,
  userId: event.userId ?? undefined,
});

runsRouter.get("/runs", async (req, res) => {
  const { authContext } = req as TenantAwareRequest;
  if (!authContext) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const agent = req.query.agent as string | undefined;
  const status = req.query.status as string | undefined;
  const from = req.query.from ? new Date(String(req.query.from)) : undefined;
  const to = req.query.to ? new Date(String(req.query.to)) : undefined;
  const page = Number(req.query.page ?? 1);
  const size = Number(req.query.size ?? 50);

  const output = await listRuns({
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    agent,
    status: status as any,
    from,
    to,
    page,
    size,
  });

  return res.json({
    items: output.items.map(serializeRun),
    total: output.total,
  });
});

runsRouter.get("/runs/:id", async (req, res) => {
  const { authContext } = req as TenantAwareRequest;
  if (!authContext) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const run = await getRun({
    id: req.params.id,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
  });
  if (!run) {
    return res.status(404).json({
      ok: false,
      error: { code: "NOT_FOUND", message: "run" },
    });
  }

  return res.json(serializeRun(run));
});

runsRouter.get("/runs/:id/events", async (req, res) => {
  const { authContext } = req as TenantAwareRequest;
  if (!authContext) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const events = await listRunEvents({
    runId: req.params.id,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
  });

  return res.json({
    items: events.map(serializeRunEvent),
  });
});

const RunExecutionSchema = z.object({
  agent: z.string().min(1),
  prompt: z.string().min(1),
  metadata: z.record(z.any()).optional(),
});

runsRouter.post("/runs", async (req, res) => {
  const { authContext } = req as TenantAwareRequest;
  if (!authContext) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const parse = RunExecutionSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid payload",
        details: parse.error.flatten(),
      },
    });
  }

  const { agent, prompt, metadata } = parse.data;

  const profile = await getAgentProfile(agent);
  if (!profile) {
    return res.status(404).json({
      ok: false,
      error: { code: "AGENT_NOT_FOUND", message: `Agent ${agent} was not found` },
    });
  }

  const requestPayload = { prompt, metadata };

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
    workspaceId: authContext.workspaceId,
  });

  const run = await createRunRecord({
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    userId: authContext.userId,
    agent,
    status: "pending",
    request: requestPayload,
    costCents: estimate,
    traceId: null,
    finishedAt: null,
  });

  await recordRunEvent({
    runId: run.id,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    userId: authContext.userId,
    type: "run.requested",
    payload: {
      agent,
      promptPreview: prompt.slice(0, 200),
      metadata,
    },
  });

  const runLogger = req.logger
    ? bindLogger(req.logger, {
        runId: run.id,
        agent,
        costCents: estimate,
      })
    : undefined;
  runLogger?.info(
    {
      metadataKeys: metadata && typeof metadata === "object" ? Object.keys(metadata) : [],
    },
    "run.request_received"
  );

  try {
    await publishRun({
      runId: run.id,
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      userId: authContext.userId,
      agent,
      prompt,
      metadata,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to enqueue run";
    runLogger?.error(
      {
        err: error,
      },
      "run.enqueue_failed"
    );

    await finalizeRunRecord({
      runId: run.id,
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      status: "error",
      response: { error: message },
      costCents: 0,
      errorCode: "QUEUE_ENQUEUE_FAILED",
    });

    await recordRunEvent({
      runId: run.id,
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      userId: authContext.userId,
      type: "run.failed",
      payload: {
        status: "error",
        message,
      },
    });

    return res.status(500).json({
      ok: false,
      error: { code: "QUEUE_ENQUEUE_FAILED", message },
      data: serializeRun({
        ...run,
        status: "error",
        response: { error: message },
        costCents: 0,
      }),
    });
  }

  await recordRunEvent({
    runId: run.id,
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    userId: authContext.userId,
    type: "run.enqueued",
    payload: {
      agent,
      estimateCostCents: estimate,
    },
  });
  runLogger?.info(
    {
      queue: "runQueue",
    },
    "run.enqueued"
  );

  return res.status(202).json({
    ok: true,
    data: serializeRun(run),
  });
});
