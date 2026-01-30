import { Response, NextFunction } from "express";
import { TenantAwareRequest } from "./enforceTenant";
import { checkScopePermission } from "packages/core/src/security/rbac.ts";


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
      const allowed = await checkScopePermission({
        tenantId,
        workspaceId,
        userId,
        tokenId,
        scope: requiredScope,
      });

      if (!allowed) {
        req.logger?.warn(
          { event: "rbac.denied", scope: requiredScope },
          "request.forbidden"
        );
        return res.status(403).json({
          ok: false,
          error: { code: "FORBIDDEN", message: `Missing scope: ${requiredScope}` },
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
