import type { RequestHandler } from "express";
import { ZodError } from "zod";

import { createGovernedRouter } from "../middlewares/asyncHandler";
import { enforceTenant, type TenantAwareRequest } from "../middlewares/enforceTenant";
import {
  authorizePreDuimpAction,
  isKnownPreDuimpAction,
  PreDuimpActionRejectedError,
  type PreDuimpAuthorizationRequest,
} from "../services/logistica/control/preDuimpActionCatalog";
import { resolvePreDuimpServerAuthorityFromCanonicalSources } from "../services/logistica/control/preDuimpServerAuthorityAdapter";

// Primeiro entrypoint HTTP real do PRE_DUIMP (roadmap v8.1 §15). Prova de
// enforcement no runtime: identidade/tenant/workspace vem exclusivamente de
// req.authContext (resolvido por enforceTenant — real, DB-backed, nunca do
// payload). scope/entitlement/HITL vem exclusivamente de
// resolvePreDuimpServerAuthorityFromCanonicalSources (real, RBAC/instalacao
// via mecanismos ja canonicos). O corpo da requisicao contribui apenas
// {action, context} — exatamente PreDuimpAuthorizationRequest, a mesma
// forma restrita ja usada pelo catalogo desde o cut 3.
//
// A cadeia de decisao real (authorizePreDuimpAction) roda sempre que a rota
// esta montada — nao ha atalho que autorize sem passar por ela. Deny e
// sempre um bloqueio real (403 + reasonCode/subreason), nunca observabilidade
// silenciosa. mode="shadow" e externalTransmissionAllowed=false permanecem
// impostos pelo contrato de dominio subjacente, nao por este arquivo —
// nenhuma chamada externa ou efeito irreversivel e produzido aqui.
//
// A disponibilidade desta rota (se ela existe no app.use table) e' um gate
// de rollout separado — ver preDuimpRuntimeShadowGate.ts.

export const PRE_DUIMP_RUNTIME_SHADOW_ACTIONS_PATH = "/logistica/pre-duimp/actions" as const;

export type PreDuimpRuntimeShadowRouterDeps = Readonly<{
  authMiddleware: RequestHandler;
  resolveServerAuthority: typeof resolvePreDuimpServerAuthorityFromCanonicalSources;
}>;

export function createPreDuimpRuntimeShadowRouter(deps: PreDuimpRuntimeShadowRouterDeps) {
  const router = createGovernedRouter();

  router.use(deps.authMiddleware);

  router.post(PRE_DUIMP_RUNTIME_SHADOW_ACTIONS_PATH, async (req: TenantAwareRequest, res) => {
    if (!req.authContext) {
      return res.status(401).json({ ok: false, error: { code: "UNAUTHORIZED" } });
    }

    const { tenantId, workspaceId, userId, tokenId } = req.authContext;
    const body = req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};
    const action = typeof body.action === "string" ? body.action : "";

    if (!isKnownPreDuimpAction(action)) {
      return res.status(400).json({ ok: false, error: { code: "PRE_DUIMP_ACTION_UNKNOWN" } });
    }

    const serverAuthority = await deps.resolveServerAuthority({
      identity: { tenantId, workspaceId, userId, tokenId },
      action,
    });

    const request: PreDuimpAuthorizationRequest = {
      action,
      context: body.context,
    };

    try {
      const authorization = authorizePreDuimpAction(request, serverAuthority);

      return res.status(200).json({
        ok: true,
        decision: "authorized_shadow",
        action: authorization.action,
        mode: authorization.context.mode,
        externalTransmissionAllowed: authorization.context.externalTransmissionAllowed,
      });
    } catch (error) {
      if (error instanceof PreDuimpActionRejectedError) {
        return res.status(403).json({
          ok: false,
          error: {
            code: error.reasonCode,
            reasonCode: error.reasonCode,
            subreason: error.subreason ?? null,
          },
        });
      }

      if (error instanceof ZodError) {
        return res.status(400).json({
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid context",
            details: error.flatten(),
          },
        });
      }

      // Nao classificado (bug, falha de dependencia, etc.): nunca mascarar
      // como 400. Propaga para asyncHandler -> governedErrorHandler (500 +
      // log com traceId), preservando visibilidade real do erro (N-13).
      throw error;
    }
  });

  return router;
}

const PRODUCTION_DEPS: PreDuimpRuntimeShadowRouterDeps = Object.freeze({
  authMiddleware: enforceTenant,
  resolveServerAuthority: resolvePreDuimpServerAuthorityFromCanonicalSources,
});

export const preDuimpRuntimeShadowRouter = createPreDuimpRuntimeShadowRouter(PRODUCTION_DEPS);
