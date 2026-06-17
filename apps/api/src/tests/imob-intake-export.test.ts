// Phase 3 — Export endpoint integration tests
// Tests GET /api/imob/runs/:runId/intake/export?format=html|docx|pdf
// through the live Express app (supertest) against a real DB.
//
// Guards tested:
//   EXP-01: format=html — returns HTML with correct headers
//   EXP-02: format=docx — returns DOCX binary with correct headers
//   EXP-03: format=pdf  — returns PDF delegation guidance (not binary)
//   EXP-04: format missing/invalid — 400 INVALID_FORMAT
//   EXP-05: unauthenticated — 401 or 403
//   EXP-06: run not found — 404 RUN_NOT_FOUND
//   EXP-07: not an intake run — 400 NOT_INTAKE_RUN
//   EXP-08: event not found (worker not yet processed) — 404 EVIDENCE_NOT_FOUND
//   EXP-09: piiMasked !== true in event payload — 403 EXPORT_PII_NOT_MASKED
//   EXP-10: exportHash header is set and is 64-char hex
//   EXP-11: X-Generated-At header is ISO 8601
//   EXP-12: cross-tenant isolation — 404 for different tenant's run

import "./support/testInfraEnv.js";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import supertest from "supertest";
import { closePrismaResources, prismaGlobal } from "@repo/db";
import { finalizeHttpContractCleanup } from "./support/httpContractCleanup.js";
import { imobRunCompletedQueue } from "../queues/imobRunCompletedQueue.js";
import { runAtivoUniversalQueue, runAtivoUniversalDLQ } from "@eiah/core";

// ─── Identifiers ──────────────────────────────────────────────────────────────

const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const tenantId = `tenant-exp-${suffix}`;
const workspaceId = `ws-exp-${suffix}`;
const userId = `user-exp-${suffix}`;
const apiToken = `tok-exp-${suffix}`;

// Cross-tenant scope test
const otherTenantId = `tenant-exp-other-${suffix}`;
const otherWorkspaceId = `ws-exp-other-${suffix}`;
const otherUserId = `user-exp-other-${suffix}`;
const otherApiToken = `tok-exp-other-${suffix}`;

let request: ReturnType<typeof supertest>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function createIntakeRun(docHash: string, overrides: Record<string, unknown> = {}) {
  return prismaGlobal.run.create({
    data: {
      tenantId,
      workspaceId,
      agent: "EIAH",
      status: "success",
      txId: null,
      request: {
        actionId: "imob.contract.intake",
        source: "chat-imob",
        documentHash: docHash,
        documentKind: "lease_contract",
        pendingItems: ["Comprovante de renda pendente"],
        riskFlags: ["Multa acima de 2%"],
        metadata: { domain: "imob", action: "imob.contract.intake" },
      },
      response: null,
      ...overrides,
    } as any,
  });
}

async function createCaseAndEvents(runId: string, docHash: string, piiMasked: unknown = true) {
  const imobCase = await (prismaGlobal as any).imobCase.create({
    data: {
      tenant: { connect: { id: tenantId } },
      workspace: { connect: { id: workspaceId } },
      flow: "documents.collect",
      stage: "documents_collecting",
      status: "ready_for_review",
      nextStep: "Analisar documentação recebida",
      pendingItems: ["Comprovante de renda pendente"],
      blockers: [],
      metadata: {
        intakeDocumentHash: docHash,
        intakeDocumentKind: "lease_contract",
        piiMasked: true,
        riskFlags: ["Multa acima de 2%"],
        intakeRunId: runId,
      },
    },
  });

  // Event 1: case.action.completed
  await (prismaGlobal as any).imobCaseEvent.create({
    data: {
      imobCase: { connect: { id: imobCase.id } },
      tenant: { connect: { id: tenantId } },
      workspace: { connect: { id: workspaceId } },
      run: { connect: { id: runId } },
      type: "case.action.completed",
      actorType: "system",
      actorRef: null,
      summary: "Intake run completed",
      evidenceRef: docHash,
      payload: {
        actionId: "imob.contract.intake",
        documentHash: docHash,
        documentKind: "lease_contract",
        piiMasked: true,
        runId,
      },
    },
  });

  // Event 2: case.document.intake — idempotency anchor
  await (prismaGlobal as any).imobCaseEvent.create({
    data: {
      imobCase: { connect: { id: imobCase.id } },
      tenant: { connect: { id: tenantId } },
      workspace: { connect: { id: workspaceId } },
      run: { connect: { id: runId } },
      type: "case.document.intake",
      actorType: "system",
      actorRef: null,
      summary: "Documento indexado",
      evidenceRef: docHash,
      payload: { documentHash: docHash, documentKind: "lease_contract", piiMasked },
    },
  });

  return imobCase;
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

before(async () => {
  process.env.NODE_ENV = "test";
  const { default: app } = await import("../index");
  request = supertest(app);

  await prismaGlobal.tenant.create({ data: { id: tenantId, name: `Exp Tenant ${suffix}` } });
  await prismaGlobal.workspace.create({ data: { id: workspaceId, tenantId, name: `Exp WS ${suffix}` } });
  await prismaGlobal.user.create({
    data: { id: userId, tenantId, email: `${userId}@example.com`, displayName: "Export Tester" },
  });
  await (prismaGlobal as any).apiToken.create({
    data: { token: apiToken, tenantId, workspaceId, userId, description: "exp-test", revoked: false },
  });

  // Other tenant for cross-tenant isolation test
  await prismaGlobal.tenant.create({ data: { id: otherTenantId, name: `Other Exp Tenant ${suffix}` } });
  await prismaGlobal.workspace.create({ data: { id: otherWorkspaceId, tenantId: otherTenantId, name: `Other WS ${suffix}` } });
  await prismaGlobal.user.create({
    data: { id: otherUserId, tenantId: otherTenantId, email: `${otherUserId}@example.com`, displayName: "Other Tester" },
  });
  await (prismaGlobal as any).apiToken.create({
    data: {
      token: otherApiToken,
      tenantId: otherTenantId,
      workspaceId: otherWorkspaceId,
      userId: otherUserId,
      description: "other-exp-test",
      revoked: false,
    },
  });
});

after(async () => {
  await (prismaGlobal as any).imobCaseEvent.deleteMany({ where: { tenantId } });
  await (prismaGlobal as any).imobCase.deleteMany({ where: { tenantId } });
  await prismaGlobal.run.deleteMany({ where: { tenantId } });
  await (prismaGlobal as any).apiToken.deleteMany({ where: { tenantId } });
  await prismaGlobal.user.deleteMany({ where: { tenantId } });
  await prismaGlobal.workspace.deleteMany({ where: { tenantId } });
  await prismaGlobal.tenant.deleteMany({ where: { id: tenantId } });

  await (prismaGlobal as any).imobCaseEvent.deleteMany({ where: { tenantId: otherTenantId } });
  await (prismaGlobal as any).imobCase.deleteMany({ where: { tenantId: otherTenantId } });
  await prismaGlobal.run.deleteMany({ where: { tenantId: otherTenantId } });
  await (prismaGlobal as any).apiToken.deleteMany({ where: { tenantId: otherTenantId } });
  await prismaGlobal.user.deleteMany({ where: { tenantId: otherTenantId } });
  await prismaGlobal.workspace.deleteMany({ where: { tenantId: otherTenantId } });
  await prismaGlobal.tenant.deleteMany({ where: { id: otherTenantId } });

  await closePrismaResources();
  finalizeHttpContractCleanup();
  await imobRunCompletedQueue.close();
  await runAtivoUniversalQueue.close();
  await runAtivoUniversalDLQ.close();
});

// ─── EXP-01: format=html happy path ──────────────────────────────────────────

describe("[EXP-01] format=html — retorna HTML com headers corretos", () => {
  it("deve retornar 200 com Content-Type text/html e exportHash no header", async () => {
    const docHash = `hash-html-${suffix}`;
    const run = await createIntakeRun(docHash);
    await createCaseAndEvents(run.id, docHash);

    const res = await request
      .get(`/api/imob/runs/${run.id}/intake/export?format=html`)
      .set("Authorization", `Bearer ${apiToken}`);

    assert.equal(res.status, 200, `expected 200, got ${res.status}`);
    assert.ok(
      res.headers["content-type"]?.includes("text/html"),
      `expected text/html, got: ${res.headers["content-type"]}`,
    );
    const exportHash = res.headers["x-export-hash"];
    assert.ok(exportHash, "x-export-hash header must be present");
    assert.match(exportHash, /^[0-9a-f]{64}$/, "x-export-hash must be 64-char hex");
    assert.ok(res.headers["x-generated-at"], "x-generated-at header must be present");
    assert.ok(res.text.startsWith("<!DOCTYPE html>"), "response must start with <!DOCTYPE html>");
    assert.ok(res.text.includes("documents_collecting"), "HTML must include stage");
    assert.ok(res.text.includes("ready_for_review"), "HTML must include status");
    assert.ok(res.text.includes("Mascarado"), "HTML must include PII masking badge");
  });
});

// ─── EXP-02: format=docx happy path ──────────────────────────────────────────

describe("[EXP-02] format=docx — retorna DOCX binário", () => {
  it("deve retornar 200 com Content-Type OOXML e magic bytes PK", async () => {
    const docHash = `hash-docx-${suffix}`;
    const run = await createIntakeRun(docHash);
    await createCaseAndEvents(run.id, docHash);

    const res = await request
      .get(`/api/imob/runs/${run.id}/intake/export?format=docx`)
      .set("Authorization", `Bearer ${apiToken}`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => callback(null, Buffer.concat(chunks)));
      });

    assert.equal(res.status, 200, `expected 200, got ${res.status}`);
    assert.ok(
      res.headers["content-type"]?.includes("wordprocessingml"),
      `expected OOXML MIME, got: ${res.headers["content-type"]}`,
    );
    const exportHash = res.headers["x-export-hash"];
    assert.ok(exportHash, "x-export-hash header must be present");
    assert.match(exportHash, /^[0-9a-f]{64}$/);
    // Verify ZIP magic bytes (PK = 0x50 0x4B)
    const body = res.body as Buffer;
    assert.ok(Buffer.isBuffer(body), "body must be a Buffer");
    assert.ok(body.length > 0, "buffer must be non-empty");
    assert.equal(body[0], 0x50, "first byte must be 0x50 (P)");
    assert.equal(body[1], 0x4b, "second byte must be 0x4B (K)");
  });
});

// ─── EXP-03: format=pdf — delegates to frontend ──────────────────────────────

describe("[EXP-03] format=pdf — delega ao frontend", () => {
  it("deve retornar 200 JSON com reasonCode PDF_DELEGATED_TO_FRONTEND e htmlExportUrl", async () => {
    const docHash = `hash-pdf-${suffix}`;
    const run = await createIntakeRun(docHash);
    await createCaseAndEvents(run.id, docHash);

    const res = await request
      .get(`/api/imob/runs/${run.id}/intake/export?format=pdf`)
      .set("Authorization", `Bearer ${apiToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.ok, false);
    assert.equal(res.body.reasonCode, "PDF_DELEGATED_TO_FRONTEND");
    assert.ok(res.body.htmlExportUrl?.includes(run.id), "htmlExportUrl should include runId");
    assert.ok(res.body.strategy?.includes("client-side"), "strategy must mention client-side");
  });
});

// ─── EXP-04: format inválido — 400 ───────────────────────────────────────────

describe("[EXP-04] format inválido — 400 INVALID_FORMAT", () => {
  it("format=xml deve retornar 400", async () => {
    const res = await request
      .get(`/api/imob/runs/any-run-id/intake/export?format=xml`)
      .set("Authorization", `Bearer ${apiToken}`);

    assert.equal(res.status, 400);
    assert.equal(res.body.reasonCode, "INVALID_FORMAT");
  });

  it("format ausente deve retornar 400", async () => {
    const res = await request
      .get(`/api/imob/runs/any-run-id/intake/export`)
      .set("Authorization", `Bearer ${apiToken}`);

    assert.equal(res.status, 400);
    assert.equal(res.body.reasonCode, "INVALID_FORMAT");
  });
});

// ─── EXP-05: sem autenticação — 401/403 ──────────────────────────────────────

describe("[EXP-05] sem autenticação — 401 ou 403", () => {
  it("requisição sem Bearer token deve ser rejeitada", async () => {
    const res = await request.get(`/api/imob/runs/any-run-id/intake/export?format=html`);

    assert.ok(
      res.status === 401 || res.status === 403,
      `expected 401 or 403, got ${res.status}`,
    );
  });
});

// ─── EXP-06: run não encontrado — 404 ────────────────────────────────────────

describe("[EXP-06] run não encontrado — 404 RUN_NOT_FOUND", () => {
  it("runId inexistente deve retornar 404", async () => {
    const res = await request
      .get(`/api/imob/runs/nonexistent-run-id-xyz/intake/export?format=html`)
      .set("Authorization", `Bearer ${apiToken}`);

    assert.equal(res.status, 404);
    assert.equal(res.body.reasonCode, "RUN_NOT_FOUND");
  });
});

// ─── EXP-07: não é intake run — 400 NOT_INTAKE_RUN ───────────────────────────

describe("[EXP-07] não é intake run — 400 NOT_INTAKE_RUN", () => {
  it("run com actionId diferente deve retornar 400 NOT_INTAKE_RUN", async () => {
    const nonIntakeRun = await prismaGlobal.run.create({
      data: {
        tenantId,
        workspaceId,
        agent: "EIAH",
        status: "success",
        txId: null,
        request: {
          actionId: "imob.owner.register",
          source: "chat-imob",
        },
        response: null,
      } as any,
    });

    const res = await request
      .get(`/api/imob/runs/${nonIntakeRun.id}/intake/export?format=html`)
      .set("Authorization", `Bearer ${apiToken}`);

    assert.equal(res.status, 400);
    assert.equal(res.body.reasonCode, "NOT_INTAKE_RUN");
  });
});

// ─── EXP-08: worker ainda não processou — 404 EVIDENCE_NOT_FOUND ─────────────

describe("[EXP-08] worker não processou — 404 EVIDENCE_NOT_FOUND", () => {
  it("run sem event de intake deve retornar 404", async () => {
    const docHash = `hash-noworker-${suffix}`;
    const run = await createIntakeRun(docHash);
    // Do NOT call createCaseAndEvents — simulate worker not yet run

    const res = await request
      .get(`/api/imob/runs/${run.id}/intake/export?format=html`)
      .set("Authorization", `Bearer ${apiToken}`);

    assert.equal(res.status, 404);
    assert.equal(res.body.reasonCode, "EVIDENCE_NOT_FOUND");
  });
});

// ─── EXP-09: piiMasked !== true — 403 EXPORT_PII_NOT_MASKED ─────────────────

describe("[EXP-09] piiMasked ausente — 403 EXPORT_PII_NOT_MASKED", () => {
  it("event payload sem piiMasked=true deve bloquear export", async () => {
    const docHash = `hash-nopii-${suffix}`;
    const run = await createIntakeRun(docHash);
    await createCaseAndEvents(run.id, docHash, false); // piiMasked=false

    const res = await request
      .get(`/api/imob/runs/${run.id}/intake/export?format=html`)
      .set("Authorization", `Bearer ${apiToken}`);

    assert.equal(res.status, 403);
    assert.equal(res.body.reasonCode, "EXPORT_PII_NOT_MASKED");
  });
});

// ─── EXP-10: exportHash header — 64-char hex ─────────────────────────────────

describe("[EXP-10] exportHash header é hex de 64 chars", () => {
  it("x-export-hash deve ser SHA-256 hex", async () => {
    const docHash = `hash-exporthash-${suffix}`;
    const run = await createIntakeRun(docHash);
    await createCaseAndEvents(run.id, docHash);

    const res = await request
      .get(`/api/imob/runs/${run.id}/intake/export?format=html`)
      .set("Authorization", `Bearer ${apiToken}`);

    assert.equal(res.status, 200);
    const exportHash = res.headers["x-export-hash"];
    assert.match(exportHash, /^[0-9a-f]{64}$/, `expected 64-char hex, got: ${exportHash}`);
  });
});

// ─── EXP-11: X-Generated-At é ISO 8601 ───────────────────────────────────────

describe("[EXP-11] X-Generated-At é ISO 8601", () => {
  it("x-generated-at deve ser parseável como data ISO", async () => {
    const docHash = `hash-generatedAt-${suffix}`;
    const run = await createIntakeRun(docHash);
    await createCaseAndEvents(run.id, docHash);

    const res = await request
      .get(`/api/imob/runs/${run.id}/intake/export?format=html`)
      .set("Authorization", `Bearer ${apiToken}`);

    assert.equal(res.status, 200);
    const generatedAt = res.headers["x-generated-at"];
    assert.ok(generatedAt, "x-generated-at must be present");
    const parsed = new Date(generatedAt);
    assert.ok(!isNaN(parsed.getTime()), `x-generated-at must be a valid date, got: ${generatedAt}`);
  });
});

// ─── EXP-12: cross-tenant isolation ──────────────────────────────────────────

describe("[EXP-12] cross-tenant isolation — run de outro tenant inacessível", () => {
  it("token de outro tenant não acessa run do tenant original", async () => {
    const docHash = `hash-cross-${suffix}`;
    const run = await createIntakeRun(docHash);
    await createCaseAndEvents(run.id, docHash);

    // Use the other tenant's token
    const res = await request
      .get(`/api/imob/runs/${run.id}/intake/export?format=html`)
      .set("Authorization", `Bearer ${otherApiToken}`);

    assert.equal(res.status, 404, `expected 404 for cross-tenant access, got ${res.status}`);
    assert.equal(res.body.reasonCode, "RUN_NOT_FOUND");
  });
});
