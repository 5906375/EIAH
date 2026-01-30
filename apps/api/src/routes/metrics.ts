import { Router } from "express";
import { queueSnapshot } from "@eiah/core";

export const metricsRouter = Router();

metricsRouter.get("/", async (_req, res) => {
  const queues = await queueSnapshot();

  return res.json({
    ok: true,
    queues,
    timestamp: Date.now(),
  });
});
