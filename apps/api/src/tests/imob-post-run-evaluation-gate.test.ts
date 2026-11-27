import "./support/testInfraEnv.js";
import assert from "node:assert/strict";
import test from "node:test";

import { processImobRunCompletedJob, type ImobWorkerDeps } from "../workers/imobPostRunMutationWorker.js";
import type { ImobRunCompletedJobPayload } from "../queues/imobRunCompletedQueue.js";

/**
 * Efeito DIFERIDO após o fim da avaliação: o run foi aceito antes da validade, mas o worker escreve depois. O gate é injetado
 * (dublê); a leitura real do grant é coberta pelos testes puros e de serviço. Não prova a fila real (Redis) nem o banco.
 */

const job = (over: Partial<ImobRunCompletedJobPayload> = {}): ImobRunCompletedJobPayload => ({
  runId: "run-1", tenantId: "t-1", workspaceId: "w-1", caseId: "case-1", actionId: "owner.register", eventRunId: "run-1", receiptPath: null, bundlePath: null, ...over,
});

function harness(gate: { applies: boolean; allowed: boolean; usage: "full" | "read_only" | "blocked" }) {
  const calls = { getRun: 0, updateCase: 0, intakePolicy: 0, events: [] as Array<Record<string, unknown>>, gate: 0 };
  const prisma = {
    imobCaseEvent: { create: async ({ data }: { data: Record<string, unknown> }) => { calls.events.push(data); return data; }, findFirst: async () => null },
    imobCase: { findFirst: async () => null },
  };
  const deps = {
    getRunFn: async () => { calls.getRun += 1; return null; },
    prisma,
    mutationServiceFactory: () => ({ updateCase: async () => { calls.updateCase += 1; return { ok: false, reason: "not_found" }; } }),
    resolveIntakeRuntimePolicyFn: async () => { calls.intakePolicy += 1; return { enabled: false, reasonCode: "X", blockingCondition: "x" }; },
    evaluationGrantGateFn: async () => { calls.gate += 1; return gate; },
  } as unknown as Partial<ImobWorkerDeps>;
  return { calls, deps };
}

test("avaliação encerrada: o worker não muta, registra o bloqueio e conclui o job (sem retry)", async () => {
  for (const gate of [
    { applies: true, allowed: false, usage: "blocked" as const },
    { applies: true, allowed: false, usage: "read_only" as const },
  ]) {
    const { calls, deps } = harness(gate);
    await processImobRunCompletedJob(job(), deps);
    assert.equal(calls.gate, 1);
    assert.equal(calls.getRun, 0, "nem busca o run");
    assert.equal(calls.updateCase, 0, "nenhuma mutação");
    assert.equal(calls.events.length, 1);
    assert.equal(calls.events[0]!.type, "case.action.blocked");
    assert.equal((calls.events[0]!.payload as Record<string, unknown>).evaluationGate, "access_not_active");
  }
});

test("avaliação encerrada bloqueia também o ramo de intake (criação de caso)", async () => {
  const { calls, deps } = harness({ applies: true, allowed: false, usage: "blocked" });
  await processImobRunCompletedJob(job({ actionId: "imob.contract.intake" }), deps);
  assert.equal(calls.intakePolicy, 0, "a checagem precede o ramo de intake");
  assert.equal(calls.updateCase, 0);
});

test("sem grant de avaliação ou com grant ativo: comportamento legado (o fluxo segue até buscar o run)", async () => {
  for (const gate of [
    { applies: false, allowed: true, usage: "full" as const },
    { applies: true, allowed: true, usage: "full" as const },
  ]) {
    const { calls, deps } = harness(gate);
    await processImobRunCompletedJob(job(), deps);
    assert.equal(calls.getRun, 1, "segue para o run");
    assert.equal(calls.events.filter((event) => event.type === "case.action.blocked" && (event.payload as Record<string, unknown>)?.evaluationGate).length, 0);
  }
});
