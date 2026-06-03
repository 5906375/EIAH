import assert from "node:assert/strict";
import test from "node:test";
import type { RegisteredAction } from "@eiah/core";
import {
  mergeActionsForExecution,
  resolveLocallyExecutableAction,
  resolveDeclaredActionNames,
} from "../workers/runWorkerActionResolution";

function createAction(name: string): RegisteredAction {
  return {
    name,
    version: "1.0.0",
    handler: async () => ({ status: "success", output: { ok: true } }),
  };
}

test("run worker action resolution keeps tenant policy and also allows agent-declared core actions", () => {
  const definitions: Record<string, RegisteredAction> = {
    "realestate.apply_adjustment": createAction("realestate.apply_adjustment"),
    "guardian.checkRuntimeHealth": createAction("guardian.checkRuntimeHealth"),
  };
  const canonical = new Map<string, string>([
    ["realestate.apply_adjustment", "realestate.apply_adjustment"],
    ["guardian.checkruntimehealth", "guardian.checkRuntimeHealth"],
  ]);

  const declared = resolveDeclaredActionNames(
    ["guardian.checkRuntimeHealth"],
    canonical,
    definitions
  );
  const merged = mergeActionsForExecution({
    configured: {},
    definitions,
    dbAllowedCanonical: ["realestate.apply_adjustment"],
    dbAllowedRaw: ["realestate.apply_adjustment"],
    declaredAgentActions: declared,
  });

  assert.ok(merged["realestate.apply_adjustment"]);
  assert.ok(merged["guardian.checkRuntimeHealth"]);
});

test("run worker action resolution ignores agent-declared actions that are not in core catalog", () => {
  const definitions: Record<string, RegisteredAction> = {
    "guardian.checkRuntimeHealth": createAction("guardian.checkRuntimeHealth"),
  };
  const canonical = new Map<string, string>([
    ["guardian.checkruntimehealth", "guardian.checkRuntimeHealth"],
  ]);

  const declared = resolveDeclaredActionNames(
    ["guardian.checkRuntimeHealth", "guardian.unknownAction"],
    canonical,
    definitions
  );

  assert.deepEqual(declared, ["guardian.checkRuntimeHealth"]);
});

test("run worker action resolution exposes locally executable core actions for proxy fallback", () => {
  const catalog: Record<string, RegisteredAction> = {
    "guardian.checkRuntimeHealth": createAction("guardian.checkRuntimeHealth"),
  };

  assert.equal(
    resolveLocallyExecutableAction("guardian.checkRuntimeHealth", catalog)?.name,
    "guardian.checkRuntimeHealth"
  );
  assert.equal(resolveLocallyExecutableAction("guardian.unknown", catalog), null);
});
