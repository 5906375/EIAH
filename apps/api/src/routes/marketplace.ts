import { Router } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { enforceTenant, type TenantAwareRequest } from "../middlewares/enforceTenant";

export const marketplaceRouter = Router();
marketplaceRouter.use(enforceTenant);

marketplaceRouter.get("/marketplace/my-delegations", (req, res) => {
  const basePath = req.baseUrl ?? "";
  return res.redirect(307, `${basePath}/delegations?role=delegatee`);
});

const MarketplaceCreateSchema = z.object({
  type: z.enum(["agent", "action"]),
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().max(2000).optional(),
  trustScore: z.number().min(0).max(100).optional(),
  isPublic: z.boolean().optional(),
});

const MarketplaceUpdateSchema = z.object({
  type: z.enum(["agent", "action"]).optional(),
  name: z.string().min(1).optional(),
  version: z.string().min(1).optional(),
  description: z.string().max(2000).optional(),
  trustScore: z.number().min(0).max(100).optional(),
  isPublic: z.boolean().optional(),
});

const MarketplaceSubscribeSchema = z.object({
  scope: z.enum(["read", "execute", "admin"]).optional(),
  trustMin: z.number().min(0).max(100).optional(),
  validUntil: z.string().datetime().optional(),
  policyHash: z.string().optional(),
  signatureHash: z.string().optional(),
});

marketplaceRouter.get("/marketplace", async (req, res) => {
  const request = req as TenantAwareRequest;
  if (!request.authContext || !request.prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const type = typeof req.query.type === "string" ? req.query.type : undefined;
  const publisherId = typeof req.query.publisherId === "string" ? req.query.publisherId : undefined;

  const items = await request.prisma.marketplaceItem.findMany({
    where: {
      ...(type ? { type } : {}),
      ...(publisherId ? { publisherId } : {}),
      OR: [{ isPublic: true }, { publisherId: request.authContext.tenantId }],
    },
    orderBy: { createdAt: "desc" },
    include: { publisher: { select: { name: true } } },
  });

  return res.json({
    items: items.map((item) => {
      const { publisher, ...rest } = item;
      return { ...rest, publisherName: publisher?.name ?? null };
    }),
  });
});

marketplaceRouter.get("/marketplace/:id", async (req, res) => {
  const request = req as TenantAwareRequest;
  if (!request.authContext || !request.prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const item = await request.prisma.marketplaceItem.findUnique({
    where: { id: req.params.id },
    include: { publisher: { select: { name: true } } },
  });

  if (!item) {
    return res.status(404).json({ ok: false, error: { code: "MARKETPLACE_NOT_FOUND" } });
  }

  if (!item.isPublic && item.publisherId !== request.authContext.tenantId) {
    const delegation = await request.prisma.delegationPolicy.findFirst({
      where: {
        delegateeId: request.authContext.tenantId,
        marketplaceId: item.id,
        validUntil: { gt: new Date() },
      },
    });
    if (!delegation) {
      return res.status(403).json({ ok: false, error: { code: "MARKETPLACE_FORBIDDEN" } });
    }
  }

  const { publisher, ...rest } = item;
  return res.json({
    item: {
      ...rest,
      publisherName: publisher?.name ?? null,
    },
  });
});

marketplaceRouter.post("/marketplace", async (req, res) => {
  const request = req as TenantAwareRequest;
  if (!request.authContext || !request.prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const parsed = MarketplaceCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: { code: "INVALID_PAYLOAD" } });
  }

  const item = await request.prisma.marketplaceItem.create({
    data: {
      type: parsed.data.type,
      name: parsed.data.name,
      version: parsed.data.version,
      description: parsed.data.description ?? null,
      trustScore: parsed.data.trustScore ?? null,
      isPublic: parsed.data.isPublic ?? false,
      publisherId: request.authContext.tenantId,
    },
    include: { publisher: { select: { name: true } } },
  });

  const { publisher, ...rest } = item;
  return res.json({
    ok: true,
    item: {
      ...rest,
      publisherName: publisher?.name ?? null,
    },
  });
});

marketplaceRouter.patch("/marketplace/:id", async (req, res) => {
  const request = req as TenantAwareRequest;
  if (!request.authContext || !request.prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const parsed = MarketplaceUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: { code: "INVALID_PAYLOAD" } });
  }

  const existing = await request.prisma.marketplaceItem.findUnique({
    where: { id: req.params.id },
  });

  if (!existing || existing.publisherId !== request.authContext.tenantId) {
    return res.status(404).json({ ok: false, error: { code: "MARKETPLACE_NOT_FOUND" } });
  }

  const item = await request.prisma.marketplaceItem.update({
    where: { id: existing.id },
    data: {
      type: parsed.data.type ?? existing.type,
      name: parsed.data.name ?? existing.name,
      version: parsed.data.version ?? existing.version,
      description: parsed.data.description ?? existing.description,
      trustScore: parsed.data.trustScore ?? existing.trustScore,
      isPublic: parsed.data.isPublic ?? existing.isPublic,
    },
    include: { publisher: { select: { name: true } } },
  });

  const { publisher, ...rest } = item;
  return res.json({
    ok: true,
    item: {
      ...rest,
      publisherName: publisher?.name ?? null,
    },
  });
});

marketplaceRouter.delete("/marketplace/:id", async (req, res) => {
  const request = req as TenantAwareRequest;
  if (!request.authContext || !request.prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const existing = await request.prisma.marketplaceItem.findUnique({
    where: { id: req.params.id },
  });

  if (!existing || existing.publisherId !== request.authContext.tenantId) {
    return res.status(404).json({ ok: false, error: { code: "MARKETPLACE_NOT_FOUND" } });
  }

  await request.prisma.marketplaceItem.delete({ where: { id: existing.id } });
  return res.json({ ok: true });
});

marketplaceRouter.post("/marketplace/:id/subscribe", async (req, res) => {
  const request = req as TenantAwareRequest;
  if (!request.authContext || !request.prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const parsed = MarketplaceSubscribeSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: { code: "INVALID_PAYLOAD" } });
  }

  const item = await request.prisma.marketplaceItem.findUnique({
    where: { id: req.params.id },
    include: { publisher: { select: { name: true } } },
  });

  if (!item) {
    return res.status(404).json({ ok: false, error: { code: "MARKETPLACE_NOT_FOUND" } });
  }

  if (!item.isPublic && item.publisherId !== request.authContext.tenantId) {
    return res.status(403).json({ ok: false, error: { code: "MARKETPLACE_FORBIDDEN" } });
  }

  const scope = parsed.data.scope ?? "execute";
  const trustMin = parsed.data.trustMin ?? item.trustScore ?? 0;
  const validUntil = parsed.data.validUntil
    ? new Date(parsed.data.validUntil)
    : new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

  const policyPayload = {
    delegatorId: item.publisherId,
    delegateeId: request.authContext.tenantId,
    marketplaceId: item.id,
    scope,
    trustMin,
    validUntil: validUntil.toISOString(),
  };
  const policyHash =
    parsed.data.policyHash ??
    crypto.createHash("sha256").update(JSON.stringify(policyPayload)).digest("hex");
  const signatureHash =
    parsed.data.signatureHash ??
    crypto.createHash("sha256").update(`${policyHash}:${item.publisherId}`).digest("hex");

  const delegation = await request.prisma.delegationPolicy.create({
    data: {
      delegatorId: item.publisherId,
      delegateeId: request.authContext.tenantId,
      marketplaceId: item.id,
      scope,
      trustMin,
      validUntil,
      policyHash,
      signatureHash,
    },
  });

  return res.json({
    ok: true,
    delegationId: delegation.id,
    publisherName: item.publisher?.name ?? null,
  });
});
