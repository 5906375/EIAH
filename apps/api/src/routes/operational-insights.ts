import { Router } from "express";
import { prismaGlobal } from "@repo/db";
import { enforceTenant, type TenantAwareRequest } from "../middlewares/enforceTenant";
import {
  experienceDiagnosticsWindowSchema,
  type ExperienceDiagnosticsWindow,
} from "../types/experienceDiagnosticSnapshot";
import { readTenantOperationalInsight } from "../services/tenantOperationalInsight";

export const operationalInsightsRouter = Router();
operationalInsightsRouter.use(enforceTenant);

function resolveWindow(value: unknown): ExperienceDiagnosticsWindow {
  const parsed = experienceDiagnosticsWindowSchema.safeParse(value);
  return parsed.success ? parsed.data : "7d";
}

operationalInsightsRouter.get("/operational-insights/tenant/summary", async (req, res) => {
  const typedReq = req as TenantAwareRequest;
  const authContext = typedReq.authContext;
  if (!authContext) {
    return res.status(409).json({
      ok: false,
      error: {
        code: "AUTH_CONTEXT_REQUIRED",
        message: "Authenticated tenant context is required for operational insight access",
      },
    });
  }

  const window = resolveWindow(req.query.window);
  const insight = await readTenantOperationalInsight(prismaGlobal, {
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    window,
  });

  return res.json({
    ok: true,
    data: insight,
  });
});
