import type { PreDuimpCaseV1 } from "@eiah/contracts";

export type PreDuimpGovernedCaseLifecycleV1 = PreDuimpCaseV1["lifecycle"];

export const PRE_DUIMP_CASE_TRANSITION_DENIED =
  "PRE_DUIMP_CASE_TRANSITION_DENIED" as const;
export const PRE_DUIMP_CASE_LIFECYCLE_GATE_MISMATCH =
  "PRE_DUIMP_CASE_LIFECYCLE_GATE_MISMATCH" as const;

export const PRE_DUIMP_ALLOWED_LIFECYCLE_TRANSITIONS_V1: Readonly<
  Record<
    PreDuimpGovernedCaseLifecycleV1,
    readonly PreDuimpGovernedCaseLifecycleV1[]
  >
> = {
  DISCOVERY: ["ASSESSING", "BLOCKED", "CLOSED"],
  ASSESSING: ["DISCOVERY", "BLOCKED", "AWAITING_REVIEW", "READY", "CLOSED"],
  BLOCKED: ["DISCOVERY", "ASSESSING", "CLOSED"],
  AWAITING_REVIEW: ["ASSESSING", "BLOCKED", "READY", "CLOSED"],
  READY: ["DISCOVERY", "ASSESSING", "BLOCKED", "CLOSED"],
  CLOSED: [],
};

export type PreDuimpLifecycleValidationV1 =
  | { ok: true }
  | {
      ok: false;
      reasonCode:
        | typeof PRE_DUIMP_CASE_TRANSITION_DENIED
        | typeof PRE_DUIMP_CASE_LIFECYCLE_GATE_MISMATCH;
    };

export function validatePreDuimpLifecycleTransitionV1(
  from: PreDuimpGovernedCaseLifecycleV1,
  to: PreDuimpGovernedCaseLifecycleV1,
): PreDuimpLifecycleValidationV1 {
  if (!PRE_DUIMP_ALLOWED_LIFECYCLE_TRANSITIONS_V1[from].includes(to)) {
    return { ok: false, reasonCode: PRE_DUIMP_CASE_TRANSITION_DENIED };
  }
  return { ok: true };
}

export function validatePreDuimpLifecycleSnapshotV1(
  snapshot: PreDuimpCaseV1,
): PreDuimpLifecycleValidationV1 {
  const outcome = snapshot.gateDecision.outcome;

  if (snapshot.lifecycle === "READY" && outcome !== "READY") {
    return {
      ok: false,
      reasonCode: PRE_DUIMP_CASE_LIFECYCLE_GATE_MISMATCH,
    };
  }
  if (snapshot.lifecycle === "AWAITING_REVIEW" && outcome !== "REVIEW") {
    return {
      ok: false,
      reasonCode: PRE_DUIMP_CASE_LIFECYCLE_GATE_MISMATCH,
    };
  }
  if (
    ["DISCOVERY", "ASSESSING", "BLOCKED"].includes(snapshot.lifecycle) &&
    outcome !== "BLOCK"
  ) {
    return {
      ok: false,
      reasonCode: PRE_DUIMP_CASE_LIFECYCLE_GATE_MISMATCH,
    };
  }

  if (
    snapshot.gateDecision.readinessOnly !== true ||
    snapshot.gateDecision.authorizationState !== "NOT_REQUESTED" ||
    snapshot.gateDecision.externalTransmissionAllowed !== false ||
    snapshot.domainState.externalTransmissionAllowed !== false
  ) {
    return {
      ok: false,
      reasonCode: PRE_DUIMP_CASE_LIFECYCLE_GATE_MISMATCH,
    };
  }

  return { ok: true };
}
