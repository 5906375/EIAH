import { Router } from "express";
import { enforceTenant } from "../middlewares/enforceTenant";
import type { TenantAwareRequest } from "../middlewares/enforceTenant";
import { getAgentProfile, listAgents, resolveAgentId } from "../services/agents";

export const agentsRouter = Router();
agentsRouter.use(enforceTenant);

agentsRouter.get("/agents", async (_req, res) => {
  const req = _req as TenantAwareRequest;
  if (!req.authContext || !req.prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const items = await listAgents(req.authContext.tenantId, req.authContext.workspaceId, req.prisma);
  return res.json({ items });
});

agentsRouter.get("/agents/:name", async (req, res) => {
  const request = req as TenantAwareRequest;
  if (!request.authContext || !request.prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const input = req.params.name;
  const resolved = resolveAgentId(input);
  const profile = await getAgentProfile(
    request.authContext.tenantId,
    request.authContext.workspaceId,
    resolved,
    request.prisma
  );

  if (!profile) {
    return res.status(404).json({ ok: false, error: { code: "AGENT_NOT_FOUND", message: `Agent ${input} was not found` } });
  }

  return res.json({ item: profile, resolvedAgentId: resolved });
});
