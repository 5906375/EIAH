import type {
  ConnectionOptions,
  JobsOptions,
  Queue,
  QueueOptions,
  Worker,
  WorkerOptions,
  Job,
} from "bullmq";
import type { MemorySyncJobParams, KnowledgeBackfillJobParams } from "../memory";
import { createLogger } from "../logging";
import {
  MaintenanceJobName,
  QueueName,
  type MaintenanceJobPayload,
} from "@eiah/contracts";

export type LedgerReconcileJobParams = {
  tenantId: string;
  workspaceId?: string | null;
  since?: string;
  until?: string;
  limit?: number;
  actionTypes?: string[];
  persistReport?: boolean;
};

type BullModule = typeof import("bullmq");

const DEFAULT_QUEUE_NAME = QueueName.MAINTENANCE;
const DEFAULT_JOB_NAME = MaintenanceJobName;
const DLQ_SUFFIX = "-dlq";
const DEFAULT_CONCURRENCY = Number(process.env.MAINTENANCE_QUEUE_CONCURRENCY ?? "1");
const logger = createLogger({ component: "maintenance-queue" });

let bullmqModulePromise: Promise<BullModule> | null = null;
let queuePromise: Promise<Queue<MaintenanceJobPayload>> | null = null;
let dlqQueuePromise: Promise<Queue<MaintenanceJobPayload & Record<string, unknown>>> | null = null;

async function loadBullMQ(): Promise<BullModule> {
  if (!bullmqModulePromise) {
    bullmqModulePromise = import("bullmq").catch((error) => {
      throw new Error(
        `BullMQ failed to load. Install it with \"pnpm add bullmq\". Original error: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    });
  }
  return bullmqModulePromise;
}

function resolveQueueName() {
  return process.env.MAINTENANCE_QUEUE_NAME ?? DEFAULT_QUEUE_NAME;
}

function resolveJobName() {
  return process.env.MAINTENANCE_QUEUE_JOB_NAME ?? DEFAULT_JOB_NAME;
}

function resolveDlqQueueName() {
  return `${resolveQueueName()}${DLQ_SUFFIX}`;
}

function resolveDlqJobName() {
  return `${resolveJobName()}${DLQ_SUFFIX}`;
}

function resolveConnection(): ConnectionOptions | undefined {
  const url =
    process.env.MAINTENANCE_QUEUE_REDIS_URL ??
    process.env.RUN_QUEUE_REDIS_URL ??
    process.env.REDIS_URL ??
    process.env.BULLMQ_REDIS_URL ??
    process.env.QUEUE_REDIS_URL;

  if (!url) return undefined;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch (error) {
    logger.warn({ err: error, url }, "maintenance-queue.invalid_redis_url");
    return undefined;
  }

  const connection: ConnectionOptions = {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
  };

  if (parsed.username) connection.username = parsed.username;
  if (parsed.password) connection.password = parsed.password;

  if (parsed.pathname && parsed.pathname !== "/") {
    const dbParsed = Number(parsed.pathname.replace("/", ""));
    if (!Number.isNaN(dbParsed)) connection.db = dbParsed;
  }

  if (parsed.protocol === "rediss:") {
    connection.tls = {};
  }

  return connection;
}

async function getQueue() {
  if (!queuePromise) {
    queuePromise = (async () => {
      const { Queue } = await loadBullMQ();
      const connection = resolveConnection();
      const options: QueueOptions | undefined = connection ? { connection } : undefined;
      return new Queue<MaintenanceJobPayload>(resolveQueueName(), options);
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
      return new Queue<MaintenanceJobPayload & Record<string, unknown>>(resolveDlqQueueName(), options);
    })();
  }
  return dlqQueuePromise;
}

export async function enqueueMaintenanceJob(
  payload: MaintenanceJobPayload,
  options: JobsOptions = {}
) {
  const queue = await getQueue();
  await queue.add(
    resolveJobName(),
    payload,
    {
      removeOnComplete: true,
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 500,
      },
      ...options,
    }
  );
}

export async function enqueueMemorySyncJob(params: MemorySyncJobParams, options?: JobsOptions) {
  return enqueueMaintenanceJob({ kind: "memory-sync", params }, options);
}

export async function enqueueKnowledgeBackfillJob(
  params: KnowledgeBackfillJobParams,
  options?: JobsOptions
) {
  return enqueueMaintenanceJob({ kind: "knowledge-backfill", params }, options);
}

export async function enqueueLedgerReconcileJob(
  params: LedgerReconcileJobParams,
  options?: JobsOptions
) {
  return enqueueMaintenanceJob({ kind: "ledger-reconcile", params }, options);
}

export type MaintenanceJobHandler = (job: MaintenanceJobPayload) => Promise<void> | void;

export async function consumeMaintenanceJobs(
  handler: MaintenanceJobHandler,
  options: { concurrency?: number } = {}
) {
  const { Worker } = await loadBullMQ();
  const connection = resolveConnection();
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;

  const worker = new Worker<MaintenanceJobPayload>(
    resolveQueueName(),
    async (job) => handler(job.data),
    connection
      ? ({ connection, concurrency } satisfies WorkerOptions)
      : ({ concurrency } as WorkerOptions)
  );

  worker.on("failed", async (job: Job<MaintenanceJobPayload> | undefined, err) => {
    logger.error({ err, jobId: job?.id, kind: job?.data.kind }, "maintenance-queue.job_failed");
    if (job && isFinalAttempt(job)) {
      await moveJobToDlq(job, err);
    }
  });

  worker.on("error", (error) => {
    logger.error({ err: error }, "maintenance-queue.worker_error");
  });

  logger.info({ queue: resolveQueueName() }, "maintenance-queue.worker_started");

  return worker;
}

async function moveJobToDlq(job: Job<MaintenanceJobPayload>, err: Error) {
  try {
    const dlq = await getDlqQueue();
    await dlq.add(
      resolveDlqJobName(),
      {
        ...job.data,
        failedReason: err.message,
        failedAt: new Date().toISOString(),
        attemptsMade: job.attemptsMade,
      },
      { removeOnComplete: true }
    );
  } catch (dlqError) {
    logger.error({ err: dlqError, jobId: job.id }, "maintenance-queue.dlq_enqueue_failed");
  }
}

function isFinalAttempt(job: Job) {
  const maxAttempts = job.opts?.attempts ?? 1;
  return job.attemptsMade >= maxAttempts;
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

export async function getMaintenanceQueueCounts() {
  const queue = await getQueue();
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

export async function getMaintenanceDlqCounts() {
  const queue = await getDlqQueue();
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

export async function drainMaintenanceQueue(options: { includeDelayed?: boolean } = {}) {
  const queue = await getQueue();
  await queue.drain(options.includeDelayed ?? true);
  await queue.clean(0, 1000, "failed");
  await queue.clean(0, 1000, "completed");
}

export async function drainMaintenanceDlq(options: { includeDelayed?: boolean } = {}) {
  const queue = await getDlqQueue();
  await queue.drain(options.includeDelayed ?? true);
  await queue.clean(0, 1000, "failed");
  await queue.clean(0, 1000, "completed");
}

export async function probeMaintenanceQueue() {
  const [queue, dlq] = await Promise.all([getMaintenanceQueueCounts(), getMaintenanceDlqCounts()]);
  return { queue, dlq };
}
