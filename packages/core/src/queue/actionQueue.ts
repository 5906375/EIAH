import "dotenv/config";
import {
  Job,
  JobsOptions,
  Queue,
  QueueEvents,
  Worker,
  type ConnectionOptions,
  type QueueEventsOptions,
  type QueueOptions,
  type WorkerOptions,
} from "bullmq";
import { createLogger, bindLogger } from "../logging";
import type { ActionExecutionResult } from "../actions/actionRegistry";

const DEFAULT_QUEUE_NAME = process.env.ACTION_QUEUE_NAME ?? "agent-action-executions";
const DEFAULT_JOB_NAME = process.env.ACTION_QUEUE_JOB_NAME ?? "execute-agent-action";
const DLQ_SUFFIX = "-dlq";
const DEFAULT_CONCURRENCY = Number(process.env.ACTION_QUEUE_CONCURRENCY ?? "2");
const DEFAULT_CONNECTION_URL = "redis://127.0.0.1:6379/0";
const actionQueueLogger = createLogger({ component: "action-queue" });

export type ActionQueuePayload = {
  action: string;
  input?: unknown;
  runId?: string;
  stepId?: string;
  tenantId?: string;
  workspaceId?: string;
  metadata?: Record<string, unknown>;
};

export type ActionQueuePublishOptions = JobsOptions;

export type ActionQueueConsumer = (
  payload: ActionQueuePayload,
  job: Job<ActionQueuePayload>
) => Promise<ActionExecutionResult | void> | ActionExecutionResult | void;

const connectionUrl =
  process.env.ACTION_QUEUE_REDIS_URL ??
  process.env.RUN_QUEUE_REDIS_URL ??
  process.env.REDIS_URL ??
  process.env.BULLMQ_REDIS_URL ??
  process.env.QUEUE_REDIS_URL ??
  DEFAULT_CONNECTION_URL;

const connection: ConnectionOptions = createConnectionOptions(connectionUrl);

let queuePromise: Promise<Queue> | null = null;
let dlqQueuePromise: Promise<Queue> | null = null;

function resolveDlqQueueName() {
  return `${DEFAULT_QUEUE_NAME}${DLQ_SUFFIX}`;
}

function resolveDlqJobName() {
  return `${DEFAULT_JOB_NAME}${DLQ_SUFFIX}`;
}

function createConnectionOptions(url: string): ConnectionOptions {
  try {
    const parsed = new URL(url);
    const isTls = parsed.protocol === "rediss:";

    const options: ConnectionOptions = {
      host: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : 6379,
      connectionName: "action-queue",
    };

    if (parsed.password) {
      options.password = parsed.password;
    }

    if (parsed.username) {
      options.username = parsed.username;
    }

    if (parsed.pathname && parsed.pathname !== "/") {
      const dbParsed = Number(parsed.pathname.replace("/", ""));
      if (!Number.isNaN(dbParsed)) {
        options.db = dbParsed;
      }
    }

    if (isTls) {
      options.tls = {};
    }

    return options;
  } catch (error) {
    actionQueueLogger.warn(
      {
        err: error,
        url,
      },
      "action-queue.invalid_redis_url"
    );
    return createConnectionOptions(DEFAULT_CONNECTION_URL);
  }
}

async function getQueue() {
  if (!queuePromise) {
    queuePromise = Promise.resolve(
      new Queue(DEFAULT_QUEUE_NAME, {
        connection,
      } satisfies QueueOptions)
    );
  }

  return queuePromise;
}

async function getDlqQueue() {
  if (!dlqQueuePromise) {
    dlqQueuePromise = Promise.resolve(
      new Queue(resolveDlqQueueName(), {
        connection,
      } satisfies QueueOptions)
    );
  }

  return dlqQueuePromise;
}

export async function publishAction(
  payload: ActionQueuePayload,
  options: ActionQueuePublishOptions = {}
) {
  const queue = (await getQueue()) as Queue<ActionQueuePayload>;
  return queue.add(
    DEFAULT_JOB_NAME,
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

export async function consumeActions(
  handler: ActionQueueConsumer,
  options: { concurrency?: number } = {}
) {
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;

  const workerOptions: WorkerOptions = {
    connection,
    concurrency,
  };

  const worker = new Worker<ActionQueuePayload>(
    DEFAULT_QUEUE_NAME,
    async (job) => {
      const result = await handler(job.data, job);
      return result;
    },
    workerOptions
  );

  worker.on("error", (error: Error) => {
    actionQueueLogger.error(
      {
        err: error,
      },
      "action-queue.worker_error"
    );
  });

  worker.on("failed", async (job: Job<ActionQueuePayload> | undefined, err: Error) => {
    if (!job) {
      actionQueueLogger.error(
        {
          err,
        },
        "action-queue.job_failed_missing"
      );
      return;
    }
    bindLogger(actionQueueLogger, {
      jobId: job.id,
      runId: job.data?.runId,
      tenantId: job.data?.tenantId,
      workspaceId: job.data?.workspaceId,
      actionKind: job.data?.action,
    }).error(
      {
        err,
      },
      "action-queue.job_failed"
    );

    if (isFinalAttempt(job)) {
      await moveActionJobToDlq(job, err);
    }
  });

  return worker;
}

export async function createActionQueueEvents() {
  const events = new QueueEvents(DEFAULT_QUEUE_NAME, {
    connection,
  } satisfies QueueEventsOptions);

  events.on("failed", ({ jobId, failedReason }: { jobId?: string; failedReason?: string }) => {
    bindLogger(actionQueueLogger, { jobId }).error(
      {
        reason: failedReason ?? "unknown",
      },
      "action-queue.job_failed_event"
    );
  });

  return events;
}

export function resetActionQueueCache() {
  queuePromise = null;
  dlqQueuePromise = null;
}

function isFinalAttempt(job: Job) {
  const maxAttempts = job.opts?.attempts ?? 1;
  return job.attemptsMade >= maxAttempts;
}

async function moveActionJobToDlq(job: Job<ActionQueuePayload>, err: Error) {
  try {
    const dlq = (await getDlqQueue()) as Queue<ActionQueuePayload & Record<string, unknown>>;
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
    actionQueueLogger.error(
      {
        err: dlqError,
        jobId: job.id,
      },
      "action-queue.dlq_enqueue_failed"
    );
  }
}

function countsToObject(counts: Record<string, number | undefined>) {
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

export async function drainActionQueue(options: { includeDelayed?: boolean } = {}) {
  const queue = (await getQueue()) as Queue<ActionQueuePayload>;
  await queue.drain(options.includeDelayed ?? true);
  await queue.clean(0, 1000, "failed");
  await queue.clean(0, 1000, "completed");
}

export async function drainActionDlq(options: { includeDelayed?: boolean } = {}) {
  const queue = (await getDlqQueue()) as Queue<ActionQueuePayload>;
  await queue.drain(options.includeDelayed ?? true);
  await queue.clean(0, 1000, "failed");
  await queue.clean(0, 1000, "completed");
}

export async function getActionQueueCounts() {
  const queue = (await getQueue()) as Queue<ActionQueuePayload>;
  const counts = await queue.getJobCounts(
    "waiting",
    "waiting-children",
    "active",
    "completed",
    "failed",
    "delayed",
    "paused"
  );
  return countsToObject(counts);
}

export async function getActionDlqCounts() {
  const queue = (await getDlqQueue()) as Queue<ActionQueuePayload>;
  const counts = await queue.getJobCounts(
    "waiting",
    "waiting-children",
    "active",
    "completed",
    "failed",
    "delayed",
    "paused"
  );
  return countsToObject(counts);
}

export async function probeActionQueue() {
  const [queueCounts, dlqCounts] = await Promise.all([
    getActionQueueCounts(),
    getActionDlqCounts(),
  ]);
  return {
    queue: queueCounts,
    dlq: dlqCounts,
  };
}



