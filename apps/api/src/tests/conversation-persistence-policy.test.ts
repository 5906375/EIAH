import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeConversationPersistencePolicy,
  resolveConversationPersistenceDecision,
} from "../services/conversationPersistencePolicy";

test("normaliza policy efemera por padrao", () => {
  const policy = normalizeConversationPersistencePolicy(undefined);
  assert.equal(policy.mode, "ephemeral");
  assert.equal(policy.persistShortTermMemory, false);
  assert.ok(policy.promoteOn?.includes("critical_execution"));
});

test("promove para durable em execucao critica", () => {
  const decision = resolveConversationPersistenceDecision({
    metadata: {
      conversationPersistence: {
        mode: "ephemeral",
        promoteOn: ["critical_execution"],
      },
      criticalExecution: true,
    },
  });

  assert.equal(decision.mode, "durable");
  assert.equal(decision.promoted, true);
  assert.equal(decision.reason, "critical_execution");
});

test("mantem efemero sem gatilho de promocao", () => {
  const decision = resolveConversationPersistenceDecision({
    metadata: {
      conversationPersistence: {
        mode: "ephemeral",
        promoteOn: ["approval_required"],
      },
    },
  });

  assert.equal(decision.mode, "ephemeral");
  assert.equal(decision.persistShortTermMemory, false);
  assert.equal(decision.reason, "ephemeral_default");
});
