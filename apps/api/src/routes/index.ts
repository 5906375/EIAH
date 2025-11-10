import { Router } from "express";
import { agentsRouter } from "./agents";
import { billingRouter } from "./billing";
import { runsRouter } from "./runs";
import { uploadsRouter } from "./uploads";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({ ok: true, service: "eiah-builder-api" });
});

router.use(billingRouter);
router.use(runsRouter);
router.use(agentsRouter);
router.use(uploadsRouter);

export default router;
