import { createHash, randomUUID } from "node:crypto";

export type ImobAsyncJobStatus =
  | "queued"
  | "running"
  | "retry_scheduled"
  | "succeeded"
  | "dead_letter";

export type ImobAsyncCapabilityJob = {
  jobId: string;
  capabilityId: string;
  status: ImobAsyncJobStatus;
  idempotencyKey: string;
  attemptCount: number;
  createdAt: string;
  updatedAt: string;
  lastError: string | null;
  payload?: Record<string, unknown> | null;
  nextRunAt?: string | null;
};

export type ImobAsyncJobState = {
  jobs: ImobAsyncCapabilityJob[];
};

export function createImobAsyncJobState(initialJobs?: ImobAsyncCapabilityJob[]) {
  return {
    jobs: [...(initialJobs ?? [])],
  } satisfies ImobAsyncJobState;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function deriveImobJobIdempotencyKey(params: {
  capabilityId: string;
  payload?: Record<string, unknown> | null;
  override?: string | null;
}) {
  if (params.override && params.override.trim()) return params.override.trim();
  const hash = createHash("sha256");
  hash.update(params.capabilityId);
  hash.update(stableStringify(params.payload ?? null));
  return hash.digest("hex");
}

export function enqueueImobAsyncJob(params: {
  state: ImobAsyncJobState;
  capabilityId: string;
  payload?: Record<string, unknown> | null;
  idempotencyKey?: string | null;
  now?: string | null;
}) {
  const now = params.now ?? new Date().toISOString();
  const idempotencyKey = deriveImobJobIdempotencyKey({
    capabilityId: params.capabilityId,
    payload: params.payload ?? null,
    override: params.idempotencyKey ?? null,
  });
  const existing = params.state.jobs.find((job) =>
    job.idempotencyKey === idempotencyKey
    && ["queued", "running", "retry_scheduled", "succeeded"].includes(job.status),
  );
  if (existing) {
    return { job: existing, duplicate: true as const };
  }

  const job = {
    jobId: `imob-job-${randomUUID()}`,
    capabilityId: params.capabilityId,
    status: "queued" as const,
    idempotencyKey,
    attemptCount: 0,
    createdAt: now,
    updatedAt: now,
    lastError: null,
    payload: params.payload ?? null,
    nextRunAt: now,
  } satisfies ImobAsyncCapabilityJob;
  params.state.jobs.push(job);
  return { job, duplicate: false as const };
}

export function dequeueImobAsyncJob(params: {
  state: ImobAsyncJobState;
  now?: string | null;
}) {
  const nowIso = params.now ?? new Date().toISOString();
  const nowMs = new Date(nowIso).getTime();
  const job = params.state.jobs
    .filter((item) =>
      item.status === "queued"
      || (item.status === "retry_scheduled" && new Date(item.nextRunAt ?? item.updatedAt).getTime() <= nowMs),
    )
    .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())[0];

  if (!job) return null;

  job.status = "running";
  job.updatedAt = nowIso;
  job.nextRunAt = null;
  return job;
}

export function completeImobAsyncJob(params: {
  state: ImobAsyncJobState;
  jobId: string;
  now?: string | null;
}) {
  const job = params.state.jobs.find((item) => item.jobId === params.jobId);
  if (!job) return null;
  job.status = "succeeded";
  job.updatedAt = params.now ?? new Date().toISOString();
  job.lastError = null;
  job.nextRunAt = null;
  return job;
}

export function failImobAsyncJob(params: {
  state: ImobAsyncJobState;
  jobId: string;
  error: string;
  maxAttempts?: number;
  baseBackoffMs?: number;
  now?: string | null;
}) {
  const job = params.state.jobs.find((item) => item.jobId === params.jobId);
  if (!job) return null;

  const nowIso = params.now ?? new Date().toISOString();
  const maxAttempts = params.maxAttempts ?? 3;
  const baseBackoffMs = params.baseBackoffMs ?? 30_000;

  job.attemptCount += 1;
  job.updatedAt = nowIso;
  job.lastError = params.error;

  if (job.attemptCount >= maxAttempts) {
    job.status = "dead_letter";
    job.nextRunAt = null;
    return job;
  }

  const backoffMs = baseBackoffMs * Math.pow(2, Math.max(0, job.attemptCount - 1));
  job.status = "retry_scheduled";
  job.nextRunAt = new Date(new Date(nowIso).getTime() + backoffMs).toISOString();
  return job;
}

export function buildImobAsyncJobMetrics(state: ImobAsyncJobState) {
  const counts = {
    queued: 0,
    running: 0,
    retry_scheduled: 0,
    succeeded: 0,
    dead_letter: 0,
  };

  for (const job of state.jobs) {
    counts[job.status] += 1;
  }

  return {
    total: state.jobs.length,
    counts,
    dlqSize: counts.dead_letter,
    retryPending: counts.retry_scheduled,
  };
}
