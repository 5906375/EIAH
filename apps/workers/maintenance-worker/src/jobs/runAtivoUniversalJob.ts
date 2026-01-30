import { Worker } from "bullmq";
import {
  getRedisConnection,
  runAtivoUniversalDLQ,
  RUN_ATIVO_UNIVERSAL_QUEUE_NAME,
  type RunAtivoUniversalJobPayload,
} from "@eiah/core";
import { runAtivoUniversalAgentFromRunId } from "../../../../api/src/services/runAtivoUniversalAgent";

const connection = getRedisConnection();
const concurrency = Number(process.env.RUN_ATIVO_UNIVERSAL_CONCURRENCY ?? "3");
type ScopedRunAtivoJobPayload = RunAtivoUniversalJobPayload & {
  tenantId: string;
  workspaceId: string;
};

export const runAtivoUniversalWorker = new Worker<ScopedRunAtivoJobPayload>(
  RUN_ATIVO_UNIVERSAL_QUEUE_NAME,
  async (job) => {
    const { runId, tenantId, workspaceId } = job.data;
    if (!runId || !tenantId || !workspaceId) {
      throw new Error("runId, tenantId and workspaceId are required for run-ativo-universal jobs");
    }

    await runAtivoUniversalAgentFromRunId({
      runId,
      tenantId,
      workspaceId,
      logger: (event, payload) => {
        console.log(`[runAtivoUniversal][${event}]`, payload ?? {});
      },
    });
  },
  {
    connection,
    concurrency: Number.isFinite(concurrency) && concurrency > 0 ? concurrency : 3,
  }
);

runAtivoUniversalWorker.on("failed", async (job, err) => {
  console.error("[runAtivoUniversal][FAILED]", job?.id, err);
  if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
    await runAtivoUniversalDLQ.add("dead", job.data, { removeOnComplete: false });
  }
});

runAtivoUniversalWorker.on("completed", (job) => {
  console.log("[runAtivoUniversal][COMPLETED]", job.id);
});
