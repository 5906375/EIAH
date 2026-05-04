import {
  completeImobAsyncJob,
  createImobAsyncJobState,
  deriveImobJobIdempotencyKey,
  enqueueImobAsyncJob,
  failImobAsyncJob,
  type ImobAsyncCapabilityJob,
  type ImobAsyncJobState,
} from "./imobAsyncJobRuntime";

export type ImobScalePriority = "urgent" | "high" | "normal" | "low";

export type ImobScaleChannel = "whatsapp" | "email" | "crm_task" | "dialer";

export type ImobScaleRuntimeConfig = {
  rateLimitPerMinute: Partial<Record<ImobScaleChannel, number>>;
  stageSlaMinutes: number;
};

export type ImobScaleJobMetadata = {
  jobId: string;
  leadId: string;
  channel: ImobScaleChannel;
  priority: ImobScalePriority;
  createdAt: string;
};

export type ImobScaleDispatchHistory = {
  jobId: string;
  leadId: string;
  channel: ImobScaleChannel;
  priority: ImobScalePriority;
  queuedAt: string;
  completedAt: string;
  responseTimeMs: number;
};

export type ImobScaleRuntimeState = {
  jobs: ImobAsyncJobState;
  metadata: ImobScaleJobMetadata[];
  dispatchHistory: ImobScaleDispatchHistory[];
  rateWindows: Partial<Record<ImobScaleChannel, string[]>>;
  observability: {
    enqueueAttempts: number;
    duplicateAttempts: number;
    rateLimitHits: number;
  };
  config: ImobScaleRuntimeConfig;
};

export function createImobScaleRuntimeState(config?: Partial<ImobScaleRuntimeConfig>) {
  return {
    jobs: createImobAsyncJobState(),
    metadata: [],
    dispatchHistory: [],
    rateWindows: {},
    observability: {
      enqueueAttempts: 0,
      duplicateAttempts: 0,
      rateLimitHits: 0,
    },
    config: {
      rateLimitPerMinute: {
        whatsapp: 2,
        email: 3,
        crm_task: 10,
        dialer: 2,
        ...(config?.rateLimitPerMinute ?? {}),
      },
      stageSlaMinutes: config?.stageSlaMinutes ?? 60,
    },
  } satisfies ImobScaleRuntimeState;
}

function getPriorityWeight(priority: ImobScalePriority) {
  switch (priority) {
    case "urgent":
      return 400;
    case "high":
      return 300;
    case "normal":
      return 200;
    case "low":
    default:
      return 100;
  }
}

function getJobMetadata(state: ImobScaleRuntimeState, jobId: string) {
  return state.metadata.find((item) => item.jobId === jobId) ?? null;
}

function isJobEligible(job: ImobAsyncCapabilityJob, nowMs: number) {
  return job.status === "queued"
    || (job.status === "retry_scheduled" && new Date(job.nextRunAt ?? job.updatedAt).getTime() <= nowMs);
}

function getRateWindow(state: ImobScaleRuntimeState, channel: ImobScaleChannel, nowIso: string) {
  const nowMs = new Date(nowIso).getTime();
  const existing = state.rateWindows[channel] ?? [];
  const filtered = existing.filter((item) => nowMs - new Date(item).getTime() < 60_000);
  state.rateWindows[channel] = filtered;
  return filtered;
}

function channelAvailable(state: ImobScaleRuntimeState, channel: ImobScaleChannel, nowIso: string) {
  const limit = state.config.rateLimitPerMinute[channel] ?? 0;
  if (limit <= 0) return false;
  const currentWindow = getRateWindow(state, channel, nowIso);
  return currentWindow.length < limit;
}

export function enqueueImobScaleLead(params: {
  state: ImobScaleRuntimeState;
  leadId: string;
  channel: ImobScaleChannel;
  priority: ImobScalePriority;
  payload?: Record<string, unknown> | null;
  idempotencyKey?: string | null;
  now?: string | null;
}) {
  params.state.observability.enqueueAttempts += 1;
  const now = params.now ?? new Date().toISOString();
  const derivedKey = deriveImobJobIdempotencyKey({
    capabilityId: "scale.concurrent_leads_1000",
    payload: {
      leadId: params.leadId,
      channel: params.channel,
      priority: params.priority,
      payload: params.payload ?? null,
    },
    override: params.idempotencyKey ?? null,
  });

  const queued = enqueueImobAsyncJob({
    state: params.state.jobs,
    capabilityId: "scale.concurrent_leads_1000",
    payload: {
      leadId: params.leadId,
      channel: params.channel,
      priority: params.priority,
      ...(params.payload ?? {}),
    },
    idempotencyKey: derivedKey,
    now,
  });

  if (queued.duplicate) {
    params.state.observability.duplicateAttempts += 1;
  } else {
    params.state.metadata.push({
      jobId: queued.job.jobId,
      leadId: params.leadId,
      channel: params.channel,
      priority: params.priority,
      createdAt: now,
    });
  }

  return queued;
}

export function dequeueImobScaleLead(params: {
  state: ImobScaleRuntimeState;
  now?: string | null;
}) {
  const nowIso = params.now ?? new Date().toISOString();
  const nowMs = new Date(nowIso).getTime();
  const ranked = params.state.jobs.jobs
    .filter((job) => isJobEligible(job, nowMs))
    .map((job) => {
      const metadata = getJobMetadata(params.state, job.jobId);
      return {
        job,
        metadata,
        weight: metadata ? getPriorityWeight(metadata.priority) : 0,
      };
    })
    .filter((item) => item.metadata)
    .sort((left, right) =>
      right.weight - left.weight
      || new Date(left.job.createdAt).getTime() - new Date(right.job.createdAt).getTime(),
    );

  for (const candidate of ranked) {
    const metadata = candidate.metadata!;
    if (!channelAvailable(params.state, metadata.channel, nowIso)) {
      params.state.observability.rateLimitHits += 1;
      continue;
    }

    candidate.job.status = "running";
    candidate.job.updatedAt = nowIso;
    candidate.job.nextRunAt = null;
    params.state.rateWindows[metadata.channel]?.push(nowIso);
    if (!params.state.rateWindows[metadata.channel]) {
      params.state.rateWindows[metadata.channel] = [nowIso];
    }
    return {
      job: candidate.job,
      metadata,
    };
  }

  return null;
}

export function completeImobScaleLead(params: {
  state: ImobScaleRuntimeState;
  jobId: string;
  now?: string | null;
}) {
  const now = params.now ?? new Date().toISOString();
  const completed = completeImobAsyncJob({
    state: params.state.jobs,
    jobId: params.jobId,
    now,
  });
  if (!completed) return null;

  const metadata = getJobMetadata(params.state, params.jobId);
  if (metadata) {
    params.state.dispatchHistory.push({
      jobId: params.jobId,
      leadId: metadata.leadId,
      channel: metadata.channel,
      priority: metadata.priority,
      queuedAt: metadata.createdAt,
      completedAt: now,
      responseTimeMs: new Date(now).getTime() - new Date(metadata.createdAt).getTime(),
    });
  }

  return completed;
}

export function failImobScaleLead(params: {
  state: ImobScaleRuntimeState;
  jobId: string;
  error: string;
  maxAttempts?: number;
  baseBackoffMs?: number;
  now?: string | null;
}) {
  return failImobAsyncJob({
    state: params.state.jobs,
    jobId: params.jobId,
    error: params.error,
    maxAttempts: params.maxAttempts,
    baseBackoffMs: params.baseBackoffMs,
    now: params.now,
  });
}

export function buildImobScaleRuntimeMetrics(state: ImobScaleRuntimeState, now?: string | null) {
  const nowIso = now ?? new Date().toISOString();
  const nowMs = new Date(nowIso).getTime();
  const lastHour = state.dispatchHistory.filter((item) => nowMs - new Date(item.completedAt).getTime() <= 3_600_000);
  const totalEnqueueAttempts = Math.max(state.observability.enqueueAttempts, 1);
  const averageResponseTime = state.dispatchHistory.length === 0
    ? 0
    : Math.round(state.dispatchHistory.reduce((sum, item) => sum + item.responseTimeMs, 0) / state.dispatchHistory.length);
  const withinSla = state.dispatchHistory.filter((item) => item.responseTimeMs <= state.config.stageSlaMinutes * 60_000).length;
  const breachedSla = state.dispatchHistory.length - withinSla;

  return {
    queue: {
      total: state.jobs.jobs.length,
      queued: state.jobs.jobs.filter((item) => item.status === "queued").length,
      running: state.jobs.jobs.filter((item) => item.status === "running").length,
      retryScheduled: state.jobs.jobs.filter((item) => item.status === "retry_scheduled").length,
      deadLetter: state.jobs.jobs.filter((item) => item.status === "dead_letter").length,
    },
    leadsProcessedPerHour: lastHour.length,
    duplicateRate: state.observability.duplicateAttempts / totalEnqueueAttempts,
    averageResponseTime,
    responseRate: state.jobs.jobs.length === 0 ? 0 : state.dispatchHistory.length / state.jobs.jobs.length,
    stageSla: {
      targetMinutes: state.config.stageSlaMinutes,
      withinTarget: withinSla,
      breached: breachedSla,
    },
    rateLimitHits: state.observability.rateLimitHits,
  };
}
