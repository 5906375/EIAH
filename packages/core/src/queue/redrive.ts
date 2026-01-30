import type { Queue } from "bullmq";
import { createLogger } from "../logging/logger";

const log = createLogger({ component: "queue-redrive" });

export async function redriveQueue(queue: Queue) {
  const failed = await queue.getFailed();

  if (failed.length === 0) {
    log.info({ queue: queue.name }, "queue.redrive.empty");
    return { redriven: 0 };
  }

  let count = 0;

  for (const job of failed) {
    const payload = job.data;

    await queue.add(job.name, payload, {
      attempts: job.opts.attempts ?? 3,
      removeOnComplete: true,
      removeOnFail: false,
    });

    await job.remove();
    count++;
  }

  log.info({ queue: queue.name, redriven: count }, "queue.redrive.completed");

  return { redriven: count };
}
