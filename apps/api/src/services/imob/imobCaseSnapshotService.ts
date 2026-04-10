import type {
  ImobCaseContext,
  ImobCaseSummaryWidget,
  ImobDocumentChecklistWidget,
  ImobPresentationWidget,
  ImobPrintBundleWidget,
} from "./imobConversationContract";

type SnapshotMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  threadId?: string | null;
  threadLabel?: string | null;
  threadStatus?: "active" | "done" | "blocked" | null;
  runId?: string | null;
  txId?: string | null;
  receiptPath?: string | null;
  bundlePath?: string | null;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
};

type SnapshotBusinessSection = {
  uploadedDocuments: number;
  validatedAttachments: number;
  linkedRuns: number;
  linkedReceipts: number;
  linkedBundles: number;
};

export type ImobConversationSnapshot = {
  conversationId: string;
  title: string;
  status: string;
  createdAt: string | null;
  lastMessageAt: string | null;
  recoverable: boolean;
  recoveryPrompt: string | null;
  caseContext: ImobCaseContext | null;
  widget: ImobPresentationWidget | null;
  printBundle: ImobPrintBundleWidget;
  business: SnapshotBusinessSection;
};

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function formatJourneyLabel(journeyType?: string | null) {
  const normalized = journeyType?.trim().toLowerCase();
  if (normalized === "property_capture") return "Captação";
  if (normalized === "lead_qualification") return "Lead";
  if (normalized === "proposal") return "Proposta";
  if (normalized === "visit_follow_up") return "Visita";
  if (normalized === "negotiation") return "Negociação";
  if (normalized === "documentation") return "Documentação";
  if (normalized === "contract") return "Contrato";
  if (normalized === "closing") return "Fechamento";
  if (normalized === "commission") return "Comissão";
  if (normalized === "temporada_rules") return "Regras de temporada";
  return "Operação";
}

function extractCaseContext(messages: SnapshotMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const metadata = asObject(messages[index]?.metadata);
    const caseContextCandidate = asObject(metadata?.caseContext);
    if (!caseContextCandidate) continue;
    return caseContextCandidate as unknown as ImobCaseContext;
  }
  return null;
}

function extractRecoveryPrompt(caseContext: ImobCaseContext | null) {
  const recommended = Array.isArray(caseContext?.canonical?.recommendedActions)
    ? caseContext?.canonical?.recommendedActions ?? []
    : [];
  const first = recommended[0];
  return asString(first?.inputHint) ?? asString(first?.label) ?? asString(caseContext?.nextStep) ?? null;
}

function buildRecoveryWidget(caseContext: ImobCaseContext | null): ImobPresentationWidget | null {
  if (!caseContext?.canonical?.journeyType) return null;
  const recommendedActions = Array.isArray(caseContext.canonical.recommendedActions)
    ? caseContext.canonical.recommendedActions
        .map((item) => ({
          id: String(item?.id ?? ""),
          label: String(item?.label ?? "Próxima ação"),
          autoprompt: asString(item?.inputHint) ?? asString(item?.label),
        }))
        .filter((item) => item.id && item.label)
        .slice(0, 3)
    : [];
  const pendingItems = asStringArray(caseContext.pendingItems);
  if (pendingItems.length > 0 || asString(caseContext.blocker)) {
    const widget: ImobDocumentChecklistWidget = {
      kind: "document_checklist",
      title: "Recuperação do caso",
      checklist: pendingItems.slice(0, 6),
      blocker: asString(caseContext.blocker),
      nextStep: asString(caseContext.nextStep),
      specialists: [],
    };
    return widget;
  }

  const widget: ImobCaseSummaryWidget = {
    kind: "case_summary",
    title: "Recuperação do caso",
    journeyLabel: formatJourneyLabel(caseContext.canonical.journeyType),
    stageLabel: asString(caseContext.stage) ?? "andamento operacional",
    nextStep: asString(caseContext.nextStep),
    blocker: asString(caseContext.blocker),
    recommendedActions,
    specialists: [],
  };
  return widget;
}

export function buildImobConversationSnapshot(params: {
  conversationId: string;
  title: string;
  status: string;
  createdAt: string | null;
  messages: SnapshotMessage[];
}): ImobConversationSnapshot {
  const caseContext = extractCaseContext(params.messages);
  const lastMessageAt = params.messages.length > 0 ? params.messages[params.messages.length - 1]?.createdAt ?? null : null;
  const business = params.messages.reduce<SnapshotBusinessSection>(
    (acc, message) => {
      const metadata = asObject(message.metadata);
      const uploadedDocuments = Array.isArray(metadata?.uploadedDocuments) ? metadata?.uploadedDocuments.length : 0;
      const attachmentResolution = asObject(metadata?.attachmentResolution);
      acc.uploadedDocuments += uploadedDocuments;
      if (attachmentResolution) acc.validatedAttachments += 1;
      if (message.runId) acc.linkedRuns += 1;
      if (message.receiptPath) acc.linkedReceipts += 1;
      if (message.bundlePath) acc.linkedBundles += 1;
      return acc;
    },
    {
      uploadedDocuments: 0,
      validatedAttachments: 0,
      linkedRuns: 0,
      linkedReceipts: 0,
      linkedBundles: 0,
    }
  );

  const recoveryPrompt = extractRecoveryPrompt(caseContext);
  const printBundle: ImobPrintBundleWidget = {
    kind: "print_bundle",
    title: "Dossiê rápido do caso",
    items: [
      { label: "Conversa", value: params.title || "Conversa IMOB" },
      { label: "Jornada", value: formatJourneyLabel(caseContext?.canonical?.journeyType) },
      { label: "Etapa", value: asString(caseContext?.stage) ?? "andamento operacional" },
      { label: "Próximo passo", value: asString(caseContext?.nextStep) ?? recoveryPrompt ?? "seguir atendimento" },
      { label: "Documentos anexados", value: String(business.uploadedDocuments) },
      { label: "Recibos vinculados", value: String(business.linkedReceipts) },
    ],
  };

  return {
    conversationId: params.conversationId,
    title: params.title,
    status: params.status,
    createdAt: params.createdAt,
    lastMessageAt,
    recoverable: Boolean(caseContext || recoveryPrompt || business.uploadedDocuments > 0),
    recoveryPrompt,
    caseContext,
    widget: buildRecoveryWidget(caseContext),
    printBundle,
    business,
  };
}
