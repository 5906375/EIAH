/**
 * Governed Operation Catalog — static, institutional definitions of governed
 * operations, ratified per docs/ops/ape-audit-telemetry-decision.md §13 (v1.1).
 *
 * This module declares semantics. It does not measure runtime, execute
 * billing, authorize execution, or generate receipts. A definition here is
 * not a permission and is not equivalent to a TenantActionPolicy grant or a
 * RegisteredAction registry entry.
 */

export type GovernedOperationDomain = "billing";

export type GovernedOperationEffectType = "debit";

export type GovernedOperationApplicability = {
  /** Structural signal that marks an execution as terminal for applicability purposes. */
  readonly executionTerminalRule: "Run.finishedAt IS NOT NULL";
  /** What must exist to say a financial effect was expected for this run. */
  readonly effectExpectationSource: "RunUsageBreakdown";
  /**
   * The operation declares that a measurement window requirement applies; the
   * concrete window (e.g. 7 or 14 days) is a parameter of the collector/cycle
   * that consumes this definition, not a fixed attribute of the operation.
   */
  readonly measurementWindow: "declared_by_collector";
};

export type GovernedOperationTerminality = {
  readonly source: "Run.finishedAt";
  readonly rule: "Run.finishedAt IS NOT NULL";
};

export type GovernedOperationZeroCostSemantics = {
  readonly breakdownAbsent: "not_applicable";
  readonly breakdownPresentSumZero: "applicable_zero_cost";
};

export type GovernedOperationBlockedCategory = "USER_CANCELLED" | "GUARDRAIL_BLOCK";

export type GovernedOperationBlockedCategorySemantics = {
  /** Whether the runtime attempts/expects to produce the effect for this category. */
  readonly runtimeEffectExpectation: boolean;
  /**
   * Whether runtime attempting the effect independently proves authority for it.
   * Ratified rule: runtime_attempt != independent_authority. This must never be
   * `true` for a category derived solely from runtime behavior.
   */
  readonly independentAuthorityProvenByRuntime: false;
  /**
   * The catalog declares only that this category's governance authority must be
   * resolved against runtime evidence before any no-gap/healthy conclusion can be
   * drawn — it never concludes that resolution itself. Concretely: a block
   * category (e.g. GUARDRAIL_BLOCK) is a classification of the observed cause,
   * not a proof that a valid governance decision legitimately prevented the
   * effect. That proof, when it exists, is a runtime/collector fact (policy
   * name, gate result, guardrail report), never a static catalog attribute.
   * Must always be `true`: the catalog must never pre-decide authority.
   */
  readonly authorityResolutionRequired: true;
};

export type GovernedOperationBlockedSemantics = {
  readonly lifecycleTerminal: true;
  /** blocked != auditGap automatically. */
  readonly autoGapOnBlocked: false;
  readonly categories: Readonly<
    Record<GovernedOperationBlockedCategory, GovernedOperationBlockedCategorySemantics>
  >;
};

export type GovernedOperationIdempotencyClassification = "SEMANTIC_IDEMPOTENCY_KEY_PARTIAL";

export type GovernedOperationIdempotency = {
  /** Description of the key's semantic source/pattern — never a literal runtime value. */
  readonly keySourceDescription: string;
  /**
   * PARTIAL because the underlying store (BillingLedger) does not yet enforce
   * atomic uniqueness on this key. Must not be promoted to CONFIRMED without
   * a corresponding schema/enforcement change.
   */
  readonly classification: GovernedOperationIdempotencyClassification;
};

export type GovernedOperationOutcomeAuthority = "INTERNAL_CONFIRMED" | "EXTERNAL_CONFIRMED";

export type GovernedOperationObservability = {
  readonly internalOutcomeObservable: boolean;
  readonly externalProviderOutcomeObservable: boolean;
};

export type GovernedOperationRuntimeScope = "tenant" | "workspace";

export type GovernedOperationScope = {
  readonly definitionScope: "GLOBAL";
  readonly requiredRuntimeScope: readonly GovernedOperationRuntimeScope[];
};

export type GovernedOperationDefinition = {
  readonly operationId: string;
  readonly domain: GovernedOperationDomain;
  readonly effectType: GovernedOperationEffectType;
  /** Vigência da regra institucional (ratificação), não da execução. */
  readonly effectiveFrom: string;
  readonly applicability: GovernedOperationApplicability;
  readonly terminality: GovernedOperationTerminality;
  readonly zeroCost: GovernedOperationZeroCostSemantics;
  readonly blockedSemantics: GovernedOperationBlockedSemantics;
  readonly idempotency: GovernedOperationIdempotency;
  readonly requiredAuditChain: readonly string[];
  readonly outcomeAuthority: GovernedOperationOutcomeAuthority;
  readonly observability: GovernedOperationObservability;
  readonly scope: GovernedOperationScope;
  /** Optional real link to a RegisteredAction, when one exists. Not an operationId. */
  readonly originatingAction?: string;
};

export const GOVERNED_OPERATION_CATALOG_VERSION = 1;

export const GOVERNED_OPERATION_CATALOG_COVERED_DOMAINS = ["billing"] as const;

export const BILLING_RUN_COST_DEBIT_OPERATION_ID = "billing.run_cost_debit";

const billingRunCostDebit: GovernedOperationDefinition = {
  operationId: BILLING_RUN_COST_DEBIT_OPERATION_ID,
  domain: "billing",
  effectType: "debit",
  effectiveFrom: "2026-09-03",
  applicability: {
    executionTerminalRule: "Run.finishedAt IS NOT NULL",
    effectExpectationSource: "RunUsageBreakdown",
    measurementWindow: "declared_by_collector",
  },
  terminality: {
    source: "Run.finishedAt",
    rule: "Run.finishedAt IS NOT NULL",
  },
  zeroCost: {
    breakdownAbsent: "not_applicable",
    breakdownPresentSumZero: "applicable_zero_cost",
  },
  blockedSemantics: {
    lifecycleTerminal: true,
    autoGapOnBlocked: false,
    categories: {
      USER_CANCELLED: {
        runtimeEffectExpectation: true,
        independentAuthorityProvenByRuntime: false,
        authorityResolutionRequired: true,
      },
      GUARDRAIL_BLOCK: {
        runtimeEffectExpectation: false,
        independentAuthorityProvenByRuntime: false,
        authorityResolutionRequired: true,
      },
    },
  },
  idempotency: {
    keySourceDescription: "run-scoped debit request key, one per run",
    classification: "SEMANTIC_IDEMPOTENCY_KEY_PARTIAL",
  },
  requiredAuditChain: ["Run", "RunUsageBreakdown", "BillingLedger"],
  outcomeAuthority: "INTERNAL_CONFIRMED",
  observability: {
    internalOutcomeObservable: true,
    externalProviderOutcomeObservable: false,
  },
  scope: {
    definitionScope: "GLOBAL",
    requiredRuntimeScope: ["tenant", "workspace"],
  },
};

function assertValidGovernedOperationDefinition(def: GovernedOperationDefinition): void {
  const errors: string[] = [];
  if (!def.operationId) errors.push("operationId required");
  if (!def.domain) errors.push("domain required");
  if (!def.effectType) errors.push("effectType required");
  if (!def.effectiveFrom) errors.push("effectiveFrom required");
  if (!def.applicability) errors.push("applicability required");
  if (!def.terminality) errors.push("terminality required");
  if (!def.zeroCost) errors.push("zeroCost required");
  if (!def.blockedSemantics) errors.push("blockedSemantics required");
  if (!def.idempotency?.classification) errors.push("idempotency classification required");
  if (!def.requiredAuditChain || def.requiredAuditChain.length === 0) {
    errors.push("requiredAuditChain must be non-empty");
  }
  if (!def.outcomeAuthority) errors.push("outcomeAuthority required");
  if (def.scope?.definitionScope !== "GLOBAL") errors.push("scope.definitionScope must be GLOBAL");
  for (const category of Object.values(def.blockedSemantics?.categories ?? {})) {
    if (category.independentAuthorityProvenByRuntime !== false) {
      errors.push(
        "blockedSemantics category must never declare independentAuthorityProvenByRuntime=true",
      );
    }
    if (category.authorityResolutionRequired !== true) {
      errors.push(
        "blockedSemantics category must never declare authority as statically resolved: authorityResolutionRequired must remain true",
      );
    }
  }
  if (errors.length > 0) {
    throw new Error(
      `governed_operation_definition_invalid: ${def.operationId ?? "<unknown>"}: ${errors.join("; ")}`,
    );
  }
}

const definitionsById: ReadonlyMap<string, GovernedOperationDefinition> = new Map(
  [billingRunCostDebit].map((def) => {
    assertValidGovernedOperationDefinition(def);
    return [def.operationId, def] as const;
  }),
);

/**
 * Resolves a governed operation definition by id. Fails closed: an unknown
 * operationId throws rather than returning a default/permissive definition.
 */
export function getGovernedOperation(operationId: string): GovernedOperationDefinition {
  const def = definitionsById.get(operationId);
  if (!def) {
    throw new Error(`governed_operation_not_found: ${operationId}`);
  }
  return def;
}

export function listGovernedOperations(): readonly GovernedOperationDefinition[] {
  return Array.from(definitionsById.values());
}

export function getGovernedOperationCatalogVersion(): number {
  return GOVERNED_OPERATION_CATALOG_VERSION;
}

/**
 * Whether the catalog covers the whole system. Always false for v1 — billing
 * coverage must never be read as system-wide coverage.
 */
export function isGovernedOperationCatalogSystemComplete(): false {
  return false;
}
