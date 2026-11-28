import test from "node:test";
import assert from "node:assert/strict";
import {
  cancelOutcomeOfStatus,
  createRunTracking,
  credentialOf,
  describeAbandonResult,
  describeCancelOutcome,
  describeRunSettlement,
  readPersistedTracking,
  reasonCodeOfRun,
  sameCredential,
  RUN_TRACKING_TIMEOUT_MS,
  terminalOfEvent,
  terminalOfRunStatus,
} from "./runLifecycle";

// Ciclo de vida de uma run no Front Door (puro): estados terminais reais, idempotência, contexto, cancelamento e timeout.
// Sintético: nenhum servidor, nenhuma rede.

const event = (type: string, over: Record<string, unknown> = {}) => ({ id: `e-${type}-${Math.random()}`, runId: "run-1", type, ...over });

test("estados terminais reais: conclusão, falha, cancelamento e bloqueio; o resto é progresso", () => {
  assert.equal(terminalOfEvent("run.completed"), "completed");
  assert.equal(terminalOfEvent("run.failed"), "failed");
  assert.equal(terminalOfEvent("run.cancelled"), "cancelled");
  // Bloqueio por governança NÃO é terminal pelo nome do evento (ver os testes de governança abaixo).
  assert.equal(terminalOfEvent("run.blocked.guardrails"), null);
  assert.equal(terminalOfEvent("run.trustscore.blocked"), null);
  for (const progress of ["run.enqueued", "run.started", "run.orchestrator.finished", "run.cancel_requested", "run.action.result", "run.step.completed"]) {
    assert.equal(terminalOfEvent(progress), null, `${progress} não é terminal (cancel_requested é só o pedido)`);
  }
});

test("estado terminal pelo status persistido: rede de segurança quando o evento terminal não chegou", () => {
  assert.equal(terminalOfRunStatus({ status: "success" }), "completed");
  assert.equal(terminalOfRunStatus({ status: "error" }), "failed");
  assert.equal(terminalOfRunStatus({ status: "blocked", errorCode: "USER_CANCELLED" }), "cancelled");
  assert.equal(terminalOfRunStatus({ status: "blocked", errorCode: "TRUST_SCORE_BLOCKED" }), "blocked");
  assert.equal(terminalOfRunStatus({ status: "running" }), null);
  assert.equal(terminalOfRunStatus({ status: "pending" }), null);
  assert.equal(terminalOfRunStatus(null), null);
});

test("encerra uma única vez e é idempotente: eventos duplicados ou tardios depois do término são ignorados", () => {
  const tracking = createRunTracking({ runId: "run-1", contextId: "ctx-a" });
  assert.deepEqual(tracking.accept(event("run.started"), "ctx-a"), { action: "progress" });
  const done = tracking.accept(event("run.completed"), "ctx-a");
  assert.deepEqual(done, { action: "settle", terminal: "completed", reasonCode: null });
  assert.equal(tracking.settle("completed"), true);
  assert.equal(tracking.settle("failed"), false, "um segundo desfecho não sobrescreve o primeiro");
  assert.equal(tracking.settlement, "completed");
  assert.deepEqual(tracking.accept(event("run.completed"), "ctx-a"), { action: "ignore", reason: "already_settled" }, "duplicado");
  assert.deepEqual(tracking.accept(event("run.failed"), "ctx-a"), { action: "ignore", reason: "already_settled" }, "tardio e contraditório");
});

test("falha, cancelamento e bloqueio encerram o acompanhamento e levam só código estruturado, nunca mensagem livre do servidor", () => {
  const failed = createRunTracking({ runId: "run-1", contextId: "c" }).accept(event("run.failed", { payload: { status: "error", message: "stack: senha=segredo em /srv/app", errorCode: "AGENT_NOT_FOUND" } }), "c");
  assert.deepEqual(failed, { action: "settle", terminal: "failed", reasonCode: "AGENT_NOT_FOUND" });
  const text = describeRunSettlement("failed", { cancelRequested: false, reasonCode: "AGENT_NOT_FOUND" });
  assert.match(text ?? "", /A execução falhou e nenhum resultado foi concluído \(código: AGENT_NOT_FOUND\)/);
  assert.equal((text ?? "").includes("segredo"), false);
  const free = createRunTracking({ runId: "run-1", contextId: "c" }).accept(event("run.failed", { payload: { message: "algo interno" } }), "c");
  assert.deepEqual(free, { action: "settle", terminal: "failed", reasonCode: null });
  const weird = createRunTracking({ runId: "run-1", contextId: "c" }).accept(event("run.failed", { payload: { errorCode: "tem espaço e detalhe interno" } }), "c");
  assert.deepEqual(weird, { action: "settle", terminal: "failed", reasonCode: null }, "código fora do formato é descartado");
  assert.deepEqual(createRunTracking({ runId: "run-1", contextId: "c" }).accept(event("run.cancelled"), "c"), { action: "settle", terminal: "cancelled", reasonCode: null });
  assert.match(describeRunSettlement("blocked", { cancelRequested: false }) ?? "", /bloqueada pelas regras de governança/);
});

test("eventos de outra run e de outro contexto são descartados (troca de conversa, usuário, workspace ou agente)", () => {
  const tracking = createRunTracking({ runId: "run-1", contextId: "ctx-a" });
  assert.deepEqual(tracking.accept(event("run.completed", { runId: "run-OUTRA" }), "ctx-a"), { action: "ignore", reason: "other_run" });
  assert.deepEqual(tracking.accept(event("run.completed"), "ctx-b"), { action: "ignore", reason: "stale_context" });
  assert.equal(tracking.settlement, null, "descartar não encerra nem conclui nada");
  assert.deepEqual(tracking.accept(event("run.completed"), "ctx-a"), { action: "settle", terminal: "completed", reasonCode: null }, "no contexto certo a run ainda conclui");
});

test("cancelamento: pedido enviado não é cancelamento confirmado; só o estado do servidor confirma; concluir antes é dito", () => {
  const tracking = createRunTracking({ runId: "run-1", contextId: "c" });
  tracking.markCancelRequested();
  assert.equal(tracking.cancelRequested, true);
  assert.equal(tracking.settlement, null, "pedir não encerra");
  assert.match(describeCancelOutcome("sent"), /Só considero a execução cancelada quando o servidor confirmar/);
  assert.match(describeCancelOutcome("sent"), /não é desfeito/);
  assert.match(describeRunSettlement("cancelled", { cancelRequested: true }) ?? "", /servidor confirmou o cancelamento/);
  assert.equal(describeRunSettlement("cancelled", { cancelRequested: false }), "A execução foi cancelada.");
  assert.match(describeRunSettlement("completed", { cancelRequested: true }) ?? "", /terminou antes de o cancelamento ser aplicado/);
  assert.equal(describeRunSettlement("completed", { cancelRequested: false }), null, "conclusão sem cancelamento: o resultado aparece pelo resumo, sem mensagem extra");
  assert.match(describeCancelOutcome("already_finished"), /já tinha terminado/);
  assert.match(describeCancelOutcome("failed"), /A execução continua/);
  tracking.clearCancelRequested();
  assert.equal(tracking.cancelRequested, false, "pedido que falhou pode ser repetido");
  assert.equal(cancelOutcomeOfStatus(200), "sent");
  assert.equal(cancelOutcomeOfStatus(202), "sent");
  assert.equal(cancelOutcomeOfStatus(409), "already_finished");
  assert.equal(cancelOutcomeOfStatus(500), "failed");
  assert.equal(cancelOutcomeOfStatus(null), "failed");
});

test("timeout e interrupção local não dizem que a execução foi cancelada no servidor", () => {
  assert.ok(RUN_TRACKING_TIMEOUT_MS > 0);
  for (const settlement of ["timed_out", "interrupted_locally"] as const) {
    const text = describeRunSettlement(settlement, { cancelRequested: false }) ?? "";
    assert.match(text, /pode continuar no servidor/, settlement);
    assert.match(text, /não foi cancelada/, settlement);
    assert.equal(/foi cancelad[ao] com sucesso|cancelamento confirmado/i.test(text), false, settlement);
  }
  const tracking = createRunTracking({ runId: "run-1", contextId: "c" });
  assert.equal(tracking.settle("timed_out"), true);
  assert.deepEqual(tracking.accept(event("run.completed"), "c"), { action: "ignore", reason: "already_settled" }, "depois de parar de aguardar, o resultado tardio não reabre a espera");
});

test("retomada após recarregar: só dados mínimos e válidos são aceitos", () => {
  assert.deepEqual(readPersistedTracking({ runId: "run-1", startedAt: 1700000000000 }), { runId: "run-1", startedAt: 1700000000000 });
  for (const bad of [null, undefined, "x", {}, { runId: "", startedAt: 1 }, { runId: "r", startedAt: "1" }, { runId: "r", startedAt: Number.NaN }, { runId: 3, startedAt: 1 }]) {
    assert.equal(readPersistedTracking(bad), null);
  }
});

// Semântica comprovada nos emissores: `run.blocked.guardrails` também sai em modo permissivo (`override: true`, a run continua) e só termina bloqueada
// com `override: false`, que o worker finaliza como `blocked`/GUARDRAILS_BLOCKED; `run.trustscore.blocked` vem com o 403 de uma run já bloqueada.
test("governança: evento permissivo é progresso; sem override pede confirmação pelo estado persistido; nunca encerra pelo nome", () => {
  const tracking = createRunTracking({ runId: "run-1", contextId: "c" });
  assert.deepEqual(tracking.accept(event("run.blocked.guardrails", { payload: { reason: "x", mode: "warn", override: true } }), "c"), { action: "progress" }, "modo permissivo: a execução prossegue");
  assert.deepEqual(tracking.accept(event("run.blocked.guardrails", { payload: { reason: "x", mode: "block", override: false } }), "c"), { action: "verify_status" });
  assert.deepEqual(tracking.accept(event("run.blocked.guardrails", { payload: { reasonCodes: ["RISK_THRESHOLD_EXCEEDED"] } }), "c"), { action: "verify_status" }, "sem override: não presume");
  assert.deepEqual(tracking.accept(event("run.trustscore.blocked", { payload: { score: 10 } }), "c"), { action: "verify_status" });
  assert.equal(tracking.settlement, null, "nenhum desses eventos encerrou o acompanhamento");
  assert.deepEqual(tracking.accept(event("run.completed"), "c"), { action: "settle", terminal: "completed", reasonCode: null }, "a run permissiva ainda conclui normalmente");
});

test("governança: o estado persistido bloqueado confirma o desfecho, com código estruturado e explicação de que não continua sozinha", () => {
  assert.equal(terminalOfRunStatus({ status: "blocked", errorCode: "GUARDRAILS_BLOCKED" }), "blocked");
  assert.equal(reasonCodeOfRun({ errorCode: "GUARDRAILS_BLOCKED" }), "GUARDRAILS_BLOCKED");
  assert.equal(reasonCodeOfRun({ errorCode: "texto livre com espaço e detalhe" }), null);
  assert.equal(reasonCodeOfRun(null), null);
  const text = describeRunSettlement("blocked", { cancelRequested: false, reasonCode: "GUARDRAILS_BLOCKED" }) ?? "";
  assert.match(text, /bloqueada pelas regras de governança e não foi concluída \(código: GUARDRAILS_BLOCKED\)/);
  assert.match(text, /Ela não continua sozinha/);
  assert.match(text, /dependem de uma pessoa autorizada/);
});

test("credencial: igualdade exata sem hash do token; hidratação do usuário não é troca; troca de usuário, sessão, tenant ou workspace é", () => {
  const base = credentialOf({ token: "tok-A", tenantId: "t1", workspaceId: "w1", userId: "u1" });
  assert.equal(sameCredential(base, credentialOf({ token: "tok-A", tenantId: "t1", workspaceId: "w1", userId: "u1" })), true);
  assert.equal(sameCredential(credentialOf({ token: "tok-A", tenantId: "t1", workspaceId: "w1" }), base), true, "usuário ausente → definido: hidratação");
  assert.equal(sameCredential(base, credentialOf({ token: "tok-A", tenantId: "t1", workspaceId: "w1" })), false, "definido → ausente: logout/remoção");
  for (const other of [{ token: "tok-B" }, { tenantId: "t2" }, { workspaceId: "w2" }, { userId: "u2" }, { token: null }]) {
    assert.equal(sameCredential(base, credentialOf({ token: "tok-A", tenantId: "t1", workspaceId: "w1", userId: "u1", ...other })), false, JSON.stringify(Object.keys(other)));
  }
  assert.equal(JSON.stringify(createRunTracking({ runId: "r", contextId: "c", credential: base })).includes("tok-A"), false, "o token não aparece em nenhuma serialização do acompanhamento");
});

// Este teste comprova a CORRESPONDÊNCIA com a credencial capturada (política desta interface), não a autorização do servidor, que é por tenant/workspace.
test("pedido de cancelamento desta interface: só com a credencial capturada na criação; sem credencial conhecida a run é só acompanhada", () => {
  const captured = credentialOf({ token: "tok-A", tenantId: "t1", workspaceId: "w1", userId: "u1" });
  const own = createRunTracking({ runId: "r", contextId: "c", credential: captured });
  assert.equal(own.mayCancelWith(captured), true);
  assert.equal(own.mayCancelWith(credentialOf({ token: "tok-B", tenantId: "t1", workspaceId: "w1", userId: "u2" })), false, "outro usuário/sessão");
  assert.equal(own.mayCancelWith(credentialOf({ token: "tok-A", tenantId: "t1", workspaceId: "w9", userId: "u1" })), false, "outro workspace");
  assert.equal(createRunTracking({ runId: "r", contextId: "c" }).mayCancelWith(captured), false, "sem credencial conhecida: só acompanhar");
});

test("abandono: cada desfecho é dito como é; descarte local não anuncia nada", () => {
  assert.match(describeAbandonResult("cancel_accepted") ?? "", /o servidor aceitou o pedido/);
  assert.match(describeAbandonResult("cancel_accepted") ?? "", /Só vale como cancelada quando o servidor confirmar/);
  assert.match(describeAbandonResult("cancel_failed") ?? "", /o pedido falhou/);
  assert.match(describeAbandonResult("cancel_failed") ?? "", /pode continuar no servidor/);
  assert.match(describeAbandonResult("cancel_already_finished") ?? "", /já tinha terminado; nada foi cancelado/);
  assert.equal(describeAbandonResult("discarded_locally"), null);
});
