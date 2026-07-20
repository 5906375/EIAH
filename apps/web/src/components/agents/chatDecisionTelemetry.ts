import type { HelpdeskSessionCreatePayload } from "@/lib/api";
import {
  PRESENTATION_SNAPSHOT_VERSION,
  type MessagePresentationSnapshot,
} from "@/components/agents/chatPresentationSnapshot";

export type LauncherPersistedIntent = HelpdeskSessionCreatePayload["intent"];

type LauncherIntentResultLike = {
  intent: string;
  confidence: number;
  fallbackReason?: string | null;
};

type LauncherDecisionTelemetryLike = {
  kind: string;
  presentationRouteIntent: MessagePresentationSnapshot["routeIntent"] | "self_intro" | "capabilities_summary" | "legal_handoff";
  proposalDomain?: MessagePresentationSnapshot["proposalDomain"];
  conversationStage?: MessagePresentationSnapshot["conversationStage"];
  proposalContextRecovered?: boolean;
  proposalContextLost?: boolean;
  proposalDomainMismatch?: boolean;
  persistIntent?: {
    intent: string;
    confidenceFloor?: number;
  };
};

export function normalizeLauncherPersistedIntentResult(params: {
  intentResult: LauncherIntentResultLike;
  decision?: LauncherDecisionTelemetryLike | null;
}): {
  intent: LauncherPersistedIntent;
  confidence: number;
  fallbackReason?: string;
} {
  const persistedIntent = params.decision?.persistIntent?.intent;
  const confidenceFloor = params.decision?.persistIntent?.confidenceFloor;

  if (persistedIntent === "unknown") {
    return {
      intent: "unknown",
      confidence: params.intentResult.confidence,
      fallbackReason: params.intentResult.fallbackReason ?? "local_safe_fallback",
    };
  }

  if (persistedIntent === "help" || persistedIntent === "proposal" || persistedIntent === "product_explain") {
    return {
      intent: persistedIntent,
      confidence:
        typeof confidenceFloor === "number"
          ? Math.max(params.intentResult.confidence, confidenceFloor)
          : params.intentResult.confidence,
    };
  }

  const normalizedIntent: LauncherPersistedIntent =
    params.intentResult.intent === "help" ||
    params.intentResult.intent === "proposal" ||
    params.intentResult.intent === "product_explain" ||
    params.intentResult.intent === "unknown"
      ? params.intentResult.intent
      : "unknown";

  return {
    intent: normalizedIntent,
    confidence: params.intentResult.confidence,
    fallbackReason: normalizedIntent === "unknown" ? params.intentResult.fallbackReason ?? undefined : undefined,
  };
}

export function buildLauncherDecisionTelemetry(params: {
  decision: LauncherDecisionTelemetryLike;
}) {
  return {
    responseRejected:
      params.decision.kind === "contextual_fallback" || params.decision.kind === "proposal_fallback_reply",
    fallbackUsed:
      params.decision.kind === "contextual_fallback" || params.decision.kind === "proposal_fallback_reply",
    clarificationIssued: params.decision.kind === "clarification",
    handoffOffered: params.decision.presentationRouteIntent === "legal_handoff",
    handoffEligible:
      params.decision.kind === "legal_context_entry" ||
      params.decision.kind === "legal_handoff",
    genericTutorialObserved: params.decision.kind === "orchestrator_guidance",
    proposalDomain: params.decision.proposalDomain ?? null,
    conversationStage: params.decision.conversationStage ?? null,
    proposalContextRecovered: params.decision.proposalContextRecovered ?? false,
    proposalContextLost: params.decision.proposalContextLost ?? false,
    proposalDomainMismatch: params.decision.proposalDomainMismatch ?? false,
  };
}

export type LauncherPersistenceTelemetry = ReturnType<typeof buildLauncherDecisionTelemetry> & {
  quickReplyUsed: boolean;
};

export function buildLauncherPersistenceTelemetry(params: {
  decision: LauncherDecisionTelemetryLike;
  quickReplyUsed?: boolean;
}): LauncherPersistenceTelemetry {
  return {
    ...buildLauncherDecisionTelemetry({
      decision: params.decision,
    }),
    quickReplyUsed: params.quickReplyUsed ?? false,
  };
}

export function buildLauncherHelpdeskSessionPayload(params: {
  tenantId?: string | null;
  workspaceId?: string | null;
  runId?: string | null;
  message: string;
  response: string;
  intentResult: {
    intent: LauncherPersistedIntent;
    confidence: number;
    fallbackReason?: string | null;
  };
  responseRejected?: boolean;
  fallbackUsed?: boolean;
  clarificationIssued?: boolean;
  handoffOffered?: boolean;
  handoffEligible?: boolean;
  quickReplyUsed?: boolean;
  quickRepliesShown?: number;
  routeIntent?: MessagePresentationSnapshot["routeIntent"] | null;
  verticalContext?: MessagePresentationSnapshot["verticalContext"];
  proposalDomain?: MessagePresentationSnapshot["proposalDomain"];
  conversationStage?: MessagePresentationSnapshot["conversationStage"];
  proposalContextRecovered?: boolean;
  proposalContextLost?: boolean;
  proposalDomainMismatch?: boolean;
  recommendedPlan?: string | null;
  estimatedValue?: number | null;
  persist?: boolean;
  rolloutStage: string;
  threadKey: string;
  activeAgentId: string;
  activeAgentName: string;
  chatRuntimeReadiness: string;
  chatRuntimeResolver: string;
  chatRuntimeMissingFields: string[];
  attachmentOffered: boolean;
  attachmentKinds: string[];
  attachmentIntakeModes: string[];
  attachmentAnalysisModes: string[];
  attachmentUsed: boolean;
  attachmentMode?: string | null;
}): HelpdeskSessionCreatePayload | null {
  if (!params.tenantId || !params.workspaceId) return null;

  const shouldPersist =
    params.persist === true ||
    Boolean(params.runId) ||
    Boolean(params.responseRejected) ||
    Boolean(params.fallbackUsed) ||
    params.recommendedPlan != null ||
    params.estimatedValue != null;
  if (!shouldPersist) return null;

  return {
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    runId: params.runId ?? null,
    intent: params.intentResult.intent,
    confidence: params.intentResult.confidence,
    fallbackReason: params.intentResult.fallbackReason ?? null,
    message: params.message,
    response: params.response,
    recommendedPlan: params.recommendedPlan ?? null,
    estimatedValue: params.estimatedValue ?? null,
    metadata: {
      rolloutStage: params.rolloutStage,
      threadKey: params.threadKey,
      activeAgentId: params.activeAgentId,
      activeAgentName: params.activeAgentName,
      chatRuntimeReadiness: params.chatRuntimeReadiness,
      chatRuntimeResolver: params.chatRuntimeResolver,
      chatRuntimeMissingFields: params.chatRuntimeMissingFields,
      routeIntent: params.routeIntent ?? null,
      verticalContext: params.verticalContext ?? null,
      proposalDomain: params.proposalDomain ?? null,
      conversationStage: params.conversationStage ?? null,
      proposalContextRecovered: params.proposalContextRecovered ?? false,
      proposalContextLost: params.proposalContextLost ?? false,
      proposalDomainMismatch: params.proposalDomainMismatch ?? false,
      snapshotVersion: params.routeIntent ? PRESENTATION_SNAPSHOT_VERSION : null,
      compatibilityMode: params.routeIntent ? "snapshot" : "legacy_conservative",
      quickRepliesShown: params.quickRepliesShown ?? 0,
      quickReplyUsed: params.quickReplyUsed ?? false,
      clarificationIssued: params.clarificationIssued ?? false,
      handoffOffered: params.handoffOffered ?? false,
      handoffEligible: params.handoffEligible ?? false,
      attachmentOffered: params.attachmentOffered,
      attachmentKinds: params.attachmentKinds,
      attachmentIntakeModes: params.attachmentIntakeModes,
      attachmentAnalysisModes: params.attachmentAnalysisModes,
      attachmentUsed: params.attachmentUsed,
      attachmentMode: params.attachmentMode ?? null,
      responseRejected: params.responseRejected ?? false,
      fallbackUsed: params.fallbackUsed ?? false,
    },
  };
}
