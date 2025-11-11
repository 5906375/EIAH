import cors from "cors";
import express from "express";
import { agentsRouter } from "./routes/agents";
import { billingRouter } from "./routes/billing";
import { defiRouter } from "./routes/defi";
import { runsRouter } from "./routes/runs";
import { uploadsRouter } from "./routes/uploads";
import { opsRouter } from "./routes/ops";
import { startRunQueueWorker } from "./workers/runWorker";
import { registerAllActions, createLogger } from "@eiah/core";
import { requestLogger } from "./middlewares/requestLogger";
import { collectHealth } from "./services/health";

registerAllActions();

const app = express();
const bootstrapLogger = createLogger({ component: "api-bootstrap" });

app.use(requestLogger);
app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.get("/health", async (_req, res) => {
  const report = await collectHealth();
  res.status(report.status === "ok" ? 200 : 503).json(report);
});

app.use("/api", billingRouter);
app.use("/api", runsRouter);
app.use("/api", agentsRouter);
app.use("/api", defiRouter);
app.use("/api", uploadsRouter);
app.use("/api/ops", opsRouter);

const port = process.env.PORT || 8080;
const shouldStartWorker = (() => {
  const value = process.env.RUN_QUEUE_WORKER;
  if (!value) return true;
  const normalized = value.trim().toLowerCase();
  return normalized !== "false" && normalized !== "0" && normalized !== "off";
})();

if (process.env.NODE_ENV !== "test") {
  if (shouldStartWorker) {
    void startRunQueueWorker()
      .then(() =>
        bootstrapLogger.info(
          {
            worker: "runQueue",
          },
          "worker.started"
        )
      )
      .catch((error) => {
        bootstrapLogger.error(
          {
            err: error,
            worker: "runQueue",
          },
          "worker.failed"
        );
      });
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




