import { AgentOrchestrator, DefaultPlanManager } from "@eiah/core";
import { type LlmExecutorParams, type LlmExecutorResult } from "../orchestrator/llmExecutor";
import { executeCapability } from "./capabilityExecution";
import { resolveKnowledgeContext } from "./knowledgeGate";

export type ExecuteAgentRunParams = LlmExecutorParams & {
  runId?: string;
  tenantId?: string;
  workspaceId?: string;
};

export type ExecuteAgentRunResult = LlmExecutorResult;

export async function executeAgentRun(params: ExecuteAgentRunParams): Promise<ExecuteAgentRunResult> {
  const runId = params.runId ?? "run-" + Date.now();
  const knowledgeResolution = resolveKnowledgeContext({
    runId,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    agentId: params.profile.model,
    prompt: params.userPrompt,
    metadata: params.metadata,
    knowledgePolicy: params.profile.knowledgePolicy as any,
  });
  if (knowledgeResolution.blocked) {
    throw new Error(
      `knowledge_policy.blocked: ${knowledgeResolution.reasonCode ?? "knowledge_gate_blocked"}`
    );
  }
  let lastResult: LlmExecutorResult | null = null;
  const planManager = new DefaultPlanManager({ agentId: params.profile.model });
  const orchestrator = new AgentOrchestrator({
    planManager,
    act: async () => {
      const capabilityResult = await executeCapability({
        request: {
          capability: "chat_response",
          vertical: "core",
          context: {
            runId,
            objective: params.userPrompt,
          },
          policyContext: {
            tenantId: params.tenantId,
            workspaceId: params.workspaceId,
            purpose: "execute_agent_run",
          },
        },
        profile: params.profile,
        userPrompt: params.userPrompt,
        metadata: knowledgeResolution.metadata,
      });
      lastResult = {
        outputText: String(capabilityResult.output.text ?? ""),
        rawResponse: capabilityResult.rawResponse,
        traceId: capabilityResult.telemetryRef,
        tookMs: capabilityResult.tookMs,
        provider: capabilityResult.providerUsed,
        model: capabilityResult.modelUsed,
        requestId: capabilityResult.requestId,
        usage: capabilityResult.usage ?? null,
      };
      return lastResult.outputText;
    },
  });

  await orchestrator.run({
    objective: params.userPrompt,
    tenantId: params.tenantId ?? "default-tenant",
    workspaceId: params.workspaceId ?? "default-workspace",
    runId,
  });

  if (!lastResult) {
    throw new Error("Agent run did not produce a result");
  }

  return lastResult;
}
