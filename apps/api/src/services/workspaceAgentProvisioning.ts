import { PrismaClient, prismaGlobal } from "@repo/db";
import { resolveWorkspaceAgentProvisioningTarget, type WorkspaceAgentAssignmentRecord } from "./workspaceAgentAssignments";

/**
 * Workspace agent provisioning (ADR-010, PR A).
 *
 * Explicit provisioning at workspace creation and product activation. It is
 * deliberately kept outside `workspaceAgentAssignments.ts`: the execution gate
 * must never provision or re-enable an assignment when it refuses a run
 * (`AGENT_ASSIGNMENT_REQUIRED`, docs/ops/reason-codes-catalog.md).
 *
 * `enabled=true` here means only current operational enablement; it is not a
 * formal approval, signature or approver identity (still pending PR1b), so no
 * signature fields are written.
 */

export const WORKSPACE_AGENT_PROVISIONING_FAILED = "WORKSPACE_AGENT_PROVISIONING_FAILED" as const;

export type WorkspaceAgentProvisioningAgent = {
  agentKey: string;
  catalogMetadata?: {
    displayName: string;
    category: string;
    version: string;
  };
};

/**
 * Idempotently ensures the given assignments exist:
 * - key and version resolved with the gate's own rules, so the result is exactly
 *   what `assertWorkspaceAgentEnabled` requires;
 * - an existing assignment for the same normalized key and version is reused
 *   (never duplicated, which the gate would treat as "ambiguous");
 * - an explicitly disabled assignment is never re-enabled;
 * - catalog metadata for non-core agents is created only when absent.
 * Pass a transaction client when provisioning must be atomic with its trigger.
 * Any failure propagates (fail-closed).
 */
export async function provisionWorkspaceAgentAssignments(params: {
  prisma?: PrismaClient;
  tenantId: string;
  workspaceId: string;
  agents: readonly WorkspaceAgentProvisioningAgent[];
  trigger: string;
  catalogVersion: number;
}): Promise<WorkspaceAgentAssignmentRecord[]> {
  const client = params.prisma ?? prismaGlobal;
  const provisioned: WorkspaceAgentAssignmentRecord[] = [];

  for (const agent of params.agents) {
    const agentKey = agent.agentKey.trim();
    if (!agentKey) {
      throw new Error(`${WORKSPACE_AGENT_PROVISIONING_FAILED}: empty agent key`);
    }

    if (agent.catalogMetadata) {
      const existingMetadata = await client.agentMetadata.findUnique({
        where: { agent: agentKey },
        select: { id: true },
      });
      if (!existingMetadata) {
        await client.agentMetadata.create({
          data: {
            agent: agentKey,
            displayName: agent.catalogMetadata.displayName,
            category: agent.catalogMetadata.category,
            version: agent.catalogMetadata.version,
          },
        });
      }
    }

    const target = await resolveWorkspaceAgentProvisioningTarget({
      prisma: client,
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      agentKey,
    });
    if (!target.agentVersion) {
      throw new Error(
        `${WORKSPACE_AGENT_PROVISIONING_FAILED}: version could not be resolved for agent ${target.canonicalAgentKey}`
      );
    }
    if (target.existing) {
      provisioned.push(target.existing);
      continue;
    }

    const created = await client.workspaceAgentAssignment.create({
      data: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        agentKey: target.canonicalAgentKey,
        agentVersion: target.agentVersion,
        enabled: true,
        metadata: {
          source: "workspace_agent_provisioning",
          catalogVersion: params.catalogVersion,
          trigger: params.trigger,
        },
      },
    });
    provisioned.push({
      id: created.id,
      tenantId: created.tenantId,
      workspaceId: created.workspaceId,
      agentKey: created.agentKey,
      agentVersion: created.agentVersion,
      enabled: created.enabled,
      signedByUserId: created.signedByUserId,
      signedAt: created.signedAt,
      signatureRef: created.signatureRef,
    });
  }

  return provisioned;
}
