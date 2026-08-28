export const PRE_DUIMP_SHADOW_CAPABILITY_VERSION = "v1" as const;
export const PRE_DUIMP_PILOT_ACCESS_SCOPE = "log.pre_duimp.shadow.pilot_access" as const;
export const PRE_DUIMP_CREATE_SCOPE = "log.duimp_context.create" as const;

export const PRE_DUIMP_ACCESS_DENIAL_REASON_CODES = [
  "PRE_DUIMP_RUNTIME_DISABLED",
  "PRE_DUIMP_INSTALLATION_MISSING",
  "PRE_DUIMP_INSTALLATION_INACTIVE",
  "PRE_DUIMP_INSTALLATION_INVALID",
  "PRE_DUIMP_PILOT_GRANT_MISSING",
  "PRE_DUIMP_PILOT_GRANT_DISABLED",
  "PRE_DUIMP_ACTION_POLICY_DENIED",
  "PRE_DUIMP_ACCESS_UNAVAILABLE",
] as const;

export type PreDuimpAccessDenialReasonCode =
  (typeof PRE_DUIMP_ACCESS_DENIAL_REASON_CODES)[number];

export type PreDuimpShadowCapability =
  | {
      version: typeof PRE_DUIMP_SHADOW_CAPABILITY_VERSION;
      allowed: true;
      mode: "shadow";
      externalTransmissionAllowed: false;
      reasonCode: null;
      pilotPolicyVersion?: string;
      actionPolicyVersion?: string;
    }
  | {
      version: typeof PRE_DUIMP_SHADOW_CAPABILITY_VERSION;
      allowed: false;
      mode: "shadow";
      externalTransmissionAllowed: false;
      reasonCode: PreDuimpAccessDenialReasonCode;
    };

export type PreDuimpSessionCapabilities = {
  preDuimpShadow: PreDuimpShadowCapability;
};
