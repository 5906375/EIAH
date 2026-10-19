import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { after, before, test } from "node:test";

import express from "express";
import supertest from "supertest";
import {
  LOGISTICA_CONTEXT_SCOPE, ORACULO_PREPARATION_WRITE_SCOPE, ORACULO_UPLOAD_AGENT,
} from "@eiah/contracts";
import { prismaGlobal } from "@repo/db";

import { chatVerticalsRouter } from "../routes/chatVerticals";
import { oraculoPreparationRouter } from "../routes/oraculoPreparation";
import { uploadsRouter } from "../routes/uploads";
import { verticalAccessRouter } from "../routes/verticalAccess";
import { ensureVerticalAccessStore } from "../services/products/verticalAccessApproval";
import { ensureWorkspaceMembershipForUser } from "../services/workspaceResponsibility";

// Matriz de autorização de upload/download/evidência do contexto "oraculo-sc" (HTTP real + PostgreSQL descartável + storage temporário).
// Princípio: pertencer ao workspace NÃO basta; exige identidade, vínculo ativo, produto LOGISTICA instalado, liberação EIAH,
// política exata do workspace (leitura: log.context.read; escrita: + log.oraculo_preparation.write, uso "full") e escopo do documento.
function assertDedicatedLocalDatabase() {
  let url: URL;
  try { url = new URL(process.env.DATABASE_URL ?? "postgresql://unused/unused"); }
  catch { throw new Error("Dedicated local logistics database required"); }
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || !url.pathname.startsWith("/eiah_logistica_core_")) {
    throw new Error("Dedicated local eiah_logistica_core_ database required");
  }
}
assertDedicatedLocalDatabase();
assert.ok(process.env.UPLOADS_DIR?.startsWith("/tmp/"), "UPLOADS_DIR temporário obrigatório (nunca o storage do projeto)");
const uploadRoot = process.env.UPLOADS_DIR!;

const id = randomUUID();
const tenant1 = `ous-t1-${id}`, tenant2 = `ous-t2-${id}`;
const wsA = `ous-a-${id}`, wsB = `ous-b-${id}`, wsC = `ous-c-${id}`, wsT2 = `ous-t2ws-${id}`;
const U = { ownerA: `ownerA-${id}`, outsiderA: `outsiderA-${id}`, ownerB: `ownerB-${id}`, ownerC: `ownerC-${id}`, admin: `admin-${id}`, t2: `t2-${id}` };
const tok = {
  ownerA: `s-ownerA-${id}`, outsiderA: `s-outsiderA-${id}`, serviceA: `s-serviceA-${id}`, ownerB: `s-ownerB-${id}`,
  ownerC: `s-ownerC-${id}`, adminA: `s-adminA-${id}`, adminC: `s-adminC-${id}`, t2: `s-t2-${id}`,
  /** token do usuário do tenant 2 apontando para o workspace A do tenant 1 não existe: a identidade vem do token */
};
const auth = (t: string) => `Bearer ${t}`;
const previousAdmins = process.env.EIAH_PLATFORM_ADMIN_EMAILS;
const app = express();
app.use(express.json());
app.use("/api", verticalAccessRouter, chatVerticalsRouter, oraculoPreparationRouter, uploadsRouter);
const request = supertest(app);

const SECRET_NAME = "segredo-do-oraculo-123.txt";
const secretBytes = Buffer.from("CONTEUDO PROTEGIDO DO ORACULO - NAO VAZAR");
const secretHash = createHash("sha256").update(secretBytes).digest("hex");
let approvalA = "";

const countFiles = (dir: string): number => {
  let n = 0;
  for (const name of readdirSync(dir)) { const p = path.join(dir, name); n += statSync(p).isDirectory() ? countFiles(p) : 1; }
  return n;
};
const docCount = (workspaceId: string) => prismaGlobal.uploadedDocument.count({ where: { workspaceId } });
const upload = (token: string, slug: string = ORACULO_UPLOAD_AGENT, name = SECRET_NAME, bytes = secretBytes, type = "text/plain") =>
  request.post(`/api/uploads?agentSlug=${encodeURIComponent(slug)}`).set("Authorization", auth(token)).attach("files", bytes, { filename: name, contentType: type });
const download = (token: string, docId: string) => request.get(`/api/uploads/${docId}`).set("Authorization", auth(token));
/** Nada do conteúdo/nome/caminho do arquivo protegido pode aparecer em uma negação. */
function assertNoLeak(res: { status: number; text: string; body: unknown; headers: Record<string, string> }, label: string) {
  const haystack = `${res.text ?? ""}${JSON.stringify(res.body ?? {})}${JSON.stringify(res.headers)}`;
  for (const needle of ["CONTEUDO PROTEGIDO", SECRET_NAME, secretHash, "storageKey", uploadRoot]) {
    assert.equal(haystack.includes(needle), false, `${label}: vazou "${needle}"`);
  }
}

async function requestAndApprove(ownerToken: string, adminToken: string, workspaceId: string) {
  assert.equal((await request.post("/api/vertical-access/request").set("Authorization", auth(ownerToken)).send({ vertical: "LOGISTICA", channel: "chat" })).status, 201);
  const rows = await prismaGlobal.$queryRaw<Array<{ id: string }>>`SELECT id FROM vertical_access_approvals WHERE tenant_id=${tenant1} AND workspace_id=${workspaceId} AND vertical='LOGISTICA'`;
  assert.equal((await request.post(`/api/admin/vertical-approvals/${rows[0].id}/decision`).set("Authorization", auth(adminToken)).send({ decision: "aprovar", note: "Synthetic isolated validation" })).status, 200);
  const preview = await request.post("/api/chat/vertical-activation/preview").set("Authorization", auth(ownerToken)).send({ verticalId: "log" });
  assert.equal((await request.post("/api/chat/vertical-activation/confirm").set("Authorization", auth(ownerToken)).send({ verticalId: "log", registryVersion: preview.body.data.registryVersion, confirmed: true })).status, 200);
  return rows[0].id;
}
const grant = (workspaceId: string, actionName: string, allowed = true) =>
  prismaGlobal.tenantActionPolicy.create({ data: { tenantId: tenant1, workspaceId, actionName, allowed } });
const setPolicy = (workspaceId: string, actionName: string, allowed: boolean) =>
  prismaGlobal.tenantActionPolicy.updateMany({ where: { tenantId: tenant1, workspaceId, actionName }, data: { allowed } });
const revoke = (action: string, mode?: string) =>
  request.post(`/api/admin/vertical-approvals/${approvalA}/revocation`).set("Authorization", auth(tok.adminA)).send({ action, ...(mode ? { mode } : {}), note: "Synthetic revocation" });

before(async () => {
  process.env.EIAH_PLATFORM_ADMIN_EMAILS = `ous-admin-${id}@example.com`;
  await prismaGlobal.tenant.createMany({ data: [{ id: tenant1, name: "Synthetic oraculo security" }, { id: tenant2, name: "Synthetic foreign tenant" }] });
  await prismaGlobal.workspace.createMany({ data: [
    { id: wsA, tenantId: tenant1, name: "A" }, { id: wsB, tenantId: tenant1, name: "B" }, { id: wsC, tenantId: tenant1, name: "C" }, { id: wsT2, tenantId: tenant2, name: "T2" },
  ] });
  await prismaGlobal.user.createMany({ data: [
    { id: U.ownerA, tenantId: tenant1, email: `ous-ownerA-${id}@example.com` }, { id: U.outsiderA, tenantId: tenant1, email: `ous-outsiderA-${id}@example.com` },
    { id: U.ownerB, tenantId: tenant1, email: `ous-ownerB-${id}@example.com` }, { id: U.ownerC, tenantId: tenant1, email: `ous-ownerC-${id}@example.com` },
    { id: U.admin, tenantId: tenant1, email: `ous-admin-${id}@example.com` }, { id: U.t2, tenantId: tenant2, email: `ous-t2-${id}@example.com` },
  ] });
  for (const [userId, roleKey, tenantId, workspaceId] of [
    [U.ownerA, "founder", tenant1, wsA], [U.admin, "corretor", tenant1, wsA], [U.ownerB, "founder", tenant1, wsB], [U.ownerC, "founder", tenant1, wsC], [U.admin, "corretor", tenant1, wsC],
  ] as const) await ensureWorkspaceMembershipForUser({ tenantId, workspaceId, userId, roleKey });
  await prismaGlobal.apiToken.createMany({ data: [
    { token: tok.ownerA, tenantId: tenant1, workspaceId: wsA, userId: U.ownerA },
    { token: tok.outsiderA, tenantId: tenant1, workspaceId: wsA, userId: U.outsiderA }, // sem vínculo ativo no workspace A
    { token: tok.serviceA, tenantId: tenant1, workspaceId: wsA }, // token de serviço (sem usuário)
    { token: tok.ownerB, tenantId: tenant1, workspaceId: wsB, userId: U.ownerB },
    { token: tok.ownerC, tenantId: tenant1, workspaceId: wsC, userId: U.ownerC },
    { token: tok.adminA, tenantId: tenant1, workspaceId: wsA, userId: U.admin }, { token: tok.adminC, tenantId: tenant1, workspaceId: wsC, userId: U.admin },
    { token: tok.t2, tenantId: tenant2, workspaceId: wsT2, userId: U.t2 },
  ] });
  await ensureVerticalAccessStore(prismaGlobal);
  approvalA = await requestAndApprove(tok.ownerA, tok.adminA, wsA);
  await requestAndApprove(tok.ownerC, tok.adminC, wsC); // C: instalado e aprovado, SEM nenhuma política
  await grant(wsA, LOGISTICA_CONTEXT_SCOPE);
  await grant(wsA, ORACULO_PREPARATION_WRITE_SCOPE);
});

after(async () => {
  if (previousAdmins === undefined) delete process.env.EIAH_PLATFORM_ADMIN_EMAILS;
  else process.env.EIAH_PLATFORM_ADMIN_EMAILS = previousAdmins;
  await prismaGlobal.$disconnect();
});

test("upload: AUTORIZADO grava no escopo do solicitante e nunca devolve a chave de storage", async () => {
  const res = await upload(tok.ownerA);
  assert.equal(res.status, 200);
  const row = await prismaGlobal.uploadedDocument.findUniqueOrThrow({ where: { id: res.body.data[0].id } });
  assert.deepEqual({ tenantId: row.tenantId, workspaceId: row.workspaceId, agentSlug: row.agentSlug, sizeBytes: row.sizeBytes }, { tenantId: tenant1, workspaceId: wsA, agentSlug: ORACULO_UPLOAD_AGENT, sizeBytes: secretBytes.length });
  assert.equal(JSON.stringify(res.body).includes(row.storageKey), false);
  assert.equal(row.storageKey.startsWith(`${tenant1}/${wsA}/`), true);
});

test("upload: NEGADO em todos os cenários — sem criar registro nem arquivo e sem vazar nada", async (t) => {
  const baseDocs = await docCount(wsA);
  const baseFiles = countFiles(uploadRoot);
  const denied: Array<[string, () => Promise<{ status: number; text: string; body: unknown; headers: Record<string, string> }>, number]> = [
    ["sem autenticação", () => request.post(`/api/uploads?agentSlug=${ORACULO_UPLOAD_AGENT}`).attach("files", secretBytes, { filename: SECRET_NAME, contentType: "text/plain" }), 401],
    ["usuário do workspace SEM vínculo ativo", () => upload(tok.outsiderA), 403],
    ["token de serviço (sem usuário)", () => upload(tok.serviceA), 403],
    ["outro workspace do mesmo tenant, produto NÃO instalado", () => upload(tok.ownerB), 403],
    ["workspace instalado e aprovado, mas SEM política", () => upload(tok.ownerC), 403],
    ["outro tenant", () => upload(tok.t2), 403],
    ["autorizado + tipo inválido: a autorização vem antes do tipo (403, não 415)", () => upload(tok.outsiderA, ORACULO_UPLOAD_AGENT, "x.exe", secretBytes, "application/x-msdownload"), 403],
  ];
  for (const [name, call, status] of denied) {
    await t.test(name, async () => {
      const res = await call();
      assert.equal(res.status, status);
      assertNoLeak(res, name);
    });
  }
  await t.test("política de escrita desabilitada (contexto liberado)", async () => {
    await setPolicy(wsA, ORACULO_PREPARATION_WRITE_SCOPE, false);
    try { const res = await upload(tok.ownerA); assert.equal(res.status, 403); assertNoLeak(res, "write-off"); }
    finally { await setPolicy(wsA, ORACULO_PREPARATION_WRITE_SCOPE, true); }
  });
  await t.test("política de contexto desabilitada", async () => {
    await setPolicy(wsA, LOGISTICA_CONTEXT_SCOPE, false);
    try { const res = await upload(tok.ownerA); assert.equal(res.status, 403); assertNoLeak(res, "ctx-off"); }
    finally { await setPolicy(wsA, LOGISTICA_CONTEXT_SCOPE, true); }
  });
  assert.equal(await docCount(wsA), baseDocs, "nenhum registro criado pelas negações");
  assert.equal(await docCount(wsB) + await docCount(wsC), 0);
  assert.equal(countFiles(uploadRoot), baseFiles, "nenhum arquivo gravado pelas negações");
});

test("upload: entradas inválidas do contexto", async (t) => {
  await t.test("sem agentSlug => 400", async () => {
    assert.equal((await request.post("/api/uploads").set("Authorization", auth(tok.ownerA)).attach("files", secretBytes, { filename: "a.txt", contentType: "text/plain" })).status, 400);
  });
  await t.test("autorizado, mas tipo não permitido => 415; nome vazio/gigante => não grava", async () => {
    assert.equal((await upload(tok.ownerA, ORACULO_UPLOAD_AGENT, "x.exe", secretBytes, "application/x-msdownload")).status, 415);
    const before = await docCount(wsA);
    const long = await upload(tok.ownerA, ORACULO_UPLOAD_AGENT, `${"a".repeat(600)}.txt`);
    assert.equal(long.status, 400);
    assert.equal(await docCount(wsA), before);
  });
  await t.test("slug com espaços ao redor é normalizado e tratado como oraculo-sc (autorização exigida)", async () => {
    assert.equal((await upload(tok.outsiderA, ` ${ORACULO_UPLOAD_AGENT} `)).status, 403);
  });
  await t.test("variações de caixa/sufixo NÃO são o contexto oraculo-sc: nunca viram evidência", async () => {
    for (const slug of ["Oraculo-SC", "oraculo-sc-x", "oraculo"]) {
      const res = await upload(tok.ownerA, slug);
      assert.equal(res.status, 200, slug); // upload genérico, como qualquer outro agente
      const created = await request.post("/api/logistica/oraculo/preparations").set("Authorization", auth(tok.ownerA)).send({ context: {} });
      assert.equal(created.status, 201);
      const link = await request.post(`/api/logistica/oraculo/preparations/${created.body.data.caseId}/evidence`).set("Authorization", auth(tok.ownerA))
        .send({ documentId: res.body.data[0].id, kind: "other", sourceDescription: "Synthetic", expectedRevision: 1 });
      assert.equal(link.status, 404, `${slug} não pode ser vinculado como evidência`);
    }
  });
});

test("download: matriz de autorização, escopo do documento e não-vazamento", async (t) => {
  const uploaded = await upload(tok.ownerA);
  assert.equal(uploaded.status, 200);
  const docId = uploaded.body.data[0].id as string;
  const foreignUpload = await prismaGlobal.uploadedDocument.create({ data: { tenantId: tenant1, workspaceId: wsC, agentSlug: ORACULO_UPLOAD_AGENT, fileName: "c.txt", mimeType: "text/plain", sizeBytes: 1, storageKey: `${tenant1}/${wsC}/x`, url: "" } });

  await t.test("AUTORIZADO: bytes idênticos, attachment e nosniff", async () => {
    const res = await download(tok.ownerA, docId);
    assert.equal(res.status, 200);
    assert.equal(createHash("sha256").update(res.body instanceof Buffer ? res.body : Buffer.from(res.text)).digest("hex"), secretHash);
    assert.match(res.headers["content-disposition"], /attachment/);
    assert.equal(res.headers["x-content-type-options"], "nosniff");
  });
  const denied: Array<[string, string, number]> = [
    ["usuário sem vínculo ativo", tok.outsiderA, 403],
    ["token de serviço", tok.serviceA, 403],
    ["outro workspace do mesmo tenant (id inexistente no escopo)", tok.ownerB, 404],
    ["workspace instalado sem política, id de outro workspace", tok.ownerC, 404],
    ["outro tenant", tok.t2, 404],
  ];
  for (const [name, token, status] of denied) {
    await t.test(`NEGADO: ${name}`, async () => {
      const res = await download(token, docId);
      assert.equal(res.status, status);
      assertNoLeak(res, name);
    });
  }
  await t.test("NEGADO: documento do workspace C (instalado, sem política) para o dono de C => 403 sem vazar", async () => {
    const res = await download(tok.ownerC, foreignUpload.id);
    assert.equal(res.status, 403);
    assertNoLeak(res, "ownerC");
  });
  await t.test("NEGADO: política de contexto desabilitada => 403 sem vazar", async () => {
    await setPolicy(wsA, LOGISTICA_CONTEXT_SCOPE, false);
    try { const res = await download(tok.ownerA, docId); assert.equal(res.status, 403); assertNoLeak(res, "ctx-off"); }
    finally { await setPolicy(wsA, LOGISTICA_CONTEXT_SCOPE, true); }
  });
  await t.test("identificador inexistente => 404 igual ao de outro escopo", async () => {
    assert.equal((await download(tok.ownerA, randomUUID())).status, 404);
  });
  await t.test("sem autenticação => 401", async () => {
    assert.equal((await request.get(`/api/uploads/${docId}`)).status, 401);
  });
});

test("evidência: vínculo verificável, escopo do caso/documento e integridade", async (t) => {
  const uploaded = await upload(tok.ownerA);
  const docId = uploaded.body.data[0].id as string;
  const caseOne = (await request.post("/api/logistica/oraculo/preparations").set("Authorization", auth(tok.ownerA)).send({ context: {} })).body.data.caseId as string;
  const caseTwo = (await request.post("/api/logistica/oraculo/preparations").set("Authorization", auth(tok.ownerA)).send({ context: {} })).body.data.caseId as string;
  const base = (caseId: string) => `/api/logistica/oraculo/preparations/${caseId}`;
  const link = { documentId: docId, kind: "receipt", sourceDescription: "Arquivo sintético", expectedRevision: 1 };

  await t.test("vínculo registra SHA-256 calculado pelo servidor, ator autenticado e revisão append-only", async () => {
    const linked = await request.post(`${base(caseOne)}/evidence`).set("Authorization", auth(tok.ownerA)).send(link);
    assert.equal(linked.status, 200);
    const evidence = linked.body.data.evidences[0];
    assert.equal(evidence.sha256, secretHash);
    assert.equal(evidence.linkedBy, U.ownerA);
    assert.equal(evidence.reviewStatus, "unreviewed");
    assert.equal(linked.body.data.revision, 2);
    const revision = await prismaGlobal.governedCaseRevision.findFirstOrThrow({ where: { caseId: caseOne, revision: 2 } });
    assert.equal(revision.transitionCode, "oraculo.preparation.evidence_linked");
    assert.equal(revision.actorRef, U.ownerA);
    assert.equal(revision.actorType, "user");
    const check = await request.get(`${base(caseOne)}/evidence`).set("Authorization", auth(tok.ownerA));
    assert.equal(check.body.data.items[0].integrity, "available");
    assert.equal(check.body.data.operationalValidation, "not_performed");
  });
  await t.test("campos forjados pelo cliente (sha256, linkedBy, reviewStatus) => 400", async () => {
    for (const forged of [{ sha256: "f".repeat(64) }, { linkedBy: U.admin }, { reviewStatus: "approved" }, { tenantId: tenant2 }]) {
      assert.equal((await request.post(`${base(caseTwo)}/evidence`).set("Authorization", auth(tok.ownerA)).send({ ...link, ...forged })).status, 400);
    }
  });
  await t.test("documento vinculado ao caso 1 NÃO é acessível pelo caso 2 (escopo do caso)", async () => {
    assert.equal((await request.get(`${base(caseTwo)}/evidence/${docId}/file`).set("Authorization", auth(tok.ownerA))).status, 404);
    assert.equal((await request.get(`${base(caseTwo)}/evidence`).set("Authorization", auth(tok.ownerA))).body.data.items.length, 0);
    assert.equal((await request.get(`${base(caseOne)}/evidence/${docId}/file`).set("Authorization", auth(tok.ownerA))).status, 200);
  });
  await t.test("vínculo exige o mesmo workspace e o slug do Oráculo", async () => {
    const other = await prismaGlobal.uploadedDocument.create({ data: { tenantId: tenant1, workspaceId: wsC, agentSlug: ORACULO_UPLOAD_AGENT, fileName: "o.txt", mimeType: "text/plain", sizeBytes: 1, storageKey: `${tenant1}/${wsC}/y`, url: "" } });
    assert.equal((await request.post(`${base(caseTwo)}/evidence`).set("Authorization", auth(tok.ownerA)).send({ ...link, documentId: other.id })).status, 404);
    const generic = await upload(tok.ownerA, "other-agent");
    assert.equal((await request.post(`${base(caseTwo)}/evidence`).set("Authorization", auth(tok.ownerA)).send({ ...link, documentId: generic.body.data[0].id })).status, 404);
  });
  await t.test("usuário sem vínculo/serviço/outro tenant não lê nem vincula evidência (sem vazar)", async () => {
    for (const token of [tok.outsiderA, tok.serviceA, tok.ownerB, tok.t2]) {
      for (const res of [
        await request.get(`${base(caseOne)}/evidence/${docId}/file`).set("Authorization", auth(token)),
        await request.get(`${base(caseOne)}/evidence`).set("Authorization", auth(token)),
        await request.post(`${base(caseTwo)}/evidence`).set("Authorization", auth(token)).send(link),
      ]) { assert.ok([401, 403, 404].includes(res.status), `status ${res.status}`); assertNoLeak(res, "evidence-denied"); }
    }
  });
  await t.test("revisão de conteúdo exige concessão própria: sem ela => 403", async () => {
    const res = await request.post(`${base(caseOne)}/document-reviews`).set("Authorization", auth(tok.ownerA)).send({ documentId: docId, expectedRevision: 2 });
    assert.equal(res.status, 403);
    const state = await request.get(`${base(caseOne)}/document-reviews`).set("Authorization", auth(tok.ownerA));
    assert.equal(state.body.data.reviewAllowed, false);
  });
  await t.test("alteração dos bytes no storage é detectada (409) e não entrega o conteúdo", async () => {
    const row = await prismaGlobal.uploadedDocument.findUniqueOrThrow({ where: { id: docId } });
    const filePath = path.join(uploadRoot, row.storageKey);
    const { writeFile } = await import("node:fs/promises");
    await writeFile(filePath, Buffer.from("ADULTERADO"));
    try {
      const res = await request.get(`${base(caseOne)}/evidence/${docId}/file`).set("Authorization", auth(tok.ownerA));
      assert.equal(res.status, 409);
      assert.equal(res.text.includes("ADULTERADO"), false);
      assert.equal((await request.get(`${base(caseOne)}/evidence`).set("Authorization", auth(tok.ownerA))).body.data.items[0].integrity, "integrity_mismatch");
    } finally { await writeFile(filePath, secretBytes); }
  });
});

test("reabertura: revogação bloqueia upload/download/evidência e a restauração reabre sem perder o que foi guardado", async (t) => {
  const uploaded = await upload(tok.ownerA);
  const docId = uploaded.body.data[0].id as string;
  const caseId = (await request.post("/api/logistica/oraculo/preparations").set("Authorization", auth(tok.ownerA)).send({ context: {} })).body.data.caseId as string;
  const evidenceUrl = `/api/logistica/oraculo/preparations/${caseId}/evidence`;
  assert.equal((await request.post(evidenceUrl).set("Authorization", auth(tok.ownerA)).send({ documentId: docId, kind: "other", sourceDescription: "Synthetic", expectedRevision: 1 })).status, 200);

  await t.test("somente leitura: consulta/baixa continua; enviar e vincular novas evidências é bloqueado", async () => {
    assert.equal((await revoke("revogar", "somente_leitura")).status, 200);
    assert.equal((await download(tok.ownerA, docId)).status, 200);
    assert.equal((await request.get(`${evidenceUrl}/${docId}/file`).set("Authorization", auth(tok.ownerA))).status, 200);
    assertNoLeak(await upload(tok.ownerA), "read-only upload");
    assert.equal((await upload(tok.ownerA)).status, 403);
    assert.equal((await request.post(evidenceUrl).set("Authorization", auth(tok.ownerA)).send({ documentId: docId, kind: "other", sourceDescription: "x", expectedRevision: 2 })).status, 403);
  });
  await t.test("bloqueio total: tudo negado, sem vazar", async () => {
    assert.equal((await revoke("alterar_modo", "bloqueio_total")).status, 200);
    for (const res of [await download(tok.ownerA, docId), await request.get(`${evidenceUrl}/${docId}/file`).set("Authorization", auth(tok.ownerA)), await request.get(evidenceUrl).set("Authorization", auth(tok.ownerA)), await upload(tok.ownerA)]) {
      assert.equal(res.status, 403);
      assertNoLeak(res, "bloqueio_total");
    }
  });
  await t.test("restaurar: acesso volta e o documento/evidência permanecem íntegros", async () => {
    assert.equal((await revoke("restaurar")).status, 200);
    const res = await download(tok.ownerA, docId);
    assert.equal(res.status, 200);
    assert.equal((await request.get(evidenceUrl).set("Authorization", auth(tok.ownerA))).body.data.items[0].integrity, "available");
    assert.equal((await upload(tok.ownerA)).status, 200);
  });
});

test("outros produtos preservados: upload do IMOB e de agentes genéricos não passa pela autoridade do Oráculo", async () => {
  const generic = await upload(tok.ownerB, "other-agent"); // workspace B não tem LOGISTICA
  assert.equal(generic.status, 200);
  assert.equal((await download(tok.ownerB, generic.body.data[0].id)).status, 200);
  assert.equal((await upload(tok.t2, "other-agent")).status, 200);
});
