import { Request, Response, NextFunction } from "express";
import { enforceTenant, TenantAwareRequest } from "./enforceTenant";

/** Compatibilidade: delega validação para enforceTenant */
export function bearerAuth(req: Request, res: Response, next: NextFunction) {
  return enforceTenant(req as TenantAwareRequest, res, next);
}

/** Idempotência para endpoints sensíveis (mint/sign) e também pode ser usada aqui se quiser */
export function requireIdempotency(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const key = req.header("Idempotency-Key");

  if (!key) {
    return res.status(428).json({
      ok: false,
      error: {
        code: "IDEMPOTENCY_REQUIRED",
        message: "Idempotency-Key header is required",
      },
    });
  }

  // TODO: consultar/registrar chave em storage para evitar duplicidade
  next();
}
