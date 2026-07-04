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

export function createLazyQueue<T extends object>(factory: () => T): T {
  let instance: T | null = null;
  function ensure(): T {
    if (!instance) {
      instance = factory();
    }
    return instance;
  }

  return new Proxy({} as T, {
    get(_target, prop, receiver) {
      const value = Reflect.get(ensure() as object, prop, receiver);
      return typeof value === "function" ? value.bind(ensure()) : value;
    },
    set(_target, prop, value) {
      return Reflect.set(ensure() as object, prop, value);
    },
  });
}

// Lazy: getRedisConnection() só é chamado no primeiro uso real da fila, não no import.
export const runAtivoUniversalQueue = createLazyQueue(() =>
  new Queue<RunAtivoUniversalJobPayload>(RUN_ATIVO_UNIVERSAL_QUEUE_NAME, {
    connection: getRedisConnection(),
  })
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
