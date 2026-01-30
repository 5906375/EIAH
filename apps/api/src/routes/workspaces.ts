import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { prismaGlobal } from "@repo/db";
import { enforceTenant, type TenantAwareRequest } from "../middlewares/enforceTenant";

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
