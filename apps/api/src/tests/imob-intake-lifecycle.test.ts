// Phase 5 — Lifecycle Hardening: draft consume, scope guard, UploadedDocument persistence,
// worker RunStatus guards (pending/running).
//
// Gap analysis vs existing tests:
//   T-DRF-1..15: draft unit — covered
//   E2E-IN-02/03: idempotency by documentHash/runId — covered
//   E2E-IN-04/05: run.status=error, simulated — covered
//   CONF-01..06: confirm endpoint, RunStatus fix — covered
//
// NEW tests (Fase 5):
//   LC-01: HTTP — confirmed draft is consumed; re-confirm returns 409 DRAFT_EXPIRED
//   LC-02: HTTP — cross-workspace confirm returns 403 DRAFT_SCOPE_MISMATCH
//   LC-03: HTTP — upload creates uploadedDocument record in DB
//   LC-04: HTTP — storageRef in draft matches uploadedDocument.id in DB
//   LC-05: Worker — run.status=pending → skip → no ImobCase created
//   LC-06: Worker — run.status=running → skip → no ImobCase created

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
const tenantId = `tenant-lc-${suffix}`;
const workspaceId = `ws-lc-${suffix}`;
const workspaceId2 = `ws-lc2-${suffix}`; // second workspace for scope-mismatch test
const userId = `user-lc-${suffix}`;
const apiToken = `tok-lc-${suffix}`;
const apiToken2 = `tok-lc2-${suffix}`; // token for workspace2

const DOCX_PATH = join(
  new URL(".", import.meta.url).pathname,
  "../../../../node_modules/mammoth/test/test-data/simple-list.docx",
);
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const INTAKE_SENTINEL = "INTAKE";

let request: ReturnType<typeof supertest>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function uploadDocx(token: string = apiToken) {
  const docxBuffer = readFileSync(DOCX_PATH);
  const res = await request
    .post("/api/imob/chat/intake/upload")
    .set("Authorization", `Bearer ${token}`)
    .attach("file", docxBuffer, { filename: "test-contract.docx", contentType: DOCX_MIME });
  assert.equal(res.status, 201, `Upload returned ${res.status}: ${JSON.stringify(res.body)}`);
  const draft = res.body.draft;
  assert.ok(draft?.draftId, "upload must return draft.draftId");
  return draft;
}

async function createPendingRun(overrides: { status?: string } = {}) {
  return prismaGlobal.run.create({
    data: {
      tenantId,
      workspaceId,
      agent: "EIAH",
      status: (overrides.status ?? "pending") as any,
      txId: null,
      request: {
        actionId: "imob.contract.intake",
        source: "chat-imob",
        documentHash: `sha256-lc-${suffix}-${Math.random().toString(36).slice(2)}`,
        documentKind: "lease_contract",
        pendingItems: [],
        riskFlags: [],
      } as any,
      response: null,
    } as any,
  });
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

before(async () => {
  process.env.NODE_ENV = "test";
  const { default: app } = await import("../index");
  request = supertest(app);

  await prismaGlobal.tenant.create({ data: { id: tenantId, name: `LC Tenant ${suffix}` } });
  await prismaGlobal.workspace.create({ data: { id: workspaceId, tenantId, name: `LC WS ${suffix}` } });
  await prismaGlobal.workspace.create({ data: { id: workspaceId2, tenantId, name: `LC WS2 ${suffix}` } });
  await prismaGlobal.user.create({
    data: { id: userId, tenantId, email: `${userId}@example-test.internal`, displayName: "LC Tester" },
  });
  await (prismaGlobal as any).apiToken.create({
    data: { token: apiToken, tenantId, workspaceId, userId, description: "lc-test", revoked: false },
  });
  await (prismaGlobal as any).apiToken.create({
    data: { token: apiToken2, tenantId, workspaceId: workspaceId2, userId, description: "lc-test2", revoked: false },
  });
  await prismaGlobal.workspaceAgentAssignment.create({
    data: { tenantId, workspaceId, agentKey: "EIAH", agentVersion: "1", enabled: true },
  });
  await prismaGlobal.workspaceAgentAssignment.create({
    data: { tenantId, workspaceId: workspaceId2, agentKey: "EIAH", agentVersion: "1", enabled: true },
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

// ─── Group 1: Draft consume/scope lifecycle ───────────────────────────────────

describe("IMOB Intake Lifecycle — Draft Consume & Scope (Phase 5)", () => {
  it("LC-01: confirm consumes draft — re-confirm same draftId → 409 DRAFT_EXPIRED", async () => {
    const draft = await uploadDocx();
    const draftId = draft.draftId;

    const first = await request
      .post(`/api/imob/chat/intake/confirm/${draftId}`)
      .set("Authorization", `Bearer ${apiToken}`);
    assert.equal(first.status, 201, `First confirm: ${JSON.stringify(first.body)}`);
    assert.equal(first.body.runStatus, "success", "intake confirm self-completes the run (Phase 5.5)");

    // Draft was deleted — re-confirm must fail
    const second = await request
      .post(`/api/imob/chat/intake/confirm/${draftId}`)
      .set("Authorization", `Bearer ${apiToken}`);
    assert.equal(second.status, 409);
    assert.equal(second.body.reasonCode, "DRAFT_EXPIRED");
  });

  it("LC-02: confirm with token for a different workspace → 403 DRAFT_SCOPE_MISMATCH", async () => {
    // Upload with workspace1 token → draft scoped to workspaceId
    const draft = await uploadDocx(apiToken);
    const draftId = draft.draftId;

    // Confirm with workspace2 token — same tenant, different workspaceId
    const res = await request
      .post(`/api/imob/chat/intake/confirm/${draftId}`)
      .set("Authorization", `Bearer ${apiToken2}`);

    assert.equal(res.status, 403);
    assert.equal(res.body.reasonCode, "DRAFT_SCOPE_MISMATCH");
  });
});

// ─── Group 2: UploadedDocument persistence ────────────────────────────────────

describe("IMOB Intake Lifecycle — UploadedDocument Persistence (Phase 5)", () => {
  it("LC-03: upload creates uploadedDocument record with correct tenant/workspace/agent fields", async () => {
    const beforeCount = await (prismaGlobal as any).uploadedDocument.count({
      where: { tenantId, workspaceId },
    });

    await uploadDocx();

    const afterCount = await (prismaGlobal as any).uploadedDocument.count({
      where: { tenantId, workspaceId },
    });
    assert.ok(afterCount > beforeCount, "uploadedDocument count must increase after upload");

    const docs = await (prismaGlobal as any).uploadedDocument.findMany({
      where: { tenantId, workspaceId },
      orderBy: { createdAt: "desc" },
      take: 1,
    });
    const doc = docs[0];
    assert.ok(doc, "uploadedDocument record must exist");
    assert.equal(doc.tenantId, tenantId);
    assert.equal(doc.workspaceId, workspaceId);
    assert.equal(doc.agentSlug, "imob-intake");
    assert.equal(doc.mimeType, DOCX_MIME);
    assert.ok(doc.storageKey, "storageKey must be set");
    assert.match(doc.storageKey, new RegExp(`^${tenantId}/${workspaceId}/`));
    assert.ok(doc.sizeBytes > 0, "sizeBytes must be positive");
  });

  it("LC-04: draft.evidenceDrafts[0].storageRef matches uploadedDocument.id in DB", async () => {
    const draft = await uploadDocx();
    const storageRef = draft.evidenceDrafts?.[0]?.storageRef;
    assert.ok(storageRef, "draft must have evidenceDrafts[0].storageRef");

    // storageRef is the uploadedDocument.id
    const doc = await (prismaGlobal as any).uploadedDocument.findFirst({
      where: { id: storageRef, tenantId, workspaceId },
    });
    assert.ok(doc, `uploadedDocument ${storageRef} must exist in DB`);
    assert.equal(doc.agentSlug, "imob-intake");
  });
});

// ─── Group 3: Worker RunStatus guards ────────────────────────────────────────

describe("IMOB Intake Lifecycle — Worker RunStatus Guards (Phase 5)", () => {
  it("LC-05: worker skips run.status=pending — no ImobCase created (action runner not yet done)", async () => {
    const run = await createPendingRun({ status: "pending" });

    const casesBefore = await (prismaGlobal as any).imobCase.count({ where: { tenantId, workspaceId } });

    await processImobRunCompletedJob({
      runId: run.id,
      tenantId,
      workspaceId,
      caseId: INTAKE_SENTINEL,
      actionId: "imob.contract.intake",
      eventRunId: run.id,
    });

    const casesAfter = await (prismaGlobal as any).imobCase.count({ where: { tenantId, workspaceId } });
    assert.equal(casesAfter, casesBefore, "no ImobCase must be created for a pending run");
  });

  it("LC-06: worker skips run.status=running — no ImobCase created (action runner in progress)", async () => {
    const run = await createPendingRun({ status: "running" });

    const casesBefore = await (prismaGlobal as any).imobCase.count({ where: { tenantId, workspaceId } });

    await processImobRunCompletedJob({
      runId: run.id,
      tenantId,
      workspaceId,
      caseId: INTAKE_SENTINEL,
      actionId: "imob.contract.intake",
      eventRunId: run.id,
    });

    const casesAfter = await (prismaGlobal as any).imobCase.count({ where: { tenantId, workspaceId } });
    assert.equal(casesAfter, casesBefore, "no ImobCase must be created for a running run");
  });
});
