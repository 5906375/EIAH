import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import express from "express";
import supertest from "supertest";
import { LOGISTICA_CONTEXT_SCOPE, ORACULO_CONTENT_REVIEW_SCOPE, ORACULO_PREPARATION_WRITE_SCOPE } from "@eiah/contracts";
import { prismaGlobal } from "@repo/db";

import { chatVerticalsRouter } from "../routes/chatVerticals";
import { oraculoPreparationRouter } from "../routes/oraculoPreparation";
import { verticalAccessRouter } from "../routes/verticalAccess";
import { ensureVerticalAccessStore } from "../services/products/verticalAccessApproval";
import { ensureLogisticaMember, logisticaOperator, logisticaOwner } from "./support/logisticaMemberFixture";

// EIAH-FD-E2E-004 (J17) — decisão humana do caso, lado servidor (HTTP real + PostgreSQL descartável, dados sintéticos). A solicitação é um
// evento do próprio registro versionado do caso (sem tabela/fila); a decisão exige membro ativo ≠ solicitante com a política exata do
// workspace (FIXTURE do banco descartável, nunca concessão real) e a base atual do caso. Nada aqui autoriza execução.
function assertDedicatedLocalDatabase() {
  let url: URL;
  try { url = new URL(process.env.DATABASE_URL ?? "postgresql://unused/unused"); }
  catch { throw new Error("Dedicated local logistics database required"); }
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || !url.pathname.startsWith("/eiah_logistica_core_")) {
    throw new Error("Dedicated local eiah_logistica_core_ database required");
  }
}
assertDedicatedLocalDatabase();

const id = randomUUID();
const tenant1 = `hd-t1-${id}`, tenant2 = `hd-t2-${id}`;
const wsA = `hd-a-${id}`, wsB = `hd-b-${id}`, wsT2 = `hd-t2ws-${id}`;
const U = { ana: `ana-${id}`, bruno: `bruno-${id}`, carla: `carla-${id}`, out: `out-${id}`, admin: `admin-${id}`, b: `b-${id}`, t2: `t2-${id}` };
const tok = { ana: `s-ana-${id}`, bruno: `s-bruno-${id}`, carla: `s-carla-${id}`, outsider: `s-out-${id}`, admin: `s-adm-${id}`, adminB: `s-admb-${id}`, b: `s-b-${id}`, t2: `s-t2-${id}` };
const auth = (t: string) => `Bearer ${t}`;
const previousAdmins = process.env.EIAH_PLATFORM_ADMIN_EMAILS;
const app = express();
app.use(express.json());
app.use("/api", verticalAccessRouter, chatVerticalsRouter, oraculoPreparationRouter);
const request = supertest(app);
const base = "/api/logistica/oraculo/preparations";

async function requestAndApprove(ownerToken: string, adminToken: string, workspaceId: string) {
  assert.equal((await request.post("/api/vertical-access/request").set("Authorization", auth(ownerToken)).send({ vertical: "LOGISTICA", channel: "chat" })).status, 201);
  const rows = await prismaGlobal.$queryRaw<Array<{ id: string }>>`SELECT id FROM vertical_access_approvals WHERE tenant_id=${tenant1} AND workspace_id=${workspaceId} AND vertical='LOGISTICA'`;
  assert.equal((await request.post(`/api/admin/vertical-approvals/${rows[0]!.id}/decision`).set("Authorization", auth(adminToken)).send({ decision: "aprovar", note: "Synthetic" })).status, 200);
  const preview = await request.post("/api/chat/vertical-activation/preview").set("Authorization", auth(ownerToken)).send({ verticalId: "log" });
  assert.equal((await request.post("/api/chat/vertical-activation/confirm").set("Authorization", auth(ownerToken)).send({ verticalId: "log", registryVersion: preview.body.data.registryVersion, confirmed: true })).status, 200);
}
const grant = (workspaceId: string, actionName: string) => prismaGlobal.tenantActionPolicy.create({ data: { tenantId: tenant1, workspaceId, actionName, allowed: true } });
const setPolicy = (workspaceId: string, actionName: string, allowed: boolean) => prismaGlobal.tenantActionPolicy.updateMany({ where: { tenantId: tenant1, workspaceId, actionName }, data: { allowed } });
const countPolicies = () => prismaGlobal.tenantActionPolicy.count({ where: { tenantId: tenant1 } });
const countMemberships = () => prismaGlobal.$queryRaw<Array<{ n: number }>>`SELECT count(*)::int AS n FROM eiah_workspace_memberships WHERE tenant_id=${tenant1}`.then((rows) => rows[0]!.n);

before(async () => {
  process.env.EIAH_PLATFORM_ADMIN_EMAILS = `hd-admin-${id}@example.com`;
  await prismaGlobal.tenant.createMany({ data: [{ id: tenant1, name: "Synthetic decision" }, { id: tenant2, name: "Synthetic foreign" }] });
  await prismaGlobal.workspace.createMany({ data: [{ id: wsA, tenantId: tenant1, name: "A" }, { id: wsB, tenantId: tenant1, name: "B" }, { id: wsT2, tenantId: tenant2, name: "T2" }] });
  await prismaGlobal.user.createMany({ data: Object.entries(U).map(([key, userId]) => ({ id: userId, tenantId: key === "t2" ? tenant2 : tenant1, email: `hd-${key}-${id}@example.com` })) });
  for (const [userId, roleKey, tenantId, workspaceId] of [
    [U.ana, "founder", tenant1, wsA], [U.bruno, "corretor", tenant1, wsA], [U.carla, "corretor", tenant1, wsA], [U.admin, "corretor", tenant1, wsA],
    [U.b, "founder", tenant1, wsB], [U.admin, "corretor", tenant1, wsB],
  ] as const) await ensureLogisticaMember(prismaGlobal, { tenantId, workspaceId, userId, ...(roleKey === "founder" ? logisticaOwner() : logisticaOperator()) });
  await prismaGlobal.apiToken.createMany({ data: [
    { token: tok.ana, tenantId: tenant1, workspaceId: wsA, userId: U.ana }, { token: tok.bruno, tenantId: tenant1, workspaceId: wsA, userId: U.bruno },
    { token: tok.carla, tenantId: tenant1, workspaceId: wsA, userId: U.carla }, { token: tok.outsider, tenantId: tenant1, workspaceId: wsA, userId: U.out },
    { token: tok.admin, tenantId: tenant1, workspaceId: wsA, userId: U.admin }, { token: tok.adminB, tenantId: tenant1, workspaceId: wsB, userId: U.admin },
    { token: tok.b, tenantId: tenant1, workspaceId: wsB, userId: U.b }, { token: tok.t2, tenantId: tenant2, workspaceId: wsT2, userId: U.t2 },
  ] });
  await ensureVerticalAccessStore(prismaGlobal);
  await requestAndApprove(tok.ana, tok.admin, wsA);
  await requestAndApprove(tok.b, tok.adminB, wsB);
  // FIXTURES do banco descartável: contexto e gravação em A e B; a política de conferência/decisão só entra no meio do teste.
  for (const ws of [wsA, wsB]) { await grant(ws, LOGISTICA_CONTEXT_SCOPE); await grant(ws, ORACULO_PREPARATION_WRITE_SCOPE); }
});

after(async () => {
  if (previousAdmins === undefined) delete process.env.EIAH_PLATFORM_ADMIN_EMAILS;
  else process.env.EIAH_PLATFORM_ADMIN_EMAILS = previousAdmins;
  await prismaGlobal.$disconnect();
});

const get = (path: string, token: string) => request.get(path).set("Authorization", auth(token));
const post = (path: string, token: string, body: unknown) => request.post(path).set("Authorization", auth(token)).send(body as object);
const patch = (path: string, token: string, body: unknown) => request.patch(path).set("Authorization", auth(token)).send(body as object);
const dispensed = (flow: string, port = "Porto Sintético Teste") => ({ context: { port: { status: "informed", value: port }, flow: { status: "not_applicable", justification: flow } } });
const record = async (caseId: string, token = tok.ana) => (await get(`${base}/${caseId}`, token)).body.data;
const view = async (caseId: string, token = tok.ana) => (await get(`${base}/${caseId}/decisions`, token)).body.data;
const edit = async (caseId: string, body: Record<string, unknown>, token = tok.ana) => {
  const res = await patch(`${base}/${caseId}`, token, { ...body, expectedRevision: (await record(caseId)).revision });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.data;
};
// revisão atual vista por quem chama; sem acesso (negativos), usa a de Ana só para montar um pedido bem formado
const revisionFor = async (caseId: string, token: string) => (await record(caseId, token))?.revision ?? (await record(caseId)).revision;
const requestDecision = async (caseId: string, token = tok.ana, note?: string) =>
  post(`${base}/${caseId}/decision-requests`, token, { expectedRevision: await revisionFor(caseId, token), ...(note ? { note } : {}) });
const decide = async (caseId: string, requestId: string, token: string, over: Record<string, unknown> = {}) =>
  post(`${base}/${caseId}/decisions`, token, { requestId, expectedRevision: await revisionFor(caseId, token), decision: "approved", note: "Analisado pelo responsável", acknowledgedBasisRead: true, ...over });
const transitions = async (caseId: string) => (await prismaGlobal.governedCaseRevision.findMany({ where: { caseId }, orderBy: { revision: "asc" } })).map((row) => `${row.revision}:${row.transitionCode}:${row.actorRef === U.ana ? "ana" : row.actorRef === U.bruno ? "bruno" : row.actorRef === U.carla ? "carla" : "?"}`);
const sub = (res: { body: { error?: { subreason?: string } } }) => res.body.error?.subreason;

test("J17 — decisão humana do caso: solicitação vinculada, autoridade, base atual, duplicidade e isolamento", async (t) => {
  let caseId = ""; let requestId = "";
  const policiesBefore = () => countPolicies();

  await t.test("sem divergência/campo dispensado não há o que decidir; o pedido é recusado e nada é gravado", async () => {
    const created = await post(base, tok.ana, { context: { port: { status: "informed", value: "Porto Sintético Teste" } } });
    assert.equal(created.status, 201);
    const clean = created.body.data.caseId;
    const res = await post(`${base}/${clean}/decision-requests`, tok.ana, { expectedRevision: 1 });
    assert.equal(res.status, 409); assert.equal(sub(res), "no_decision_needed");
    const state = await view(clean);
    assert.equal(state.coverage, "no_decision_needed"); assert.deepEqual(state.requests, []); assert.equal(state.eligibility.requestAllowed, false);
    assert.equal((await record(clean)).revision, 1);
  });

  await t.test("campo dispensado = gatilho; SEM política de decisão não há responsável elegível: bloqueio explícito e nada é gravado", async () => {
    const created = await post(base, tok.ana, dispensed("Fluxo não se aplica a esta operação"));
    caseId = created.body.data.caseId;
    const state = await view(caseId);
    assert.deepEqual(state.triggers.map((trigger: { key: string }) => trigger.key), ["context:flow"]);
    assert.equal(state.coverage, "none");
    assert.equal(state.eligibility.requestAllowed, false); assert.equal(state.eligibility.requestBlockedReason, "no_eligible_decider"); assert.equal(state.eligibility.deciderAvailable, false);
    const res = await requestDecision(caseId);
    assert.equal(res.status, 409); assert.equal(sub(res), "no_eligible_decider");
    assert.equal((await record(caseId)).revision, 1); assert.equal((await record(caseId)).humanDecisions, undefined);
    assert.deepEqual(await transitions(caseId), ["1:oraculo.preparation.created:ana"]);
  });

  await t.test("com a política (fixture) e outros membros ativos: o pedido é vinculado ao caso e à revisão, vira evento do registro e não autoriza nada", async () => {
    await grant(wsA, ORACULO_CONTENT_REVIEW_SCOPE);
    const state = await view(caseId);
    assert.equal(state.eligibility.requestAllowed, true); assert.equal(state.eligibility.deciderAvailable, true);
    const stale = await post(`${base}/${caseId}/decision-requests`, tok.ana, { expectedRevision: 99 });
    assert.equal(stale.status, 409); assert.equal(stale.body.error.code, "ORACULO_PREPARATION_REVISION_CONFLICT");
    assert.equal((await post(`${base}/${caseId}/decision-requests`, tok.ana, { expectedRevision: 1, extra: true })).status, 400);
    const res = await requestDecision(caseId, tok.ana, "Fluxo dispensado: preciso de decisão");
    assert.equal(res.status, 201);
    const value = res.body.data;
    assert.equal(value.revision, 2);
    const [event] = value.humanDecisions;
    requestId = event.id;
    assert.equal(event.kind, "requested"); assert.equal(event.caseId, caseId); assert.equal(event.basedOnRevision, 1); assert.equal(event.requestedBy, U.ana);
    assert.deepEqual(event.triggers, ["context:flow"]); assert.equal(event.operationalAuthorization, false);
    assert.equal(value.executionAllowed, false); assert.equal(value.externalTransmissionAllowed, false); assert.equal(value.authorizationState, "NOT_REQUESTED");
    assert.deepEqual(await transitions(caseId), ["1:oraculo.preparation.created:ana", "2:oraculo.preparation.decision_requested:ana"]);
    const pending = await view(caseId);
    assert.equal(pending.coverage, "pending"); assert.equal(pending.requests[0].status, "pending"); assert.equal(pending.requests[0].requestedByYou, true);
    assert.equal(pending.operationalAuthorization, "not_granted");
  });

  await t.test("pedido duplicado na mesma base é recusado (409) e a revisão não muda", async () => {
    for (const token of [tok.ana, tok.bruno]) {
      const res = await requestDecision(caseId, token);
      assert.equal(res.status, 409); assert.equal(sub(res), "already_requested");
    }
    assert.equal((await record(caseId)).revision, 2);
  });

  await t.test("quem pediu não decide o próprio pedido; sem membro ativo ou sem política ninguém decide", async () => {
    const own = await decide(caseId, requestId, tok.ana);
    assert.equal(own.status, 403); assert.equal(sub(own), "decider_not_independent");
    const outsider = await decide(caseId, requestId, tok.outsider);
    assert.equal(outsider.status, 403, "token do workspace sem vínculo ativo");
    assert.equal((await get(`${base}/${caseId}/decisions`, tok.outsider)).status, 403);
    await setPolicy(wsA, ORACULO_CONTENT_REVIEW_SCOPE, false);
    const noPolicy = await decide(caseId, requestId, tok.bruno);
    assert.equal(noPolicy.status, 403); assert.equal(sub(noPolicy), "decision_policy_denied");
    assert.equal((await view(caseId, tok.bruno)).eligibility.decideAllowed, false);
    await setPolicy(wsA, ORACULO_CONTENT_REVIEW_SCOPE, true);
    assert.equal((await record(caseId)).revision, 2, "nenhuma tentativa negada gravou algo");
  });

  await t.test("payload inválido, solicitação inexistente, revisão desatualizada e tentativa de injetar autoridade", async () => {
    assert.equal((await decide(caseId, requestId, tok.bruno, { acknowledgedBasisRead: false })).status, 400);
    assert.equal((await decide(caseId, requestId, tok.bruno, { decision: "authorize_execution" })).status, 400);
    assert.equal((await decide(caseId, requestId, tok.bruno, { note: "   " })).status, 400);
    assert.equal((await decide(caseId, requestId, tok.bruno, { operationalAuthorization: true })).status, 400);
    const missing = await decide(caseId, "nao-existe", tok.bruno);
    assert.equal(missing.status, 409); assert.equal(sub(missing), "request_not_found");
    const stale = await decide(caseId, requestId, tok.bruno, { expectedRevision: 1 });
    assert.equal(stale.status, 409); assert.equal(stale.body.error.code, "ORACULO_PREPARATION_REVISION_CONFLICT");
    assert.equal((await record(caseId)).revision, 2);
  });

  await t.test("complementação solicitada: registrada com o decisor, não autoriza e fecha a solicitação (decidir de novo = 409)", async () => {
    const res = await decide(caseId, requestId, tok.bruno, { decision: "more_information", note: "Informe o fluxo real da operação" });
    assert.equal(res.status, 201);
    const value = res.body.data; const event = value.humanDecisions[1];
    assert.equal(value.revision, 3); assert.equal(event.kind, "decided"); assert.equal(event.decision, "more_information"); assert.equal(event.decidedBy, U.bruno);
    assert.equal(event.requestId, requestId); assert.equal(event.basedOnRevision, 2);
    for (const flag of ["operationalAuthorization", "executionAuthorization", "responsibilityClosure", "costClosure"]) assert.equal(event[flag], false);
    assert.equal(value.executionAllowed, false); assert.equal(value.authorizationState, "NOT_REQUESTED");
    const asAna = await view(caseId, tok.ana); const asBruno = await view(caseId, tok.bruno);
    assert.equal(asAna.requests[0].status, "more_information"); assert.equal(asAna.requests[0].decision.decidedByYou, false); assert.equal(asBruno.requests[0].decision.decidedByYou, true);
    assert.equal(asAna.coverage, "more_information");
    const again = await decide(caseId, requestId, tok.carla);
    assert.equal(again.status, 409); assert.equal(sub(again), "already_decided");
    const repeat = await requestDecision(caseId); assert.equal(repeat.status, 409); assert.equal(sub(repeat), "already_requested");
  });

  await t.test("revisão obsoleta: mudar o caso depois do pedido invalida a decisão; o pedido novo na base nova é permitido", async () => {
    await edit(caseId, dispensed("Fluxo informado pelo solicitante após a complementação", "Porto Sintético Alfa"));
    const first = await requestDecision(caseId); assert.equal(first.status, 201);
    const pendingId = first.body.data.humanDecisions.at(-1).id;
    await edit(caseId, dispensed("Fluxo alterado de novo antes da decisão", "Porto Sintético Beta"));
    const state = await view(caseId);
    assert.equal(state.requests.at(-1).status, "obsolete"); assert.equal(state.coverage, "obsolete"); assert.equal(state.eligibility.requestAllowed, true);
    const late = await decide(caseId, pendingId, tok.carla);
    assert.equal(late.status, 409); assert.equal(sub(late), "request_obsolete");
    const second = await requestDecision(caseId); assert.equal(second.status, 201);
    const secondId = second.body.data.humanDecisions.at(-1).id;
    assert.notEqual(secondId, pendingId);
    // rejeição: decidida, registrada, sem autorização; Ana vê o resultado
    const rejected = await decide(caseId, secondId, tok.carla, { decision: "rejected", note: "Divergência não aceita" });
    assert.equal(rejected.status, 201);
    const asAna = await view(caseId);
    assert.equal(asAna.requests.at(-1).status, "rejected"); assert.equal(asAna.coverage, "rejected");
    assert.equal(asAna.requests.at(-1).decision.note, "Divergência não aceita");
    // a decisão antiga não cobre a base nova depois de nova edição
    await edit(caseId, dispensed("Fluxo corrigido após a rejeição", "Porto Sintético Gama"));
    const edited = await view(caseId);
    assert.equal(edited.requests.at(-1).status, "rejected"); assert.equal(edited.requests.at(-1).basisCurrent, false); assert.equal(edited.coverage, "none");
  });

  await t.test("aprovação: registrada, histórica na linha de revisões e ainda sem autorizar execução, aceite ou transmissão", async () => {
    const req = await requestDecision(caseId); assert.equal(req.status, 201);
    const approvalId = req.body.data.humanDecisions.at(-1).id;
    const ok = await decide(caseId, approvalId, tok.bruno, { decision: "approved", note: "Aceito como informado" });
    assert.equal(ok.status, 201);
    const value = await record(caseId);
    assert.equal(value.humanDecisions.at(-1).decision, "approved");
    assert.equal(value.executionAllowed, false); assert.equal(value.externalTransmissionAllowed, false); assert.equal(value.authorizationState, "NOT_REQUESTED");
    assert.equal((await view(caseId)).coverage, "approved");
    const history = await transitions(caseId);
    assert.ok(history.includes("2:oraculo.preparation.decision_requested:ana") && history.includes("3:oraculo.preparation.decision_recorded:bruno"));
    assert.ok(history.at(-1)!.startsWith(`${value.revision}:oraculo.preparation.decision_recorded:bruno`));
    // as revisões são apenas apendadas: cada uma recarrega íntegra (hash e escopo verificados pelo repositório)
    const revisions = await get(`${base}/${caseId}/revisions`, tok.ana);
    assert.equal(revisions.status, 200); assert.equal(revisions.body.data.items.length, value.revision);
  });

  await t.test("isolamento: outro workspace do tenant e outro tenant não leem nem decidem; nenhum dado vaza", async () => {
    await grant(wsB, ORACULO_CONTENT_REVIEW_SCOPE);
    const probe = await requestDecision(caseId); // pedido repetido só para ter um id real de solicitação
    assert.equal(probe.status, 409);
    const someRequest = (await record(caseId)).humanDecisions[0].id;
    for (const [token, label] of [[tok.b, "workspace B"], [tok.t2, "tenant estrangeiro"]] as const) {
      const attempts = [
        await get(`${base}/${caseId}/decisions`, token),
        await post(`${base}/${caseId}/decision-requests`, token, { expectedRevision: 1 }),
        await post(`${base}/${caseId}/decisions`, token, { requestId: someRequest, expectedRevision: 1, decision: "approved", note: "x", acknowledgedBasisRead: true }),
      ];
      for (const res of attempts) {
        assert.ok([403, 404].includes(res.status), `${label}: ${res.status}`);
        for (const needle of ["Porto Sintético", "Fluxo", tenant1, wsA, someRequest]) assert.equal(res.text.includes(needle), false, `${label} vazou ${needle}`);
      }
    }
    assert.equal((await record(caseId)).humanDecisions.some((event: { decidedBy?: string }) => event.decidedBy === U.b || event.decidedBy === U.t2), false);
  });

  await t.test("efeitos colaterais: nenhuma política nem vínculo criados pelos fluxos de decisão; um único caso em A", async () => {
    const before = { policies: await policiesBefore(), memberships: await countMemberships() };
    await requestDecision(caseId); await view(caseId, tok.bruno);
    assert.deepEqual({ policies: await countPolicies(), memberships: await countMemberships() }, before);
    assert.equal(await prismaGlobal.governedCase.count({ where: { tenantId: tenant1, workspaceId: wsA, caseType: "ORACULO_EMPTY_RETURN_PREPARATION_V1" } }), 2, "o caso sem gatilho e o caso da decisão");
  });
});

// ───────── FD-E2E-005 — caixa de pendências entre casos (mesmo tenant/workspace), sem ampliar autoridade ─────────
const inbox = (token: string) => get(`${base}/decision-inbox`, token);
const newCase = async (token: string, port: string) => (await post(base, token, dispensed("Fluxo não se aplica", port))).body.data.caseId as string;
const ids = (items: Array<{ caseId: string }>) => items.map((item) => item.caseId).sort();

test("FD-E2E-005 — caixa de pendências: só o que o usuário pode decidir, no seu workspace; resultado visível ao solicitante", async (t) => {
  let a1 = "", a2 = "", a3 = "", b1 = ""; let a1Req = "", a2Req = "", a3Req = "";
  const before = { policies: await countPolicies(), memberships: await countMemberships() };

  await t.test("preparação: pedidos de Ana (A1, A2), de Carla (A3) e do WS-B (B1) — A2 já decidido por Bruno", async () => {
    a1 = await newCase(tok.ana, "A1"); a2 = await newCase(tok.ana, "A2"); a3 = await newCase(tok.carla, "A3"); b1 = await newCase(tok.b, "B1");
    a1Req = (await requestDecision(a1, tok.ana)).body.data.humanDecisions[0].id;
    a2Req = (await requestDecision(a2, tok.ana, "Pedido de A2")).body.data.humanDecisions[0].id;
    a3Req = (await requestDecision(a3, tok.carla)).body.data.humanDecisions[0].id;
    const b1Req = await requestDecision(b1, tok.b); assert.equal(b1Req.status, 201, "B tem a própria política (fixture) e outro membro ativo (o admin)");
  });
  await t.test("WS-B tem a sua própria caixa: o admin de B vê B1 e jamais os casos de A", async () => {
    const adminB = (await inbox(tok.adminB)).body.data;
    assert.deepEqual(ids(adminB.awaitingYou), [b1]);
    for (const id of [a1, a2, a3]) assert.equal(JSON.stringify(adminB).includes(id), false);
  });
  await t.test("A2 é decidido por Bruno; a caixa de cada um mostra só o que lhe cabe", async () => {
    assert.equal((await decide(a2, a2Req, tok.bruno, { decision: "approved", note: "Aceito A2" })).status, 201);
    const bruno = (await inbox(tok.bruno)).body.data;
    assert.deepEqual(ids(bruno.awaitingYou).filter((id: string) => [a1, a2, a3, b1].includes(id)), [a1, a3].sort(), "Bruno decide A1 (de Ana) e A3 (de Carla); A2 já decidido; B1 é de outro workspace");
    assert.deepEqual(bruno.yours, []);
    assert.deepEqual(bruno.eligibility, { canDecide: true, reason: null });
    const carla = (await inbox(tok.carla)).body.data;
    assert.deepEqual(ids(carla.awaitingYou).filter((id: string) => [a1, a2, a3].includes(id)), [a1], "Carla não vê o próprio pedido (A3) como pendência a decidir");
    assert.deepEqual(ids(carla.yours), [a3]); assert.equal(carla.yours[0].status, "pending");
    const ana = (await inbox(tok.ana)).body.data;
    assert.deepEqual(ids(ana.awaitingYou).filter((id: string) => [a1, a2, a3].includes(id)), [a3], "Ana decide o de Carla, não os próprios");
    const mine = Object.fromEntries(ana.yours.map((item: { caseId: string }) => [item.caseId, item]));
    assert.equal(mine[a1].status, "pending"); assert.equal(mine[a2].status, "approved"); assert.equal(mine[a2].decision.note, "Aceito A2");
    assert.equal(mine[a2].basisCurrent, true); assert.equal(mine[a2].currentRevision, 3);
    assert.equal(ana.operationalAuthorization, "not_granted");
    // nenhum id de pessoa nem conteúdo de documento na caixa
    const raw = JSON.stringify({ bruno, carla, ana });
    for (const needle of [U.ana, U.bruno, U.carla, tenant1, wsA, "Porto Sintético"]) assert.equal(raw.includes(needle), false, `vazou ${needle}`);
  });
  await t.test("isolamento: WS-B não vê casos de A; outro tenant e membro sem vínculo recebem 403; B nunca lê A", async () => {
    const owner = await inbox(tok.b);
    assert.equal(owner.status, 200);
    const seen = [...owner.body.data.awaitingYou, ...owner.body.data.yours].map((item: { caseId: string }) => item.caseId);
    for (const id of [a1, a2, a3]) assert.equal(seen.includes(id), false, "caso de A na caixa de B");
    assert.equal(JSON.stringify(owner.body).includes(tenant2), false);
    assert.equal((await inbox(tok.t2)).status, 403);
    assert.equal((await inbox(tok.outsider)).status, 403);
  });
  await t.test("política de decisão ausente: ninguém é apresentado como decisor; os pedidos próprios continuam visíveis", async () => {
    await setPolicy(wsA, ORACULO_CONTENT_REVIEW_SCOPE, false);
    try {
      const bruno = (await inbox(tok.bruno)).body.data;
      assert.deepEqual(bruno.awaitingYou, []); assert.deepEqual(bruno.eligibility, { canDecide: false, reason: "policy_absent" });
      assert.deepEqual(ids((await inbox(tok.ana)).body.data.yours).includes(a1), true);
    } finally { await setPolicy(wsA, ORACULO_CONTENT_REVIEW_SCOPE, true); }
  });
  await t.test("sem designação (fora de dev/test): a política sozinha não vira autoridade — caixa vazia, decisão negada, pedido bloqueado", async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const bruno = (await inbox(tok.bruno)).body.data;
      assert.deepEqual(bruno.awaitingYou, []); assert.deepEqual(bruno.eligibility, { canDecide: false, reason: "not_designated" });
      const denied = await decide(a1, a1Req, tok.bruno);
      assert.equal(denied.status, 403); assert.equal(sub(denied), "decision_not_designated");
      const fresh = await newCase(tok.ana, "A4");
      const blockedRequest = await requestDecision(fresh, tok.ana);
      assert.equal(blockedRequest.status, 409); assert.equal(sub(blockedRequest), "no_eligible_decider");
      const state = await view(a1, tok.bruno);
      assert.equal(state.eligibility.decideAllowed, false); assert.equal(state.eligibility.decideBlockedReason, "not_designated");
    } finally { process.env.NODE_ENV = previous; }
    assert.equal((await record(a1)).humanDecisions.length, 1, "nenhuma tentativa negada gravou algo");
    assert.equal((await inbox(tok.bruno)).body.data.eligibility.canDecide, true, "restabelecido o ambiente de teste");
  });
  await t.test("revisão obsoleta: ao mudar A1 o pedido sai da caixa de quem decide e aparece como obsoleto para quem pediu", async () => {
    await edit(a1, dispensed("Fluxo alterado depois do pedido", "A1 alterado"));
    const bruno = (await inbox(tok.bruno)).body.data;
    assert.equal(ids(bruno.awaitingYou).includes(a1), false);
    const mine = (await inbox(tok.ana)).body.data.yours.find((item: { caseId: string }) => item.caseId === a1);
    assert.equal(mine.status, "obsolete"); assert.equal(mine.basisCurrent, false);
    const late = await decide(a1, a1Req, tok.bruno);
    assert.equal(late.status, 409); assert.equal(sub(late), "request_obsolete");
  });
  await t.test("decidir a partir da caixa: o resultado aparece para o solicitante; repetir é idempotente (409) e não duplica", async () => {
    const pending = (await inbox(tok.bruno)).body.data.awaitingYou.find((item: { caseId: string }) => item.caseId === a3);
    assert.equal(pending.requestId, a3Req); assert.equal(pending.basedOnRevision, 1); assert.equal(pending.status, "pending");
    assert.equal((await decide(a3, pending.requestId, tok.bruno, { decision: "more_information", note: "Complete o fluxo" })).status, 201);
    const carla = (await inbox(tok.carla)).body.data.yours.find((item: { caseId: string }) => item.caseId === a3);
    assert.equal(carla.status, "more_information"); assert.equal(carla.decision.value, "more_information"); assert.equal(carla.decision.note, "Complete o fluxo");
    assert.equal(ids((await inbox(tok.bruno)).body.data.awaitingYou).includes(a3), false);
    const again = await decide(a3, pending.requestId, tok.bruno);
    assert.equal(again.status, 409); assert.equal(sub(again), "already_decided");
    assert.equal((await record(a3)).humanDecisions.filter((e: { kind: string }) => e.kind === "decided").length, 1);
  });
  await t.test("efeitos colaterais: nenhuma política nem vínculo criados pela caixa", async () => {
    assert.deepEqual({ policies: await countPolicies(), memberships: await countMemberships() }, before);
  });
});
