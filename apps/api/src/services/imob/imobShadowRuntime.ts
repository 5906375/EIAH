import type { PrismaClient } from "@repo/db";

export const IMOB_SHADOW_AGENT_ID = "imob-shadow-runtime";
export const IMOB_SHADOW_EVENT_KEY = "imob.shadow.execution";

export type ImobShadowCapabilityId =
  | "lead.scoring"
  | "relationship.commercial_memory"
  | "reengagement.continuous"
  | "inventory.active_watch";

export type ImobShadowEntityType = "lead" | "case";

export type ImobShadowExecutionRecord = {
  capabilityId: ImobShadowCapabilityId;
  entityType: ImobShadowEntityType;
  entityId: string;
  trigger: string;
  snapshotVersion: string;
  signature: string;
  generatedAt: string;
};

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asStringList(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean)
    : [];
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function buildLeadShadowSignature(after: Record<string, unknown>) {
  const metadata = asObject(after.metadata);
  const discoverySignals = asObject(metadata?.discoverySignals);
  return stableStringify({
    goal: asString(after.goal),
    targetCity: asString(after.targetCity),
    budgetMaxCents: typeof after.budgetMaxCents === "number" ? after.budgetMaxCents : null,
    stage: asString(after.stage),
    temperature: asString(after.temperature),
    pendingItems: asStringList(after.pendingItems),
    discoverySignals: discoverySignals
      ? {
          urgency: asString(discoverySignals.urgency),
          painPoint: asString(discoverySignals.painPoint),
          motivation: asString(discoverySignals.motivation),
          budgetFlexibility: asString(discoverySignals.budgetFlexibility),
          decisionMaker: asString(discoverySignals.decisionMaker),
          timeline: asString(discoverySignals.timeline),
          pendingSignals: asStringList(discoverySignals.pendingSignals),
        }
      : null,
  });
}

function buildCaseShadowSignature(after: Record<string, unknown>) {
  return stableStringify({
    flow: asString(after.flow),
    stage: asString(after.stage),
    status: asString(after.status),
    ownerResponsible: asString(after.ownerResponsible),
    nextStep: asString(after.nextStep),
    blockers: asStringList(after.blockers),
    pendingItems: asStringList(after.pendingItems),
    leadId: asString(after.leadId),
    propertyId: asString(after.propertyId),
    ownerId: asString(after.ownerId),
  });
}

function hasRelevantLeadChange(before: Record<string, unknown> | null, after: Record<string, unknown>) {
  if (!before) return true;
  return buildLeadShadowSignature(before) !== buildLeadShadowSignature(after);
}

function hasRelevantCaseChange(before: Record<string, unknown> | null, after: Record<string, unknown>) {
  if (!before) return true;
  return buildCaseShadowSignature(before) !== buildCaseShadowSignature(after);
}

export function planLeadShadowExecutions(params: {
  leadId: string;
  before?: unknown;
  after: unknown;
  trigger: string;
  generatedAt?: string | null;
}) {
  const after = asObject(params.after);
  if (!after) return [];
  const before = asObject(params.before);
  if (!hasRelevantLeadChange(before, after)) return [];
  const generatedAt = params.generatedAt ?? new Date().toISOString();
  const signature = buildLeadShadowSignature(after);

  return [
    {
      capabilityId: "lead.scoring",
      entityType: "lead",
      entityId: params.leadId,
      trigger: params.trigger,
      snapshotVersion: "imob.lead_scoring.v1.1",
      signature,
      generatedAt,
    },
    {
      capabilityId: "relationship.commercial_memory",
      entityType: "lead",
      entityId: params.leadId,
      trigger: params.trigger,
      snapshotVersion: "imob.commercial_memory.v1.1",
      signature,
      generatedAt,
    },
  ] satisfies ImobShadowExecutionRecord[];
}

export function planCaseShadowExecutions(params: {
  caseId: string;
  before?: unknown;
  after: unknown;
  trigger: string;
  generatedAt?: string | null;
}) {
  const after = asObject(params.after);
  if (!after) return [];
  const before = asObject(params.before);
  if (!hasRelevantCaseChange(before, after)) return [];
  const generatedAt = params.generatedAt ?? new Date().toISOString();
  const signature = buildCaseShadowSignature(after);

  return [
    {
      capabilityId: "relationship.commercial_memory",
      entityType: "case",
      entityId: params.caseId,
      trigger: params.trigger,
      snapshotVersion: "imob.commercial_memory.v1.1",
      signature,
      generatedAt,
    },
    {
      capabilityId: "reengagement.continuous",
      entityType: "case",
      entityId: params.caseId,
      trigger: params.trigger,
      snapshotVersion: "imob.reengagement.continuous.v1",
      signature,
      generatedAt,
    },
    {
      capabilityId: "inventory.active_watch",
      entityType: "case",
      entityId: params.caseId,
      trigger: params.trigger,
      snapshotVersion: "imob.inventory_watch.v1",
      signature,
      generatedAt,
    },
  ] satisfies ImobShadowExecutionRecord[];
}

export async function recordImobShadowExecutions(params: {
  prisma: PrismaClient;
  tenantId: string;
  workspaceId: string;
  executions: ImobShadowExecutionRecord[];
}) {
  const existingRows = await params.prisma.memoryEvent.findMany({
    where: {
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      key: IMOB_SHADOW_EVENT_KEY,
    } as any,
    orderBy: { createdAt: "desc" },
    take: 200,
  } as any);

  const persisted: ImobShadowExecutionRecord[] = [];
  const skipped: ImobShadowExecutionRecord[] = [];

  for (const execution of params.executions) {
    const duplicate = existingRows.some((row: any) => {
      const metadata = asObject(row?.metadata);
      return (
        metadata?.capabilityId === execution.capabilityId
        && metadata?.entityType === execution.entityType
        && metadata?.entityId === execution.entityId
        && metadata?.signature === execution.signature
      );
    });

    if (duplicate) {
      skipped.push(execution);
      continue;
    }

    await params.prisma.memoryEvent.create({
      data: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        agentId: IMOB_SHADOW_AGENT_ID,
        runId: null,
        key: IMOB_SHADOW_EVENT_KEY,
        content: `Shadow recalculation for ${execution.capabilityId}`,
        metadata: {
          domain: "imob",
          capabilityId: execution.capabilityId,
          entityType: execution.entityType,
          entityId: execution.entityId,
          trigger: execution.trigger,
          snapshotVersion: execution.snapshotVersion,
          signature: execution.signature,
          generatedAt: execution.generatedAt,
        },
      },
    });
    persisted.push(execution);
  }

  return { persisted, skipped };
}
