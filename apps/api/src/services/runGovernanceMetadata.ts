export const VERTICAL_GOVERNANCE_NOT_EVALUATED = "VERTICAL_GOVERNANCE_NOT_EVALUATED" as const;
export const RUN_GOVERNANCE_PROJECTION_VERSION = "run_governance.a0" as const;
export const RUN_ACTION_POLICY_EVALUATED_EVENT_TYPE = "run.action_policy.evaluated.v1" as const;
export const ACTION_POLICY_EVENT_REASON_CODES = [
  "POLICY_NOT_FOUND",
  "ACTION_POLICY_SCOPE_DENIED",
  "ACTION_POLICY_DISABLED",
  "ACTION_POLICY_STORE_UNAVAILABLE",
  "INVALID_ACTION_TYPE",
] as const;
export const RUN_WORKER_SCOPE_REASON_CODES = ["RUN_SCOPE_NOT_RESOLVED"] as const;
export const ACTION_POLICY_REASON_CODE_MAP = {
  SCOPE_ALLOWED: null,
  POLICY_NOT_FOUND: "POLICY_NOT_FOUND",
  SCOPE_NOT_ALLOWED: "ACTION_POLICY_SCOPE_DENIED",
  WORKSPACE_SCOPE_MISMATCH: "ACTION_POLICY_SCOPE_DENIED",
  TENANT_POLICY_DISABLED: "ACTION_POLICY_DISABLED",
  POLICY_STORE_UNAVAILABLE: "ACTION_POLICY_STORE_UNAVAILABLE",
} as const;
export const LEGACY_GOVERNANCE_UNVERIFIED_BANNER =
  "LEGADO — ESTADO DE GOVERNANÇA NÃO VERIFICADO" as const;

type PlainObject = Record<string, unknown>;
type ActionPolicyEventReasonCode = (typeof ACTION_POLICY_EVENT_REASON_CODES)[number];
type ScopePolicyReasonCode = keyof typeof ACTION_POLICY_REASON_CODE_MAP;

export type ServerActionPolicyDecision = {
  evaluated: true;
  decision: "allowed" | "denied";
  source: "tenant_action_policy";
  action: string;
  reasonCode: ActionPolicyEventReasonCode | null;
};

export type RunGovernanceServerFacts = {
  tenantIdPresent: boolean;
  workspaceIdPresent: boolean;
  trustScoreEvaluated?: boolean;
  trustScore?: number | null;
  trustLevel?: "high" | "medium" | "low" | null;
  costGuardEvaluated?: boolean;
  actionPolicyDecision?: ServerActionPolicyDecision | null;
};

const CLIENT_CONTROLLED_GOVERNANCE_KEYS = new Set([
  "governanceContext",
  "governanceState",
  "rbacEvaluated",
  "entitlementEvaluated",
  "actionPolicyDecision",
]);

function isPlainObject(value: unknown): value is PlainObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function copyNonGovernanceMetadata(metadata: unknown): PlainObject {
  if (!isPlainObject(metadata)) return {};
  return Object.fromEntries(
    Object.entries(metadata).filter(([key]) => !CLIENT_CONTROLLED_GOVERNANCE_KEYS.has(key))
  );
}

export function sanitizeRunGovernanceMetadata(
  metadata: unknown,
  facts: RunGovernanceServerFacts
): PlainObject {
  const sanitized = copyNonGovernanceMetadata(metadata);
  const trustScoreEvaluated = facts.trustScoreEvaluated === true;
  const trustScore =
    trustScoreEvaluated && typeof facts.trustScore === "number" && Number.isFinite(facts.trustScore)
      ? facts.trustScore
      : null;
  const trustLevel =
    trustScoreEvaluated &&
    (facts.trustLevel === "high" || facts.trustLevel === "medium" || facts.trustLevel === "low")
      ? facts.trustLevel
      : null;

  return {
    ...sanitized,
    ...(facts.actionPolicyDecision
      ? { actionPolicyDecision: { ...facts.actionPolicyDecision } }
      : {}),
    governanceContext: {
      projectionVersion: RUN_GOVERNANCE_PROJECTION_VERSION,
      evaluationState: "not_evaluated",
      tenantIdPresent: facts.tenantIdPresent,
      workspaceIdPresent: facts.workspaceIdPresent,
      rbacEvaluated: false,
      entitlementEvaluated: false,
      trustScoreEvaluated,
      trustScore,
      trustLevel,
      costGuardEvaluated: facts.costGuardEvaluated === true,
      policyDecision: "not_evaluated",
      reasonCode: VERTICAL_GOVERNANCE_NOT_EVALUATED,
    },
  };
}

type ScopePolicyDecision = {
  allowed: boolean;
  reasonCode: ScopePolicyReasonCode;
  policyVersion?: string;
};

type RunActionPolicyEventPayload = {
    specVersion: typeof RUN_ACTION_POLICY_EVALUATED_EVENT_TYPE;
    evaluated: boolean;
    decision: "allowed" | "denied" | "not_evaluated";
    source: "tenant_action_policy" | "action_registry";
    action: string;
    policyVersion: string | null;
    reasonCode: ActionPolicyEventReasonCode | null;
    enforcementApplied: false;
};

export type RunActionPolicyEvaluation =
  | {
      applicability: "not_applicable";
      actionPolicyDecision: null;
      eventPayload: null;
    }
  | {
      applicability: "applicable";
      actionPolicyDecision: ServerActionPolicyDecision | null;
      eventPayload: RunActionPolicyEventPayload;
    };

export function mapActionPolicyReasonCode(
  decision: ScopePolicyDecision,
): ActionPolicyEventReasonCode | null {
  if (decision.allowed) return null;
  return ACTION_POLICY_REASON_CODE_MAP[decision.reasonCode]
    ?? "ACTION_POLICY_STORE_UNAVAILABLE";
}

/**
 * Adapts the canonical action registry and TenantPolicyStore result into the
 * worker projection. Neither queue metadata nor Run.request can attest policy.
 */
export async function evaluateRunActionPolicy(params: {
  metadata: unknown;
  registeredActionNames: Iterable<string>;
  resolveScopeDecision: (action: string) => Promise<ScopePolicyDecision>;
}): Promise<RunActionPolicyEvaluation> {
  const metadata = isPlainObject(params.metadata) ? params.metadata : null;
  const rawAction = typeof metadata?.action === "string" ? metadata.action.trim() : "";
  if (!rawAction) {
    return {
      applicability: "not_applicable",
      actionPolicyDecision: null,
      eventPayload: null,
    };
  }

  const canonicalByNormalized = new Map<string, string>();
  for (const actionName of params.registeredActionNames) {
    const canonical = actionName.trim();
    if (canonical) canonicalByNormalized.set(canonical.toLowerCase(), canonical);
  }
  const canonicalAction = canonicalByNormalized.get(rawAction.toLowerCase()) ?? null;
  if (!canonicalAction) {
    return {
      applicability: "applicable",
      actionPolicyDecision: null,
      eventPayload: {
        specVersion: RUN_ACTION_POLICY_EVALUATED_EVENT_TYPE,
        evaluated: false,
        decision: "not_evaluated",
        source: "action_registry",
        action: rawAction,
        policyVersion: null,
        reasonCode: "INVALID_ACTION_TYPE",
        enforcementApplied: false,
      },
    };
  }

  const scopeDecision = await params.resolveScopeDecision(canonicalAction);
  const publicReasonCode = mapActionPolicyReasonCode(scopeDecision);
  const actionPolicyDecision: ServerActionPolicyDecision = {
    evaluated: true,
    decision: scopeDecision.allowed ? "allowed" : "denied",
    source: "tenant_action_policy",
    action: canonicalAction,
    reasonCode: publicReasonCode,
  };
  return {
    applicability: "applicable",
    actionPolicyDecision,
    eventPayload: {
      specVersion: RUN_ACTION_POLICY_EVALUATED_EVENT_TYPE,
      evaluated: true,
      decision: actionPolicyDecision.decision,
      source: "tenant_action_policy",
      action: canonicalAction,
      policyVersion: scopeDecision.policyVersion ?? null,
      reasonCode: publicReasonCode,
      enforcementApplied: false,
    },
  };
}

/**
 * Queue metadata is transport-only. Action Policy may be attached only from
 * explicit server facts produced by a fresh TenantPolicyStore evaluation.
 */
export function sanitizeRunGovernanceMetadataForWorker(
  queueMetadata: unknown,
  facts: Pick<RunGovernanceServerFacts, "tenantIdPresent" | "workspaceIdPresent" | "actionPolicyDecision">
): PlainObject {
  return sanitizeRunGovernanceMetadata(queueMetadata, {
    ...facts,
    actionPolicyDecision: facts.actionPolicyDecision ?? null,
  });
}

type GovernanceProjectionMode = "aggregate" | "guardian" | "recipe";

function projectNode(
  value: unknown,
  mode: GovernanceProjectionMode,
  scope: Pick<RunGovernanceServerFacts, "tenantIdPresent" | "workspaceIdPresent"> | undefined
): { value: unknown; legacyDetected: boolean } {
  if (Array.isArray(value)) {
    let legacyDetected = false;
    const projected = value.map((item) => {
      const child = projectNode(item, mode, scope);
      legacyDetected ||= child.legacyDetected;
      return child.value;
    });
    return { value: projected, legacyDetected };
  }
  if (!isPlainObject(value)) return { value, legacyDetected: false };

  let legacyDetected = false;
  const projected: PlainObject = {};
  for (const [key, childValue] of Object.entries(value)) {
    const childMode = key === "guardianReport" ? "guardian" : key === "recipeOrchestration" ? "recipe" : mode;
    if (key === "governanceContext") {
      const raw = isPlainObject(childValue) ? childValue : {};
      const legacy =
        raw.rbacEvaluated === true ||
        raw.entitlementEvaluated === true ||
        raw.policyDecision === "allowed" ||
        raw.evaluationState !== "not_evaluated";
      legacyDetected ||= legacy;
      projected[key] = sanitizeRunGovernanceMetadata({}, {
        tenantIdPresent: scope?.tenantIdPresent ?? raw.tenantIdPresent === true,
        workspaceIdPresent: scope?.workspaceIdPresent ?? raw.workspaceIdPresent === true,
        trustScoreEvaluated: raw.trustScoreEvaluated === true,
        trustScore: typeof raw.trustScore === "number" ? raw.trustScore : null,
        trustLevel:
          raw.trustLevel === "high" || raw.trustLevel === "medium" || raw.trustLevel === "low"
            ? raw.trustLevel
            : null,
        costGuardEvaluated: raw.costGuardEvaluated === true,
      }).governanceContext;
      continue;
    }
    if (key === "governance" && isPlainObject(childValue)) {
      const child = projectNode(childValue, mode, scope);
      const raw = child.value as PlainObject;
      const legacy =
        raw.rbacEvaluated === true ||
        raw.entitlementEvaluated === true ||
        raw.policyDecision === "allowed";
      legacyDetected ||= child.legacyDetected || legacy;
      projected[key] = {
        ...raw,
        rbacEvaluated: false,
        entitlementEvaluated: false,
        ...(legacy
          ? {
              policyDecision: mode === "guardian" ? "needs_review" : "not_evaluated",
              reasonCode: VERTICAL_GOVERNANCE_NOT_EVALUATED,
            }
          : {}),
      };
      continue;
    }
    const child = projectNode(childValue, childMode, scope);
    projected[key] = child.value;
    legacyDetected ||= child.legacyDetected;
  }

  if ((mode === "guardian" || mode === "recipe") && legacyDetected) {
    projected.legacyGovernanceUnverified = true;
  }
  return { value: projected, legacyDetected };
}

export function projectRunGovernanceForRead<T>(
  value: T,
  scope?: Pick<RunGovernanceServerFacts, "tenantIdPresent" | "workspaceIdPresent">
): T {
  return projectNode(value, "aggregate", scope).value as T;
}
