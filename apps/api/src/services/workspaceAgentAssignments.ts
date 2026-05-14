import { PrismaClient, prismaGlobal } from "@repo/db";
import { hasCoreAgentProfile, resolveAgentId } from "./agents";
import { readWorkspaceManagementSummary } from "./workspaceResponsibility";

type WorkspaceAgentScope = {
  tenantId: string;
  workspaceId: string;
  agentKey: string;
  userId?: string;
};

export type WorkspaceAgentAssignmentRecord = {
  id: string;
  tenantId: string;
  workspaceId: string;
  agentKey: string;
  agentVersion: string;
  enabled: boolean;
  signedAt: Date | null;
  signatureRef: string | null;
};

export class WorkspaceAgentAssignmentError extends Error {
  readonly reasonCode = "AGENT_NOT_ENABLED_IN_WORKSPACE";

  constructor(
    message: string,
    readonly context: {
      tenantId: string;
      workspaceId: string;
      agentKey: string;
    }
  ) {
    super(message);
    this.name = "WorkspaceAgentAssignmentError";
  }
}

function resolveClient(client?: PrismaClient) {
  return client ?? prismaGlobal;
}

function normalizeAgentKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isGlobalPlatformEiahAgent(agentKey: string) {
  return normalizeAgentKey(agentKey) === "eiah";
}

async function canProvisionGlobalFounderAssignment(
  client: PrismaClient,
  params: WorkspaceAgentScope
) {
  if (!params.userId || !isGlobalPlatformEiahAgent(params.agentKey)) {
    return false;
  }

  const workspaceSummary = await readWorkspaceManagementSummary({
    prisma: client,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    userId: params.userId,
  });
  const normalizedRoleKey = (workspaceSummary.selectedRoleKey ?? "").trim().toLowerCase();
  return normalizedRoleKey === "founder" || normalizedRoleKey === "global_admin";
}

async function provisionGlobalFounderAssignment(
  client: PrismaClient,
  params: WorkspaceAgentScope
) {
  if (!(await canProvisionGlobalFounderAssignment(client, params))) {
    return null;
  }

  const canonicalAgentKey = await resolveCanonicalAgentKey(client, params.agentKey);
  const workspace = await client.workspace.findUnique({
    where: { id: params.workspaceId },
    select: { id: true, tenantId: true },
  });
  if (!workspace || workspace.tenantId !== params.tenantId) {
    return null;
  }

  const metadata = await client.agentMetadata.findUnique({
    where: { agent: canonicalAgentKey },
    select: { version: true },
  });
  const profile = await client.agentProfile.findUnique({
    where: { agent: canonicalAgentKey },
    select: { updatedAt: true },
  });

  if (!metadata && !profile && !hasCoreAgentProfile(canonicalAgentKey)) {
    return null;
  }

  return client.workspaceAgentAssignment.create({
    data: {
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      agentKey: canonicalAgentKey,
      agentVersion: metadata?.version ?? "1.0.0",
      enabled: true,
      signedAt: profile?.updatedAt ?? new Date(),
      signatureRef: "global-founder-access",
      metadata: {
        source: "global-founder-access",
        profileSource: metadata || profile ? "persisted" : "core-runtime",
      },
    },
  });
}

async function resolveCanonicalAgentKey(client: PrismaClient, agentKey: string) {
  const trimmed = agentKey.trim();
  if (!trimmed) return trimmed;

  const exactMetadata = await client.agentMetadata.findUnique({
    where: { agent: trimmed },
    select: { agent: true },
  });
  if (exactMetadata?.agent) return exactMetadata.agent;

  const exactProfile = await client.agentProfile.findUnique({
    where: { agent: trimmed },
    select: { agent: true },
  });
  if (exactProfile?.agent) return exactProfile.agent;

  const normalizedInput = normalizeAgentKey(trimmed);
  if (!normalizedInput) return trimmed;

  const [metadataAgents, profileAgents] = await Promise.all([
    client.agentMetadata.findMany({
      select: { agent: true },
    }),
    client.agentProfile.findMany({
      select: { agent: true },
    }),
  ]);

  const candidates = [...metadataAgents, ...profileAgents].map(item => item.agent);
  const matched = candidates.find(candidate => normalizeAgentKey(candidate) === normalizedInput);
  return matched ?? resolveAgentId(trimmed);
}

function toRecord(
  assignment: {
    id: string;
    tenantId: string;
    workspaceId: string;
    agentKey: string;
    agentVersion: string;
    enabled: boolean;
    signedAt: Date | null;
    signatureRef: string | null;
  }
): WorkspaceAgentAssignmentRecord {
  return assignment;
}

async function findLatestAssignment(
  client: PrismaClient,
  params: WorkspaceAgentScope
) {
  const normalizedInput = normalizeAgentKey(params.agentKey);
  const assignments = await client.workspaceAgentAssignment.findMany({
    where: {
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
    },
    orderBy: [{ enabled: "desc" }, { updatedAt: "desc" }, { createdAt: "desc" }],
  });
  return assignments.find(assignment => normalizeAgentKey(assignment.agentKey) === normalizedInput) ?? null;
}

async function bootstrapAssignment(
  client: PrismaClient,
  params: WorkspaceAgentScope
) {
  const canonicalAgentKey = await resolveCanonicalAgentKey(client, params.agentKey);
  const workspace = await client.workspace.findUnique({
    where: { id: params.workspaceId },
    select: { id: true, tenantId: true },
  });
  if (!workspace || workspace.tenantId !== params.tenantId) {
    return null;
  }

  const metadata = await client.agentMetadata.findUnique({
    where: { agent: canonicalAgentKey },
    select: { version: true },
  });
  const profile = await client.agentProfile.findUnique({
    where: { agent: canonicalAgentKey },
    select: { updatedAt: true },
  });

  if (!metadata && !profile && !hasCoreAgentProfile(canonicalAgentKey)) {
    return null;
  }

  return client.workspaceAgentAssignment.create({
    data: {
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      agentKey: canonicalAgentKey,
      agentVersion: metadata?.version ?? "1.0.0",
      enabled: true,
      signedAt: profile?.updatedAt ?? new Date(),
      signatureRef: metadata || profile ? "bootstrap-legacy-compat" : "bootstrap-core-agent-catalog",
      metadata: {
        source: metadata || profile ? "bootstrap-legacy-compat" : "bootstrap-core-agent-catalog",
      },
    },
  });
}

export async function getActiveWorkspaceAgentAssignment(params: {
  prisma?: PrismaClient;
  tenantId: string;
  workspaceId: string;
  agentKey: string;
}): Promise<WorkspaceAgentAssignmentRecord | null> {
  const client = resolveClient(params.prisma);
  const current =
    (await findLatestAssignment(client, params)) ??
    (await bootstrapAssignment(client, params));

  if (!current || !current.enabled) {
    return null;
  }

  return toRecord(current);
}

export async function assertWorkspaceAgentEnabled(params: {
  prisma?: PrismaClient;
  tenantId: string;
  workspaceId: string;
  agentKey: string;
  userId?: string;
}): Promise<WorkspaceAgentAssignmentRecord> {
  const client = resolveClient(params.prisma);
  const current =
    (await findLatestAssignment(client, params)) ??
    (await bootstrapAssignment(client, params));

  if (!current || !current.enabled) {
    const provisioned = await provisionGlobalFounderAssignment(client, params);
    if (provisioned?.enabled) {
      return toRecord(provisioned);
    }

    throw new WorkspaceAgentAssignmentError(
      `Agent ${params.agentKey.trim()} is not enabled in workspace ${params.workspaceId}`,
      {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        agentKey: params.agentKey.trim(),
      }
    );
  }

  return toRecord(current);
}

export async function listWorkspaceAgentAssignments(params: {
  prisma?: PrismaClient;
  tenantId: string;
  workspaceId: string;
  enabled?: boolean;
}): Promise<WorkspaceAgentAssignmentRecord[]> {
  const client = resolveClient(params.prisma);
  const items = await client.workspaceAgentAssignment.findMany({
    where: {
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      ...(params.enabled === undefined ? {} : { enabled: params.enabled }),
    },
    orderBy: [{ agentKey: "asc" }, { updatedAt: "desc" }],
  });
  return items.map(toRecord);
}
