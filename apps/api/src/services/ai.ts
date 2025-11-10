import {
  simpleExecuteAgentRun,
  SimpleExecutorParams,
  SimpleExecutorResult,
} from "../orchestrator/simpleExecutor";

export type ExecuteAgentRunParams = SimpleExecutorParams;

export type ExecuteAgentRunResult = SimpleExecutorResult;

export async function executeAgentRun(params: ExecuteAgentRunParams): Promise<ExecuteAgentRunResult> {
  return simpleExecuteAgentRun(params);
}
