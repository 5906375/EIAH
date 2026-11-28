import test from "node:test";
import assert from "node:assert/strict";
import { RUN_TRANSITION_VERSION, reconstructRunAtCutoff, type RunTransition } from "../lib/p1RunTransitionHistory.js";

const createdAt = "2026-09-20T00:00:00Z", cutoffAt = "2026-09-28T00:00:00Z";
function fixture() {
  const initial: RunTransition = {
    schemaVersion: RUN_TRANSITION_VERSION, transitionId: "e0", sequence: 0,
    tenantId: "t", workspaceId: "w", runId: "r", previousStatus: null, status: "pending",
    previousFinishedAt: null, finishedAt: null, committedAt: createdAt,
    producerId: "synthetic-writer", operationRef: "synthetic-operation",
  };
  const later: RunTransition = { ...initial, transitionId: "e1", sequence: 1,
    previousStatus: "pending", status: "success", finishedAt: "2026-09-29T00:00:00Z",
    committedAt: "2026-09-29T00:00:00Z" };
  return { tenantId: "t", workspaceId: "w", runId: "r", createdAt, cutoffAt,
    transitions: [initial, later] as RunTransition[], current: { status: "success", finishedAt: later.finishedAt } };
}
test("state at cutoff stays pending despite a later successful update", () => {
  const result = reconstructRunAtCutoff(fixture());
  assert.deepEqual(result.stateAtCutoff, { status: "pending", finishedAt: null, sequence: 0 });
  assert.equal(result.lastSequence, 1);
  assert.equal(result.stateAtCutoffVerification, "not_demonstrated");
  assert.equal(result.operationalEligibility, "blocked");
});
test("an event committed exactly at the cutoff belongs to the observed state", () => {
  const input = fixture();
  input.transitions[1] = { ...input.transitions[1], committedAt: cutoffAt, finishedAt: cutoffAt };
  input.current.finishedAt = cutoffAt;
  assert.deepEqual(reconstructRunAtCutoff(input).stateAtCutoff,
    { status: "success", finishedAt: cutoffAt, sequence: 1 });
});
test("missing, duplicate and contradictory transitions fail closed", () => {
  const missing = fixture(); missing.transitions[1] = { ...missing.transitions[1], sequence: 2 };
  assert.throws(() => reconstructRunAtCutoff(missing), /transition_sequence_gap_or_duplicate/);
  const duplicate = fixture(); duplicate.transitions[1] = { ...duplicate.transitions[1], transitionId: "e0" };
  assert.throws(() => reconstructRunAtCutoff(duplicate), /duplicate_transition_id/);
  const contradictory = fixture(); contradictory.transitions[1] = { ...contradictory.transitions[1], previousStatus: "running" };
  assert.throws(() => reconstructRunAtCutoff(contradictory), /transition_chain_mismatch/);
});
test("historical omission and mismatch with current row never reconstruct silently", () => {
  const missingInitial = fixture(); missingInitial.transitions.splice(0, 1);
  assert.throws(() => reconstructRunAtCutoff(missingInitial), /transition_sequence_gap_or_duplicate/);
  const changed = fixture(); changed.current.status = "error";
  assert.throws(() => reconstructRunAtCutoff(changed), /current_run_state_mismatch/);
  const lateInitial = fixture(); lateInitial.transitions[0] = { ...lateInitial.transitions[0], committedAt: "2026-09-29T00:00:00Z" };
  assert.throws(() => reconstructRunAtCutoff(lateInitial), /transition_commit_order_invalid|initial_transition_after_cutoff/);
});
test("cross-tenant and unknown state fail closed", () => {
  const other = fixture(); other.transitions[1] = { ...other.transitions[1], tenantId: "other" };
  assert.throws(() => reconstructRunAtCutoff(other), /invalid_transition_identity/);
  const unknown = fixture(); unknown.transitions[1] = { ...unknown.transitions[1], status: "unknown" };
  assert.throws(() => reconstructRunAtCutoff(unknown), /unknown_transition_status/);
});
