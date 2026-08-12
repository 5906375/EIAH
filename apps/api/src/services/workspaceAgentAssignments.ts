import { PrismaClient, prismaGlobal } from "@repo/db";
import { recordGuardrailAudit } from "@eiah/core/services/guardrailLedgerStore";
import { hasCoreAgentProfile, resolveAgentId } from "./agents";

export const AGENT_ASSIGNMENT_REQUIRED = "AGENT_ASSIGNMENT_REQUIRED" as const;
export const AGENT_NOT_ENABLED_IN_WORKSPACE = "AGENT_NOT_ENABLED_IN_WORKSPACE" as const;

type WorkspaceAgentAssignmentReasonCode =
  | typeof AGENT_ASSIGNMENT_REQUIRED
  | typeof AGENT_NOT_ENABLED_IN_WORKSPACE;

type WorkspaceAgentAssignmentFailure =
  | "missing"
  | "agent_mismatch"
  | "version_mismatch"
  | "disabled"
  | "ambiguous";

type WorkspaceAgentScope = {
  tenantId: string;
  workspaceId: string;
  agentKey: string;
  agentVersion?: string;
  userId?: string;
};

export type WorkspaceAgentAssignmentRecord = {
  id: string;
  tenantId: string;
  workspaceId: string;
  agentKey: string;
  agentVersion: string;
  enabled: boolean;
  signedByUserId: string | null;
  signedAt: Date | null;
  signatureRef: string | null;
};

export class WorkspaceAgentAssignmentError extends Error {
  constructor(
    message: string,
    readonly context: Record<string, never>,
    readonly reasonCode: WorkspaceAgentAssignmentReasonCode = AGENT_NOT_ENABLED_IN_WORKSPACE
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
    signedByUserId: string | null;
    signedAt: Date | null;
    signatureRef: string | null;
  }
): WorkspaceAgentAssignmentRecord {
  return assignment;
}

async function findAssignmentCandidates(
  client: PrismaClient,
  params: WorkspaceAgentScope,
  canonicalAgentKey: string,
  requestedVersion: string | null
) {
  const normalizedInput = normalizeAgentKey(canonicalAgentKey);
  const assignments = await client.workspaceAgentAssignment.findMany({
    where: {
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
  });
  const agentMatches = assignments.filter(
    assignment => normalizeAgentKey(assignment.agentKey) === normalizedInput
  );
  const exactMatches = requestedVersion
    ? agentMatches.filter(assignment => assignment.agentVersion === requestedVersion)
    : [];
  return { assignments, agentMatches, exactMatches };
}

async function resolveRequestedAgentVersion(
  client: PrismaClient,
  canonicalAgentKey: string,
  requestedVersion?: string
) {
  const explicitVersion = requestedVersion?.trim();
  if (explicitVersion) return explicitVersion;
  const metadata = await client.agentMetadata.findUnique({
    where: { agent: canonicalAgentKey },
    select: { version: true },
  });
  const persistedVersion = metadata?.version?.trim();
  if (persistedVersion) return persistedVersion;
  return hasCoreAgentProfile(canonicalAgentKey) ? "1.0.0" : null;
}

async function resolveAssignment(
  client: PrismaClient,
  params: WorkspaceAgentScope
) {
  const canonicalAgentKey = await resolveCanonicalAgentKey(client, params.agentKey);
  const requestedVersion = await resolveRequestedAgentVersion(
    client,
    canonicalAgentKey,
    params.agentVersion
  );
  const candidates = await findAssignmentCandidates(
    client,
    params,
    canonicalAgentKey,
    requestedVersion
  );
  let failure: WorkspaceAgentAssignmentFailure | null = null;
  if (candidates.exactMatches.length > 1) {
    failure = "ambiguous";
  } else if (candidates.exactMatches.length === 0) {
    failure = candidates.agentMatches.length > 0
      ? "version_mismatch"
      : candidates.assignments.length > 0
        ? "agent_mismatch"
        : "missing";
  } else if (!candidates.exactMatches[0]?.enabled) {
    failure = "disabled";
  }

  const assignment = failure === null ? candidates.exactMatches[0] : null;
  const diagnosticCandidates = candidates.exactMatches.length > 0
    ? candidates.exactMatches
    : candidates.agentMatches;

  return {
    assignment: assignment ? toRecord(assignment) : null,
    canonicalAgentKey,
    requestedVersion,
    failure,
    diagnosticCandidates,
  };
}

async function recordAssignmentRefusal(
  client: PrismaClient,
  params: WorkspaceAgentScope,
  resolved: Awaited<ReturnType<typeof resolveAssignment>>,
  failure: WorkspaceAgentAssignmentFailure
) {
  try {
    await recordGuardrailAudit({
      prisma: client,
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      eventType: "agent.assignment.required",
      severity: "warn",
      message: "Execution blocked because an exact enabled workspace agent assignment is required.",
      metadata: {
        reasonCode: AGENT_ASSIGNMENT_REQUIRED,
        failure,
        agentKey: resolved.canonicalAgentKey,
        requestedAgentVersion: resolved.requestedVersion,
        candidateCount: resolved.diagnosticCandidates.length,
        candidateIds: resolved.diagnosticCandidates.map(candidate => candidate.id),
        candidateVersions: resolved.diagnosticCandidates.map(candidate => candidate.agentVersion),
      },
    });
  } catch {
    // Audit unavailability must never turn a denial into authorization.
  }
}

export async function getActiveWorkspaceAgentAssignment(params: {
  prisma?: PrismaClient;
  tenantId: string;
  workspaceId: string;
  agentKey: string;
  agentVersion?: string;
}): Promise<WorkspaceAgentAssignmentRecord | null> {
  const client = resolveClient(params.prisma);
  const resolved = await resolveAssignment(client, params);
  return resolved.failure ? null : resolved.assignment;
}

export async function assertWorkspaceAgentEnabled(params: {
  prisma?: PrismaClient;
  tenantId: string;
  workspaceId: string;
  agentKey: string;
  agentVersion?: string;
  userId?: string;
}): Promise<WorkspaceAgentAssignmentRecord> {
  const client = resolveClient(params.prisma);
  const resolved = await resolveAssignment(client, params);
  if (!resolved.failure && resolved.assignment) return resolved.assignment;

  await recordAssignmentRefusal(client, params, resolved, resolved.failure ?? "missing");
  throw new WorkspaceAgentAssignmentError(
    "Agent execution requires an exact enabled workspace assignment.",
    {},
    AGENT_ASSIGNMENT_REQUIRED
  );
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
