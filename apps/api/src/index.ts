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
import { createLogger } from "@eiah/core";
import { requestLogger } from "./middlewares/requestLogger";
import { collectQueueHealth } from "./services/health";
import { createPublicHealthHandler } from "./routes/health";
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
import { authRouter } from "./routes/auth";
import { profileRouter } from "./routes/profile";
import { operationalInsightsRouter } from "./routes/operational-insights";
import { economyOpportunitiesRouter } from "./routes/economy-opportunities";
import { shadowExecutionsRouter } from "./routes/shadow-executions";
import { onboardingContextRouter } from "./routes/onboarding-context";
import { tenantRecipesRouter } from "./routes/tenant-recipes";
import { startTenantBillingReconciler } from "./services/tenantBillingReconciler";
import { imobRouter } from "./routes/imob";
import { helpRouter } from "./routes/help";
import { startRunArchiveWorker } from "./workers/runArchiveWorker";


const app = express();
const bootstrapLogger = createLogger({ component: "api-bootstrap" });
const allowedOrigins = (process.env.CORS_ORIGIN ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

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
app.use(express.json({ limit: "10mb" }));

app.get("/api/health", createPublicHealthHandler());

app.get("/health", createPublicHealthHandler());

app.get("/health/queues", async (_req, res) => {
  const report = await collectQueueHealth();
  res.status(report.status === "ok" ? 200 : 503).json(report);
});

app.use("/api/ops", opsRouter);
// Public auth routes must come before protected routers that apply enforceTenant.
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
app.use("/api", sessionRouter);
app.use("/api", workspacesRouter);
app.use("/api", profileRouter);
app.use("/api", operationalInsightsRouter);
app.use("/api", economyOpportunitiesRouter);
app.use("/api", shadowExecutionsRouter);
app.use("/api", onboardingContextRouter);
app.use("/api", tenantRecipesRouter);
app.use("/api/imob", imobRouter);
app.use("/api", helpRouter);
app.use("/metrics", metricsRouter);
app.use("/metrics/prom", metricsPromRouter);

const port = process.env.PORT || 8080;
const shouldStartWorker = (() => {
  const value = process.env.RUN_QUEUE_WORKER;
  if (!value) return true;
  const normalized = value.trim().toLowerCase();
  return normalized !== "false" && normalized !== "0" && normalized !== "off";
})();

if (process.env.NODE_ENV !== "test") {
  assertGovernanceEnv();
  startRunEventOutboxProcessor();
  startTenantBillingReconciler();
  startRunArchiveWorker();
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
