import "dotenv/config";
import cors from "cors";
import express from "express";
import { governedErrorHandler } from "./middlewares/governedErrorHandler";
import { agentsRouter } from "./routes/agents";
import { billingRouter } from "./routes/billing";
import { defiRouter } from "./routes/defi";
import { runsRouter } from "./routes/runs";
import { uploadsRouter } from "./routes/uploads";
import { opsRouter } from "./routes/ops";
import { delegationsRouter } from "./routes/delegations";
import { marketplaceRouter } from "./routes/marketplace";
import { commercialAuthorityRouter } from "./routes/commercialAuthority";
import { governanceRouter } from "./routes/governance";
import { startRunQueueBullMqWorker } from "./workers/runWorker";
import { createLogger, requireRedisUrl } from "@eiah/core";
import { requestLogger } from "./middlewares/requestLogger";
import { collectQueueHealth } from "./services/health";
import { createPublicHealthHandler } from "./routes/health";
import "./actions/tenantActionRegistry";
import { actionsRouter } from "./routes/actions";
import { metricsRouter } from "./routes/metrics";
import { metricsPromRouter } from "./routes/metrics-prom";
import { memoryRouter } from "./routes/memory";
import toolsRouter from "./routes/tools";
import { startRunEventOutboxProcessor, stopRunEventOutboxProcessor } from "./services/runEventOutbox";
import { assertGovernanceEnv } from "./services/intentValidator";
import { sessionRouter } from "./routes/session";
import { oraculoPreparationRouter } from "./routes/oraculoPreparation";
import { onboardingRouter } from "./routes/onboarding";
import { workspacesRouter } from "./routes/workspaces";
import { authRouter } from "./routes/auth";
import { profileRouter } from "./routes/profile";
import { operationalInsightsRouter } from "./routes/operational-insights";
import { economyOpportunitiesRouter } from "./routes/economy-opportunities";
import { shadowExecutionsRouter } from "./routes/shadow-executions";
import { onboardingContextRouter } from "./routes/onboarding-context";
import { tenantRecipesRouter } from "./routes/tenant-recipes";
import { startTenantBillingReconciler, stopTenantBillingReconciler } from "./services/tenantBillingReconciler";
import { imobRouter } from "./routes/imob";
import { chatVerticalsRouter } from "./routes/chatVerticals";
import { verticalAccessRouter } from "./routes/verticalAccess";
import { frontDoorAccessRouter } from "./routes/frontDoorAccess";
import { frontDoorBillingRouter } from "./routes/frontDoorBilling";
import { chatVerticalImobRuntimeShadowRouter } from "./routes/chatVerticalImobRuntimeShadow";
import { isChatVerticalImobRuntimeShadowRouteEnabled } from "./routes/chatVerticalImobRuntimeShadowGate";
import { preDuimpRuntimeShadowRouter } from "./routes/preDuimpRuntimeShadow";
import { isPreDuimpRuntimeShadowRouteEnabled } from "./routes/preDuimpRuntimeShadowGate";
import { helpRouter } from "./routes/help";
import { whatsappRouter } from "./routes/whatsapp";
import { startRunArchiveWorker, stopRunArchiveWorker } from "./workers/runArchiveWorker";
import { startImobPostRunMutationWorker, stopImobPostRunMutationWorker } from "./workers/imobPostRunMutationWorker";
import { startUploadRetentionWorker, stopUploadRetentionWorker } from "./workers/uploadRetentionWorker";
import { createShutdownCoordinator, drainHttpServer, resolveHttpDrainMs, resolveShutdownTimeoutMs } from "./services/gracefulShutdown";
import { closeRunEventsTransport } from "./services/runEvents";
import { closeRunEventStream } from "./services/runEventStream";
import { closeMemoryResources } from "./services/memory";
import { closeDraftStoreResources } from "./services/imob/intake/imobContractDraftService";
import { closePrismaResources } from "@repo/db";
import { closeRunQueueConnections } from "@eiah/core/queue/runQueue";
import { closeTenantPolicyStoreResources } from "@eiah/core/policy/TenantPolicyStore";
import { closeCriticalKillSwitchRedis } from "@eiah/core/security/killSwitch";
import { resolveWorkerTopology } from "@eiah/core/queue/workerTopology";
import { acquireWorkerOwnershipLease } from "@eiah/core/queue/workerOwnershipLease";
import { setWorkerOwnershipState } from "./services/health";
import { warnEnabledSecurityRelaxations } from "./services/securityRelaxationFlags";
import Redis from "ioredis";

const app = express();
const bootstrapLogger = createLogger({ component: "api-bootstrap" });

// Ultima rede de seguranca do processo (N-13). Rejeicoes de rota ja sao
// capturadas por asyncHandler/createGovernedRouter antes de chegarem aqui —
// isto cobre rejeicoes fora do ciclo de requisicao (timers, workers,
// listeners). unhandledRejection: loga e mantem o processo (rejeicao isolada
// nao implica estado corrompido). uncaughtException: loga e sai limpo — o
// processo pode estar em estado inconsistente apos uma excecao sincrona nao
// tratada; deixamos o orquestrador (systemd/pm2/k8s) reiniciar, mesmo padrao
// de "sair para deixar o supervisor recuperar" do shutdown gracioso
// (createShutdownCoordinator, SIGINT/SIGTERM) mais abaixo.
process.on("unhandledRejection", (reason) => {
  bootstrapLogger.error({ err: reason }, "api.unhandled_rejection");
});
process.on("uncaughtException", (err) => {
  bootstrapLogger.error({ err }, "api.uncaught_exception");
  process.exit(1);
});

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
// These administrative routers enforce tenant and canonical admin scopes locally.
app.use("/api/tools", toolsRouter);
app.use("/api/actions", actionsRouter);
app.use("/api", billingRouter);
app.use("/api", whatsappRouter);
app.use("/api", runsRouter);
app.use("/api", agentsRouter);
app.use("/api", defiRouter);
app.use("/api", uploadsRouter);
// Prefixo estreito exclusivo: o enforceTenant desse router não alcança as demais rotas de /api.
app.use("/api/commercial-authority", commercialAuthorityRouter);
app.use("/api", marketplaceRouter);
app.use("/api", delegationsRouter);
app.use("/api", governanceRouter);
app.use("/api", memoryRouter);
app.use("/api", sessionRouter);
app.use("/api", oraculoPreparationRouter);
app.use("/api", workspacesRouter);
app.use("/api", profileRouter);
app.use("/api", operationalInsightsRouter);
app.use("/api", economyOpportunitiesRouter);
app.use("/api", shadowExecutionsRouter);
app.use("/api", onboardingContextRouter);
app.use("/api", tenantRecipesRouter);
app.use("/api/imob", imobRouter);
app.use("/api", chatVerticalsRouter);
app.use("/api", verticalAccessRouter);
app.use("/api", frontDoorAccessRouter);
app.use("/api", frontDoorBillingRouter);
if (isChatVerticalImobRuntimeShadowRouteEnabled()) {
  app.use("/api", chatVerticalImobRuntimeShadowRouter);
}
if (isPreDuimpRuntimeShadowRouteEnabled()) {
  app.use("/api", preDuimpRuntimeShadowRouter);
}
app.use("/api", helpRouter);
app.use("/metrics", metricsRouter);
app.use("/metrics/prom", metricsPromRouter);

// Middleware de erro 4-arg — deve ser o ultimo registrado. So captura o que
// nenhum handler/gate ja tratou (403/401/400 governados retornam antes de
// chegar aqui); nunca reclassifica um erro ja respondido (N-13).
app.use(governedErrorHandler);

const port = process.env.PORT || 8080;

if (process.env.NODE_ENV !== "test") {
  warnEnabledSecurityRelaxations(bootstrapLogger);

  const workerTopology = resolveWorkerTopology(process.env);
  bootstrapLogger.info(
    {
      environmentId: workerTopology.environmentId,
      serviceRole: workerTopology.serviceRole,
      runQueueConsumerMode: workerTopology.runQueueConsumerMode,
      runAtivoConsumerMode: workerTopology.runAtivoConsumerMode,
      consumes: workerTopology.consumes,
    },
    "worker.topology_resolved"
  );
  assertGovernanceEnv();

  const shutdownTimeoutMs = resolveShutdownTimeoutMs(process.env.API_SHUTDOWN_TIMEOUT_MS);
  const shutdownCoordinator = createShutdownCoordinator({
    logger: bootstrapLogger,
    exit: (code) => process.exit(code),
    timeoutMs: shutdownTimeoutMs,
    onDeadline: () => httpServer?.closeAllConnections(),
  });
  shutdownCoordinator.installSignalHandlers(process);
  let httpServer: ReturnType<typeof app.listen> | null = null;

  startRunEventOutboxProcessor();
  startTenantBillingReconciler();
  startRunArchiveWorker();
  startUploadRetentionWorker();
  startImobPostRunMutationWorker();

  shutdownCoordinator.register({
    name: "http-server",
    phase: "http",
    run: async () => {
      if (httpServer) await drainHttpServer(httpServer, resolveHttpDrainMs(shutdownTimeoutMs), bootstrapLogger);
    },
  });
  shutdownCoordinator.register({ name: "imob-post-run-mutation-worker", phase: "consumers", run: stopImobPostRunMutationWorker });
  shutdownCoordinator.register({ name: "run-event-outbox", phase: "schedulers", run: stopRunEventOutboxProcessor });
  shutdownCoordinator.register({ name: "tenant-billing-reconciler", phase: "schedulers", run: stopTenantBillingReconciler });
  shutdownCoordinator.register({ name: "run-archive-worker", phase: "schedulers", run: stopRunArchiveWorker });
  shutdownCoordinator.register({ name: "upload-retention-worker", phase: "schedulers", run: stopUploadRetentionWorker });
  for (const [name, close] of [
    ["run-events-transport", closeRunEventsTransport],
    ["run-event-stream", closeRunEventStream],
    ["memory", closeMemoryResources],
    ["imob-draft-store", closeDraftStoreResources],
    ["run-queue", closeRunQueueConnections],
    ["tenant-policy-store", closeTenantPolicyStoreResources],
    ["kill-switch", closeCriticalKillSwitchRedis],
    ["prisma", closePrismaResources],
  ] as const) {
    shutdownCoordinator.register({ name, phase: "connections", run: close });
  }

  // Worker ownership lease — async, runs in background while HTTP server starts
  void (async () => {
    if (workerTopology.consumes.runs) {
      const leaseOwnerId = `api-${process.pid}-${Date.now()}`;
      const leaseRedis = new Redis(requireRedisUrl(process.env.REDIS_URL, "api:workerOwnershipLease"));
      let runWorkerInstance: ReturnType<typeof startRunQueueBullMqWorker> | null = null;

      const lease = await acquireWorkerOwnershipLease({
        environmentId: workerTopology.environmentId,
        queue: "runs",
        ownerId: leaseOwnerId,
        redis: leaseRedis,
        onLeaseLost: () => {
          bootstrapLogger.error(
            { worker: "runQueue", ownerId: leaseOwnerId },
            "worker.ownership_lease_lost — closing worker fail-closed"
          );
          setWorkerOwnershipState("runs", { owned: false, ownerId: null, acquiredAt: null });
          void runWorkerInstance
            ?.close()
            .catch(() => undefined)
            .finally(() => void leaseRedis.quit().catch(() => undefined));
        },
      });

      if (!lease.acquired) {
        bootstrapLogger.warn(
          { worker: "runQueue", ownerId: leaseOwnerId },
          "worker.ownership_not_acquired — another instance holds the lease; skipping consumer"
        );
        void leaseRedis.quit().catch(() => undefined);
        return;
      }

      if (shutdownCoordinator.isShuttingDown()) {
        // Lease obtido depois do início do encerramento: não inicia consumidor novo.
        await lease.release();
        void leaseRedis.quit().catch(() => undefined);
        return;
      }

      setWorkerOwnershipState("runs", {
        owned: true,
        ownerId: leaseOwnerId,
        acquiredAt: new Date().toISOString(),
      });
      runWorkerInstance = startRunQueueBullMqWorker();
      bootstrapLogger.info(
        {
          worker: "runQueue",
          owner: workerTopology.serviceRole,
          mode: workerTopology.runQueueConsumerMode,
          ownerId: leaseOwnerId,
        },
        "worker.started"
      );

      // Ordem: o consumidor para (aguardando os jobs ativos) ANTES de o lease ser liberado,
      // para que nenhum job seja processado sem ownership.
      shutdownCoordinator.register({
        name: "run-queue-worker+ownership-lease",
        phase: "consumers",
        run: async () => {
          try {
            await runWorkerInstance?.close();
          } finally {
            bootstrapLogger.info({ worker: "runQueue", ownerId: leaseOwnerId }, "api.worker_shutdown — releasing ownership lease");
            setWorkerOwnershipState("runs", { owned: false, ownerId: null, acquiredAt: null });
            await lease.release();
            await leaseRedis.quit().catch(() => undefined);
          }
        },
      });
    } else {
      bootstrapLogger.info(
        {
          worker: "runQueue",
          reason: "topology_disabled",
          owner: workerTopology.serviceRole,
          mode: workerTopology.runQueueConsumerMode,
        },
        "worker.skipped"
      );
    }
  })().catch((err: unknown) => {
    bootstrapLogger.error({ err }, "api.worker_bootstrap_failed");
    process.exit(1);
  });

  httpServer = app.listen(port, () =>
    bootstrapLogger.info(
      {
        port,
      },
      "api.started"
    )
  );
}

export default app;
