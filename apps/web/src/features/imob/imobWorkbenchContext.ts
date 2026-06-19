import type {
  ImobCaseContext,
  ImobContractIntakeDraftWidget,
  ImobContractIntakeResultWidget,
  ImobPresentationWidget,
} from "@/lib/api";

export type ImobWorkbenchMessageCandidate = {
  role: "user" | "assistant" | "system";
  text: string;
  widget?: ImobPresentationWidget;
  caseContext?: ImobCaseContext;
  thread?: {
    id: string;
    label: string;
    status?: "active" | "waiting" | "done" | "blocked";
  };
  card?: {
    thread?: {
      id: string;
      label: string;
      status?: "active" | "waiting" | "done" | "blocked";
    };
  };
};

export type ImobWorkbenchIntakeContext =
  | {
      kind: "draft";
      threadId: string | null;
      threadLabel: string | null;
      caseId: string | null;
      runId: null;
      status: "pending_confirmation";
      stage: "draft_ready";
      nextStep: "Revise o resumo mascarado e confirme o intake para criar o run.";
      pendingItems: string[];
      riskFlags: string[];
      documentHash: string;
      documentKind: ImobContractIntakeDraftWidget["documentKind"];
      contractType: ImobContractIntakeDraftWidget["contractType"];
      draftId: string;
      draftExpiresAt: string;
      extractedFields: Array<{ label: string; value: string; masked: true }>;
    }
  | {
      kind: "result";
      threadId: string | null;
      threadLabel: string | null;
      caseId: string | null;
      runId: string;
      status: string;
      stage: string;
      nextStep: string | null;
      pendingItems: string[];
      riskFlags: string[];
      documentHash: string;
      documentKind: null;
      contractType: null;
      draftId: null;
      draftExpiresAt: null;
      extractedFields: Array<{ label: string; value: string; masked: true }>;
    };

function resolveMessageThread(message: ImobWorkbenchMessageCandidate) {
  return message.thread ?? message.card?.thread ?? null;
}

function buildDraftExtractedFields(widget: ImobContractIntakeDraftWidget) {
  const fields: Array<{ label: string; value: string; masked: true }> = [
    { label: "Tipo do documento", value: widget.documentKind === "lease_contract" ? "Contrato de locação" : "Documento", masked: true },
    {
      label: "Tipo do contrato",
      value:
        widget.contractType === "residential_lease"
          ? "Locação residencial"
          : widget.contractType === "commercial_lease"
            ? "Locação comercial"
            : widget.contractType === "seasonal_lease"
              ? "Locação por temporada"
              : "Não identificado",
      masked: true,
    },
    { label: "Hash do documento", value: widget.documentHash.slice(0, 16), masked: true },
  ];
  return fields;
}

export function extractImobWorkbenchIntakeContext(params: {
  messages: ImobWorkbenchMessageCandidate[];
  preferredThreadId?: string | null;
}): ImobWorkbenchIntakeContext | null {
  const preferredThreadId =
    typeof params.preferredThreadId === "string" && params.preferredThreadId.trim().length > 0
      ? params.preferredThreadId.trim()
      : null;

  for (let index = params.messages.length - 1; index >= 0; index -= 1) {
    const message = params.messages[index];
    if (message.role !== "assistant" || !message.widget) continue;
    const messageThread = resolveMessageThread(message);
    const messageThreadId = messageThread?.id ?? message.caseContext?.threadId ?? null;
    if (preferredThreadId && messageThreadId && preferredThreadId !== messageThreadId) continue;

    if (message.widget.kind === "contract_intake_draft") {
      return {
        kind: "draft",
        threadId: messageThreadId,
        threadLabel: messageThread?.label ?? message.caseContext?.threadId ?? null,
        caseId: message.caseContext?.caseId ?? null,
        runId: null,
        status: "pending_confirmation",
        stage: "draft_ready",
        nextStep: "Revise o resumo mascarado e confirme o intake para criar o run.",
        pendingItems: message.widget.pendingItems,
        riskFlags: message.widget.riskFlags,
        documentHash: message.widget.documentHash,
        documentKind: message.widget.documentKind,
        contractType: message.widget.contractType,
        draftId: message.widget.draftId,
        draftExpiresAt: message.widget.draftExpiresAt,
        extractedFields: buildDraftExtractedFields(message.widget),
      };
    }

    if (message.widget.kind === "contract_intake_result") {
      return {
        kind: "result",
        threadId: messageThreadId,
        threadLabel: messageThread?.label ?? message.caseContext?.threadId ?? null,
        caseId: message.caseContext?.caseId ?? null,
        runId: message.widget.runId,
        status: message.widget.status,
        stage: message.widget.stage,
        nextStep: message.widget.nextStep,
        pendingItems: message.widget.pendingItems,
        riskFlags: message.widget.riskFlags,
        documentHash: message.widget.documentHash,
        documentKind: null,
        contractType: null,
        draftId: null,
        draftExpiresAt: null,
        extractedFields: [],
      };
    }
  }

  return null;
}
