import { Router } from "express";
import { Prisma } from "@repo/db";
import { z } from "zod";
import { enforceTenant, type TenantAwareRequest } from "../middlewares/enforceTenant";
import { requireTenantRole } from "../middlewares/requireTenantRole";
import {
  canActivateConnector,
  maskVaultSecretRef,
  validateAllowedResources,
  validateLimits,
} from "../services/tenantGovernance";

export const connectorsRouter = Router();
connectorsRouter.use(enforceTenant);

const createConnectorSchema = z.object({
  provider: z.string().min(1).max(80),
  allowedResources: z.unknown().optional(),
  limits: z.unknown().optional(),
  vaultSecretRef: z.string().min(1).max(512).optional(),
});

const testConnectorSchema = z.object({
  mode: z.enum(["read"]).default("read"),
});

function resolveWorkspaceId(req: TenantAwareRequest, workspaceId: string) {
  if (!req.authContext) return null;
  if (workspaceId !== req.authContext.workspaceId) return null;
  return workspaceId;
}

function asInputJson(value: unknown): Prisma.InputJsonValue {
  if (value === null || value === undefined) return {};
  return value as Prisma.InputJsonValue;
}

function toAllowedResources(value: Prisma.JsonValue): Record<string, unknown> | Array<unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown> | Array<unknown>;
}

function toLimits(value: Prisma.JsonValue): Record<string, number | null | undefined> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, number | null | undefined>;
}

connectorsRouter.get(
  "/workspaces/:id/connectors",
  requireTenantRole(["TENANT_ADMIN", "TENANT_OPERATOR", "TENANT_VIEWER"]),
  async (req, res) => {
    const { prisma } = req as TenantAwareRequest;
    if (!prisma) {
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

    const connectors = await prisma.connectorInstance.findMany({
      orderBy: { createdAt: "desc" },
    });

    return res.json({
      items: connectors.map((connector) => ({
        id: connector.id,
        tenantId: connector.tenantId,
        workspaceId: connector.workspaceId,
        provider: connector.provider,
        allowedResources: connector.allowedResources,
        limits: connector.limits,
        vaultSecretRef: maskVaultSecretRef(connector.vaultSecretRef),
        status: connector.status,
        createdAt: connector.createdAt,
        updatedAt: connector.updatedAt,
      })),
    });
  }
);

connectorsRouter.post(
  "/workspaces/:id/connectors",
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

    const parsed = createConnectorSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: { code: "INVALID_PAYLOAD", details: parsed.error.flatten() },
      });
    }

    const allowedResources = parsed.data.allowedResources ?? {};
    const limits = parsed.data.limits ?? {};
    const vaultSecretRef = parsed.data.vaultSecretRef?.trim() ?? "";

    try {
      const connector = await prisma.connectorInstance.create({
        data: {
          tenantId: authContext.tenantId,
          workspaceId: authContext.workspaceId,
          provider: parsed.data.provider.trim(),
          allowedResources: asInputJson(allowedResources),
          limits: asInputJson(limits),
          vaultSecretRef,
          status: "DRAFT",
          createdByUserId: authContext.userId ?? null,
        },
      });

      return res.status(201).json({
        ok: true,
        data: {
          id: connector.id,
          tenantId: connector.tenantId,
          workspaceId: connector.workspaceId,
          provider: connector.provider,
          allowedResources: connector.allowedResources,
          limits: connector.limits,
          vaultSecretRef: maskVaultSecretRef(connector.vaultSecretRef),
          status: connector.status,
          createdAt: connector.createdAt,
        },
      });
    } catch (error) {
      req.logger?.error({ error }, "connector.create_failed");
      return res.status(500).json({
        ok: false,
        error: { code: "CONNECTOR_CREATE_FAILED", message: "Failed to create connector" },
      });
    }
  }
);

connectorsRouter.post(
  "/connectors/:id/test",
  requireTenantRole(["TENANT_ADMIN", "TENANT_OPERATOR"]),
  async (req, res) => {
    const { authContext, prisma } = req as TenantAwareRequest;
    if (!authContext || !prisma) {
      return res.status(500).json({
        ok: false,
        error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
      });
    }

    const parsed = testConnectorSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: { code: "INVALID_PAYLOAD", details: parsed.error.flatten() },
      });
    }

    const connector = await prisma.connectorInstance.findUnique({
      where: { id: req.params.id },
    });

    if (!connector) {
      return res.status(404).json({
        ok: false,
        error: { code: "CONNECTOR_NOT_FOUND", message: "Connector not found" },
      });
    }

    const connectorAllowed = toAllowedResources(connector.allowedResources);
    const connectorLimits = toLimits(connector.limits);
    if (!validateAllowedResources(connectorAllowed) || !validateLimits(connectorLimits)) {
      return res.status(409).json({
        ok: false,
        error: { code: "CONNECTOR_NOT_READY", message: "Connector configuration incomplete" },
      });
    }

    const run = await prisma.run.create({
      data: {
        tenantId: authContext.tenantId,
        workspaceId: authContext.workspaceId,
        userId: authContext.userId ?? null,
        agent: "connector-test",
        status: "success",
        request: {
          connectorId: connector.id,
          mode: parsed.data.mode,
        } as Prisma.InputJsonValue,
        response: {
          ok: true,
          readOnly: true,
          summary: "Connector test executed in read-only mode.",
        } as Prisma.InputJsonValue,
      },
      select: { id: true },
    });

    return res.json({
      ok: true,
      data: {
        runId: run.id,
        evidencePack: {
          mode: "read-only",
          connectorId: connector.id,
          provider: connector.provider,
        },
      },
    });
  }
);

connectorsRouter.post(
  "/connectors/:id/activate",
  requireTenantRole("TENANT_ADMIN"),
  async (req, res) => {
    const { authContext, prisma } = req as TenantAwareRequest;
    if (!authContext || !prisma) {
      return res.status(500).json({
        ok: false,
        error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
      });
    }

    const connector = await prisma.connectorInstance.findUnique({
      where: { id: req.params.id },
    });

    if (!connector) {
      return res.status(404).json({
        ok: false,
        error: { code: "CONNECTOR_NOT_FOUND", message: "Connector not found" },
      });
    }

    const activation = canActivateConnector({
      role: "TENANT_ADMIN",
      vaultSecretRef: connector.vaultSecretRef,
      allowedResources: toAllowedResources(connector.allowedResources),
      limits: toLimits(connector.limits),
    });

    if (!activation.ok) {
      return res.status(409).json({
        ok: false,
        error: { code: "CONNECTOR_INVALID", message: activation.reason ?? "Cannot activate" },
      });
    }

    const updated = await prisma.connectorInstance.update({
      where: { id: connector.id, tenantId: authContext.tenantId, workspaceId: authContext.workspaceId },
      data: { status: "ACTIVE" },
    });

    return res.json({
      ok: true,
      data: {
        id: updated.id,
        status: updated.status,
        vaultSecretRef: maskVaultSecretRef(updated.vaultSecretRef),
      },
    });
  }
);

connectorsRouter.post(
  "/connectors/:id/disable",
  requireTenantRole("TENANT_ADMIN"),
  async (req, res) => {
    const { authContext, prisma } = req as TenantAwareRequest;
    if (!authContext || !prisma) {
      return res.status(500).json({
        ok: false,
        error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
      });
    }

    const updated = await prisma.connectorInstance.update({
      where: { id: req.params.id, tenantId: authContext.tenantId, workspaceId: authContext.workspaceId },
      data: { status: "DISABLED" },
    });

    return res.json({ ok: true, data: { id: updated.id, status: updated.status } });
  }
);

connectorsRouter.post(
  "/connectors/:id/enable",
  requireTenantRole("TENANT_ADMIN"),
  async (req, res) => {
    const { authContext, prisma } = req as TenantAwareRequest;
    if (!authContext || !prisma) {
      return res.status(500).json({
        ok: false,
        error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
      });
    }

    const updated = await prisma.connectorInstance.update({
      where: { id: req.params.id, tenantId: authContext.tenantId, workspaceId: authContext.workspaceId },
      data: { status: "ACTIVE" },
    });

    return res.json({ ok: true, data: { id: updated.id, status: updated.status } });
  }
);
