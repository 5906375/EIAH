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
import { createLogger, bindLogger } from "../logging";

type BullModule = typeof import("bullmq");

const DEFAULT_QUEUE_NAME = "agent-run-executions";
const DEFAULT_JOB_NAME = "execute-agent-run";
const DLQ_SUFFIX = "-dlq";
const DEFAULT_CONCURRENCY = Number(process.env.RUN_QUEUE_CONCURRENCY ?? "1");
const queueLogger = createLogger({ component: "run-queue" });

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
let dlqQueuePromise: Promise<Queue> | null = null;

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

function resolveDlqQueueName() {
  return `${resolveQueueName()}${DLQ_SUFFIX}`;
}

function resolveDlqJobName() {
  return `${resolveJobName()}${DLQ_SUFFIX}`;
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
  } catch (error) {
    queueLogger.warn(
      {
        err: error,
        url,
      },
      "run-queue.invalid_redis_url"
    );
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

async function getDlqQueue() {
  if (!dlqQueuePromise) {
    dlqQueuePromise = (async () => {
      const { Queue } = await loadBullMQ();
      const connection = resolveConnection();
      const options: QueueOptions | undefined = connection ? { connection } : undefined;
      return new Queue(resolveDlqQueueName(), options);
    })();
  }

  return dlqQueuePromise;
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
    queueLogger.error(
      {
        err: error,
      },
      "run-queue.worker_error"
    );
  });

  worker.on("failed", async (job: Job<RunQueuePayload> | undefined, err: Error) => {
    if (!job) {
      queueLogger.error(
        {
          err,
        },
        "run-queue.job_failed_missing"
      );
      return;
    }
    bindLogger(queueLogger, {
      jobId: job.id,
      runId: job.data?.runId,
      tenantId: job.data?.tenantId,
      workspaceId: job.data?.workspaceId,
    }).error(
      {
        err,
      },
      "run-queue.job_failed"
    );

    if (isFinalAttempt(job)) {
      await moveJobToDlq(job, err);
    }
  });

  return worker;
}

export async function createRunQueueEvents() {
  const { QueueEvents } = await loadBullMQ();
  const connection = resolveConnection();
  const eventOptions: QueueEventsOptions | undefined = connection ? { connection } : undefined;
  const events = new QueueEvents(resolveQueueName(), eventOptions);

  events.on("failed", ({ jobId, failedReason }: { jobId?: string; failedReason?: string }) => {
    bindLogger(queueLogger, { jobId }).error(
      {
        reason: failedReason ?? "unknown",
      },
      "run-queue.job_failed_event"
    );
  });

  return events;
}

export function resetRunQueueCache() {
  bullmqModulePromise = null;
  queuePromise = null;
  dlqQueuePromise = null;
}

function isFinalAttempt(job: Job) {
  const maxAttempts = job.opts?.attempts ?? 1;
  return job.attemptsMade >= maxAttempts;
}

async function moveJobToDlq(job: Job<RunQueuePayload>, err: Error) {
  try {
    const dlq = (await getDlqQueue()) as Queue<RunQueuePayload & Record<string, unknown>>;
    await dlq.add(
      resolveDlqJobName(),
      {
        ...job.data,
        failedReason: err.message,
        failedAt: new Date().toISOString(),
        attemptsMade: job.attemptsMade,
      },
      {
        removeOnComplete: true,
      }
    );
  } catch (dlqError) {
    queueLogger.error(
      {
        err: dlqError,
        jobId: job.id,
      },
      "run-queue.dlq_enqueue_failed"
    );
  }
}

function jobCountsToObject(counts: Record<string, number | undefined>) {
  return {
    waiting: counts.waiting ?? 0,
    active: counts.active ?? 0,
    completed: counts.completed ?? 0,
    failed: counts.failed ?? 0,
    delayed: counts.delayed ?? 0,
    paused: counts.paused ?? 0,
    waitingChildren: counts["waiting-children"] ?? 0,
  };
}

export async function drainRunQueue(options: { includeDelayed?: boolean } = {}) {
  const queue = (await getQueue()) as Queue<RunQueuePayload>;
  await queue.drain(options.includeDelayed ?? true);
  await queue.clean(0, 1000, "failed");
  await queue.clean(0, 1000, "completed");
}

export async function drainRunDlq(options: { includeDelayed?: boolean } = {}) {
  const queue = (await getDlqQueue()) as Queue<RunQueuePayload>;
  await queue.drain(options.includeDelayed ?? true);
  await queue.clean(0, 1000, "failed");
  await queue.clean(0, 1000, "completed");
}

export async function getRunQueueCounts() {
  const queue = (await getQueue()) as Queue<RunQueuePayload>;
  const counts = await queue.getJobCounts(
    "waiting",
    "waiting-children",
    "active",
    "completed",
    "failed",
    "delayed",
    "paused"
  );
  return jobCountsToObject(counts);
}

export async function getRunDlqCounts() {
  const queue = (await getDlqQueue()) as Queue<RunQueuePayload>;
  const counts = await queue.getJobCounts(
    "waiting",
    "waiting-children",
    "active",
    "completed",
    "failed",
    "delayed",
    "paused"
  );
  return jobCountsToObject(counts);
}

export async function probeRunQueue() {
  const [primary, dlq] = await Promise.all([getRunQueueCounts(), getRunDlqCounts()]);
  return {
    queue: primary,
    dlq,
  };
}
