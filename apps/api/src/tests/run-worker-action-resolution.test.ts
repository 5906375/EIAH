import assert from "node:assert/strict";
import test from "node:test";
import type { RegisteredAction } from "@eiah/core";
import { AgentOrchestrator } from "../../../../packages/core/src/orchestrator/agentOrchestrator";
import {
  AuditWriteFailedError,
  MissingToolContractError,
  recordCriticalMcpAudit,
  recordMissingToolContractAudit,
  mergeActionsForExecution,
  resolveActiveMcpDenyRunFailure,
  resolveLocallyExecutableAction,
  resolveDeclaredActionNames,
  resolveMissingToolContractDecision,
  resolveMissingToolContractFallback,
  resolveMissingToolContractRunFailure,
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

test("run worker core_local resolution requires an exact active ToolContract", () => {
  const catalog: Record<string, RegisteredAction> = {
    "guardian.checkRuntimeHealth": createAction("guardian.checkRuntimeHealth"),
  };
  const activeContract = {
    name: "guardian.checkRuntimeHealth",
    version: "1.0.0",
    tenantId: "tenant-1",
    status: "active",
  };

  assert.equal(
    resolveLocallyExecutableAction(
      "guardian.checkRuntimeHealth",
      catalog,
      activeContract
    )?.name,
    "guardian.checkRuntimeHealth"
  );
  assert.equal(
    resolveLocallyExecutableAction(
      "guardian.checkRuntimeHealth",
      catalog,
      null
    ),
    null
  );
  assert.equal(
    resolveLocallyExecutableAction("guardian.unknown", catalog, activeContract),
    null
  );
});

test("run worker missing ToolContract fails closed for realestate actions", () => {
  const result = resolveMissingToolContractFallback(
    "realestate.register_property",
    "1.0.0",
    { a: 1, b: 2 }
  );

  // Comportamento fail-closed canônico desde MCP-1I. Regressão para fallback simulado é violação P0.
  assert.deepEqual(result, {
    ok: false,
    status: "error",
    reasonCode: "MCP_TOOL_CONTRACT_MISSING",
    action: "realestate.register_property",
    version: "1.0.0",
  });
  assert.equal("simulated" in result, false);
});

test("run worker missing ToolContract fails closed for non-realestate MCP actions", () => {
  const result = resolveMissingToolContractFallback(
    "guardian.checkRuntimeHealth",
    "1.0.0",
    {}
  );

  assert.equal(result.ok, false);
  assert.equal(result.status, "error");
  assert.equal(result.reasonCode, "MCP_TOOL_CONTRACT_MISSING");
  assert.equal("simulated" in result, false);
});

test("run worker keeps the valid ToolContract path outside the missing-contract block", () => {
  const validContract = { name: "realestate.register_property", status: "active" };

  assert.equal(
    resolveMissingToolContractDecision(
      validContract,
      "realestate.register_property",
      "1.0.0",
      {}
    ),
    null
  );
});

test("run worker classifies missing ToolContract as canonical run error", () => {
  const blocked = resolveMissingToolContractFallback(
    "realestate.register_property",
    "1.0.0",
    {}
  );
  const failure = resolveMissingToolContractRunFailure(
    new MissingToolContractError(blocked)
  );

  assert.equal(failure?.status, "error");
  assert.equal(failure?.reasonCode, "MCP_TOOL_CONTRACT_MISSING");
});

test("run worker preserves only active DB deny reasonCodes in run failure", () => {
  for (const reasonCode of [
    "DB_SCOPE_MISSING",
    "DB_MODEL_NOT_ALLOWLISTED",
  ] as const) {
    const failure = resolveActiveMcpDenyRunFailure(
      Object.assign(new Error("Governed MCP DB deny"), { reasonCode })
    );
    assert.equal(failure?.status, "error");
    assert.equal(failure?.reasonCode, reasonCode);
  }

  assert.equal(
    resolveActiveMcpDenyRunFailure(
      Object.assign(new Error("Ambiguous scope deny"), {
        reasonCode: "DB_SCOPE_VIOLATION",
      })
    ),
    null
  );
});

test("run worker emits canonical missing-contract audit", async () => {
  const audits: unknown[] = [];

  await recordMissingToolContractAudit({
    actionName: "realestate.register_property",
    version: "1.0.0",
    runId: "run-1",
    tenantId: "tenant-1",
    stepId: "step-1",
    record: async (audit) => {
      audits.push(audit);
    },
    logFailure: () => assert.fail("audit logger must not run on success"),
  });

  assert.deepEqual(audits, [
    {
      eventType: "mcp.tool.missing_contract",
      severity: "warn",
      message: "ToolContract missing: realestate.register_property@1.0.0",
      metadata: {
        tool: "realestate.register_property",
        version: "1.0.0",
        stepId: "step-1",
        reasonCode: "MCP_TOOL_CONTRACT_MISSING",
      },
    },
  ]);
});

test("run worker logs missing-contract audit failure with explicit context", async () => {
  const logs: unknown[] = [];
  const auditError = new Error("audit unavailable");

  await assert.rejects(
    recordMissingToolContractAudit({
      actionName: "realestate.register_property",
      version: "1.0.0",
      runId: "run-1",
      tenantId: "tenant-1",
      record: async () => {
        throw auditError;
      },
      logFailure: (context) => {
        logs.push(context);
      },
    }),
    (error) => error instanceof AuditWriteFailedError && error.reasonCode === "AUDIT_WRITE_FAILED"
  );

  assert.deepEqual(logs, [
    {
      err: auditError,
      runId: "run-1",
      tenantId: "tenant-1",
      action: "realestate.register_property",
      version: "1.0.0",
      reasonCode: "AUDIT_WRITE_FAILED",
    },
  ]);
});

test("run worker classifies critical MCP audit failure as canonical run error", async () => {
  const auditError = new Error("audit unavailable");

  await assert.rejects(
    recordCriticalMcpAudit({
      runId: "run-1",
      tenantId: "tenant-1",
      action: "realestate.register_property",
      version: "1.0.0",
      record: async () => {
        throw auditError;
      },
      logFailure: () => undefined,
    }),
    (error) => {
      const failure = resolveMissingToolContractRunFailure(error);
      return failure?.status === "error" && failure.reasonCode === "AUDIT_WRITE_FAILED";
    }
  );
});

test("AgentOrchestrator marks missing-contract step failed and never completed", async () => {
  const plan = [
    {
      id: "step-1",
      description: "missing contract",
      status: "pending" as const,
      action: "realestate.register_property",
      params: {},
    },
  ];
  const events: string[] = [];
  const blocked = resolveMissingToolContractFallback(
    "realestate.register_property",
    "1.0.0",
    {}
  );
  const orchestrator = new AgentOrchestrator({
    plan: async () => plan,
    act: async () => null,
    mcpExecutor: {
      run: async () => {
        throw new MissingToolContractError(blocked);
      },
    },
    eventStore: {
      async record(event) {
        events.push(event.type);
      },
    },
  });

  await assert.rejects(
    orchestrator.run({
      objective: "test",
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      runId: "run-1",
      mcpProxyAllActions: true,
    }),
    /ToolContract missing/
  );

  assert.equal(plan[0].status, "failed");
  assert.equal(events.includes("run.step.failed"), true);
  assert.equal(events.includes("run.step.completed"), false);
});
