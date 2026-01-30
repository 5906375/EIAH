import { Router } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { enforceTenant, type TenantAwareRequest } from "../middlewares/enforceTenant";

export const delegationsRouter = Router();
delegationsRouter.use(enforceTenant);

const DelegationCreateSchema = z.object({
  delegateeId: z.string().min(1),
  marketplaceId: z.string().min(1).optional(),
  scope: z.enum(["read", "execute", "admin"]),
  trustMin: z.number().min(0).max(100),
  validUntil: z.string().datetime(),
  policyHash: z.string().optional(),
  signatureHash: z.string().optional(),
});

const DelegationUpdateSchema = z.object({
  marketplaceId: z.string().min(1).optional(),
  scope: z.enum(["read", "execute", "admin"]).optional(),
  trustMin: z.number().min(0).max(100).optional(),
  validUntil: z.string().datetime().optional(),
  policyHash: z.string().optional(),
  signatureHash: z.string().optional(),
});

delegationsRouter.get("/delegations", async (req, res) => {
  const request = req as TenantAwareRequest;
  if (!request.authContext || !request.prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const role = typeof req.query.role === "string" ? req.query.role : "all";
  const where =
    role === "delegator"
      ? { delegatorId: request.authContext.tenantId }
      : role === "delegatee"
      ? { delegateeId: request.authContext.tenantId }
      : {
          OR: [
            { delegatorId: request.authContext.tenantId },
            { delegateeId: request.authContext.tenantId },
          ],
        };

  const items = await request.prisma.delegationPolicy.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  return res.json({ items });
});

delegationsRouter.get("/delegations/:id", async (req, res) => {
  const request = req as TenantAwareRequest;
  if (!request.authContext || !request.prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const item = await request.prisma.delegationPolicy.findUnique({
    where: { id: req.params.id },
  });

  if (!item) {
    return res.status(404).json({ ok: false, error: { code: "DELEGATION_NOT_FOUND" } });
  }

  const tenantId = request.authContext.tenantId;
  if (item.delegatorId !== tenantId && item.delegateeId !== tenantId) {
    return res.status(403).json({ ok: false, error: { code: "DELEGATION_FORBIDDEN" } });
  }

  return res.json({ item });
});

delegationsRouter.post("/delegations", async (req, res) => {
  const request = req as TenantAwareRequest;
  if (!request.authContext || !request.prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const parsed = DelegationCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: { code: "INVALID_PAYLOAD" } });
  }

  const validUntil = new Date(parsed.data.validUntil);
  const policyPayload = {
    delegatorId: request.authContext.tenantId,
    delegateeId: parsed.data.delegateeId,
    marketplaceId: parsed.data.marketplaceId ?? null,
    scope: parsed.data.scope,
    trustMin: parsed.data.trustMin,
    validUntil: validUntil.toISOString(),
  };

  const policyHash =
    parsed.data.policyHash ??
    crypto.createHash("sha256").update(JSON.stringify(policyPayload)).digest("hex");
  const signatureHash =
    parsed.data.signatureHash ??
    crypto.createHash("sha256").update(`${policyHash}:${request.authContext.tenantId}`).digest("hex");

  const item = await request.prisma.delegationPolicy.create({
    data: {
      delegatorId: request.authContext.tenantId,
      delegateeId: parsed.data.delegateeId,
      marketplaceId: parsed.data.marketplaceId ?? null,
      scope: parsed.data.scope,
      trustMin: parsed.data.trustMin,
      validUntil,
      policyHash,
      signatureHash,
    },
  });

  return res.json({ ok: true, item });
});

delegationsRouter.patch("/delegations/:id", async (req, res) => {
  const request = req as TenantAwareRequest;
  if (!request.authContext || !request.prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const parsed = DelegationUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: { code: "INVALID_PAYLOAD" } });
  }

  const existing = await request.prisma.delegationPolicy.findUnique({
    where: { id: req.params.id },
  });

  if (!existing || existing.delegatorId !== request.authContext.tenantId) {
    return res.status(404).json({ ok: false, error: { code: "DELEGATION_NOT_FOUND" } });
  }

  const validUntil = parsed.data.validUntil ? new Date(parsed.data.validUntil) : existing.validUntil;
  const policyPayload = {
    delegatorId: existing.delegatorId,
    delegateeId: existing.delegateeId,
    marketplaceId: parsed.data.marketplaceId ?? existing.marketplaceId ?? null,
    scope: parsed.data.scope ?? existing.scope,
    trustMin: parsed.data.trustMin ?? existing.trustMin,
    validUntil: validUntil.toISOString(),
  };

  const policyHash =
    parsed.data.policyHash ??
    crypto.createHash("sha256").update(JSON.stringify(policyPayload)).digest("hex");
  const signatureHash =
    parsed.data.signatureHash ??
    crypto.createHash("sha256").update(`${policyHash}:${existing.delegatorId}`).digest("hex");

  const item = await request.prisma.delegationPolicy.update({
    where: { id: existing.id },
    data: {
      marketplaceId: parsed.data.marketplaceId ?? existing.marketplaceId,
      scope: parsed.data.scope ?? existing.scope,
      trustMin: parsed.data.trustMin ?? existing.trustMin,
      validUntil,
      policyHash,
      signatureHash,
    },
  });

  return res.json({ ok: true, item });
});

delegationsRouter.delete("/delegations/:id", async (req, res) => {
  const request = req as TenantAwareRequest;
  if (!request.authContext || !request.prisma) {
    return res.status(500).json({
      ok: false,
      error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
    });
  }

  const item = await request.prisma.delegationPolicy.findUnique({
    where: { id: req.params.id },
  });

  if (!item || item.delegatorId !== request.authContext.tenantId) {
    return res.status(404).json({ ok: false, error: { code: "DELEGATION_NOT_FOUND" } });
  }

  await request.prisma.delegationPolicy.delete({ where: { id: item.id } });
  return res.json({ ok: true });
});
