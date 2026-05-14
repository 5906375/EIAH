import {
  listAllImobCapabilities,
  type ImobCapabilityRegistryEntry,
  type ImobCapabilityRolloutStage,
} from "./imobCapabilityRegistry";

export type ImobCapabilityGateInput = {
  capabilityId: string;
  consentProvided?: boolean;
  humanApprovalGranted?: boolean;
  evidenceRefsCount?: number;
  policyAccepted?: boolean;
  minimumRolloutStage?: ImobCapabilityRolloutStage;
};

export type ImobCapabilityGateBlockedReason =
  | "capability_not_found"
  | "rollout_stage_blocked"
  | "consent_required"
  | "human_approval_required"
  | "evidence_required"
  | "policy_required";

export type ImobCapabilityGateDecision = {
  allowed: boolean;
  capability: ImobCapabilityRegistryEntry | null;
  reasonCodes: ImobCapabilityGateBlockedReason[];
  decisionTrail: Array<{
    gate: "rollout" | "consent" | "human_approval" | "evidence" | "policy";
    required: boolean;
    satisfied: boolean;
  }>;
  blocked?: {
    code: "IMOB_CAPABILITY_GATED";
    capabilityId: string;
    message: string;
  };
};

function buildGateMessage(params: {
  capabilityId: string;
  reasonCodes: ImobCapabilityGateBlockedReason[];
}) {
  const labels: Record<ImobCapabilityGateBlockedReason, string> = {
    capability_not_found: "capability não encontrada",
    rollout_stage_blocked: "rollout stage insuficiente",
    consent_required: "consentimento obrigatório",
    human_approval_required: "aprovação humana obrigatória",
    evidence_required: "evidência mínima obrigatória",
    policy_required: "policy obrigatória",
  };
  return `Capability ${params.capabilityId} bloqueada: ${params.reasonCodes.map((item) => labels[item]).join(", ")}.`;
}

const ROLLOUT_STAGE_ORDER: Record<ImobCapabilityRolloutStage, number> = {
  backlog: 0,
  design: 1,
  shadow: 2,
  pilot: 3,
  small: 4,
  broad: 5,
};

export function resolveImobCapabilityGate(input: ImobCapabilityGateInput): ImobCapabilityGateDecision {
  const capability = listAllImobCapabilities().find((item) => item.capabilityId === input.capabilityId) ?? null;
  if (!capability) {
    return {
      allowed: false,
      capability: null,
      reasonCodes: ["capability_not_found"],
      decisionTrail: [],
      blocked: {
        code: "IMOB_CAPABILITY_GATED",
        capabilityId: input.capabilityId,
        message: buildGateMessage({
          capabilityId: input.capabilityId,
          reasonCodes: ["capability_not_found"],
        }),
      },
    };
  }

  const decisionTrail = [
    {
      gate: "rollout" as const,
      required: Boolean(input.minimumRolloutStage),
      satisfied: !input.minimumRolloutStage
        || ROLLOUT_STAGE_ORDER[capability.rolloutStage] >= ROLLOUT_STAGE_ORDER[input.minimumRolloutStage],
    },
    {
      gate: "consent" as const,
      required: capability.requiresConsent,
      satisfied: !capability.requiresConsent || Boolean(input.consentProvided),
    },
    {
      gate: "human_approval" as const,
      required: capability.requiresHumanApproval,
      satisfied: !capability.requiresHumanApproval || Boolean(input.humanApprovalGranted),
    },
    {
      gate: "evidence" as const,
      required: capability.requiresEvidence,
      satisfied: !capability.requiresEvidence || (input.evidenceRefsCount ?? 0) > 0,
    },
    {
      gate: "policy" as const,
      required: capability.policyRequired,
      satisfied: !capability.policyRequired || Boolean(input.policyAccepted),
    },
  ];

  const reasonCodes = [
    !decisionTrail[0].satisfied ? "rollout_stage_blocked" : null,
    !decisionTrail[1].satisfied ? "consent_required" : null,
    !decisionTrail[2].satisfied ? "human_approval_required" : null,
    !decisionTrail[3].satisfied ? "evidence_required" : null,
    !decisionTrail[4].satisfied ? "policy_required" : null,
  ].filter(Boolean) as ImobCapabilityGateBlockedReason[];

  if (reasonCodes.length === 0) {
    return {
      allowed: true,
      capability,
      reasonCodes: [],
      decisionTrail,
    };
  }

  return {
    allowed: false,
    capability,
    reasonCodes,
    decisionTrail,
    blocked: {
      code: "IMOB_CAPABILITY_GATED",
      capabilityId: input.capabilityId,
      message: buildGateMessage({
        capabilityId: input.capabilityId,
        reasonCodes,
      }),
    },
  };
}
