import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { prismaGlobal } from "@repo/db";
import { enforceTenant, type TenantAwareRequest } from "../middlewares/enforceTenant";
import {
  canTenantUseReservedDefaultWorkspaceName,
  isReservedDefaultWorkspaceName,
  RESERVED_DEFAULT_WORKSPACE_ALLOWED_TENANT,
} from "../services/workspaceNamingPolicy";

export const workspacesRouter = Router();
workspacesRouter.use(enforceTenant);

const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(80),
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

workspacesRouter.post("/workspaces", async (req, res) => {
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

  if (isReservedDefaultWorkspaceName(name)) {
    const allowed = await canTenantUseReservedDefaultWorkspaceName({
      prisma: prismaGlobal,
      tenantId,
    });
    if (!allowed) {
      return res.status(403).json({
        ok: false,
        error: {
          code: "WORKSPACE_NAME_RESERVED",
          message: `Workspace ${name.toUpperCase()} is reserved for tenant ${RESERVED_DEFAULT_WORKSPACE_ALLOWED_TENANT}`,
        },
      });
    }
  }

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
});

workspacesRouter.get("/workspaces", async (req, res) => {
  const { authContext } = req as TenantAwareRequest;
  if (!authContext) {
    return res.status(500).json({
      ok: false,
      error: { code: "MISSING_AUTH_CONTEXT", message: "Auth context missing" },
    });
  }

  const items = await prismaGlobal.workspace.findMany({
    where: { tenantId: authContext.tenantId },
    select: { id: true, name: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  return res.json({
    ok: true,
    data: {
      currentWorkspaceId: authContext.workspaceId,
      items: items.map((item) => ({
        id: item.id,
        name: item.name,
        createdAt: item.createdAt,
        isCurrent: item.id === authContext.workspaceId,
      })),
    },
  });
});
