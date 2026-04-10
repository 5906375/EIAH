import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveObserveAgentId } from "../workers/runWorkerObserve";

test("resolveObserveAgentId uses context agentId when provided", () => {
  const resolved = resolveObserveAgentId({
    contextAgentId: "imob-chat",
    runAgentId: "EIAH",
  });
  assert.equal(resolved, "imob-chat");
});

test("resolveObserveAgentId falls back to run agentId when context is missing", () => {
  const resolved = resolveObserveAgentId({
    contextAgentId: undefined,
    runAgentId: "EIAH",
  });
  assert.equal(resolved, "EIAH");
});

test("resolveObserveAgentId falls back to run agentId when context is invalid", () => {
  const resolved = resolveObserveAgentId({
    contextAgentId: "   ",
    runAgentId: "EIAH",
  });
  assert.equal(resolved, "EIAH");
});

