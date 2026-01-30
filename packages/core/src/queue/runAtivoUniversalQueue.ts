import { Queue, JobsOptions } from "bullmq";
import { getRedisConnection } from "./connection";

export type RunAtivoUniversalJobPayload = {
  runId: string;
  tenantId: string;
  workspaceId: string;
  agentId?: string;
  ativoId?: string;
};

export const RUN_ATIVO_UNIVERSAL_QUEUE_NAME = "run-ativo-universal";

export const runAtivoUniversalQueue = new Queue<RunAtivoUniversalJobPayload>(
  RUN_ATIVO_UNIVERSAL_QUEUE_NAME,
  {
    connection: getRedisConnection(),
  }
);

export async function enqueueRunAtivoUniversal(
  job: RunAtivoUniversalJobPayload,
  options: JobsOptions = {}
) {
  if (!job?.runId || !job.tenantId || !job.workspaceId) {
    throw new Error("enqueueRunAtivoUniversal requires runId, tenantId and workspaceId");
  }

  return runAtivoUniversalQueue.add(
    "process",
    job,
    {
      attempts: 3,
      backoff: { type: "exponential", delay: 1500 },
      removeOnComplete: true,
      removeOnFail: false,
      ...options,
    }
  );
}
