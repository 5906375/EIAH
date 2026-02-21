import type { ReasonCode } from "../../reasons/reasonCatalog";
import type { PolicyContext, PolicyEvaluation, PolicyProvider, PolicyRequest } from "../policyEngine";

export type DelegationPolicyInput = {
  id: string;
  delegateeId: string;
  delegatorId: string;
  scope: string;
  trustMin: number;
  validUntil: string | Date;
  status: string;
};

function parseValidUntil(value: string | Date) {
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function scopeAllows(policyScope: string, requestScope?: string | null) {
  if (!requestScope) return true;
  if (policyScope === "admin") return true;
  return policyScope === requestScope;
}

export function createDelegationProvider(): PolicyProvider {
  return {
    name: "delegation",
    evaluate(context: PolicyContext, request: PolicyRequest): PolicyEvaluation | null {
      const policies = (request.policies?.delegations as DelegationPolicyInput[]) ?? [];
      if (!Array.isArray(policies) || policies.length === 0) return null;

      const activePolicies = policies.filter((policy) => policy.status === "active");
      if (activePolicies.length === 0) {
        return {
          decision: "deny",
          reason: "policy_denied",
          policyRefs: policies.map((policy) => policy.id),
        };
      }

      const matchingScope = activePolicies.filter((policy) =>
        scopeAllows(policy.scope, request.scope ?? null)
      );
      if (matchingScope.length === 0) {
        return {
          decision: "deny",
          reason: "policy_denied",
          policyRefs: activePolicies.map((policy) => policy.id),
        };
      }

      const now = context.now ?? new Date();
      const validPolicies = matchingScope.filter((policy) => {
        const until = parseValidUntil(policy.validUntil);
        return !!until && until.getTime() > now.getTime();
      });

      if (validPolicies.length === 0) {
        return {
          decision: "deny",
          reason: "policy_expired",
          policyRefs: matchingScope.map((policy) => policy.id),
        };
      }

      const trustScore = context.trustScore ?? null;
      const trustOk = validPolicies.some((policy) => {
        if (typeof policy.trustMin !== "number") return true;
        if (trustScore === null || !Number.isFinite(trustScore)) return false;
        return trustScore >= policy.trustMin;
      });

      if (!trustOk) {
        return {
          decision: "deny",
          reason: "trust_insufficient",
          policyRefs: validPolicies.map((policy) => policy.id),
        };
      }

      return {
        decision: "allow",
        reason: null,
        policyRefs: validPolicies.map((policy) => policy.id),
      };
    },
  };
}
