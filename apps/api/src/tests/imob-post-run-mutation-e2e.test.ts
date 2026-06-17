// Phase 4.2 — E2E integrado: CC→Chat→Run→Worker→ImobCase
//
// Prova a cadeia completa em banco de dados real:
//   1. ImobCase criado com estado inicial
//   2. Run criado com status=success + txId
//   3. processImobRunCompletedJob chamado com deps reais (prismaGlobal)
//   4. ImobCase atualizado conforme IMOB_RUN_OUTCOME_MAP
//   5. ImobCaseEvent criado com type=case.action.completed
//   6. Canonical recalculado (confirmado via API dossier)
//   7. CC lê novo estado via GET /api/imob/cases/:id/dossier
//
// INVARIANTES VERIFICADOS:
// I1: ImobCase.status decidido exclusivamente no backend (worker)
// I2: status deriva do outcome map + ImobCrmMutationService
// I3: React não contém regra de status — CC lê estado via API
// I4: simulated=true → nunca muta
// I5: run.status !== "success" → nunca muta
// I6: runId duplicado → no-op (idempotência DB)
// I7: cross-workspace → getRun retorna null → nunca muta

import "./support/testInfraEnv.js";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import supertest from "supertest";
import { closePrismaResources, prismaGlobal } from "@repo/db";
import { finalizeHttpContractCleanup } from "./support/httpContractCleanup.js";
import { processImobRunCompletedJob } from "../workers/imobPostRunMutationWorker.js";
import { buildImobCanonicalCase } from "../services/imob/imobCanonical.js";
import { imobRunCompletedQueue } from "../queues/imobRunCompletedQueue.js";
import { runAtivoUniversalQueue, runAtivoUniversalDLQ } from "@eiah/core";

// ─── Test scope identifiers ───────────────────────────────────────────────────

const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const tenantId = `tenant-imob-e2e-${suffix}`;
const workspaceId = `ws-imob-e2e-${suffix}`;
const workspaceIdB = `ws-imob-e2e-b-${suffix}`;
const apiToken = `tok-imob-e2e-${suffix}`;
// API token has NO userId so readImobWorkspaceAccessProfile grants full IMOB permissions
let request: ReturnType<typeof supertest>;

// ─── Setup / teardown ────────────────────────────────────────────────────────

before(async () => {
  process.env.NODE_ENV = "test";
  const { default: app } = await import("../index.js");
  request = supertest(app);

  await prismaGlobal.tenant.create({ data: { id: tenantId, name: `E2E IMOB Tenant ${suffix}` } });
  await prismaGlobal.workspace.create({ data: { id: workspaceId, tenantId, name: `E2E WS A ${suffix}` } });
  await prismaGlobal.workspace.create({ data: { id: workspaceIdB, tenantId, name: `E2E WS B ${suffix}` } });
  // No userId on this token — grants full IMOB permissions without workspace membership lookup
  await prismaGlobal.apiToken.create({
    data: { token: apiToken, tenantId, workspaceId, description: "imob-e2e-phase42", revoked: false },
  });
});

after(async () => {
  await prismaGlobal.memoryEvent.deleteMany({ where: { tenantId } });
  await prismaGlobal.imobCaseEvent.deleteMany({ where: { tenantId } });
  await prismaGlobal.imobCase.deleteMany({ where: { tenantId } });
  await prismaGlobal.run.deleteMany({ where: { tenantId } });
  await prismaGlobal.apiToken.deleteMany({ where: { tenantId } });
  await prismaGlobal.workspace.deleteMany({ where: { tenantId } });
  await prismaGlobal.tenant.deleteMany({ where: { id: tenantId } });
  await closePrismaResources();
  finalizeHttpContractCleanup();
  // Close all BullMQ Queue connections opened at module import (prevent event loop hang).
  // runAtivoUniversalQueue and runAtivoUniversalDLQ are created at module level inside
  // @eiah/core and pulled in transitively when imobPostRunMutationWorker imports "@eiah/core".
  await imobRunCompletedQueue.close();
  await runAtivoUniversalQueue.close();
  await runAtivoUniversalDLQ.close();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function createTestCase(overrides: Record<string, unknown> = {}) {
  return prismaGlobal.imobCase.create({
    data: {
      tenantId,
      workspaceId,
      flow: "owner.create",
      stage: "intake",
      status: "pending_data",
      ownerResponsible: null,
      nextStep: "Registrar o proprietário para iniciar a captação",
      blockers: [],
      pendingItems: ["Proprietário pendente de cadastro", "Dados do proprietário ausentes"],
      metadata: { source: "e2e-phase42" },
      ...overrides,
    },
  });
}

async function createTestRun(overrides: Record<string, unknown> = {}) {
  return prismaGlobal.run.create({
    data: {
      tenantId,
      workspaceId,
      agent: "EIAH",
      status: "success",
      txId: `tx-e2e-${suffix}`,
      request: {
        agent: "EIAH",
        prompt: "registrar proprietário",
        metadata: { domain: "imob", action: "realestate.register_property" },
      },
      response: null,
      ...overrides,
    } as any,
  });
}

async function getCaseFromDb(caseId: string) {
  return prismaGlobal.imobCase.findFirst({ where: { id: caseId, tenantId, workspaceId } });
}

async function getCaseEvents(caseId: string, type?: string) {
  return prismaGlobal.imobCaseEvent.findMany({
    where: { caseId, tenantId, workspaceId, ...(type ? { type } : {}) },
    orderBy: { createdAt: "asc" },
  });
}

// ─── E2E-01: Happy path — owner.register ─────────────────────────────────────

describe("[E2E-01] Phase 4.2 — Happy path: owner.register atualiza ImobCase", () => {
  it("deveria atualizar ImobCase para stage=property_collecting, status=ready_for_review", async () => {
    const testCase = await createTestCase();
    const testRun = await createTestRun({ txId: `tx-e2e-owner-${suffix}` });

    // Estado inicial via DB
    const before = await getCaseFromDb(testCase.id);
    assert.ok(before, "case deve existir antes do worker");
    assert.equal(before.stage, "intake");
    assert.equal(before.status, "pending_data");

    // Estado inicial via API (I3: CC lê o estado via API)
    const dossiierBefore = await request
      .get(`/api/imob/cases/${testCase.id}/dossier`)
      .set("Authorization", `Bearer ${apiToken}`);
    assert.equal(dossiierBefore.status, 200, `dossier antes: status esperado 200, recebido ${dossiierBefore.status}`);
    assert.equal(dossiierBefore.body?.data?.case?.stage, "intake");
    assert.equal(dossiierBefore.body?.data?.case?.status, "pending_data");

    // Executar worker com deps reais (prismaGlobal, getRun, ImobCrmMutationService)
    await processImobRunCompletedJob({
      runId: testRun.id,
      tenantId,
      workspaceId,
      caseId: testCase.id,
      actionId: "owner.register",
      eventRunId: testRun.id,
    });

    // Verificar estado no DB (I1: status decidido exclusivamente no backend)
    const after = await getCaseFromDb(testCase.id);
    assert.ok(after, "case deve existir após o worker");
    assert.equal(after.stage, "property_collecting", "stage deve ser property_collecting após owner.register");
    assert.equal(after.status, "ready_for_review", "status deve ser ready_for_review após owner.register");
    assert.equal(after.nextStep, "Cadastrar o imóvel do proprietário para avançar a captação");

    // Verificar que pendingItems anteriores foram removidos
    const pendingItems = (after.pendingItems as string[]) ?? [];
    assert.ok(
      !pendingItems.some((item) => item.toLowerCase().includes("proprietário pendente")),
      "pendingItem 'Proprietário pendente de cadastro' deve ter sido removido",
    );

    // Verificar ImobCaseEvent criado (I2: event vincula run ao case)
    const events = await getCaseEvents(testCase.id, "case.action.completed");
    assert.equal(events.length, 1, "exatamente 1 evento case.action.completed deve existir");
    assert.equal(events[0].runId, testRun.id, "eventRunId deve referenciar o run");
    assert.equal(events[0].actorType, "system");

    const payload = events[0].payload as Record<string, unknown>;
    assert.equal(payload.actionId, "owner.register");
    assert.equal(payload.receiptPath, `/api/ledger/${encodeURIComponent(testRun.txId ?? "")}`);
    assert.equal(payload.bundlePath, `/api/runs/${encodeURIComponent(testRun.id)}/bundle`);

    // Verificar canonical recalculado (I2: canonical baseia-se no estado atualizado)
    const canonical = buildImobCanonicalCase({
      flow: after.flow,
      stage: after.stage,
      status: after.status,
      ownerResponsible: after.ownerResponsible ?? null,
      nextStep: after.nextStep ?? null,
      blockers: (after.blockers as string[]) ?? [],
      pendingItems: (after.pendingItems as string[]) ?? [],
      owner: null,
      property: null,
      lead: null,
    });
    assert.ok(canonical.journeyType, "canonical deve ter journeyType");
    assert.equal(canonical.journeyType, "property_capture", "journeyType deve ser property_capture para owner.create flow");

    // I3: CC lê novo estado via API (sem lógica React)
    const dossierAfter = await request
      .get(`/api/imob/cases/${testCase.id}/dossier`)
      .set("Authorization", `Bearer ${apiToken}`);
    assert.equal(dossierAfter.status, 200, `dossier após: status esperado 200, recebido ${dossierAfter.status}`);
    assert.equal(dossierAfter.body?.data?.case?.stage, "property_collecting");
    assert.equal(dossierAfter.body?.data?.case?.status, "ready_for_review");
    assert.ok(dossierAfter.body?.data?.case?.canonical, "dossier deve incluir canonical recalculado");
    assert.equal(dossierAfter.body?.data?.case?.canonical?.journeyType, "property_capture");
    assert.ok(
      Array.isArray(dossierAfter.body?.data?.events) && dossierAfter.body.data.events.length > 0,
      "dossier deve listar eventos",
    );
  });
});

// ─── E2E-02: Idempotência — sem double mutation ────────────────────────────────

describe("[E2E-02] Phase 4.2 — Idempotência: segundo processamento é no-op", () => {
  it("não deveria criar segundo ImobCaseEvent quando runId já foi processado (I6)", async () => {
    const testCase = await createTestCase();
    const testRun = await createTestRun({ txId: `tx-e2e-idem-${suffix}` });

    const job = {
      runId: testRun.id,
      tenantId,
      workspaceId,
      caseId: testCase.id,
      actionId: "owner.register",
      eventRunId: testRun.id,
    };

    // Primeira execução
    await processImobRunCompletedJob(job);
    const eventsAfterFirst = await getCaseEvents(testCase.id, "case.action.completed");
    assert.equal(eventsAfterFirst.length, 1, "deve ter exatamente 1 evento após primeira execução");

    const stateAfterFirst = await getCaseFromDb(testCase.id);
    assert.equal(stateAfterFirst?.stage, "property_collecting");

    // Segunda execução — deve ser no-op
    await processImobRunCompletedJob(job);
    const eventsAfterSecond = await getCaseEvents(testCase.id, "case.action.completed");
    assert.equal(eventsAfterSecond.length, 1, "ainda deve ter exatamente 1 evento após segunda execução");

    const stateAfterSecond = await getCaseFromDb(testCase.id);
    assert.equal(stateAfterSecond?.stage, "property_collecting", "stage não deve mudar na segunda execução");
    assert.equal(stateAfterSecond?.status, "ready_for_review", "status não deve mudar na segunda execução");
  });
});

// ─── E2E-03: simulated=true → nunca muta ─────────────────────────────────────

describe("[E2E-03] Phase 4.2 — Simulated: run simulado não muta ImobCase (I4)", () => {
  it("não deveria mutar case quando run.response.outputs[].data.simulated=true", async () => {
    const testCase = await createTestCase();
    const simulatedRun = await createTestRun({
      txId: `tx-e2e-sim-${suffix}`,
      response: {
        outputs: [
          {
            stepId: "step-1",
            data: {
              ok: true,
              simulated: true,
              action: "realestate.register_property",
              status: "success",
            },
          },
        ],
      },
    });

    const initialState = await getCaseFromDb(testCase.id);
    assert.equal(initialState?.stage, "intake");

    await processImobRunCompletedJob({
      runId: simulatedRun.id,
      tenantId,
      workspaceId,
      caseId: testCase.id,
      actionId: "owner.register",
      eventRunId: simulatedRun.id,
    });

    const stateAfter = await getCaseFromDb(testCase.id);
    assert.equal(stateAfter?.stage, "intake", "stage NÃO deve mudar para run simulado");
    assert.equal(stateAfter?.status, "pending_data", "status NÃO deve mudar para run simulado");

    const events = await getCaseEvents(testCase.id, "case.action.completed");
    assert.equal(events.length, 0, "nenhum ImobCaseEvent deve ser criado para run simulado");
  });
});

// ─── E2E-04: run.status=error → nunca muta ────────────────────────────────────

describe("[E2E-04] Phase 4.2 — Run error: run com status=error não muta ImobCase (I5)", () => {
  it("não deveria mutar case quando run.status=error", async () => {
    const testCase = await createTestCase();
    const failedRun = await createTestRun({
      status: "error",
      txId: null,
    });

    await processImobRunCompletedJob({
      runId: failedRun.id,
      tenantId,
      workspaceId,
      caseId: testCase.id,
      actionId: "owner.register",
      eventRunId: failedRun.id,
    });

    const stateAfter = await getCaseFromDb(testCase.id);
    assert.equal(stateAfter?.stage, "intake", "stage NÃO deve mudar para run com error");
    assert.equal(stateAfter?.status, "pending_data", "status NÃO deve mudar para run com error");

    // Worker registra caso.action.failed mas não cria case.action.completed
    const completedEvents = await getCaseEvents(testCase.id, "case.action.completed");
    assert.equal(completedEvents.length, 0, "nenhum caso.action.completed deve ser criado para run com error");
  });
});

// ─── E2E-05: cross-workspace → nunca muta ─────────────────────────────────────

describe("[E2E-05] Phase 4.2 — Cross-workspace: job com workspaceId errado não muta ImobCase (I7)", () => {
  it("não deveria mutar case quando job.workspaceId não corresponde ao workspace do run", async () => {
    const testCase = await createTestCase();
    const testRun = await createTestRun({ txId: `tx-e2e-xws-${suffix}` });

    // Job aponta para workspaceIdB, mas run foi criado em workspaceId (A)
    // getRun({id: run.id, tenantId, workspaceId: workspaceIdB}) → null
    await processImobRunCompletedJob({
      runId: testRun.id,
      tenantId,
      workspaceId: workspaceIdB,   // workspace errado
      caseId: testCase.id,
      actionId: "owner.register",
      eventRunId: testRun.id,
    });

    const stateAfter = await getCaseFromDb(testCase.id);
    assert.equal(stateAfter?.stage, "intake", "stage NÃO deve mudar para cross-workspace");
    assert.equal(stateAfter?.status, "pending_data", "status NÃO deve mudar para cross-workspace");
  });
});

// ─── E2E-06: commission.settle — terminal ─────────────────────────────────────

describe("[E2E-06] Phase 4.2 — Terminal: commission.settle fecha caso com stage=done (I1/I2)", () => {
  it("deveria setar stage=done, status=done e limpar pendingItems/blockers", async () => {
    const testCase = await createTestCase({
      flow: "commission.settle",
      stage: "commission_review",
      status: "ready_for_review",
      ownerResponsible: "Carlos Mendes",
      pendingItems: ["Assinatura do contrato pelas partes pendente"],
      blockers: [],
      nextStep: "Aguardar assinatura do contrato",
    });

    const testRun = await createTestRun({ txId: `tx-e2e-com-${suffix}` });

    await processImobRunCompletedJob({
      runId: testRun.id,
      tenantId,
      workspaceId,
      caseId: testCase.id,
      actionId: "commission.settle",
      eventRunId: testRun.id,
    });

    const stateAfter = await getCaseFromDb(testCase.id);
    assert.ok(stateAfter, "case deve existir após o worker terminal");
    assert.equal(stateAfter.stage, "done", "stage deve ser done após commission.settle");
    assert.equal(stateAfter.status, "done", "status deve ser done após commission.settle");
    assert.equal(stateAfter.nextStep, null, "nextStep deve ser null no estado terminal");
    assert.deepEqual(stateAfter.pendingItems, [], "pendingItems deve estar vazio no estado terminal");
    assert.deepEqual(stateAfter.blockers, [], "blockers deve estar vazio no estado terminal");

    // Deve ter evento case.action.completed
    const completedEvents = await getCaseEvents(testCase.id, "case.action.completed");
    assert.equal(completedEvents.length, 1, "deve ter 1 evento case.action.completed");
    assert.equal(completedEvents[0].runId, testRun.id);

    // Deve ter evento case.completed (terminal event criado pelo ImobCrmMutationService)
    const terminalEvents = await getCaseEvents(testCase.id, "case.completed");
    assert.equal(terminalEvents.length, 1, "deve ter 1 evento case.completed para estado terminal");

    // I3: CC vê estado terminal via API
    const dossierTerminal = await request
      .get(`/api/imob/cases/${testCase.id}/dossier`)
      .set("Authorization", `Bearer ${apiToken}`);
    assert.equal(dossierTerminal.status, 200);
    assert.equal(dossierTerminal.body?.data?.case?.stage, "done");
    assert.equal(dossierTerminal.body?.data?.case?.status, "done");
    assert.ok(
      Array.isArray(dossierTerminal.body?.data?.case?.pendingItems)
        && dossierTerminal.body.data.case.pendingItems.length === 0,
      "pendingItems deve estar vazio no dossier terminal",
    );
  });

  it("NÃO deveria mutar caso sem ownerResponsible em commission.settle", async () => {
    const testCase = await createTestCase({
      flow: "commission.settle",
      stage: "commission_review",
      status: "ready_for_review",
      ownerResponsible: null,  // sem responsável
      nextStep: "Definir responsável antes de liquidar comissão",
    });

    const testRun = await createTestRun({ txId: `tx-e2e-com-no-owner-${suffix}` });

    await processImobRunCompletedJob({
      runId: testRun.id,
      tenantId,
      workspaceId,
      caseId: testCase.id,
      actionId: "commission.settle",
      eventRunId: testRun.id,
    });

    const stateAfter = await getCaseFromDb(testCase.id);
    assert.equal(stateAfter?.stage, "commission_review", "stage NÃO deve mudar sem ownerResponsible");
    assert.equal(stateAfter?.status, "ready_for_review", "status NÃO deve mudar sem ownerResponsible");

    const completedEvents = await getCaseEvents(testCase.id, "case.action.completed");
    assert.equal(completedEvents.length, 0, "nenhum case.action.completed sem ownerResponsible");
  });
});

// ─── E2E-07: leadqualify (requiresTxId=false) sem txId ────────────────────────

describe("[E2E-07] Phase 4.2 — lead.qualify sem txId: deve mutar (requiresTxId=false)", () => {
  it("deveria mutar case para lead.qualify mesmo quando txId=null", async () => {
    const testCase = await createTestCase({
      flow: "lead.qualify",
      stage: "intake",
      status: "pending_data",
    });

    const testRun = await createTestRun({ txId: null });  // sem txId

    await processImobRunCompletedJob({
      runId: testRun.id,
      tenantId,
      workspaceId,
      caseId: testCase.id,
      actionId: "lead.qualify",
      eventRunId: testRun.id,
    });

    const stateAfter = await getCaseFromDb(testCase.id);
    assert.equal(stateAfter?.stage, "visit_scheduling", "lead.qualify deve avançar para visit_scheduling");
    assert.equal(stateAfter?.status, "ready_for_review", "status deve ser ready_for_review após lead.qualify");
  });
});

// ─── E2E-08: requiresTxId=true sem txId → bloqueia ───────────────────────────

describe("[E2E-08] Phase 4.2 — owner.register sem txId: bloqueia (requiresTxId=true)", () => {
  it("não deveria mutar case para owner.register quando txId=null", async () => {
    const testCase = await createTestCase();
    const testRun = await createTestRun({ txId: null });  // sem txId

    await processImobRunCompletedJob({
      runId: testRun.id,
      tenantId,
      workspaceId,
      caseId: testCase.id,
      actionId: "owner.register",
      eventRunId: testRun.id,
    });

    const stateAfter = await getCaseFromDb(testCase.id);
    assert.equal(stateAfter?.stage, "intake", "stage NÃO deve mudar sem txId para ação HIGH tier");
    assert.equal(stateAfter?.status, "pending_data", "status NÃO deve mudar sem txId para ação HIGH tier");

    const completedEvents = await getCaseEvents(testCase.id, "case.action.completed");
    assert.equal(completedEvents.length, 0, "nenhum case.action.completed sem txId para HIGH tier");
  });
});
