import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import express from "express";
import supertest from "supertest";
import { LOGISTICA_CONTEXT_SCOPE, ORACULO_PREPARATION_CASE_TYPE, ORACULO_PREPARATION_WRITE_SCOPE } from "@eiah/contracts";
import { prismaGlobal } from "@repo/db";

import { chatVerticalsRouter } from "../routes/chatVerticals";
import { oraculoPreparationRouter } from "../routes/oraculoPreparation";
import { verticalAccessRouter } from "../routes/verticalAccess";
import { canonicalizeGovernedJsonV1 } from "../services/logistica/preDuimpGovernedCaseCanonicalization";
import { ensureVerticalAccessStore } from "../services/products/verticalAccessApproval";
import { ensureLogisticaMember, logisticaOperator, logisticaOwner } from "./support/logisticaMemberFixture";

// Persistência e integridade da preparação do Oráculo sobre o GovernedCase existente (PostgreSQL real, dados sintéticos).
// Complementa logistica-core.integration.test.ts: aquele teste simula corrupção escrevendo valores que as constraints da
// migração 20260909200000 rejeitam (CHECK de formato do hash, trigger append-only); aqui a adulteração respeita as
// constraints, de modo que o caminho de integridade do repositório é exercitado de fato.
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
const tenantId = `orc-int-${id}`, workspaceId = `orc-int-ws-${id}`, otherWorkspace = `orc-int-other-${id}`;
const owner = `owner-${id}`, admin = `admin-${id}`;
const tokens = { owner: `syn-owner-${id}`, admin: `syn-admin-${id}`, other: `syn-other-${id}` };
const auth = (token: string) => `Bearer ${token}`;
const previousAdmins = process.env.EIAH_PLATFORM_ADMIN_EMAILS;
const app = express();
app.use(express.json());
app.use("/api", verticalAccessRouter, chatVerticalsRouter, oraculoPreparationRouter);
const request = supertest(app);
const url = "/api/logistica/oraculo/preparations";
const wrongHash = "sha256:" + "0".repeat(64);
const hashOf = (value: unknown) => "sha256:" + createHash("sha256").update(canonicalizeGovernedJsonV1(value)).digest("hex");

before(async () => {
  process.env.EIAH_PLATFORM_ADMIN_EMAILS = `orc-admin-${id}@example.com`;
  await prismaGlobal.tenant.create({ data: { id: tenantId, name: "Synthetic oraculo integrity" } });
  await prismaGlobal.workspace.createMany({ data: [{ id: workspaceId, tenantId, name: "Main" }, { id: otherWorkspace, tenantId, name: "Other" }] });
  await prismaGlobal.user.createMany({ data: [
    { id: owner, tenantId, email: `orc-owner-${id}@example.com` },
    { id: admin, tenantId, email: `orc-admin-${id}@example.com` },
  ] });
  await ensureLogisticaMember(prismaGlobal, { tenantId, workspaceId, userId: owner, ...logisticaOwner() });
  await ensureLogisticaMember(prismaGlobal, { tenantId, workspaceId, userId: admin, ...logisticaOperator() });
  await ensureLogisticaMember(prismaGlobal, { tenantId, workspaceId: otherWorkspace, userId: owner, ...logisticaOwner() });
  await prismaGlobal.apiToken.createMany({ data: [
    { token: tokens.owner, tenantId, workspaceId, userId: owner },
    { token: tokens.admin, tenantId, workspaceId, userId: admin },
    { token: tokens.other, tenantId, workspaceId: otherWorkspace, userId: owner },
  ] });
  await ensureVerticalAccessStore(prismaGlobal);

  // jornada governada real (pedido -> decisão humana -> ativação pelo chat); as políticas são concessões explícitas do teste
  assert.equal((await request.post("/api/vertical-access/request").set("Authorization", auth(tokens.owner)).send({ vertical: "LOGISTICA", channel: "chat" })).status, 201);
  const rows = await prismaGlobal.$queryRaw<Array<{ id: string }>>`SELECT id FROM vertical_access_approvals WHERE tenant_id=${tenantId} AND workspace_id=${workspaceId} AND vertical='LOGISTICA'`;
  assert.equal((await request.post(`/api/admin/vertical-approvals/${rows[0].id}/decision`).set("Authorization", auth(tokens.admin)).send({ decision: "aprovar", note: "Synthetic isolated validation" })).status, 200);
  const preview = await request.post("/api/chat/vertical-activation/preview").set("Authorization", auth(tokens.owner)).send({ verticalId: "log" });
  assert.equal((await request.post("/api/chat/vertical-activation/confirm").set("Authorization", auth(tokens.owner)).send({ verticalId: "log", registryVersion: preview.body.data.registryVersion, confirmed: true })).status, 200);
  await prismaGlobal.tenantActionPolicy.createMany({ data: [
    { tenantId, workspaceId, actionName: LOGISTICA_CONTEXT_SCOPE, allowed: true },
    { tenantId, workspaceId, actionName: ORACULO_PREPARATION_WRITE_SCOPE, allowed: true },
  ] });
});

after(async () => {
  if (previousAdmins === undefined) delete process.env.EIAH_PLATFORM_ADMIN_EMAILS;
  else process.env.EIAH_PLATFORM_ADMIN_EMAILS = previousAdmins;
  await prismaGlobal.$disconnect();
});

const get = (path: string, token = tokens.owner) => request.get(path).set("Authorization", auth(token));

async function createPreparation() {
  const created = await request.post(url).set("Authorization", auth(tokens.owner)).send({ context: { port: { status: "informed", value: "Porto sintético" } } });
  assert.equal(created.status, 201);
  return created.body.data as Record<string, unknown> & { caseId: string };
}

test("hash do snapshot adulterado (formato válido, valor errado): leitura, histórico, listagem e edição bloqueados com 409 e sem nova revisão", async () => {
  const value = await createPreparation();
  const row = await prismaGlobal.governedCase.findUniqueOrThrow({ where: { id: value.caseId } });
  await prismaGlobal.governedCase.update({ where: { id: value.caseId }, data: { snapshotHash: wrongHash } });
  try {
    for (const path of [`${url}/${value.caseId}`, `${url}/${value.caseId}/revisions`, url]) {
      const res = await get(path);
      assert.equal(res.status, 409, path);
      assert.equal(res.body.error.code, "ORACULO_PREPARATION_INTEGRITY_VIOLATION");
    }
    const patch = await request.patch(`${url}/${value.caseId}`).set("Authorization", auth(tokens.owner)).send({ expectedRevision: 1, context: {} });
    assert.equal(patch.status, 409);
    assert.equal(await prismaGlobal.governedCaseRevision.count({ where: { caseId: value.caseId } }), 1, "nenhuma revisão nova");
  } finally {
    await prismaGlobal.governedCase.update({ where: { id: value.caseId }, data: { snapshotHash: row.snapshotHash } });
  }
  assert.equal((await get(`${url}/${value.caseId}`)).status, 200, "restaurado o hash, a leitura volta");
});

test("conteúdo do snapshot adulterado mantendo o hash antigo: bloqueado (409)", async () => {
  const value = await createPreparation();
  const row = await prismaGlobal.governedCase.findUniqueOrThrow({ where: { id: value.caseId } });
  const tampered = { ...(row.snapshot as Record<string, unknown>), operationReference: { kind: "booking", value: "ALTERADO" } };
  await prismaGlobal.governedCase.update({ where: { id: value.caseId }, data: { snapshot: tampered as never } });
  try {
    assert.equal((await get(`${url}/${value.caseId}`)).status, 409);
  } finally {
    await prismaGlobal.governedCase.update({ where: { id: value.caseId }, data: { snapshot: row.snapshot as never } });
  }
  assert.equal((await get(`${url}/${value.caseId}`)).status, 200);
});

test("snapshot de outro tenant/workspace gravado na linha do escopo atual é rejeitado (409), nunca devolvido", async () => {
  const value = await createPreparation();
  const row = await prismaGlobal.governedCase.findUniqueOrThrow({ where: { id: value.caseId } });
  const foreign = { ...(row.snapshot as Record<string, unknown>), tenantId: "tenant-estrangeiro" };
  await prismaGlobal.governedCase.update({ where: { id: value.caseId }, data: { snapshot: foreign as never, snapshotHash: hashOf(foreign) } });
  try {
    const res = await get(`${url}/${value.caseId}`);
    assert.equal(res.status, 409);
    assert.equal(JSON.stringify(res.body).includes("tenant-estrangeiro"), false);
  } finally {
    await prismaGlobal.governedCase.update({ where: { id: value.caseId }, data: { snapshot: row.snapshot as never, snapshotHash: row.snapshotHash } });
  }
});

test("snapshot histórico sem 'evidences' continua legível, editável e preserva a revisão original", async () => {
  const value = await createPreparation();
  const legacyId = randomUUID();
  const { evidences: _evidences, ...rest } = value as Record<string, unknown>;
  const legacy: Record<string, unknown> = { ...rest, caseId: legacyId };
  const snapshotHash = hashOf(legacy);
  const now = new Date();
  await prismaGlobal.governedCase.create({ data: {
    id: legacyId, tenantId, workspaceId, caseType: ORACULO_PREPARATION_CASE_TYPE, schemaVersion: String(legacy.schemaVersion), revision: 1, lifecycle: "DISCOVERY",
    subject: { scenario: "empty_container_return" }, domainState: { preparationOnly: true }, snapshot: legacy as never, snapshotHash, createdAt: now, updatedAt: now,
  } });
  await prismaGlobal.governedCaseRevision.create({ data: {
    id: randomUUID(), caseId: legacyId, tenantId, workspaceId, revision: 1, schemaVersion: String(legacy.schemaVersion), lifecycle: "DISCOVERY",
    snapshot: legacy as never, snapshotHash, fromLifecycle: null, toLifecycle: "DISCOVERY", actorType: "user", actorRef: owner, transitionCode: "oraculo.preparation.created", createdAt: now,
  } });
  const read = await get(`${url}/${legacyId}`);
  assert.equal(read.status, 200);
  assert.equal("evidences" in read.body.data, false, "o registro histórico não ganha campos em leitura");
  const edited = await request.patch(`${url}/${legacyId}`).set("Authorization", auth(tokens.owner)).send({ expectedRevision: 1, context: { port: { status: "to_confirm", value: "Revisar" } } });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.data.revision, 2);
  const history = await get(`${url}/${legacyId}/revisions`);
  assert.equal(history.status, 200);
  assert.equal("evidences" in history.body.data.items[0], false, "a revisão 1 permanece como foi gravada");
  assert.equal(history.body.data.items[0].revision, 1);
  assert.equal(history.body.data.items[1].revision, 2);
});

test("casos de outro tipo (ex.: PRE-DUIMP) no mesmo workspace não são listados, lidos nem editados pelo Oráculo", async () => {
  const foreignId = randomUUID();
  const snapshot = { schemaVersion: "pre-duimp.synthetic.v1", caseId: foreignId, tenantId, workspaceId, revision: 1, lifecycle: "DISCOVERY" };
  const snapshotHash = hashOf(snapshot);
  await prismaGlobal.governedCase.create({ data: {
    id: foreignId, tenantId, workspaceId, caseType: "PRE_DUIMP_SYNTHETIC_FOREIGN", schemaVersion: "pre-duimp.synthetic.v1", revision: 1, lifecycle: "DISCOVERY",
    subject: {}, domainState: {}, snapshot: snapshot as never, snapshotHash,
  } });
  const list = await get(url);
  assert.equal(list.status, 200);
  assert.equal(list.body.data.items.some((item: { caseId: string }) => item.caseId === foreignId), false);
  assert.equal((await get(`${url}/${foreignId}`)).status, 404);
  assert.equal((await get(`${url}/${foreignId}/revisions`)).status, 404);
  assert.equal((await request.patch(`${url}/${foreignId}`).set("Authorization", auth(tokens.owner)).send({ expectedRevision: 1, context: {} })).status, 404);
  const after = await prismaGlobal.governedCase.findUniqueOrThrow({ where: { id: foreignId } });
  assert.equal(after.revision, 1);
  assert.equal(after.snapshotHash, snapshotHash);
});

test("o router não concede transmissão externa nem execução, e o outro workspace (sem instalação) não vê nada", async () => {
  const value = await createPreparation();
  assert.equal(value.executionAllowed, false);
  assert.equal(value.externalTransmissionAllowed, false);
  assert.equal(value.authorizationState, "NOT_REQUESTED");
  assert.equal((await get(`${url}/${value.caseId}`, tokens.other)).status, 403);
  assert.equal((await get(url, tokens.other)).status, 403);
});
