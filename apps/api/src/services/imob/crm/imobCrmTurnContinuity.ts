import type { ImobCrmTurnResolution } from "./imobCrmAgentContract";
import type { ThreadStateLike } from "./imobCrmOperationalResolverShared";

type ProposalDraft = {
  buyerName?: unknown;
  buyerEmail?: unknown;
  buyerPhone?: unknown;
  propertyId?: unknown;
  offerAmount?: unknown;
  contractType?: unknown;
};

type VisitDraft = {
  propertyId?: unknown;
  visitorName?: unknown;
  visitorPhone?: unknown;
  preferredDate?: unknown;
  preferredWindow?: unknown;
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
    findFirst(args: Record<string, unknown>): Promise<{ leadId?: string | null } | null>;
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

function buildLeadPendingFields(draft: {
  leadName?: string | null;
  leadPhone?: string | null;
  desiredGoal?: "locacao" | "venda" | null;
  desiredCity?: string | null;
  budgetMax?: number | null;
}) {
  const pending: string[] = [];
  if (!draft.leadName) pending.push("leadName");
  if (!draft.leadPhone) pending.push("leadPhone");
  if (!draft.desiredGoal) pending.push("desiredGoal");
  if (!draft.desiredCity) pending.push("desiredCity");
  if (!draft.budgetMax || !Number.isFinite(draft.budgetMax)) pending.push("budgetMax");
  return pending;
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
  const targetFlow = params.helpers.detectOperationalHydrationFlow(
    params.message,
    params.threadLabel,
    params.helpers.asString(currentOperational?.flow)
  );
  if (targetFlow !== "proposal.create" && targetFlow !== "visit.schedule" && targetFlow !== "lead.qualify") {
    return params.threadState;
  }

  let persistedLead: PersistedLeadSummary | null = null;
  if (params.caseId) {
    const scopedCase = await params.prisma.imobCase.findFirst({
      where: { id: params.caseId, tenantId: params.tenantId, workspaceId: params.workspaceId },
      select: { leadId: true },
    });
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
        contractType:
          params.helpers.asString(proposalDraft.contractType) === "rent" ||
          params.helpers.asString(proposalDraft.contractType) === "sale" ||
          params.helpers.asString(proposalDraft.contractType) === "management"
            ? params.helpers.asString(proposalDraft.contractType)
            : null,
      },
    };
    return nextStateObject;
  }

  if (targetFlow === "lead.qualify") {
    const leadDraft = params.helpers.asObject(nextOperational.leadDraft) ?? {};
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
    const pendingFields = buildLeadPendingFields(hydratedLeadDraft);

    nextStateObject.operational = {
      ...nextOperational,
      flow: "lead.qualify",
      status: pendingFields.length === 0 ? "ready_for_review" : "collecting",
      pendingFields,
      leadDraft: hydratedLeadDraft,
    };
    return nextStateObject;
  }

  const visitDraft = (params.helpers.asObject(nextOperational.visitDraft) ?? {}) as VisitDraft;
  nextStateObject.operational = {
    ...nextOperational,
    flow: "visit.schedule",
    status: params.helpers.asString(nextOperational.status) === "ready_for_review" ? "ready_for_review" : "collecting",
    pendingFields: Array.isArray(nextOperational.pendingFields)
      ? nextOperational.pendingFields.filter((item: unknown) => typeof item === "string")
      : [],
    visitDraft: {
      propertyId: params.helpers.asString(visitDraft.propertyId),
      visitorName: params.helpers.asString(visitDraft.visitorName) ?? persistedLead.name ?? null,
      visitorPhone: params.helpers.asString(visitDraft.visitorPhone) ?? persistedLead.phone ?? null,
      preferredDate: params.helpers.asString(visitDraft.preferredDate),
      preferredWindow:
        params.helpers.asString(visitDraft.preferredWindow) === "manha" ||
        params.helpers.asString(visitDraft.preferredWindow) === "tarde" ||
        params.helpers.asString(visitDraft.preferredWindow) === "noite"
          ? params.helpers.asString(visitDraft.preferredWindow)
          : null,
    },
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
      pendingItems: pendingFieldLabels,
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
