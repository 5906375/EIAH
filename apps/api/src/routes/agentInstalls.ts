import { Router } from "express";
import { Prisma } from "@repo/db";
import { z } from "zod";
import { enforceTenant, type TenantAwareRequest } from "../middlewares/enforceTenant";
import { requireTenantRole } from "../middlewares/requireTenantRole";
import { canActivateAgentInstall } from "../services/tenantGovernance";
import { invalidateActiveInstallationsHint } from "../services/activeInstallationsCache";

export const agentInstallsRouter = Router();
agentInstallsRouter.use(enforceTenant);

const createInstallSchema = z.object({
  agentId: z.string().min(1),
  version: z.string().min(1),
  config: z.unknown().optional(),
});

function resolveWorkspaceId(req: TenantAwareRequest, workspaceId: string) {
  if (!req.authContext) return null;
  if (workspaceId !== req.authContext.workspaceId) return null;
  return workspaceId;
}

function extractConnectorDependencies(config: unknown): string[] {
  if (!config || typeof config !== "object" || Array.isArray(config)) return [];
  const record = config as Record<string, unknown>;
  const ids: string[] = [];
  const single = record.connectorInstanceId;
  if (typeof single === "string" && single.trim()) ids.push(single.trim());
  const list = record.connectorIds;
  if (Array.isArray(list)) {
    list.forEach((value) => {
      if (typeof value === "string" && value.trim()) ids.push(value.trim());
    });
  }
  return Array.from(new Set(ids));
}

async function dependenciesReady(
  prisma: TenantAwareRequest["prisma"],
  config: unknown
): Promise<boolean> {
  if (!prisma) return false;
  const connectorIds = extractConnectorDependencies(config);
  if (connectorIds.length === 0) return true;
  const active = await prisma.connectorInstance.findMany({
    where: {
      id: { in: connectorIds },
      status: "ACTIVE",
    },
    select: { id: true },
  });
  return active.length === connectorIds.length;
}

agentInstallsRouter.get(
  "/workspaces/:id/agent-installs",
  requireTenantRole(["TENANT_ADMIN", "TENANT_OPERATOR", "TENANT_VIEWER"]),
  async (req, res) => {
    const { authContext, prisma } = req as TenantAwareRequest;
    if (!authContext || !prisma) {
      return res.status(500).json({
        ok: false,
        error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
      });
    }

    const workspaceId = resolveWorkspaceId(req as TenantAwareRequest, req.params.id);
    if (!workspaceId) {
      return res.status(403).json({
        ok: false,
        error: { code: "WORKSPACE_FORBIDDEN", message: "Workspace mismatch" },
      });
    }

    const installs = await prisma.agentInstall.findMany({
      orderBy: { createdAt: "desc" },
    });

    return res.json({
      items: installs.map((install) => ({
        id: install.id,
        tenantId: install.tenantId,
        workspaceId: install.workspaceId,
        agentId: install.agentId,
        version: install.version,
        status: install.status,
        createdAt: install.createdAt,
        updatedAt: install.updatedAt,
      })),
    });
  }
);

agentInstallsRouter.post(
  "/workspaces/:id/agents/install",
  requireTenantRole("TENANT_ADMIN"),
  async (req, res) => {
    const { authContext, prisma } = req as TenantAwareRequest;
    if (!authContext || !prisma) {
      return res.status(500).json({
        ok: false,
        error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
      });
    }

    const workspaceId = resolveWorkspaceId(req, req.params.id);
    if (!workspaceId) {
      return res.status(403).json({
        ok: false,
        error: { code: "WORKSPACE_FORBIDDEN", message: "Workspace mismatch" },
      });
    }

    const parsed = createInstallSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: { code: "INVALID_PAYLOAD", details: parsed.error.flatten() },
      });
    }

    const config = parsed.data.config ?? {};
    const dependenciesOk = await dependenciesReady(prisma, config);
    const status = dependenciesOk ? "ACTIVE" : "DRAFT";
    const agentId = parsed.data.agentId.trim();
    const version = parsed.data.version.trim();

    try {
      const existing = await prisma.agentInstall.findFirst({
        where: {
          tenantId: authContext.tenantId,
          workspaceId: authContext.workspaceId,
          agentId,
        },
      });
      const install = existing
        ? await prisma.agentInstall.update({
            where: {
              id: existing.id,
              tenantId: authContext.tenantId,
              workspaceId: authContext.workspaceId,
            },
            data: {
              version,
              config: config as Prisma.InputJsonValue,
              status,
              installedByUserId: authContext.userId ?? null,
            },
          })
        : await prisma.agentInstall.create({
            data: {
              tenantId: authContext.tenantId,
              workspaceId: authContext.workspaceId,
              agentId,
              version,
              config: config as Prisma.InputJsonValue,
              status,
              installedByUserId: authContext.userId ?? null,
            },
          });

      await invalidateActiveInstallationsHint({
        tenantId: authContext.tenantId,
        workspaceId: authContext.workspaceId,
        logger: req.logger,
      });

      return res.status(existing ? 200 : 201).json({
        ok: true,
        data: {
          id: install.id,
          tenantId: install.tenantId,
          workspaceId: install.workspaceId,
          agentId: install.agentId,
          version: install.version,
          status: install.status,
          createdAt: install.createdAt,
        },
      });
    } catch (error) {
      req.logger?.error({ error }, "agentInstall.create_failed");
      return res.status(500).json({
        ok: false,
        error: { code: "AGENT_INSTALL_FAILED", message: "Failed to create agent install" },
      });
    }
  }
);

agentInstallsRouter.post(
  "/agent-installs/:id/activate",
  requireTenantRole("TENANT_ADMIN"),
  async (req, res) => {
    const { authContext, prisma } = req as TenantAwareRequest;
    if (!authContext || !prisma) {
      return res.status(500).json({
        ok: false,
        error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
      });
    }

    const install = await prisma.agentInstall.findUnique({
      where: { id: req.params.id },
    });

    if (!install) {
      return res.status(404).json({
        ok: false,
        error: { code: "AGENT_INSTALL_NOT_FOUND", message: "Agent install not found" },
      });
    }

    const dependenciesOk = await dependenciesReady(prisma, install.config);
    const activation = canActivateAgentInstall({
      role: "TENANT_ADMIN",
      dependenciesOk,
    });

    if (!activation.ok) {
      return res.status(409).json({
        ok: false,
        error: { code: "AGENT_INSTALL_INVALID", message: activation.reason ?? "Cannot activate" },
      });
    }

    const updated = await prisma.agentInstall.update({
      where: { id: install.id, tenantId: authContext.tenantId, workspaceId: authContext.workspaceId },
      data: { status: "ACTIVE" },
    });

    await invalidateActiveInstallationsHint({
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      logger: req.logger,
    });

    return res.json({ ok: true, data: { id: updated.id, status: updated.status } });
  }
);

agentInstallsRouter.post(
  "/agent-installs/:id/disable",
  requireTenantRole("TENANT_ADMIN"),
  async (req, res) => {
    const { authContext, prisma } = req as TenantAwareRequest;
    if (!authContext || !prisma) {
      return res.status(500).json({
        ok: false,
        error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
      });
    }

    const updated = await prisma.agentInstall.update({
      where: { id: req.params.id, tenantId: authContext.tenantId, workspaceId: authContext.workspaceId },
      data: { status: "DISABLED" },
    });

    await invalidateActiveInstallationsHint({
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      logger: req.logger,
    });

    return res.json({ ok: true, data: { id: updated.id, status: updated.status } });
  }
);

agentInstallsRouter.post(
  "/agent-installs/:id/enable",
  requireTenantRole("TENANT_ADMIN"),
  async (req, res) => {
    const { authContext, prisma } = req as TenantAwareRequest;
    if (!authContext || !prisma) {
      return res.status(500).json({
        ok: false,
        error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
      });
    }

    const updated = await prisma.agentInstall.update({
      where: { id: req.params.id, tenantId: authContext.tenantId, workspaceId: authContext.workspaceId },
      data: { status: "ACTIVE" },
    });

    await invalidateActiveInstallationsHint({
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      logger: req.logger,
    });

    return res.json({ ok: true, data: { id: updated.id, status: updated.status } });
  }
);
