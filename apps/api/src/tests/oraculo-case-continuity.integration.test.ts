import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import express from "express";
import supertest from "supertest";
import {
  LOGISTICA_CONTEXT_SCOPE, ORACULO_CONTENT_REVIEW_SCOPE, ORACULO_PREPARATION_WRITE_SCOPE, ORACULO_UPLOAD_AGENT,
} from "@eiah/contracts";
import { prismaGlobal } from "@repo/db";

import { chatVerticalsRouter } from "../routes/chatVerticals";
import { oraculoPreparationRouter } from "../routes/oraculoPreparation";
import { uploadsRouter } from "../routes/uploads";
import { verticalAccessRouter } from "../routes/verticalAccess";
import { ensureVerticalAccessStore } from "../services/products/verticalAccessApproval";
import { ensureWorkspaceMembershipForUser } from "../services/workspaceResponsibility";

// Continuidade do caso entre Front Door e cockpit (E4-4), lado servidor: a referência `?case=` é só um ponteiro; quem decide
// é o servidor (tenant/workspace/vínculo/instalação/liberação/política). HTTP real + PostgreSQL descartável + storage temporário.
function assertDedicatedLocalDatabase() {
  let url: URL;
  try { url = new URL(process.env.DATABASE_URL ?? "postgresql://unused/unused"); }
  catch { throw new Error("Dedicated local logistics database required"); }
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || !url.pathname.startsWith("/eiah_logistica_core_")) {
    throw new Error("Dedicated local eiah_logistica_core_ database required");
  }
}
assertDedicatedLocalDatabase();
assert.ok(process.env.UPLOADS_DIR?.startsWith("/tmp/"), "UPLOADS_DIR temporário obrigatório");

const id = randomUUID();
const tenant1 = `cc-t1-${id}`, tenant2 = `cc-t2-${id}`;
const wsA = `cc-a-${id}`, wsB = `cc-b-${id}`, wsT2 = `cc-t2ws-${id}`;
const U = { a: `a-${id}`, b: `b-${id}`, out: `out-${id}`, admin: `admin-${id}`, t2: `t2-${id}` };
const tok = { a: `s-a-${id}`, b: `s-b-${id}`, outsider: `s-out-${id}`, service: `s-svc-${id}`, adminA: `s-adm-a-${id}`, adminB: `s-adm-b-${id}`, t2: `s-t2-${id}` };
const auth = (t: string) => `Bearer ${t}`;
const previousAdmins = process.env.EIAH_PLATFORM_ADMIN_EMAILS;
const app = express();
app.use(express.json());
app.use("/api", verticalAccessRouter, chatVerticalsRouter, oraculoPreparationRouter, uploadsRouter);
const request = supertest(app);
const base = "/api/logistica/oraculo/preparations";
let approvalA = "";

async function requestAndApprove(ownerToken: string, adminToken: string, workspaceId: string) {
  assert.equal((await request.post("/api/vertical-access/request").set("Authorization", auth(ownerToken)).send({ vertical: "LOGISTICA", channel: "chat" })).status, 201);
  const rows = await prismaGlobal.$queryRaw<Array<{ id: string }>>`SELECT id FROM vertical_access_approvals WHERE tenant_id=${tenant1} AND workspace_id=${workspaceId} AND vertical='LOGISTICA'`;
  assert.equal((await request.post(`/api/admin/vertical-approvals/${rows[0].id}/decision`).set("Authorization", auth(adminToken)).send({ decision: "aprovar", note: "Synthetic isolated validation" })).status, 200);
  const preview = await request.post("/api/chat/vertical-activation/preview").set("Authorization", auth(ownerToken)).send({ verticalId: "log" });
  assert.equal((await request.post("/api/chat/vertical-activation/confirm").set("Authorization", auth(ownerToken)).send({ verticalId: "log", registryVersion: preview.body.data.registryVersion, confirmed: true })).status, 200);
  return rows[0].id;
}
const grant = (workspaceId: string, actionName: string) => prismaGlobal.tenantActionPolicy.create({ data: { tenantId: tenant1, workspaceId, actionName, allowed: true } });
const revoke = (action: string, mode?: string) => request.post(`/api/admin/vertical-approvals/${approvalA}/revocation`).set("Authorization", auth(tok.adminA)).send({ action, ...(mode ? { mode } : {}), note: "Synthetic revocation" });
const get = (path: string, token: string) => request.get(path).set("Authorization", auth(token));

before(async () => {
  process.env.EIAH_PLATFORM_ADMIN_EMAILS = `cc-admin-${id}@example.com`;
  await prismaGlobal.tenant.createMany({ data: [{ id: tenant1, name: "Synthetic continuity" }, { id: tenant2, name: "Synthetic foreign" }] });
  await prismaGlobal.workspace.createMany({ data: [{ id: wsA, tenantId: tenant1, name: "A" }, { id: wsB, tenantId: tenant1, name: "B" }, { id: wsT2, tenantId: tenant2, name: "T2" }] });
  await prismaGlobal.user.createMany({ data: [
    { id: U.a, tenantId: tenant1, email: `cc-a-${id}@example.com` }, { id: U.b, tenantId: tenant1, email: `cc-b-${id}@example.com` },
    { id: U.out, tenantId: tenant1, email: `cc-out-${id}@example.com` }, { id: U.admin, tenantId: tenant1, email: `cc-admin-${id}@example.com` },
    { id: U.t2, tenantId: tenant2, email: `cc-t2-${id}@example.com` },
  ] });
  for (const [userId, roleKey, tenantId, workspaceId] of [
    [U.a, "founder", tenant1, wsA], [U.admin, "corretor", tenant1, wsA], [U.b, "founder", tenant1, wsB], [U.admin, "corretor", tenant1, wsB],
  ] as const) await ensureWorkspaceMembershipForUser({ tenantId, workspaceId, userId, roleKey });
  await prismaGlobal.apiToken.createMany({ data: [
    { token: tok.a, tenantId: tenant1, workspaceId: wsA, userId: U.a }, { token: tok.b, tenantId: tenant1, workspaceId: wsB, userId: U.b },
    { token: tok.outsider, tenantId: tenant1, workspaceId: wsA, userId: U.out }, { token: tok.service, tenantId: tenant1, workspaceId: wsA },
    { token: tok.adminA, tenantId: tenant1, workspaceId: wsA, userId: U.admin }, { token: tok.adminB, tenantId: tenant1, workspaceId: wsB, userId: U.admin },
    { token: tok.t2, tenantId: tenant2, workspaceId: wsT2, userId: U.t2 },
  ] });
  await ensureVerticalAccessStore(prismaGlobal);
  approvalA = await requestAndApprove(tok.a, tok.adminA, wsA);
  await requestAndApprove(tok.b, tok.adminB, wsB);
  for (const ws of [wsA, wsB]) { await grant(ws, LOGISTICA_CONTEXT_SCOPE); await grant(ws, ORACULO_PREPARATION_WRITE_SCOPE); }
});

after(async () => {
  if (previousAdmins === undefined) delete process.env.EIAH_PLATFORM_ADMIN_EMAILS;
  else process.env.EIAH_PLATFORM_ADMIN_EMAILS = previousAdmins;
  await prismaGlobal.$disconnect();
});

async function createCase(token: string, body: Record<string, unknown> = { context: { port: { status: "informed", value: "Porto Sintético Teste" } } }) {
  const res = await request.post(base).set("Authorization", auth(token)).send(body);
  assert.equal(res.status, 201);
  return res.body.data as { caseId: string; revision: number };
}
const leaks = (res: { text: string }, ...needles: string[]) => needles.forEach((n) => assert.equal(res.text.includes(n), false, `vazou ${n}`));

test("recuperação autorizada: o servidor devolve exatamente o caso pedido, no escopo do solicitante", async () => {
  const created = await createCase(tok.a);
  const got = await get(`${base}/${created.caseId}`, tok.a);
  assert.equal(got.status, 200);
  assert.equal(got.body.data.caseId, created.caseId);
  assert.equal(got.body.data.workspaceId, wsA);
  assert.equal(got.body.data.executionAllowed, false);
  const listed = await get(base, tok.a);
  assert.equal(listed.body.data.items[0].caseId, created.caseId, "o mais recente vem primeiro (sugestão explícita do Front Door)");
});

test("outro workspace do mesmo tenant, outro tenant, sem vínculo e serviço NÃO recuperam o caso (sem vazar)", async () => {
  const created = await createCase(tok.a, { context: { port: { status: "informed", value: "PORTO-SIGILOSO-A" } }, operationReference: { containerNumber: "CONT-SIGILOSO-A" } });
  const foreign = await get(`${base}/${created.caseId}`, tok.b);
  assert.equal(foreign.status, 404, "autorizado em B, mas o caso é de A");
  leaks(foreign, "PORTO-SIGILOSO-A", "CONT-SIGILOSO-A");
  assert.equal((await get(`${base}/${created.caseId}/revisions`, tok.b)).status, 404);
  assert.equal((await get(`${base}/${created.caseId}/evidence`, tok.b)).status, 404);
  assert.equal((await get(base, tok.b)).body.data.items.some((item: { caseId: string }) => item.caseId === created.caseId), false);
  for (const [token, statuses] of [[tok.outsider, [403]], [tok.service, [401]], [tok.t2, [403]]] as const) {
    const res = await get(`${base}/${created.caseId}`, token);
    assert.ok((statuses as readonly number[]).includes(res.status), `status ${res.status}`);
    leaks(res, "PORTO-SIGILOSO-A", "CONT-SIGILOSO-A");
  }
  assert.equal((await get(`${base}/${created.caseId}`, "token-inexistente")).status, 401);
});

test("cabeçalhos/consulta forjados não trocam o escopo: a identidade vem do token", async () => {
  const created = await createCase(tok.a);
  const res = await request.get(`${base}/${created.caseId}?workspaceId=${wsA}&tenantId=${tenant1}`).set("Authorization", auth(tok.b)).set("x-workspace-id", wsA).set("x-tenant-id", tenant1);
  assert.equal(res.status, 404);
});

test("identificadores forjados ou malformados nunca causam 500 nem devolvem conteúdo", async () => {
  for (const bad of ["../../etc/passwd", "%2e%2e%2f", "'%20OR%201=1--", "x".repeat(300), "%00", "null", "undefined", randomUUID()]) {
    const res = await get(`${base}/${bad}`, tok.a);
    assert.ok([400, 404].includes(res.status), `${bad.slice(0, 20)} => ${res.status}`);
    assert.equal(res.body?.data, undefined);
  }
});

test("revogação: somente leitura mantém a recuperação; bloqueio total nega tudo; restaurar reabre", async () => {
  const created = await createCase(tok.a);
  try {
    assert.equal((await revoke("revogar", "somente_leitura")).status, 200);
    const ro = await get(`${base}/${created.caseId}`, tok.a);
    assert.equal(ro.status, 200, "o Front Door ainda pode recuperar o contexto em modo somente leitura");
    assert.equal((await request.patch(`${base}/${created.caseId}`).set("Authorization", auth(tok.a)).send({ expectedRevision: 1, context: {} })).status, 403);
    assert.equal((await revoke("alterar_modo", "bloqueio_total")).status, 200);
    const blocked = await get(`${base}/${created.caseId}`, tok.a);
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.data, undefined);
    assert.equal((await get(base, tok.a)).status, 403);
  } finally {
    assert.equal((await revoke("restaurar")).status, 200);
  }
  assert.equal((await get(`${base}/${created.caseId}`, tok.a)).status, 200);
});

test("continuidade: evidência e conferência registradas permanecem no caso ao retornar (dados que o Front Door resume)", async () => {
  await grant(wsA, ORACULO_CONTENT_REVIEW_SCOPE);
  const created = await createCase(tok.a, { context: { port: { status: "informed", value: "Porto Sintético Teste" }, depot: { status: "informed", value: "Depósito Sintético Alfa" }, flow: { status: "to_confirm" } }, operationReference: { containerNumber: "TSTU1234567", returnDate: "2026-11-03" } });
  const bytes = Buffer.from("EIR SINTÉTICO — contêiner TSTU7654321 — depósito Beta");
  const up = await request.post(`/api/uploads?agentSlug=${ORACULO_UPLOAD_AGENT}`).set("Authorization", auth(tok.a)).attach("files", bytes, { filename: "eir-sintetico.txt", contentType: "text/plain" });
  assert.equal(up.status, 200);
  const documentId = up.body.data[0].id as string;
  const linked = await request.post(`${base}/${created.caseId}/evidence`).set("Authorization", auth(tok.a)).send({ documentId, kind: "receipt", sourceDescription: "Arquivo sintético", expectedRevision: 1 });
  assert.equal(linked.status, 200);
  const reviewed = await request.post(`${base}/${created.caseId}/document-reviews`).set("Authorization", auth(tok.a)).send({
    documentId, expectedRevision: 2, acknowledgedDocumentRead: true, locator: "linha 1", notes: "Transcrição sintética",
    observations: { containerNumber: "TSTU7654321", port: "Porto Sintético Teste", depot: "Depósito Sintético Beta", movement: "empty_return" },
  });
  assert.equal(reviewed.status, 200);
  // "retorno ao Front Door": o servidor devolve o caso com tudo que o resumo usa
  const back = await get(`${base}/${created.caseId}`, tok.a);
  assert.equal(back.status, 200);
  assert.equal(back.body.data.caseId, created.caseId);
  assert.equal(back.body.data.evidences.length, 1);
  assert.equal(back.body.data.evidences[0].reviewStatus, "unreviewed");
  assert.equal(back.body.data.contentReviews[back.body.data.contentReviews.length - 1].outcome, "divergent");
  assert.equal(back.body.data.context.flow.status, "to_confirm");
  assert.equal(back.body.data.revision, 3);
  assert.equal((await get(`${base}/${created.caseId}`, tok.b)).status, 404, "e o outro workspace continua sem acesso");
});
