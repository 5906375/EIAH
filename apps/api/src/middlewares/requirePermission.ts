import type { Response, NextFunction } from "express";
import { type ReasonCode, normalizeReason } from "@eiah/core";
import type { TenantAwareRequest } from "./enforceTenant";
import { hasPermission, resolveRole } from "../security/authz";
import { resolveMembershipReason } from "../services/membershipStatus";
import { loadCustomRoleWithPermissions } from "../services/customRoles";

export function requirePermission(permission: string) {
  return async (req: TenantAwareRequest, res: Response, next: NextFunction) => {
    const { authContext } = req;
    if (!authContext) {
      return res.status(500).json({
        ok: false,
        error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
      });
    }

    if (!authContext.isGlobalAdmin) {
      if (!authContext.tenantRole || !authContext.membershipStatus) {
        const reason: ReasonCode = "membership_inactive";
        return res.status(403).json({
          ok: false,
          error: {
            code: "TENANT_MEMBERSHIP_REQUIRED",
            reason: normalizeReason(reason),
            message: "Tenant membership required",
          },
        });
      }
      if (authContext.membershipStatus !== "ACTIVE") {
        const reason = resolveMembershipReason(authContext.membershipStatus);
        return res.status(403).json({
          ok: false,
          error: {
            code: "TENANT_MEMBERSHIP_INACTIVE",
            reason: normalizeReason(reason),
            message: "Tenant membership inactive",
          },
        });
      }
    }

    if (!authContext.isGlobalAdmin && authContext.customRoleId && req.prisma) {
      const custom = await loadCustomRoleWithPermissions({
        prisma: req.prisma,
        tenantId: authContext.tenantId,
        roleId: authContext.customRoleId,
      });
      const allowed = custom?.permissions.has(permission) ?? false;
      if (!allowed) {
        return res.status(403).json({
          ok: false,
          error: { code: "FORBIDDEN", message: "Permission denied" },
        });
      }
      return next();
    }

    const role = resolveRole(
      authContext.tokenId,
      authContext.isGlobalAdmin,
      authContext.tenantRole
    );
    const allowed = hasPermission({
      role,
      permission,
      tenantId: authContext.tenantId,
    });
    if (!allowed) {
      return res.status(403).json({
        ok: false,
        error: { code: "FORBIDDEN", message: "Permission denied" },
      });
    }

    return next();
  };
}
