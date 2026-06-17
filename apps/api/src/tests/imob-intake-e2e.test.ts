// Phase 2 — E2E integrado: confirm → run → worker → ImobCase + ImobCaseEvent
//
// Prova a cadeia do intake de contrato:
//   1. Run criado com status=success e intake context em run.request
//   2. processImobRunCompletedJob chamado com caseId="INTAKE" (sentinel)
//   3. ImobCase criado pelo worker com stage=documents_collecting, status=ready_for_review
//   4. ImobCaseEvent case.action.completed criado com evidenceRef=documentHash
//   5. ImobCaseEvent case.document.intake criado (âncora de idempotência)
//   6. Segundo processamento com mesmo documentHash → skip EXISTING_CASE_FOUND
//   7. run.status !== "success" → skip, nenhum case criado
//   8. run simulado → skip, nenhum case criado
//   9. PII não persiste em metadata/payload do case ou event
//  10. caseId="INTAKE" sentinel nunca é persistido como caseId real
//
// INVARIANTES:
// I-IN-1: ImobCase criado somente via worker (nunca no route handler)
// I-IN-2: documentHash idempotência por tenant/workspace
// I-IN-3: PII não persiste em nenhuma entidade do DB
// I-IN-4: runId duplicado → no-op
// I-IN-5: run simulado → no-op
// I-IN-6: run não success → no-op

import "./support/testInfraEnv.js";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { closePrismaResources, prismaGlobal } from "@repo/db";
import { finalizeHttpContractCleanup } from "./support/httpContractCleanup.js";
import { processImobRunCompletedJob } from "../workers/imobPostRunMutationWorker.js";
import { imobRunCompletedQueue } from "../queues/imobRunCompletedQueue.js";
import { runAtivoUniversalQueue, runAtivoUniversalDLQ } from "@eiah/core";

// ─── Test scope identifiers ───────────────────────────────────────────────────

const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const tenantId = `tenant-intake-e2e-${suffix}`;
const workspaceId = `ws-intake-e2e-${suffix}`;

// Synthetic document hash — not derived from real content
const DOCUMENT_HASH_A = `sha256-synthetic-hash-alpha-${suffix}`;
const DOCUMENT_HASH_B = `sha256-synthetic-hash-beta-${suffix}`;
// Per-test unique hashes to avoid cross-test idempotency collisions
let testHashCounter = 0;
function uniqueHash(label: string) {
  return `sha256-${label}-${suffix}-${++testHashCounter}`;
}

// ─── Setup / teardown ────────────────────────────────────────────────────────

before(async () => {
  process.env.NODE_ENV = "test";
  await prismaGlobal.tenant.create({ data: { id: tenantId, name: `E2E Intake Tenant ${suffix}` } });
  await prismaGlobal.workspace.create({ data: { id: workspaceId, tenantId, name: `E2E Intake WS ${suffix}` } });
});

after(async () => {
  await prismaGlobal.imobCaseEvent.deleteMany({ where: { tenantId } });
  await prismaGlobal.imobCase.deleteMany({ where: { tenantId } });
  await prismaGlobal.run.deleteMany({ where: { tenantId } });
  await prismaGlobal.workspace.deleteMany({ where: { tenantId } });
  await prismaGlobal.tenant.deleteMany({ where: { id: tenantId } });
  await closePrismaResources();
  finalizeHttpContractCleanup();
  await imobRunCompletedQueue.close();
  await runAtivoUniversalQueue.close();
  await runAtivoUniversalDLQ.close();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function createIntakeRun(documentHash: string, overrides: Record<string, unknown> = {}) {
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
        documentHash,
        documentKind: "lease_contract",
        pendingItems: ["Identidade do locatário pendente", "Comprovante de renda pendente"],
        riskFlags: ["lateFee > 2%", "gracePeriod > 5 dias"],
        metadata: { domain: "imob", action: "imob.contract.intake" },
      },
      response: null,
      ...overrides,
    } as any,
  });
}

async function getCasesCreated() {
  return prismaGlobal.imobCase.findMany({ where: { tenantId, workspaceId } });
}

async function getCaseEvents(type?: string) {
  return prismaGlobal.imobCaseEvent.findMany({
    where: { tenantId, workspaceId, ...(type ? { type } : {}) },
    orderBy: { createdAt: "asc" },
  });
}

// Sentinel for intake jobs: no pre-existing caseId
const INTAKE_SENTINEL = "INTAKE";

// ─── E2E-IN-01: Happy path — intake cria ImobCase ────────────────────────────

describe("[E2E-IN-01] Phase 2 — Happy path: intake cria ImobCase", () => {
  it("deve criar ImobCase com stage=documents_collecting, status=ready_for_review", async () => {
    const hash = uniqueHash("happy-case");
    const run = await createIntakeRun(hash);

    await processImobRunCompletedJob({
      runId: run.id,
      tenantId,
      workspaceId,
      caseId: INTAKE_SENTINEL,
      actionId: "imob.contract.intake",
      eventRunId: run.id,
    });

    const cases = await getCasesCreated();
    const created = cases.find((c) => (c.metadata as any)?.intakeDocumentHash === hash);
    assert.ok(created, "ImobCase deve ter sido criado");
    assert.equal(created!.stage, "documents_collecting", "stage deve ser documents_collecting");
    assert.equal(created!.status, "ready_for_review", "status deve ser ready_for_review");
    assert.equal(created!.flow, "documents.collect", "flow deve ser documents.collect");
  });

  it("deve criar event case.action.completed com evidenceRef=documentHash", async () => {
    const hash = uniqueHash("action-completed");
    const run = await createIntakeRun(hash);

    await processImobRunCompletedJob({
      runId: run.id,
      tenantId,
      workspaceId,
      caseId: INTAKE_SENTINEL,
      actionId: "imob.contract.intake",
      eventRunId: run.id,
    });

    const events = await getCaseEvents("case.action.completed");
    const ev = events.find((e) => e.runId === run.id);
    assert.ok(ev, "event case.action.completed deve existir");
    assert.equal(ev!.evidenceRef, hash, "evidenceRef deve ser o documentHash");
    assert.equal(ev!.actorType, "system");

    const payload = ev!.payload as Record<string, unknown>;
    assert.equal(payload.actionId, "imob.contract.intake");
    assert.equal(payload.documentKind, "lease_contract");
    assert.equal(payload.piiMasked, true);
  });

  it("deve criar event case.document.intake como âncora de idempotência", async () => {
    const hash = uniqueHash("doc-intake-anchor");
    const run = await createIntakeRun(hash);

    await processImobRunCompletedJob({
      runId: run.id,
      tenantId,
      workspaceId,
      caseId: INTAKE_SENTINEL,
      actionId: "imob.contract.intake",
      eventRunId: run.id,
    });

    const intakeEvents = await getCaseEvents("case.document.intake");
    const ev = intakeEvents.find((e) => e.evidenceRef === hash);
    assert.ok(ev, "event case.document.intake deve existir com evidenceRef=documentHash");

    const payload = ev!.payload as Record<string, unknown>;
    assert.equal(payload.documentHash, hash);
    assert.equal(payload.piiMasked, true);
  });

  it("deve preservar pendingItems do run.request no ImobCase criado", async () => {
    const hash = uniqueHash("pending-items");
    const run = await createIntakeRun(hash);

    await processImobRunCompletedJob({
      runId: run.id,
      tenantId,
      workspaceId,
      caseId: INTAKE_SENTINEL,
      actionId: "imob.contract.intake",
      eventRunId: run.id,
    });

    const cases = await getCasesCreated();
    const created = cases.find((c) => (c.metadata as any)?.intakeRunId === run.id);
    assert.ok(created, "ImobCase deve existir");
    const pendingItems = (created!.pendingItems as string[]) ?? [];
    assert.ok(pendingItems.some((item) => item.includes("Identidade")), "pendingItems deve conter itens do run");
  });
});

// ─── E2E-IN-02: Idempotência por documentHash ────────────────────────────────

describe("[E2E-IN-02] Phase 2 — Idempotência: mesmo documentHash gera skip", () => {
  it("deve ignorar segundo processamento com mesmo documentHash (EXISTING_CASE_FOUND)", async () => {
    // Use DOCUMENT_HASH_A intentionally — both runs share the same hash
    const run1 = await createIntakeRun(DOCUMENT_HASH_A);
    const run2 = await createIntakeRun(DOCUMENT_HASH_A); // mesmo documentHash

    // Primeira execução
    await processImobRunCompletedJob({
      runId: run1.id,
      tenantId,
      workspaceId,
      caseId: INTAKE_SENTINEL,
      actionId: "imob.contract.intake",
      eventRunId: run1.id,
    });

    const casesAfterFirst = await getCasesCreated();
    const countAfterFirst = casesAfterFirst.filter(
      (c) => (c.metadata as any)?.intakeDocumentHash === DOCUMENT_HASH_A,
    ).length;
    assert.equal(countAfterFirst, 1, "deve existir exatamente 1 case após primeira execução");

    // Segunda execução com mesmo documentHash — deve ser no-op
    await processImobRunCompletedJob({
      runId: run2.id,
      tenantId,
      workspaceId,
      caseId: INTAKE_SENTINEL,
      actionId: "imob.contract.intake",
      eventRunId: run2.id,
    });

    const casesAfterSecond = await getCasesCreated();
    const countAfterSecond = casesAfterSecond.filter(
      (c) => (c.metadata as any)?.intakeDocumentHash === DOCUMENT_HASH_A,
    ).length;
    assert.equal(countAfterSecond, 1, "não deve criar segundo case para mesmo documentHash");
  });

  it("documento diferente (hash B) cria case separado", async () => {
    const runB = await prismaGlobal.run.create({
      data: {
        tenantId, workspaceId, agent: "EIAH", status: "success", txId: null,
        request: {
          actionId: "imob.contract.intake",
          source: "chat-imob",
          documentHash: DOCUMENT_HASH_B,
          documentKind: "lease_contract",
          pendingItems: [],
          riskFlags: [],
          metadata: { domain: "imob", action: "imob.contract.intake" },
        } as any,
        response: null,
      } as any,
    });

    await processImobRunCompletedJob({
      runId: runB.id,
      tenantId,
      workspaceId,
      caseId: INTAKE_SENTINEL,
      actionId: "imob.contract.intake",
      eventRunId: runB.id,
    });

    const allCases = await getCasesCreated();
    const caseForB = allCases.find((c) => (c.metadata as any)?.intakeDocumentHash === DOCUMENT_HASH_B);
    assert.ok(caseForB, "case separado deve ser criado para documentHash B");
    assert.equal(caseForB!.stage, "documents_collecting");
  });
});

// ─── E2E-IN-03: Idempotência por runId ───────────────────────────────────────

describe("[E2E-IN-03] Phase 2 — Idempotência por runId: entrega duplicada do BullMQ é no-op", () => {
  it("segundo processamento do mesmo runId não cria segundo case", async () => {
    const hashC = `sha256-hash-c-${suffix}-idem-run`;
    const runC = await prismaGlobal.run.create({
      data: {
        tenantId, workspaceId, agent: "EIAH", status: "success", txId: null,
        request: {
          actionId: "imob.contract.intake",
          source: "chat-imob",
          documentHash: hashC,
          documentKind: "lease_contract",
          pendingItems: [],
          riskFlags: [],
          metadata: { domain: "imob", action: "imob.contract.intake" },
        } as any,
        response: null,
      } as any,
    });

    const job = {
      runId: runC.id, tenantId, workspaceId,
      caseId: INTAKE_SENTINEL,
      actionId: "imob.contract.intake",
      eventRunId: runC.id,
    };

    await processImobRunCompletedJob(job);
    await processImobRunCompletedJob(job); // duplicate delivery

    const allCases = await getCasesCreated();
    const casesForC = allCases.filter((c) => (c.metadata as any)?.intakeDocumentHash === hashC);
    assert.equal(casesForC.length, 1, "deve existir exatamente 1 case mesmo com entrega duplicada");
  });
});

// ─── E2E-IN-04: run não success → no-op ──────────────────────────────────────

describe("[E2E-IN-04] Phase 2 — run.status=error não cria ImobCase (I-IN-6)", () => {
  it("run com status=error → nenhum case criado", async () => {
    const hashD = `sha256-hash-d-${suffix}-error`;
    const runD = await prismaGlobal.run.create({
      data: {
        tenantId, workspaceId, agent: "EIAH", status: "error", txId: null,
        request: {
          actionId: "imob.contract.intake",
          source: "chat-imob",
          documentHash: hashD,
          documentKind: "lease_contract",
          pendingItems: [],
          riskFlags: [],
          metadata: { domain: "imob", action: "imob.contract.intake" },
        } as any,
        response: null,
      } as any,
    });

    const countBefore = (await getCasesCreated()).length;

    await processImobRunCompletedJob({
      runId: runD.id, tenantId, workspaceId,
      caseId: INTAKE_SENTINEL,
      actionId: "imob.contract.intake",
      eventRunId: runD.id,
    });

    const countAfter = (await getCasesCreated()).length;
    assert.equal(countAfter, countBefore, "nenhum case deve ser criado para run com status=error");
  });
});

// ─── E2E-IN-05: run simulado → no-op ─────────────────────────────────────────

describe("[E2E-IN-05] Phase 2 — run simulado não cria ImobCase (I-IN-5)", () => {
  it("run com simulated=true → nenhum case criado", async () => {
    const hashE = `sha256-hash-e-${suffix}-simulated`;
    const runE = await prismaGlobal.run.create({
      data: {
        tenantId, workspaceId, agent: "EIAH", status: "success", txId: null,
        request: {
          actionId: "imob.contract.intake",
          source: "chat-imob",
          documentHash: hashE,
          documentKind: "lease_contract",
          pendingItems: [],
          riskFlags: [],
          metadata: { domain: "imob", action: "imob.contract.intake" },
        } as any,
        response: {
          outputs: [{ stepId: "step-1", data: { ok: true, simulated: true, action: "imob.contract.intake" } }],
        },
      } as any,
    });

    const countBefore = (await getCasesCreated()).length;

    await processImobRunCompletedJob({
      runId: runE.id, tenantId, workspaceId,
      caseId: INTAKE_SENTINEL,
      actionId: "imob.contract.intake",
      eventRunId: runE.id,
    });

    const countAfter = (await getCasesCreated()).length;
    assert.equal(countAfter, countBefore, "nenhum case deve ser criado para run simulado");
  });
});

// ─── E2E-IN-06: PII não persiste ─────────────────────────────────────────────

describe("[E2E-IN-06] Phase 2 — PII não é persistida no DB (I-IN-3)", () => {
  it("metadata do ImobCase não contém CPF, RG, email real ou telefone", async () => {
    const hashF = `sha256-hash-f-${suffix}-pii`;
    const runF = await prismaGlobal.run.create({
      data: {
        tenantId, workspaceId, agent: "EIAH", status: "success", txId: null,
        request: {
          actionId: "imob.contract.intake",
          source: "chat-imob",
          documentHash: hashF,
          documentKind: "lease_contract",
          pendingItems: ["Identidade pendente"],
          riskFlags: [],
          metadata: { domain: "imob", action: "imob.contract.intake" },
        } as any,
        response: null,
      } as any,
    });

    await processImobRunCompletedJob({
      runId: runF.id, tenantId, workspaceId,
      caseId: INTAKE_SENTINEL,
      actionId: "imob.contract.intake",
      eventRunId: runF.id,
    });

    const allCases = await getCasesCreated();
    const newCase = allCases.find((c) => (c.metadata as any)?.intakeDocumentHash === hashF);
    assert.ok(newCase, "case deve existir");

    const metaStr = JSON.stringify(newCase!.metadata);
    // Padrões de PII que não devem aparecer
    assert.ok(!/\d{3}\.\d{3}\.\d{3}-\d{2}/.test(metaStr), "CPF não deve estar em metadata");
    assert.ok(!/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/.test(metaStr), "CNPJ não deve estar em metadata");
    assert.ok(!/@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/.test(metaStr.replace("***@***", "")), "email real não deve estar em metadata");

    // piiMasked deve ser true
    assert.equal((newCase!.metadata as any)?.piiMasked, true, "piiMasked deve ser true no metadata");
  });

  it("payload dos events não contém PII não mascarada", async () => {
    const hashG = `sha256-hash-g-${suffix}-pii-events`;
    const runG = await prismaGlobal.run.create({
      data: {
        tenantId, workspaceId, agent: "EIAH", status: "success", txId: null,
        request: {
          actionId: "imob.contract.intake",
          source: "chat-imob",
          documentHash: hashG,
          documentKind: "lease_contract",
          pendingItems: [],
          riskFlags: [],
          metadata: { domain: "imob", action: "imob.contract.intake" },
        } as any,
        response: null,
      } as any,
    });

    await processImobRunCompletedJob({
      runId: runG.id, tenantId, workspaceId,
      caseId: INTAKE_SENTINEL,
      actionId: "imob.contract.intake",
      eventRunId: runG.id,
    });

    const events = await getCaseEvents();
    const relevantEvents = events.filter((e) => e.runId === runG.id);
    assert.ok(relevantEvents.length > 0, "events devem existir para o run");

    for (const ev of relevantEvents) {
      const payloadStr = JSON.stringify(ev.payload);
      assert.ok(!/\d{3}\.\d{3}\.\d{3}-\d{2}/.test(payloadStr), `event ${ev.type} não deve conter CPF`);
      assert.equal(
        (ev.payload as Record<string, unknown>)?.piiMasked,
        true,
        `event ${ev.type} deve ter piiMasked=true`,
      );
    }
  });
});

// ─── E2E-IN-07: caseId sentinel não persiste ──────────────────────────────────

describe("[E2E-IN-07] Phase 2 — sentinel 'INTAKE' nunca persiste como caseId real", () => {
  it("nenhum ImobCase deve ter id='INTAKE'", async () => {
    const sentinelCase = await prismaGlobal.imobCase.findFirst({
      where: { id: "INTAKE", tenantId },
    });
    assert.equal(sentinelCase, null, "caseId 'INTAKE' não deve existir no DB");
  });

  it("nenhum ImobCaseEvent deve ter caseId='INTAKE'", async () => {
    const sentinelEvent = await prismaGlobal.imobCaseEvent.findFirst({
      where: { caseId: "INTAKE", tenantId },
    });
    assert.equal(sentinelEvent, null, "caseId 'INTAKE' não deve aparecer em ImobCaseEvent");
  });
});
