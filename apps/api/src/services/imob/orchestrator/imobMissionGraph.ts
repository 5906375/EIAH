import type { ImobMissionId, MissionSteps } from "./imobMissionTypes";

export const IMOB_MISSION_TRANSITIONS: {
  [M in ImobMissionId]: Record<MissionSteps[M], MissionSteps[M][]>;
} = {
  capture_seasonal_property: {
    collecting_owner: ["registering_property"],
    registering_property: ["owner_property_linking", "needs_rework"],
    owner_property_linking: ["verifying_docs", "final_review", "needs_rework"],
    verifying_docs: ["needs_rework", "final_review"],
    needs_rework: ["collecting_owner", "registering_property", "owner_property_linking", "verifying_docs"],
    final_review: [],
  },
  capture_rental_property: {
    collecting_owner: ["registering_property"],
    registering_property: ["owner_property_linking", "needs_rework"],
    owner_property_linking: ["rental_checklist", "final_review", "needs_rework"],
    rental_checklist: ["needs_rework", "final_review"],
    needs_rework: ["collecting_owner", "registering_property", "owner_property_linking", "rental_checklist"],
    final_review: [],
  },
  capture_sale_property: {
    collecting_owner: ["registering_property"],
    registering_property: ["owner_property_linking", "needs_rework"],
    owner_property_linking: ["sale_checklist", "final_review", "needs_rework"],
    sale_checklist: ["needs_rework", "final_review"],
    needs_rework: ["collecting_owner", "registering_property", "owner_property_linking", "sale_checklist"],
    final_review: [],
  },
  qualify_and_match_lead: {
    gathering_signals: ["scoring", "awaiting_more_info", "disqualified"],
    scoring: ["matching_inventory", "awaiting_more_info", "disqualified"],
    matching_inventory: ["ready_for_visit", "no_match_found", "awaiting_more_info"],
    awaiting_more_info: ["gathering_signals", "scoring"],
    no_match_found: ["matching_inventory", "disqualified"],
    disqualified: [],
    ready_for_visit: [],
  },
  schedule_and_follow_visit: {
    selecting_slot: ["confirming_participants", "cancelled"],
    confirming_participants: ["scheduled", "rescheduling", "cancelled"],
    scheduled: ["post_visit", "rescheduling", "no_show", "cancelled"],
    rescheduling: ["selecting_slot", "confirming_participants"],
    cancelled: ["selecting_slot"],
    no_show: ["needs_reengagement", "rescheduling"],
    post_visit: ["needs_reengagement"],
    needs_reengagement: ["selecting_slot"],
  },
  collect_documents: {
    collecting: ["classifying", "missing_documents"],
    classifying: ["validating_sufficiency", "missing_documents"],
    validating_sufficiency: ["package_ready", "missing_documents"],
    missing_documents: ["collecting", "classifying"],
    package_ready: [],
  },
  prepare_contract: {
    checking_document_sufficiency: ["drafting", "needs_document_rework"],
    drafting: ["legal_handoff", "needs_document_rework"],
    legal_handoff: ["ready_for_signature", "needs_document_rework"],
    needs_document_rework: ["checking_document_sufficiency", "drafting"],
    ready_for_signature: [],
  },
  settle_commission: {
    calculating_basis: ["awaiting_approval", "blocked_by_policy"],
    awaiting_approval: ["settlement_ready", "blocked_by_policy"],
    settlement_ready: ["reconciled", "blocked_by_policy"],
    reconciled: [],
    blocked_by_policy: [],
  },
  commercial_activation: {
    drafting_campaign: ["awaiting_human_approval", "blocked_by_policy"],
    awaiting_human_approval: ["ready_to_publish", "blocked_by_policy"],
    ready_to_publish: ["published_or_sent", "blocked_by_policy"],
    published_or_sent: [],
    blocked_by_policy: [],
  },
  case_review: {
    generating_snapshot: ["snapshot_ready"],
    snapshot_ready: [],
  },
};

export class ImobGovernanceError extends Error {
  reasonCode: string;
  details: Record<string, unknown>;

  constructor(params: { reasonCode: string; details?: Record<string, unknown> }) {
    super(params.reasonCode);
    this.name = "ImobGovernanceError";
    this.reasonCode = params.reasonCode;
    this.details = params.details ?? {};
  }
}

export function assertValidMissionTransition<M extends ImobMissionId>(
  mission: M,
  from: MissionSteps[M],
  to: MissionSteps[M],
): void {
  const allowed = IMOB_MISSION_TRANSITIONS[mission][from];
  if (!allowed.includes(to)) {
    throw new ImobGovernanceError({
      reasonCode: "INVALID_MISSION_TRANSITION",
      details: { mission, from, to },
    });
  }
}

export function listMissionSteps<M extends ImobMissionId>(mission: M): MissionSteps[M][] {
  return Object.keys(IMOB_MISSION_TRANSITIONS[mission]) as MissionSteps[M][];
}

export function isMissionStep<M extends ImobMissionId>(mission: M, step: string): step is MissionSteps[M] {
  return Object.prototype.hasOwnProperty.call(IMOB_MISSION_TRANSITIONS[mission], step);
}
