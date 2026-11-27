import assert from "node:assert/strict";
import test from "node:test";
import { oraculoEmptyReturnPreparationV1Schema, oraculoGateIntentV1Schema } from "@eiah/contracts";
import { assessEmptyReturnPreparation } from "./preparation.js";

const scope = { tenantId: "tenant-a", workspaceId: "workspace-a" };
const draft = (context?: unknown) => ({
  schemaVersion: "oraculo.empty-return-preparation.v1", ...scope,
  ...(context === undefined ? {} : { context }),
});
const informed = { status: "informed", value: "Informação declarada pelo usuário" };

test("incomplete preparation is accepted without inventing location or flow", () => {
  const result = assessEmptyReturnPreparation(scope, draft());
  assert.equal(result.preparationAllowed, true);
  assert.equal(result.assessment, "context_indeterminate");
  assert.deepEqual(result.pendingFields, ["port", "depot", "flow"]);
  assert.deepEqual(result.draft.context.port, { status: "not_informed" });
  assert.equal(result.executionAllowed, false);
  assert.equal(result.externalTransmissionAllowed, false);
  assert.equal(result.authorizationState, "NOT_REQUESTED");
});

test("an unconfirmed description is preserved and still pending", () => {
  const result = assessEmptyReturnPreparation(scope, draft({
    port: informed, depot: { status: "to_confirm", value: " Depósito candidato " },
  }));
  assert.deepEqual(result.pendingFields, ["depot", "flow"]);
  assert.deepEqual(result.draft.context.depot, { status: "to_confirm", value: "Depósito candidato" });
});

test("non-applicability requires a justification and cannot silently exempt a field", () => {
  assert.equal(oraculoEmptyReturnPreparationV1Schema.safeParse(draft({
    port: { status: "not_applicable", justification: " " },
  })).success, false);
  const result = assessEmptyReturnPreparation(scope, draft({
    port: { status: "not_applicable", justification: "Devolução em depósito interior; verificar contexto" },
    depot: informed, flow: informed,
  }));
  assert.equal(result.assessment, "context_review_required");
  assert.deepEqual(result.reviewFields, ["port"]);
  assert.equal(result.executionAllowed, false);
});

test("fully described context neither grants execution nor becomes a gate intent", () => {
  const result = assessEmptyReturnPreparation(scope, draft({ port: informed, depot: informed, flow: informed }));
  assert.equal(result.assessment, "context_described");
  assert.deepEqual(result.pendingFields, []);
  assert.equal(result.executionAllowed, false);
  assert.equal(result.authorizationState, "NOT_REQUESTED");
  assert.equal(result.externalTransmissionAllowed, false);
  assert.equal(oraculoGateIntentV1Schema.safeParse(result.draft).success, false);
});

test("scope must match trusted context, including workspace within the same tenant", () => {
  for (const different of [{ ...scope, tenantId: "other" }, { ...scope, workspaceId: "other" }]) {
    assert.throws(() => assessEmptyReturnPreparation(different, draft()), /authenticated scope/);
  }
  assert.throws(() => assessEmptyReturnPreparation({ tenantId: "", workspaceId: "" }, draft()), /required/);
});

test("authority claims and contradictory field shapes are rejected", () => {
  for (const extra of [{ executionAllowed: true }, { hitlApproval: {} }, { mode: "SIMULATION" }]) {
    assert.equal(oraculoEmptyReturnPreparationV1Schema.safeParse({ ...draft(), ...extra }).success, false);
  }
  for (const port of [{ status: "informed", value: " " }, { status: "not_informed", value: "hidden" },
    { status: "not_applicable", justification: "claim", value: "hidden" }]) {
    assert.equal(oraculoEmptyReturnPreparationV1Schema.safeParse(draft({ port })).success, false);
  }
});

test("assessment has no cross-request state or mutation of the caller input", () => {
  const input = draft({ port: { status: "to_confirm", value: " Candidato " } });
  const before = structuredClone(input);
  assessEmptyReturnPreparation(scope, input);
  assert.deepEqual(input, before);
  const next = assessEmptyReturnPreparation({ tenantId: "tenant-b", workspaceId: "workspace-b" }, {
    ...draft(), tenantId: "tenant-b", workspaceId: "workspace-b",
  });
  assert.deepEqual(next.pendingFields, ["port", "depot", "flow"]);
});
