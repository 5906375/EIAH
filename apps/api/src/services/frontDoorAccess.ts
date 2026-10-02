import type { PrismaClient } from "@repo/db";
import {
  canActivateProducts,
  createWorkspaceInvitation,
  ensureWorkspaceResponsibilityStore,
  hasWorkspacePermission,
  listWorkspaceRoleOptions,
  PRODUCT_ACTIVATION_PERMISSION,
  readWorkspaceManagementSummary,
} from "./workspaceResponsibility";
import { ensureVerticalAccessStore } from "./products/verticalAccessApproval";

/**
 * ADR-011 §2.7: criação de acessos pelo front door.
 * - Quem cria: a regra atual de quem gerencia membros (Founder, Gestor, Admin).
 * - Só em workspace com pelo menos uma vertical liberada (aprovada) pela EIAH.
 * - Reaproveita o convite de workspace: link de uso único, 72 horas, mostrado uma vez; reemitir invalida o anterior.
 * - A pessoa define a própria senha; quem já tem conta só entra no workspace (sem senha nova).
 * - Só concede `products.activate` quem já tem (regra do convite).
 * O e-mail não passa pela conversa: o painel envia direto à API e a resposta traz o e-mail mascarado.
 */

export type FrontDoorAccessBlockReason = "MEMBERS_FORBIDDEN" | "NO_APPROVED_VERTICAL";

const BLOCK_MESSAGES: Record<FrontDoorAccessBlockReason, string> = {
  MEMBERS_FORBIDDEN: "Só o Founder, o Gestor ou o Admin do workspace podem criar acessos.",
  NO_APPROVED_VERTICAL: "Acessos pelo front door só podem ser criados em workspace com uma vertical liberada pela EIAH.",
};

/** Mascara o e-mail para exibição: "maria.silva@x.com" → "ma***@x.com". */
export function maskEmail(email: string) {
  const [local, domain] = email.trim().toLowerCase().split("@");
  if (!local || !domain) return "***";
  return `${local.slice(0, Math.min(2, local.length))}***@${domain}`;
}

async function hasApprovedVertical(prisma: PrismaClient, tenantId: string, workspaceId: string) {
  await ensureVerticalAccessStore(prisma);
  const rows = await prisma.$queryRaw<Array<{ total: bigint }>>`
    SELECT COUNT(*)::bigint AS total FROM vertical_access_approvals
    WHERE tenant_id = ${tenantId} AND workspace_id = ${workspaceId} AND status = 'aprovado'
  `;
  return Number(rows[0]?.total ?? 0) > 0;
}

export async function readFrontDoorAccessOptions(params: {
  prisma: PrismaClient;
  tenantId: string;
  workspaceId: string;
  userId: string;
}) {
  const manager = await readWorkspaceManagementSummary(params);
  let reason: FrontDoorAccessBlockReason | null = null;
  if (!manager.canManageMembers) reason = "MEMBERS_FORBIDDEN";
  else if (!(await hasApprovedVertical(params.prisma, params.tenantId, params.workspaceId))) reason = "NO_APPROVED_VERTICAL";
  const roles = reason
    ? []
    : (await listWorkspaceRoleOptions(params))
        .filter((role) => role.key !== "founder")
        .map((role) => ({
          key: role.key,
          label: role.label,
          // Quem não tem a chave não vê função que a concede.
          grantsActivation: hasWorkspacePermission(role.defaultPermissions, PRODUCT_ACTIVATION_PERMISSION),
        }))
        .filter((role) => !role.grantsActivation || canActivateProducts(manager));
  return {
    allowed: reason === null,
    reason,
    message: reason ? BLOCK_MESSAGES[reason] : null,
    roles,
    expiresInHours: 72,
  };
}

export type FrontDoorAccessResult = {
  invitationId: string;
  token: string;
  maskedEmail: string;
  roleLabel: string;
  expiresAt: string;
  accountExists: boolean;
};

function fail(code: string, status: number, message: string): never {
  throw Object.assign(new Error(message), { code, status });
}

export async function createFrontDoorAccess(params: {
  prisma: PrismaClient;
  tenantId: string;
  workspaceId: string;
  userId: string;
  email: string;
  fullName?: string | null;
  roleKey: string;
}): Promise<FrontDoorAccessResult> {
  const { prisma, tenantId, workspaceId, userId } = params;
  await ensureWorkspaceResponsibilityStore(prisma);
  const options = await readFrontDoorAccessOptions({ prisma, tenantId, workspaceId, userId });
  if (!options.allowed) {
    fail(options.reason === "MEMBERS_FORBIDDEN" ? "WORKSPACE_MEMBERS_FORBIDDEN" : "FRONT_DOOR_ACCESS_NO_APPROVED_VERTICAL", 403, options.message ?? "");
  }
  if (params.roleKey.trim().toLowerCase() === "founder") {
    fail("FRONT_DOOR_ACCESS_ROLE_FORBIDDEN", 403, "A função Founder não é concedida por convite.");
  }
  const email = params.email.trim().toLowerCase();
  const existing = await prisma.$queryRaw<Array<{ tenant_id: string; member: boolean }>>`
    SELECT u.tenant_id,
      EXISTS (
        SELECT 1 FROM eiah_workspace_memberships m
        WHERE m.user_id = u.id AND m.tenant_id = ${tenantId} AND m.workspace_id = ${workspaceId} AND m.status = 'active'
      ) AS member
    FROM users u
    WHERE lower(u.email) = ${email}
    LIMIT 1
  `;
  if (existing[0]?.member) {
    fail("FRONT_DOOR_ACCESS_ALREADY_MEMBER", 409, "Esta pessoa já tem acesso a este workspace.");
  }
  const invitation = await createWorkspaceInvitation({
    prisma,
    tenantId,
    workspaceId,
    invitedByUserId: userId,
    email,
    fullName: params.fullName ?? null,
    roleKey: params.roleKey,
  });
  return {
    invitationId: invitation.id,
    token: invitation.token,
    maskedEmail: maskEmail(email),
    roleLabel: invitation.roleLabel,
    expiresAt: invitation.expiresAt,
    accountExists: existing[0]?.tenant_id === tenantId,
  };
}
