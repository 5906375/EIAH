import {
  chatVerticalHandoffV2Schema,
  evaluateChatVerticalHandoffV2,
  type ChatVerticalHandoffV2,
  type VerticalCapabilityMode,
  type VerticalHandoffReasonCode,
} from "../types/chatVerticalHandoffV2Contract";
import {
  buildChatVerticalHandoffV2ShadowSnapshot,
  type ChatVerticalHandoffV2ShadowSnapshot,
} from "../types/chatVerticalHandoffV2ShadowSnapshot";
import {
  scoreChatVerticalImobConfidence,
  type ImobConfidenceAssessment,
  type ImobConfidenceSignals,
} from "./chatVerticalImobConfidence";

const IMOB_VERTICAL_ID = "imob" as const;
const IMOB_PREVIEW_CAPABILITY = "inventory.preview" as const;
const UNRESOLVED_REGISTRY_VERSION = "registry-unresolved";
const capabilityIdPattern = /^[a-z][a-z0-9._-]*$/;

type ImobIntentCandidate = {
  verticalId: string | null;
  label?: string | null;
  capabilityId?: string | null;
};

export type ResolveChatVerticalImobCandidateInput = {
  intent: ImobIntentCandidate;
  confidenceSignals: ImobConfidenceSignals;
  registry: unknown;
  handoffId: string;
  refs?: ChatVerticalHandoffV2["refs"];
  governance: ChatVerticalHandoffV2["governance"];
  source?: "fixture" | "shadow";
  mode?: VerticalCapabilityMode;
  outcome?: "preview_only" | "allowed";
};

export type ChatVerticalImobCandidateResolution =
  | {
      status: "not_applicable";
      confidence: ImobConfidenceAssessment;
      clarificationNeeded: false;
      sideEffects: 0;
    }
  | {
      status: "candidate";
      candidate: ChatVerticalHandoffV2;
      snapshot: ChatVerticalHandoffV2ShadowSnapshot;
      confidence: ImobConfidenceAssessment & { level: "high" };
      clarificationNeeded: false;
      sideEffects: 0;
    }
  | {
      status: "clarification_needed";
      candidate: ChatVerticalHandoffV2;
      snapshot: ChatVerticalHandoffV2ShadowSnapshot;
      confidence: ImobConfidenceAssessment & { level: "medium" };
      clarificationNeeded: true;
      sideEffects: 0;
    }
  | {
      status: "blocked";
      reasonCode: VerticalHandoffReasonCode;
      candidate: ChatVerticalHandoffV2 | null;
      snapshot: ChatVerticalHandoffV2ShadowSnapshot | null;
      confidence: ImobConfidenceAssessment;
      clarificationNeeded: false;
      sideEffects: 0;
    };

function registryVersionOf(registry: unknown): string {
  if (typeof registry !== "object" || registry === null || Array.isArray(registry)) {
    return UNRESOLVED_REGISTRY_VERSION;
  }

  const registryVersion = (registry as { registryVersion?: unknown }).registryVersion;
  return typeof registryVersion === "string" && registryVersion.trim().length > 0
    ? registryVersion.trim()
    : UNRESOLVED_REGISTRY_VERSION;
}

function requestedCapabilityIdOf(intent: ImobIntentCandidate): string {
  return intent.capabilityId ?? IMOB_PREVIEW_CAPABILITY;
}

function safeCapabilityIdOf(intent: ImobIntentCandidate): string {
  const requestedCapabilityId = requestedCapabilityIdOf(intent);
  return capabilityIdPattern.test(requestedCapabilityId) ? requestedCapabilityId : IMOB_PREVIEW_CAPABILITY;
}

function buildBlockedResolution(
  input: ResolveChatVerticalImobCandidateInput,
  reasonCode: VerticalHandoffReasonCode,
  confidence: ImobConfidenceAssessment,
): ChatVerticalImobCandidateResolution {
  const candidateResult = chatVerticalHandoffV2Schema.safeParse({
    version: "chat.vertical_handoff.v2",
    handoffId: input.handoffId,
    vertical: {
      id: IMOB_VERTICAL_ID,
      registryVersion: registryVersionOf(input.registry),
    },
    capability: {
      id: safeCapabilityIdOf(input.intent),
      mode: "read_only",
    },
    refs: input.refs ?? {},
    governance: input.governance,
    presentation: {
      source: "shadow",
      variant: "blocked",
    },
    outcome: "blocked",
    reasonCode,
  });

  if (!candidateResult.success) {
    return {
      status: "blocked",
      reasonCode,
      candidate: null,
      snapshot: null,
      confidence,
      clarificationNeeded: false,
      sideEffects: 0,
    };
  }

  const snapshotResult = buildChatVerticalHandoffV2ShadowSnapshot(candidateResult.data);
  return {
    status: "blocked",
    reasonCode,
    candidate: candidateResult.data,
    snapshot: snapshotResult.ok ? snapshotResult.snapshot : null,
    confidence,
    clarificationNeeded: false,
    sideEffects: 0,
  };
}

export function resolveChatVerticalImobCandidate(
  input: ResolveChatVerticalImobCandidateInput,
): ChatVerticalImobCandidateResolution {
  const confidence = scoreChatVerticalImobConfidence({
    verticalId: input.intent.verticalId,
    capabilityId: requestedCapabilityIdOf(input.intent),
    signals: input.confidenceSignals,
  });

  if (input.intent.verticalId !== IMOB_VERTICAL_ID) {
    return {
      status: "not_applicable",
      confidence,
      clarificationNeeded: false,
      sideEffects: 0,
    };
  }

  if (confidence.level === "low") {
    return {
      status: "not_applicable",
      confidence,
      clarificationNeeded: false,
      sideEffects: 0,
    };
  }

  const outcome = input.outcome ?? "preview_only";
  const candidate = {
    version: "chat.vertical_handoff.v2",
    handoffId: input.handoffId,
    vertical: {
      id: IMOB_VERTICAL_ID,
      registryVersion: registryVersionOf(input.registry),
    },
    capability: {
      id: requestedCapabilityIdOf(input.intent),
      mode: input.mode ?? "read_only",
    },
    refs: input.refs ?? {},
    governance: input.governance,
    presentation: {
      source: input.source ?? "shadow",
      variant: "result_list",
    },
    outcome,
    reasonCode: outcome === "allowed" ? "VERTICAL_HANDOFF_ALLOWED" : "VERTICAL_PREVIEW_ONLY",
  };

  const evaluation = evaluateChatVerticalHandoffV2(input.registry, candidate);
  if (!evaluation.ok) {
    return buildBlockedResolution(input, evaluation.reasonCode, confidence);
  }

  const snapshotResult = buildChatVerticalHandoffV2ShadowSnapshot(evaluation.handoff);
  if (!snapshotResult.ok) {
    return buildBlockedResolution(input, snapshotResult.reasonCode, confidence);
  }

  if (confidence.level === "medium") {
    const mediumConfidence = { ...confidence, level: "medium" as const };
    return {
      status: "clarification_needed",
      candidate: evaluation.handoff,
      snapshot: snapshotResult.snapshot,
      confidence: mediumConfidence,
      clarificationNeeded: true,
      sideEffects: 0,
    };
  }

  const highConfidence = { ...confidence, level: "high" as const };
  return {
    status: "candidate",
    candidate: evaluation.handoff,
    snapshot: snapshotResult.snapshot,
    confidence: highConfidence,
    clarificationNeeded: false,
    sideEffects: 0,
  };
}
