import { AgentOrchestrator, DefaultPlanManager } from "@eiah/core";
import { executeLlmStep, type LlmExecutorParams, type LlmExecutorResult } from "../orchestrator/llmExecutor";
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
      lastResult = await executeLlmStep({
        profile: params.profile,
        userPrompt: params.userPrompt,
        metadata: knowledgeResolution.metadata,
      });
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
