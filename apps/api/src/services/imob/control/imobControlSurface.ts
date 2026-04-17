import type {
  ImobBackingSpecialistOutputType,
  ImobCaseContext,
  ImobResolvedBackingSpecialist,
} from "../imobConversationContract";
import { IMOB_REASON_CODE_CATALOG, isImobReasonCode, type ImobReasonCode } from "./imobReasonCodeCatalog";

export type ImobControlSurfaceSpecialist = {
  specialistId: string;
  reasonCode: ImobReasonCode;
  urgency?: "low" | "medium" | "high" | null;
  suggestedAction?: string | null;
  outputType?: ImobBackingSpecialistOutputType;
};

export type ImobControlSurface = {
  caseId: string;
  threadId?: string | null;
  humanJourneyPhase?: string | null;
  currentObjective?: string | null;
  waitingOn?: "lead" | "owner" | "broker" | "legal" | "finance" | "internal" | null;
  urgency?: "low" | "medium" | "high" | "critical" | null;
  agingHours?: number | null;
  followUpRisk?: "low" | "medium" | "high" | null;
  nextActionOwner?: string | null;
  doneDefinition?: string | null;
  likelyFailureMode?: string | null;
  nextStep?: string | null;
  blocker?: string | null;
  specialists: ImobControlSurfaceSpecialist[];
};

function normalizeReasonCode(
  specialist: ImobResolvedBackingSpecialist
): ImobReasonCode | null {
  if (isImobReasonCode(specialist.reasonCode)) return specialist.reasonCode;
  const fallback = specialist.primaryAgentId
    ? Object.values(IMOB_REASON_CODE_CATALOG).find((item) => item.defaultSpecialist === specialist.primaryAgentId)
    : null;
  return fallback?.code ?? null;
}

function mapSpecialists(
  specialists: ImobResolvedBackingSpecialist[] | null | undefined
): ImobControlSurfaceSpecialist[] {
  if (!Array.isArray(specialists)) return [];
  return specialists
    .map((item) => {
      const reasonCode = normalizeReasonCode(item);
      if (!reasonCode) return null;
      return {
        specialistId: item.primaryAgentId,
        reasonCode,
        urgency: item.urgency ?? IMOB_REASON_CODE_CATALOG[reasonCode].defaultUrgency,
        suggestedAction: item.suggestedAction ?? null,
        outputType: item.outputType,
      };
    })
    .filter((item): item is ImobControlSurfaceSpecialist => Boolean(item));
}

export function buildImobControlSurface(params: {
  caseContext: ImobCaseContext;
  specialists?: ImobResolvedBackingSpecialist[] | null;
}): ImobControlSurface {
  const { caseContext } = params;
  return {
    caseId: caseContext.caseId,
    threadId: caseContext.threadId ?? null,
    humanJourneyPhase: caseContext.humanJourney?.phase ?? null,
    currentObjective: caseContext.humanWorkflow?.currentObjective ?? null,
    waitingOn: caseContext.humanWorkflow?.waitingOn ?? null,
    urgency: caseContext.humanWorkflow?.urgency ?? null,
    agingHours: caseContext.humanWorkflow?.agingHours ?? null,
    followUpRisk: caseContext.humanWorkflow?.followUpRisk ?? null,
    nextActionOwner: caseContext.humanWorkflow?.nextActionOwner ?? null,
    doneDefinition: caseContext.humanWorkflow?.doneDefinition ?? null,
    likelyFailureMode: caseContext.humanWorkflow?.likelyFailureMode ?? null,
    nextStep: caseContext.nextStep ?? null,
    blocker: caseContext.blocker ?? null,
    specialists: mapSpecialists(params.specialists),
  };
}
