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
import type { ActionExecutionResult } from "../actions/actionRegistry";

const DEFAULT_QUEUE_NAME = process.env.ACTION_QUEUE_NAME ?? "agent-action-executions";
const DEFAULT_JOB_NAME = process.env.ACTION_QUEUE_JOB_NAME ?? "execute-agent-action";
const DEFAULT_CONCURRENCY = Number(process.env.ACTION_QUEUE_CONCURRENCY ?? "2");
const DEFAULT_CONNECTION_URL = "redis://127.0.0.1:6379/0";

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
    console.warn(
      `[core/actionQueue] Invalid Redis URL "${url}", using default connection. (${error instanceof Error ? error.message : String(
        error
      )})`
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
    console.error("[core/actionQueue] worker error", error);
  });

  worker.on("failed", (job: Job | undefined, err: Error) => {
    if (!job) {
      console.error("[core/actionQueue] job failed without reference", err);
      return;
    }
    console.error(`[core/actionQueue] job ${job.id} failed`, err);
  });

  return worker;
}

export async function createActionQueueEvents() {
  const events = new QueueEvents(DEFAULT_QUEUE_NAME, {
    connection,
  } satisfies QueueEventsOptions);

  events.on("failed", ({ jobId, failedReason }: { jobId?: string; failedReason?: string }) => {
    console.error(
      `[core/actionQueue] job ${jobId ?? "unknown"} failed: ${failedReason ?? "unknown"}`
    );
  });

  return events;
}

export function resetActionQueueCache() {
  queuePromise = null;
}



