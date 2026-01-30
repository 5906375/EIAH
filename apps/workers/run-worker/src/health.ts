import { QueueEvents } from "bullmq";
import { connection } from "./queueConnection";

export function createRunWorkerHealth(queueName: string) {
  const events = new QueueEvents(queueName, { connection });

  events.on("failed", ({ jobId, failedReason }) => {
    console.error("[DLQ] job failed", jobId, failedReason);
  });

  events.on("stalled", ({ jobId }) => {
    console.error("[DLQ] job stalled", jobId);
  });

  return events;
}
