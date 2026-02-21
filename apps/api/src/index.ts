import "dotenv/config";
import cors from "cors";
import express from "express";
import { agentsRouter } from "./routes/agents";
import { billingRouter } from "./routes/billing";
import { defiRouter } from "./routes/defi";
import { runsRouter } from "./routes/runs";
import { uploadsRouter } from "./routes/uploads";
import { opsRouter } from "./routes/ops";
import { delegationsRouter } from "./routes/delegations";
import { marketplaceRouter } from "./routes/marketplace";
import { governanceRouter } from "./routes/governance";
import { startRunQueueBullMqWorker } from "./workers/runWorker";
import { configureGuardrailLedgerWriter, createLogger } from "@eiah/core";
import { prismaGlobal } from "@repo/db";
import { requestLogger } from "./middlewares/requestLogger";
import { collectHealth, collectQueueHealth } from "./services/health";
import { evaluateSignerBootGate, probeSignerHealth } from "./services/signerHealth";
import "./actions/tenantActionRegistry";
import { actionsRouter } from "./routes/actions";
import { metricsRouter } from "./routes/metrics";
import { metricsPromRouter } from "./routes/metrics-prom";
import { memoryRouter } from "./routes/memory";
import toolsRouter from "./routes/tools";
import { startRunEventOutboxProcessor } from "./services/runEventOutbox";
import { assertGovernanceEnv } from "./services/intentValidator";
import { sessionRouter } from "./routes/session";
import { onboardingRouter } from "./routes/onboarding";
import { workspacesRouter } from "./routes/workspaces";
import { profilesRouter } from "./routes/profiles";
import { authRouter } from "./routes/auth";
import { tenantsRouter } from "./routes/tenants";
import { rolesRouter } from "./routes/roles";
import { connectorsRouter } from "./routes/connectors";
import { agentInstallsRouter } from "./routes/agentInstalls";
import { realestateRouter } from "./routes/realestate";
import { cockpitRouter } from "./routes/cockpit";
import { whatsappWebhookRouter } from "./routes/whatsapp";


const app = express();
const bootstrapLogger = createLogger({ component: "api-bootstrap" });
const allowedOrigins = (process.env.CORS_ORIGIN ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

configureGuardrailLedgerWriter(async (event) => {
  await prismaGlobal.guardrailAuditLedger.create({
    data: {
      tenantId: event.tenantId,
      workspaceId: event.workspaceId ?? null,
      runId: event.runId ?? null,
      eventType: event.type,
      severity: "warn",
      message: event.message ?? `Guardrail event: ${event.type}`,
      metadata: {
        actorId: event.actor ?? null,
        action: event.action ?? null,
        requestId: event.requestId ?? null,
        timestamp: (event.timestamp ?? new Date()).toISOString(),
      },
    },
  });
});

app.use(requestLogger);
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("CORS origin not allowed"));
    },
    credentials: true,
  })
);
app.use("/api", whatsappWebhookRouter);
app.use(express.json({ limit: "10mb" }));

app.get("/api/health", async (_req, res) => {
  const report = await collectHealth();
  res.status(report.status === "ok" ? 200 : 503).json(report);
});

app.get("/health", async (_req, res) => {
  const report = await collectHealth();
  res.status(report.status === "ok" ? 200 : 503).json(report);
});

app.get("/health/queues", async (_req, res) => {
  const report = await collectQueueHealth();
  res.status(report.status === "ok" ? 200 : 503).json(report);
});

app.get("/api/health/signer", async (_req, res) => {
  const report = await probeSignerHealth({ force: true });
  res.status(report.state === "DOWN" ? 503 : 200).json(report);
});

app.get("/health/signer", async (_req, res) => {
  const report = await probeSignerHealth({ force: true });
  res.status(report.state === "DOWN" ? 503 : 200).json(report);
});

app.use("/api/ops", opsRouter);
app.use("/api", sessionRouter);
app.use("/api", authRouter);
app.use("/api", onboardingRouter);
app.use("/api", billingRouter);
app.use("/api", runsRouter);
app.use("/api", agentsRouter);
app.use("/api", defiRouter);
app.use("/api", uploadsRouter);
app.use("/api", marketplaceRouter);
app.use("/api", delegationsRouter);
app.use("/api", governanceRouter);
app.use("/api/tools", toolsRouter);
app.use("/api", memoryRouter);
app.use("/api/actions", actionsRouter);
app.use("/api", workspacesRouter);
app.use("/api", tenantsRouter);
app.use("/api", rolesRouter);
app.use("/api", connectorsRouter);
app.use("/api", agentInstallsRouter);
app.use("/api", profilesRouter);
app.use("/api", realestateRouter);
app.use("/api", cockpitRouter);
app.use("/metrics", metricsRouter);
app.use("/metrics/prom", metricsPromRouter);

const port = process.env.PORT || 8080;

function parseBoolEnv(value?: string): boolean | undefined {
  if (value == null) return undefined;
  const v = value.trim().toLowerCase();
  if (["true", "1", "on", "yes"].includes(v)) return true;
  if (["false", "0", "off", "no"].includes(v)) return false;
  return undefined;
}

const nodeEnv = (process.env.NODE_ENV ?? "development").toLowerCase();
const isProd = nodeEnv === "production";
const runWorkerFlag = parseBoolEnv(process.env.RUN_QUEUE_WORKER);
let shouldStartWorker = runWorkerFlag ?? true;

if (isProd) {
  if (runWorkerFlag !== false) {
    throw new Error(
      [
        "EIAH GUARDRAIL: RUN_QUEUE_WORKER must be explicitly 'false/off/0' on the Gateway in production.",
        "Reason: prevent two concurrent run consumers (gateway embedded worker + standalone worker).",
        "Fix: set RUN_QUEUE_WORKER=false in apps/api production environment configuration.",
      ].join(" ")
    );
  }
  shouldStartWorker = false;
}

if (process.env.NODE_ENV !== "test") {
  const signerBootGate = await evaluateSignerBootGate();
  if (signerBootGate.decision === "down") {
    bootstrapLogger.error(
      {
        decision: signerBootGate.decision,
        criticalEnv: signerBootGate.criticalEnv,
        allowDegraded: signerBootGate.allowDegraded,
        signer: signerBootGate.probe,
      },
      "signer.boot_gate.denied"
    );
    throw new Error(
      `Signer boot gate denied startup (state=${signerBootGate.probe.state}, criticalEnv=${String(
        signerBootGate.criticalEnv
      )})`
    );
  }
  bootstrapLogger.info(
    {
      decision: signerBootGate.decision,
      criticalEnv: signerBootGate.criticalEnv,
      allowDegraded: signerBootGate.allowDegraded,
      signer: signerBootGate.probe,
    },
    "signer.boot_gate"
  );

  assertGovernanceEnv();
  startRunEventOutboxProcessor();
  if (shouldStartWorker) {
    try {
      startRunQueueBullMqWorker();
      console.log("Worker iniciado com sucesso");
    } catch (error) {
      console.error("Erro ao iniciar worker:", error);
    }
  } else {
    bootstrapLogger.info(
      {
        worker: "runQueue",
        reason: "disabled",
      },
      "worker.skipped"
    );
  }

  app.listen(port, () =>
    bootstrapLogger.info(
      {
        port,
      },
      "api.started"
    )
  );
}

export default app;
