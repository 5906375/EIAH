import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { prismaGlobal } from "@repo/db";
import { enforceTenant, type TenantAwareRequest } from "../middlewares/enforceTenant";
import { requireTenantRole } from "../middlewares/requireTenantRole";

export const workspacesRouter = Router();
workspacesRouter.use(enforceTenant);

const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(80),
});

const listWorkspaceSchema = z.object({
  tenantId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

const activateWorkspaceEntitlementSchema = z.object({
  workspaceId: z.string().min(1),
  agentId: z.string().min(1),
});

async function generateWorkspaceId() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = `ws_${crypto.randomBytes(6).toString("hex")}`;
    const exists = await prismaGlobal.workspace.findUnique({
      where: { id: candidate },
      select: { id: true },
    });
    if (!exists) return candidate;
  }
  return null;
}

workspacesRouter.get("/workspaces", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  if (!authContext || !prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const parsed = listWorkspaceSchema.safeParse(req.query ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: { code: "INVALID_QUERY", details: parsed.error.flatten() },
    });
  }

  const tenantId = parsed.data.tenantId?.trim() || authContext.tenantId;
  if (tenantId !== authContext.tenantId) {
    return res.status(403).json({
      ok: false,
      error: { code: "TENANT_FORBIDDEN", message: "Tenant mismatch" },
    });
  }

  const take = parsed.data.limit ?? 200;

  try {
    const items = await prisma.workspace.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        name: true,
        tenantId: true,
        createdAt: true,
      },
    });

    return res.status(200).json({ ok: true, items });
  } catch (error) {
    req.logger?.error({ error }, "workspace.list_failed");
    return res.status(500).json({
      ok: false,
      error: { code: "WORKSPACE_LIST_FAILED", message: "Failed to list workspaces" },
    });
  }
});

workspacesRouter.post(
  "/workspaces",
  requireTenantRole("TENANT_ADMIN"),
  async (req, res) => {
  const { authContext } = req as TenantAwareRequest;
  if (!authContext) {
    return res.status(500).json({
      ok: false,
      error: { code: "MISSING_AUTH_CONTEXT", message: "Auth context missing" },
    });
  }

  const parsed = createWorkspaceSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: { code: "INVALID_PAYLOAD", details: parsed.error.flatten() },
    });
  }

  const tenantId = authContext.tenantId;
  const name = parsed.data.name.trim();
  const workspaceId = await generateWorkspaceId();

  if (!workspaceId) {
    return res.status(500).json({
      ok: false,
      error: { code: "WORKSPACE_ID_UNAVAILABLE", message: "Failed to generate workspace id" },
    });
  }

  try {
    const created = await prismaGlobal.workspace.create({
      data: {
        id: workspaceId,
        tenantId,
        name,
      },
      select: { id: true, name: true, createdAt: true },
    });

    return res.status(201).json({
      ok: true,
      data: {
        workspaceId: created.id,
        name: created.name,
        createdAt: created.createdAt,
      },
    });
  } catch (error) {
    req.logger?.error({ error }, "workspace.create_failed");
    return res.status(500).json({
      ok: false,
      error: { code: "WORKSPACE_CREATE_FAILED", message: "Failed to create workspace" },
    });
  }
  }
);

workspacesRouter.post(
  "/workspaces/:workspaceId/agents/:agentId/activate",
  requireTenantRole("TENANT_ADMIN"),
  async (req, res) => {
    const { authContext, prisma } = req as TenantAwareRequest;
    if (!authContext || !prisma) {
      return res.status(500).json({
        ok: false,
        error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
      });
    }

    const parsed = activateWorkspaceEntitlementSchema.safeParse(req.params ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: { code: "INVALID_PARAMS", details: parsed.error.flatten() },
      });
    }

    const workspaceId = parsed.data.workspaceId.trim();
    const agentId = parsed.data.agentId.trim();

    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, tenantId: authContext.tenantId },
      select: { id: true },
    });

    if (!workspace) {
      return res.status(404).json({
        ok: false,
        error: { code: "WORKSPACE_NOT_FOUND", message: "Workspace not found for tenant" },
      });
    }

    const tenantEntitlement = await prisma.tenantEntitlement.findUnique({
      where: {
        unique_tenant_entitlement_agent: {
          tenantId: authContext.tenantId,
          agentId,
        },
      },
      select: { id: true, status: true },
    });

    if (!tenantEntitlement || tenantEntitlement.status !== "ACTIVE") {
      return res.status(409).json({
        ok: false,
        error: {
          code: "TENANT_ENTITLEMENT_REQUIRED",
          message: "Tenant entitlement is required before workspace activation",
        },
      });
    }

    const activated = await prisma.workspaceEntitlement.upsert({
      where: {
        unique_workspace_entitlement_agent: {
          tenantId: authContext.tenantId,
          workspaceId,
          agentId,
        },
      },
      create: {
        tenantId: authContext.tenantId,
        workspaceId,
        agentId,
        tenantEntitlementId: tenantEntitlement.id,
        status: "ACTIVE",
        activatedByUserId: authContext.userId ?? null,
        metadata: { source: "workspace.activate" },
      },
      update: {
        tenantEntitlementId: tenantEntitlement.id,
        status: "ACTIVE",
        activatedByUserId: authContext.userId ?? null,
        metadata: { source: "workspace.activate" },
      },
      select: {
        id: true,
        tenantId: true,
        workspaceId: true,
        agentId: true,
        status: true,
        tenantEntitlementId: true,
      },
    });

    return res.status(200).json({ ok: true, data: activated });
  }
);
