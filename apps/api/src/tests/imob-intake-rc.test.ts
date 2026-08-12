// Phase 5.5 — Final E2E / Release Candidate (imob-chat-document-intake)
//
// Validates the full pipeline WITHOUT direct DB inserts and WITHOUT action runner:
//   Upload DOCX → Confirm (run self-completes to status=success + enqueues mutation job)
//   → processImobRunCompletedJob called directly (worker in test mode is not started by index.ts)
//   → ImobCase created → Exports (HTML, DOCX, PDF) accessible via run-scoped endpoint
//
// Integration test vs. bash smoke:
//   - Integration tests call processImobRunCompletedJob directly (worker not started in NODE_ENV=test).
//   - The bash validation script (validate-imob-chat-intake-phase55.sh) validates BullMQ
//     auto-delivery against the real Docker environment where the worker IS running.
//   - Key Phase 5.5 invariant: no run.update({ status: 'success' }) needed — confirm does it.
//
// Tests:
//   RC-01: Upload → Confirm (self-complete) → processJob directly → ImobCase + event created
//   RC-02: Export (HTML + DOCX + PDF) accessible after case creation
//   RC-03: PII guard — evidenceDraft always carries piiMasked=true

import "./support/testInfraEnv.js";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import supertest from "supertest";
import { closePrismaResources, prismaGlobal } from "@repo/db";
import { finalizeHttpContractCleanup } from "./support/httpContractCleanup.js";
import { processImobRunCompletedJob } from "../workers/imobPostRunMutationWorker.js";
import { imobRunCompletedQueue } from "../queues/imobRunCompletedQueue.js";
import { runAtivoUniversalQueue, runAtivoUniversalDLQ } from "@eiah/core";
import { hasCoreAgentProfile, resolveAgentId } from "../services/agents.js";

// ─── Identifiers ──────────────────────────────────────────────────────────────

const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const tenantId = `tenant-rc-${suffix}`;
const workspaceId = `ws-rc-${suffix}`;
const userId = `user-rc-${suffix}`;
const apiToken = `tok-rc-${suffix}`;
const INTAKE_SENTINEL = "INTAKE";

// Shared across RC-01 and RC-02: export test reuses the run created in RC-01
let sharedRunId = "";

const DOCX_PATH = new URL("./fixtures/imob/minimal-lease-contract.docx", import.meta.url);
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

let request: ReturnType<typeof supertest>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function resolveCanonicalEiahAssignmentIdentity() {
  const agentKey = resolveAgentId("EIAH");
  const metadata = await prismaGlobal.agentMetadata.findUnique({
    where: { agent: agentKey },
    select: { version: true },
  });
  const persistedVersion = metadata?.version?.trim();
  const agentVersion = persistedVersion || (hasCoreAgentProfile(agentKey) ? "1.0.0" : null);
  assert.ok(agentVersion, "EIAH must resolve to a persisted or core assignment version");
  return { agentKey, agentVersion };
}

async function uploadDocx() {
  const buf = readFileSync(DOCX_PATH);
  const res = await request
    .post("/api/imob/chat/intake/upload")
    .set("Authorization", `Bearer ${apiToken}`)
    .attach("file", buf, { filename: "contract.docx", contentType: DOCX_MIME });
  assert.equal(res.status, 201, `Upload failed: ${JSON.stringify(res.body)}`);
  return res.body;
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

before(async () => {
  process.env.NODE_ENV = "test";
  const { default: app } = await import("../index");
  request = supertest(app);

  await prismaGlobal.tenant.create({ data: { id: tenantId, name: `RC Tenant ${suffix}` } });
  await prismaGlobal.workspace.create({ data: { id: workspaceId, tenantId, name: `RC WS ${suffix}` } });
  await prismaGlobal.user.create({
    data: { id: userId, tenantId, email: `${userId}@example-test.internal`, displayName: "RC Tester" },
  });
  await (prismaGlobal as any).apiToken.create({
    data: { token: apiToken, tenantId, workspaceId, userId, description: "rc-test", revoked: false },
  });
  const assignmentIdentity = await resolveCanonicalEiahAssignmentIdentity();
  await prismaGlobal.workspaceAgentAssignment.create({
    data: { tenantId, workspaceId, ...assignmentIdentity, enabled: true },
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
  finalizeHttpContractCleanup();
  await imobRunCompletedQueue.close();
  await runAtivoUniversalQueue.close();
  await runAtivoUniversalDLQ.close();
});

// ─── Phase 5.5 RC Tests ───────────────────────────────────────────────────────

describe("IMOB Intake RC — Full Pipeline E2E (Phase 5.5)", () => {
  it("RC-01: Upload → Confirm (self-complete) → processJob directly → ImobCase + event created", async () => {
    // 1. Upload
    const uploadBody = await uploadDocx();
    const evidenceDraft = uploadBody.draft?.evidenceDrafts?.[0];
    assert.ok(evidenceDraft, "upload must have evidenceDrafts[0]");
    assert.equal(evidenceDraft.piiMasked, true, "evidenceDraft must carry piiMasked=true");
    const draftId = uploadBody.draft?.draftId;
    assert.ok(draftId, "upload must return draftId");

    // 2. Confirm — endpoint self-completes run and enqueues mutation job
    const confirmRes = await request
      .post(`/api/imob/chat/intake/confirm/${draftId}`)
      .set("Authorization", `Bearer ${apiToken}`);
    assert.equal(confirmRes.status, 201, `Confirm: ${JSON.stringify(confirmRes.body)}`);
    assert.equal(confirmRes.body.runStatus, "success", "confirm must self-complete the run");
    assert.equal(confirmRes.body.mutationQueued, true, "confirm must set mutationQueued=true");
    const runId: string = confirmRes.body.runId;
    assert.ok(runId, "runId must be present");
    sharedRunId = runId; // share with RC-02 export test

    // 3. Run in DB already has status=success — no manual update needed
    const run = await prismaGlobal.run.findUnique({ where: { id: runId } });
    assert.equal(run?.status, "success", "run must be status=success in DB after confirm");

    // 4. Process mutation job directly (worker not started in NODE_ENV=test)
    // This is the canonical test pattern for all worker tests in this codebase.
    // BullMQ delivery is validated by scripts/validate-imob-chat-intake-phase55.sh.
    await processImobRunCompletedJob({
      runId,
      tenantId,
      workspaceId,
      caseId: INTAKE_SENTINEL,
      actionId: "imob.contract.intake",
      eventRunId: runId,
    });

    // 5. ImobCase created
    const imobCase = await (prismaGlobal as any).imobCase.findFirst({
      where: { tenantId, workspaceId },
    });
    assert.ok(imobCase, "ImobCase must exist after worker processes the job");
    assert.equal(imobCase.stage, "documents_collecting");
    assert.equal(imobCase.status, "ready_for_review");

    // 6. ImobCaseEvent case.document.intake exists (Prisma field is 'type', not 'eventType')
    const intakeEvent = await (prismaGlobal as any).imobCaseEvent.findFirst({
      where: { tenantId, workspaceId, type: "case.document.intake" },
    });
    assert.ok(intakeEvent, "ImobCaseEvent case.document.intake must be created");
  });

  it("RC-02: Export (HTML + DOCX + PDF) accessible using run created in RC-01", async () => {
    // Use sharedRunId from RC-01 — the case + events already exist for this run.
    // A fresh upload with the same DOCX would hit the documentHash idempotency guard.
    assert.ok(sharedRunId, "RC-02 requires RC-01 to have completed first");
    const runId = sharedRunId;

    // HTML export
    const htmlRes = await request
      .get(`/api/imob/runs/${runId}/intake/export?format=html`)
      .set("Authorization", `Bearer ${apiToken}`);
    assert.equal(htmlRes.status, 200, `HTML export: ${JSON.stringify(htmlRes.body)}`);
    assert.ok(htmlRes.headers["x-export-hash"], "HTML export must include X-Export-Hash");

    // DOCX export
    const docxRes = await request
      .get(`/api/imob/runs/${runId}/intake/export?format=docx`)
      .set("Authorization", `Bearer ${apiToken}`);
    assert.equal(docxRes.status, 200, `DOCX export: ${JSON.stringify(docxRes.body)}`);

    // PDF — delegated to frontend (returns guidance JSON)
    const pdfRes = await request
      .get(`/api/imob/runs/${runId}/intake/export?format=pdf`)
      .set("Authorization", `Bearer ${apiToken}`);
    assert.equal(pdfRes.status, 200, `PDF guidance: ${JSON.stringify(pdfRes.body)}`);
    assert.equal(pdfRes.body.reasonCode, "PDF_DELEGATED_TO_FRONTEND");
    assert.ok(pdfRes.body.strategy?.includes("client-side"), "PDF strategy must mention client-side");
  });

  it("RC-03: PII guard — evidenceDraft always carries piiMasked=true", async () => {
    const uploadBody = await uploadDocx();
    const draft = uploadBody.draft;
    const evidenceDraft = draft?.evidenceDrafts?.[0];
    assert.ok(evidenceDraft, "upload must have evidenceDrafts[0]");
    assert.equal(evidenceDraft.piiMasked, true, "evidenceDraft must have piiMasked=true");
  });
});
