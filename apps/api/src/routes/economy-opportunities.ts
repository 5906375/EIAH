import { Router } from "express";
import { prismaGlobal } from "@repo/db";
import { enforceTenant, type TenantAwareRequest } from "../middlewares/enforceTenant";
import { readTenantEconomyOpportunitySnapshot } from "../services/economyOpportunityAggregator";
import { QuotaUsageService } from "../services/tenantBilling";

export const economyOpportunitiesRouter = Router();
economyOpportunitiesRouter.use(enforceTenant);

economyOpportunitiesRouter.get("/economy-opportunities/tenant/summary", async (req, res) => {
  const typedReq = req as TenantAwareRequest;
  const authContext = typedReq.authContext;
  if (!authContext) {
    return res.status(409).json({
      ok: false,
      error: {
        code: "AUTH_CONTEXT_REQUIRED",
        message: "Authenticated tenant context is required for economy opportunity access",
      },
    });
  }

  const scope =
    typeof req.query.scope === "string" && req.query.scope.trim().toLowerCase() === "tenant"
      ? "tenant"
      : "workspace";
  const cyclePreset =
    typeof req.query.cycle === "string" && req.query.cycle.trim().toLowerCase() === "previous"
      ? "previous"
      : "current";
  const usageService = new QuotaUsageService(prismaGlobal);
  const currentCycle = await usageService.resolveCycle({ tenantId: authContext.tenantId });
  const previousReference = new Date(currentCycle.cycleStart.getTime() - 1000);
  const selectedCycle =
    cyclePreset === "previous"
      ? await usageService.resolveCycle({
          tenantId: authContext.tenantId,
          referenceDate: previousReference,
        })
      : currentCycle;

  const snapshot = await readTenantEconomyOpportunitySnapshot(prismaGlobal, {
    tenantId: authContext.tenantId,
    workspaceId: scope === "workspace" ? authContext.workspaceId : undefined,
    cycleStart: selectedCycle.cycleStart,
    cycleEnd: selectedCycle.cycleEnd,
  });

  return res.json({
    ok: true,
    data: snapshot,
  });
});
