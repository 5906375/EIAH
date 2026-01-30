import { Queue } from "bullmq";
import { getRedisConnection } from "./connection";
import { RUN_ATIVO_UNIVERSAL_QUEUE_NAME, RunAtivoUniversalJobPayload } from "./runAtivoUniversalQueue";

const DLQ_NAME = `${RUN_ATIVO_UNIVERSAL_QUEUE_NAME}-dlq`;

export const runAtivoUniversalDLQ = new Queue<RunAtivoUniversalJobPayload>(DLQ_NAME, {
  connection: getRedisConnection(),
});
