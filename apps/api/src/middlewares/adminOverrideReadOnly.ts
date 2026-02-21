import { Response, NextFunction } from "express";
import { TenantAwareRequest } from "./enforceTenant";

const READ_ONLY_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Global admin override should be read-only.
 * Blocks write methods when override is active, regardless of requireScope.
 */
export function adminOverrideReadOnly(
  req: TenantAwareRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.authContext?.overrideActive) return next();
  if (READ_ONLY_METHODS.has(req.method.toUpperCase())) return next();

  return res.status(403).json({
    ok: false,
    error: { code: "FORBIDDEN", message: "Global admin override is read-only" },
  });
}
