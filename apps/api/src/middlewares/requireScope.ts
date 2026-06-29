import { Response, NextFunction } from "express";
import { TenantAwareRequest } from "./enforceTenant";

type CheckScopePermission = typeof import("@eiah/core").checkScopePermission;

export const requireScopeDeps = {
  checkScopePermission: (async (...args) => {
    const { checkScopePermission } = await import("@eiah/core");
    return checkScopePermission(...args);
  }) as CheckScopePermission,
};


/**
 * RBAC HTTP Middleware — valida se o token/usuário tem o escopo requerido.
 *
 * Uso:
 *   app.post("/api/runs", enforceTenant, requireScope("runs:write"), handler);
 */
export function requireScope(requiredScope: string) {
  return async (req: TenantAwareRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.authContext) {
        return res.status(401).json({
          ok: false,
          error: { code: "UNAUTHORIZED", message: "Missing auth context" },
        });
      }

      const { tenantId, workspaceId, userId, tokenId } = req.authContext;

      // 🔍 chama o RBAC Core (função base no pacote @eiah/core)
      const decision = await requireScopeDeps.checkScopePermission({
        tenantId,
        workspaceId,
        userId,
        tokenId,
        scope: requiredScope,
      });

      if (!decision.allowed) {
        req.logger?.warn(
          { event: "rbac.denied", scope: requiredScope, reasonCode: decision.reasonCode },
          "request.forbidden"
        );
        return res.status(403).json({
          ok: false,
          error: {
            code: decision.reasonCode,
            reasonCode: decision.reasonCode,
            message: `Scope denied: ${requiredScope}`,
          },
        });
      }

      return next();
    } catch (err) {
      console.error("requireScope error:", err);
      return res.status(500).json({
        ok: false,
        error: { code: "RBAC_ERROR", message: "Scope check failed" },
      });
    }
  };
}
