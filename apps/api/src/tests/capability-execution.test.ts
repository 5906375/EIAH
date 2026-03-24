import test from "node:test";
import assert from "node:assert/strict";

import {
  CANONICAL_CAPABILITIES,
  buildCapabilityExecutionPlan,
  executeCapability,
  type CapabilityRequest,
} from "../services/capabilityExecution";

test("canonical capability list remains stable and explicit", () => {
  assert.deepEqual(CANONICAL_CAPABILITIES, [
    "chat_response",
    "history_summary",
    "document_classification",
    "property_extraction",
    "hallucination_judgment",
  ]);
});

test("buildCapabilityExecutionPlan applies capability defaults and fallback routes", () => {
  delete process.env.CAPABILITY_HISTORY_SUMMARY_MODEL;
  delete process.env.CAPABILITY_HISTORY_SUMMARY_FALLBACK_MODEL;

  const request: CapabilityRequest = {
    capability: "history_summary",
    vertical: "imob",
    context: {
      conversationId: "conv-123",
    },
  };

  const plan = buildCapabilityExecutionPlan({
    request,
    profile: {
      model: "",
      systemPrompt: "Resuma o historico com objetividade.",
    },
    userPrompt: "Resuma esta conversa.",
  });

  assert.equal(plan.capability, "history_summary");
  assert.equal(plan.routingPolicy.defaultProvider, "openai");
  assert.equal(plan.routingPolicy.fallbackEnabled, true);
  assert.deepEqual(plan.routes, [
    {
      provider: "openai",
      model: "openai:gpt-4o-mini",
      reason: "capability_default",
    },
    {
      provider: "gemini",
      model: "gemini:gemini-1.5-flash",
      reason: "capability_fallback",
    },
  ]);
});

test("buildCapabilityExecutionPlan preserves explicit profile model as a single route", () => {
  const request: CapabilityRequest = {
    capability: "hallucination_judgment",
    vertical: "governance",
    context: {
      action: "judge",
    },
  };

  const plan = buildCapabilityExecutionPlan({
    request,
    profile: {
      model: "anthropic:claude-3-5-haiku-latest",
      systemPrompt: "Judge.",
    },
    userPrompt: "Judge this.",
  });

  assert.deepEqual(plan.routes, [
    {
      provider: "anthropic",
      model: "anthropic:claude-3-5-haiku-latest",
      reason: "profile_override",
    },
  ]);
  assert.equal(plan.routingPolicy.fallbackEnabled, false);
});

test("executeCapability normalizes output and exposes attempted route metadata", async () => {
  const request: CapabilityRequest = {
    capability: "history_summary",
    vertical: "imob",
    context: {
      conversationId: "conv-123",
    },
    policyContext: {
      tenantId: "tenant-A",
      workspaceId: "workspace-A",
      costTier: "standard",
    },
  };

  const result = await executeCapability({
    request,
    profile: {
      model: "gpt-4o-mini",
      systemPrompt: "Resuma o historico com objetividade.",
      knowledgePolicy: {
        llmUsageMode: "none",
      },
    },
    userPrompt: "Resuma esta conversa.",
    metadata: {
      deterministicResponse: "Resumo pronto.",
      purpose: "test",
    },
  });

  assert.equal(result.status, "ok");
  assert.equal(result.normalized, true);
  assert.equal(result.output.text, "Resumo pronto.");
  assert.equal(result.providerUsed, "openai");
  assert.equal(result.modelUsed, "gpt-4o-mini");
  assert.deepEqual(result.routeAttempted, [
    {
      provider: "openai",
      model: "openai:gpt-4o-mini",
      reason: "profile_override",
    },
  ]);
});
