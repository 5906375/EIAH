import type { JobsOptions } from "bullmq";

// Contrato SEM efeito colateral da fila IMOB run.completed: nome, payload e opções padrão.
// Importar este módulo NÃO abre conexão Redis nem instancia Queue. Quem só precisa do nome/tipo (ex.: o worker pós-run)
// importa daqui; a fila (com conexão) fica em `imobRunCompletedQueue.ts` e só é criada no primeiro uso.

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
export const IMOB_RUN_COMPLETED_DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: "exponential", delay: 2000 },
  removeOnComplete: true,
  removeOnFail: false,
} as const satisfies JobsOptions;
