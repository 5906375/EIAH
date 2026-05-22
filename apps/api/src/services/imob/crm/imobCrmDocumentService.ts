import type { PrismaClient } from "@repo/db";
import { validateImobIdentityAttachmentAgainstCase } from "../imobAttachmentValidation";
import type { ImobCrmCanonicalCase, ImobCrmCaseContext, ImobCrmOwnerSummary } from "./imobCrmAgentContract";
import type { ImobReasonCode } from "../control/imobReasonCodeCatalog";
import { IMOB_CHAT_AUDIT_AGENT_ID } from "./imobCrmAudit";
import { buildImobCrmCaseContextFromRecord } from "./imobCrmCaseContext";

type Scope = {
  tenantId: string;
  workspaceId: string;
  userId?: string | null;
};

type AttachmentValidationResult = Awaited<ReturnType<typeof validateImobIdentityAttachmentAgainstCase>>;
type DocumentOwnerLike = ImobCrmOwnerSummary & { id: string; metadata?: unknown; pendingItems?: unknown };
type DocumentCaseLike = {
  id: string;
  flow?: string | null;
  stage?: string | null;
  status?: string | null;
  ownerResponsible?: string | null;
  nextStep?: string | null;
  blockers?: unknown;
  pendingItems?: unknown;
  threadId?: string | null;
  updatedAt?: { toISOString?: () => string } | null;
  lead?: unknown;
  property?: unknown;
  owner?: DocumentOwnerLike | null;
  ownerId?: string | null;
} & Omit<ImobCrmCaseContext, "caseId" | "canonical">;
type UpdatedCaseContextParams = {
  imobCase: {
    id: string;
    flow?: string | null;
    stage?: string | null;
    status?: string | null;
    ownerResponsible?: string | null;
    threadId?: string | null;
    updatedAt: { toISOString(): string };
  };
  workspaceResponsibleLabel: string;
  nextStep: string | null;
  blocker: string | null;
  pendingItems: string[];
  canonicalBlockers: string[];
};

type JsonPayload = Record<string, unknown>;
type AttachmentContextResolutionSource =
  | "case_id"
  | "thread_id"
  | "conversation_case_context"
  | "conversation_thread"
  | "recent_operational_fallback"
  | "identifier_mismatch"
  | "not_found";

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
}

function normalizeText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ");
}

function isSuspiciousOwnerDisplayName(value: string | null | undefined) {
  if (!value) return true;
  const trimmed = value.trim();
  if (!trimmed) return true;
  const normalized = normalizeText(trimmed);
  if (normalized === "null" || normalized === "undefined" || normalized === "none") return true;
  return /^cmn[a-z0-9]*$/i.test(trimmed);
}

async function resolveOwnerDisplayName(params: {
  prisma: PrismaClient;
  tenantId: string;
  workspaceId: string;
  owner: { id: string; name?: string | null };
}) {
  if (!isSuspiciousOwnerDisplayName(params.owner.name)) {
    return params.owner.name?.trim() ?? "Proprietário";
  }

  const rows = await params.prisma.memoryEvent.findMany({
    where: {
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      key: "crm.audit",
      agentId: IMOB_CHAT_AUDIT_AGENT_ID,
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { metadata: true },
  });

  for (const row of rows) {
    const metadata = asObject(row.metadata);
    if (!metadata || metadata.subjectType !== "owner" || metadata.subjectId !== params.owner.id) continue;
    const after = asObject(metadata.after);
    const before = asObject(metadata.before);
    const candidates = [after?.name, before?.name];
    for (const candidate of candidates) {
      if (typeof candidate === "string" && !isSuspiciousOwnerDisplayName(candidate)) {
        return candidate.trim();
      }
    }
  }

  return isSuspiciousOwnerDisplayName(params.owner.name) ? "Proprietário" : (params.owner.name?.trim() || "Proprietário");
}

function mapFlowToJourneyType(flow: string | null | undefined) {
  switch ((flow ?? "").trim()) {
    case "owner.create":
    case "property.create":
    case "listing.activate":
      return "property_capture";
    case "lead.qualify":
      return "lead_qualification";
    case "visit.schedule":
      return "visit_follow_up";
    case "documents.collect":
      return "documentation";
    case "proposal.create":
      return "proposal";
    case "deal.review":
      return "negotiation";
    case "contract.prepare":
      return "contract";
    case "commission.settle":
      return "commission";
    case "rules.configure":
      return "temporada_rules";
    default:
      return "operations";
  }
}

function mapFlowToCommercialGoal(flow: string | null | undefined) {
  switch ((flow ?? "").trim()) {
    case "owner.create":
    case "property.create":
    case "listing.activate":
      return "captacao";
    case "lead.qualify":
      return "qualificacao";
    case "visit.schedule":
      return "visita";
    case "documents.collect":
      return "documentacao";
    case "proposal.create":
      return "proposta";
    case "deal.review":
      return "negociacao";
    case "contract.prepare":
      return "contrato";
    case "commission.settle":
      return "comissao";
    case "rules.configure":
      return "temporada";
    default:
      return "operacao";
  }
}

function buildCanonicalCase(item: {
  flow?: unknown;
  stage?: unknown;
  status?: unknown;
  ownerResponsible?: unknown;
  nextStep?: unknown;
  pendingItems?: unknown;
  blockers?: unknown;
}): ImobCrmCanonicalCase {
  const pendingItems = asStringList(item?.pendingItems);
  const blockers = asStringList(item?.blockers);
  return {
    journeyType: mapFlowToJourneyType(asString(item?.flow)),
    partyRole: asString(item?.flow) === "lead.qualify" ? "buyer" : asString(item?.flow) === "property.create" ? "owner" : "operator",
    commercialGoal: mapFlowToCommercialGoal(asString(item?.flow)),
    recommendedActions: [],
    blockedActions: blockers,
    missingContext: pendingItems,
	    reasonCodes: [
	      ...(blockers.length > 0 ? ["BLOCKERS_PRESENT"] : []),
	      ...(pendingItems.length > 0 ? ["PENDING_ITEMS_PRESENT"] : []),
	      ...(asString(item?.status) === "blocked" ? ["CASE_STATUS_BLOCKED"] : []),
	    ] as ImobReasonCode[],
  };
}

function buildCaseContextFromRecord(item: DocumentCaseLike): ImobCrmCaseContext {
  return buildImobCrmCaseContextFromRecord(item, buildCanonicalCase);
}

function buildAttachmentCrmSuggestionLines(validation: AttachmentValidationResult) {
  if (!validation.crmSuggestion) return validation.card.lines;
  const suggestionLines = validation.crmSuggestion.fields.map((field) => {
    const details = [
      `${field.label}: sugerido ${field.suggestedValue}`,
      field.currentValue ? `atual ${field.currentValue}` : "campo vazio no cadastro",
    ];
    return details.join(" • ");
  });
  return [...validation.card.lines, ...suggestionLines];
}

function buildAttachmentCrmSuggestionCtas(validation: AttachmentValidationResult, caseId: string, threadId?: string | null) {
  if (!validation.crmSuggestion) return undefined;
  const payload = {
    caseId,
    threadId: threadId ?? null,
    documentIds: validation.crmSuggestion.documentIds,
  };
  return [
    { id: "attachment-crm-include", label: "Incluir no cadastro", kind: "primary" as const, action: "apply_attachment_crm_include" as const, payload: { ...payload, mode: "include" } },
    { id: "attachment-crm-edit", label: "Editar cadastro", kind: "secondary" as const, action: "apply_attachment_crm_edit" as const, payload: { ...payload, mode: "edit" } },
    { id: "attachment-crm-discard", label: "Descartar", kind: "neutral" as const, action: "apply_attachment_crm_discard" as const, payload: { ...payload, mode: "discard" } },
  ];
}

function buildAttachmentContextMetadata(params: {
  caseId?: string | null;
  threadId?: string | null;
  conversationId?: string | null;
  resolutionSource: AttachmentContextResolutionSource;
  keepContextUntilStageComplete?: boolean;
}) {
  return {
    context: {
      caseId: params.caseId ?? null,
      threadId: params.threadId ?? null,
      conversationId: params.conversationId ?? null,
      resolutionSource: params.resolutionSource,
      keepContextUntilStageComplete: params.keepContextUntilStageComplete ?? true,
    },
  };
}

function buildOwnerAttachmentConversationStateFromCase(params: {
  imobCase: { flow?: string | null; status?: string | null; pendingItems?: unknown };
  owner: DocumentOwnerLike;
  resolved: boolean;
}) {
  const pendingFromCase = asStringList(params.imobCase.pendingItems);
  const pendingFields = pendingFromCase.includes("documento do proprietário")
    ? pendingFromCase.map((item) => item === "documento do proprietário" ? "ownerDocument" : item)
    : pendingFromCase;
  return {
    mode: "execute",
    pendingSlot: "none",
    resultOffset: 0,
    slots: {},
    operational: {
      flow: params.imobCase.flow === "owner.create" ? "owner.create" : "owner.create",
      status: params.resolved || pendingFields.length === 0
        ? "ready_for_review"
        : (params.imobCase.status === "blocked" ? "blocked" : "collecting"),
      pendingFields,
      ownerDraft: {
        ownerPersona: "proprietario",
        ownerName: asString(params.owner.name),
        ownerPhone: asString(params.owner.phone),
        ownerEmail: asString(params.owner.email),
        ownerDocument: asString(params.owner.document),
      },
    },
  };
}

function buildOwnerAttachmentConversationState(params: {
  owner: DocumentOwnerLike;
  pendingFields: string[];
  resolved: boolean;
}) {
  return {
    mode: "execute",
    pendingSlot: "none",
    resultOffset: 0,
    slots: {},
    operational: {
      flow: "owner.create",
      status: params.pendingFields.length === 0 || params.resolved ? "ready_for_review" : "collecting",
      pendingFields: params.pendingFields,
      ownerDraft: {
        ownerPersona: "proprietario",
        ownerName: asString(params.owner.name),
        ownerPhone: asString(params.owner.phone),
        ownerEmail: asString(params.owner.email),
        ownerDocument: asString(params.owner.document),
      },
    },
  };
}

async function findConversationContextHint(params: {
  prisma: PrismaClient;
  tenantId: string;
  workspaceId: string;
  conversationId: string;
}) {
  const messageRows = await params.prisma.memoryEvent.findMany({
    where: {
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      agentId: "imob-chat",
      key: "conversation.message",
    },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: { metadata: true },
  });

  for (const row of messageRows) {
    const metadata = asObject(row.metadata);
    if (!metadata) continue;
    if (asString(metadata.conversationId) !== params.conversationId) continue;
    const caseContext = asObject(metadata.caseContext);
    const caseId = asString(caseContext?.caseId);
    const threadId = asString(metadata.threadId) ?? asString(caseContext?.threadId);
    return { caseId: caseId ?? null, threadId: threadId ?? null };
  }

  return { caseId: null, threadId: null };
}

function buildAttachmentCrmSuggestionPatch(params: {
  owner: DocumentOwnerLike;
  validation: AttachmentValidationResult;
  mode: "include" | "edit";
}) {
  const suggestion = params.validation.crmSuggestion;
  if (!suggestion) {
    return { data: {}, appliedFields: [] as string[] };
  }

  const metadata = asObject(params.owner.metadata) ?? {};
  const nextMetadata: Record<string, unknown> = { ...metadata };
  const data: Record<string, unknown> = {};
  const appliedFields: string[] = [];

  for (const field of suggestion.fields) {
    const shouldApply = params.mode === "edit" || !field.currentValue;
    if (!shouldApply || !field.suggestedValue) continue;
    if (field.field === "name") {
      data.name = field.suggestedValue;
      appliedFields.push("Nome");
      continue;
    }
    if (field.field === "document") {
      data.document = field.suggestedValue;
      appliedFields.push("CPF");
      continue;
    }
    if (field.field === "rg") {
      nextMetadata.rg = field.suggestedValue;
      appliedFields.push("RG");
    }
  }

  if (appliedFields.includes("RG")) {
    data.metadata = nextMetadata;
  }

  return { data, appliedFields };
}

export class ImobCrmDocumentService {
  constructor(private readonly prisma: PrismaClient) {}

  async resolveAttachment(scope: Scope, params: {
    caseId?: string | null;
    threadId?: string | null;
    conversationId?: string | null;
    documentIds: string[];
    workspaceResponsibleLabel: string;
    canOperateStage: (stage: string | null | undefined) => boolean;
  }) {
    const docs = await this.prisma.uploadedDocument.findMany({
      where: {
        id: { in: params.documentIds },
        tenantId: scope.tenantId,
        agentSlug: "imob",
      },
    });
    if (docs.length !== params.documentIds.length) {
      return { status: "upload_not_found" as const };
    }

    const caseResolution = await this.findCaseWithOwner(scope, params);
    const caseItem = caseResolution.caseItem;
    if (caseItem && !params.canOperateStage(caseItem.stage)) {
      return { status: "stage_forbidden" as const, stage: caseItem.stage };
    }

    if (!caseItem) {
      return {
        status: "ok" as const,
        data: {
          resolved: false,
          presentation: {
            text: caseResolution.source === "identifier_mismatch"
              ? "Documento anexado, mas o contexto informado ficou inconsistente entre conversa, caso e atendimento."
              : "Documento anexado ao contexto desta conversa, mas não encontrei o atendimento certo para seguir com a validação.",
            nextStep: caseResolution.source === "identifier_mismatch"
              ? "Abra o mesmo caso desta conversa e tente novamente sem trocar o atendimento."
              : "Abra o atendimento correto e tente novamente.",
            owner: params.workspaceResponsibleLabel,
            metadata: buildAttachmentContextMetadata({
              caseId: params.caseId ?? null,
              threadId: params.threadId ?? null,
              conversationId: params.conversationId ?? null,
              resolutionSource: caseResolution.source,
            }),
          },
        },
      };
    }

    if (!caseItem.ownerId || !caseItem.owner) {
      return {
        status: "ok" as const,
        data: {
          resolved: false,
          caseContext: buildCaseContextFromRecord(caseItem),
          presentation: {
            text: "Documento anexado ao atendimento atual. Agora complete os dados desta etapa documental.",
            nextStep: "Revise os campos da validação documental e continue o fluxo.",
            owner: params.workspaceResponsibleLabel,
            metadata: buildAttachmentContextMetadata({
              caseId: caseItem.id,
              threadId: caseItem.threadId ?? params.threadId ?? null,
              conversationId: params.conversationId ?? null,
              resolutionSource: caseResolution.source,
            }),
          },
        },
      };
    }

    const ownerPending = asStringList(caseItem.owner.pendingItems);
    const shouldResolveOwnerDocument = caseItem.flow === "owner.create" || ownerPending.includes("ownerDocument") || ownerPending.includes("documento do proprietário");
    if (!shouldResolveOwnerDocument) {
      return {
        status: "ok" as const,
        data: {
          resolved: false,
          caseContext: buildCaseContextFromRecord(caseItem),
          conversationState: buildOwnerAttachmentConversationState({
            owner: caseItem.owner,
            pendingFields: ownerPending,
            resolved: false,
          }),
          presentation: {
            text: "Documento anexado ao atendimento atual. Ainda não é possível usar este anexo nesta etapa.",
            nextStep: "Revise as pendências deste atendimento e siga para a próxima etapa.",
            owner: params.workspaceResponsibleLabel,
            metadata: buildAttachmentContextMetadata({
              caseId: caseItem.id,
              threadId: caseItem.threadId ?? params.threadId ?? null,
              conversationId: params.conversationId ?? null,
              resolutionSource: caseResolution.source,
            }),
          },
        },
      };
    }

    const validationOwnerName = await resolveOwnerDisplayName({
      prisma: this.prisma,
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      owner: caseItem.owner,
    });
    const validation = await validateImobIdentityAttachmentAgainstCase({
      docs,
      caseItem: { ...caseItem, owner: { ...caseItem.owner, name: validationOwnerName } },
    });

    const nextOwnerPending = validation.resolved
      ? ownerPending.filter((item) => item !== "ownerDocument" && item !== "documento do proprietário")
      : ownerPending;
    const nextOwnerStatus = nextOwnerPending.length > 0 ? "pending_data" : "ready_for_review";
    const nextCasePending = validation.resolved
      ? asStringList(caseItem.pendingItems).filter((item) => item !== "ownerDocument" && item !== "documento do proprietário")
      : asStringList(caseItem.pendingItems);
    const nextCaseStatus = nextCasePending.length > 0 ? "pending_data" : "ready_for_review";
    const resolvedNextStep = nextCasePending.length > 0
      ? "Completar os dados restantes do proprietário antes de avançar a captação."
      : "Vincular o proprietário ao próximo imóvel ou etapa documental.";

    const updated = await this.prisma.$transaction(async (tx) => {
      const extractedCpf = asString(validation.extracted?.cpf);
      const ownerDocumentToPersist = extractedCpf ?? asString(caseItem.owner?.document);
      const owner = validation.resolved
        ? await tx.imobOwner.update({
            where: { id: caseItem.ownerId! },
            data: {
              status: nextOwnerStatus,
              pendingItems: nextOwnerPending,
              ...(ownerDocumentToPersist ? { document: ownerDocumentToPersist } : {}),
            },
          })
        : caseItem.owner!;

      const imobCase = await tx.imobCase.update({
        where: { id: caseItem.id },
        data: {
          ...(validation.resolved
            ? {
                stage: nextCaseStatus,
                status: nextCaseStatus,
                pendingItems: nextCasePending,
                nextStep: resolvedNextStep,
              }
            : {}),
          ownerResponsible: params.workspaceResponsibleLabel,
        },
      });

      await tx.imobCaseEvent.create({
        data: {
          imobCase: { connect: { id: caseItem.id } },
          tenant: { connect: { id: scope.tenantId } },
          workspace: { connect: { id: scope.workspaceId } },
          type: validation.eventType,
          actorType: "user",
          actorRef: null,
          summary: validation.eventSummary,
          evidenceRef: validation.document?.id ?? docs[0]?.id ?? null,
          payload: {
            documentIds: params.documentIds,
            fileNames: docs.map((item) => item.fileName),
            ownerId: caseItem.ownerId,
            validation: {
              contractId: validation.contract.id,
              decision: validation.decision,
              resolved: validation.resolved,
              fields: validation.fields,
              extracted: validation.extracted,
              crmSuggestion: validation.crmSuggestion,
              photoDocumentId: validation.photo?.id ?? null,
              primaryDocumentId: validation.document?.id ?? null,
            },
          },
        },
      });

      return { owner, imobCase };
    });

    return {
      status: "ok" as const,
      data: {
        resolved: validation.resolved,
        caseContext: this.buildUpdatedCaseContext({
          imobCase: updated.imobCase,
          workspaceResponsibleLabel: params.workspaceResponsibleLabel,
          nextStep: updated.imobCase.nextStep ?? validation.nextStep,
          blocker: validation.resolved ? null : "Validação documental pendente de revisão.",
          pendingItems: nextCasePending,
          canonicalBlockers: validation.resolved ? [] : ["document_review_pending"],
        }),
        conversationState: buildOwnerAttachmentConversationState({
          owner: updated.owner as DocumentOwnerLike,
          pendingFields: nextOwnerPending,
          resolved: validation.resolved,
        }),
        presentation: {
          text: [
            validation.summary,
            validation.crmSuggestion ? "Posso incluir, editar ou descartar esta sugestão no cadastro." : null,
            `Próximo passo: ${validation.resolved ? resolvedNextStep : validation.nextStep}`,
          ].filter(Boolean).join("\n"),
          card: {
            ...validation.card,
            lines: buildAttachmentCrmSuggestionLines(validation),
            ctas: buildAttachmentCrmSuggestionCtas(validation, updated.imobCase.id, updated.imobCase.threadId ?? params.threadId ?? null),
          },
          owner: updated.imobCase.ownerResponsible ?? params.workspaceResponsibleLabel,
          nextStep: validation.resolved ? resolvedNextStep : validation.nextStep,
          blocker: validation.resolved ? null : "Validação documental pendente de revisão.",
          pendingFieldLabels: validation.resolved
            ? nextOwnerPending.map((item) => item === "ownerDocument" ? "documento do proprietário" : item)
            : ["revisão documental do proprietário"],
          dedupeKey: validation.dedupeKey,
          metadata: buildAttachmentContextMetadata({
            caseId: updated.imobCase.id,
            threadId: updated.imobCase.threadId ?? params.threadId ?? null,
            conversationId: params.conversationId ?? null,
            resolutionSource: caseResolution.source,
          }),
        },
      },
    };
  }

  async applyCrmSuggestion(scope: Scope, params: {
    caseId?: string | null;
    threadId?: string | null;
    conversationId?: string | null;
    documentIds: string[];
    mode: "include" | "edit" | "discard";
    workspaceResponsibleLabel: string;
    canOperateStage: (stage: string | null | undefined) => boolean;
  }) {
    const docs = await this.prisma.uploadedDocument.findMany({
      where: {
        id: { in: params.documentIds },
        tenantId: scope.tenantId,
        agentSlug: "imob",
      },
    });
    if (docs.length !== params.documentIds.length) {
      return { status: "upload_not_found" as const };
    }

    const caseResolution = await this.findCaseWithOwner(scope, params);
    const caseItem = caseResolution.caseItem;
    if (!caseItem || !caseItem.ownerId || !caseItem.owner) {
      return { status: "case_not_found" as const };
    }
    if (!params.canOperateStage(caseItem.stage)) {
      return { status: "stage_forbidden" as const, stage: caseItem.stage };
    }

    const validationOwnerName = await resolveOwnerDisplayName({
      prisma: this.prisma,
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      owner: caseItem.owner,
    });
    const validation = await validateImobIdentityAttachmentAgainstCase({
      docs,
      caseItem: { ...caseItem, owner: { ...caseItem.owner, name: validationOwnerName } },
    });
    if (!validation.crmSuggestion) {
      return {
        status: "ok" as const,
        data: {
          applied: false,
          caseContext: buildCaseContextFromRecord(caseItem),
          presentation: {
            text: "Li o documento, mas não encontrei novos dados para sugerir no cadastro.",
            owner: params.workspaceResponsibleLabel,
            nextStep: "Anexe outro documento ou continue o cadastro manualmente.",
            dedupeKey: `${validation.dedupeKey}:crm-suggestion:none`,
            metadata: buildAttachmentContextMetadata({
              caseId: caseItem.id,
              threadId: caseItem.threadId ?? params.threadId ?? null,
              conversationId: params.conversationId ?? null,
              resolutionSource: caseResolution.source,
            }),
            card: {
              title: "Sugestão de cadastro",
              lines: ["Nenhum campo novo foi identificado para inclusão ou edição no cadastro."],
            },
          },
        },
      };
    }

    const patch = params.mode === "discard"
      ? { data: {}, appliedFields: [] as string[] }
      : buildAttachmentCrmSuggestionPatch({ owner: caseItem.owner, validation, mode: params.mode });

    const updated = await this.prisma.$transaction(async (tx) => {
      const owner = params.mode === "discard" || Object.keys(patch.data).length === 0
        ? caseItem.owner!
        : await tx.imobOwner.update({
            where: { id: caseItem.ownerId! },
            data: patch.data as any,
          });

      const imobCase = await tx.imobCase.update({
        where: { id: caseItem.id },
        data: {
          ownerResponsible: params.workspaceResponsibleLabel,
        },
      });

      await tx.imobCaseEvent.create({
        data: {
          imobCase: { connect: { id: caseItem.id } },
          tenant: { connect: { id: scope.tenantId } },
          workspace: { connect: { id: scope.workspaceId } },
          type: params.mode === "discard" ? "case.crm_suggestion_discarded" : "case.crm_suggestion_applied",
          actorType: "user",
          actorRef: null,
          summary: params.mode === "discard"
            ? `Sugestão de cadastro do proprietário ${validationOwnerName ?? caseItem.owner?.name ?? "proprietário"} descartada.`
            : `Sugestão de cadastro do proprietário ${validationOwnerName ?? caseItem.owner?.name ?? "proprietário"} aplicada em modo ${params.mode}.`,
          evidenceRef: validation.document?.id ?? docs[0]?.id ?? null,
          payload: {
            mode: params.mode,
            documentIds: params.documentIds,
            fileNames: docs.map((item) => item.fileName),
            ownerId: caseItem.ownerId,
            crmSuggestion: validation.crmSuggestion,
            extracted: validation.extracted,
            appliedFields: patch.appliedFields,
            appliedData: patch.data as any,
          },
        },
      });

      return { owner, imobCase };
    });

    const appliedText = params.mode === "discard"
      ? "Sugestão descartada. Mantive o cadastro atual sem alterações."
      : patch.appliedFields.length > 0
        ? params.mode === "include"
          ? `Incluí no CRM os campos vazios preenchidos pelo documento: ${patch.appliedFields.join(", ")}.`
          : `Editei no cadastro os campos confirmados pelo documento: ${patch.appliedFields.join(", ")}.`
        : params.mode === "include"
          ? "Nenhum campo vazio precisava de inclusão no cadastro."
          : "Nenhum campo precisou ser alterado no cadastro com base nesta sugestão.";

    return {
      status: "ok" as const,
      data: {
        applied: params.mode !== "discard" && patch.appliedFields.length > 0,
        caseContext: this.buildUpdatedCaseContext({
          imobCase: updated.imobCase,
          workspaceResponsibleLabel: params.workspaceResponsibleLabel,
          nextStep: updated.imobCase.nextStep ?? validation.nextStep,
          blocker: validation.resolved ? null : "Validação documental pendente de revisão.",
          pendingItems: asStringList(updated.imobCase.pendingItems),
          canonicalBlockers: validation.resolved ? [] : ["document_review_pending"],
        }),
        conversationState: buildOwnerAttachmentConversationStateFromCase({
          imobCase: updated.imobCase,
          owner: updated.owner as DocumentOwnerLike,
          resolved: false,
        }),
        presentation: {
          text: [
            appliedText,
          ].join("\n"),
          owner: updated.imobCase.ownerResponsible ?? params.workspaceResponsibleLabel,
          nextStep: params.mode === "discard"
            ? "Continue com o cadastro manual ou descarte o documento se ele não for útil."
            : "Revise o cadastro do proprietário e siga com a próxima etapa do caso.",
          dedupeKey: `${validation.dedupeKey}:crm-suggestion:${params.mode}`,
          card: {
            title: params.mode === "discard" ? "Sugestão descartada" : params.mode === "include" ? "Cadastro atualizado" : "Cadastro editado",
            lines: [
              appliedText,
              ...validation.crmSuggestion.fields
                .filter((field) => typeof field.suggestedValue === "string" && field.suggestedValue.trim().length > 0)
                .filter((field) => params.mode === "discard" || patch.appliedFields.length === 0 || patch.appliedFields.includes(field.label))
                .map((field) => `${field.label}: sugerido ${field.suggestedValue}${field.currentValue ? ` • anterior ${field.currentValue}` : ""}`),
            ],
          },
          metadata: buildAttachmentContextMetadata({
            caseId: updated.imobCase.id,
            threadId: updated.imobCase.threadId ?? params.threadId ?? null,
            conversationId: params.conversationId ?? null,
            resolutionSource: caseResolution.source,
          }),
        },
      },
    };
  }

  private async findCaseWithOwner(scope: Scope, params: { caseId?: string | null; threadId?: string | null; conversationId?: string | null }) {
    const scopedCaseId = asString(params.caseId);
    const scopedThreadId = asString(params.threadId);
    const scopedConversationId = asString(params.conversationId);

    const byCaseId = scopedCaseId
      ? await this.prisma.imobCase.findFirst({
          where: { id: scopedCaseId, tenantId: scope.tenantId, workspaceId: scope.workspaceId },
          include: { owner: true },
        })
      : null;
    const byThreadId = scopedThreadId
      ? await this.prisma.imobCase.findFirst({
          where: { threadId: scopedThreadId, tenantId: scope.tenantId, workspaceId: scope.workspaceId },
          orderBy: { updatedAt: "desc" },
          include: { owner: true },
        })
      : null;

    const conversationHint = scopedConversationId
      ? await findConversationContextHint({
          prisma: this.prisma,
          tenantId: scope.tenantId,
          workspaceId: scope.workspaceId,
          conversationId: scopedConversationId,
        })
      : { caseId: null, threadId: null };
    const byConversationCase = conversationHint.caseId
      ? await this.prisma.imobCase.findFirst({
          where: { id: conversationHint.caseId, tenantId: scope.tenantId, workspaceId: scope.workspaceId },
          include: { owner: true },
        })
      : null;
    const byConversationThread = !byConversationCase && conversationHint.threadId
      ? await this.prisma.imobCase.findFirst({
          where: { threadId: conversationHint.threadId, tenantId: scope.tenantId, workspaceId: scope.workspaceId },
          orderBy: { updatedAt: "desc" },
          include: { owner: true },
        })
      : null;

    const explicitCandidates = [byCaseId, byThreadId, byConversationCase, byConversationThread]
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
    const distinctExplicitIds = Array.from(new Set(explicitCandidates.map((item) => item.id)));
    if (distinctExplicitIds.length > 1) {
      return { caseItem: null, source: "identifier_mismatch" as const };
    }

    const resolvedExplicit = explicitCandidates[0] ?? null;
    if (resolvedExplicit) {
      if (byCaseId) return { caseItem: byCaseId, source: "case_id" as const };
      if (byThreadId) return { caseItem: byThreadId, source: "thread_id" as const };
      if (byConversationCase) return { caseItem: byConversationCase, source: "conversation_case_context" as const };
      if (byConversationThread) return { caseItem: byConversationThread, source: "conversation_thread" as const };
    }

    if (scopedCaseId || scopedThreadId || scopedConversationId) {
      return { caseItem: null, source: "not_found" as const };
    }

    // Fallback operacional apenas quando nenhum identificador explícito foi enviado.
    const fallbackCase = await this.prisma.imobCase.findFirst({
      where: {
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
        flow: { in: ["owner.create", "documents.collect"] },
        status: { in: ["pending_data", "blocked", "ready_for_review"] },
      },
      orderBy: { updatedAt: "desc" },
      include: { owner: true },
    });
    return { caseItem: fallbackCase ?? null, source: fallbackCase ? "recent_operational_fallback" as const : "not_found" as const };
  }

  private buildUpdatedCaseContext(params: {
    imobCase: UpdatedCaseContextParams["imobCase"];
    workspaceResponsibleLabel: string;
    nextStep: string | null;
    blocker: string | null;
    pendingItems: string[];
    canonicalBlockers: string[];
  }) {
    return {
      caseId: params.imobCase.id,
      flow: params.imobCase.flow,
      stage: params.imobCase.stage,
      status: params.imobCase.status,
      ownerResponsible: params.imobCase.ownerResponsible ?? params.workspaceResponsibleLabel,
      nextStep: params.nextStep,
      blocker: params.blocker,
      pendingItems: params.pendingItems,
      threadId: params.imobCase.threadId ?? null,
      updatedAt: params.imobCase.updatedAt.toISOString(),
      canonical: buildCanonicalCase({
        flow: params.imobCase.flow,
        stage: params.imobCase.stage,
        status: params.imobCase.status,
        ownerResponsible: params.imobCase.ownerResponsible ?? params.workspaceResponsibleLabel,
        nextStep: params.nextStep,
        blockers: params.canonicalBlockers,
        pendingItems: params.pendingItems,
      }),
    };
  }
}
