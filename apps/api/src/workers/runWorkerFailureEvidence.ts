import { McpDbPolicyError } from "../../../../packages/mcp-runner/src/executor/dbAllowlist.js";
import { resolveActiveMcpDenyRunFailure } from "./runWorkerActionResolution";

export function createActionRunnerFailureError(
  actionResult: unknown,
  message: string,
): Error {
  const governedFailure = resolveActiveMcpDenyRunFailure(actionResult);
  if (
    governedFailure?.reasonCode === "DB_SCOPE_MISSING" ||
    governedFailure?.reasonCode === "DB_MODEL_NOT_ALLOWLISTED" ||
    governedFailure?.reasonCode === "DB_INPUT_INVALID"
  ) {
    return new McpDbPolicyError(governedFailure.reasonCode, message);
  }
  return new Error(message);
}

type RunFailureScl = {
  txId: string;
  criticalHash: string;
};

export async function persistRunFailureEvidence(
  params: {
    error: unknown;
    message: string;
    prisma: unknown;
    tenantId: string;
    workspaceId: string;
    runId: string;
    userId?: string;
    responseForScl: (scl: RunFailureScl) => unknown;
  },
  deps: {
    appendSclRecord: (params: any) => Promise<RunFailureScl>;
    finalizeRunRecord: (params: any) => Promise<unknown>;
    emitRunEvent: (params: any) => Promise<unknown>;
  },
) {
  const governedFailure = resolveActiveMcpDenyRunFailure(params.error);
  const reasonCode = governedFailure?.reasonCode ?? "EXECUTION_FAILED";
  const scl = await deps.appendSclRecord({
    prisma: params.prisma,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    runId: params.runId,
    payload: {
      status: "error",
      message: params.message,
      ...(governedFailure ? { reasonCode: governedFailure.reasonCode } : {}),
    },
    riskLevel: "high",
  });

  await deps.finalizeRunRecord({
    runId: params.runId,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    status: "error",
    response: params.responseForScl(scl),
    errorCode: reasonCode,
    txId: scl.txId,
    criticalHash: scl.criticalHash,
    sclTxId: scl.txId,
  });

  await deps.emitRunEvent({
    runId: params.runId,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    userId: params.userId,
    type: "run.failed",
    payload: {
      status: "error",
      message: params.message,
      ...(governedFailure ? { reasonCode: governedFailure.reasonCode } : {}),
      txId: scl.txId,
      criticalHash: scl.criticalHash,
    },
    criticalHash: scl.criticalHash,
    sclTxId: scl.txId,
  });

  return { reasonCode, scl };
}
