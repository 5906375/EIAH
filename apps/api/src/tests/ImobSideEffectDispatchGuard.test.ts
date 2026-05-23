import test from "node:test";
import assert from "node:assert/strict";

import { reserveSideEffectCommand } from "../services/imob/orchestrator/imobSideEffectDispatchGuard";

test("side effect reservation passes with unique idempotency key", () => {
  const result = reserveSideEffectCommand({
    operationHasOwner: true,
    existingIdempotencyKeys: new Set<string>(),
    command: {
      commandId: "cmd-1",
      idempotencyKey: "visit:case-1:slot-a",
      operation: "visit",
      caseId: "case-1",
      mission: "schedule_and_follow_visit",
      step: "selecting_slot",
      targetAgent: "IMOB_VisitAgent",
    },
  });

  assert.equal(result.ok, true);
});

test("duplicate idempotency key blocks side effect", () => {
  const result = reserveSideEffectCommand({
    operationHasOwner: true,
    existingIdempotencyKeys: new Set<string>(["visit:case-1:slot-a"]),
    command: {
      commandId: "cmd-2",
      idempotencyKey: "visit:case-1:slot-a",
      operation: "visit",
      caseId: "case-1",
      mission: "schedule_and_follow_visit",
      step: "confirming_participants",
      targetAgent: "IMOB_VisitAgent",
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reasonCode, "DUPLICATE_SIDE_EFFECT_BLOCKED");
});

test("operation without owner fails closed", () => {
  const result = reserveSideEffectCommand({
    operationHasOwner: false,
    existingIdempotencyKeys: new Set<string>(),
    command: {
      commandId: "cmd-3",
      idempotencyKey: "proof:case-1:bundle",
      operation: "proof",
      caseId: "case-1",
      mission: "case_review",
      step: "generating_snapshot",
      targetAgent: "Guardian_EvidenceAgent",
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reasonCode, "NO_AGENT_FOR_OPERATION");
});
