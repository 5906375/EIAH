import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createActionRunnerHandler } from "./index";

test("action runner blocks job when trust score is below threshold", async () => {
  const tenantId = "tenant-test";
  const workspaceId = "workspace-test";
  const runId = "run-test";
  const secret = "test-secret";

  process.env.INTENT_SIGNATURE_SECRET = secret;
  process.env.MCP_ENFORCE_CONTRACTS = "true";
  process.env.TRUST_SCORE_THRESHOLD = "40";

  const intentSignature = crypto
    .createHmac("sha256", secret)
    .update(`${tenantId}:${workspaceId}:${runId}`)
    .digest("hex");

  const auditEvents: Array<{ eventType?: string }> = [];
  const executeCalls: unknown[] = [];

  const handler = createActionRunnerHandler({
    consumeActions: async () => undefined as any,
    getPrismaForTenant: () =>
      ({
        toolContract: {
          findFirst: async () => ({ id: "tc-1" }),
        },
        $disconnect: async () => undefined,
      }) as any,
    tenantActionResolver: () => ({ "tool.test": { name: "tool.test" } }),
    executeWithMCP: async () => {
      executeCalls.push(true);
      return { result: { ok: true }, tool: { trustLevel: 1 }, hash: "hash" };
    },
    mcpEnforcementConfigFromEnv: () => ({ enabled: true, defaultVersion: "1.0.0" }),
    resolveMcpToolVersion: () => "1.0.0",
    evaluateTrustScore: async () => ({ score: 10, level: "low", reasons: [] }),
    trustScoreAllowsExecution: (report, threshold) => report.score >= threshold,
    evaluateIntent: async () => ({
      intent: null,
      score: 0.9,
      flags: [],
      verdict: "observe",
      signature: "sig",
    }),
    rateLimit: () => ({ before: async () => undefined } as any),
    createFixedWindowRateLimiter: () =>
      ({
        consume: async () => ({ allowed: true, remaining: 1, resetAt: Date.now() }),
      }) as any,
    tenantRateLimitKey: () => "rl",
    recordGuardrailAudit: async (params) => {
      auditEvents.push({ eventType: params.eventType });
    },
    appendSignedHash: async () => undefined as any,
  });

  const result = await handler(
    {
      tenantId,
      workspaceId,
      runId,
      action: "tool.test",
      metadata: { intentSignature },
      input: {},
      stepId: "step-1",
    },
    { id: "job-1" }
  );

  assert.equal(result.status, "error");
  assert.match(result.error, /Trust score too low/);
  assert.equal(executeCalls.length, 0);
  assert.ok(auditEvents.some((event) => event.eventType === "trust.gate.blocked"));
});

test("action runner denies missing ToolContract with active reasonCode before execution", async () => {
  const tenantId = "tenant-test";
  const workspaceId = "workspace-test";
  const runId = "run-test";
  const secret = "test-secret";
  const sensitivePayload = { credential: "must-not-leak" };

  process.env.INTENT_SIGNATURE_SECRET = secret;
  process.env.MCP_ENFORCE_CONTRACTS = "true";

  const intentSignature = crypto
    .createHmac("sha256", secret)
    .update(`${tenantId}:${workspaceId}:${runId}`)
    .digest("hex");

  const audits: Array<{
    eventType?: string;
    message?: string;
    metadata?: Record<string, unknown>;
  }> = [];
  let executeCalls = 0;

  const handler = createActionRunnerHandler({
    consumeActions: async () => undefined as any,
    getPrismaForTenant: () =>
      ({
        toolContract: {
          findFirst: async () => null,
        },
        $disconnect: async () => undefined,
      }) as any,
    tenantActionResolver: () => ({ "tool.test": { name: "tool.test" } }),
    executeWithMCP: async () => {
      executeCalls += 1;
      return { result: { ok: true }, tool: { trustLevel: 1 }, hash: "hash" };
    },
    mcpEnforcementConfigFromEnv: () => ({
      enabled: true,
      defaultVersion: "1.0.0",
    }),
    resolveMcpToolVersion: () => "1.0.0",
    evaluateTrustScore: async () => ({ score: 100, level: "high", reasons: [] }),
    trustScoreAllowsExecution: () => true,
    evaluateIntent: async () => ({
      intent: null,
      score: 0.9,
      flags: [],
      verdict: "observe",
      signature: "sig",
    }),
    rateLimit: () => ({ before: async () => undefined } as any),
    createFixedWindowRateLimiter: () =>
      ({
        consume: async () => ({
          allowed: true,
          remaining: 1,
          resetAt: Date.now(),
        }),
      }) as any,
    tenantRateLimitKey: () => "rl",
    recordGuardrailAudit: async (params) => {
      audits.push(params as any);
    },
    appendSignedHash: async () => undefined as any,
  });

  const result = await handler(
    {
      tenantId,
      workspaceId,
      runId,
      action: "tool.test",
      metadata: { intentSignature },
      input: sensitivePayload,
      stepId: "step-1",
    },
    { id: "job-1" }
  );

  assert.equal(result.status, "error");
  assert.equal((result as any).reasonCode, "MCP_TOOL_CONTRACT_MISSING");
  assert.equal(executeCalls, 0);
  assert.equal(JSON.stringify(result).includes(sensitivePayload.credential), false);
  assert.equal(audits.length, 1);
  assert.equal(
    audits[0]?.metadata?.reasonCode,
    "MCP_TOOL_CONTRACT_MISSING"
  );
  assert.equal(
    JSON.stringify(audits[0]).includes(sensitivePayload.credential),
    false
  );
});
