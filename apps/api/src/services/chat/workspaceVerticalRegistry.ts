import { resolveLogisticaContextAccess } from "../logistica/control/logisticaContextAccess";
import type { PrismaClient } from "@repo/db";
import { getProductProvisionedAgents } from "@eiah/core/catalog/workspaceAgentProvisioning";
import { resolveImobEntitlements } from "../imob/imobEntitlements";
import { readVerticalUsage } from "../products/verticalAccessApproval";
import { hasWorkspacePermission, readActiveWorkspaceMembershipPermissions } from "../workspaceResponsibility";
import { IMOB_CHAT_PERMISSION, type VerticalRegistryFacts } from "./verticalRegistryComposition";

export * from "./verticalRegistryComposition";

type Scope = { tenantId: string; workspaceId: string; userId?: string | null };

export type VerticalRegistryFactsOptions = {
  /**
   * Lê a permissão do IMOB do usuário (`imob.chat.use`) a partir do vínculo ATIVO, em modo SOMENTE LEITURA (AUTHZ-IMOB-HANDOFF-001):
   * não cria vínculo, não reativa, não promove. Só o handoff PARA O IMOB a usa (a governança do registry nunca vai à superfície).
   */
  resolveImobPermission?: boolean;
};

/**
 * Fatos de INSTALAÇÃO/HABILITAÇÃO do IMOB no workspace (somente leitura): instalação, direito de uso, liberação EIAH e agentes provisionados.
 * Mesma leitura do registry; reutilizada pelas APIs operacionais do IMOB (AUTHZ-IMOB-INSTALLATION-001).
 */
export async function readImobInstallationFacts(prisma: PrismaClient, scope: Scope): Promise<Omit<VerticalRegistryFacts["imob"], "userCanUse">> {
  const entitlements = await resolveImobEntitlements({ prisma, tenantId: scope.tenantId, workspaceId: scope.workspaceId });
  const { usage } = await readVerticalUsage({ prisma, tenantId: scope.tenantId, workspaceId: scope.workspaceId, vertical: "IMOB" });
  const imobAgents = getProductProvisionedAgents("IMOB").map((agent) => agent.agentKey);
  const assignments = await prisma.workspaceAgentAssignment.findMany({
    where: { tenantId: scope.tenantId, workspaceId: scope.workspaceId, agentKey: { in: imobAgents }, enabled: true },
    select: { agentKey: true },
  });
  const assigned = new Set(assignments.map((item) => item.agentKey));
  return {
    installationStatus: entitlements.IMOB_INSTALLATION_STATUS,
    entitled: entitlements.REAL_ESTATE_CORE,
    agentsReady: imobAgents.every((agentKey) => assigned.has(agentKey)),
    usage,
  };
}

/** Lê do banco os fatos do registry: instalação, direito de uso, agentes provisionados e permissão do usuário. */
export async function readVerticalRegistryFacts(prisma: PrismaClient, scope: Scope, options: VerticalRegistryFactsOptions = {}): Promise<VerticalRegistryFacts> {
  const installation = await readImobInstallationFacts(prisma, scope);
  // AUTHZ-IMOB-HANDOFF-001: selecionar o IMOB não concede autoridade. A permissão vem do vínculo ATIVO já existente, lido sem efeito de
  // escrita (antes, `readWorkspaceResponsibleProfile` criava o vínculo de quem não tinha, promovia o membro único e aceitava vínculo
  // revogado). Sem vínculo ativo, sem permissão ou com erro de leitura: `userCanUse=false` (fail-closed).
  const imobInstalled = installation.installationStatus !== "missing";
  const permissions = scope.userId && imobInstalled && options.resolveImobPermission === true
    ? await readActiveWorkspaceMembershipPermissions({ prisma, tenantId: scope.tenantId, workspaceId: scope.workspaceId, userId: scope.userId })
    : null;
  const [logisticaContext, logisticsRows] = await Promise.all([
    resolveLogisticaContextAccess(prisma, scope),
    prisma.$queryRaw<Array<{ status: string }>>`SELECT status FROM tenant_product_installations WHERE tenant_id=${scope.tenantId} AND workspace_id=${scope.workspaceId} AND product='LOGISTICA' LIMIT 1`.catch(() => []),
  ]);
  return {
    logistica: { installationStatus: !logisticsRows[0] ? "missing" : logisticsRows[0].status === "active" ? "active" : "inactive", contextAllowed: logisticaContext.allowed },
    scope: { tenantId: scope.tenantId, workspaceId: scope.workspaceId },
    imob: {
      installationStatus: installation.installationStatus,
      entitled: installation.entitled,
      agentsReady: installation.agentsReady,
      // Sem usuário identificado não há como avaliar a permissão: nega (fail-closed).
      userCanUse: permissions ? hasWorkspacePermission(permissions, IMOB_CHAT_PERMISSION) : false,
      usage: installation.usage,
    },
  };
}

