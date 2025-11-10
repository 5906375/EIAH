import cors from "cors";
import express from "express";
import { agentsRouter } from "./routes/agents";
import { billingRouter } from "./routes/billing";
import { defiRouter } from "./routes/defi";
import { runsRouter } from "./routes/runs";
import { uploadsRouter } from "./routes/uploads";
import { startRunQueueWorker } from "./workers/runWorker";
import { registerAllActions } from "@eiah/core";

registerAllActions();

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.use("/api", billingRouter);
app.use("/api", runsRouter);
app.use("/api", agentsRouter);
app.use("/api", defiRouter);
app.use("/api", uploadsRouter);

const port = process.env.PORT || 8080;
const shouldStartWorker = (() => {
  const value = process.env.RUN_QUEUE_WORKER;
  if (!value) return true;
  const normalized = value.trim().toLowerCase();
  return normalized !== "false" && normalized !== "0" && normalized !== "off";
})();

if (process.env.NODE_ENV !== "test") {
  if (shouldStartWorker) {
    startRunQueueWorker().catch((error) => {
      console.error("[api] Failed to start run queue worker", error);
    });
  } else {
    console.log("[api] RUN_QUEUE_WORKER disabled; skipping local worker bootstrap.");
  }

  app.listen(port, () => console.log(`API up on :${port}`));
}

export default app;




