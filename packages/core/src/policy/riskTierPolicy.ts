import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const RISK_TIER_POLICY_SOURCE = "contracts/risk-tier-policy.v1.json";

export const RISK_TIERS = ["low", "medium", "high", "critical"] as const;
export type RiskTier = (typeof RISK_TIERS)[number];

export type RiskTierRule = {
  action: string;
  scope: string;
  tier: RiskTier;
  txIdRequired: boolean;
  evidencePattern?: string;
};

export type RiskTierPolicy = {
  policyVersion: "v1";
  maxEvidenceAgeDays: number;
  unknownActionTier: "critical";
  rules: RiskTierRule[];
};

const TIER_RANK: Record<RiskTier, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

const DEFAULT_POLICY_FILE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../contracts/risk-tier-policy.v1.json",
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRiskTier(value: unknown): value is RiskTier {
  return typeof value === "string" && RISK_TIERS.includes(value as RiskTier);
}

function parseRule(value: unknown, index: number): RiskTierRule {
  if (!isRecord(value)) {
    throw new Error(`risk_tier_policy_invalid_rule:${index}`);
  }
  if (typeof value.action !== "string" || value.action.trim().length === 0) {
    throw new Error(`risk_tier_policy_invalid_action:${index}`);
  }
  if (typeof value.scope !== "string" || value.scope.trim().length === 0) {
    throw new Error(`risk_tier_policy_invalid_scope:${index}`);
  }
  if (!isRiskTier(value.tier)) {
    throw new Error(`risk_tier_policy_invalid_tier:${index}`);
  }
  if (typeof value.txIdRequired !== "boolean") {
    throw new Error(`risk_tier_policy_invalid_txid_requirement:${index}`);
  }
  if (value.evidencePattern !== undefined && typeof value.evidencePattern !== "string") {
    throw new Error(`risk_tier_policy_invalid_evidence_pattern:${index}`);
  }

  return {
    action: value.action.trim(),
    scope: value.scope.trim(),
    tier: value.tier,
    txIdRequired: value.txIdRequired,
    ...(typeof value.evidencePattern === "string"
      ? { evidencePattern: value.evidencePattern }
      : {}),
  };
}

export function parseRiskTierPolicy(value: unknown): RiskTierPolicy {
  if (!isRecord(value)) throw new Error("risk_tier_policy_invalid");
  if (value.policyVersion !== "v1") {
    throw new Error("risk_tier_policy_version_invalid");
  }
  if (
    typeof value.maxEvidenceAgeDays !== "number" ||
    !Number.isInteger(value.maxEvidenceAgeDays) ||
    value.maxEvidenceAgeDays <= 0
  ) {
    throw new Error("risk_tier_policy_max_evidence_age_invalid");
  }
  if (value.unknownActionTier !== "critical") {
    throw new Error("risk_tier_policy_unknown_action_must_be_critical");
  }
  if (!Array.isArray(value.rules) || value.rules.length === 0) {
    throw new Error("risk_tier_policy_rules_missing");
  }

  const rules = value.rules.map(parseRule);
  const seen = new Set<string>();
  for (const rule of rules) {
    if (seen.has(rule.action)) {
      throw new Error(`risk_tier_policy_duplicate_action:${rule.action}`);
    }
    seen.add(rule.action);
    if ((rule.tier === "high" || rule.tier === "critical") && !rule.txIdRequired) {
      throw new Error(`risk_tier_policy_critical_rule_requires_txid:${rule.action}`);
    }
  }

  return {
    policyVersion: "v1",
    maxEvidenceAgeDays: value.maxEvidenceAgeDays,
    unknownActionTier: "critical",
    rules,
  };
}

export function loadRiskTierPolicy(file = DEFAULT_POLICY_FILE): RiskTierPolicy {
  const raw = fs.readFileSync(file, "utf8");
  return parseRiskTierPolicy(JSON.parse(raw) as unknown);
}

export const riskTierPolicy = loadRiskTierPolicy();

export function normalizeRiskAction(action: string): string {
  return action.trim().replace(/^action\./, "");
}

export function getRiskTierRule(action: string): RiskTierRule | undefined {
  const normalized = normalizeRiskAction(action);
  return riskTierPolicy.rules.find((rule) => rule.action === normalized);
}

export function getRiskTier(action: string): RiskTier {
  return getRiskTierRule(action)?.tier ?? riskTierPolicy.unknownActionTier;
}

export function listRiskTierRulesAtOrAbove(tier: RiskTier): RiskTierRule[] {
  return riskTierPolicy.rules.filter((rule) => TIER_RANK[rule.tier] >= TIER_RANK[tier]);
}
