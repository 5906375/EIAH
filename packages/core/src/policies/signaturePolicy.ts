export type RiskLevel = "low" | "medium" | "high" | "critical";

export type SignaturePolicyInput = {
  tenantId: string;
  workspaceId?: string | null;
  trustScore: { score: number; level: "high" | "medium" | "low"; reasons: string[] };
  tenantHash: string;
  actionHash: string;
  nonce: string;
  riskLevel: RiskLevel;
};

export type SignaturePolicyDecision = {
  allowed: boolean;
  requireSignature: boolean;
  reason?: string;
};

export type SignaturePolicyConfig = {
  disabled: boolean;
  trustThreshold: number;
  requireForRiskLevels: Set<RiskLevel>;
  requireAlways: boolean;
  enforceOnMissingSigner: boolean;
};

export function signaturePolicyConfigFromEnv(): SignaturePolicyConfig {
  const disabledRaw = (process.env.SIGNATURE_DISABLED ?? "").trim().toLowerCase();
  const disabled = disabledRaw === "1" || disabledRaw === "true" || disabledRaw === "on";

  const trustThreshold = Number(process.env.SIGNATURE_TRUST_THRESHOLD ?? "40");

  const requireAlwaysRaw = (process.env.SIGNATURE_REQUIRE_ALWAYS ?? "").trim().toLowerCase();
  const requireAlways = requireAlwaysRaw === "1" || requireAlwaysRaw === "true" || requireAlwaysRaw === "on";

  const enforceRaw = (process.env.SIGNATURE_ENFORCE ?? "").trim().toLowerCase();
  const enforceOnMissingSigner = enforceRaw === "1" || enforceRaw === "true" || enforceRaw === "on";

  const listRaw = (process.env.SIGNATURE_REQUIRED_RISK_LEVELS ?? "high,critical")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

  const requireForRiskLevels = new Set<RiskLevel>();
  for (const value of listRaw) {
    if (value === "low" || value === "medium" || value === "high" || value === "critical") {
      requireForRiskLevels.add(value);
    }
  }

  return {
    disabled,
    trustThreshold: Number.isFinite(trustThreshold) ? trustThreshold : 40,
    requireForRiskLevels,
    requireAlways,
    enforceOnMissingSigner,
  };
}

export function evaluateSignaturePolicy(
  input: SignaturePolicyInput,
  config: SignaturePolicyConfig
): SignaturePolicyDecision {
  if (config.disabled) {
    return { allowed: true, requireSignature: false, reason: "signature.disabled" };
  }

  const requireSignature = config.requireAlways || config.requireForRiskLevels.has(input.riskLevel);

  if (!requireSignature) {
    return { allowed: true, requireSignature: false, reason: "signature.not_required" };
  }

  if (input.trustScore.score < config.trustThreshold) {
    return {
      allowed: false,
      requireSignature: true,
      reason: `trust_score_below_threshold:${input.trustScore.score}<${config.trustThreshold}`,
    };
  }

  return { allowed: true, requireSignature: true, reason: "signature.required" };
}
