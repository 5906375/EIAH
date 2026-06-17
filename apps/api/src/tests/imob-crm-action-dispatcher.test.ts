import test from "node:test";
import assert from "node:assert/strict";
import { resolveImobCrmActionDispatch } from "../services/imob/crm/imobCrmActionDispatcher";

function makeCanonical(overrides?: Record<string, unknown>) {
  return {
    recommendedActions: [
      { id: "owner.register", label: "Cadastrar proprietário", actionType: "operational", inputHint: "cadastrar proprietário deste caso", reasonCode: "missing_owner" },
      { id: "property.create", label: "Cadastrar imóvel", actionType: "operational" },
      { id: "case.consult", label: "Consultar caso", actionType: "consultive" },
    ],
    reasonCodes: ["missing_owner"],
    ...overrides,
  };
}

const TS = "2026-06-16T00:00:00.000Z";

// Scenario 1: actionId absent → caller should not invoke dispatcher; but if called with actionId
//   that exists and is operational → returns mode=execute
test("valid operational actionId returns mode=execute with executionRequest", () => {
  const result = resolveImobCrmActionDispatch({
    actionId: "owner.register",
    caseId: "case-abc",
    canonical: makeCanonical(),
    message: "cadastrar proprietário",
    timestamp: TS,
  });
  assert.ok(result !== null, "should not return null for operational action");
  assert.equal((result as any).mode, "execute");
  assert.equal((result as any).action, "realestate.register_property");
  assert.ok((result as any).executionRequest, "executionRequest must be present");
  assert.equal((result as any).executionRequest.operation, "owner.create");
  assert.equal((result as any).executionRequest.intent, "capture");
  assert.equal((result as any).executionRequest.input.caseId, "case-abc");
  assert.equal((result as any).executionRequest.input.actionId, "owner.register");
  assert.equal((result as any).executionRequest.input.reasonCode, "missing_owner");
  assert.equal((result as any).caseContext?.caseId, "case-abc");
});

// Scenario 2: actionId is consultive → returns null (fall through to engine)
test("consultive actionId returns null so engine handles it as consult", () => {
  const result = resolveImobCrmActionDispatch({
    actionId: "case.consult",
    caseId: "case-abc",
    canonical: makeCanonical(),
    message: "consultar caso",
    timestamp: TS,
  });
  assert.equal(result, null, "consultive action must return null");
});

// Scenario 3: actionId not in canonical.recommendedActions → blocked
test("actionId not in recommendedActions returns mode=blocked", () => {
  const result = resolveImobCrmActionDispatch({
    actionId: "lead.qualify",
    caseId: "case-abc",
    canonical: makeCanonical(),
    message: "qualificar lead",
    timestamp: TS,
  });
  assert.ok(result !== null);
  assert.equal((result as any).mode, "blocked");
  assert.equal((result as any).presentation?.metadata?.workflowReasonCode, "ACTION_NOT_ALLOWED_FOR_CASE");
  assert.ok((result as any).presentation?.text?.includes("lead.qualify"));
});

// Scenario 4: canonical is null → every actionId is not found → blocked
test("null canonical blocks any actionId with ACTION_NOT_ALLOWED_FOR_CASE", () => {
  const result = resolveImobCrmActionDispatch({
    actionId: "property.create",
    caseId: "case-abc",
    canonical: null,
    message: "cadastrar imóvel",
    timestamp: TS,
  });
  assert.ok(result !== null);
  assert.equal((result as any).mode, "blocked");
});

// Scenario 5: operational actionId without reasonCode is still valid
test("operational actionId without reasonCode still returns mode=execute", () => {
  const result = resolveImobCrmActionDispatch({
    actionId: "property.create",
    caseId: "case-xyz",
    canonical: makeCanonical(),
    message: "cadastrar imóvel",
    timestamp: TS,
  });
  assert.ok(result !== null);
  assert.equal((result as any).mode, "execute");
  assert.equal((result as any).executionRequest.operation, "property.create");
  assert.equal((result as any).executionRequest.input.reasonCode, null);
});

// Scenario 6: every actionId in ACTION_EXECUTION_MAP resolves to mode=execute with correct operation
const OPERATIONAL_CASES: Array<{ id: string; operation: string }> = [
  { id: "owner.register", operation: "owner.create" },
  { id: "property.create", operation: "property.create" },
  { id: "listing.activate", operation: "listing.activate" },
  { id: "lead.qualify", operation: "lead.qualify" },
  { id: "visit.schedule", operation: "visit.schedule" },
  { id: "documents.review", operation: "documents.collect" },
  { id: "documents.collect", operation: "documents.collect" },
  { id: "proposal.create", operation: "proposal.create" },
  { id: "deal.review", operation: "deal.review" },
  { id: "contract.prepare", operation: "contract.prepare" },
  { id: "commission.settle", operation: "commission.settle" },
];

for (const { id, operation } of OPERATIONAL_CASES) {
  test(`actionId '${id}' maps to operation '${operation}'`, () => {
    const canonical = {
      recommendedActions: [{ id, label: id, actionType: "operational" }],
    };
    const result = resolveImobCrmActionDispatch({
      actionId: id,
      caseId: "case-map-test",
      canonical,
      message: id,
      timestamp: TS,
    });
    assert.ok(result !== null, `${id} should not return null`);
    assert.equal((result as any).mode, "execute", `${id} should return execute`);
    assert.equal((result as any).executionRequest.operation, operation);
  });
}
