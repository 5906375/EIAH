import test from "node:test";
import assert from "node:assert/strict";
import {
  BILLING_RUN_COST_DEBIT_OPERATION_ID,
  GOVERNED_OPERATION_CATALOG_COVERED_DOMAINS,
  getGovernedOperation,
  getGovernedOperationCatalogVersion,
  isGovernedOperationCatalogSystemComplete,
  listGovernedOperations,
} from "./governedOperationCatalog.js";

// T1 — operação existe
test("T1: billing reference operation can be resolved", () => {
  const def = getGovernedOperation(BILLING_RUN_COST_DEBIT_OPERATION_ID);
  assert.equal(def.operationId, BILLING_RUN_COST_DEBIT_OPERATION_ID);
});

// T2 — operação desconhecida: fail-closed
test("T2: unknown operationId fails closed instead of returning a default", () => {
  assert.throws(
    () => getGovernedOperation("billing.does_not_exist"),
    /governed_operation_not_found/,
  );
});

// T3 — domínio billing
test("T3: reference operation domain is billing", () => {
  const def = getGovernedOperation(BILLING_RUN_COST_DEBIT_OPERATION_ID);
  assert.equal(def.domain, "billing");
});

// T4 — effectType debit
test("T4: reference operation effectType is debit", () => {
  const def = getGovernedOperation(BILLING_RUN_COST_DEBIT_OPERATION_ID);
  assert.equal(def.effectType, "debit");
});

// T5 — terminalidade representa Run.finishedAt IS NOT NULL
test("T5: terminality is represented via Run.finishedAt IS NOT NULL", () => {
  const def = getGovernedOperation(BILLING_RUN_COST_DEBIT_OPERATION_ID);
  assert.equal(def.terminality.rule, "Run.finishedAt IS NOT NULL");
  assert.equal(def.applicability.executionTerminalRule, "Run.finishedAt IS NOT NULL");
});

// T6 — expectation source é RunUsageBreakdown
test("T6: effect expectation source is RunUsageBreakdown", () => {
  const def = getGovernedOperation(BILLING_RUN_COST_DEBIT_OPERATION_ID);
  assert.equal(def.applicability.effectExpectationSource, "RunUsageBreakdown");
});

// T7 — zero-cost preserva breakdown ausente != breakdown presente somando zero
test("T7: breakdown-absent and breakdown-present-summing-zero are distinct", () => {
  const def = getGovernedOperation(BILLING_RUN_COST_DEBIT_OPERATION_ID);
  assert.equal(def.zeroCost.breakdownAbsent, "not_applicable");
  assert.equal(def.zeroCost.breakdownPresentSumZero, "applicable_zero_cost");
  assert.notEqual(def.zeroCost.breakdownAbsent, def.zeroCost.breakdownPresentSumZero);
});

// T8 — idempotência permanece PARTIAL
test("T8: idempotency classification stays SEMANTIC_IDEMPOTENCY_KEY_PARTIAL", () => {
  const def = getGovernedOperation(BILLING_RUN_COST_DEBIT_OPERATION_ID);
  assert.equal(def.idempotency.classification, "SEMANTIC_IDEMPOTENCY_KEY_PARTIAL");
});

// T9 — outcome authority INTERNAL_CONFIRMED
test("T9: outcome authority is INTERNAL_CONFIRMED, not EXTERNAL_CONFIRMED", () => {
  const def = getGovernedOperation(BILLING_RUN_COST_DEBIT_OPERATION_ID);
  assert.equal(def.outcomeAuthority, "INTERNAL_CONFIRMED");
});

// T10 — blocked não é declarado gap automaticamente
test("T10: blocked lifecycle-terminal does not auto-declare an audit gap", () => {
  const def = getGovernedOperation(BILLING_RUN_COST_DEBIT_OPERATION_ID);
  assert.equal(def.blockedSemantics.lifecycleTerminal, true);
  assert.equal(def.blockedSemantics.autoGapOnBlocked, false);
});

// T11 — authority caveat: nenhuma categoria declara autorização provada pelo runtime
test("T11: no blocked category declares runtime-proven independent authority", () => {
  const def = getGovernedOperation(BILLING_RUN_COST_DEBIT_OPERATION_ID);
  for (const category of Object.values(def.blockedSemantics.categories)) {
    assert.equal(category.independentAuthorityProvenByRuntime, false);
  }
  assert.equal(
    def.blockedSemantics.categories.USER_CANCELLED.independentAuthorityProvenByRuntime,
    false,
  );
});

// T12 — catálogo não contém tenant/workspace concreto
test("T12: definition scope is GLOBAL, no concrete tenant/workspace values", () => {
  const def = getGovernedOperation(BILLING_RUN_COST_DEBIT_OPERATION_ID);
  assert.equal(def.scope.definitionScope, "GLOBAL");
  assert.deepEqual([...def.scope.requiredRuntimeScope].sort(), ["tenant", "workspace"]);
  assert.ok(!("tenantId" in def));
  assert.ok(!("workspaceId" in def));
});

// T13 — coverage: apenas billing está coberto
test("T13: catalog coverage is billing-only, never system-complete", () => {
  assert.deepEqual([...GOVERNED_OPERATION_CATALOG_COVERED_DOMAINS], ["billing"]);
  assert.equal(isGovernedOperationCatalogSystemComplete(), false);
  const allDomains = new Set(listGovernedOperations().map((def) => def.domain));
  assert.deepEqual([...allDomains], ["billing"]);
});

// T14 — effectiveFrom
test("T14: reference operation effectiveFrom is 2026-09-03", () => {
  const def = getGovernedOperation(BILLING_RUN_COST_DEBIT_OPERATION_ID);
  assert.equal(def.effectiveFrom, "2026-09-03");
});

test("catalog version is a positive integer", () => {
  assert.equal(getGovernedOperationCatalogVersion(), 1);
});

// T15 — guardrail category ≠ authority
test("T15: GUARDRAIL_BLOCK does not statically prove valid governance authority", () => {
  const def = getGovernedOperation(BILLING_RUN_COST_DEBIT_OPERATION_ID);
  const guardrailBlock = def.blockedSemantics.categories.GUARDRAIL_BLOCK;
  assert.ok(
    !("governanceLegitimatelyPreventsEffect" in guardrailBlock),
    "catalog must not declare a static conclusion that governance legitimately prevented the effect",
  );
  assert.equal(guardrailBlock.independentAuthorityProvenByRuntime, false);
});

// T16 — runtime resolution required
test("T16: GUARDRAIL_BLOCK requires authority resolution before deciding no-gap", () => {
  const def = getGovernedOperation(BILLING_RUN_COST_DEBIT_OPERATION_ID);
  assert.equal(def.blockedSemantics.categories.GUARDRAIL_BLOCK.authorityResolutionRequired, true);
  assert.equal(def.blockedSemantics.categories.USER_CANCELLED.authorityResolutionRequired, true);
});

// T17 — fail-closed: nenhuma categoria pode produzir conclusão healthy/no-gap a partir do catálogo
test("T17: catalog semantics alone cannot produce a healthy/no-gap conclusion for any blocked category", () => {
  const def = getGovernedOperation(BILLING_RUN_COST_DEBIT_OPERATION_ID);
  for (const [name, category] of Object.entries(def.blockedSemantics.categories)) {
    assert.equal(
      category.authorityResolutionRequired,
      true,
      `${name} must require runtime authority resolution, never a static catalog-level authority conclusion`,
    );
    assert.equal(category.independentAuthorityProvenByRuntime, false);
  }
});
