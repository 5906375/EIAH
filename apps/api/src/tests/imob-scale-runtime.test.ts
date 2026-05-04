import test from "node:test";
import assert from "node:assert/strict";

import {
  buildImobScaleRuntimeMetrics,
  completeImobScaleLead,
  createImobScaleRuntimeState,
  dequeueImobScaleLead,
  enqueueImobScaleLead,
  failImobScaleLead,
} from "../services/imob/imobScaleRuntime";

test("scale runtime prioritizes urgent leads before normal queue items", () => {
  const state = createImobScaleRuntimeState({
    rateLimitPerMinute: { whatsapp: 5 },
  });

  enqueueImobScaleLead({
    state,
    leadId: "lead-normal",
    channel: "whatsapp",
    priority: "normal",
    now: "2026-05-03T10:00:00.000Z",
  });
  enqueueImobScaleLead({
    state,
    leadId: "lead-urgent",
    channel: "whatsapp",
    priority: "urgent",
    now: "2026-05-03T10:00:01.000Z",
  });

  const first = dequeueImobScaleLead({
    state,
    now: "2026-05-03T10:00:02.000Z",
  });

  assert.equal(first?.metadata.leadId, "lead-urgent");
});

test("scale runtime respects per-channel rate limits", () => {
  const state = createImobScaleRuntimeState({
    rateLimitPerMinute: { whatsapp: 1 },
  });

  enqueueImobScaleLead({
    state,
    leadId: "lead-1",
    channel: "whatsapp",
    priority: "high",
    now: "2026-05-03T10:00:00.000Z",
  });
  enqueueImobScaleLead({
    state,
    leadId: "lead-2",
    channel: "whatsapp",
    priority: "urgent",
    now: "2026-05-03T10:00:01.000Z",
  });

  const first = dequeueImobScaleLead({
    state,
    now: "2026-05-03T10:00:02.000Z",
  });
  assert.equal(first?.metadata.leadId, "lead-2");

  const secondBlocked = dequeueImobScaleLead({
    state,
    now: "2026-05-03T10:00:30.000Z",
  });
  assert.equal(secondBlocked, null);

  const secondAfterWindow = dequeueImobScaleLead({
    state,
    now: "2026-05-03T10:01:03.000Z",
  });
  assert.equal(secondAfterWindow?.metadata.leadId, "lead-1");
});

test("scale runtime metrics expose throughput, SLA and queue state", () => {
  const state = createImobScaleRuntimeState({
    rateLimitPerMinute: { email: 5 },
    stageSlaMinutes: 30,
  });

  const queued = enqueueImobScaleLead({
    state,
    leadId: "lead-1",
    channel: "email",
    priority: "high",
    now: "2026-05-03T10:00:00.000Z",
  });
  const running = dequeueImobScaleLead({
    state,
    now: "2026-05-03T10:00:10.000Z",
  });
  assert.equal(running?.job.jobId, queued.job.jobId);
  completeImobScaleLead({
    state,
    jobId: queued.job.jobId,
    now: "2026-05-03T10:10:00.000Z",
  });

  const metrics = buildImobScaleRuntimeMetrics(state, "2026-05-03T10:10:01.000Z");
  assert.equal(metrics.leadsProcessedPerHour, 1);
  assert.equal(metrics.averageResponseTime, 600000);
  assert.equal(metrics.responseRate, 1);
  assert.equal(metrics.stageSla.withinTarget, 1);
  assert.equal(metrics.queue.deadLetter, 0);
});

test("scale runtime keeps duplicate rate controlled under repeated enqueue load", () => {
  const state = createImobScaleRuntimeState();

  for (let index = 0; index < 10; index += 1) {
    enqueueImobScaleLead({
      state,
      leadId: "lead-duplicate",
      channel: "crm_task",
      priority: "normal",
      payload: { batch: "same" },
      now: `2026-05-03T10:00:0${Math.min(index, 9)}.000Z`,
    });
  }

  const metrics = buildImobScaleRuntimeMetrics(state, "2026-05-03T10:01:00.000Z");
  assert.equal(state.jobs.jobs.length, 1);
  assert.equal(metrics.duplicateRate, 0.9);
});

test("scale runtime retains retry and dead-letter behavior for queued leads", () => {
  const state = createImobScaleRuntimeState({
    rateLimitPerMinute: { dialer: 5 },
  });

  const queued = enqueueImobScaleLead({
    state,
    leadId: "lead-retry",
    channel: "dialer",
    priority: "high",
    now: "2026-05-03T10:00:00.000Z",
  });

  dequeueImobScaleLead({
    state,
    now: "2026-05-03T10:00:05.000Z",
  });

  const retry = failImobScaleLead({
    state,
    jobId: queued.job.jobId,
    error: "temporary",
    maxAttempts: 2,
    baseBackoffMs: 30000,
    now: "2026-05-03T10:00:10.000Z",
  });
  assert.equal(retry?.status, "retry_scheduled");

  dequeueImobScaleLead({
    state,
    now: "2026-05-03T10:00:41.000Z",
  });
  const dlq = failImobScaleLead({
    state,
    jobId: queued.job.jobId,
    error: "fatal",
    maxAttempts: 2,
    baseBackoffMs: 30000,
    now: "2026-05-03T10:00:42.000Z",
  });
  assert.equal(dlq?.status, "dead_letter");
});
