import type { PrismaClient } from "@repo/db";
import { getProductProvisionedAgents } from "@eiah/core/catalog/workspaceAgentProvisioning";
import { resolveImobEntitlements } from "../imob/imobEntitlements";
import { readVerticalUsage } from "../products/verticalAccessApproval";
import { hasWorkspacePermission, readWorkspaceResponsibleProfile } from "../workspaceResponsibility";
import { IMOB_CHAT_PERMISSION, type VerticalRegistryFacts } from "./verticalRegistryComposition";

export * from "./verticalRegistryComposition";

type Scope = { tenantId: string; workspaceId: string; userId?: string | null };

/** Lê do banco os fatos do registry: instalação, direito de uso, agentes provisionados e permissão do usuário. */
export async function readVerticalRegistryFacts(prisma: PrismaClient, scope: Scope): Promise<VerticalRegistryFacts> {
  const entitlements = await resolveImobEntitlements({ prisma, tenantId: scope.tenantId, workspaceId: scope.workspaceId });
  const { usage } = await readVerticalUsage({ prisma, tenantId: scope.tenantId, workspaceId: scope.workspaceId, vertical: "IMOB" });
  const imobAgents = getProductProvisionedAgents("IMOB").map((agent) => agent.agentKey);
  const assignments = await prisma.workspaceAgentAssignment.findMany({
    where: { tenantId: scope.tenantId, workspaceId: scope.workspaceId, agentKey: { in: imobAgents }, enabled: true },
    select: { agentKey: true },
  });
  const assigned = new Set(assignments.map((item) => item.agentKey));
  const profile = scope.userId
    ? await readWorkspaceResponsibleProfile({ prisma, tenantId: scope.tenantId, workspaceId: scope.workspaceId, userId: scope.userId })
    : null;
  return {
    scope: { tenantId: scope.tenantId, workspaceId: scope.workspaceId },
    imob: {
      installationStatus: entitlements.IMOB_INSTALLATION_STATUS,
      entitled: entitlements.REAL_ESTATE_CORE,
      agentsReady: imobAgents.every((agentKey) => assigned.has(agentKey)),
      // Sem usuário identificado não há como avaliar a permissão: nega (fail-closed).
      userCanUse: profile ? hasWorkspacePermission(profile.permissions, IMOB_CHAT_PERMISSION) : false,
      usage,
    },
  };
}

