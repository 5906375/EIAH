import { AgentOrchestrator, DefaultPlanManager } from "@eiah/core";
import { executeLlmStep, type LlmExecutorParams, type LlmExecutorResult } from "../orchestrator/llmExecutor";

export type ExecuteAgentRunParams = LlmExecutorParams & {
  runId?: string;
  tenantId?: string;
  workspaceId?: string;
};

export type ExecuteAgentRunResult = LlmExecutorResult;

export async function executeAgentRun(params: ExecuteAgentRunParams): Promise<ExecuteAgentRunResult> {
  const runId = params.runId ?? "run-" + Date.now();
  let lastResult: LlmExecutorResult | null = null;
  const planManager = new DefaultPlanManager({ agentId: params.profile.model });
  const orchestrator = new AgentOrchestrator({
    planManager,
    act: async () => {
      lastResult = await executeLlmStep({
        profile: params.profile,
        userPrompt: params.userPrompt,
        metadata: params.metadata,
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
