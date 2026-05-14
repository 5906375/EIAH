import "./support/testInfraEnv";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import supertest from "supertest";
import { prismaGlobal } from "@repo/db";

let request: ReturnType<typeof supertest>;

const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const tenantId = `tenant-ledger-bundle-${suffix}`;
const workspaceId = `workspace-ledger-bundle-${suffix}`;
const userId = `user-ledger-bundle-${suffix}`;
const runId = `run-ledger-bundle-${suffix}`;
const validTxId = `tx-ledger-valid-${suffix}`;
const orphanTxId = `tx-ledger-orphan-${suffix}`;
const approvalPendingTxId = `tx-ledger-approval-pending-${suffix}`;
const approvalApprovedTxId = `tx-ledger-approval-approved-${suffix}`;
const apiToken = `tok-ledger-bundle-${suffix}`;

before(async () => {
  process.env.NODE_ENV = "test";
  const { default: app } = await import("../index");
  request = supertest(app);

  await prismaGlobal.tenant.create({
    data: {
      id: tenantId,
      name: tenantId,
    },
  });

  await prismaGlobal.workspace.create({
    data: {
      id: workspaceId,
      tenantId,
      name: workspaceId,
    },
  });

  await prismaGlobal.user.create({
    data: {
      id: userId,
      tenantId,
      email: `${userId}@example.com`,
      displayName: "Ledger Bundle Tester",
    },
  });

  await prismaGlobal.apiToken.create({
    data: {
      token: apiToken,
      tenantId,
      workspaceId,
      userId,
      description: "contract-test",
      revoked: false,
    },
  });

  await prismaGlobal.run.create({
    data: {
      id: runId,
      tenantId,
      workspaceId,
      userId,
      agent: "agent-test",
      status: "success",
      request: { prompt: "contract test" },
      response: { ok: true },
      criticalHash: `critical-${suffix}`,
      txId: validTxId,
      sclTxId: validTxId,
    },
  });

  await prismaGlobal.run.create({
    data: {
      id: `run-approval-pending-${suffix}`,
      tenantId,
      workspaceId,
      userId,
      agent: "agent-test",
      status: "success",
      request: { prompt: "approval pending", metadata: { requiresApproval: true } },
      response: { ok: true },
      approvalStatus: "pending",
      criticalHash: `critical-approval-pending-${suffix}`,
      txId: approvalPendingTxId,
      sclTxId: approvalPendingTxId,
    },
  });

  const approvedAt = new Date();
  await prismaGlobal.run.create({
    data: {
      id: `run-approval-approved-${suffix}`,
      tenantId,
      workspaceId,
      userId,
      agent: "agent-test",
      status: "success",
      request: { prompt: "approval approved", metadata: { requiresApproval: true } },
      response: { ok: true },
      approvalStatus: "approved",
      approvedBy: userId,
      approvedAt,
      criticalHash: `critical-approval-approved-${suffix}`,
      txId: approvalApprovedTxId,
      sclTxId: approvalApprovedTxId,
    },
  });

  await prismaGlobal.sclLedger.create({
    data: {
      tenantId,
      workspaceId,
      runId,
      txId: validTxId,
      criticalHash: `critical-${suffix}`,
      signature: "sig-contract-test",
      payload: { source: "contract-test" },
    },
  });

  await prismaGlobal.sclLedger.create({
    data: {
      tenantId,
      workspaceId,
      runId: `orphan-run-${suffix}`,
      txId: orphanTxId,
      criticalHash: `critical-orphan-${suffix}`,
      signature: "sig-contract-test",
      payload: { source: "contract-test-orphan" },
    },
  });

  await prismaGlobal.sclLedger.create({
    data: {
      tenantId,
      workspaceId,
      runId: `run-approval-pending-${suffix}`,
      txId: approvalPendingTxId,
      criticalHash: `critical-approval-pending-${suffix}`,
      signature: "sig-contract-test",
      payload: { source: "contract-test-approval-pending" },
    },
  });

  await prismaGlobal.sclLedger.create({
    data: {
      tenantId,
      workspaceId,
      runId: `run-approval-approved-${suffix}`,
      txId: approvalApprovedTxId,
      criticalHash: `critical-approval-approved-${suffix}`,
      signature: "sig-contract-test",
      payload: { source: "contract-test-approval-approved" },
    },
  });

  await prismaGlobal.runEvent.create({
    data: {
      tenantId,
      workspaceId,
      runId: `run-approval-approved-${suffix}`,
      userId,
      type: "run.approved",
      payload: {
        approvedBy: userId,
        approvedAt: approvedAt.toISOString(),
      },
      criticalHash: `critical-approval-approved-${suffix}`,
      sclTxId: approvalApprovedTxId,
    },
  });
});

after(async () => {
  // guardrail_ledger is append-only; cleanup de runs/tenant pode acionar SET NULL e falhar.
  // Mantemos registros de teste isolados por tenant sufixado para preservar trilha auditável.
  await prismaGlobal.$disconnect();
});

test("GET /api/ledger/:txId retorna 200 com shape contratual", async () => {
  const res = await request.get(`/api/ledger/${validTxId}`).set("Authorization", `Bearer ${apiToken}`);

  assert.equal(res.status, 200);
  assert.equal(res.body?.ok, true);
  assert.equal(res.body?.txId, validTxId);
  assert.equal(res.body?.run?.id, runId);
  assert.equal(typeof res.body?.run?.bundleHash, "string");
  assert.equal(res.body?.scl?.signaturePresent, true);
  assert.equal(res.body?.invariant?.status, "ok");
  assert.equal(res.body?.invariant?.txIdToRunId, true);
  assert.equal(res.body?.invariant?.runIdToBundleHash, true);
  assert.equal(res.body?.invariant?.exportBundlePath, `/api/runs/${runId}/bundle`);
  assert.equal(res.body?.receiptCanon?.specVersion, "receipt.canon.v1");
  assert.ok(Array.isArray(res.body?.receiptCanon?.receipts));
  const txLinkReceiptExists = (res.body?.receiptCanon?.receipts ?? []).some(
    (item: unknown) =>
      Boolean(item) &&
      typeof item === "object" &&
      "receiptType" in (item as Record<string, unknown>) &&
      (item as Record<string, unknown>).receiptType === "TxLinkReceipt"
  );
  assert.equal(
    txLinkReceiptExists,
    true
  );
});

test("GET /api/ledger/:txId retorna 400 para txId inválido", async () => {
  const res = await request.get("/api/ledger/short").set("Authorization", `Bearer ${apiToken}`);

  assert.equal(res.status, 400);
  assert.deepEqual(res.body, {
    ok: false,
    error: {
      code: "INVALID_TXID",
      message: "txId",
      reasonCodes: ["invalid_txid_format"],
    },
  });
});

test("GET /api/ledger/:txId retorna 404 para txId não encontrado", async () => {
  const res = await request
    .get("/api/ledger/txid-not-found-00000001")
    .set("Authorization", `Bearer ${apiToken}`);

  assert.equal(res.status, 404);
  assert.deepEqual(res.body, {
    ok: false,
    error: {
      code: "NOT_FOUND",
      message: "txId",
      reasonCodes: ["txid_not_found"],
    },
  });
});

test("GET /api/ledger/:txId retorna 409 para inconsistência canônica", async () => {
  const res = await request.get(`/api/ledger/${orphanTxId}`).set("Authorization", `Bearer ${apiToken}`);

  assert.equal(res.status, 409);
  assert.equal(res.body?.ok, false);
  assert.equal(res.body?.error?.code, "RECEIPT_CANON_INCONSISTENT");
  assert.ok(Array.isArray(res.body?.error?.reasonCodes));
  assert.ok(res.body?.error?.reasonCodes.includes("missing_run_for_txid"));
});

test("GET /api/ledger/:txId retorna 409 quando approval é obrigatório e pendente", async () => {
  const res = await request
    .get(`/api/ledger/${approvalPendingTxId}`)
    .set("Authorization", `Bearer ${apiToken}`);

  assert.equal(res.status, 409);
  assert.equal(res.body?.ok, false);
  assert.equal(res.body?.error?.code, "RECEIPT_CANON_INCONSISTENT");
  assert.ok(Array.isArray(res.body?.error?.reasonCodes));
  assert.ok(res.body?.error?.reasonCodes.includes("approval_required"));
});

test("GET /api/ledger/:txId retorna 200 quando approval obrigatório já está aprovado", async () => {
  const res = await request
    .get(`/api/ledger/${approvalApprovedTxId}`)
    .set("Authorization", `Bearer ${apiToken}`);

  assert.equal(res.status, 200);
  assert.equal(res.body?.ok, true);
  assert.equal(res.body?.txId, approvalApprovedTxId);
  const approvalReceipt = (res.body?.receiptCanon?.receipts ?? []).find(
    (item: unknown) =>
      Boolean(item) &&
      typeof item === "object" &&
      "receiptType" in (item as Record<string, unknown>) &&
      (item as Record<string, unknown>).receiptType === "ApprovalReceipt"
  ) as Record<string, unknown> | undefined;
  assert.ok(approvalReceipt);
  assert.equal(approvalReceipt?.decision, "APPROVED");
});

test("GET /api/runs/:id/bundle retorna 200 com bundleHash", async () => {
  const res = await request.get(`/api/runs/${runId}/bundle`).set("Authorization", `Bearer ${apiToken}`);

  assert.equal(res.status, 200);
  assert.equal(res.body?.ok, true);
  assert.equal(res.body?.runId, runId);
  assert.equal(typeof res.body?.bundleHash, "string");
  assert.ok(res.body?.bundleHash.length > 0);
  assert.equal(typeof res.body?.hashes, "object");
  assert.equal(typeof res.body?.files, "object");
});

test("GET /api/runs/:id/bundle retorna 404 para run inexistente", async () => {
  const res = await request
    .get(`/api/runs/run-missing-${suffix}/bundle`)
    .set("Authorization", `Bearer ${apiToken}`);

  assert.equal(res.status, 404);
  assert.deepEqual(res.body, {
    ok: false,
    error: { code: "NOT_FOUND", message: "run" },
  });
});
