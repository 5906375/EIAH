import type { NextFunction, Request, Response } from "express";
import { createLogger } from "@eiah/core/logging/logger";

/**
 * Middleware de erro 4-arg, ultimo da cadeia (N-13). So captura o que
 * nenhum handler/gate ja tratou — erros governados (403/401/400) respondem
 * antes de chegar aqui e nao sao reclassificados. Nunca vaza stack trace ao
 * cliente.
 */
export function governedErrorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) {
    return next(err);
  }
  const traceId = res.getHeader("x-trace-id");
  createLogger({
    component: "api-error-handler",
    httpMethod: req.method,
    path: req.originalUrl ?? req.url,
    traceId: typeof traceId === "string" ? traceId : undefined,
  }).error({ err }, "api.unhandled_route_error");
  res.status(500).json({ ok: false, reasonCode: "INTERNAL_ERROR" });
}
