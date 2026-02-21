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

test("action runner blocks critical action when signer fails before execution", async () => {
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

  const executeCalls: unknown[] = [];

  const handler = createActionRunnerHandler({
    consumeActions: async () => undefined as any,
    getPrismaForTenant: () =>
      ({
        toolContract: {
          findFirst: async () => ({ id: "tc-critical", trustLevel: 95 }),
        },
        $disconnect: async () => undefined,
      }) as any,
    tenantActionResolver: () => ({
      "tool.critical": { name: "tool.critical", criticality: "critical" } as any,
    }),
    executeWithMCP: async () => {
      executeCalls.push(true);
      return { result: { ok: true }, tool: { trustLevel: 95 }, hash: "hash-critical" };
    },
    mcpEnforcementConfigFromEnv: () => ({ enabled: true, defaultVersion: "1.0.0" }),
    resolveMcpToolVersion: () => "1.0.0",
    evaluateTrustScore: async () => ({ score: 90, level: "high", reasons: [] }),
    trustScoreAllowsExecution: (report, threshold) => report.score >= threshold,
    evaluateIntent: async () => ({
      intent: null,
      score: 0.95,
      flags: [],
      verdict: "allow",
      signature: "sig",
    }),
    rateLimit: () => ({ before: async () => undefined } as any),
    createFixedWindowRateLimiter: () =>
      ({
        consume: async () => ({ allowed: true, remaining: 1, resetAt: Date.now() }),
      }) as any,
    tenantRateLimitKey: () => "rl",
    recordGuardrailAudit: async () => undefined,
    appendSignedHash: async () => {
      throw new Error("vault unavailable");
    },
  });

  const result = await handler(
    {
      tenantId,
      workspaceId,
      runId,
      action: "tool.critical",
      metadata: { intentSignature },
      input: { amount: 1 },
      stepId: "step-critical",
    },
    { id: "job-critical" }
  );

  assert.equal(result.status, "error");
  assert.match(result.error, /SCL signature required/);
  assert.equal(executeCalls.length, 0);
});
