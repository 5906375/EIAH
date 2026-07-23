import assert from "node:assert/strict";
import test from "node:test";
import type { RegisteredAction } from "@eiah/core";
import {
  mergeActionsForExecution,
  resolveLocallyExecutableAction,
  resolveDeclaredActionNames,
  resolveMissingToolContractFallback,
} from "../workers/runWorkerActionResolution";
import { simulatedToolExecutionResultSchema } from "../services/imob/imobCanonical";

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
    "guardian.checkEnvironmentSegregation": createAction("guardian.checkEnvironmentSegregation"),
    "guardian.checkRuntimeHealth": createAction("guardian.checkRuntimeHealth"),
    "guardian.checkEdgeProtection": createAction("guardian.checkEdgeProtection"),
  };
  const canonical = new Map<string, string>([
    ["realestate.apply_adjustment", "realestate.apply_adjustment"],
    ["guardian.checkenvironmentsegregation", "guardian.checkEnvironmentSegregation"],
    ["guardian.checkruntimehealth", "guardian.checkRuntimeHealth"],
    ["guardian.checkedgeprotection", "guardian.checkEdgeProtection"],
  ]);

  const declared = resolveDeclaredActionNames(
    ["guardian.checkEnvironmentSegregation", "guardian.checkRuntimeHealth", "guardian.checkEdgeProtection"],
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
  assert.ok(merged["guardian.checkEnvironmentSegregation"]);
  assert.ok(merged["guardian.checkRuntimeHealth"]);
  assert.ok(merged["guardian.checkEdgeProtection"]);
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

test("run worker missing ToolContract fallback preserves the current realestate success payload", () => {
  const result = resolveMissingToolContractFallback(
    "realestate.register_property",
    "1.0.0",
    { a: 1, b: 2 }
  );

  // CARACTERIZAÇÃO TEMPORÁRIA LEG-001 — comportamento permissivo atual. Expectativa futura: fail-closed com reasonCode MCP_TOOL_CONTRACT_MISSING (MCP-1I). Este teste SERÁ invertido.
  assert.deepEqual(result, {
    ok: true,
    simulated: true,
    action: "realestate.register_property",
    version: "1.0.0",
    status: "success",
    output: {
      message: "Simulated realestate.register_property execution",
      payloadPreview: ["a", "b"],
    },
  });
});

test("run worker missing ToolContract fallback does not simulate non-realestate actions", () => {
  assert.equal(
    resolveMissingToolContractFallback("guardian.checkRuntimeHealth", "1.0.0", {}),
    null
  );
});

test("run worker missing ToolContract fallback limits payload preview to eight keys", () => {
  const result = resolveMissingToolContractFallback(
    "realestate.register_property",
    "1.0.0",
    { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7, h: 8, i: 9 }
  );

  assert.deepEqual(result?.output.payloadPreview, ["a", "b", "c", "d", "e", "f", "g", "h"]);
});

test("run worker missing ToolContract fallback remains compatible with the canonical schema", () => {
  const result = resolveMissingToolContractFallback(
    "realestate.register_property",
    "1.0.0",
    null
  );

  assert.equal(simulatedToolExecutionResultSchema.safeParse(result).success, true);
});
