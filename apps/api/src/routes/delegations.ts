import { Router } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { normalizeReason, type ReasonCode } from "@eiah/core";
import { enforceTenant, type TenantAwareRequest } from "../middlewares/enforceTenant";
import { requireScope } from "../middlewares/requireScope";
import { requirePermission } from "../middlewares/requirePermission";

export const delegationsRouter = Router();
delegationsRouter.use(enforceTenant);

function respondDelegationError(
  res: any,
  params: { status: number; code: string; message: string; reason?: ReasonCode | null }
) {
  const normalizedReason = params.reason ? normalizeReason(params.reason) : undefined;
  return res.status(params.status).json({
    ok: false,
    error: {
      code: params.code,
      reason: normalizedReason,
      message: params.message,
    },
  });
}

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

const DelegationDecisionSchema = z.object({
  providerSignatureHash: z.string().optional(),
  reason: z.string().max(500).optional(),
});

delegationsRouter.get("/delegations", requirePermission("delegation.view"), async (req, res) => {
  const request = req as TenantAwareRequest;
  if (!request.authContext || !request.prisma) {
    return respondDelegationError(res, {
      status: 500,
      code: "AUTH_CONTEXT_MISSING",
      message: "Authentication context missing",
      reason: "auth_context_missing",
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

delegationsRouter.get("/delegations/:id", requirePermission("delegation.view"), async (req, res) => {
  const request = req as TenantAwareRequest;
  if (!request.authContext || !request.prisma) {
    return respondDelegationError(res, {
      status: 500,
      code: "AUTH_CONTEXT_MISSING",
      message: "Authentication context missing",
      reason: "auth_context_missing",
    });
  }

  const item = await request.prisma.delegationPolicy.findUnique({
    where: { id: req.params.id },
  });

  if (!item) {
    return respondDelegationError(res, {
      status: 404,
      code: "DELEGATION_NOT_FOUND",
      message: "Delegation not found",
      reason: "delegation_not_found",
    });
  }

  const tenantId = request.authContext.tenantId;
  if (item.delegatorId !== tenantId && item.delegateeId !== tenantId) {
    return respondDelegationError(res, {
      status: 403,
      code: "DELEGATION_FORBIDDEN",
      message: "Delegation access forbidden",
      reason: "delegation_forbidden",
    });
  }

  return res.json({ item });
});

delegationsRouter.post("/delegations", requirePermission("delegation.manage"), async (req, res) => {
  const request = req as TenantAwareRequest;
  if (!request.authContext || !request.prisma) {
    return respondDelegationError(res, {
      status: 500,
      code: "AUTH_CONTEXT_MISSING",
      message: "Authentication context missing",
      reason: "auth_context_missing",
    });
  }

  const parsed = DelegationCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return respondDelegationError(res, {
      status: 400,
      code: "INVALID_PAYLOAD",
      message: "Invalid payload",
      reason: "invalid_payload",
    });
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

delegationsRouter.patch("/delegations/:id", requirePermission("delegation.manage"), async (req, res) => {
  const request = req as TenantAwareRequest;
  if (!request.authContext || !request.prisma) {
    return respondDelegationError(res, {
      status: 500,
      code: "AUTH_CONTEXT_MISSING",
      message: "Authentication context missing",
      reason: "auth_context_missing",
    });
  }

  const parsed = DelegationUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return respondDelegationError(res, {
      status: 400,
      code: "INVALID_PAYLOAD",
      message: "Invalid payload",
      reason: "invalid_payload",
    });
  }

  const existing = await request.prisma.delegationPolicy.findUnique({
    where: { id: req.params.id },
  });

  if (!existing || existing.delegatorId !== request.authContext.tenantId) {
    return respondDelegationError(res, {
      status: 404,
      code: "DELEGATION_NOT_FOUND",
      message: "Delegation not found",
      reason: "delegation_not_found",
    });
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

delegationsRouter.delete("/delegations/:id", requirePermission("delegation.manage"), async (req, res) => {
  const request = req as TenantAwareRequest;
  if (!request.authContext || !request.prisma) {
    return respondDelegationError(res, {
      status: 500,
      code: "AUTH_CONTEXT_MISSING",
      message: "Authentication context missing",
      reason: "auth_context_missing",
    });
  }

  const item = await request.prisma.delegationPolicy.findUnique({
    where: { id: req.params.id },
  });

  if (!item || item.delegatorId !== request.authContext.tenantId) {
    return respondDelegationError(res, {
      status: 404,
      code: "DELEGATION_NOT_FOUND",
      message: "Delegation not found",
      reason: "delegation_not_found",
    });
  }

  await request.prisma.delegationPolicy.delete({ where: { id: item.id } });
  return res.json({ ok: true });
});

delegationsRouter.post(
  "/delegations/:id/approve",
  requirePermission("approvals.approve"),
  requireScope("admin"),
  async (req, res) => {
    const request = req as TenantAwareRequest;
    if (!request.authContext || !request.prisma) {
      return respondDelegationError(res, {
        status: 500,
        code: "AUTH_CONTEXT_MISSING",
        message: "Authentication context missing",
        reason: "auth_context_missing",
      });
    }

    const parsed = DelegationDecisionSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return respondDelegationError(res, {
        status: 400,
        code: "INVALID_PAYLOAD",
        message: "Invalid payload",
        reason: "invalid_payload",
      });
    }

    const item = await request.prisma.delegationPolicy.findUnique({
      where: { id: req.params.id },
    });

    if (!item) {
      return respondDelegationError(res, {
        status: 404,
        code: "DELEGATION_NOT_FOUND",
        message: "Delegation not found",
        reason: "delegation_not_found",
      });
    }

    if (item.delegatorId !== request.authContext.tenantId) {
      return respondDelegationError(res, {
        status: 403,
        code: "DELEGATION_FORBIDDEN",
        message: "Delegation access forbidden",
        reason: "delegation_forbidden",
      });
    }

    if (item.status === "active") {
      return res.json({ ok: true, item });
    }

    if (item.status !== "pending_approval") {
      return respondDelegationError(res, {
        status: 409,
        code: "DELEGATION_INVALID_STATUS",
        message: "Delegation status invalid",
        reason: "delegation_invalid_status",
      });
    }

    const updated = await request.prisma.delegationPolicy.update({
      where: { id: item.id },
      data: {
        status: "active",
        providerSignatureHash: parsed.data.providerSignatureHash ?? null,
        decidedAt: new Date(),
      },
    });

    return res.json({ ok: true, item: updated });
  }
);

delegationsRouter.post(
  "/delegations/:id/reject",
  requirePermission("approvals.approve"),
  requireScope("admin"),
  async (req, res) => {
    const request = req as TenantAwareRequest;
    if (!request.authContext || !request.prisma) {
      return respondDelegationError(res, {
        status: 500,
        code: "AUTH_CONTEXT_MISSING",
        message: "Authentication context missing",
        reason: "auth_context_missing",
      });
    }

    const parsed = DelegationDecisionSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return respondDelegationError(res, {
        status: 400,
        code: "INVALID_PAYLOAD",
        message: "Invalid payload",
        reason: "invalid_payload",
      });
    }

    const item = await request.prisma.delegationPolicy.findUnique({
      where: { id: req.params.id },
    });

    if (!item) {
      return respondDelegationError(res, {
        status: 404,
        code: "DELEGATION_NOT_FOUND",
        message: "Delegation not found",
        reason: "delegation_not_found",
      });
    }

    if (item.delegatorId !== request.authContext.tenantId) {
      return respondDelegationError(res, {
        status: 403,
        code: "DELEGATION_FORBIDDEN",
        message: "Delegation access forbidden",
        reason: "delegation_forbidden",
      });
    }

    if (item.status !== "pending_approval") {
      return respondDelegationError(res, {
        status: 409,
        code: "DELEGATION_INVALID_STATUS",
        message: "Delegation status invalid",
        reason: "delegation_invalid_status",
      });
    }

    const updated = await request.prisma.delegationPolicy.update({
      where: { id: item.id },
      data: {
        status: "rejected",
        providerSignatureHash: parsed.data.providerSignatureHash ?? null,
        decidedAt: new Date(),
      },
    });

    return res.json({ ok: true, item: updated });
  }
);
