import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { Prisma, prismaGlobal } from "@repo/db";
import { normalizeReason, type ReasonCode } from "@eiah/core";
import { enforceTenant, type TenantAwareRequest } from "../middlewares/enforceTenant";
import { requireTenantRole } from "../middlewares/requireTenantRole";
import { enforceNotLastAdmin } from "../services/tenantGovernance";
import { canSetMembershipStatus, canTransitionMembership } from "../services/membershipTransitions";
import { recordAuditEvent } from "../audit/auditLogger";

export const tenantsRouter = Router();
tenantsRouter.use(enforceTenant);

const createTenantSchema = z.object({
  id: z.string().min(3).max(64).optional(),
  name: z.string().min(2).max(80),
});

const addMemberSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["TENANT_ADMIN", "TENANT_OPERATOR", "TENANT_VIEWER"]),
  customRoleId: z.string().min(1).optional().nullable(),
  status: z
    .enum(["INVITED", "PENDING", "ACTIVE", "SUSPENDED", "REJECTED", "DISABLED"])
    .optional(),
});

const updateMemberSchema = z.object({
  role: z.enum(["TENANT_ADMIN", "TENANT_OPERATOR", "TENANT_VIEWER"]).optional(),
  customRoleId: z.string().min(1).optional().nullable(),
  status: z
    .enum(["INVITED", "PENDING", "ACTIVE", "SUSPENDED", "REJECTED", "DISABLED"])
    .optional(),
});

const inviteMemberSchema = z.object({
  email: z.string().email().min(3).max(200),
  role: z.enum(["TENANT_ADMIN", "TENANT_OPERATOR", "TENANT_VIEWER"]),
});

function resolveRequestId(req: { header(_name: string): string | undefined }) {
  return (
    req.header("x-trace-id") ??
    req.header("x-request-id") ??
    req.header("x-correlation-id") ??
    undefined
  );
}

function respondTenantError(
  res: any,
  params: { status: number; code: string; message: string; reason?: ReasonCode | null }
) {
  const reason = params.reason ? normalizeReason(params.reason) : undefined;
  return res.status(params.status).json({
    ok: false,
    error: {
      code: params.code,
      reason,
      message: params.message,
    },
  });
}

async function recordMembershipAudit(params: {
  tenantId: string;
  actorUserId?: string | null;
  targetUserId?: string | null;
  membershipId?: string | null;
  fromStatus?: string | null;
  toStatus?: string | null;
  action: string;
  result: "ok" | "deny" | "error";
  reason?: string | null;
  requestId?: string;
}) {
  await recordAuditEvent({
    prisma: prismaGlobal,
    tenantId: params.tenantId,
    workspaceId: null,
    runId: null,
    eventType: `membership.${params.action}`,
    severity: params.result === "ok" ? "info" : params.result === "deny" ? "warn" : "error",
    message: `membership.${params.action}.${params.result}`,
    metadata: {
      actorUserId: params.actorUserId ?? null,
      targetUserId: params.targetUserId ?? null,
      membershipId: params.membershipId ?? null,
      fromStatus: params.fromStatus ?? null,
      toStatus: params.toStatus ?? null,
      reason: params.reason ?? null,
      requestId: params.requestId ?? null,
    },
  });
}

async function resolveCustomRoleId(params: {
  prisma: any;
  tenantId: string;
  customRoleId?: string | null;
}) {
  const raw = params.customRoleId ?? null;
  if (!raw) return null;
  const role = await params.prisma.tenantRoleCustom.findFirst({
    where: { id: raw, tenantId: params.tenantId },
    select: { id: true },
  });
  return role?.id ?? null;
}

async function generateTenantId() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = `tenant_${crypto.randomBytes(6).toString("hex")}`;
    const exists = await prismaGlobal.tenant.findUnique({
      where: { id: candidate },
      select: { id: true },
    });
    if (!exists) return candidate;
  }
  return null;
}

async function findOrCreateInviteUser(params: { email: string; tenantId: string }) {
  const existing = await prismaGlobal.user.findUnique({
    where: { email: params.email },
  });
  if (existing) return existing;

  const displayName = params.email.split("@")[0] ?? params.email;
  try {
    return await prismaGlobal.user.create({
      data: {
        tenantId: params.tenantId,
        email: params.email,
        displayName,
      },
    });
  } catch (error) {
    const typed = error as Prisma.PrismaClientKnownRequestError | null;
    if (typed?.code !== "P2002") throw error;
    const winner = await prismaGlobal.user.findUnique({
      where: { email: params.email },
    });
    if (!winner) throw error;
    return winner;
  }
}

tenantsRouter.post("/tenants", async (req, res) => {
  const { authContext } = req as TenantAwareRequest;
  if (!authContext) {
    return respondTenantError(res, {
      status: 500,
      code: "AUTH_CONTEXT_MISSING",
      message: "Authentication context missing",
      reason: "auth_context_missing",
    });
  }

  if (!authContext.userId) {
    return res.status(403).json({
      ok: false,
      error: { code: "USER_REQUIRED", message: "User context required to create tenant" },
    });
  }
  const creatorUserId = authContext.userId;

  const parsed = createTenantSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: { code: "INVALID_PAYLOAD", details: parsed.error.flatten() },
    });
  }

  const tenantId = parsed.data.id?.trim() || (await generateTenantId());
  if (!tenantId) {
    return res.status(500).json({
      ok: false,
      error: { code: "TENANT_ID_UNAVAILABLE", message: "Failed to generate tenant id" },
    });
  }

  try {
    const created = await prismaGlobal.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { id: tenantId, name: parsed.data.name.trim() },
      });
      const membership = await tx.tenantMembership.create({
        data: {
          tenantId: tenant.id,
          userId: creatorUserId,
          role: "TENANT_ADMIN",
          status: "ACTIVE",
        },
      });
      return { tenant, membership };
    });

    return res.status(201).json({
      ok: true,
      data: {
        tenantId: created.tenant.id,
        name: created.tenant.name,
        membershipId: created.membership.id,
        role: created.membership.role,
        status: created.membership.status,
      },
    });
  } catch (error) {
    req.logger?.error({ error }, "tenant.create_failed");
    return res.status(409).json({
      ok: false,
      error: { code: "TENANT_CREATE_FAILED", message: "Failed to create tenant" },
    });
  }
});

tenantsRouter.post(
  "/tenants/:tenantId/members",
  requireTenantRole("TENANT_ADMIN"),
  async (req, res) => {
    const { authContext, prisma } = req as TenantAwareRequest;
    if (!authContext || !prisma) {
      return respondTenantError(res, {
        status: 500,
        code: "AUTH_CONTEXT_MISSING",
        message: "Authentication context missing",
        reason: "auth_context_missing",
      });
    }

    const tenantId = req.params.tenantId;
    if (tenantId !== authContext.tenantId) {
      return respondTenantError(res, {
        status: 403,
        code: "TENANT_FORBIDDEN",
        message: "Tenant mismatch",
        reason: "not_owner",
      });
    }

    const parsed = addMemberSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return respondTenantError(res, {
        status: 400,
        code: "INVALID_PAYLOAD",
        message: "Invalid payload",
        reason: "invalid_payload",
      });
    }

    try {
      const customRoleId = await resolveCustomRoleId({
        prisma,
        tenantId,
        customRoleId: parsed.data.customRoleId ?? null,
      });
      if (parsed.data.customRoleId && !customRoleId) {
        return respondTenantError(res, {
          status: 404,
          code: "ROLE_NOT_FOUND",
          message: "Custom role not found",
          reason: "role_not_found",
        });
      }
      const membership = await prisma.tenantMembership.create({
        data: {
          tenantId,
          userId: parsed.data.userId,
          role: parsed.data.role,
          status: parsed.data.status ?? "ACTIVE",
          customRoleId,
        },
      });

      void recordMembershipAudit({
        tenantId,
        actorUserId: authContext.userId ?? null,
        targetUserId: membership.userId,
        membershipId: membership.id,
        fromStatus: null,
        toStatus: membership.status,
        action: "create",
        result: "ok",
        requestId: resolveRequestId(req),
      });
      return res.status(201).json({
        ok: true,
        data: {
          id: membership.id,
          tenantId: membership.tenantId,
          userId: membership.userId,
          role: membership.role,
          status: membership.status,
          customRoleId: membership.customRoleId ?? null,
        },
      });
    } catch (error) {
      req.logger?.error({ error }, "tenant.membership.create_failed");
      return respondTenantError(res, {
        status: 409,
        code: "MEMBERSHIP_CREATE_FAILED",
        message: "Failed to add tenant member",
        reason: "unknown",
      });
    }
  }
);

tenantsRouter.get(
  "/tenants/:tenantId/members",
  requireTenantRole("TENANT_ADMIN"),
  async (req, res) => {
    const { authContext, prisma } = req as TenantAwareRequest;
    if (!authContext || !prisma) {
      return respondTenantError(res, {
        status: 500,
        code: "AUTH_CONTEXT_MISSING",
        message: "Authentication context missing",
        reason: "auth_context_missing",
      });
    }

    const tenantId = req.params.tenantId;
    if (tenantId !== authContext.tenantId) {
      return respondTenantError(res, {
        status: 403,
        code: "TENANT_FORBIDDEN",
        message: "Tenant mismatch",
        reason: "not_owner",
      });
    }

    const members = await prisma.tenantMembership.findMany({
      where: { tenantId },
      orderBy: { createdAt: "asc" },
      include: {
        user: { select: { email: true, displayName: true } },
        customRole: { select: { id: true, name: true } },
      },
    });

    return res.json({
      ok: true,
      items: members.map((member) => ({
        id: member.id,
        tenantId: member.tenantId,
        userId: member.userId,
        email: member.user?.email ?? null,
        displayName: member.user?.displayName ?? null,
        role: member.role,
        status: member.status,
        customRoleId: member.customRoleId ?? null,
        customRoleName: member.customRole?.name ?? null,
        createdAt: member.createdAt,
      })),
    });
  }
);

tenantsRouter.patch(
  "/tenants/:tenantId/members/:id",
  requireTenantRole("TENANT_ADMIN"),
  async (req, res) => {
    const { authContext, prisma } = req as TenantAwareRequest;
    if (!authContext || !prisma) {
      return respondTenantError(res, {
        status: 500,
        code: "AUTH_CONTEXT_MISSING",
        message: "Authentication context missing",
        reason: "auth_context_missing",
      });
    }

    const tenantId = req.params.tenantId;
    if (tenantId !== authContext.tenantId) {
      return respondTenantError(res, {
        status: 403,
        code: "TENANT_FORBIDDEN",
        message: "Tenant mismatch",
        reason: "not_owner",
      });
    }

    const parsed = updateMemberSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return respondTenantError(res, {
        status: 400,
        code: "INVALID_PAYLOAD",
        message: "Invalid payload",
        reason: "invalid_payload",
      });
    }

    const existing = await prisma.tenantMembership.findUnique({
      where: { id: req.params.id },
    });

    if (!existing) {
      return respondTenantError(res, {
        status: 404,
        code: "MEMBERSHIP_NOT_FOUND",
        message: "Membership not found",
        reason: "not_found",
      });
    }

    const nextRole = parsed.data.role ?? existing.role;
    const nextStatus = parsed.data.status ?? existing.status;
    const customRoleId = await resolveCustomRoleId({
      prisma,
      tenantId,
      customRoleId: parsed.data.customRoleId ?? null,
    });
    if (parsed.data.customRoleId && !customRoleId) {
      return respondTenantError(res, {
        status: 404,
        code: "ROLE_NOT_FOUND",
        message: "Custom role not found",
        reason: "role_not_found",
      });
    }
    const willDemoteAdmin =
      existing.role === "TENANT_ADMIN" &&
      (nextRole !== "TENANT_ADMIN" || nextStatus !== "ACTIVE");

    if (parsed.data.status && parsed.data.status !== existing.status) {
      const transition = canSetMembershipStatus(existing.status as any, nextStatus as any);
      if (!transition.ok) {
        return respondTenantError(res, {
          status: 409,
          code: "MEMBERSHIP_TRANSITION_INVALID",
          message: "Membership status transition not allowed",
          reason: transition.reason,
        });
      }
    }

    if (willDemoteAdmin) {
      const memberships = await prisma.tenantMembership.findMany({
        where: { tenantId },
        select: { userId: true, role: true, status: true },
      });
      const guard = enforceNotLastAdmin({
        memberships: memberships.map((m) => ({
          userId: m.userId,
          role: m.role as any,
          status: m.status as any,
        })),
        targetUserId: existing.userId,
      });
      if (!guard.ok) {
        return respondTenantError(res, {
          status: 409,
          code: "LAST_ADMIN_PROTECTED",
          message: "Cannot disable last admin",
          reason: "membership_transition_invalid",
        });
      }
    }

    const updated = await prisma.tenantMembership.update({
      where: { id: existing.id, tenantId },
      data: {
        role: parsed.data.role ?? existing.role,
        status: parsed.data.status ?? existing.status,
        customRoleId: parsed.data.customRoleId === undefined ? existing.customRoleId : customRoleId,
      },
    });

    if (parsed.data.status && parsed.data.status !== existing.status) {
      void recordMembershipAudit({
        tenantId,
        actorUserId: authContext.userId ?? null,
        targetUserId: updated.userId,
        membershipId: updated.id,
        fromStatus: existing.status,
        toStatus: updated.status,
        action: "status_change",
        result: "ok",
        requestId: resolveRequestId(req),
      });
    }

    return res.json({
      ok: true,
      data: {
        id: updated.id,
        tenantId: updated.tenantId,
        userId: updated.userId,
        role: updated.role,
        status: updated.status,
        customRoleId: updated.customRoleId ?? null,
      },
    });
  }
);

tenantsRouter.post(
  "/tenants/:tenantId/members/invite",
  requireTenantRole("TENANT_ADMIN"),
  async (req, res) => {
    const { authContext, prisma } = req as TenantAwareRequest;
    if (!authContext || !prisma) {
      return respondTenantError(res, {
        status: 500,
        code: "AUTH_CONTEXT_MISSING",
        message: "Authentication context missing",
        reason: "auth_context_missing",
      });
    }

    const tenantId = req.params.tenantId;
    if (tenantId !== authContext.tenantId) {
      return respondTenantError(res, {
        status: 403,
        code: "TENANT_FORBIDDEN",
        message: "Tenant mismatch",
        reason: "not_owner",
      });
    }

    const parsed = inviteMemberSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return respondTenantError(res, {
        status: 400,
        code: "INVALID_PAYLOAD",
        message: "Invalid payload",
        reason: "invalid_payload",
      });
    }

    const email = parsed.data.email.trim().toLowerCase();
    const user = await findOrCreateInviteUser({ email, tenantId });

    const existing = await prisma.tenantMembership.findUnique({
      where: { tenantId_userId: { tenantId, userId: user.id } },
    });
    if (existing) {
      return respondTenantError(res, {
        status: 409,
        code: "MEMBERSHIP_EXISTS",
        message: "Membership already exists",
        reason: "membership_exists",
      });
    }

    const membership = await prisma.tenantMembership.create({
      data: {
        tenantId,
        userId: user.id,
        role: parsed.data.role,
        status: "INVITED",
      },
    });

    void recordMembershipAudit({
      tenantId,
      actorUserId: authContext.userId ?? null,
      targetUserId: user.id,
      membershipId: membership.id,
      fromStatus: null,
      toStatus: membership.status,
      action: "invite",
      result: "ok",
      requestId: resolveRequestId(req),
    });

    return res.status(201).json({
      ok: true,
      data: {
        id: membership.id,
        tenantId: membership.tenantId,
        userId: membership.userId,
        role: membership.role,
        status: membership.status,
      },
    });
  }
);

async function loadMembershipOrError(req: any, res: any, tenantId: string) {
  const { prisma, authContext } = req as TenantAwareRequest;
  if (!prisma || !authContext) {
    respondTenantError(res, {
      status: 500,
      code: "AUTH_CONTEXT_MISSING",
      message: "Authentication context missing",
      reason: "auth_context_missing",
    });
    return null;
  }

  const membership = await prisma.tenantMembership.findUnique({
    where: { id: req.params.id },
  });

  if (!membership || membership.tenantId !== tenantId) {
    respondTenantError(res, {
      status: 404,
      code: "MEMBERSHIP_NOT_FOUND",
      message: "Membership not found",
      reason: "not_found",
    });
    return null;
  }

  return membership;
}

tenantsRouter.post(
  "/tenants/:tenantId/members/:id/approve",
  requireTenantRole("TENANT_ADMIN"),
  async (req, res) => {
    const { authContext, prisma } = req as TenantAwareRequest;
    const tenantId = req.params.tenantId;
    if (!authContext || !prisma) {
      return respondTenantError(res, {
        status: 500,
        code: "AUTH_CONTEXT_MISSING",
        message: "Authentication context missing",
        reason: "auth_context_missing",
      });
    }
    if (tenantId !== authContext.tenantId) {
      return respondTenantError(res, {
        status: 403,
        code: "TENANT_FORBIDDEN",
        message: "Tenant mismatch",
        reason: "not_owner",
      });
    }

    const membership = await loadMembershipOrError(req, res, tenantId);
    if (!membership) return;

    const transition = canTransitionMembership(membership.status as any, "approve");
    if (!transition.ok) {
      return respondTenantError(res, {
        status: 409,
        code: "MEMBERSHIP_TRANSITION_INVALID",
        message: "Membership status transition not allowed",
        reason: transition.reason,
      });
    }

    const updated = await prisma.tenantMembership.update({
      where: { id: membership.id, tenantId },
      data: { status: transition.next },
    });

    void recordMembershipAudit({
      tenantId,
      actorUserId: authContext.userId ?? null,
      targetUserId: updated.userId,
      membershipId: updated.id,
      fromStatus: membership.status,
      toStatus: updated.status,
      action: "approve",
      result: "ok",
      requestId: resolveRequestId(req),
    });

    return res.json({
      ok: true,
      data: {
        id: updated.id,
        tenantId: updated.tenantId,
        userId: updated.userId,
        role: updated.role,
        status: updated.status,
      },
    });
  }
);

tenantsRouter.post(
  "/tenants/:tenantId/members/:id/reject",
  requireTenantRole("TENANT_ADMIN"),
  async (req, res) => {
    const { authContext, prisma } = req as TenantAwareRequest;
    const tenantId = req.params.tenantId;
    if (!authContext || !prisma) {
      return respondTenantError(res, {
        status: 500,
        code: "AUTH_CONTEXT_MISSING",
        message: "Authentication context missing",
        reason: "auth_context_missing",
      });
    }
    if (tenantId !== authContext.tenantId) {
      return respondTenantError(res, {
        status: 403,
        code: "TENANT_FORBIDDEN",
        message: "Tenant mismatch",
        reason: "not_owner",
      });
    }

    const membership = await loadMembershipOrError(req, res, tenantId);
    if (!membership) return;

    const transition = canTransitionMembership(membership.status as any, "reject");
    if (!transition.ok) {
      return respondTenantError(res, {
        status: 409,
        code: "MEMBERSHIP_TRANSITION_INVALID",
        message: "Membership status transition not allowed",
        reason: transition.reason,
      });
    }

    if (membership.role === "TENANT_ADMIN") {
      const memberships = await prisma.tenantMembership.findMany({
        where: { tenantId },
        select: { userId: true, role: true, status: true },
      });
      const guard = enforceNotLastAdmin({
        memberships: memberships.map((m) => ({
          userId: m.userId,
          role: m.role as any,
          status: m.status as any,
        })),
        targetUserId: membership.userId,
      });
      if (!guard.ok) {
        return respondTenantError(res, {
          status: 409,
          code: "LAST_ADMIN_PROTECTED",
          message: "Cannot reject last admin",
          reason: "membership_transition_invalid",
        });
      }
    }

    const updated = await prisma.tenantMembership.update({
      where: { id: membership.id, tenantId },
      data: { status: transition.next },
    });

    void recordMembershipAudit({
      tenantId,
      actorUserId: authContext.userId ?? null,
      targetUserId: updated.userId,
      membershipId: updated.id,
      fromStatus: membership.status,
      toStatus: updated.status,
      action: "reject",
      result: "ok",
      requestId: resolveRequestId(req),
    });

    return res.json({
      ok: true,
      data: {
        id: updated.id,
        tenantId: updated.tenantId,
        userId: updated.userId,
        role: updated.role,
        status: updated.status,
      },
    });
  }
);

tenantsRouter.post(
  "/tenants/:tenantId/members/:id/suspend",
  requireTenantRole("TENANT_ADMIN"),
  async (req, res) => {
    const { authContext, prisma } = req as TenantAwareRequest;
    const tenantId = req.params.tenantId;
    if (!authContext || !prisma) {
      return respondTenantError(res, {
        status: 500,
        code: "AUTH_CONTEXT_MISSING",
        message: "Authentication context missing",
        reason: "auth_context_missing",
      });
    }
    if (tenantId !== authContext.tenantId) {
      return respondTenantError(res, {
        status: 403,
        code: "TENANT_FORBIDDEN",
        message: "Tenant mismatch",
        reason: "not_owner",
      });
    }

    const membership = await loadMembershipOrError(req, res, tenantId);
    if (!membership) return;

    const transition = canTransitionMembership(membership.status as any, "suspend");
    if (!transition.ok) {
      return respondTenantError(res, {
        status: 409,
        code: "MEMBERSHIP_TRANSITION_INVALID",
        message: "Membership status transition not allowed",
        reason: transition.reason,
      });
    }

    if (membership.role === "TENANT_ADMIN") {
      const memberships = await prisma.tenantMembership.findMany({
        where: { tenantId },
        select: { userId: true, role: true, status: true },
      });
      const guard = enforceNotLastAdmin({
        memberships: memberships.map((m) => ({
          userId: m.userId,
          role: m.role as any,
          status: m.status as any,
        })),
        targetUserId: membership.userId,
      });
      if (!guard.ok) {
        return respondTenantError(res, {
          status: 409,
          code: "LAST_ADMIN_PROTECTED",
          message: "Cannot suspend last admin",
          reason: "membership_transition_invalid",
        });
      }
    }

    const updated = await prisma.tenantMembership.update({
      where: { id: membership.id, tenantId },
      data: { status: transition.next },
    });

    void recordMembershipAudit({
      tenantId,
      actorUserId: authContext.userId ?? null,
      targetUserId: updated.userId,
      membershipId: updated.id,
      fromStatus: membership.status,
      toStatus: updated.status,
      action: "suspend",
      result: "ok",
      requestId: resolveRequestId(req),
    });

    return res.json({
      ok: true,
      data: {
        id: updated.id,
        tenantId: updated.tenantId,
        userId: updated.userId,
        role: updated.role,
        status: updated.status,
      },
    });
  }
);

tenantsRouter.post(
  "/tenants/:tenantId/members/:id/activate",
  requireTenantRole("TENANT_ADMIN"),
  async (req, res) => {
    const { authContext, prisma } = req as TenantAwareRequest;
    const tenantId = req.params.tenantId;
    if (!authContext || !prisma) {
      return respondTenantError(res, {
        status: 500,
        code: "AUTH_CONTEXT_MISSING",
        message: "Authentication context missing",
        reason: "auth_context_missing",
      });
    }
    if (tenantId !== authContext.tenantId) {
      return respondTenantError(res, {
        status: 403,
        code: "TENANT_FORBIDDEN",
        message: "Tenant mismatch",
        reason: "not_owner",
      });
    }

    const membership = await loadMembershipOrError(req, res, tenantId);
    if (!membership) return;

    const transition = canTransitionMembership(membership.status as any, "activate");
    if (!transition.ok) {
      return respondTenantError(res, {
        status: 409,
        code: "MEMBERSHIP_TRANSITION_INVALID",
        message: "Membership status transition not allowed",
        reason: transition.reason,
      });
    }

    const updated = await prisma.tenantMembership.update({
      where: { id: membership.id, tenantId },
      data: { status: transition.next },
    });

    void recordMembershipAudit({
      tenantId,
      actorUserId: authContext.userId ?? null,
      targetUserId: updated.userId,
      membershipId: updated.id,
      fromStatus: membership.status,
      toStatus: updated.status,
      action: "activate",
      result: "ok",
      requestId: resolveRequestId(req),
    });

    return res.json({
      ok: true,
      data: {
        id: updated.id,
        tenantId: updated.tenantId,
        userId: updated.userId,
        role: updated.role,
        status: updated.status,
      },
    });
  }
);
