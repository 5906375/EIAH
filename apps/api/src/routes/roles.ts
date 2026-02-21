import { Router } from "express";
import { z } from "zod";
import { prismaGlobal } from "@repo/db";
import { normalizeReason, type ReasonCode } from "@eiah/core";
import { enforceTenant, type TenantAwareRequest } from "../middlewares/enforceTenant";
import { requireTenantRole } from "../middlewares/requireTenantRole";
import { invalidateCustomRoleCache } from "../services/customRoles";
import { recordAuditEvent } from "../audit/auditLogger";

export const rolesRouter = Router();
rolesRouter.use(enforceTenant);

const RoleCreateSchema = z.object({
  name: z.string().min(2).max(80),
  description: z.string().max(200).optional().nullable(),
  permissions: z.array(z.string().min(1).max(120)).default([]),
});

const RoleUpdateSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  description: z.string().max(200).optional().nullable(),
  permissions: z.array(z.string().min(1).max(120)).optional(),
});

function resolveRequestId(req: { header(_name: string): string | undefined }) {
  return (
    req.header("x-trace-id") ??
    req.header("x-request-id") ??
    req.header("x-correlation-id") ??
    undefined
  );
}

function respondRoleError(
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

async function recordRoleAudit(params: {
  tenantId: string;
  actorUserId?: string | null;
  roleId?: string | null;
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
    eventType: `role.${params.action}`,
    severity: params.result === "ok" ? "info" : params.result === "deny" ? "warn" : "error",
    message: `role.${params.action}.${params.result}`,
    metadata: {
      actorUserId: params.actorUserId ?? null,
      roleId: params.roleId ?? null,
      reason: params.reason ?? null,
      requestId: params.requestId ?? null,
    },
  });
}

rolesRouter.get(
  "/tenants/:tenantId/roles",
  requireTenantRole("TENANT_ADMIN"),
  async (req, res) => {
    const { authContext, prisma } = req as TenantAwareRequest;
    if (!authContext || !prisma) {
      return respondRoleError(res, {
        status: 500,
        code: "AUTH_CONTEXT_MISSING",
        message: "Authentication context missing",
        reason: "auth_context_missing",
      });
    }

    const tenantId = req.params.tenantId;
    if (tenantId !== authContext.tenantId) {
      return respondRoleError(res, {
        status: 403,
        code: "TENANT_FORBIDDEN",
        message: "Tenant mismatch",
        reason: "not_owner",
      });
    }

    const items = await prisma.tenantRoleCustom.findMany({
      where: { tenantId },
      orderBy: { createdAt: "asc" },
      include: { permissions: true },
    });

    return res.json({
      ok: true,
      items: items.map((role) => ({
        id: role.id,
        tenantId: role.tenantId,
        name: role.name,
        description: role.description,
        createdAt: role.createdAt,
        permissions: role.permissions.map((entry) => entry.permissionKey),
      })),
    });
  }
);

rolesRouter.post(
  "/tenants/:tenantId/roles",
  requireTenantRole("TENANT_ADMIN"),
  async (req, res) => {
    const { authContext, prisma } = req as TenantAwareRequest;
    if (!authContext || !prisma) {
      return respondRoleError(res, {
        status: 500,
        code: "AUTH_CONTEXT_MISSING",
        message: "Authentication context missing",
        reason: "auth_context_missing",
      });
    }

    const tenantId = req.params.tenantId;
    if (tenantId !== authContext.tenantId) {
      return respondRoleError(res, {
        status: 403,
        code: "TENANT_FORBIDDEN",
        message: "Tenant mismatch",
        reason: "not_owner",
      });
    }

    const parsed = RoleCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return respondRoleError(res, {
        status: 400,
        code: "INVALID_PAYLOAD",
        message: "Invalid payload",
        reason: "invalid_payload",
      });
    }

    const name = parsed.data.name.trim();
    const existing = await prisma.tenantRoleCustom.findFirst({
      where: { tenantId, name },
      select: { id: true },
    });
    if (existing) {
      return respondRoleError(res, {
        status: 409,
        code: "ROLE_NAME_EXISTS",
        message: "Role name already exists",
        reason: "role_name_exists",
      });
    }

    const created = await prisma.$transaction(async (tx) => {
      const role = await tx.tenantRoleCustom.create({
        data: {
          tenantId,
          name,
          description: parsed.data.description ?? null,
        },
      });
      if (parsed.data.permissions.length > 0) {
        await tx.rolePermission.createMany({
          data: parsed.data.permissions.map((permissionKey) => ({
            roleId: role.id,
            permissionKey,
          })),
          skipDuplicates: true,
        });
      }
      return role;
    });

    invalidateCustomRoleCache(tenantId, created.id);
    void recordRoleAudit({
      tenantId,
      actorUserId: authContext.userId ?? null,
      roleId: created.id,
      action: "create",
      result: "ok",
      requestId: resolveRequestId(req),
    });

    return res.status(201).json({
      ok: true,
      data: {
        id: created.id,
        tenantId: created.tenantId,
        name: created.name,
        description: created.description,
      },
    });
  }
);

rolesRouter.patch(
  "/tenants/:tenantId/roles/:id",
  requireTenantRole("TENANT_ADMIN"),
  async (req, res) => {
    const { authContext, prisma } = req as TenantAwareRequest;
    if (!authContext || !prisma) {
      return respondRoleError(res, {
        status: 500,
        code: "AUTH_CONTEXT_MISSING",
        message: "Authentication context missing",
        reason: "auth_context_missing",
      });
    }

    const tenantId = req.params.tenantId;
    if (tenantId !== authContext.tenantId) {
      return respondRoleError(res, {
        status: 403,
        code: "TENANT_FORBIDDEN",
        message: "Tenant mismatch",
        reason: "not_owner",
      });
    }

    const parsed = RoleUpdateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return respondRoleError(res, {
        status: 400,
        code: "INVALID_PAYLOAD",
        message: "Invalid payload",
        reason: "invalid_payload",
      });
    }

    const role = await prisma.tenantRoleCustom.findFirst({
      where: { id: req.params.id, tenantId },
      include: { permissions: true },
    });
    if (!role) {
      return respondRoleError(res, {
        status: 404,
        code: "ROLE_NOT_FOUND",
        message: "Role not found",
        reason: "role_not_found",
      });
    }

    if (parsed.data.name && parsed.data.name.trim() !== role.name) {
      const conflict = await prisma.tenantRoleCustom.findFirst({
        where: { tenantId, name: parsed.data.name.trim() },
        select: { id: true },
      });
      if (conflict) {
        return respondRoleError(res, {
          status: 409,
          code: "ROLE_NAME_EXISTS",
          message: "Role name already exists",
          reason: "role_name_exists",
        });
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.tenantRoleCustom.update({
        where: { id: role.id, tenantId },
        data: {
          name: parsed.data.name?.trim() ?? role.name,
          description:
            parsed.data.description === undefined ? role.description : parsed.data.description,
        },
      });

      if (parsed.data.permissions) {
        await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
        if (parsed.data.permissions.length > 0) {
          await tx.rolePermission.createMany({
            data: parsed.data.permissions.map((permissionKey) => ({
              roleId: role.id,
              permissionKey,
            })),
            skipDuplicates: true,
          });
        }
      }
    });

    invalidateCustomRoleCache(tenantId, role.id);
    void recordRoleAudit({
      tenantId,
      actorUserId: authContext.userId ?? null,
      roleId: role.id,
      action: "update",
      result: "ok",
      requestId: resolveRequestId(req),
    });

    return res.json({ ok: true });
  }
);

rolesRouter.delete(
  "/tenants/:tenantId/roles/:id",
  requireTenantRole("TENANT_ADMIN"),
  async (req, res) => {
    const { authContext, prisma } = req as TenantAwareRequest;
    if (!authContext || !prisma) {
      return respondRoleError(res, {
        status: 500,
        code: "AUTH_CONTEXT_MISSING",
        message: "Authentication context missing",
        reason: "auth_context_missing",
      });
    }

    const tenantId = req.params.tenantId;
    if (tenantId !== authContext.tenantId) {
      return respondRoleError(res, {
        status: 403,
        code: "TENANT_FORBIDDEN",
        message: "Tenant mismatch",
        reason: "not_owner",
      });
    }

    const role = await prisma.tenantRoleCustom.findFirst({
      where: { id: req.params.id, tenantId },
      select: { id: true, name: true },
    });
    if (!role) {
      return respondRoleError(res, {
        status: 404,
        code: "ROLE_NOT_FOUND",
        message: "Role not found",
        reason: "role_not_found",
      });
    }

    const inUse = await prisma.tenantMembership.findFirst({
      where: { customRoleId: role.id },
      select: { id: true },
    });
    if (inUse) {
      return respondRoleError(res, {
        status: 409,
        code: "ROLE_IN_USE",
        message: "Role is in use",
        reason: "role_in_use",
      });
    }

    await prisma.tenantRoleCustom.delete({ where: { id: role.id, tenantId } });
    invalidateCustomRoleCache(tenantId, role.id);
    void recordRoleAudit({
      tenantId,
      actorUserId: authContext.userId ?? null,
      roleId: role.id,
      action: "delete",
      result: "ok",
      requestId: resolveRequestId(req),
    });

    return res.json({ ok: true });
  }
);
