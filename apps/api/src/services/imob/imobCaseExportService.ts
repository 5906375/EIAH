import type { ImobConversationSnapshot } from "./imobCaseSnapshotService";

export type ImobBusinessExport = {
  summary: {
    journeyType: string | null;
    stage: string | null;
    status: string | null;
    nextStep: string | null;
    blocker: string | null;
  };
  opportunities: {
    recommendedActions: string[];
    missingContext: string[];
    blockedActions: string[];
    reasonCodes: string[];
  };
  attachments: {
    uploadedDocuments: number;
    validatedAttachments: number;
  };
  governance: {
    linkedRuns: number;
    linkedReceipts: number;
    linkedBundles: number;
  };
  printableSections: Array<{
    label: string;
    value: string;
  }>;
};

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

export function buildImobBusinessExport(snapshot: ImobConversationSnapshot): ImobBusinessExport {
  const recommendedActions = Array.isArray(snapshot.caseContext?.canonical?.recommendedActions)
    ? snapshot.caseContext?.canonical?.recommendedActions
        ?.map((item) => item?.label?.trim())
        .filter((item): item is string => Boolean(item))
    : [];
  const missingContext = asStringArray(snapshot.caseContext?.canonical?.missingContext);
  const blockedActions = asStringArray(snapshot.caseContext?.canonical?.blockedActions);
  const reasonCodes = asStringArray(snapshot.caseContext?.canonical?.reasonCodes);

  return {
    summary: {
      journeyType: snapshot.caseContext?.canonical?.journeyType ?? null,
      stage: snapshot.caseContext?.stage ?? null,
      status: snapshot.caseContext?.status ?? null,
      nextStep: snapshot.caseContext?.nextStep ?? snapshot.recoveryPrompt ?? null,
      blocker: snapshot.caseContext?.blocker ?? null,
    },
    opportunities: {
      recommendedActions,
      missingContext,
      blockedActions,
      reasonCodes,
    },
    attachments: {
      uploadedDocuments: snapshot.business.uploadedDocuments,
      validatedAttachments: snapshot.business.validatedAttachments,
    },
    governance: {
      linkedRuns: snapshot.business.linkedRuns,
      linkedReceipts: snapshot.business.linkedReceipts,
      linkedBundles: snapshot.business.linkedBundles,
    },
    printableSections: snapshot.printBundle.items,
  };
}
