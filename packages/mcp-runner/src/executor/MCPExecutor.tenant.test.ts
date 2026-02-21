import test from "node:test";
import assert from "node:assert/strict";
import { MCPExecutor } from "./MCPExecutor";
import type { ToolContract } from "../types/ToolContract";

function createContract(): ToolContract {
  return {
    name: "tool.db.audit",
    version: "1.0.0",
    tenantId: "tenant-a",
    inputSchema: {
      type: "object",
      properties: {
        table: { type: "string" },
        operation: { type: "string" },
        where: { type: "object" },
        context: { type: "object" },
      },
      required: ["table"],
      additionalProperties: true,
    },
    executor: "db",
    trustLevel: 60,
  };
}

test("denies db executor when feature flag is disabled", async () => {
  process.env.MCP_DB_EXECUTOR_ENABLED = "false";
  delete process.env.MCP_DB_EXECUTOR_MODE;

  const events: Array<{ reasonCode: string }> = [];
  const executor = new MCPExecutor(createContract(), {
    onDbPolicyViolation: (event) => {
      events.push({ reasonCode: event.reasonCode });
    },
  });

  await assert.rejects(
    () =>
      executor.run({
        table: "guardrailLedger",
      }),
    /denied by policy/i
  );
  assert.equal(events.some((event) => event.reasonCode === "DB_EXECUTOR_DISABLED"), true);
});

test("denies db executor with explicit missing actor code", async () => {
  process.env.MCP_DB_EXECUTOR_ENABLED = "true";
  process.env.MCP_DB_EXECUTOR_MODE = "scoped";
  process.env.MCP_DB_EXECUTOR_MODEL_ALLOWLIST = "guardrailLedger";

  const events: Array<{ reasonCode: string }> = [];
  const executor = new MCPExecutor(createContract(), {
    onDbPolicyViolation: (event) => {
      events.push({ reasonCode: event.reasonCode });
    },
  });

  await assert.rejects(
    () =>
      executor.run({
        table: "guardrailLedger",
        context: {
          tenantId: "tenant-a",
          workspaceId: "workspace-a",
          reason: "security-check",
          toolContractVersion: "1.0.0",
        },
      }),
    /MCP_DB_EXECUTOR_DENIED_MISSING_ACTOR/i
  );
  assert.equal(events.some((event) => event.reasonCode === "DB_MISSING_ACTOR"), true);
});

test("denies cross-tenant execution before db query", async () => {
  process.env.MCP_DB_EXECUTOR_ENABLED = "true";
  process.env.MCP_DB_EXECUTOR_MODE = "scoped";
  process.env.MCP_DB_EXECUTOR_MODEL_ALLOWLIST = "guardrailLedger";

  const events: Array<{ reasonCode: string }> = [];
  const executor = new MCPExecutor(createContract(), {
    onDbPolicyViolation: (event) => {
      events.push({ reasonCode: event.reasonCode });
    },
  });

  await assert.rejects(
    () =>
      executor.run({
        table: "guardrailLedger",
        context: {
          tenantId: "tenant-b",
          workspaceId: "workspace-a",
          actorId: "actor-a",
          runId: "run-a",
          requestId: "request-a",
          reason: "security-check",
          toolContractVersion: "1.0.0",
        },
      }),
    /denied by policy/i
  );
  assert.equal(events.some((event) => event.reasonCode === "DB_CONTEXT_MISSING"), true);
});
