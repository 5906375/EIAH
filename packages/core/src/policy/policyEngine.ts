import type { ReasonCode } from "../reasons/reasonCatalog";

export type PolicyDecision = "allow" | "deny";

export type PolicyEvaluation = {
  decision: PolicyDecision;
  reason?: ReasonCode | null;
  policyRefs?: string[] | null;
};

export type PolicyContext = {
  tenantId: string;
  workspaceId?: string | null;
  userId?: string | null;
  role?: string | null;
  trustScore?: number | null;
  now?: Date;
};

export type PolicyRequest = {
  action: string;
  scope?: "read" | "execute" | "admin";
  metadata?: unknown;
  policies?: Record<string, unknown>;
};

export type PolicyProvider = {
  name: string;
  evaluate: (
    context: PolicyContext,
    request: PolicyRequest
  ) => Promise<PolicyEvaluation | null> | PolicyEvaluation | null;
};

export async function evaluatePolicy(params: {
  context: PolicyContext;
  request: PolicyRequest;
  providers: PolicyProvider[];
}): Promise<PolicyEvaluation> {
  let allowed: PolicyEvaluation | null = null;

  for (const provider of params.providers) {
    const result = await provider.evaluate(params.context, params.request);
    if (!result) continue;
    if (result.decision === "deny") return result;
    if (result.decision === "allow") allowed = result;
  }

  return (
    allowed ?? {
      decision: "allow",
      reason: null,
      policyRefs: null,
    }
  );
}
