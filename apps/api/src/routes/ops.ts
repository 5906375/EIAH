import { randomBytes } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import {
  drainRunDlq,
  drainRunQueue,
  getRunDlqCounts,
  getRunQueueCounts,
} from "@eiah/core/queue/runQueue";
import {
  drainActionDlq,
  drainActionQueue,
  getActionDlqCounts,
  getActionQueueCounts,
} from "@eiah/core/queue/actionQueue";

const prisma = new PrismaClient();
const opsRouter = Router();

const adminTokenHeader = "x-eiah-admin-token";

function extractAdminToken(req: Request) {
  const headerValue = req.header(adminTokenHeader);
  if (headerValue) {
    return headerValue.trim();
  }

  const auth = req.header("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  return null;
}

function requireAdminToken(req: Request, res: Response, next: NextFunction) {
  const expectedToken = process.env.ADMIN_API_TOKEN;
  if (!expectedToken) {
    res.status(500).json({
      error: "admin_token_not_configured",
      message: "ADMIN_API_TOKEN env var is not configured on the server",
    });
    return;
  }

  const provided = extractAdminToken(req);
  if (!provided || provided !== expectedToken) {
    res.status(401).json({
      error: "invalid_admin_token",
    });
    return;
  }

  next();
}

opsRouter.use(requireAdminToken);

const createTokenSchema = z.object({
  tenantId: z.string().min(1),
  workspaceId: z.string().min(1),
  userEmail: z.string().email().optional(),
  description: z.string().max(200).optional(),
});

opsRouter.post("/tokens", async (req, res) => {
  const parsed = createTokenSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({
      error: "invalid_payload",
      details: parsed.error.flatten(),
    });
    return;
  }

  const { tenantId, workspaceId, userEmail, description } = parsed.data;

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true },
  });

  if (!tenant) {
    res.status(404).json({
      error: "tenant_not_found",
    });
    return;
  }

  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true, tenantId: true },
  });

  if (!workspace || workspace.tenantId !== tenantId) {
    res.status(404).json({
      error: "workspace_not_found",
    });
    return;
  }

  let userId: string | undefined;
  if (userEmail) {
    const existingUser = await prisma.user.findFirst({
      where: { tenantId, email: userEmail },
      select: { id: true },
    });
    if (!existingUser) {
      res.status(404).json({
        error: "user_not_found",
      });
      return;
    }
    userId = existingUser.id;
  }

  const tokenValue = `tok_${randomBytes(24).toString("hex")}`;
  const created = await prisma.apiToken.create({
    data: {
      token: tokenValue,
      tenantId,
      workspaceId,
      userId,
      description: description ?? (userEmail ? `CLI token for ${userEmail}` : "CLI token"),
    },
    select: {
      id: true,
      token: true,
      tenantId: true,
      workspaceId: true,
      userId: true,
      createdAt: true,
      expiresAt: true,
    },
  });

  res.status(201).json({
    tokenId: created.id,
    token: created.token,
    tenantId: created.tenantId,
    workspaceId: created.workspaceId,
    userId: created.userId,
    createdAt: created.createdAt,
    expiresAt: created.expiresAt,
  });
});

const drainQueueSchema = z.object({
  queue: z.enum(["run", "action"]).default("run"),
  target: z.enum(["main", "dlq"]).default("main"),
  includeDelayed: z.boolean().optional(),
});

opsRouter.post("/queues/drain", async (req, res) => {
  const parsed = drainQueueSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({
      error: "invalid_payload",
      details: parsed.error.flatten(),
    });
    return;
  }

  const { queue, target, includeDelayed } = parsed.data;

  const includeDelayedJobs = includeDelayed ?? true;

  const before =
    queue === "run"
      ? target === "dlq"
        ? await getRunDlqCounts()
        : await getRunQueueCounts()
      : target === "dlq"
        ? await getActionDlqCounts()
        : await getActionQueueCounts();

  if (queue === "run") {
    if (target === "dlq") {
      await drainRunDlq({ includeDelayed: includeDelayedJobs });
    } else {
      await drainRunQueue({ includeDelayed: includeDelayedJobs });
    }
  } else if (target === "dlq") {
    await drainActionDlq({ includeDelayed: includeDelayedJobs });
  } else {
    await drainActionQueue({ includeDelayed: includeDelayedJobs });
  }

  const after =
    queue === "run"
      ? target === "dlq"
        ? await getRunDlqCounts()
        : await getRunQueueCounts()
      : target === "dlq"
        ? await getActionDlqCounts()
        : await getActionQueueCounts();

  const drainedCount = Math.max(
    0,
    before.waiting + before.delayed + before.active - (after.waiting + after.delayed + after.active)
  );

  res.json({
    queue,
    target,
    includeDelayed: includeDelayedJobs,
    drained: drainedCount,
    before,
    after,
  });
});

export { opsRouter };
