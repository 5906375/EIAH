import { PrismaClient, prismaGlobal } from "@repo/db";

/**
 * Workspace action policy provisioning (ADR-010, PR A2).
 *
 * Idempotently grants the default Agent Protocol action policies of an
 * activated product to one workspace:
 * - an existing workspace policy for the same action (case-insensitive) is
 *   kept as is — an explicit deny (`allowed=false`) is never overridden;
 * - only actions listed by the caller (from the versioned catalog) are written;
 * - tenant-wide policies (`workspaceId=null`) are never created or changed.
 * Pass a transaction client when it must be atomic with the activation.
 * Any failure propagates (fail-closed).
 */
export async function provisionWorkspaceActionPolicies(params: {
  prisma?: PrismaClient;
  tenantId: string;
  workspaceId: string;
  actionNames: readonly string[];
}): Promise<Array<{ actionName: string; allowed: boolean; created: boolean }>> {
  const client = params.prisma ?? prismaGlobal;
  const existing = await client.tenantActionPolicy.findMany({
    where: { tenantId: params.tenantId, workspaceId: params.workspaceId },
    select: { actionName: true, allowed: true },
  });
  const existingByAction = new Map(
    existing.map((policy) => [policy.actionName.trim().toLowerCase(), policy.allowed] as const)
  );

  const result: Array<{ actionName: string; allowed: boolean; created: boolean }> = [];
  for (const rawActionName of params.actionNames) {
    const actionName = rawActionName.trim().toLowerCase();
    if (!actionName) {
      throw new Error("WORKSPACE_ACTION_POLICY_PROVISIONING_FAILED: empty action name");
    }
    const current = existingByAction.get(actionName);
    if (current !== undefined) {
      result.push({ actionName, allowed: current, created: false });
      continue;
    }
    await client.tenantActionPolicy.create({
      data: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        actionName,
        allowed: true,
      },
    });
    existingByAction.set(actionName, true);
    result.push({ actionName, allowed: true, created: true });
  }
  return result;
}
