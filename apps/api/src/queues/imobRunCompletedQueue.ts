import { Queue, type JobsOptions } from "bullmq";
import { getRedisConnection } from "@eiah/core/queue/connection";
import {
  IMOB_RUN_COMPLETED_DEFAULT_JOB_OPTIONS,
  IMOB_RUN_COMPLETED_QUEUE_NAME,
  type ImobRunCompletedJobPayload,
} from "./imobRunCompletedQueueContract";

// Contrato (nome, payload, opções) re-exportado: os importadores existentes continuam válidos.
export {
  IMOB_RUN_COMPLETED_DEFAULT_JOB_OPTIONS,
  IMOB_RUN_COMPLETED_QUEUE_NAME,
  type ImobRunCompletedJobPayload,
} from "./imobRunCompletedQueueContract";

// A fila é criada no PRIMEIRO USO, não na importação: importar o router do IMOB ou o worker não abre conexão Redis
// (a conexão aberta no import mantinha o processo de teste vivo e custava uma conexão por importador).
let queueInstance: Queue<ImobRunCompletedJobPayload> | null = null;

export function getImobRunCompletedQueue(): Queue<ImobRunCompletedJobPayload> {
  queueInstance ??= new Queue<ImobRunCompletedJobPayload>(IMOB_RUN_COMPLETED_QUEUE_NAME, {
    connection: getRedisConnection(),
  });
  return queueInstance;
}

/** Fecha a fila SE ela foi criada; idempotente; nunca cria uma fila só para fechá-la. */
export async function closeImobRunCompletedQueue(): Promise<void> {
  const current = queueInstance;
  queueInstance = null;
  if (current) await current.close();
}

/**
 * Fachada preguiçosa com a mesma superfície de `Queue` (compatível com os usos existentes: `add`, `getJobCounts`, `close`...).
 * Acessar qualquer membro (exceto `close`) cria a fila; `close()` fecha a fila apenas se existir.
 */
export const imobRunCompletedQueue: Queue<ImobRunCompletedJobPayload> = new Proxy({} as Queue<ImobRunCompletedJobPayload>, {
  get(_target, property) {
    if (property === "close") return closeImobRunCompletedQueue;
    const queue = getImobRunCompletedQueue();
    const value = Reflect.get(queue, property, queue) as unknown;
    return typeof value === "function" ? value.bind(queue) : value;
  },
});

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

  return getImobRunCompletedQueue().add("process", job, {
    jobId,
    ...IMOB_RUN_COMPLETED_DEFAULT_JOB_OPTIONS,
    ...options,
  });
}
