import { Router } from "express";
import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Express 4 nao propaga rejeicoes de handlers async para o middleware de
 * erro — uma Promise rejeitada sem try/catch vira unhandledRejection no
 * processo, nao um next(err). Este wrapper fecha essa lacuna (N-13).
 */
export function asyncHandler(handler: RequestHandler): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

const WRAPPED_METHODS = ["get", "post", "put", "patch", "delete"] as const;

/**
 * Router com os verbos HTTP interceptados para envolver automaticamente
 * cada handler registrado em asyncHandler, sem exigir alteracao em cada
 * chamada individual de router.get/post/... nos arquivos de rota.
 */
export function createGovernedRouter(): Router {
  const router = Router();
  for (const method of WRAPPED_METHODS) {
    const original = router[method].bind(router);
    router[method] = ((path: unknown, ...handlers: RequestHandler[]) =>
      original(path as string, ...handlers.map((handler) => asyncHandler(handler)))) as typeof router[typeof method];
  }
  return router;
}
