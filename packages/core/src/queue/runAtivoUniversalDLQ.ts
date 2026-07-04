import { Queue } from "bullmq";
import { getRedisConnection } from "./connection";
import {
  createLazyQueue,
  RUN_ATIVO_UNIVERSAL_QUEUE_NAME,
  RunAtivoUniversalJobPayload,
} from "./runAtivoUniversalQueue";

const DLQ_NAME = `${RUN_ATIVO_UNIVERSAL_QUEUE_NAME}-dlq`;

// Lazy: getRedisConnection() só é chamado no primeiro uso real da DLQ, não no import.
export const runAtivoUniversalDLQ = createLazyQueue(() =>
  new Queue<RunAtivoUniversalJobPayload>(DLQ_NAME, {
    connection: getRedisConnection(),
  })
);
