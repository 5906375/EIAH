import type { NextFunction, Request, Response } from "express";
import { asyncHandler } from "../../middlewares/asyncHandler";
import { readVerticalUsage, type VerticalUsage } from "../products/verticalAccessApproval";

/**
 * ADR-011 §2.5: efeito da revogação da liberação EIAH nas rotas do IMOB, num ponto só do servidor.
 * - `bloqueio_total`: nenhuma rota do IMOB responde.
 * - `somente_leitura`: só consulta (GET/HEAD/OPTIONS); qualquer escrita, inclusive conversa com agente, é negada.
 * - `sem_nova_ativacao`: o uso atual continua; a nova ativação já é barrada em `activateProductInstallation`.
 * Nada é apagado. A instalação e as permissões continuam sendo verificadas pelas rotas.
 */

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export type ImobRevocationGateOutcome = "allow" | "IMOB_VERTICAL_REVOKED" | "IMOB_VERTICAL_READ_ONLY";

export function decideImobRevocationGate(usage: VerticalUsage, method: string): ImobRevocationGateOutcome {
  if (usage === "blocked") return "IMOB_VERTICAL_REVOKED";
  if (usage === "read_only" && !READ_METHODS.has(method.toUpperCase())) return "IMOB_VERTICAL_READ_ONLY";
  return "allow";
}

const GATE_MESSAGES: Record<Exclude<ImobRevocationGateOutcome, "allow">, string> = {
  IMOB_VERTICAL_REVOKED: "A liberação do IMOB neste workspace foi revogada pela EIAH. Os dados estão preservados.",
  IMOB_VERTICAL_READ_ONLY:
    "A liberação do IMOB neste workspace foi revogada pela EIAH: o acesso está em somente leitura. Os dados estão preservados.",
};

type GateRequest = Request & {
  prisma?: unknown;
  authContext?: { tenantId: string; workspaceId: string; userId?: string | null };
};

export const imobRevocationGate = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const request = req as GateRequest;
  // Depois do `enforceTenant` o contexto sempre existe; se faltar, nega (fail-closed).
  if (!request.authContext || !request.prisma) {
    return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING" } });
  }
  const { usage } = await readVerticalUsage({
    prisma: request.prisma as Parameters<typeof readVerticalUsage>[0]["prisma"],
    tenantId: request.authContext.tenantId,
    workspaceId: request.authContext.workspaceId,
    vertical: "IMOB",
  });
  const outcome = decideImobRevocationGate(usage, req.method);
  if (outcome === "allow") return next();
  req.logger?.warn?.(
    {
      tenantId: request.authContext.tenantId,
      workspaceId: request.authContext.workspaceId,
      userId: request.authContext.userId ?? null,
      method: req.method,
      reasonCode: outcome,
    },
    "imob.vertical_revoked",
  );
  return res.status(403).json({
    ok: false,
    error: {
      code: outcome,
      message: GATE_MESSAGES[outcome],
      product: "IMOB",
      cta: { type: "OPEN_MARKETPLACE", label: "Ver liberação", target: "/app/marketplace/imob" },
    },
  });
});
