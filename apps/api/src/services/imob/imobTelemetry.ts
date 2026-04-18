const IMOB_CHAT_TELEMETRY_KEY = "conversation.telemetry";

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function isConsultLikeImobMessage(message: string) {
  const normalized = message.trim().toLowerCase();
  if (!normalized) return false;
  return (
    normalized.startsWith("como ") ||
    normalized.startsWith("quando ") ||
    normalized.startsWith("quais ") ||
    normalized.startsWith("qual ") ||
    normalized.startsWith("o que ") ||
    normalized.startsWith("que documentos") ||
    normalized.startsWith("preciso ") ||
    normalized.includes(" blocker ") ||
    normalized.includes(" bloqueio ") ||
    normalized.includes(" waiting on ") ||
    normalized.includes(" próximo passo") ||
    normalized.includes(" proximo passo")
  );
}

type MemoryEventWriter = {
  memoryEvent: {
    create: (params: {
      data: {
        tenantId: string;
        workspaceId: string;
        agentId: string;
        runId: string | null;
        key: string;
        content: string;
        metadata: Record<string, unknown>;
      };
    }) => Promise<unknown>;
  };
};

type ImobSemanticTelemetryEvent =
  | "imob_guidance_resolved"
  | "imob_guidance_fell_back_to_form"
  | "imob_consultive_case_read"
  | "imob_specialist_suggested"
  | "imob_approval_context_presented"
  | "imob_approval_context_completed";

export const IMOB_CHAT_TELEMETRY_EVENTS = {
  guidanceResolved: "imob_guidance_resolved",
  guidanceFellBackToForm: "imob_guidance_fell_back_to_form",
  consultiveCaseRead: "imob_consultive_case_read",
  specialistSuggested: "imob_specialist_suggested",
  approvalContextPresented: "imob_approval_context_presented",
  approvalContextCompleted: "imob_approval_context_completed",
} as const satisfies Record<string, ImobSemanticTelemetryEvent>;

type ImobSemanticTelemetryBase = {
  prisma: MemoryEventWriter;
  tenantId: string;
  workspaceId: string;
  agentId: string;
  runId?: string | null;
};

export async function recordImobSemanticTelemetry(
  params: ImobSemanticTelemetryBase & {
    event: ImobSemanticTelemetryEvent;
    value?: number;
    metadata?: Record<string, unknown>;
  },
) {
  const value = Number.isFinite(params.value) ? Number(params.value) : 1;
  await params.prisma.memoryEvent.create({
    data: {
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      agentId: params.agentId,
      runId: params.runId ?? null,
      key: IMOB_CHAT_TELEMETRY_KEY,
      content: `${params.event}:${value}`,
      metadata: {
        event: params.event,
        value,
        ...(params.metadata ?? {}),
      },
    },
  });
}

function getJourneyType(caseContext: Record<string, unknown> | null) {
  const canonical = asObject(caseContext?.canonical);
  return asString(canonical?.journeyType) ?? "unknown";
}

function getStage(caseContext: Record<string, unknown> | null) {
  const humanJourney = asObject(caseContext?.humanJourney);
  return asString(humanJourney?.phase) ?? asString(caseContext?.stage) ?? "unknown";
}

function getCaseId(caseContext: Record<string, unknown> | null, fallbackCaseId?: string | null) {
  return asString(caseContext?.caseId) ?? fallbackCaseId ?? null;
}

function getThreadId(caseContext: Record<string, unknown> | null, fallbackThreadId?: string | null) {
  return asString(caseContext?.threadId) ?? fallbackThreadId ?? null;
}

function getPresentation(resolved: Record<string, unknown>) {
  return asObject(resolved.presentation) ?? {};
}

function getConsultiveRead(resolved: Record<string, unknown>) {
  return asObject(getPresentation(resolved).consultiveRead);
}

function getPresentationForm(resolved: Record<string, unknown>) {
  return asObject(getPresentation(resolved).form);
}

function getAction(resolved: Record<string, unknown>) {
  return asString(resolved.action) ?? "unknown";
}

function getMode(resolved: Record<string, unknown>) {
  return asString(resolved.mode) ?? "unknown";
}

export async function recordImobResolveTurnSemanticTelemetry(
  params: ImobSemanticTelemetryBase & {
    message: string;
    resolved: Record<string, unknown>;
    caseId?: string | null;
    threadId?: string | null;
  },
) {
  const action = getAction(params.resolved);
  const mode = getMode(params.resolved);
  const caseContext = asObject(params.resolved.caseContext);
  const consultiveRead = getConsultiveRead(params.resolved);
  const hasForm = Boolean(getPresentationForm(params.resolved));
  const baseMetadata = {
    action,
    mode,
    journeyType: getJourneyType(caseContext),
    stage: getStage(caseContext),
    caseId: getCaseId(caseContext, params.caseId),
    threadId: getThreadId(caseContext, params.threadId),
  };

  const writes: Promise<unknown>[] = [];

  if (mode === "consult" && (action === "crm.operational_guidance" || action === "crm.domain_guidance")) {
    writes.push(
      recordImobSemanticTelemetry({
        ...params,
        event: IMOB_CHAT_TELEMETRY_EVENTS.guidanceResolved,
        metadata: baseMetadata,
      }),
    );
  }

  if (
    mode === "consult" &&
    (action === "crm.case.pipeline_status" ||
      action === "crm.case.blocked_run_resolution" ||
      action === "crm.case.next_best_action")
  ) {
    writes.push(
      recordImobSemanticTelemetry({
        ...params,
        event: IMOB_CHAT_TELEMETRY_EVENTS.consultiveCaseRead,
        metadata: {
          ...baseMetadata,
          waitingOn: asString(consultiveRead?.waitingOn) ?? null,
          nextActionOwner: asString(consultiveRead?.nextActionOwner) ?? null,
        },
      }),
    );
  }

  if (isConsultLikeImobMessage(params.message) && mode === "execute" && hasForm) {
    writes.push(
      recordImobSemanticTelemetry({
        ...params,
        event: IMOB_CHAT_TELEMETRY_EVENTS.guidanceFellBackToForm,
        metadata: {
          ...baseMetadata,
          formEntity: asString(getPresentationForm(params.resolved)?.entity) ?? null,
          formAction: asString(getPresentationForm(params.resolved)?.action) ?? null,
        },
      }),
    );
  }

  const specialists = Array.isArray(consultiveRead?.specialists) ? consultiveRead.specialists : [];
  for (const specialist of specialists) {
    const specialistObj = asObject(specialist);
    const specialistId = asString(specialistObj?.agentId);
    if (!specialistId) continue;
    writes.push(
      recordImobSemanticTelemetry({
        ...params,
        event: IMOB_CHAT_TELEMETRY_EVENTS.specialistSuggested,
        metadata: {
          ...baseMetadata,
          specialistId,
          reasonCode: asString(specialistObj?.reasonCode) ?? null,
          ownershipBoundary: asString(specialistObj?.ownershipBoundary) ?? null,
        },
      }),
    );
  }

  await Promise.all(writes);
}

export async function recordImobApprovalContextPresentedTelemetry(
  params: ImobSemanticTelemetryBase & {
    items: Array<Record<string, unknown>>;
    limit: number;
  },
) {
  const firstItem = params.items[0] ? asObject(params.items[0]) : null;
  await recordImobSemanticTelemetry({
    ...params,
    event: IMOB_CHAT_TELEMETRY_EVENTS.approvalContextPresented,
    value: params.items.length,
    metadata: {
      itemsCount: params.items.length,
      limit: params.limit,
      journeyType: "approval_context",
      stage: asString(firstItem?.phase) ?? "unknown",
      action: "approval_context.list",
      reasonCode: asString(firstItem?.reasonCode) ?? null,
      specialistId: asString(firstItem?.specialistId) ?? null,
    },
  });
}

export async function recordImobApprovalActionCompletedTelemetry(
  params: ImobSemanticTelemetryBase & {
    action: string;
    caseId: string;
    stage?: string | null;
    reasonCode: string;
    specialistId: string;
    requiresApproval: boolean;
    requiresEvidence: boolean;
  },
) {
  await recordImobSemanticTelemetry({
    ...params,
    event: IMOB_CHAT_TELEMETRY_EVENTS.approvalContextCompleted,
    metadata: {
      journeyType: "approval_context",
      action: `approval_context.${params.action}`,
      stage: params.stage ?? "unknown",
      caseId: params.caseId,
      reasonCode: params.reasonCode,
      specialistId: params.specialistId,
      requiresApproval: params.requiresApproval,
      requiresEvidence: params.requiresEvidence,
    },
  });
}

export { IMOB_CHAT_TELEMETRY_KEY };
