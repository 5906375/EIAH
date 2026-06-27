import type { PrismaClient } from "@repo/db";
import { IMOB_REASON_CODE_CATALOG } from "../control/imobReasonCodeCatalog";
import { buildResponsibleActorAssignmentContract } from "../../../types/verticalResponsibleActorContract";
import { recordImobCrmAuditEvent } from "./imobCrmAudit";
import {
  planCaseShadowExecutions,
  planLeadShadowExecutions,
  recordImobShadowExecutions,
} from "../imobShadowRuntime";
import type {
  CaseInput,
  LeadInput,
  MetadataLike,
  OwnerInput,
  PropertyInput,
  PropertyLookupRecord,
  ResolvedTurnForCaseUpsert,
} from "./imobCrmTypes";

type Scope = {
  tenantId: string;
  workspaceId: string;
  userId?: string | null;
};

type DedupeMergeAudit = {
  entity: "owner" | "property";
  subjectId: string;
  matchedBy: string[];
  sourceFlow: string | null;
  dedupeKey: string | null;
};

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function formatPropertyLabel(item: { id: string; metadata?: unknown; propertyType?: string | null; address?: string | null }) {
  const metadata = asObject(item.metadata);
  const externalRef = typeof metadata?.externalPropertyRef === "string" && metadata.externalPropertyRef.trim()
    ? metadata.externalPropertyRef.trim()
    : null;
  if (externalRef) return `Imóvel ${externalRef}`;
  if (item.address) return item.address;
  if (item.propertyType) return `Imóvel ${item.propertyType}`;
  return `Imóvel ${item.id}`;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeText(value: unknown) {
  const text = asString(value);
  return text ? text.trim().toLowerCase() : null;
}

function normalizeComparableToken(value: unknown) {
  return normalizeText(value)?.replace(/\s+/g, " ") ?? null;
}

function buildResolvedTurnReplayKey(params: {
  flow: string | null;
  caseId?: string | null;
  threadId?: string | null;
  presentationDedupeKey?: unknown;
  ownerDraft?: Record<string, unknown> | null;
  propertyDraft?: Record<string, unknown> | null;
}) {
  const explicitKey = asString(params.presentationDedupeKey);
  if (explicitKey) return explicitKey;

  const scopeRef = asString(params.threadId) ?? asString(params.caseId);
  if (!params.flow || !scopeRef) return null;

  if (params.flow === "owner.create" || params.flow === "owner.update") {
    const ownerDraft = params.ownerDraft;
    if (!ownerDraft) return null;
    const ownerRef = [
      normalizeComparableToken(ownerDraft.ownerDocument),
      normalizeComparableToken(ownerDraft.ownerPhone),
      normalizeComparableToken(ownerDraft.ownerEmail),
      normalizeComparableToken(ownerDraft.ownerName),
    ].find(Boolean);
    return ownerRef ? `crm.${params.flow}:${scopeRef}:${ownerRef}` : null;
  }

  if (params.flow === "property.create") {
    const propertyDraft = params.propertyDraft;
    if (!propertyDraft) return null;
    const origin = readMarketScanOrigin(propertyDraft.origin);
    const addressKey = [normalizeComparableToken(propertyDraft.address), normalizeComparableToken(propertyDraft.city)]
      .filter(Boolean)
      .join(":");
    const propertyRef = asString(propertyDraft.propertyId)
      ?? (origin?.providerId && origin?.sourceId ? `${origin.providerId}:${origin.sourceId}` : null)
      ?? (addressKey || null);
    return propertyRef ? `crm.property.create:${scopeRef}:${propertyRef}` : null;
  }

  return null;
}

function readMarketScanOrigin(value: unknown) {
  const origin = asObject(value);
  if (!origin) return null;
  return {
    providerId: asString(origin.providerId),
    sourceId: asString(origin.sourceId),
    scanId: asString(origin.scanId),
  };
}

function propertyMatchesDraft(item: PropertyLookupRecord, draft: Record<string, unknown> | null | undefined) {
  if (!draft) return false;

  const metadata = asObject(item.metadata);
  const metadataRef = asString(metadata?.externalPropertyRef);
  const draftExternalRef = asString(draft.propertyId);
  if (draftExternalRef && metadataRef === draftExternalRef) return true;

  const itemOrigin = readMarketScanOrigin(metadata?.marketScanOrigin);
  const draftOrigin = readMarketScanOrigin(draft.origin);
  if (
    draftOrigin?.providerId
    && draftOrigin?.sourceId
    && itemOrigin?.providerId === draftOrigin.providerId
    && itemOrigin?.sourceId === draftOrigin.sourceId
  ) {
    return true;
  }

  const draftAddress = normalizeText(draft.address);
  const itemAddress = normalizeText(item.address);
  const draftCity = normalizeText(draft.city);
  const itemCity = normalizeText(item.city);
  if (draftAddress && itemAddress && draftAddress === itemAddress) {
    if (!draftCity || !itemCity || draftCity === itemCity) return true;
  }

  return false;
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
}

function resolveLeadEventType(params: {
  flow: string | null;
  outcome: string | null;
  leadStatus: string | null;
  nextAction: string | null;
  pendingFields: string[];
}) {
  if (params.flow !== "lead.qualify") return null;
  if (params.leadStatus === "qualified") return "lead_qualified";
  if (params.nextAction) return "lead_next_action_selected";
  if (params.pendingFields.length > 0) {
    return params.outcome === "created" ? "lead_draft_created" : "lead_missing_fields_detected";
  }
  if (params.outcome === "updated") return "lead_updated";
  return "lead_updated";
}

function mapOperationalCaseStatus(operationalStatus: string) {
  if (operationalStatus === "ready_for_review") return "ready_for_review";
  return "pending_data";
}

function isTerminalCaseState(params: { stage?: string | null; status?: string | null }) {
  const stage = normalizeText(params.stage);
  const status = normalizeText(params.status);
  return (
    stage === "closing"
    || stage === "settled"
    || status === "done"
    || status === "completed"
    || status === "success"
  );
}

function buildTerminalCaseEventRef(params: {
  caseId: string;
  flow: string;
  stage: string;
  status: string;
}) {
  return `case-terminal:${params.caseId}:${params.flow}:${params.stage}:${params.status}`;
}

function buildTerminalCaseEventSummary(params: {
  flow: string;
  stage: string;
  status: string;
}) {
  return `Case ${params.flow} reached terminal state (${params.stage}/${params.status})`;
}

function buildOwnerAssignmentEventRef(params: {
  caseId: string;
  ownerResponsible: string;
}) {
  const normalizedOwner = normalizeComparableToken(params.ownerResponsible)?.replace(/[^a-z0-9]+/g, "-") ?? "owner";
  return `case-owner-assigned:${params.caseId}:${normalizedOwner}`;
}

export class ImobCrmMutationService {
  constructor(private readonly prisma: PrismaClient) {}

  private async findCaseReplayEvent(scope: Scope, params: { caseId: string; replayKey: string }) {
    if (!this.prisma.imobCaseEvent?.findFirst) return null;
    return this.prisma.imobCaseEvent.findFirst({
      where: {
        caseId: params.caseId,
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
        evidenceRef: params.replayKey,
      } as any,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        payload: true,
      } as any,
    });
  }

  private async loadScopedCase(scope: Scope, caseId: string) {
    return this.prisma.imobCase.findFirst({
      where: { id: caseId, tenantId: scope.tenantId, workspaceId: scope.workspaceId },
      include: {
        owner: { select: { id: true, name: true } },
        property: { select: { id: true, propertyType: true, city: true, neighborhood: true } },
        lead: { select: { id: true, name: true } },
      },
    });
  }

  private async recordDedupeMergeAudit(scope: Scope, params: DedupeMergeAudit) {
    await recordImobCrmAuditEvent({
      prisma: this.prisma,
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      userId: scope.userId ?? null,
      subjectType: params.entity,
      subjectId: params.subjectId,
      action: "updated",
      summary: `${params.entity === "owner" ? "Owner" : "Property"} ${params.subjectId} merged by dedupe review`,
      metadata: {
        mergeKind: "dedupe_merge",
        matchedBy: params.matchedBy,
        sourceFlow: params.sourceFlow,
        dedupeKey: params.dedupeKey,
      },
    });
  }

  private async recordLeadShadow(scope: Scope, params: {
    leadId: string;
    before?: unknown;
    after: unknown;
    trigger: string;
  }) {
    const executions = planLeadShadowExecutions({
      leadId: params.leadId,
      before: params.before,
      after: params.after,
      trigger: params.trigger,
    });
    if (executions.length === 0) return;
    await recordImobShadowExecutions({
      prisma: this.prisma,
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      executions,
    });
  }

  private async recordCaseShadow(scope: Scope, params: {
    caseId: string;
    before?: unknown;
    after: unknown;
    trigger: string;
  }) {
    const executions = planCaseShadowExecutions({
      caseId: params.caseId,
      before: params.before,
      after: params.after,
      trigger: params.trigger,
    });
    if (executions.length === 0) return;
    await recordImobShadowExecutions({
      prisma: this.prisma,
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      executions,
    });
  }

  async createOwner(scope: Scope, input: OwnerInput) {
    const created = await this.prisma.imobOwner.create({
      data: {
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
        name: input.name,
        document: input.document ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        personType: input.personType ?? undefined,
        status: input.status ?? undefined,
        pendingItems: input.pendingItems ?? undefined,
        metadata: input.metadata as any,
      },
    });

    await recordImobCrmAuditEvent({
      prisma: this.prisma,
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      userId: scope.userId ?? null,
      subjectType: "owner",
      subjectId: created.id,
      action: "created",
      summary: `Owner ${created.name} created`,
      after: created,
    });

    return created;
  }

  async updateOwner(scope: Scope, ownerId: string, input: Partial<OwnerInput>) {
    const existing = await this.prisma.imobOwner.findFirst({
      where: { id: ownerId, tenantId: scope.tenantId, workspaceId: scope.workspaceId, status: { not: "archived" } },
      select: { id: true },
    });
    if (!existing) return null;

    const previous = await this.prisma.imobOwner.findFirst({ where: { id: existing.id } });
    const updated = await this.prisma.imobOwner.update({
      where: { id: existing.id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.document !== undefined ? { document: input.document } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.personType !== undefined && input.personType !== null ? { personType: input.personType } : {}),
        ...(input.status !== undefined && input.status !== null ? { status: input.status } : {}),
        ...(input.pendingItems !== undefined ? { pendingItems: input.pendingItems } : {}),
        ...(input.metadata !== undefined ? { metadata: input.metadata as any } : {}),
      },
    });

    await recordImobCrmAuditEvent({
      prisma: this.prisma,
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      userId: scope.userId ?? null,
      subjectType: "owner",
      subjectId: updated.id,
      action: "updated",
      summary: `Owner ${updated.name} updated`,
      before: previous,
      after: updated,
    });

    return updated;
  }

  async archiveOwner(scope: Scope, ownerId: string) {
    const existing = await this.prisma.imobOwner.findFirst({
      where: { id: ownerId, tenantId: scope.tenantId, workspaceId: scope.workspaceId, status: { not: "archived" } },
    });
    if (!existing) return { status: "not_found" as const };

    const activePropertiesCount = await this.prisma.imobProperty.count({
      where: { tenantId: scope.tenantId, workspaceId: scope.workspaceId, ownerId: existing.id, status: { not: "archived" } },
    });
    const activeCasesCount = await this.prisma.imobCase.count({
      where: { tenantId: scope.tenantId, workspaceId: scope.workspaceId, ownerId: existing.id },
    });
    if (activePropertiesCount > 0 || activeCasesCount > 0) {
      return { status: "blocked" as const, existing };
    }

    const metadata = (asObject(existing.metadata) ?? {}) as MetadataLike;
    const archived = await this.prisma.imobOwner.update({
      where: { id: existing.id },
      data: {
        status: "archived",
        metadata: {
          ...metadata,
          archivedAt: new Date().toISOString(),
          archivedByUserId: scope.userId ?? null,
        } as any,
      },
    });

    await recordImobCrmAuditEvent({
      prisma: this.prisma,
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      userId: scope.userId ?? null,
      subjectType: "owner",
      subjectId: archived.id,
      action: "deleted",
      summary: `Owner ${archived.name} archived`,
      before: existing,
      after: archived,
    });

    return { status: "archived" as const, data: archived };
  }

  async createProperty(scope: Scope, input: PropertyInput) {
    if (input.ownerId) {
      const owner = await this.prisma.imobOwner.findFirst({
        where: { id: input.ownerId, tenantId: scope.tenantId, workspaceId: scope.workspaceId },
        select: { id: true },
      });
      if (!owner) return { status: "owner_not_found" as const };
    }

    const created = await this.prisma.imobProperty.create({
      data: {
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
        ownerId: input.ownerId ?? null,
        propertyType: input.propertyType ?? null,
        goal: input.goal ?? null,
        address: input.address ?? null,
        city: input.city ?? null,
        neighborhood: input.neighborhood ?? null,
        bedrooms: input.bedrooms,
        bathrooms: input.bathrooms,
        areaM2: input.areaM2,
        garageSpots: input.garageSpots,
        askingPriceCents: input.askingPriceCents,
        description: input.description ?? null,
        status: input.status ?? undefined,
        pendingItems: input.pendingItems ?? undefined,
        metadata: input.metadata as any,
      },
      include: { owner: { select: { id: true, name: true } } },
    });

    await recordImobCrmAuditEvent({
      prisma: this.prisma,
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      userId: scope.userId ?? null,
      subjectType: "property",
      subjectId: created.id,
      action: "created",
      summary: `Property ${formatPropertyLabel(created)} created`,
      after: created,
    });

    await this.recordCaseShadow(scope, {
      caseId: created.id,
      after: created,
      trigger: "case.created",
    });

    return { status: "created" as const, data: created };
  }

  async updateProperty(scope: Scope, propertyId: string, input: Partial<PropertyInput>) {
    const existing = await this.prisma.imobProperty.findFirst({
      where: { id: propertyId, tenantId: scope.tenantId, workspaceId: scope.workspaceId, status: { not: "archived" } },
      select: { id: true },
    });
    if (!existing) return { status: "not_found" as const };

    if (input.ownerId) {
      const owner = await this.prisma.imobOwner.findFirst({
        where: { id: input.ownerId, tenantId: scope.tenantId, workspaceId: scope.workspaceId },
        select: { id: true },
      });
      if (!owner) return { status: "owner_not_found" as const };
    }

    const previous = await this.prisma.imobProperty.findFirst({ where: { id: existing.id }, include: { owner: { select: { id: true, name: true } } } });
    const updated = await this.prisma.imobProperty.update({
      where: { id: existing.id },
      data: {
        ...(input.ownerId !== undefined ? { owner: input.ownerId ? { connect: { id: input.ownerId } } : { disconnect: true } } : {}),
        ...(input.propertyType !== undefined ? { propertyType: input.propertyType } : {}),
        ...(input.goal !== undefined ? { goal: input.goal } : {}),
        ...(input.address !== undefined ? { address: input.address } : {}),
        ...(input.city !== undefined ? { city: input.city } : {}),
        ...(input.neighborhood !== undefined ? { neighborhood: input.neighborhood } : {}),
        ...(input.bedrooms !== undefined ? { bedrooms: input.bedrooms } : {}),
        ...(input.bathrooms !== undefined ? { bathrooms: input.bathrooms } : {}),
        ...(input.areaM2 !== undefined ? { areaM2: input.areaM2 } : {}),
        ...(input.garageSpots !== undefined ? { garageSpots: input.garageSpots } : {}),
        ...(input.askingPriceCents !== undefined ? { askingPriceCents: input.askingPriceCents } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.status !== undefined && input.status !== null ? { status: input.status } : {}),
        ...(input.pendingItems !== undefined ? { pendingItems: input.pendingItems } : {}),
        ...(input.metadata !== undefined ? { metadata: input.metadata as any } : {}),
      },
      include: { owner: { select: { id: true, name: true } } },
    });

    await recordImobCrmAuditEvent({
      prisma: this.prisma,
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      userId: scope.userId ?? null,
      subjectType: "property",
      subjectId: updated.id,
      action: "updated",
      summary: `Property ${formatPropertyLabel(updated)} updated`,
      before: previous,
      after: updated,
    });

    return { status: "updated" as const, data: updated };
  }

  async archiveProperty(scope: Scope, propertyId: string) {
    const existing = await this.prisma.imobProperty.findFirst({
      where: { id: propertyId, tenantId: scope.tenantId, workspaceId: scope.workspaceId, status: { not: "archived" } },
      include: { owner: { select: { id: true, name: true } } },
    });
    if (!existing) return { status: "not_found" as const };

    const activeCasesCount = await this.prisma.imobCase.count({
      where: { tenantId: scope.tenantId, workspaceId: scope.workspaceId, propertyId: existing.id },
    });
    if (activeCasesCount > 0) return { status: "blocked" as const, existing };

    const metadata = (asObject(existing.metadata) ?? {}) as MetadataLike;
    const archived = await this.prisma.imobProperty.update({
      where: { id: existing.id },
      data: {
        status: "archived",
        metadata: {
          ...metadata,
          archivedAt: new Date().toISOString(),
          archivedByUserId: scope.userId ?? null,
        } as any,
      },
      include: { owner: { select: { id: true, name: true } } },
    });

    await recordImobCrmAuditEvent({
      prisma: this.prisma,
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      userId: scope.userId ?? null,
      subjectType: "property",
      subjectId: archived.id,
      action: "deleted",
      summary: `Property ${formatPropertyLabel(archived)} archived`,
      before: existing,
      after: archived,
    });

    return { status: "archived" as const, data: archived };
  }

  async createLead(scope: Scope, input: LeadInput) {
    const created = await this.prisma.imobLead.create({
      data: {
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
        name: input.name,
        document: input.document ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        goal: input.goal ?? null,
        targetCity: input.targetCity ?? null,
        targetNeighborhood: input.targetNeighborhood ?? null,
        budgetMaxCents: input.budgetMaxCents,
        stage: input.stage ?? undefined,
        temperature: input.temperature ?? undefined,
        pendingItems: input.pendingItems ?? undefined,
        metadata: input.metadata as any,
      },
    });

    await recordImobCrmAuditEvent({
      prisma: this.prisma,
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      userId: scope.userId ?? null,
      subjectType: "lead",
      subjectId: created.id,
      action: "created",
      summary: `Lead ${created.name} created`,
      after: created,
    });

    await this.recordLeadShadow(scope, {
      leadId: created.id,
      after: created,
      trigger: "lead.created",
    });

    return created;
  }

  async updateLead(scope: Scope, leadId: string, input: Partial<LeadInput>) {
    const existing = await this.prisma.imobLead.findFirst({
      where: { id: leadId, tenantId: scope.tenantId, workspaceId: scope.workspaceId },
      select: { id: true },
    });
    if (!existing) return null;

    const previous = await this.prisma.imobLead.findFirst({ where: { id: existing.id } });
    const updated = await this.prisma.imobLead.update({
      where: { id: existing.id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.document !== undefined ? { document: input.document } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.goal !== undefined ? { goal: input.goal } : {}),
        ...(input.targetCity !== undefined ? { targetCity: input.targetCity } : {}),
        ...(input.targetNeighborhood !== undefined ? { targetNeighborhood: input.targetNeighborhood } : {}),
        ...(input.budgetMaxCents !== undefined ? { budgetMaxCents: input.budgetMaxCents } : {}),
        ...(input.stage !== undefined && input.stage !== null ? { stage: input.stage } : {}),
        ...(input.temperature !== undefined && input.temperature !== null ? { temperature: input.temperature } : {}),
        ...(input.pendingItems !== undefined ? { pendingItems: input.pendingItems } : {}),
        ...(input.metadata !== undefined ? { metadata: input.metadata as any } : {}),
      },
    });

    await recordImobCrmAuditEvent({
      prisma: this.prisma,
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      userId: scope.userId ?? null,
      subjectType: "lead",
      subjectId: updated.id,
      action: "updated",
      summary: `Lead ${updated.name} updated`,
      before: previous,
      after: updated,
    });

    await this.recordLeadShadow(scope, {
      leadId: updated.id,
      before: previous,
      after: updated,
      trigger: "lead.updated",
    });

    return updated;
  }

  async createCase(scope: Scope, input: CaseInput) {
    const relation = await this.validateCaseRelations(scope, input);
    if (relation.status !== "ok") return relation;

    const created = await this.prisma.$transaction(async (tx) => {
      const item = await tx.imobCase.create({
        data: {
          tenantId: scope.tenantId,
          workspaceId: scope.workspaceId,
          threadId: input.threadId ?? null,
          flow: input.flow,
          stage: input.stage,
          status: input.status,
          ownerResponsible: input.ownerResponsible ?? null,
          nextStep: input.nextStep ?? null,
          blockers: input.blockers ?? undefined,
          pendingItems: input.pendingItems ?? undefined,
          ownerId: input.ownerId ?? null,
          propertyId: input.propertyId ?? null,
          leadId: input.leadId ?? null,
          externalDealId: input.externalDealId ?? null,
          metadata: input.metadata as any,
        },
        include: {
          owner: { select: { id: true, name: true } },
          property: { select: { id: true, propertyType: true, city: true, neighborhood: true } },
          lead: { select: { id: true, name: true } },
        },
      });

      await tx.imobCaseEvent.create({
        data: {
          imobCase: { connect: { id: item.id } },
          tenant: { connect: { id: scope.tenantId } },
          workspace: { connect: { id: scope.workspaceId } },
          ...(input.initialEvent?.runId ? { run: { connect: { id: input.initialEvent.runId } } } : {}),
          type: input.initialEvent?.type ?? "case.created",
          actorType: input.initialEvent?.actorType ?? "system",
          actorRef: input.initialEvent?.actorRef ?? null,
          summary: input.initialEvent?.summary ?? `Case ${item.flow} created`,
          evidenceRef: input.initialEvent?.evidenceRef ?? null,
          payload: (input.initialEvent?.payload as any) ?? { flow: item.flow, stage: item.stage, status: item.status },
        },
      });

      return item;
    });

    await recordImobCrmAuditEvent({
      prisma: this.prisma,
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      userId: scope.userId ?? null,
      subjectType: "case",
      subjectId: created.id,
      action: "created",
      summary: `Case ${created.flow} created`,
      after: created,
    });

    await this.recordCaseShadow(scope, {
      caseId: created.id,
      after: created,
      trigger: "case.created",
    });

    return { status: "created" as const, data: created };
  }

  async updateCase(scope: Scope, caseId: string, input: Partial<CaseInput>) {
    const existing = await this.prisma.imobCase.findFirst({
      where: { id: caseId, tenantId: scope.tenantId, workspaceId: scope.workspaceId },
      select: { id: true, flow: true, stage: true, status: true, ownerResponsible: true },
    });
    if (!existing) return { status: "not_found" as const };

    const relation = await this.validateCaseRelations(scope, input);
    if (relation.status !== "ok") return relation;

    const previous = await this.prisma.imobCase.findFirst({
      where: { id: existing.id },
      include: {
        owner: { select: { id: true, name: true } },
        property: { select: { id: true, propertyType: true, city: true, neighborhood: true } },
        lead: { select: { id: true, name: true } },
      },
    });

    const nextFlow = input.flow ?? existing.flow;
    const nextStage = input.stage ?? existing.stage;
    const nextStatus = input.status ?? existing.status;
    const resolvedOwnerResponsible = input.ownerResponsible ?? existing.ownerResponsible ?? null;
    const shouldCreateTerminalEvent =
      !isTerminalCaseState({ stage: existing.stage, status: existing.status })
      && isTerminalCaseState({ stage: nextStage, status: nextStatus });
    if (shouldCreateTerminalEvent && !asString(resolvedOwnerResponsible)) {
      return {
        status: "responsible_required" as const,
        reasonCode: "CASE_RESPONSIBLE_REQUIRED" as const,
        nextAction: IMOB_REASON_CODE_CATALOG.CASE_RESPONSIBLE_REQUIRED.nextAction ?? "ASSIGN_RESPONSIBLE_MANUALLY",
        context: {
          caseId: existing.id,
          flow: nextFlow,
          stage: nextStage,
          status: nextStatus,
        },
      };
    }
    const terminalEventRef = shouldCreateTerminalEvent
      ? buildTerminalCaseEventRef({
          caseId: existing.id,
          flow: nextFlow,
          stage: nextStage,
          status: nextStatus,
        })
      : null;
    const existingTerminalEvent = terminalEventRef
      ? await this.prisma.imobCaseEvent.findFirst({
          where: {
            caseId: existing.id,
            tenantId: scope.tenantId,
            workspaceId: scope.workspaceId,
            evidenceRef: terminalEventRef,
          } as any,
          select: { id: true } as any,
        })
      : null;

    const updated = await this.prisma.$transaction(async (tx) => {
      const item = await tx.imobCase.update({
        where: { id: existing.id },
        data: {
          ...(input.threadId !== undefined ? { threadId: input.threadId } : {}),
          ...(input.flow !== undefined && input.flow !== null ? { flow: input.flow } : {}),
          ...(input.stage !== undefined && input.stage !== null ? { stage: input.stage } : {}),
          ...(input.status !== undefined && input.status !== null ? { status: input.status } : {}),
          ...(resolvedOwnerResponsible ? { ownerResponsible: resolvedOwnerResponsible } : {}),
          ...(input.nextStep !== undefined ? { nextStep: input.nextStep } : {}),
          ...(input.blockers !== undefined ? { blockers: input.blockers } : {}),
          ...(input.pendingItems !== undefined ? { pendingItems: input.pendingItems } : {}),
          ...(input.ownerId !== undefined ? { owner: input.ownerId ? { connect: { id: input.ownerId } } : { disconnect: true } } : {}),
          ...(input.propertyId !== undefined ? { property: input.propertyId ? { connect: { id: input.propertyId } } : { disconnect: true } } : {}),
          ...(input.leadId !== undefined ? { lead: input.leadId ? { connect: { id: input.leadId } } : { disconnect: true } } : {}),
          ...(input.externalDealId !== undefined ? { externalDealId: input.externalDealId } : {}),
          ...(input.metadata !== undefined ? { metadata: input.metadata as any } : {}),
        },
        include: {
          owner: { select: { id: true, name: true } },
          property: { select: { id: true, propertyType: true, city: true, neighborhood: true } },
          lead: { select: { id: true, name: true } },
        },
      });

      await tx.imobCaseEvent.create({
        data: {
          imobCase: { connect: { id: item.id } },
          tenant: { connect: { id: scope.tenantId } },
          workspace: { connect: { id: scope.workspaceId } },
          ...(input.eventRunId ? { run: { connect: { id: input.eventRunId } } } : {}),
          type: input.eventType ?? "case.updated",
          actorType: input.eventActorType ?? "system",
          actorRef: input.eventActorRef ?? null,
          summary: input.eventSummary ?? `Case ${item.flow} updated`,
          evidenceRef: input.eventEvidenceRef ?? null,
          payload: (input.eventPayload as any) ?? { flow: item.flow, stage: item.stage, status: item.status },
        },
      });

      if (shouldCreateTerminalEvent && terminalEventRef && !existingTerminalEvent) {
        await tx.imobCaseEvent.create({
          data: {
            imobCase: { connect: { id: item.id } },
            tenant: { connect: { id: scope.tenantId } },
            workspace: { connect: { id: scope.workspaceId } },
            ...(input.eventRunId ? { run: { connect: { id: input.eventRunId } } } : {}),
            type: "case.completed",
            actorType: input.eventActorType ?? "system",
            actorRef: input.eventActorRef ?? null,
            summary: buildTerminalCaseEventSummary({
              flow: item.flow,
              stage: item.stage,
              status: item.status,
            }),
            evidenceRef: terminalEventRef,
            payload: {
              flow: item.flow,
              stage: item.stage,
              status: item.status,
              terminalSource: "mutation.update_case",
            } as any,
          },
        });
      }

      return item;
    });

    await recordImobCrmAuditEvent({
      prisma: this.prisma,
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      userId: scope.userId ?? null,
      subjectType: "case",
      subjectId: updated.id,
      action: "updated",
      summary: `Case ${updated.flow} updated`,
      before: existing,
      after: updated,
    });

    await this.recordCaseShadow(scope, {
      caseId: updated.id,
      before: previous,
      after: updated,
      trigger: "case.updated",
    });

    return { status: "updated" as const, data: updated, previous: existing };
  }

  async assignOwnerToCase(scope: Scope, caseId: string, input: {
    ownerResponsible: string;
    eventRunId?: string | null;
    eventEvidenceRef?: string | null;
    eventActorType?: string | null;
    eventActorRef?: string | null;
    eventPayload?: unknown;
  }) {
    const existing = await this.prisma.imobCase.findFirst({
      where: { id: caseId, tenantId: scope.tenantId, workspaceId: scope.workspaceId },
      select: { id: true, flow: true, stage: true, status: true, ownerResponsible: true },
    });
    if (!existing) return { status: "not_found" as const };

    const nextOwnerResponsible = asString(input.ownerResponsible);
    if (!nextOwnerResponsible) {
      return {
        status: "assignment_forbidden" as const,
        reasonCode: "MEMBER_NOT_ELIGIBLE_AS_RESPONSIBLE" as const,
        nextAction: IMOB_REASON_CODE_CATALOG.MEMBER_NOT_ELIGIBLE_AS_RESPONSIBLE.nextAction ?? null,
        context: { caseId: existing.id, ownerResponsible: input.ownerResponsible ?? null },
      };
    }

    if (asString(existing.ownerResponsible) && existing.ownerResponsible !== nextOwnerResponsible) {
      return {
        status: "assignment_forbidden" as const,
        reasonCode: "CASE_OWNER_ASSIGNMENT_FORBIDDEN" as const,
        nextAction: IMOB_REASON_CODE_CATALOG.CASE_OWNER_ASSIGNMENT_FORBIDDEN.nextAction ?? null,
        context: {
          caseId: existing.id,
          currentOwnerResponsible: existing.ownerResponsible,
          attemptedOwnerResponsible: nextOwnerResponsible,
          flow: existing.flow,
          stage: existing.stage,
          status: existing.status,
        },
      };
    }

    const previous = await this.prisma.imobCase.findFirst({
      where: { id: existing.id },
      include: {
        owner: { select: { id: true, name: true } },
        property: { select: { id: true, propertyType: true, city: true, neighborhood: true } },
        lead: { select: { id: true, name: true } },
      },
    });

    const assignmentEventRef = input.eventEvidenceRef ?? buildOwnerAssignmentEventRef({
      caseId: existing.id,
      ownerResponsible: nextOwnerResponsible,
    });

    const updated = await this.prisma.$transaction(async (tx) => {
      const existingAssignmentEvent = await tx.imobCaseEvent.findFirst({
        where: {
          caseId: existing.id,
          tenantId: scope.tenantId,
          workspaceId: scope.workspaceId,
          evidenceRef: assignmentEventRef,
        } as any,
        select: { id: true } as any,
      });

      const item = await tx.imobCase.update({
        where: { id: existing.id },
        data: {
          ownerResponsible: nextOwnerResponsible,
        },
        include: {
          owner: { select: { id: true, name: true } },
          property: { select: { id: true, propertyType: true, city: true, neighborhood: true } },
          lead: { select: { id: true, name: true } },
        },
      });

      if (!existingAssignmentEvent) {
        await tx.imobCaseEvent.create({
          data: {
            imobCase: { connect: { id: item.id } },
            tenant: { connect: { id: scope.tenantId } },
            workspace: { connect: { id: scope.workspaceId } },
            ...(input.eventRunId ? { run: { connect: { id: input.eventRunId } } } : {}),
            type: "owner_assigned",
            actorType: input.eventActorType ?? "user",
            actorRef: input.eventActorRef ?? scope.userId ?? null,
            summary: `Responsible owner assigned manually: ${nextOwnerResponsible}`,
            evidenceRef: assignmentEventRef,
            payload: {
              previousOwnerResponsible: existing.ownerResponsible ?? null,
              ownerResponsible: nextOwnerResponsible,
              assignmentSource: "manual",
              ...(asObject(input.eventPayload) ?? {}),
            } as any,
          },
        });
      }

      return item;
    });

    await recordImobCrmAuditEvent({
      prisma: this.prisma,
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      userId: scope.userId ?? null,
      subjectType: "case",
      subjectId: updated.id,
      action: "updated",
      summary: `Case ${updated.flow} assigned to ${nextOwnerResponsible}`,
      before: previous,
      after: updated,
    });

    await this.recordCaseShadow(scope, {
      caseId: updated.id,
      before: previous,
      after: updated,
      trigger: "case.owner_assigned",
    });

    return { status: "assigned" as const, data: updated };
  }

  async assignResponsibleActor(scope: Scope, caseId: string, input: {
    ownerResponsible: string;
    responsibleUserId?: string | null;
    responsibleMemberId?: string | null;
    eventRunId?: string | null;
    eventEvidenceRef?: string | null;
    eventActorType?: string | null;
    eventActorRef?: string | null;
    eventPayload?: unknown;
  }) {
    try {
      buildResponsibleActorAssignmentContract({
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
        verticalKey: "IMOB",
        entityType: "imob.case",
        entityId: caseId,
        entitlementStatus: "active",
        ...(asString(input.responsibleUserId) ? { responsibleUserId: asString(input.responsibleUserId) } : {}),
        ...(asString(input.responsibleMemberId) ? { responsibleMemberId: asString(input.responsibleMemberId) } : {}),
        ...(!asString(input.responsibleUserId) && !asString(input.responsibleMemberId) && scope.userId
          ? { responsibleUserId: scope.userId }
          : {}),
      });
    } catch (error) {
      const details = error instanceof Error ? error.message : "Responsible actor contract validation failed";
      return {
        status: "contract_invalid" as const,
        reasonCode: "RESPONSIBLE_ACTOR_CONTRACT_INVALID" as const,
        nextAction: IMOB_REASON_CODE_CATALOG.RESPONSIBLE_ACTOR_CONTRACT_INVALID.nextAction ?? null,
        context: {
          caseId,
          tenantId: scope.tenantId,
          workspaceId: scope.workspaceId,
          responsibleUserId: asString(input.responsibleUserId) ?? scope.userId ?? null,
          responsibleMemberId: asString(input.responsibleMemberId) ?? null,
          details,
        },
      };
    }

    return this.assignOwnerToCase(scope, caseId, input);
  }

  async upsertCaseFromResolvedTurn(scope: Scope, params: {
    caseId?: string | null;
    threadId?: string | null;
    threadLabel?: string | null;
    resolved: ResolvedTurnForCaseUpsert;
  }) {
    const operational = params.resolved?.conversationState?.operational;
    const shouldPersistConsultiveMarketScan = params.resolved?.mode === "consult"
      && operational?.flow === "property.market_scan";
    if (!operational || (params.resolved?.mode !== "execute" && !shouldPersistConsultiveMarketScan)) return null;

    const nowIso = new Date().toISOString();
    const pendingItems = asStringList(params.resolved?.presentation?.pendingFieldLabels).length > 0
      ? asStringList(params.resolved.presentation.pendingFieldLabels)
      : asStringList(operational.pendingFields);
    const blocker = asString(params.resolved?.presentation?.blocker);
    const blockers = blocker ? [blocker] : [];

    const scopedCase = params.caseId
      ? await this.prisma.imobCase.findFirst({
          where: { id: params.caseId, tenantId: scope.tenantId, workspaceId: scope.workspaceId },
          select: { id: true, leadId: true, ownerId: true, propertyId: true },
        })
      : params.threadId
        ? await this.prisma.imobCase.findFirst({
            where: { threadId: params.threadId, tenantId: scope.tenantId, workspaceId: scope.workspaceId },
            orderBy: { updatedAt: "desc" },
            select: { id: true, leadId: true, ownerId: true, propertyId: true },
          })
        : null;

    let persistedLeadId: string | null = scopedCase?.leadId ?? null;
    let persistedOwnerId: string | null = scopedCase?.ownerId ?? null;
    let persistedPropertyId: string | null = scopedCase?.propertyId ?? null;
    const dedupeMerges: DedupeMergeAudit[] = [];
    const ownerDraft = asObject(operational.ownerDraft);
    const propertyDraft = asObject(operational.propertyDraft);
    const leadDraft = asObject(operational.leadDraft);
    const proposalDraft = asObject(operational.proposalDraft);
    const visitDraft = asObject(operational.visitDraft);
    const contractDraft = operational.contractDraft;
    const rulesDraft = operational.rulesDraft;
    const commissionDraft = operational.commissionDraft;
    const replayKey = buildResolvedTurnReplayKey({
      flow: operational.flow,
      caseId: scopedCase?.id ?? params.caseId ?? null,
      threadId: params.threadId ?? null,
      presentationDedupeKey: params.resolved?.presentation?.dedupeKey,
      ownerDraft,
      propertyDraft,
    });

    if (scopedCase?.id && replayKey) {
      const existingReplay = await this.findCaseReplayEvent(scope, {
        caseId: scopedCase.id,
        replayKey,
      });
      if (existingReplay) {
        const replayedCase = await this.loadScopedCase(scope, scopedCase.id);
        if (replayedCase) {
          return {
            caseId: replayedCase.id,
            flow: replayedCase.flow,
            stage: replayedCase.stage,
            status: replayedCase.status,
            ownerResponsible: replayedCase.ownerResponsible ?? null,
            nextStep: replayedCase.nextStep ?? null,
            blocker: Array.isArray(replayedCase.blockers) && replayedCase.blockers.length > 0
              ? asString(replayedCase.blockers[0])
              : null,
            pendingItems: Array.isArray(replayedCase.pendingItems) ? replayedCase.pendingItems : [],
            threadId: replayedCase.threadId ?? params.threadId ?? null,
            updatedAt: replayedCase.updatedAt instanceof Date ? replayedCase.updatedAt.toISOString() : nowIso,
            blockers: Array.isArray(replayedCase.blockers) ? replayedCase.blockers : [],
            lead: replayedCase.lead ?? null,
            owner: replayedCase.owner ?? null,
            property: replayedCase.property ?? null,
          };
        }
      }
    }

    const lookupLeadDraft = async (draft: Record<string, unknown> | null | undefined) => {
      if (!draft) return null;
      const or = [
        draft.leadPhone ? { phone: draft.leadPhone } : null,
        draft.leadEmail ? { email: draft.leadEmail } : null,
        draft.leadName ? { name: draft.leadName } : null,
      ].filter(Boolean);
      if (or.length === 0) return null;
      const existing = await this.prisma.imobLead.findFirst({
        where: { tenantId: scope.tenantId, workspaceId: scope.workspaceId, OR: or } as any,
        select: { id: true },
        orderBy: { updatedAt: "desc" },
      });
      return existing?.id ?? null;
    };

    const upsertLeadDraft = async (draft: Record<string, unknown> | null | undefined, mode: "upsert" | "lookup_only") => {
      if (!draft) return null;
      const existingId = await lookupLeadDraft(draft);
      if (mode === "lookup_only") return existingId;

      const budgetMax = typeof draft.budgetMax === "number" ? draft.budgetMax : Number(draft.budgetMax);
      const currentMetadata = existingId
        ? asObject((await this.prisma.imobLead.findFirst({
            where: { id: existingId, tenantId: scope.tenantId, workspaceId: scope.workspaceId },
            select: { metadata: true },
          }))?.metadata) ?? {}
        : {};
      const input: LeadInput = {
        name: asString(draft.leadName) ?? "Lead sem nome",
        email: asString(draft.leadEmail),
        phone: asString(draft.leadPhone),
        goal: asString(draft.desiredGoal),
        targetCity: asString(draft.desiredCity),
        budgetMaxCents: Number.isFinite(budgetMax) ? Math.round(budgetMax * 100) : null,
        stage: operational.status === "ready_for_review" ? "qualified" : "new",
        temperature: operational.status === "ready_for_review" ? "warm" : "cold",
        pendingItems: pendingItems.filter((item) => !(item === "faixa de orçamento" && Number.isFinite(budgetMax))).length > 0
          ? pendingItems.filter((item) => !(item === "faixa de orçamento" && Number.isFinite(budgetMax)))
          : undefined,
        metadata: {
          ...currentMetadata,
          source: "imob-chat",
          flow: operational.flow,
          dedupeKey: params.resolved?.presentation?.dedupeKey ?? null,
          discoverySignals: asObject(draft.discoverySignals) ?? null,
        },
      };
      const persisted = existingId
        ? await this.updateLead(scope, existingId, input)
        : await this.createLead(scope, input);
      return persisted?.id ?? null;
    };

    const lookupOwnerDraft = async (draft: Record<string, unknown> | null | undefined) => {
      if (!draft) return null;
      const or = [
        draft.ownerDocument ? { document: draft.ownerDocument } : null,
        draft.ownerPhone ? { phone: draft.ownerPhone } : null,
        draft.ownerEmail ? { email: draft.ownerEmail } : null,
        draft.ownerName ? { name: draft.ownerName } : null,
      ].filter(Boolean);
      if (or.length === 0) return null;
      const existing = await this.prisma.imobOwner.findFirst({
        where: { tenantId: scope.tenantId, workspaceId: scope.workspaceId, status: { not: "archived" }, OR: or } as any,
        select: { id: true },
        orderBy: { updatedAt: "desc" },
      });
      return existing?.id ?? null;
    };

    const upsertOwnerDraft = async (draft: Record<string, unknown> | null | undefined, mode: "upsert" | "lookup_only") => {
      if (!draft) return null;
      const matchedBy = [
        draft.ownerDocument ? "document" : null,
        draft.ownerPhone ? "phone" : null,
        draft.ownerEmail ? "email" : null,
        draft.ownerName ? "name" : null,
      ].filter((item): item is string => Boolean(item));
      const existingId = await lookupOwnerDraft(draft);
      if (mode === "lookup_only") return existingId;

      const input: OwnerInput = {
        name: asString(draft.ownerName) ?? "Proprietário sem nome",
        document: asString(draft.ownerDocument),
        email: asString(draft.ownerEmail),
        phone: asString(draft.ownerPhone),
        status: operational.status === "ready_for_review" ? "qualified" : "pending_data",
        pendingItems: pendingItems.length > 0 ? pendingItems : undefined,
        metadata: {
          source: "imob-chat",
          flow: operational.flow,
          dedupeKey: params.resolved?.presentation?.dedupeKey ?? null,
        },
      };
      const persisted = existingId
        ? await this.updateOwner(scope, existingId, input)
        : await this.createOwner(scope, input);
      if (existingId && persisted?.id) {
        dedupeMerges.push({
          entity: "owner",
          subjectId: persisted.id,
          matchedBy,
          sourceFlow: operational.flow ?? null,
          dedupeKey: asString(params.resolved?.presentation?.dedupeKey),
        });
      }
      return persisted?.id ?? null;
    };

    const lookupPropertyDraft = async (draft: Record<string, unknown> | null | undefined) => {
      if (!draft) return null;
      const externalPropertyRef = draft.propertyId ?? null;
      const recentProperties = await this.prisma.imobProperty.findMany({
        where: { tenantId: scope.tenantId, workspaceId: scope.workspaceId, status: { not: "archived" } },
        orderBy: { updatedAt: "desc" },
        take: 200,
        select: { id: true, address: true, city: true, goal: true, propertyType: true, metadata: true },
      });
      return recentProperties.find((item: PropertyLookupRecord) => propertyMatchesDraft(item, draft))?.id ?? null;
    };

    const upsertPropertyDraft = async (draft: Record<string, unknown> | null | undefined, mode: "upsert" | "lookup_only") => {
      if (!draft) return null;
      const externalPropertyRef = draft.propertyId ?? null;
      const matchedBy = [
        asString(draft.propertyId) ? "externalPropertyRef" : null,
        asObject(draft.origin) ? "marketScanOrigin" : null,
        asString(draft.address) ? "address" : null,
        asString(draft.city) ? "city" : null,
      ].filter((item): item is string => Boolean(item));
      const existingId = await lookupPropertyDraft(draft);
      if (mode === "lookup_only") return existingId;
      const currentMetadata = existingId
        ? asObject((await this.prisma.imobProperty.findFirst({
            where: { id: existingId, tenantId: scope.tenantId, workspaceId: scope.workspaceId },
            select: { metadata: true },
          }))?.metadata) ?? {}
        : {};

      const input: PropertyInput = {
        ownerId: persistedOwnerId ?? null,
        propertyType: asString(draft.propertyType),
        goal: asString(draft.goal),
        city: asString(draft.city),
        neighborhood: asString(draft.neighborhood),
        bedrooms: typeof draft.bedrooms === "number" ? draft.bedrooms : null,
        bathrooms: typeof draft.bathrooms === "number" ? draft.bathrooms : null,
        address: asString(draft.address),
        status: operational.status === "ready_for_review" ? "ready_for_review" : "pending_data",
        pendingItems: pendingItems.length > 0 ? pendingItems : undefined,
        metadata: {
          ...currentMetadata,
          source: "imob-chat",
          flow: operational.flow,
          externalPropertyRef,
          marketScanOrigin: asObject(draft.origin) ?? null,
          dedupeKey: params.resolved?.presentation?.dedupeKey ?? null,
        },
      };
      const persisted = existingId
        ? await this.updateProperty(scope, existingId, input)
        : await this.createProperty(scope, input);
      if (existingId && persisted.status === "updated") {
        dedupeMerges.push({
          entity: "property",
          subjectId: persisted.data.id,
          matchedBy,
          sourceFlow: operational.flow ?? null,
          dedupeKey: asString(params.resolved?.presentation?.dedupeKey),
        });
      }
      return persisted.status === "updated" || persisted.status === "created" ? persisted.data.id : null;
    };

    if (operational.flow === "owner.create" && ownerDraft) {
      persistedOwnerId = await upsertOwnerDraft(ownerDraft, "upsert");
    } else if (operational.flow === "property.create" && propertyDraft) {
      persistedPropertyId = await upsertPropertyDraft(propertyDraft, "upsert");
    } else if (operational.flow === "lead.qualify" && leadDraft) {
      persistedLeadId = await upsertLeadDraft(leadDraft, "upsert");
    } else if (operational.flow === "proposal.create" && proposalDraft) {
      persistedLeadId = await upsertLeadDraft({
        leadName: proposalDraft.buyerName,
        leadEmail: proposalDraft.buyerEmail,
        leadPhone: proposalDraft.buyerPhone,
        desiredGoal: proposalDraft.contractType === "rent" ? "locacao" : proposalDraft.contractType === "sale" ? "venda" : null,
        desiredCity: null,
        budgetMax: proposalDraft.offerAmount,
      }, "lookup_only") ?? persistedLeadId;
    } else if (operational.flow === "visit.schedule" && visitDraft) {
      persistedLeadId = await upsertLeadDraft({
        leadName: visitDraft.visitorName,
        leadPhone: visitDraft.visitorPhone,
        desiredGoal: null,
        desiredCity: null,
        budgetMax: null,
      }, "lookup_only") ?? persistedLeadId;
    }

    for (const merge of dedupeMerges) {
      await this.recordDedupeMergeAudit(scope, merge);
    }

    const leadEventType = resolveLeadEventType({
      flow: operational.flow,
      outcome: asString(operational.outcome),
      leadStatus: asString(operational.leadStatus),
      nextAction: asString(operational.nextAction),
      pendingFields: operational.pendingFields,
    });

    const caseInput = {
      threadId: params.threadId ?? null,
      flow: operational.flow,
      stage: operational.status,
      status: mapOperationalCaseStatus(operational.status),
      ...(asString(params.resolved?.presentation?.owner)
        ? { ownerResponsible: asString(params.resolved?.presentation?.owner) }
        : {}),
      nextStep: asString(params.resolved?.presentation?.nextStep),
      blockers: blockers.length > 0 ? blockers : undefined,
      pendingItems: pendingItems.length > 0 ? pendingItems : undefined,
      ...(persistedLeadId ? { leadId: persistedLeadId } : {}),
      ...(persistedOwnerId ? { ownerId: persistedOwnerId } : {}),
      ...(persistedPropertyId ? { propertyId: persistedPropertyId } : {}),
      ...(asString(proposalDraft?.propertyId) ? { externalDealId: asString(proposalDraft?.propertyId) } : {}),
      metadata: {
        threadLabel: params.threadLabel ?? params.resolved?.threadLabel,
        action: params.resolved?.action,
        mode: params.resolved?.mode,
        suggestedNextAction: asString(params.resolved?.presentation?.suggestedNextAction),
        dedupeKey: replayKey,
        leadStatus: asString(operational.leadStatus),
        nextAction: asString(operational.nextAction),
        reasonCode: asString(params.resolved?.presentation?.metadata?.reasonCode),
        pendingAction: asObject(operational.pendingAction) ?? null,
      },
      eventType: leadEventType ?? (scopedCase ? "case.turn_resolved" : "case.created_from_turn"),
      eventEvidenceRef: replayKey,
      eventSummary: asString(params.resolved?.presentation?.text),
      eventPayload: {
        resolvedAt: nowIso,
        flow: operational.flow,
        replayKey,
        operationalStatus: operational.status,
        leadStatus: asString(operational.leadStatus),
        nextAction: asString(operational.nextAction),
        pendingFields: operational.pendingFields,
        pendingFieldLabels: pendingItems,
        reasonCode: asString(params.resolved?.presentation?.metadata?.reasonCode),
        ownerDraft: ownerDraft ?? null,
        propertyDraft: propertyDraft ?? null,
        marketScanSelection: asObject(operational.marketScanSelection) ?? null,
        leadDraft: leadDraft ?? null,
        proposalDraft: proposalDraft ?? null,
        visitDraft: visitDraft ?? null,
        contractDraft: contractDraft ?? null,
        rulesDraft: rulesDraft ?? null,
        commissionDraft: commissionDraft ?? null,
        dedupeMerges,
        persistedLeadId,
        persistedOwnerId,
        persistedPropertyId,
        executionRequest: params.resolved?.executionRequest ?? null,
      },
    };

    const result = scopedCase
      ? await this.updateCase(scope, scopedCase.id, caseInput)
      : await this.createCase(scope, {
          ...caseInput,
          initialEvent: {
            type: caseInput.eventType,
            actorType: "system",
            summary: caseInput.eventSummary,
            evidenceRef: replayKey,
            payload: caseInput.eventPayload,
          },
        });

    if (result.status !== "created" && result.status !== "updated") return null;

    return {
      caseId: result.data.id,
      flow: operational.flow,
      stage: operational.status,
      status: mapOperationalCaseStatus(operational.status),
      ownerResponsible: asString(params.resolved?.presentation?.owner),
      nextStep: asString(params.resolved?.presentation?.nextStep),
      blocker: asString(params.resolved?.presentation?.blocker),
      pendingItems,
      threadId: params.threadId ?? null,
      updatedAt: nowIso,
      blockers,
      lead: result.data.lead ?? null,
      owner: result.data.owner ?? null,
      property: result.data.property ?? null,
    };
  }

  private async validateCaseRelations(scope: Scope, input: Partial<CaseInput>) {
    if (input.ownerId) {
      const owner = await this.prisma.imobOwner.findFirst({ where: { id: input.ownerId, tenantId: scope.tenantId, workspaceId: scope.workspaceId }, select: { id: true } });
      if (!owner) return { status: "owner_not_found" as const };
    }
    if (input.propertyId) {
      const property = await this.prisma.imobProperty.findFirst({ where: { id: input.propertyId, tenantId: scope.tenantId, workspaceId: scope.workspaceId }, select: { id: true } });
      if (!property) return { status: "property_not_found" as const };
    }
    if (input.leadId) {
      const lead = await this.prisma.imobLead.findFirst({ where: { id: input.leadId, tenantId: scope.tenantId, workspaceId: scope.workspaceId }, select: { id: true } });
      if (!lead) return { status: "lead_not_found" as const };
    }
    return { status: "ok" as const };
  }
}
