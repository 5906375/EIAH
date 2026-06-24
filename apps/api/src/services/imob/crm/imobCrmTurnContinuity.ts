import type { ImobCrmTurnResolution } from "./imobCrmAgentContract";
import type { ThreadStateLike } from "./imobCrmOperationalResolverShared";
import {
  buildCanonicalLeadPendingFields,
  normalizeLeadQualifyOperationalState,
} from "./imobLeadQualifyRuntime";

type ProposalDraft = {
  buyerName?: unknown;
  buyerEmail?: unknown;
  buyerPhone?: unknown;
  propertyId?: unknown;
  offerAmount?: unknown;
  counterofferAmount?: unknown;
  contractType?: unknown;
  negotiationStatus?: unknown;
  approvalRequired?: unknown;
  approvalStatus?: unknown;
};

type VisitDraft = {
  propertyId?: unknown;
  propertyTextCandidate?: unknown;
  visitorName?: unknown;
  visitorPhone?: unknown;
  preferredDate?: unknown;
  preferredWindow?: unknown;
  status?: unknown;
  outcome?: unknown;
};

type FollowUpDraft = {
  status?: unknown;
  trigger?: unknown;
  suggestedChannel?: unknown;
};

type PersistedLeadSummary = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  goal?: string | null;
  targetCity?: string | null;
  budgetMaxCents?: number | null;
};

type ContinuityPrismaLike = {
  imobCase: {
    findFirst(args: Record<string, unknown>): Promise<{ leadId?: string | null; propertyId?: string | null } | null>;
  };
  imobLead: {
    findFirst(args: Record<string, unknown>): Promise<PersistedLeadSummary | null>;
  };
};

type ContinuityHelpers = {
  asObject: (value: unknown) => Record<string, unknown> | null;
  asString: (value: unknown) => string | null;
  asStringList: (value: unknown) => string[];
  createEmptyThreadState: () => ThreadStateLike;
  cloneImobResolvedTurn: <T>(value: T) => T;
  detectOperationalHydrationFlow: (message: string, threadLabel?: string | null, operationalFlow?: string | null) => string | null;
  extractLeadNameFromMessage: (message: string) => string | null;
  extractLeadEmailFromMessage: (message: string) => string | null;
  extractLeadPhoneFromMessage: (message: string) => string | null;
  buildOwnerPendingSuggestion: (owner: { name: string; pendingItems?: unknown }) => string | null;
  buildPropertyPendingSuggestion: (property: { id?: string; address?: string | null; pendingItems?: unknown }) => string | null;
  buildLeadPendingSuggestion: (lead: { name: string; pendingItems?: unknown }) => string | null;
};

function normalizeLeadDesiredGoal(value: string | null | undefined): "locacao" | "venda" | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "venda" || normalized === "compra" || normalized.includes("compr")) return "venda";
  if (normalized === "locacao" || normalized === "locação" || normalized.includes("loca") || normalized.includes("alug")) return "locacao";
  return null;
}

function inferExplicitTargetFlow(message: string): "proposal.create" | "visit.schedule" | "lead.qualify" | "documents.collect" | null {
  const normalized = String(message ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (!normalized) return null;
  if (
    normalized.includes("follow up")
    || normalized.includes("follow-up")
    || normalized.includes("aguardando resposta")
    || normalized.includes("sem resposta")
    || normalized.includes("sem retorno")
    || normalized.includes("reengajar")
    || normalized.includes("reengajamento")
    || normalized.includes("cobrar retorno")
  ) {
    return "lead.qualify";
  }
  if (normalized.includes("visita") || normalized.includes("agendar") || normalized.includes("agenda") || normalized.includes("reuniao") || normalized.includes("tour")) {
    return "visit.schedule";
  }
  if (normalized.includes("proposta") || normalized.includes("oferta")) {
    return "proposal.create";
  }
  if (
    normalized.includes("document")
    || normalized.includes("revisar documentos")
    || normalized.includes("coletar documentos")
    || normalized.includes("documentacao")
  ) {
    return "documents.collect";
  }
  if (normalized.includes("qualificar lead") || normalized.includes("cadastro de lead") || normalized.includes("cadastrar lead")) {
    return "lead.qualify";
  }
  return null;
}

function sanitizeFollowUpDraft(raw: FollowUpDraft, helpers: ContinuityHelpers) {
  const status = helpers.asString(raw.status);
  const trigger = helpers.asString(raw.trigger);
  const suggestedChannel = helpers.asString(raw.suggestedChannel);

  return {
    status:
      status === "pending"
      || status === "awaiting_response"
      || status === "reengagement_required"
        ? status
        : null,
    trigger:
      trigger === "post_visit"
      || trigger === "no_response"
      || trigger === "post_visit_objection"
      || trigger === "decision_window"
      || trigger === "generic"
        ? trigger
        : null,
    suggestedChannel:
      suggestedChannel === "internal"
      || suggestedChannel === "whatsapp"
      || suggestedChannel === "phone"
      || suggestedChannel === "email"
        ? suggestedChannel
        : null,
  } as const;
}

export async function hydrateThreadStateWithPersistedLead(params: {
  prisma: any;
  tenantId: string;
  workspaceId: string;
  message: string;
  caseId?: string | null;
  threadLabel?: string | null;
  threadState: any;
  helpers: ContinuityHelpers;
}) {
  const currentOperational = params.helpers.asObject(params.helpers.asObject(params.threadState)?.operational);
  const currentStatus = params.helpers.asString(currentOperational?.status);
  const currentPendingFields = params.helpers.asStringList(currentOperational?.pendingFields);
  const hasBlockingActiveFlow = currentStatus === "collecting" && currentPendingFields.length > 0;
  const explicitTargetFlow = inferExplicitTargetFlow(params.message);
  const targetFlow = hasBlockingActiveFlow
    ? params.helpers.detectOperationalHydrationFlow(
        params.message,
        params.threadLabel,
        params.helpers.asString(currentOperational?.flow),
      )
    : explicitTargetFlow ?? params.helpers.detectOperationalHydrationFlow(
        params.message,
        params.threadLabel,
        null,
      );
  if (
    targetFlow !== "proposal.create"
    && targetFlow !== "visit.schedule"
    && targetFlow !== "lead.qualify"
    && targetFlow !== "documents.collect"
  ) {
    return params.threadState;
  }

  let persistedLead: PersistedLeadSummary | null = null;
  let scopedCasePropertyId: string | null = null;
  if (params.caseId) {
    const scopedCase = await params.prisma.imobCase.findFirst({
      where: { id: params.caseId, tenantId: params.tenantId, workspaceId: params.workspaceId },
      select: { leadId: true, propertyId: true },
    });
    scopedCasePropertyId = typeof scopedCase?.propertyId === "string" ? scopedCase.propertyId : null;
    if (scopedCase?.leadId) {
      persistedLead = await params.prisma.imobLead.findFirst({
        where: { id: scopedCase.leadId, tenantId: params.tenantId, workspaceId: params.workspaceId },
      });
    }
  }

  if (!persistedLead) {
    const proposalDraft = (params.helpers.asObject(currentOperational?.proposalDraft) ?? {}) as ProposalDraft;
    const visitDraft = (params.helpers.asObject(currentOperational?.visitDraft) ?? {}) as VisitDraft;
    const name =
      params.helpers.asString(targetFlow === "proposal.create" ? proposalDraft?.buyerName : visitDraft?.visitorName) ??
      params.helpers.extractLeadNameFromMessage(params.message);
    const email =
      params.helpers.asString(targetFlow === "proposal.create" ? proposalDraft?.buyerEmail : null) ??
      params.helpers.extractLeadEmailFromMessage(params.message);
    const phone =
      params.helpers.asString(targetFlow === "proposal.create" ? proposalDraft?.buyerPhone : visitDraft?.visitorPhone) ??
      params.helpers.extractLeadPhoneFromMessage(params.message);

    const conditions = [
      phone ? { phone } : null,
      email ? { email } : null,
      name ? { name } : null,
    ].filter(Boolean) as Array<Record<string, string> | null> as Array<Record<string, string>>;

    if (conditions.length > 0) {
      persistedLead = await params.prisma.imobLead.findFirst({
        where: {
          tenantId: params.tenantId,
          workspaceId: params.workspaceId,
          OR: conditions,
        },
        orderBy: { updatedAt: "desc" },
      });
    }

    if (!persistedLead && name) {
      persistedLead = await params.prisma.imobLead.findFirst({
        where: {
          tenantId: params.tenantId,
          workspaceId: params.workspaceId,
          name,
        },
        orderBy: { updatedAt: "desc" },
      });
    }
  }

  if (!persistedLead) return params.threadState;

  const nextState = params.threadState
    ? params.helpers.cloneImobResolvedTurn(params.threadState)
    : params.helpers.createEmptyThreadState();
  const nextStateObject = params.helpers.asObject(nextState) ?? {};
  const nextOperational = params.helpers.asObject(nextStateObject.operational) ?? {};

  if (targetFlow === "proposal.create") {
    const proposalDraft = (params.helpers.asObject(nextOperational.proposalDraft) ?? {}) as ProposalDraft;
    nextStateObject.operational = {
      ...nextOperational,
      flow: "proposal.create",
      status: params.helpers.asString(nextOperational.status) === "ready_for_review" ? "ready_for_review" : "collecting",
      pendingFields: Array.isArray(nextOperational.pendingFields)
        ? nextOperational.pendingFields.filter((item: unknown) => typeof item === "string")
        : [],
      proposalDraft: {
        buyerName: params.helpers.asString(proposalDraft.buyerName) ?? persistedLead.name ?? null,
        buyerEmail: params.helpers.asString(proposalDraft.buyerEmail) ?? persistedLead.email ?? null,
        buyerPhone: params.helpers.asString(proposalDraft.buyerPhone) ?? persistedLead.phone ?? null,
        propertyId: params.helpers.asString(proposalDraft.propertyId),
        offerAmount: Number.isFinite(Number(proposalDraft.offerAmount)) ? Number(proposalDraft.offerAmount) : null,
        counterofferAmount: Number.isFinite(Number(proposalDraft.counterofferAmount))
          ? Number(proposalDraft.counterofferAmount)
          : null,
        contractType:
          params.helpers.asString(proposalDraft.contractType) === "rent" ||
          params.helpers.asString(proposalDraft.contractType) === "sale" ||
          params.helpers.asString(proposalDraft.contractType) === "management"
            ? params.helpers.asString(proposalDraft.contractType)
            : null,
        negotiationStatus:
          params.helpers.asString(proposalDraft.negotiationStatus) === "counteroffer_required"
          || params.helpers.asString(proposalDraft.negotiationStatus) === "awaiting_response"
          || params.helpers.asString(proposalDraft.negotiationStatus) === "accepted"
          || params.helpers.asString(proposalDraft.negotiationStatus) === "rejected"
            ? params.helpers.asString(proposalDraft.negotiationStatus)
            : null,
        approvalRequired: Boolean(proposalDraft.approvalRequired),
        approvalStatus:
          params.helpers.asString(proposalDraft.approvalStatus) === "pending"
          || params.helpers.asString(proposalDraft.approvalStatus) === "approved"
          || params.helpers.asString(proposalDraft.approvalStatus) === "rejected"
            ? params.helpers.asString(proposalDraft.approvalStatus)
            : null,
      },
    };
    return nextStateObject;
  }

  if (targetFlow === "lead.qualify") {
    const leadDraft = params.helpers.asObject(nextOperational.leadDraft) ?? {};
    const followUpDraft = sanitizeFollowUpDraft(
      (params.helpers.asObject(nextOperational.followUpDraft) ?? {}) as FollowUpDraft,
      params.helpers,
    );
    const resolvedGoal = normalizeLeadDesiredGoal(
      params.helpers.asString(leadDraft.desiredGoal) ?? params.helpers.asString(persistedLead.goal),
    );
    const budgetFromLeadDraft = Number.isFinite(Number(leadDraft.budgetMax)) ? Number(leadDraft.budgetMax) : null;
    const budgetFromPersistedLead = Number.isFinite(Number(persistedLead.budgetMaxCents))
      ? Math.round(Number(persistedLead.budgetMaxCents) / 100)
      : null;
    const hydratedLeadDraft = {
      leadPersona: params.helpers.asString(leadDraft.leadPersona) ?? "lead",
      leadName: params.helpers.asString(leadDraft.leadName) ?? persistedLead.name ?? null,
      leadEmail: params.helpers.asString(leadDraft.leadEmail) ?? persistedLead.email ?? null,
      leadPhone: params.helpers.asString(leadDraft.leadPhone) ?? persistedLead.phone ?? null,
      desiredGoal: resolvedGoal,
      desiredCity: params.helpers.asString(leadDraft.desiredCity) ?? params.helpers.asString(persistedLead.targetCity),
      budgetMax: budgetFromLeadDraft ?? budgetFromPersistedLead,
    } as const;
    nextStateObject.operational = {
      ...nextOperational,
      flow: "lead.qualify",
      leadDraft: hydratedLeadDraft,
      followUpDraft,
    };
    nextStateObject.operational = normalizeLeadQualifyOperationalState(nextStateObject.operational as Record<string, unknown>, {
      propertyId: scopedCasePropertyId,
    });
    return nextStateObject;
  }

  if (targetFlow === "documents.collect") {
    nextStateObject.operational = {
      ...nextOperational,
      flow: "documents.collect",
      status: "ready_for_review",
      pendingFields: Array.isArray(nextOperational.pendingFields)
        ? nextOperational.pendingFields.filter((item: unknown) => typeof item === "string")
        : [],
      documentDraft: params.helpers.asObject(nextOperational.documentDraft) ?? {},
    };
    return nextStateObject;
  }

  const visitDraft = (params.helpers.asObject(nextOperational.visitDraft) ?? {}) as VisitDraft;
  const followUpDraft = sanitizeFollowUpDraft(
    (params.helpers.asObject(nextOperational.followUpDraft) ?? {}) as FollowUpDraft,
    params.helpers,
  );

  // Resolve propertyId: DB draft → case-scoped fallback
  let resolvedPropertyId: string | null =
    params.helpers.asString(visitDraft.propertyId) ?? scopedCasePropertyId;

  // When no numeric ID is resolved, try a text candidate search in the DB
  const propertyTextCandidate = params.helpers.asString(visitDraft.propertyTextCandidate);
  let propertyCandidates: Array<{ id: string; label: string }> = [];
  if (!resolvedPropertyId && propertyTextCandidate) {
    const hits: Array<{ id: string; address: string | null; type: string | null }> =
      await params.prisma.imobProperty.findMany({
        where: {
          tenantId: params.tenantId,
          workspaceId: params.workspaceId,
          status: { not: "archived" },
          OR: [
            { address: { contains: propertyTextCandidate, mode: "insensitive" } },
            { type: { contains: propertyTextCandidate, mode: "insensitive" } },
          ],
        },
        take: 3,
        orderBy: { updatedAt: "desc" },
        select: { id: true, address: true, type: true },
      });
    if (hits.length === 1) {
      // Único resultado → auto-vincula; nenhuma ação do usuário necessária
      resolvedPropertyId = hits[0].id;
    } else if (hits.length > 1) {
      // Múltiplos → armazena candidatos para o engine emitir CTAs
      propertyCandidates = hits.map((h) => ({
        id: h.id,
        label: [h.type, h.address].filter(Boolean).join(" — "),
      }));
    }
  }

  const hydratedVisitDraft = {
    propertyId: resolvedPropertyId,
    propertyTextCandidate: resolvedPropertyId ? null : (propertyTextCandidate ?? null),
    visitorName: params.helpers.asString(visitDraft.visitorName) ?? persistedLead.name ?? null,
    visitorPhone: params.helpers.asString(visitDraft.visitorPhone) ?? persistedLead.phone ?? null,
    preferredDate: params.helpers.asString(visitDraft.preferredDate),
    preferredWindow:
      params.helpers.asString(visitDraft.preferredWindow) === "manha" ||
      params.helpers.asString(visitDraft.preferredWindow) === "tarde" ||
      params.helpers.asString(visitDraft.preferredWindow) === "noite"
        ? params.helpers.asString(visitDraft.preferredWindow)
        : null,
    status:
      params.helpers.asString(visitDraft.status) === "pending_confirmation"
      || params.helpers.asString(visitDraft.status) === "scheduled"
      || params.helpers.asString(visitDraft.status) === "awaiting_reschedule"
      || params.helpers.asString(visitDraft.status) === "cancel_requested"
        ? params.helpers.asString(visitDraft.status)
        : null,
    outcome:
      params.helpers.asString(visitDraft.outcome) === "proposal_ready"
      || params.helpers.asString(visitDraft.outcome) === "follow_up_required"
      || params.helpers.asString(visitDraft.outcome) === "reengagement_required"
        ? params.helpers.asString(visitDraft.outcome)
        : null,
  };
  const pendingVisitFields: string[] = [];
  if (!hydratedVisitDraft.propertyId) pendingVisitFields.push("propertyId");
  if (!hydratedVisitDraft.visitorName) pendingVisitFields.push("visitorName");
  if (!hydratedVisitDraft.visitorPhone) pendingVisitFields.push("visitorPhone");
  if (!hydratedVisitDraft.preferredDate) pendingVisitFields.push("preferredDate");

  nextStateObject.operational = {
    ...nextOperational,
    flow: "visit.schedule",
    status: pendingVisitFields.length === 0 ? "ready_for_review" : "collecting",
    pendingFields: pendingVisitFields,
    visitDraft: hydratedVisitDraft,
    ...(propertyCandidates.length > 0 ? { propertyCandidates } : {}),
    followUpDraft,
  };
  return nextStateObject;
}

function buildResolvedPendingSuggestion(resolved: ImobCrmTurnResolution, helpers: ContinuityHelpers) {
  const resolvedObject = helpers.asObject(resolved);
  const operational = helpers.asObject(helpers.asObject(resolvedObject?.conversationState)?.operational);
  const operationalFlow = helpers.asString(operational?.flow);
  const presentation = helpers.asObject(resolvedObject?.presentation);
  const pendingFieldLabels = helpers.asStringList(presentation?.pendingFieldLabels);
  if (pendingFieldLabels.length === 0) return null;

  if (operationalFlow === "owner.create") {
    const ownerDraft = helpers.asObject(operational?.ownerDraft);
    return helpers.buildOwnerPendingSuggestion({
      name: helpers.asString(ownerDraft?.ownerName) ?? "proprietário",
      pendingItems: pendingFieldLabels,
    });
  }

  if (operationalFlow === "property.create") {
    const propertyDraft = helpers.asObject(operational?.propertyDraft);
    return helpers.buildPropertyPendingSuggestion({
      id: helpers.asString(propertyDraft?.propertyId) ?? undefined,
      address: helpers.asString(propertyDraft?.address),
      pendingItems: pendingFieldLabels,
    });
  }

  if (operationalFlow === "lead.qualify") {
    const leadDraft = helpers.asObject(operational?.leadDraft);
    return helpers.buildLeadPendingSuggestion({
      name: helpers.asString(leadDraft?.leadName) ?? "lead",
      pendingItems: pendingFieldLabels.length > 0 ? pendingFieldLabels : buildCanonicalLeadPendingFields(leadDraft ?? {}),
    });
  }

  return null;
}

export function injectResolvedPendingSuggestion(resolved: ImobCrmTurnResolution, helpers: ContinuityHelpers) {
  const suggestion = buildResolvedPendingSuggestion(resolved, helpers);
  if (!suggestion) return resolved;
  const resolvedObject = helpers.asObject(resolved);
  const presentation = helpers.asObject(resolvedObject?.presentation);
  const hasForm = Boolean(helpers.asObject(presentation?.form));
  if (hasForm) return resolved;
  const currentText = helpers.asString(presentation?.text) ?? "";
  const currentSuggestedNextAction = helpers.asString(presentation?.suggestedNextAction);
  if (currentText.includes(suggestion) && currentSuggestedNextAction === suggestion) return resolved;

  return {
    ...resolved,
    presentation: {
      ...presentation,
      text: currentText.includes(suggestion) ? currentText : [currentText, suggestion].filter(Boolean).join("\n"),
      suggestedNextAction: suggestion,
    },
  };
}
