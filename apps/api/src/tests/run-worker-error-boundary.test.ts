import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { McpDbPolicyError } from "../../../../packages/mcp-runner/src/executor/dbAllowlist.js";
import {
  createActionRunnerFailureError,
  persistRunFailureEvidence,
} from "../workers/runWorkerFailureEvidence";

function createEffects() {
  const order: string[] = [];
  const scl: unknown[] = [];
  const finalized: any[] = [];
  const events: any[] = [];
  return {
    order,
    scl,
    finalized,
    events,
    deps: {
      appendSclRecord: async (params: unknown) => {
        order.push("scl");
        scl.push(params);
        return { txId: "tx-1", criticalHash: "hash-1" };
      },
      finalizeRunRecord: async (params: unknown) => {
        order.push("finalize");
        finalized.push(params);
        return null;
      },
      emitRunEvent: async (params: unknown) => {
        order.push("emit");
        events.push(params);
        return null;
      },
    },
  };
}

test("governed action failure crosses boundary with one SCL trail", async () => {
  const sensitive = {
    where: { email: "private@example.test" },
    redisUrl: "redis://user:secret@example.test:6379",
  };
  const actionResult = {
    status: "error",
    error: "DB where must be an object",
    reasonCode: "DB_INPUT_INVALID",
    where: sensitive.where,
  };
  const error = createActionRunnerFailureError(actionResult, actionResult.error);
  const effects = createEffects();

  assert.equal(error instanceof McpDbPolicyError, true);
  assert.equal((error as McpDbPolicyError).reasonCode, "DB_INPUT_INVALID");

  const result = await persistRunFailureEvidence(
    {
      error,
      message: error.message,
      prisma: {},
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      runId: "run-1",
      responseForScl: () => ({ error: error.message }),
    },
    effects.deps,
  );

  assert.equal(result.reasonCode, "DB_INPUT_INVALID");
  assert.equal(effects.scl.length, 1);
  assert.equal(effects.finalized.length, 1);
  assert.equal(effects.finalized[0].errorCode, "DB_INPUT_INVALID");
  assert.equal(effects.events[0].payload.reasonCode, "DB_INPUT_INVALID");
  assert.deepEqual(effects.order, ["scl", "finalize", "emit"]);
  const evidence = JSON.stringify(effects);
  assert.equal(evidence.includes(sensitive.where.email), false);
  assert.equal(evidence.includes(sensitive.redisUrl), false);
});

test("ungoverned action failure preserves EXECUTION_FAILED fallback", async () => {
  const effects = createEffects();
  const error = new Error("Execution failed");

  const result = await persistRunFailureEvidence(
    {
      error,
      message: error.message,
      prisma: {},
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      runId: "run-1",
      responseForScl: () => ({ error: error.message }),
    },
    effects.deps,
  );

  assert.equal(result.reasonCode, "EXECUTION_FAILED");
  assert.equal(effects.finalized[0].errorCode, "EXECUTION_FAILED");
  assert.equal("reasonCode" in effects.events[0].payload, false);
  assert.equal(effects.scl.length, 1);
});

test("runWorker catch delegates once without a residual SCL write", () => {
  const source = fs.readFileSync(
    new URL("../workers/runWorker.ts", import.meta.url),
    "utf8",
  );
  const catchStart = source.indexOf('const message = error instanceof Error ? error.message : "Execution failed"');
  const catchEnd = source.indexOf("await recordReplayCompletedIfNeeded", catchStart);
  const failureCatch = source.slice(catchStart, catchEnd);

  assert.notEqual(catchStart, -1);
  assert.notEqual(catchEnd, -1);
  assert.equal(
    failureCatch.match(/await persistRunFailureEvidence\(/g)?.length,
    1,
  );
  assert.equal(failureCatch.includes("appendSclRecord({"), false);
  assert.equal(failureCatch.includes("finalizeRunRecord({"), false);
});
