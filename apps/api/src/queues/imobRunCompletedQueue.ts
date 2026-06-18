import { Queue, type JobsOptions } from "bullmq";
import { getRedisConnection } from "@eiah/core/queue/connection";

// Payload for the IMOB run.completed mutation worker.
// Carries the full context needed to update ImobCase after a confirmed run.
// Fields receiptPath and bundlePath are optional — populated when the action
// generates a document artifact; absent for non-document actions.
export type ImobRunCompletedJobPayload = {
  runId: string;
  tenantId: string;
  workspaceId: string;
  caseId: string;
  actionId: string;
  // eventRunId links the ImobCaseEvent to the run that triggered the mutation
  eventRunId: string;
  receiptPath?: string | null;
  bundlePath?: string | null;
};

export const IMOB_RUN_COMPLETED_QUEUE_NAME = "imob-run-completed";

export const imobRunCompletedQueue = new Queue<ImobRunCompletedJobPayload>(
  IMOB_RUN_COMPLETED_QUEUE_NAME,
  {
    connection: getRedisConnection(),
  },
);

export async function enqueueImobRunCompleted(
  job: ImobRunCompletedJobPayload,
  options: JobsOptions = {},
) {
  if (!job?.runId || !job.tenantId || !job.workspaceId || !job.caseId || !job.actionId || !job.eventRunId) {
    throw new Error(
      "enqueueImobRunCompleted requires runId, tenantId, workspaceId, caseId, actionId and eventRunId",
    );
  }

  // jobId for idempotency: one mutation job per run (BullMQ 5.x forbids ':' in custom ids)
  const jobId = `imob-run-completed-${job.tenantId}-${job.workspaceId}-${job.runId}`;

  return imobRunCompletedQueue.add("process", job, {
    jobId,
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: true,
    removeOnFail: false,
    ...options,
  });
}
