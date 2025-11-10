import type {
  JobsOptions,
  Queue,
  QueueEvents,
  Worker,
  ConnectionOptions,
  QueueOptions,
  WorkerOptions,
  QueueEventsOptions,
  Job,
} from "bullmq";

type BullModule = typeof import("bullmq");

const DEFAULT_QUEUE_NAME = "agent-run-executions";
const DEFAULT_JOB_NAME = "execute-agent-run";
const DEFAULT_CONCURRENCY = Number(process.env.RUN_QUEUE_CONCURRENCY ?? "1");

export type RunQueuePayload = {
  runId: string;
  tenantId: string;
  workspaceId: string;
  userId?: string;
  agent: string;
  prompt: string;
  metadata?: Record<string, unknown>;
};

export type RunQueuePublishOptions = JobsOptions;

export type RunQueueConsumer = (payload: RunQueuePayload) => Promise<void> | void;

let bullmqModulePromise: Promise<BullModule> | null = null;
let queuePromise: Promise<Queue> | null = null;

async function loadBullMQ(): Promise<BullModule> {
  if (!bullmqModulePromise) {
    bullmqModulePromise = import("bullmq").catch((error) => {
      throw new Error(
        `BullMQ failed to load. Install it with "pnpm add bullmq" and ensure dependencies are available. Original error: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    });
  }

  return bullmqModulePromise;
}

function resolveQueueName() {
  return process.env.RUN_QUEUE_NAME ?? DEFAULT_QUEUE_NAME;
}

function resolveJobName() {
  return process.env.RUN_QUEUE_JOB_NAME ?? DEFAULT_JOB_NAME;
}

function resolveConnection(): ConnectionOptions | undefined {
  const url =
    process.env.RUN_QUEUE_REDIS_URL ??
    process.env.REDIS_URL ??
    process.env.BULLMQ_REDIS_URL ??
    process.env.QUEUE_REDIS_URL;

  if (!url) {
    return undefined;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    console.warn(`[core/runQueue] Invalid Redis URL "${url}", falling back to BullMQ defaults.`);
    return undefined;
  }

  const isTls = parsed.protocol === "rediss:";

  const connectionOptions: ConnectionOptions = {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
  };

  if (parsed.password) {
    connectionOptions.password = parsed.password;
  }

  if (parsed.username) {
    connectionOptions.username = parsed.username;
  }

  if (parsed.pathname && parsed.pathname !== "/") {
    const dbParsed = Number(parsed.pathname.replace("/", ""));
    if (!Number.isNaN(dbParsed)) {
      connectionOptions.db = dbParsed;
    }
  }

  if (isTls) {
    connectionOptions.tls = {};
  }

  return connectionOptions;
}

async function getQueue() {
  if (!queuePromise) {
    queuePromise = (async () => {
      const { Queue } = await loadBullMQ();
      const connection = resolveConnection();
      const options: QueueOptions | undefined = connection ? { connection } : undefined;
      return new Queue(resolveQueueName(), options);
    })();
  }

  return queuePromise;
}

export async function publishRun(
  payload: RunQueuePayload,
  options: RunQueuePublishOptions = {}
) {
  const queue = (await getQueue()) as Queue<RunQueuePayload>;
  await queue.add(
    resolveJobName(),
    payload,
    {
      removeOnComplete: true,
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 250,
      },
      ...options,
    }
  );
}

export async function consume(handler: RunQueueConsumer, options: { concurrency?: number } = {}) {
  const { Worker } = await loadBullMQ();
  const connection = resolveConnection();
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;

  const worker = new Worker<RunQueuePayload>(
    resolveQueueName(),
    async (job) => {
      await handler(job.data);
    },
    connection
      ? ({ connection, concurrency } satisfies WorkerOptions)
      : ({ concurrency } as WorkerOptions)
  );

  worker.on("error", (error: Error) => {
    console.error("[core/runQueue] worker error", error);
  });

  worker.on("failed", (job: Job<RunQueuePayload> | undefined, err: Error) => {
    if (!job) {
      console.error("[core/runQueue] job failed with missing job reference", err);
      return;
    }
    console.error(`[core/runQueue] job ${job.id} failed`, err);
  });

  return worker;
}

export async function createRunQueueEvents() {
  const { QueueEvents } = await loadBullMQ();
  const connection = resolveConnection();
  const eventOptions: QueueEventsOptions | undefined = connection ? { connection } : undefined;
  const events = new QueueEvents(resolveQueueName(), eventOptions);

  events.on("failed", ({ jobId, failedReason }: { jobId?: string; failedReason?: string }) => {
    console.error(`[core/runQueue] job ${jobId ?? "unknown"} failed: ${failedReason ?? "unknown"}`);
  });

  return events;
}

export function resetRunQueueCache() {
  bullmqModulePromise = null;
  queuePromise = null;
}
