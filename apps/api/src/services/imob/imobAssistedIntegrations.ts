import {
  buildImobAsyncJobMetrics,
  completeImobAsyncJob,
  createImobAsyncJobState,
  dequeueImobAsyncJob,
  enqueueImobAsyncJob,
  type ImobAsyncCapabilityJob,
  type ImobAsyncJobState,
} from "./imobAsyncJobRuntime";
import { resolveImobCapabilityGate } from "./imobCapabilityGate";

export type ImobAssistedCapabilityId =
  | "schedule.real_calendar"
  | "listing.ads_api_publish"
  | "outbound.owner_contact";

export type ImobAssistedIntegrationState = {
  jobs: ImobAsyncJobState;
  tracking: Array<{
    trackingId: string;
    capabilityId: ImobAssistedCapabilityId;
    jobId: string;
    sandbox: true;
    status: "queued" | "completed";
    generatedAt: string;
    result?: Record<string, unknown> | null;
  }>;
};

export type ImobAssistedIntegrationRequest = {
  capabilityId: ImobAssistedCapabilityId;
  payload?: Record<string, unknown> | null;
  consentProvided?: boolean;
  humanApprovalGranted?: boolean;
  evidenceRefsCount?: number;
  policyAccepted?: boolean;
  idempotencyKey?: string | null;
  now?: string | null;
};

export function createImobAssistedIntegrationState() {
  return {
    jobs: createImobAsyncJobState(),
    tracking: [],
  } satisfies ImobAssistedIntegrationState;
}

function buildTrackingId(jobId: string) {
  return `tracking-${jobId}`;
}

function buildEvidencePack(params: {
  capabilityId: ImobAssistedCapabilityId;
  trackingId: string;
  executionMode: string;
  generatedAt: string;
}) {
  return {
    capabilityId: params.capabilityId,
    trackingId: params.trackingId,
    executionMode: params.executionMode,
    sandbox: true as const,
    generatedAt: params.generatedAt,
  };
}

export function queueImobAssistedCapability(params: {
  state: ImobAssistedIntegrationState;
  request: ImobAssistedIntegrationRequest;
}) {
  const gate = resolveImobCapabilityGate({
    capabilityId: params.request.capabilityId,
    consentProvided: params.request.consentProvided,
    humanApprovalGranted: params.request.humanApprovalGranted,
    evidenceRefsCount: params.request.evidenceRefsCount,
    policyAccepted: params.request.policyAccepted,
  });

  if (!gate.allowed || !gate.capability) {
    return {
      status: "blocked" as const,
      gate,
    };
  }

  const queued = enqueueImobAsyncJob({
    state: params.state.jobs,
    capabilityId: params.request.capabilityId,
    payload: params.request.payload ?? null,
    idempotencyKey: params.request.idempotencyKey ?? null,
    now: params.request.now ?? null,
  });

  const generatedAt = params.request.now ?? new Date().toISOString();
  const trackingId = buildTrackingId(queued.job.jobId);
  const existingTracking = params.state.tracking.find((item) => item.jobId === queued.job.jobId);
  if (!existingTracking) {
    params.state.tracking.push({
      trackingId,
      capabilityId: params.request.capabilityId,
      jobId: queued.job.jobId,
      sandbox: true,
      status: "queued",
      generatedAt,
      result: null,
    });
  }

  return {
    status: "queued" as const,
    duplicate: queued.duplicate,
    capability: gate.capability,
    job: queued.job,
    trackingId,
    evidencePack: buildEvidencePack({
      capabilityId: params.request.capabilityId,
      trackingId,
      executionMode: gate.capability.executionMode,
      generatedAt,
    }),
  };
}

function buildMockResult(job: ImobAsyncCapabilityJob, now: string) {
  if (job.capabilityId === "schedule.real_calendar") {
    return {
      provider: "calendar_sandbox",
      calendarEventId: `mock-calendar-${job.jobId}`,
      holdStatus: "confirmed",
      completedAt: now,
    };
  }
  if (job.capabilityId === "listing.ads_api_publish") {
    return {
      provider: "listing_sandbox",
      publicationId: `mock-publication-${job.jobId}`,
      channelStatus: "published_in_sandbox",
      completedAt: now,
    };
  }
  return {
    provider: "outbound_sandbox",
    deliveryId: `mock-outbound-${job.jobId}`,
    channelStatus: "queued_for_send_in_sandbox",
    completedAt: now,
  };
}

export function processNextImobAssistedCapability(params: {
  state: ImobAssistedIntegrationState;
  now?: string | null;
}) {
  const now = params.now ?? new Date().toISOString();
  const job = dequeueImobAsyncJob({
    state: params.state.jobs,
    now,
  });
  if (!job) return null;

  const completed = completeImobAsyncJob({
    state: params.state.jobs,
    jobId: job.jobId,
    now,
  });
  const result = buildMockResult(job, now);
  const tracking = params.state.tracking.find((item) => item.jobId === job.jobId);
  if (tracking) {
    tracking.status = "completed";
    tracking.result = result;
  }

  return {
    status: "completed" as const,
    job: completed ?? job,
    trackingId: buildTrackingId(job.jobId),
    result,
    evidencePack: buildEvidencePack({
      capabilityId: job.capabilityId as ImobAssistedCapabilityId,
      trackingId: buildTrackingId(job.jobId),
      executionMode: "assisted",
      generatedAt: now,
    }),
  };
}

export function getImobAssistedIntegrationMetrics(state: ImobAssistedIntegrationState) {
  return {
    queue: buildImobAsyncJobMetrics(state.jobs),
    trackingTotal: state.tracking.length,
    completedTotal: state.tracking.filter((item) => item.status === "completed").length,
  };
}
