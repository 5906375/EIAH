import type { NextFunction, Response } from "express";
import type { FinancialAuthorityScope } from "@eiah/core";
import type { TenantAwareRequest } from "./enforceTenant";
import {
  evaluateFinancialAuthority,
  recordFinancialDenial,
  type FinancialAuthorityGranted,
} from "../services/financialAuthority";

export type FinancialAuthorityRequest = TenantAwareRequest & { financialAuthority?: FinancialAuthorityGranted };

/**
 * AUTHZ-FIN-1 (proposta): exige autoridade financeira DESIGNADA (não papel, não política de workspace) para o escopo da rota.
 * Deve ser montado POR ROTA, depois do `enforceTenant`, nunca como `router.use(...)` amplo. Qualquer falha ou exceção nega
 * (nunca chama `next()`); a negativa 403 é registrada em melhor esforço e não altera nenhum dado financeiro.
 */
export function requireFinancialAuthority(scope: FinancialAuthorityScope, operation: string) {
  return async (req: TenantAwareRequest, res: Response, next: NextFunction) => {
    const { authContext, prisma } = req;
    if (!authContext || !prisma) {
      return res.status(500).json({
        ok: false,
        error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" },
      });
    }
    const actor = {
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      userId: authContext.userId ?? null,
      tokenId: authContext.tokenId ?? null,
    };
    try {
      const decision = await evaluateFinancialAuthority(prisma, actor, scope);
      if (!decision.ok) {
        if (decision.status === 403) {
          await recordFinancialDenial(prisma, actor, scope, { reasonCode: decision.reasonCode, code: decision.code, operation });
        }
        return res.status(decision.status).json({ ok: false, error: { code: decision.code, message: decision.message } });
      }
      (req as FinancialAuthorityRequest).financialAuthority = decision;
      return next();
    } catch {
      return res.status(503).json({
        ok: false,
        error: {
          code: "BILLING_AUTHORITY_CHECK_UNAVAILABLE",
          message: "Não foi possível verificar a autoridade financeira. Nada foi alterado.",
        },
      });
    }
  };
}
