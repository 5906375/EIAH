import "./support/testInfraEnv.js";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Job, Queue, QueueEvents, UnrecoverableError, Worker } from "bullmq";
import Redis from "ioredis";
import supertest from "supertest";
import { closePrismaResources, prismaGlobal } from "@repo/db";
import {
  clearTenantCapabilityFlag,
  closeCriticalKillSwitchRedis,
  setTenantCapabilityFlag,
} from "@eiah/core/security/killSwitch";

import {
  IMOB_RUN_COMPLETED_DEFAULT_JOB_OPTIONS,
  imobRunCompletedQueue,
} from "../queues/imobRunCompletedQueue.js";
import { buildImobContractIntakeGuard } from "../routes/imob.js";
import {
  ImobContractIntakeTemporarilyBlockedError,
  resolveImobContractIntakeRuntimePolicy,
} from "../services/imob/intake/imobContractIntakeRuntime.js";
import { closeDraftStoreResources } from "../services/imob/intake/imobContractDraftService.js";
import { finalizeHttpContractCleanup } from "./support/httpContractCleanup.js";

const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const tenantA = `tenant-ks-a-${suffix}`;
const tenantB = `tenant-ks-b-${suffix}`;
const workspaceA = `ws-ks-a-${suffix}`;
const workspaceB = `ws-ks-b-${suffix}`;
const userA = `user-ks-a-${suffix}`;
const userB = `user-ks-b-${suffix}`;
const tokenA = `tok-ks-a-${suffix}`;
const tokenB = `tok-ks-b-${suffix}`;
const capabilityId = "imob.contract.intake";
const docxPath = new URL("./fixtures/imob/minimal-lease-contract.docx", import.meta.url);
const docxMime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

let request: ReturnType<typeof supertest>;

async function postUpload(token: string) {
  return request
    .post("/api/imob/chat/intake/upload")
    .set("Authorization", `Bearer ${token}`)
    .attach("file", readFileSync(docxPath), { filename: "contract.docx", contentType: docxMime });
}

before(async () => {
  process.env.NODE_ENV = "test";
  const { default: app } = await import("../index.js");
  request = supertest(app);

  await prismaGlobal.tenant.createMany({
    data: [
      { id: tenantA, name: `Kill Switch A ${suffix}` },
      { id: tenantB, name: `Kill Switch B ${suffix}` },
    ],
  });
  await prismaGlobal.workspace.createMany({
    data: [
      { id: workspaceA, tenantId: tenantA, name: `Kill Switch WS A ${suffix}` },
      { id: workspaceB, tenantId: tenantB, name: `Kill Switch WS B ${suffix}` },
    ],
  });
  await prismaGlobal.user.createMany({
    data: [
      { id: userA, tenantId: tenantA, email: `${userA}@example-test.internal`, displayName: "KS A" },
      { id: userB, tenantId: tenantB, email: `${userB}@example-test.internal`, displayName: "KS B" },
    ],
  });
  await (prismaGlobal as any).apiToken.createMany({
    data: [
      { token: tokenA, tenantId: tenantA, workspaceId: workspaceA, userId: userA, description: "ks-a", revoked: false },
      { token: tokenB, tenantId: tenantB, workspaceId: workspaceB, userId: userB, description: "ks-b", revoked: false },
    ],
  });
});

after(async () => {
  await clearTenantCapabilityFlag({ capabilityId, tenantId: tenantA, workspaceId: workspaceA });
  await clearTenantCapabilityFlag({ capabilityId, tenantId: tenantB, workspaceId: workspaceB });
  await (prismaGlobal as any).guardrailAuditLedger.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
  await (prismaGlobal as any).uploadedDocument.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
  await (prismaGlobal as any).apiToken.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
  await prismaGlobal.user.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
  await prismaGlobal.workspace.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
  await prismaGlobal.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } });
  await closeDraftStoreResources();
  await imobRunCompletedQueue.close();
  await closeCriticalKillSwitchRedis();
  await closePrismaResources();
  finalizeHttpContractCleanup();
});

describe("IMOB intake tenant kill switch", () => {
  it("defaults both intake endpoints to 503 without intake mutations", async () => {
    const documentsBefore = await (prismaGlobal as any).uploadedDocument.count({ where: { tenantId: tenantA } });
    const runsBefore = await prismaGlobal.run.count({ where: { tenantId: tenantA } });

    const upload = await postUpload(tokenA);
    const confirm = await request
      .post("/api/imob/chat/intake/confirm/nonexistent-draft")
      .set("Authorization", `Bearer ${tokenA}`);

    for (const response of [upload, confirm]) {
      assert.equal(response.status, 503);
      assert.equal(response.body.reasonCode, "VERTICAL_CAPABILITY_NOT_AVAILABLE");
      assert.equal(response.body.retryable, false);
    }
    assert.equal(await (prismaGlobal as any).uploadedDocument.count({ where: { tenantId: tenantA } }), documentsBefore);
    assert.equal(await prismaGlobal.run.count({ where: { tenantId: tenantA } }), runsBefore);
  });

  it("enables one tenant without opening another explicitly disabled tenant", async () => {
    await setTenantCapabilityFlag({ capabilityId, tenantId: tenantA, workspaceId: workspaceA, enabled: true });
    await setTenantCapabilityFlag({ capabilityId, tenantId: tenantB, workspaceId: workspaceB, enabled: false });

    const enabledTenant = await postUpload(tokenA);
    const disabledTenant = await postUpload(tokenB);

    assert.equal(enabledTenant.status, 201, JSON.stringify(enabledTenant.body));
    assert.ok(enabledTenant.body.draft?.draftId);
    assert.equal(disabledTenant.status, 503);
    assert.equal(disabledTenant.body.reasonCode, "VERTICAL_CAPABILITY_NOT_AVAILABLE");
    assert.equal(
      await (prismaGlobal as any).uploadedDocument.count({ where: { tenantId: tenantB } }),
      0,
    );
  });

  it("maps flag backend failure to the same fail-closed 503 contract", async () => {
    let statusCode = 200;
    let body: any = null;
    let nextCalled = false;
    const guard = buildImobContractIntakeGuard("upload", (scope) =>
      resolveImobContractIntakeRuntimePolicy({
        ...scope,
        backend: { get: async () => { throw new Error("flag backend unavailable"); } },
      }),
    );
    const response = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(payload: unknown) {
        body = payload;
        return this;
      },
    };

    await guard(
      { authContext: { tenantId: tenantA, workspaceId: workspaceA } } as any,
      response as any,
      (() => { nextCalled = true; }) as any,
    );

    assert.equal(nextCalled, false);
    assert.equal(statusCode, 503);
    assert.equal(body.reasonCode, "VERTICAL_CAPABILITY_NOT_AVAILABLE");
    assert.equal(body.retryable, false);
  });

  it("marks blocked jobs unrecoverable and permits processing after explicit enable", async () => {
    const blocked = await resolveImobContractIntakeRuntimePolicy({
      tenantId: tenantA,
      workspaceId: workspaceA,
      backend: { get: async () => "disabled" },
    });
    const error = new ImobContractIntakeTemporarilyBlockedError(blocked);
    assert.ok(error instanceof UnrecoverableError);

    // Exercise BullMQ's own retry decision without opening a Redis connection.
    const [shouldRetry, retryDelay] = await (Job.prototype as any).shouldRetryJob.call(
      {
        attemptsMade: 0,
        opts: { attempts: 3, backoff: { type: "exponential", delay: 2_000 } },
        discarded: false,
        queue: { opts: {} },
      },
      error,
    );
    assert.equal(shouldRetry, false, "UnrecoverableError must bypass all configured retries");
    assert.equal(retryDelay, 0);
    assert.equal(IMOB_RUN_COMPLETED_DEFAULT_JOB_OPTIONS.attempts, 3);
    assert.equal(IMOB_RUN_COMPLETED_DEFAULT_JOB_OPTIONS.removeOnFail, false);

    const enabledAfterOperatorAction = await resolveImobContractIntakeRuntimePolicy({
      tenantId: tenantA,
      workspaceId: workspaceA,
      backend: { get: async () => "enabled" },
    });
    assert.equal(enabledAfterOperatorAction.enabled, true);
    assert.equal(enabledAfterOperatorAction.operationalState, "enabled");
  });

  it("retains a preexisting job after one attempt and completes it only after explicit redrive", async () => {
    const redisUrl = process.env.KILL_SWITCH_REDIS_URL;
    assert.ok(redisUrl, "test kill switch Redis URL must be configured");
    const queueName = `imob-intake-redrive-${suffix}`;
    const queueRedis = new Redis(redisUrl, { maxRetriesPerRequest: null });
    const eventsRedis = new Redis(redisUrl, { maxRetriesPerRequest: null });
    const workerRedis = new Redis(redisUrl, { maxRetriesPerRequest: null });
    const queue = new Queue(queueName, { connection: queueRedis });
    const events = new QueueEvents(queueName, { connection: eventsRedis });
    let enabled = false;
    let calls = 0;
    const worker = new Worker(
      queueName,
      async () => {
        calls += 1;
        const policy = await resolveImobContractIntakeRuntimePolicy({
          tenantId: tenantA,
          workspaceId: workspaceA,
          backend: { get: async () => enabled ? "enabled" : "disabled" },
        });
        if (!policy.enabled) throw new ImobContractIntakeTemporarilyBlockedError(policy);
        return "resumed-after-pr1c";
      },
      { connection: workerRedis },
    );

    try {
      await Promise.all([events.waitUntilReady(), worker.waitUntilReady()]);
      const job = await queue.add("process", { runId: `run-${suffix}` }, {
        ...IMOB_RUN_COMPLETED_DEFAULT_JOB_OPTIONS,
        removeOnComplete: false,
      });
      await assert.rejects(job.waitUntilFinished(events, 5_000));
      const failedJob = await queue.getJob(job.id!);
      assert.ok(failedJob);
      assert.equal(await failedJob.getState(), "failed");
      assert.equal(failedJob.attemptsMade, 1);
      assert.equal(calls, 1, "blocked job must not retry automatically");

      enabled = true;
      await failedJob.retry();
      assert.equal(await failedJob.waitUntilFinished(events, 5_000), "resumed-after-pr1c");
      assert.equal(calls, 2, "only the explicit redrive may resume the job");
    } finally {
      await worker.close();
      await events.close();
      await queue.obliterate({ force: true });
      await queue.close();
      await Promise.all([queueRedis.quit(), eventsRedis.quit(), workerRedis.quit()]);
    }
  });
});
