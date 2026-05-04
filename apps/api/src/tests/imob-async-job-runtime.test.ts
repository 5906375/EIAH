import test from "node:test";
import assert from "node:assert/strict";

import {
  buildImobAsyncJobMetrics,
  completeImobAsyncJob,
  createImobAsyncJobState,
  dequeueImobAsyncJob,
  deriveImobJobIdempotencyKey,
  enqueueImobAsyncJob,
  failImobAsyncJob,
} from "../services/imob/imobAsyncJobRuntime";

test("enqueue creates job with deterministic idempotency key", () => {
  const state = createImobAsyncJobState();
  const expectedKey = deriveImobJobIdempotencyKey({
    capabilityId: "schedule.real_calendar",
    payload: { caseId: "case-1" },
  });

  const { job, duplicate } = enqueueImobAsyncJob({
    state,
    capabilityId: "schedule.real_calendar",
    payload: { caseId: "case-1" },
    now: "2026-05-03T10:00:00.000Z",
  });

  assert.equal(duplicate, false);
  assert.equal(job.idempotencyKey, expectedKey);
  assert.equal(job.status, "queued");
});

test("dequeue promotes next eligible job to running and complete marks success", () => {
  const state = createImobAsyncJobState();
  const created = enqueueImobAsyncJob({
    state,
    capabilityId: "listing.ads_api_publish",
    payload: { listingId: "listing-1" },
    now: "2026-05-03T10:00:00.000Z",
  });

  const dequeued = dequeueImobAsyncJob({
    state,
    now: "2026-05-03T10:00:01.000Z",
  });

  assert.equal(dequeued?.jobId, created.job.jobId);
  assert.equal(dequeued?.status, "running");

  const completed = completeImobAsyncJob({
    state,
    jobId: created.job.jobId,
    now: "2026-05-03T10:00:02.000Z",
  });

  assert.equal(completed?.status, "succeeded");
  assert.equal(completed?.updatedAt, "2026-05-03T10:00:02.000Z");
});

test("fail schedules retry with exponential backoff", () => {
  const state = createImobAsyncJobState();
  const created = enqueueImobAsyncJob({
    state,
    capabilityId: "outbound.owner_contact",
    payload: { ownerId: "owner-1" },
    now: "2026-05-03T10:00:00.000Z",
  });

  dequeueImobAsyncJob({
    state,
    now: "2026-05-03T10:00:01.000Z",
  });

  const failed = failImobAsyncJob({
    state,
    jobId: created.job.jobId,
    error: "temporary failure",
    baseBackoffMs: 60_000,
    maxAttempts: 3,
    now: "2026-05-03T10:00:02.000Z",
  });

  assert.equal(failed?.attemptCount, 1);
  assert.equal(failed?.status, "retry_scheduled");
  assert.equal(failed?.nextRunAt, "2026-05-03T10:01:02.000Z");
});

test("repeated failures move job to dead letter queue", () => {
  const state = createImobAsyncJobState();
  const created = enqueueImobAsyncJob({
    state,
    capabilityId: "lead.enrichment_public",
    payload: { leadId: "lead-1" },
    now: "2026-05-03T10:00:00.000Z",
  });

  dequeueImobAsyncJob({ state, now: "2026-05-03T10:00:01.000Z" });
  failImobAsyncJob({
    state,
    jobId: created.job.jobId,
    error: "failure-1",
    maxAttempts: 2,
    now: "2026-05-03T10:00:02.000Z",
  });

  dequeueImobAsyncJob({ state, now: "2026-05-03T10:00:33.000Z" });
  const failedAgain = failImobAsyncJob({
    state,
    jobId: created.job.jobId,
    error: "failure-2",
    maxAttempts: 2,
    now: "2026-05-03T10:00:34.000Z",
  });

  assert.equal(failedAgain?.attemptCount, 2);
  assert.equal(failedAgain?.status, "dead_letter");
  assert.equal(failedAgain?.lastError, "failure-2");
});

test("idempotency prevents duplicate active jobs for same capability and payload", () => {
  const state = createImobAsyncJobState();
  const first = enqueueImobAsyncJob({
    state,
    capabilityId: "schedule.real_calendar",
    payload: { caseId: "case-1" },
  });
  const second = enqueueImobAsyncJob({
    state,
    capabilityId: "schedule.real_calendar",
    payload: { caseId: "case-1" },
  });

  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.equal(first.job.jobId, second.job.jobId);
  assert.equal(state.jobs.length, 1);
});

test("metrics expose queue, retry and dlq counts", () => {
  const state = createImobAsyncJobState();
  const queued = enqueueImobAsyncJob({
    state,
    capabilityId: "schedule.real_calendar",
    payload: { caseId: "case-1" },
    now: "2026-05-03T10:00:00.000Z",
  });
  const retrying = enqueueImobAsyncJob({
    state,
    capabilityId: "outbound.owner_contact",
    payload: { ownerId: "owner-1" },
    now: "2026-05-03T10:00:00.000Z",
  });
  const dlq = enqueueImobAsyncJob({
    state,
    capabilityId: "lead.enrichment_public",
    payload: { leadId: "lead-1" },
    now: "2026-05-03T10:00:00.000Z",
  });

  dequeueImobAsyncJob({ state, now: "2026-05-03T10:00:01.000Z" });
  failImobAsyncJob({
    state,
    jobId: retrying.job.jobId,
    error: "temporary",
    now: "2026-05-03T10:00:02.000Z",
  });
  dequeueImobAsyncJob({ state, now: "2026-05-03T10:00:03.000Z" });
  failImobAsyncJob({
    state,
    jobId: dlq.job.jobId,
    error: "fatal-1",
    maxAttempts: 1,
    now: "2026-05-03T10:00:04.000Z",
  });

  const metrics = buildImobAsyncJobMetrics(state);
  assert.equal(metrics.total, 3);
  assert.equal(metrics.counts.retry_scheduled >= 1, true);
  assert.equal(metrics.counts.dead_letter >= 1, true);
  assert.equal(metrics.dlqSize, metrics.counts.dead_letter);
  assert.equal(queued.job.status === "running" || queued.job.status === "queued", true);
});
