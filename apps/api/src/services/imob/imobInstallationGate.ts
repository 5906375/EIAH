import type { NextFunction, Request, Response } from "express";
import type { PrismaClient } from "@repo/db";
import { asyncHandler } from "../../middlewares/asyncHandler";
import { isImobVerticalEnabled } from "../chat/verticalRegistryComposition";
import { readImobInstallationFacts } from "../chat/workspaceVerticalRegistry";
import { sendImobAccessDenied } from "./imobAccessGate";

/**
 * AUTHZ-IMOB-INSTALLATION-001 — identidade, vínculo e `imob.chat.use` NÃO bastam: o IMOB precisa estar INSTALADO e HABILITADO no workspace.
 * Fonte autoritativa: a mesma do registry de verticais (`readImobInstallationFacts` + `isImobVerticalEnabled`: instalação ativa, direito de uso,
 * agentes provisionados, liberação EIAH não bloqueada). Leitura pura: nunca instala, ativa, cria vínculo, promove ou concede. A existência de
 * dados do IMOB no workspace não é prova de instalação. Erro de leitura ⇒ nega (fail-closed). Os fluxos de instalação/administração (marketplace,
 * liberação EIAH, convites) têm autoridade própria e ficam fora desta porta.
 */
export type ImobEnablementDecision =
  | { enabled: true }
  | { enabled: false; reasonCode: "IMOB_ENTITLEMENT_MISSING" | "IMOB_INSTALLATION_INACTIVE"; installationStatus: "missing" | "inactive" | "active" };

export async function resolveImobEnablement(prisma: unknown, scope: { tenantId: string; workspaceId: string }): Promise<ImobEnablementDecision> {
  try {
    const facts = await readImobInstallationFacts(prisma as PrismaClient, scope);
    if (isImobVerticalEnabled(facts)) return { enabled: true };
    return {
      enabled: false,
      reasonCode: facts.installationStatus === "missing" ? "IMOB_ENTITLEMENT_MISSING" : "IMOB_INSTALLATION_INACTIVE",
      installationStatus: facts.installationStatus,
    };
  } catch {
    return { enabled: false, reasonCode: "IMOB_INSTALLATION_INACTIVE", installationStatus: "inactive" };
  }
}

type GateRequest = Request & {
  prisma?: unknown;
  authContext?: { tenantId: string; workspaceId: string; userId?: string | null };
};

export const imobInstallationGate = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const request = req as GateRequest;
  if (!request.authContext || !request.prisma) {
    return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING" } });
  }
  const { tenantId, workspaceId } = request.authContext;
  const decision = await resolveImobEnablement(request.prisma, { tenantId, workspaceId });
  if (decision.enabled) return next();
  return sendImobAccessDenied(res, {
    req,
    // mesmo `code` que as rotas do IMOB já usam para ausência de direito/instalação (contrato existente do cliente); o motivo vai em `reasonCode`
    code: "ENTITLEMENT_MISSING",
    reasonCode: decision.reasonCode,
    capability: "CENTRAL_OPERACIONAL",
    tenantId,
    workspaceId,
    installationStatus: decision.installationStatus,
    message: "O IMOB não está instalado e habilitado neste workspace.",
  });
});
