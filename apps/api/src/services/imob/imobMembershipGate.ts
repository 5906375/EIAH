import type { NextFunction, Request, Response } from "express";
import { asyncHandler } from "../../middlewares/asyncHandler";
import { ensureWorkspaceResponsibilityStore } from "../workspaceResponsibility";
import { sendImobAccessDenied } from "./imobAccessGate";

/**
 * P12.1: vínculo (membership) não ativo com o workspace não consulta nem opera casos do IMOB, num ponto só do servidor
 * (mesmo desenho do `imobRevocationGate`, que cobre a revogação da liberação da vertical).
 * - Só a membership PERSISTIDA com status diferente de `active` (revogada, suspensa, pendente…) é negada: 403.
 * - Token sem pessoa associada (serviço/automação) e pessoa sem registro de membership seguem o contrato anterior
 *   (o registro é resolvido pelas rotas); esta guarda não cria nem promove membership.
 * - Falha ao consultar NÃO vira 403 nem 200: segue como erro interno (500) pelo handler governado; a requisição não prossegue.
 * Nada é apagado: o registro de membership e os dados do caso permanecem como estão.
 */

export const IMOB_MEMBERSHIP_INACTIVE_CODE = "IMOB_WORKSPACE_MEMBERSHIP_INACTIVE";

export type ImobMembershipGateOutcome = "allow" | typeof IMOB_MEMBERSHIP_INACTIVE_CODE;

export function decideImobMembershipGate(membership: { status?: unknown } | null | undefined): ImobMembershipGateOutcome {
  if (!membership) return "allow";
  return String(membership.status ?? "").trim().toLowerCase() === "active" ? "allow" : IMOB_MEMBERSHIP_INACTIVE_CODE;
}

type GateRequest = Request & {
  prisma?: {
    $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Array<{ status: string | null }>>;
  };
  authContext?: { tenantId: string; workspaceId: string; userId?: string | null };
};

export const imobMembershipGate = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const request = req as GateRequest;
  // Depois do `enforceTenant` o contexto sempre existe; se faltar, nega (fail-closed).
  if (!request.authContext || !request.prisma) {
    return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING" } });
  }
  const { tenantId, workspaceId, userId } = request.authContext;
  if (!userId) return next();

  await ensureWorkspaceResponsibilityStore(request.prisma);
  const rows = await request.prisma.$queryRaw`
    SELECT status
    FROM eiah_workspace_memberships
    WHERE user_id = ${userId}
      AND tenant_id = ${tenantId}
      AND workspace_id = ${workspaceId}
    LIMIT 1
  `;
  if (decideImobMembershipGate(rows[0]) === "allow") return next();

  return sendImobAccessDenied(res, {
    req,
    code: IMOB_MEMBERSHIP_INACTIVE_CODE,
    reasonCode: "IMOB_PERMISSION_DENIED",
    capability: "CENTRAL_OPERACIONAL",
    tenantId,
    workspaceId,
    installationStatus: "active",
    message: "Seu vínculo com este workspace não está ativo. Fale com um administrador do workspace.",
  });
});
