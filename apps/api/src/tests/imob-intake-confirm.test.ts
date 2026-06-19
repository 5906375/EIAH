// Phase 4.6 + 5.5 — Confirm endpoint integration test
// Proves that POST /api/imob/chat/intake/confirm/:draftId creates a run
// with status="success" and enqueues the mutation job automatically.
// Intake is synchronous (document extracted at upload) — no action runner needed.
//
// Bug fixed (4.6): status was "queued" (not in RunStatus enum) → now "success".
// Enhancement (5.5): confirm self-completes + enqueues imobRunCompletedQueue.
//
// Tests:
//   CONF-01: upload + confirm returns runId, runStatus=success, mutationQueued=true
//   CONF-02: run exists in DB with status=success and actionId=imob.contract.intake
//   CONF-03: no run exists with status="queued" (regression guard)
//   CONF-04: confirm with expired/missing draft → 409 DRAFT_EXPIRED
//   CONF-05: confirm without auth → 403 UNAUTHORIZED
//   CONF-06: worker processes confirmed run → ImobCase created

import "./support/testInfraEnv.js";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import supertest from "supertest";
import { closePrismaResources, prismaGlobal } from "@repo/db";
import { finalizeHttpContractCleanup } from "./support/httpContractCleanup.js";
import { processImobRunCompletedJob } from "../workers/imobPostRunMutationWorker.js";
import { imobRunCompletedQueue } from "../queues/imobRunCompletedQueue.js";
import { runAtivoUniversalQueue, runAtivoUniversalDLQ } from "@eiah/core";
import { closeDraftStoreResources } from "../services/imob/intake/imobContractDraftService.js";

// ─── Identifiers ──────────────────────────────────────────────────────────────

const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const tenantId = `tenant-conf-${suffix}`;
const workspaceId = `ws-conf-${suffix}`;
const userId = `user-conf-${suffix}`;
const apiToken = `tok-conf-${suffix}`;
const INTAKE_SENTINEL = "INTAKE";

// Real DOCX buffer for upload (mammoth test fixture — known valid DOCX)
const DOCX_PATH = join(
  new URL(".", import.meta.url).pathname,
  "../../../../node_modules/mammoth/test/test-data/simple-list.docx",
);
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

let request: ReturnType<typeof supertest>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function uploadDocx(): Promise<{ ok: boolean; draftId: string; documentHash: string }> {
  const docxBuffer = readFileSync(DOCX_PATH);
  const res = await request
    .post("/api/imob/chat/intake/upload")
    .set("Authorization", `Bearer ${apiToken}`)
    .attach("file", docxBuffer, { filename: "test-contract.docx", contentType: DOCX_MIME });

  assert.equal(res.status, 201, `Upload returned ${res.status}: ${JSON.stringify(res.body)}`);
  const draft = res.body.draft;
  assert.ok(draft?.draftId, "upload response must have draft.draftId");
  const documentHash = draft?.evidenceDrafts?.[0]?.documentHash ?? "";
  return { ok: true, draftId: draft.draftId, documentHash };
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

before(async () => {
  process.env.NODE_ENV = "test";
  const { default: app } = await import("../index");
  request = supertest(app);

  await prismaGlobal.tenant.create({ data: { id: tenantId, name: `Conf Tenant ${suffix}` } });
  await prismaGlobal.workspace.create({ data: { id: workspaceId, tenantId, name: `Conf WS ${suffix}` } });
  await prismaGlobal.user.create({
    data: { id: userId, tenantId, email: `${userId}@example-test.internal`, displayName: "Confirm Tester" },
  });
  await (prismaGlobal as any).apiToken.create({
    data: { token: apiToken, tenantId, workspaceId, userId, description: "conf-test", revoked: false },
  });
});

after(async () => {
  await (prismaGlobal as any).imobCaseEvent.deleteMany({ where: { tenantId } });
  await (prismaGlobal as any).imobCase.deleteMany({ where: { tenantId } });
  await prismaGlobal.run.deleteMany({ where: { tenantId } });
  await (prismaGlobal as any).uploadedDocument.deleteMany({ where: { tenantId } });
  await (prismaGlobal as any).apiToken.deleteMany({ where: { tenantId } });
  await prismaGlobal.workspaceAgentAssignment.deleteMany({ where: { tenantId } });
  await prismaGlobal.user.deleteMany({ where: { tenantId } });
  await prismaGlobal.workspace.deleteMany({ where: { tenantId } });
  await prismaGlobal.tenant.deleteMany({ where: { id: tenantId } });
  await closePrismaResources();
  await closeDraftStoreResources();
  finalizeHttpContractCleanup();
  await imobRunCompletedQueue.close();
  await runAtivoUniversalQueue.close();
  await runAtivoUniversalDLQ.close();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("IMOB Intake Confirm Endpoint — Phase 4.6", () => {
  it("CONF-01: upload + confirm → ok=true, runId, runStatus=success, mutationQueued=true", async () => {
    const { draftId } = await uploadDocx();

    const res = await request
      .post(`/api/imob/chat/intake/confirm/${draftId}`)
      .set("Authorization", `Bearer ${apiToken}`);

    assert.equal(res.status, 201, `Confirm returned ${res.status}: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.ok, true);
    assert.ok(res.body.runId, "runId must be present");
    assert.equal(res.body.runStatus, "success", "intake is synchronous — confirm self-completes the run");
    assert.equal(res.body.mutationQueued, true, "mutation job must be enqueued");
    assert.equal(res.body.actionId, "imob.contract.intake");
    assert.equal(res.body.source, "chat-imob");
  });

  it("CONF-02: run exists in DB with status=success and actionId=imob.contract.intake", async () => {
    const { draftId } = await uploadDocx();

    const confirmRes = await request
      .post(`/api/imob/chat/intake/confirm/${draftId}`)
      .set("Authorization", `Bearer ${apiToken}`);
    assert.equal(confirmRes.status, 201);

    const runId = confirmRes.body.runId;
    const run = await prismaGlobal.run.findUnique({ where: { id: runId } });
    assert.ok(run, "run must exist in DB");
    assert.equal(run!.status, "success", "run status must be 'success' — confirm self-completes the run");
    assert.equal((run!.request as any).actionId, "imob.contract.intake");
    assert.equal((run!.request as any).source, "chat-imob");
  });

  it("CONF-03: no run with status=queued created; confirm creates status=success (regression guard)", async () => {
    const before = await prismaGlobal.run.count({
      where: { tenantId, workspaceId, status: "success" },
    });

    const { draftId } = await uploadDocx();
    await request
      .post(`/api/imob/chat/intake/confirm/${draftId}`)
      .set("Authorization", `Bearer ${apiToken}`);

    const after = await prismaGlobal.run.count({
      where: { tenantId, workspaceId, status: "success" },
    });
    assert.ok(after > before, "a run with status=success must have been created by confirm");

    // Confirm no run with the old invalid status "queued" was created
    // (DB rejects "queued" at the enum level — this is a regression guard)
    const badRuns = await prismaGlobal.run.findMany({ where: { tenantId, workspaceId } });
    for (const run of badRuns) {
      assert.notEqual(run.status, "queued" as any, `run ${run.id} must not have status=queued`);
    }
  });

  it("CONF-04: confirm with expired/missing draftId → 409 DRAFT_EXPIRED", async () => {
    const res = await request
      .post("/api/imob/chat/intake/confirm/nonexistent-draft-id-000")
      .set("Authorization", `Bearer ${apiToken}`);

    assert.equal(res.status, 409);
    assert.equal(res.body.reasonCode, "DRAFT_EXPIRED");
  });

  it("CONF-05: confirm without Authorization → 403 UNAUTHORIZED", async () => {
    const res = await request.post("/api/imob/chat/intake/confirm/any-draft-id");
    assert.ok([401, 403].includes(res.status), `Expected 401/403, got ${res.status}`);
  });

  it("CONF-06: worker processes confirmed run → ImobCase created", async () => {
    await (prismaGlobal as any).imobCaseEvent.deleteMany({ where: { tenantId } });
    await (prismaGlobal as any).imobCase.deleteMany({ where: { tenantId } });

    const { draftId } = await uploadDocx();

    const confirmRes = await request
      .post(`/api/imob/chat/intake/confirm/${draftId}`)
      .set("Authorization", `Bearer ${apiToken}`);
    assert.equal(confirmRes.status, 201);
    assert.equal(confirmRes.body.runStatus, "success", "confirm must self-complete the run");

    const runId = confirmRes.body.runId;

    // Run is already status=success — no manual update needed (Phase 5.5 fix).
    // Call worker directly to verify mutation without relying on BullMQ timing.
    await processImobRunCompletedJob({
      runId,
      tenantId,
      workspaceId,
      caseId: INTAKE_SENTINEL,
      actionId: "imob.contract.intake",
      eventRunId: runId,
    });

    const cases = await (prismaGlobal as any).imobCase.findMany({ where: { tenantId, workspaceId } });
    assert.ok(cases.length > 0, "ImobCase must be created after worker processes the run");

    const created = cases.find((c: any) => (c.metadata as any)?.intakeRunId === runId);
    assert.ok(created, "ImobCase must reference the confirmed runId");
    assert.equal(created.stage, "documents_collecting");
    assert.equal(created.status, "ready_for_review");
  });
});
