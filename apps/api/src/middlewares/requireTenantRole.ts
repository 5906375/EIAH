import type { Response, NextFunction } from "express";
import { normalizeReason } from "@eiah/core";
import type { TenantAwareRequest } from "./enforceTenant";
import type { MembershipStatus, TenantRole } from "../services/tenantGovernance";
import { resolveMembershipReason } from "../services/membershipStatus";

type AllowedRoles = TenantRole | TenantRole[];

function normalizeAllowed(allowed: AllowedRoles): TenantRole[] {
  return Array.isArray(allowed) ? allowed : [allowed];
}

export function requireTenantRole(allowed: AllowedRoles) {
  const allowedRoles = normalizeAllowed(allowed);
  return (req: TenantAwareRequest, res: Response, next: NextFunction) => {
    const { authContext } = req;
    if (!authContext) {
      return res.status(500).json({
        ok: false,
        error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
      });
    }

    const role: TenantRole | undefined = authContext.isGlobalAdmin
      ? "TENANT_ADMIN"
      : authContext.tenantRole;
    const status: MembershipStatus | undefined = authContext.isGlobalAdmin
      ? "ACTIVE"
      : authContext.membershipStatus;

    if (!role || !status) {
      return res.status(403).json({
        ok: false,
        error: {
          code: "TENANT_MEMBERSHIP_REQUIRED",
          reason: normalizeReason("membership_inactive"),
          message: "Tenant membership required",
        },
      });
    }

    if (status !== "ACTIVE") {
      const reason = resolveMembershipReason(status);
      return res.status(403).json({
        ok: false,
        error: {
          code: "TENANT_MEMBERSHIP_INACTIVE",
          reason: normalizeReason(reason),
          message: "Tenant membership inactive",
        },
      });
    }

    if (!allowedRoles.includes(role)) {
      return res.status(403).json({
        ok: false,
        error: { code: "TENANT_ROLE_FORBIDDEN", message: "Tenant role not allowed" },
      });
    }

    return next();
  };
}
