import { Router } from "express";
import { agentsRouter } from "./agents";
import { billingRouter } from "./billing";
import { delegationsRouter } from "./delegations";
import { governanceRouter } from "./governance";
import { marketplaceRouter } from "./marketplace";
import { onboardingContextRouter } from "./onboarding-context";
import { runsRouter } from "./runs";
import { tenantRecipesRouter } from "./tenant-recipes";
import { uploadsRouter } from "./uploads";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({ ok: true, service: "eiah-builder-api" });
});

router.use(billingRouter);
router.use(runsRouter);
router.use(agentsRouter);
router.use(uploadsRouter);
router.use(marketplaceRouter);
router.use(tenantRecipesRouter);
router.use(delegationsRouter);
router.use(governanceRouter);
router.use(onboardingContextRouter);

export default router;
