import { resolveImobCrmRegistrationDedupe } from "./imobCrmDedupe";
import type { ImobCrmConversationState, ImobCrmTurnResolution } from "./imobCrmAgentContract";
import type {
  DraftLike,
  FormLike,
  LeadDraftLike,
  LeadRecordLike,
  OwnerDraftLike,
  OwnerRecordLike,
  PropertyDraftLike,
  PropertyRecordLike,
} from "./imobCrmTypes";

type RegistrationHelpers = {
  asObject: (value: unknown) => Record<string, unknown> | null;
  asString: (value: unknown) => string | null;
  cloneImobResolvedTurn: <T>(value: T) => T;
  setImobFormFieldValues: (form: any, values: Record<string, unknown>) => any;
  createEmptyThreadState: () => ImobCrmConversationState;
};

function buildLeadPendingFieldsFromDraft(draft: LeadDraftLike, asString: RegistrationHelpers["asString"]) {
  const pending: string[] = [];
  if (!asString(draft?.leadName)) pending.push("leadName");
  if (!asString(draft?.leadPhone)) pending.push("leadPhone");
  if (!asString(draft?.desiredGoal)) pending.push("desiredGoal");
  if (!asString(draft?.desiredCity)) pending.push("desiredCity");
  if (!Number.isFinite(Number(draft?.budgetMax))) pending.push("budgetMax");
  return pending;
}

function buildOwnerPendingFieldsFromDraft(draft: OwnerDraftLike, asString: RegistrationHelpers["asString"]) {
  const pending: string[] = [];
  if (!asString(draft?.ownerName)) pending.push("ownerName");
  if (!asString(draft?.ownerPhone)) pending.push("ownerPhone");
  if (!asString(draft?.ownerEmail)) pending.push("ownerEmail");
  if (!asString(draft?.ownerDocument)) pending.push("ownerDocument");
  return pending;
}

function buildPropertyPendingFieldsFromDraft(draft: PropertyDraftLike, asString: RegistrationHelpers["asString"]) {
  const pending: string[] = [];
  if (!asString(draft?.propertyType)) pending.push("propertyType");
  if (!asString(draft?.goal)) pending.push("goal");
  if (!asString(draft?.city)) pending.push("city");
  if (!asString(draft?.address)) pending.push("address");
  return pending;
}

function hydrateLeadDraftFromExisting(draft: LeadDraftLike, lead: LeadRecordLike, asString: RegistrationHelpers["asString"]) {
  return {
    ...draft,
    leadName: asString(draft?.leadName) ?? asString(lead?.name) ?? null,
    leadPhone: asString(draft?.leadPhone) ?? asString(lead?.phone) ?? null,
    leadEmail: asString(draft?.leadEmail) ?? asString(lead?.email) ?? null,
    desiredGoal: asString(draft?.desiredGoal) ?? asString(lead?.goal) ?? null,
    desiredCity: asString(draft?.desiredCity) ?? asString(lead?.targetCity) ?? null,
    budgetMax: Number.isFinite(Number(draft?.budgetMax))
      ? Number(draft.budgetMax)
      : typeof lead?.budgetMaxCents === "number"
        ? Math.round(lead.budgetMaxCents / 100)
        : null,
  };
}

function hydrateOwnerDraftFromExisting(draft: OwnerDraftLike, owner: OwnerRecordLike, asString: RegistrationHelpers["asString"]) {
  return {
    ...draft,
    ownerName: asString(draft?.ownerName) ?? asString(owner?.name) ?? null,
    ownerPhone: asString(draft?.ownerPhone) ?? asString(owner?.phone) ?? null,
    ownerEmail: asString(draft?.ownerEmail) ?? asString(owner?.email) ?? null,
    ownerDocument: asString(draft?.ownerDocument) ?? asString(owner?.document) ?? null,
  };
}

function hydratePropertyDraftFromExisting(draft: PropertyDraftLike, property: PropertyRecordLike, asString: RegistrationHelpers["asString"]) {
  return {
    ...draft,
    propertyType: asString(draft?.propertyType) ?? asString(property?.propertyType) ?? null,
    goal: asString(draft?.goal) ?? asString(property?.goal) ?? null,
    city: asString(draft?.city) ?? asString(property?.city) ?? null,
    neighborhood: asString(draft?.neighborhood) ?? asString(property?.neighborhood) ?? null,
    bedrooms: Number.isFinite(Number(draft?.bedrooms)) ? Number(draft.bedrooms) : property?.bedrooms ?? null,
    bathrooms: Number.isFinite(Number(draft?.bathrooms)) ? Number(draft.bathrooms) : property?.bathrooms ?? null,
    address: asString(draft?.address) ?? asString(property?.address) ?? null,
  };
}

function withHydratedOperationalDraft(params: {
  resolved: ImobCrmTurnResolution;
  flow: "lead.qualify" | "owner.create" | "property.create";
  draft: DraftLike;
  pendingFields: string[];
  existingLabel: string;
  helpers: RegistrationHelpers;
}) {
  const next = params.helpers.cloneImobResolvedTurn(params.resolved);
  const conversationState = params.helpers.asObject(next.conversationState) ?? params.helpers.createEmptyThreadState();
  const operational = params.helpers.asObject(conversationState.operational) ?? {};
  if (params.flow === "lead.qualify") operational.leadDraft = params.draft;
  if (params.flow === "owner.create") operational.ownerDraft = params.draft;
  if (params.flow === "property.create") operational.propertyDraft = params.draft;
  operational.pendingFields = params.pendingFields;
  operational.status = params.pendingFields.length === 0 ? "ready_for_review" : "collecting";
  next.conversationState = {
    ...conversationState,
    operational,
  };
  next.presentation = {
    ...(next.presentation ?? {}),
    text: [
      `Encontrei ${params.existingLabel} já cadastrado neste workspace e vou atualizar esse registro, sem criar duplicidade.`,
      params.helpers.asString(next.presentation?.text),
    ].filter(Boolean).join("\n"),
    pendingFieldLabels: params.pendingFields,
  };
  if (params.flow === "lead.qualify") {
    next.presentation.form = params.helpers.setImobFormFieldValues(next.presentation.form, {
      leadName: params.draft.leadName,
      leadPhone: params.draft.leadPhone,
      leadEmail: params.draft.leadEmail,
      desiredGoal: params.draft.desiredGoal,
      desiredCity: params.draft.desiredCity,
      budgetMax: params.draft.budgetMax ? String(params.draft.budgetMax) : "",
    });
  }
  if (params.flow === "owner.create") {
    next.presentation.form = params.helpers.setImobFormFieldValues(next.presentation.form, {
      ownerName: params.draft.ownerName,
      ownerPhone: params.draft.ownerPhone,
      ownerEmail: params.draft.ownerEmail,
      ownerDocument: params.draft.ownerDocument,
    });
  }
  if (params.flow === "property.create") {
    next.presentation.form = params.helpers.setImobFormFieldValues(next.presentation.form, {
      propertyType: params.draft.propertyType,
      goal: params.draft.goal,
      city: params.draft.city,
      address: params.draft.address,
    });
  }
  return next;
}

function buildExistingRegistrationChoiceConsult(params: {
  resolved: ImobCrmTurnResolution;
  flow: "lead.qualify" | "owner.create" | "property.create";
  title: string;
  text: string;
  lines: string[];
  nextMessages: string[];
  helpers: RegistrationHelpers;
}) {
  const next = params.helpers.cloneImobResolvedTurn(params.resolved);
  next.mode = "consult";
  next.action = "crm.registration.dedupe_review";
  next.conversationState = {
    ...(next.conversationState ?? params.helpers.createEmptyThreadState()),
    mode: "consult",
  };
  next.presentation = {
    ...(next.presentation ?? {}),
    text: params.text,
    form: undefined,
    suggestedNextAction: params.flow === "property.create"
      ? "Escolha: criar novo, editar, excluir ou arquivar (vendido, alugado ou outro)."
      : "Escolha se quer atualizar o cadastro existente ou criar um novo.",
    card: {
      title: params.title,
      lines: params.lines,
      actionsLayout: "inline",
      ctas: params.nextMessages.map((message, index) => {
        if (params.flow === "property.create") {
          const labels = [
            "Criar novo",
            "Editar",
            "Excluir",
            "Arquivar (Vendido)",
            "Arquivar (Alugado)",
            "Arquivar (Outro)",
          ];
          const kinds = ["primary", "secondary", "neutral", "neutral", "neutral", "neutral"] as const;
          return {
            id: `dedupe-choice-${params.flow}-${index}`,
            label: labels[index] ?? `Opção ${index + 1}`,
            kind: kinds[index] ?? "neutral",
            action: "send_suggested_message",
            nextMessage: message,
          };
        }
        return {
          id: `dedupe-choice-${params.flow}-${index}`,
          label: index === 0 ? "Atualizar existente" : index === 1 ? "Criar novo" : "Ver cadastros",
          kind: index === 0 ? "primary" : index === 1 ? "secondary" : "neutral",
          action: "send_suggested_message",
          nextMessage: message,
        };
      }),
    },
  };
  return next;
}

export async function applyExistingRegistrationResolution(params: {
  prisma: any;
  tenantId: string;
  workspaceId: string;
  resolved: ImobCrmTurnResolution;
  helpers: RegistrationHelpers;
}) {
  const resolvedObject = params.helpers.asObject(params.resolved);
  const operational = params.helpers.asObject(params.helpers.asObject(resolvedObject?.conversationState)?.operational);
  const flow = params.helpers.asString(operational?.flow);
  if (params.resolved?.mode !== "execute" || !flow) return params.resolved;

  const draft =
    flow === "lead.qualify" ? params.helpers.asObject(operational?.leadDraft) ?? {}
      : flow === "owner.create" ? params.helpers.asObject(operational?.ownerDraft) ?? {}
        : flow === "property.create" ? params.helpers.asObject(operational?.propertyDraft) ?? {}
          : {};
  const decision = await resolveImobCrmRegistrationDedupe({
    prisma: params.prisma,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    flow,
    draft,
  });

  if (decision.kind === "hydrate") {
    return withHydratedOperationalDraft({
      resolved: params.resolved,
      flow: decision.flow,
      draft: decision.draft,
      pendingFields: decision.pendingFields,
      existingLabel: decision.existingLabel,
      helpers: params.helpers,
    });
  }

  if (decision.kind === "choice") {
    return buildExistingRegistrationChoiceConsult({
      resolved: params.resolved,
      flow: decision.flow,
      title: decision.title,
      text: decision.text,
      lines: decision.lines,
      nextMessages: decision.nextMessages,
      helpers: params.helpers,
    });
  }

  return params.resolved;
}

export const imobCrmRegistrationResolutionHelpers = {
  buildLeadPendingFieldsFromDraft,
  buildOwnerPendingFieldsFromDraft,
  buildPropertyPendingFieldsFromDraft,
  hydrateLeadDraftFromExisting,
  hydrateOwnerDraftFromExisting,
  hydratePropertyDraftFromExisting,
};
