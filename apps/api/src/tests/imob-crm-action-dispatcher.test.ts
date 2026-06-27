import test from "node:test";
import assert from "node:assert/strict";
import { resolveImobCrmActionDispatch } from "../services/imob/crm/imobCrmActionDispatcher";
import {
  buildImobPendingAction,
  parseImobPendingAction,
  withImobPendingActionStatus,
} from "../services/imob/crm/imobPendingActionRuntime";

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
    threadId: "thread-abc",
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
  assert.equal((result as any).executionRequest.input.sourceActionId, "owner.register");
  assert.equal((result as any).executionRequest.input.threadId, "thread-abc");
  assert.equal((result as any).executionRequest.input.reasonCode, "missing_owner");
  assert.equal((result as any).caseContext?.caseId, "case-abc");
  assert.equal((result as any).caseContext?.threadId, "thread-abc");
  assert.equal((result as any).conversationState?.operational?.pendingAction?.status, "awaiting_confirmation");
});

// Scenario 2: actionId is consultive → returns null (fall through to engine)
test("consultive actionId returns null so engine handles it as consult", () => {
  const result = resolveImobCrmActionDispatch({
    actionId: "case.consult",
    caseId: "case-abc",
    threadId: "thread-abc",
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
    threadId: "thread-abc",
    canonical: makeCanonical(),
    message: "qualificar lead",
    timestamp: TS,
  });
  assert.ok(result !== null);
  assert.equal((result as any).mode, "blocked");
  assert.equal((result as any).presentation?.metadata?.workflowReasonCode, "PENDING_ACTION_MISMATCH");
  assert.ok((result as any).presentation?.text?.includes("lead.qualify"));
});

// Scenario 4: canonical is null → every actionId is not found → blocked
test("null canonical blocks any actionId with ACTION_NOT_ALLOWED_FOR_CASE", () => {
  const result = resolveImobCrmActionDispatch({
    actionId: "property.create",
    caseId: "case-abc",
    threadId: "thread-abc",
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
    threadId: "thread-xyz",
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
      threadId: "thread-map-test",
      canonical,
      message: id,
      timestamp: TS,
    });
    assert.ok(result !== null, `${id} should not return null`);
    assert.equal((result as any).mode, "execute", `${id} should return execute`);
    assert.equal((result as any).executionRequest.operation, operation);
  });
}

// Bug 1 regression: actionId in ACTION_EXECUTION_MAP but absent from recommendedActions must return
// mode=blocked and must NOT produce a pendingAction with status=awaiting_confirmation.
test("Bug1: actionId in ACTION_EXECUTION_MAP mas ausente de recommendedActions retorna blocked sem awaiting_confirmation", () => {
  // lead.qualify is in ACTION_EXECUTION_MAP but not in this canonical's recommendedActions
  const result = resolveImobCrmActionDispatch({
    actionId: "lead.qualify",
    caseId: "case-b1",
    threadId: "thread-b1",
    canonical: makeCanonical(), // only owner.register, property.create, case.consult
    message: "qualificar lead",
    timestamp: TS,
  });
  assert.ok(result !== null, "should return non-null blocked result");
  assert.equal((result as any).mode, "blocked", "must be blocked, not execute");
  // The result must not carry a pendingAction with awaiting_confirmation — that would be the fail-open path
  const opPendingAction = (result as any).conversationState?.operational?.pendingAction;
  assert.ok(
    opPendingAction == null || opPendingAction.status !== "awaiting_confirmation",
    "blocked result must not expose awaiting_confirmation pendingAction",
  );
});

// Bug 1 regression: execute result must produce awaiting_confirmation pendingAction (no regression).
test("Bug1: actionId válido em recommendedActions produz pendingAction awaiting_confirmation no conversationState", () => {
  const result = resolveImobCrmActionDispatch({
    actionId: "owner.register",
    caseId: "case-b1-ok",
    threadId: "thread-b1-ok",
    canonical: makeCanonical(),
    message: "cadastrar proprietário",
    timestamp: TS,
  });
  assert.ok(result !== null);
  assert.equal((result as any).mode, "execute");
  assert.equal(
    (result as any).conversationState?.operational?.pendingAction?.status,
    "awaiting_confirmation",
    "execute result must carry awaiting_confirmation pendingAction",
  );
});

// pendingAction lifecycle: withImobPendingActionStatus transitions correctly
test("withImobPendingActionStatus sets status=cancelled on a previously awaiting_confirmation pendingAction", () => {
  const base = buildImobPendingAction({
    actionId: "owner.register",
    caseId: "case-lc",
    threadId: "thread-lc",
    createdAt: "2026-06-27T10:00:00.000Z",
    source: "command-center",
  });
  assert.ok(base !== null, "buildImobPendingAction must succeed for known actionId");
  assert.equal(base!.status, "awaiting_confirmation");

  const cancelled = withImobPendingActionStatus(base!, "cancelled");
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.actionId, "owner.register");
  assert.equal(cancelled.caseId, "case-lc");
});

// pendingAction lifecycle: parseImobPendingAction round-trips cancelled status correctly
test("parseImobPendingAction parses a cancelled pendingAction without rejecting it", () => {
  const raw = {
    actionId: "lead.qualify",
    sourceActionId: "lead.qualify",
    caseId: "case-lc2",
    threadId: "thread-lc2",
    reasonCode: null,
    status: "cancelled",
    createdAt: "2026-06-27T10:00:00.000Z",
    expiresAt: null,
    entityType: "lead",
    journey: "lead_qualification",
    source: "command-center",
  };
  const parsed = parseImobPendingAction(raw);
  assert.ok(parsed !== null, "cancelled pendingAction must parse successfully");
  assert.equal(parsed!.status, "cancelled");
  assert.equal(parsed!.actionId, "lead.qualify");
});

// pendingAction lifecycle: route guard logic — cancelled status must not become canonicalPendingAction
test("cancelled pendingAction must not pass route guard for canonicalPendingAction", () => {
  const raw = {
    actionId: "owner.register",
    sourceActionId: "owner.register",
    caseId: "case-lc3",
    threadId: "thread-lc3",
    reasonCode: null,
    status: "cancelled",
    createdAt: "2026-06-27T10:00:00.000Z",
    expiresAt: null,
    entityType: "owner",
    journey: "property_capture",
    source: "command-center",
  };
  const parsed = parseImobPendingAction(raw);
  // Simulates the route guard: only "awaiting_confirmation" becomes canonicalPendingAction
  const canonicalPendingAction = parsed?.status === "awaiting_confirmation" ? parsed : null;
  assert.equal(canonicalPendingAction, null, "cancelled pendingAction must not become canonical");
});
