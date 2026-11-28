import type { NextFunction, Request, Response } from "express";
import { asyncHandler } from "../../middlewares/asyncHandler";
import { hasWorkspacePermission, readActiveWorkspaceMembershipPermissions } from "../workspaceResponsibility";
import { sendImobAccessDenied } from "./imobAccessGate";

/**
 * AUTHZ-IMOB-CRM-001 — porta única das rotas do IMOB (CRM, resolve-turn, command center, busca, contratos…): exige VÍNCULO ATIVO do usuário no
 * workspace com a permissão base `imob.chat.use`, lido em modo SOMENTE LEITURA (sem bootstrap, sem promoção, sem reativação). Sem vínculo,
 * revogado, sem a permissão ou erro de leitura ⇒ 403, antes de qualquer dado. Vínculo ativo NÃO é autorização universal: as permissões
 * específicas de cada operação (`imob.stage.*`, ações) continuam sendo verificadas pelas rotas.
 *
 * Fora desta porta, de propósito: `/chat/conversations*` e `/chat/telemetry*` (histórico: porta própria, FD-IMOB-HISTORY-AUTHZ-001, com
 * titularidade, que também nega token sem usuário).
 *
 * AUTHZ-IMOB-SERVICE-001 — token SEM `userId` NÃO é "corretor" e não recebe o IMOB por ausência de usuário. Não existe contrato verificável de
 * identidade técnica para o IMOB (o `ApiToken` guarda só tenant/workspace/descrição/validade; a política de escopo `TenantActionPolicy` é por
 * workspace, não por identidade; nada liga um token a um escopo de operação): sem a prova, 403 fail-closed
 * (`IMOB_SERVICE_AUTHORITY_REQUIRED`). A autoridade nunca é derivada de cabeçalho, query ou corpo enviados pelo cliente.
 */
export const IMOB_BASE_PERMISSION = "imob.chat.use";

export function isImobHistoryPath(path: string) {
  return path.startsWith("/chat/conversations") || path.startsWith("/chat/telemetry");
}

type GateRequest = Request & {
  prisma?: unknown;
  authContext?: { tenantId: string; workspaceId: string; userId?: string | null };
};

export const imobWorkspaceAccessGate = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const request = req as GateRequest;
  if (!request.authContext || !request.prisma) {
    return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING" } });
  }
  if (isImobHistoryPath(req.path)) return next();
  const { tenantId, workspaceId, userId } = request.authContext;
  if (!userId) {
    return sendImobAccessDenied(res, {
      req,
      code: "IMOB_SERVICE_AUTHORITY_REQUIRED",
      reasonCode: "IMOB_PERMISSION_DENIED",
      capability: "CENTRAL_OPERACIONAL",
      tenantId,
      workspaceId,
      installationStatus: "active",
      message: "Identidade técnica sem autorização de serviço comprovada para o IMOB. Acesso negado.",
    });
  }
  const permissions = await readActiveWorkspaceMembershipPermissions({ prisma: request.prisma, tenantId, workspaceId, userId });
  if (permissions && hasWorkspacePermission(permissions, IMOB_BASE_PERMISSION)) return next();
  // Contrato de códigos (EIAH-GIT-INTEGRATION-004): vínculo ATIVO sem a permissão base ≠ ausência de vínculo ativo. Só a leitura que devolve
  // permissões (vínculo ativo existente) chega aqui como "sem permissão"; ausência, revogação (já negada antes pela guarda de vínculo inativo)
  // e erro de leitura devolvem `null` e seguem fail-closed como vínculo exigido.
  if (permissions) {
    return sendImobAccessDenied(res, {
      req,
      code: "IMOB_WORKSPACE_PERMISSION_FORBIDDEN",
      reasonCode: "IMOB_PERMISSION_DENIED",
      capability: "CENTRAL_OPERACIONAL",
      tenantId,
      workspaceId,
      installationStatus: "active",
      message: "Sua função atual não pode usar o IMOB neste workspace.",
    });
  }
  return sendImobAccessDenied(res, {
    req,
    code: "IMOB_WORKSPACE_MEMBERSHIP_REQUIRED",
    reasonCode: "IMOB_PERMISSION_DENIED",
    capability: "CENTRAL_OPERACIONAL",
    tenantId,
    workspaceId,
    installationStatus: "active",
    message: "Seu usuário não tem vínculo ativo com permissão de uso do IMOB neste workspace.",
  });
});
