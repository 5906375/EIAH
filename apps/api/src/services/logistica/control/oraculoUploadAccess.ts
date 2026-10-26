import { ORACULO_PREPARATION_WRITE_SCOPE } from "@eiah/contracts";
import { TenantPolicyStore } from "@eiah/core/policy/TenantPolicyStore";
import type { PrismaClient } from "@repo/db";
import { hasLogisticaMemberCapability, resolveLogisticaContextAccess } from "./logisticaContextAccess";

export async function canAccessOraculoUploads(prisma: PrismaClient, identity: { tenantId: string; workspaceId: string; userId?: string | null }, write: boolean) {
  const access = await resolveLogisticaContextAccess(prisma, identity);
  if (!access.allowed) return false;
  if (!write) return true;
  if (access.usage !== "full") return false;
  if (!await hasLogisticaMemberCapability(prisma, identity, ORACULO_PREPARATION_WRITE_SCOPE)) return false;
  const policy = await TenantPolicyStore.getInstance().resolveExactWorkspaceScopeDecision(identity.tenantId, identity.workspaceId, ORACULO_PREPARATION_WRITE_SCOPE);
  return policy.allowed;
}
