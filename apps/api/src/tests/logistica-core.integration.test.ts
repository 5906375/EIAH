import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { before, after, test } from "node:test";
import express from "express";
import supertest from "supertest";
import { prismaGlobal } from "@repo/db";
import { LOGISTICA_CONTEXT_SCOPE } from "@eiah/contracts";
import { ensureWorkspaceMembershipForUser } from "../services/workspaceResponsibility";
import { ensureVerticalAccessStore } from "../services/products/verticalAccessApproval";
import { verticalAccessRouter } from "../routes/verticalAccess";
import { marketplaceRouter } from "../routes/marketplace";
import { chatVerticalsRouter } from "../routes/chatVerticals";
import { oraculoPreparationRouter } from "../routes/oraculoPreparation";
import { OraculoPreparationRepository } from "../services/logistica/oraculo/preparationRepository";
import { ORACULO_CONTENT_REVIEW_SCOPE, ORACULO_PREPARATION_WRITE_SCOPE, ORACULO_PREPARATION_CASE_TYPE } from "@eiah/contracts";
import { uploadsRouter } from "../routes/uploads";
import { canonicalizeGovernedJsonV1 } from "../services/logistica/preDuimpGovernedCaseCanonicalization";
import { sessionRouter } from "../routes/session";

// Run only against an explicitly dedicated application database, never a user's installation.
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
const tenantId = `log-core-${id}`, workspaceId = `log-work-${id}`, otherWorkspace = `log-other-${id}`;
const owner = `owner-${id}`, member = `member-${id}`, admin = `admin-${id}`;
const tokens = { owner: `synthetic-owner-${id}`, member: `synthetic-member-${id}`, admin: `synthetic-admin-${id}`, other: `synthetic-other-${id}` };
const app = express(); app.use(express.json());
app.use("/api", verticalAccessRouter, marketplaceRouter, chatVerticalsRouter, sessionRouter, oraculoPreparationRouter, uploadsRouter);
const request = supertest(app);
const authorization = (token: string) => `Bearer ${token}`;
let uploadRoot = "";
const previousStorage = process.env.STORAGE_PROVIDER;
const previousUploads = process.env.UPLOADS_DIR;
const previousAdmins = process.env.EIAH_PLATFORM_ADMIN_EMAILS;

before(async () => {
  uploadRoot = await mkdtemp(path.join(tmpdir(), "eiah-oraculo-evidence-"));
  process.env.STORAGE_PROVIDER = "local"; process.env.UPLOADS_DIR = uploadRoot;
  process.env.EIAH_PLATFORM_ADMIN_EMAILS = `log-admin-${id}@example.com`;
  await prismaGlobal.tenant.create({ data: { id: tenantId, name: "Synthetic logistics" } });
  await prismaGlobal.workspace.createMany({ data: [{ id: workspaceId, tenantId, name: "Logistics" }, { id: otherWorkspace, tenantId, name: "Other" }] });
  await prismaGlobal.user.createMany({ data: [
    { id: owner, tenantId, email: `log-owner-${id}@example.com` },
    { id: member, tenantId, email: `log-member-${id}@example.com` },
    { id: admin, tenantId, email: `log-admin-${id}@example.com` },
  ] });
  for (const [userId, roleKey] of [[owner, "founder"], [member, "corretor"], [admin, "corretor"]]) {
    await ensureWorkspaceMembershipForUser({ tenantId, workspaceId, userId, roleKey });
  }
  await ensureWorkspaceMembershipForUser({ tenantId, workspaceId: otherWorkspace, userId: owner, roleKey: "founder" });
  await prismaGlobal.apiToken.createMany({ data: [
    { token: tokens.owner, tenantId, workspaceId, userId: owner },
    { token: tokens.member, tenantId, workspaceId, userId: member },
    { token: tokens.admin, tenantId, workspaceId, userId: admin },
    { token: tokens.other, tenantId, workspaceId: otherWorkspace, userId: owner },
  ] });
  await ensureVerticalAccessStore(prismaGlobal);
});

after(async () => {
  if (previousAdmins === undefined) delete process.env.EIAH_PLATFORM_ADMIN_EMAILS;
  else process.env.EIAH_PLATFORM_ADMIN_EMAILS = previousAdmins;
  if (previousStorage === undefined) delete process.env.STORAGE_PROVIDER; else process.env.STORAGE_PROVIDER = previousStorage;
  if (previousUploads === undefined) delete process.env.UPLOADS_DIR; else process.env.UPLOADS_DIR = previousUploads;
  if (uploadRoot) await rm(uploadRoot, { recursive: true, force: true });
  await prismaGlobal.$disconnect();
});

test("LOGISTICA uses core request, human decision, chat activation and session gates", async (t) => {
  let approvalId = "";
  let preparationId = "";
  let evidenceCaseId = "", documentId = "", reviewCaseId = "";
  const fileBytes = Buffer.from("Comprovante sintetico. Conteudo nao validado.");
  const fileHash = createHash("sha256").update(fileBytes).digest("hex");
  await t.test("unauthenticated and unauthorized callers cannot request or activate", async () => {
    assert.equal((await request.post("/api/vertical-access/request").send({ vertical: "LOGISTICA" })).status, 401);
    assert.equal((await request.post("/api/vertical-access/request").set("Authorization", authorization(tokens.member)).send({ vertical: "LOGISTICA" })).status, 403);
    assert.equal((await request.post("/api/marketplace/installations/activate").set("Authorization", authorization(tokens.owner)).send({ product: "LOGISTICA" })).status, 403);
  });
  await t.test("request requires the existing platform human decision; tenant owner is not platform admin", async () => {
    const response = await request.post("/api/vertical-access/request").set("Authorization", authorization(tokens.owner)).send({ vertical: "LOGISTICA", channel: "chat" });
    assert.equal(response.status, 201);
    const rows = await prismaGlobal.$queryRaw<Array<{ id: string }>>`SELECT id FROM vertical_access_approvals WHERE tenant_id=${tenantId} AND workspace_id=${workspaceId} AND vertical='LOGISTICA'`;
    approvalId = rows[0].id;
    assert.equal((await request.post(`/api/admin/vertical-approvals/${approvalId}/decision`).set("Authorization", authorization(tokens.owner)).send({ decision: "aprovar", note: "Synthetic" })).status, 404);
    assert.equal((await request.post(`/api/admin/vertical-approvals/${approvalId}/decision`).set("Authorization", authorization(tokens.admin)).send({ decision: "aprovar", note: "Synthetic isolated validation" })).status, 200);
    assert.equal((await request.post("/api/marketplace/installations/activate").set("Authorization", authorization(tokens.member)).send({ product: "LOGISTICA" })).status, 403);
  });
  await t.test("preview is read-only and confirmation reuses atomic provisioning without policy grants", async () => {
    const preview = await request.post("/api/chat/vertical-activation/preview").set("Authorization", authorization(tokens.owner)).send({ verticalId: "log" });
    assert.equal(preview.status, 200); assert.equal(preview.body.data.status, "available");
    assert.equal((await request.post("/api/chat/vertical-activation/confirm").set("Authorization", authorization(tokens.owner)).send({ verticalId: "log", registryVersion: preview.body.data.registryVersion })).status, 400);
    const confirm = await request.post("/api/chat/vertical-activation/confirm").set("Authorization", authorization(tokens.owner)).send({ verticalId: "log", registryVersion: preview.body.data.registryVersion, confirmed: true });
    assert.equal(confirm.status, 200); assert.equal(confirm.body.data.status, "activated");
    assert.deepEqual(confirm.body.data.releasedRoutes, ["/app/chat?domain=logistica"]);
    const policies = await prismaGlobal.tenantActionPolicy.findMany({ where: { tenantId, workspaceId } });
    assert.equal(policies.length, 0);
    const assignments = await prismaGlobal.workspaceAgentAssignment.findMany({ where: { tenantId, workspaceId } });
    assert.deepEqual(assignments.map((a) => a.agentKey), ["EIAH"]);
    assert.equal((await request.get("/api/session/context?domain=logistica").set("Authorization", authorization(tokens.owner))).status, 403);
  });
  await t.test("explicit exact-workspace context policy permits only the authenticated context", async () => {
    await prismaGlobal.tenantActionPolicy.create({ data: { tenantId, workspaceId, actionName: LOGISTICA_CONTEXT_SCOPE, allowed: true } });
    const response = await request.get("/api/session/context?domain=logistica").set("Authorization", authorization(tokens.owner));
    assert.equal(response.status, 200);
    assert.equal(response.body.data.activeDomain, "logistica");
    assert.equal(response.body.data.experience.landingPath, "/app/chat");
    assert.equal(response.body.data.capabilities.logisticaContext.executionAllowed, false);
    assert.equal(response.body.data.capabilities.logisticaContext.externalTransmissionAllowed, false);
    assert.equal((await request.get("/api/session/context?domain=logistica").set("Authorization", authorization(tokens.other))).status, 403);
    await prismaGlobal.$executeRaw`UPDATE eiah_workspace_memberships SET status='inactive' WHERE tenant_id=${tenantId} AND workspace_id=${workspaceId} AND user_id=${owner}`;
    assert.equal((await request.get("/api/session/context?domain=logistica").set("Authorization", authorization(tokens.owner))).status, 403);
    await prismaGlobal.$executeRaw`UPDATE eiah_workspace_memberships SET status='active' WHERE tenant_id=${tenantId} AND workspace_id=${workspaceId} AND user_id=${owner}`;
    await prismaGlobal.tenantActionPolicy.updateMany({ where: { tenantId, workspaceId, actionName: LOGISTICA_CONTEXT_SCOPE }, data: { allowed: false } });
    assert.equal((await request.get("/api/session/context?domain=logistica").set("Authorization", authorization(tokens.owner))).status, 403);
    await prismaGlobal.tenantActionPolicy.updateMany({ where: { tenantId, workspaceId, actionName: LOGISTICA_CONTEXT_SCOPE }, data: { allowed: true } });
  });
  await t.test("preparation persistence requires a separate exact-workspace write policy", async () => {
    const url = "/api/logistica/oraculo/preparations";
    const payload = { context: { port: { status: "informed", value: "Porto sintético" } } };
    assert.equal((await request.get(url)).status, 401);
    const noGrant = await request.get(url).set("Authorization", authorization(tokens.owner));
    assert.equal(noGrant.status, 200); assert.equal(noGrant.body.data.writeAllowed, false);
    assert.equal((await request.post(url).set("Authorization", authorization(tokens.owner)).send(payload)).status, 403);
    await prismaGlobal.tenantActionPolicy.create({ data: { tenantId, workspaceId: null, actionName: ORACULO_PREPARATION_WRITE_SCOPE, allowed: true } });
    assert.equal((await request.post(url).set("Authorization", authorization(tokens.owner)).send(payload)).status, 403);
    await prismaGlobal.tenantActionPolicy.create({ data: { tenantId, workspaceId, actionName: ORACULO_PREPARATION_WRITE_SCOPE, allowed: true } });
    for (const forged of [{ ...payload, tenantId: "forged" }, { ...payload, actorRef: admin }, { ...payload, executionAllowed: true }, { context: { port: { status: "not_applicable" } } }]) {
      assert.equal((await request.post(url).set("Authorization", authorization(tokens.owner)).send(forged)).status, 400);
    }
    const created = await request.post(url).set("Authorization", authorization(tokens.owner)).send(payload);
    assert.equal(created.status, 201);
    const value = created.body.data; preparationId = value.caseId;
    assert.equal(value.tenantId, tenantId); assert.equal(value.workspaceId, workspaceId);
    assert.equal(value.revision, 1); assert.equal(value.context.depot.status, "not_informed");
    assert.equal(value.executionAllowed, false); assert.equal(value.authorizationState, "NOT_REQUESTED");
    assert.equal(value.externalTransmissionAllowed, false); assert.equal(value.lifecycle, "DISCOVERY");
    const revision = await prismaGlobal.governedCaseRevision.findFirstOrThrow({ where: { caseId: preparationId } });
    assert.equal(revision.actorRef, owner); assert.equal(revision.actorType, "user");
    const repository = new OraculoPreparationRepository(prismaGlobal, { tenantId, workspaceId });
    assert.equal((await repository.get(preparationId))?.caseId, preparationId);
    assert.equal(await new OraculoPreparationRepository(prismaGlobal, { tenantId, workspaceId: otherWorkspace }).get(preparationId), null);
    assert.equal(await new OraculoPreparationRepository(prismaGlobal, { tenantId: "foreign-tenant", workspaceId }).get(preparationId), null);
  });
  await t.test("edits append revisions atomically and concurrent stale writes do not overwrite", async () => {
    const url = `/api/logistica/oraculo/preparations/${preparationId}`;
    const patch = { expectedRevision: 1, context: { port: { status: "to_confirm", value: "Revisar porto" }, depot: { status: "not_applicable", justification: "Hipótese para revisão humana" } } };
    const responses = await Promise.all([1, 2].map(() => request.patch(url).set("Authorization", authorization(tokens.owner)).send(patch)));
    assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
    const loaded = await request.get(url).set("Authorization", authorization(tokens.owner));
    assert.equal(loaded.status, 200); assert.equal(loaded.body.data.revision, 2);
    assert.equal(loaded.body.data.context.port.status, "to_confirm");
    assert.equal(loaded.body.data.executionAllowed, false);
    const history = await request.get(url + "/revisions").set("Authorization", authorization(tokens.owner));
    assert.equal(history.status, 200); assert.deepEqual(history.body.data.items.map((v: { revision: number }) => v.revision), [1, 2]);
    assert.equal(history.body.data.items[0].context.port.value, "Porto sintético");
    assert.equal(await prismaGlobal.governedCaseRevision.count({ where: { caseId: preparationId } }), 2);
    assert.equal((await request.patch(url).set("Authorization", authorization(tokens.owner)).send(patch)).status, 409);
    assert.equal((await request.get(url.replace(preparationId, "missing-id")).set("Authorization", authorization(tokens.owner))).status, 404);
  });
  await t.test("a failed history append rolls back the projection update", async () => {
    const db = new Proxy(prismaGlobal, { get(target, key) {
      if (key !== "$transaction") return Reflect.get(target, key);
      return (operation: (tx: unknown) => Promise<unknown>) => target.$transaction(async (tx) => operation(new Proxy(tx, { get(transaction, model) {
        if (model !== "governedCaseRevision") return Reflect.get(transaction, model);
        return { create: async () => { throw new Error("Synthetic append failure"); } };
      } })));
    } });
    const repository = new OraculoPreparationRepository(db, { tenantId, workspaceId });
    await assert.rejects(() => repository.save({ context: {} }, owner, { caseId: preparationId, expectedRevision: 2 }), /Synthetic append failure/);
    const value = await new OraculoPreparationRepository(prismaGlobal, { tenantId, workspaceId }).get(preparationId);
    assert.equal(value?.revision, 2); assert.equal(value?.context.port.status, "to_confirm");
    assert.equal(await prismaGlobal.governedCaseRevision.count({ where: { caseId: preparationId } }), 2);
  });
  await t.test("cross-workspace requests cannot read or update another case even after own activation", async () => {
    const auth = authorization(tokens.other);
    assert.equal((await request.post("/api/vertical-access/request").set("Authorization", auth).send({ vertical: "LOGISTICA" })).status, 201);
    const rows = await prismaGlobal.$queryRaw<Array<{ id: string }>>`SELECT id FROM vertical_access_approvals WHERE tenant_id=${tenantId} AND workspace_id=${otherWorkspace} AND vertical='LOGISTICA'`;
    assert.equal((await request.post(`/api/admin/vertical-approvals/${rows[0].id}/decision`).set("Authorization", authorization(tokens.admin)).send({ decision: "aprovar", note: "Synthetic other workspace" })).status, 200);
    assert.equal((await request.post("/api/marketplace/installations/activate").set("Authorization", auth).send({ product: "LOGISTICA" })).status, 200);
    await prismaGlobal.tenantActionPolicy.createMany({ data: [LOGISTICA_CONTEXT_SCOPE, ORACULO_PREPARATION_WRITE_SCOPE].map((actionName) => ({ tenantId, workspaceId: otherWorkspace, actionName, allowed: true })) });
    const url = `/api/logistica/oraculo/preparations/${preparationId}`;
    assert.equal((await request.get(url).set("Authorization", auth)).status, 404);
    assert.equal((await request.get(url + "/revisions").set("Authorization", auth)).status, 404);
    assert.equal((await request.patch(url).set("Authorization", auth).send({ expectedRevision: 2, context: {} })).status, 404);
    assert.deepEqual((await request.get("/api/logistica/oraculo/preparations").set("Authorization", auth)).body.data.items, []);
  });
  await t.test("integrity mismatches block reading, history and editing without new revisions", async () => {
    const row = await prismaGlobal.governedCase.findUniqueOrThrow({ where: { id: preparationId } });
    // E3.1: o fixture original ("corrupted-synthetic") viola o CHECK governed_cases_snapshot_hash_check (migração 20260909200000);
    // o hash adulterado agora tem formato válido ("sha256:" + 64 hex) mas valor errado — mesmo caminho de integridade do repositório.
    await prismaGlobal.governedCase.update({ where: { id: preparationId }, data: { snapshotHash: "sha256:" + "0".repeat(64) } });
    const url = `/api/logistica/oraculo/preparations/${preparationId}`;
    for (const path of [url, url + "/revisions", "/api/logistica/oraculo/preparations"]) assert.equal((await request.get(path).set("Authorization", authorization(tokens.owner))).status, 409);
    assert.equal((await request.patch(url).set("Authorization", authorization(tokens.owner)).send({ expectedRevision: 2, context: {} })).status, 409);
    assert.equal(await prismaGlobal.governedCaseRevision.count({ where: { caseId: preparationId } }), 2);
    await prismaGlobal.governedCase.update({ where: { id: preparationId }, data: { snapshotHash: row.snapshotHash } });
    const preDuimpCount = await prismaGlobal.governedCase.count({ where: { tenantId, workspaceId, caseType: { not: ORACULO_PREPARATION_CASE_TYPE } } });
    assert.equal(preDuimpCount, 0);
  });
  await t.test("Oráculo uploads reuse core storage and enforce the logistics write grant", async () => {
    const uploadUrl = "/api/uploads?agentSlug=oraculo-sc";
    await prismaGlobal.tenantActionPolicy.updateMany({ where: { tenantId, workspaceId, actionName: ORACULO_PREPARATION_WRITE_SCOPE }, data: { allowed: false } });
    const before = await prismaGlobal.uploadedDocument.count({ where: { tenantId, workspaceId } });
    assert.equal((await request.post(uploadUrl).set("Authorization", authorization(tokens.owner)).attach("files", fileBytes, "receipt.txt")).status, 403);
    assert.equal(await prismaGlobal.uploadedDocument.count({ where: { tenantId, workspaceId } }), before);
    await prismaGlobal.tenantActionPolicy.updateMany({ where: { tenantId, workspaceId, actionName: ORACULO_PREPARATION_WRITE_SCOPE }, data: { allowed: true } });
    assert.equal((await request.post(uploadUrl).set("Authorization", authorization(tokens.owner)).attach("files", fileBytes, { filename: "file.exe", contentType: "application/x-msdownload" })).status, 415);
    const uploaded = await request.post(uploadUrl).set("Authorization", authorization(tokens.owner)).attach("files", fileBytes, { filename: "receipt.txt", contentType: "text/plain" });
    assert.equal(uploaded.status, 200); documentId = uploaded.body.data[0].id;
    const created = await request.post("/api/logistica/oraculo/preparations").set("Authorization", authorization(tokens.owner)).send({ context: {} });
    assert.equal(created.status, 201); evidenceCaseId = created.body.data.caseId;
  });
  await t.test("linking hashes server bytes, records the actor and appends an unreviewed case revision", async () => {
    const url = `/api/logistica/oraculo/preparations/${evidenceCaseId}/evidence`;
    const input = { documentId, kind: "receipt", sourceDescription: "Arquivo sintético fornecido pelo operador", expectedRevision: 1 };
    for (const forged of [{ ...input, sha256: "forged" }, { ...input, linkedBy: admin }, { ...input, reviewStatus: "approved" }, { ...input, documentDate: "2026-02-30" }]) {
      assert.equal((await request.post(url).set("Authorization", authorization(tokens.owner)).send(forged)).status, 400);
    }
    const linked = await request.post(url).set("Authorization", authorization(tokens.owner)).set("x-workspace-id", otherWorkspace).send(input);
    assert.equal(linked.status, 200); assert.equal(linked.body.data.revision, 2);
    const evidence = linked.body.data.evidences[0];
    assert.equal(evidence.sha256, fileHash); assert.equal(evidence.linkedBy, owner);
    assert.equal(evidence.reviewStatus, "unreviewed"); assert.equal(linked.body.data.workspaceId, workspaceId);
    assert.equal(linked.body.data.lifecycle, "DISCOVERY"); assert.equal(linked.body.data.executionAllowed, false);
    const listed = await request.get(url).set("Authorization", authorization(tokens.owner));
    assert.equal(listed.status, 200); assert.equal(listed.body.data.items[0].integrity, "available");
    assert.equal(listed.body.data.contentReview, "not_performed"); assert.equal(listed.body.data.operationalValidation, "not_performed");
    const download = await request.get(`${url}/${documentId}/file`).set("Authorization", authorization(tokens.owner));
    assert.equal(download.status, 200); assert.equal(download.text, fileBytes.toString());
    assert.match(download.headers["content-disposition"], /attachment/); assert.equal(download.headers["x-content-type-options"], "nosniff");
    assert.equal((await request.post(url).set("Authorization", authorization(tokens.owner)).send(input)).status, 409);
    assert.equal((await request.post(url).set("Authorization", authorization(tokens.owner)).send({ ...input, expectedRevision: 2 })).status, 409);
    const edited = await request.patch(url.replace("/evidence", "")).set("Authorization", authorization(tokens.owner)).send({ expectedRevision: 2, context: { flow: { status: "to_confirm" } } });
    assert.equal(edited.status, 200); assert.equal(edited.body.data.evidences[0].sha256, fileHash);
    const revisions = await request.get(url.replace("/evidence", "/revisions")).set("Authorization", authorization(tokens.owner));
    assert.deepEqual(revisions.body.data.items.map((item: { evidences?: unknown[] }) => item.evidences?.length ?? 0), [0, 1, 1]);
    const event = await prismaGlobal.governedCaseRevision.findFirstOrThrow({ where: { caseId: evidenceCaseId, revision: 2 } });
    assert.equal(event.transitionCode, "oraculo.preparation.evidence_linked"); assert.equal(event.actorRef, owner);
  });
  await t.test("document links and downloads reject foreign workspaces, other agent files and service tokens", async () => {
    const url = `/api/logistica/oraculo/preparations/${evidenceCaseId}/evidence`;
    const foreign = await request.post("/api/uploads?agentSlug=oraculo-sc").set("Authorization", authorization(tokens.other)).attach("files", fileBytes, "foreign.txt");
    assert.equal(foreign.status, 200);
    const input = { documentId: foreign.body.data[0].id, kind: "other", sourceDescription: "Synthetic", expectedRevision: 3 };
    assert.equal((await request.post(url).set("Authorization", authorization(tokens.owner)).send(input)).status, 404);
    assert.equal((await request.post(url).set("Authorization", authorization(tokens.other)).send({ ...input, documentId })).status, 404);
    assert.equal((await request.get(`${url}/${documentId}/file`).set("Authorization", authorization(tokens.other))).status, 404);
    assert.equal((await request.get(`/api/uploads/${documentId}`).set("Authorization", authorization(tokens.other))).status, 404);
    const unrelated = await request.post("/api/uploads?agentSlug=other-agent").set("Authorization", authorization(tokens.owner)).attach("files", fileBytes, "other.txt");
    assert.equal(unrelated.status, 200);
    assert.equal((await request.post(url).set("Authorization", authorization(tokens.owner)).send({ ...input, documentId: unrelated.body.data[0].id })).status, 404);
    const serviceToken = `synthetic-service-${id}`;
    await prismaGlobal.apiToken.create({ data: { token: serviceToken, tenantId, workspaceId } });
    assert.equal((await request.get(`/api/uploads/${documentId}`).set("Authorization", authorization(serviceToken))).status, 403);
    assert.equal((await request.post("/api/uploads?agentSlug=oraculo-sc").set("Authorization", authorization(serviceToken)).attach("files", fileBytes, "service.txt")).status, 403);
  });
  await t.test("byte changes, missing files and missing records are distinct and block case downloads", async () => {
    const url = `/api/logistica/oraculo/preparations/${evidenceCaseId}/evidence`;
    const doc = await prismaGlobal.uploadedDocument.findUniqueOrThrow({ where: { id: documentId } });
    const filePath = path.join(uploadRoot, doc.storageKey);
    const check = async (status: string) => {
      const response = await request.get(url).set("Authorization", authorization(tokens.owner));
      assert.equal(response.status, 200); assert.equal(response.body.data.items[0].integrity, status);
      assert.equal((await request.get(`${url}/${documentId}/file`).set("Authorization", authorization(tokens.owner))).status, 409);
    };
    const altered = Buffer.from(fileBytes); altered[0] ^= 1;
    await writeFile(filePath, altered); await check("integrity_mismatch");
    await rm(filePath); await check("file_unavailable");
    await writeFile(filePath, fileBytes);
    await prismaGlobal.uploadedDocument.delete({ where: { id: documentId } }); await check("document_not_found");
    await prismaGlobal.uploadedDocument.create({ data: doc });
    assert.equal((await request.get(url).set("Authorization", authorization(tokens.owner))).body.data.items[0].integrity, "available");
  });
  await t.test("historical snapshots without evidences keep their original hash and can receive a first link", async () => {
    const created = await request.post("/api/logistica/oraculo/preparations").set("Authorization", authorization(tokens.owner)).send({ context: {} });
    // E3.1: o fixture original reescrevia a revisão existente (UPDATE), proibido pelo trigger append-only de governed_case_revisions.
    // O registro histórico (sem "evidences") agora é criado por INSERT, com caso e revisão 1 coerentes; as asserções são as originais.
    const legacy = { ...created.body.data, caseId: randomUUID() }; delete legacy.evidences;
    const snapshotHash = "sha256:" + createHash("sha256").update(canonicalizeGovernedJsonV1(legacy)).digest("hex");
    const legacyAt = new Date(legacy.createdAt);
    await prismaGlobal.governedCase.create({ data: { id: legacy.caseId, tenantId, workspaceId, caseType: ORACULO_PREPARATION_CASE_TYPE, schemaVersion: legacy.schemaVersion, revision: 1, lifecycle: "DISCOVERY",
      subject: { scenario: "empty_container_return" }, domainState: { preparationOnly: true, executionAllowed: false, externalTransmissionAllowed: false }, snapshot: legacy, snapshotHash, createdAt: legacyAt, updatedAt: legacyAt } });
    await prismaGlobal.governedCaseRevision.create({ data: { id: randomUUID(), tenantId, workspaceId, caseId: legacy.caseId, revision: 1, schemaVersion: legacy.schemaVersion, lifecycle: "DISCOVERY",
      snapshot: legacy, snapshotHash, fromLifecycle: null, toLifecycle: "DISCOVERY", actorType: "user", actorRef: owner, transitionCode: "oraculo.preparation.created", createdAt: legacyAt } });
    const read = await request.get(`/api/logistica/oraculo/preparations/${legacy.caseId}`).set("Authorization", authorization(tokens.owner));
    assert.equal(read.status, 200); assert.equal("evidences" in read.body.data, false);
    const linked = await request.post(`/api/logistica/oraculo/preparations/${legacy.caseId}/evidence`).set("Authorization", authorization(tokens.owner)).send({ documentId, kind: "receipt", sourceDescription: "Legacy test", expectedRevision: 1 });
    assert.equal(linked.status, 200); assert.equal(linked.body.data.revision, 2);
    const history = await request.get(`/api/logistica/oraculo/preparations/${legacy.caseId}/revisions`).set("Authorization", authorization(tokens.owner));
    assert.equal(history.status, 200); assert.equal("evidences" in history.body.data.items[0], false);
  });
  await t.test("document review uses a separate exact-workspace grant and strict human observations", async () => {
    const created = await request.post("/api/logistica/oraculo/preparations").set("Authorization", authorization(tokens.owner)).send({ context: { depot: { status: "informed", value: "Depósito A" } }, operationReference: { containerNumber: "MSCU1234567", returnDate: "2026-10-17" } });
    assert.equal(created.status, 201); reviewCaseId = created.body.data.caseId;
    const base = `/api/logistica/oraculo/preparations/${reviewCaseId}`;
    assert.equal((await request.post(base + "/evidence").set("Authorization", authorization(tokens.owner)).send({ documentId, expectedRevision: 1, kind: "receipt", sourceDescription: "Synthetic review fixture" })).status, 200);
    const command = { documentId, expectedRevision: 2, acknowledgedDocumentRead: true, locator: "Página 1, EIR", notes: "Conferência sintética", observations: { containerNumber: "MSCU1234567", depot: "Deposito A", returnDate: "2026-10-17", movement: "empty_return" } };
    assert.equal((await request.get(base + "/document-reviews").set("Authorization", authorization(tokens.owner))).body.data.reviewAllowed, false);
    assert.equal((await request.post(base + "/document-reviews").set("Authorization", authorization(tokens.owner)).send(command)).status, 403);
    await prismaGlobal.tenantActionPolicy.create({ data: { tenantId, workspaceId: null, actionName: ORACULO_CONTENT_REVIEW_SCOPE, allowed: true } });
    assert.equal((await request.post(base + "/document-reviews").set("Authorization", authorization(tokens.owner)).send(command)).status, 403);
    await prismaGlobal.tenantActionPolicy.create({ data: { tenantId, workspaceId, actionName: ORACULO_CONTENT_REVIEW_SCOPE, allowed: true } });
    for (const extra of [{ outcome: "approved" }, { reviewedBy: admin }, { costClosure: true }, { acknowledgedDocumentRead: false }]) assert.equal((await request.post(base + "/document-reviews").set("Authorization", authorization(tokens.owner)).send({ ...command, ...extra })).status, 400);
    const response = await request.post(base + "/document-reviews").set("Authorization", authorization(tokens.owner)).send(command);
    assert.equal(response.status, 200); assert.equal(response.body.data.revision, 3);
    const review = response.body.data.contentReviews[0]; assert.equal(review.outcome, "consistent_in_checked_fields");
    assert.equal(review.reviewedBy, owner); assert.equal(review.documentSha256, fileHash);
    assert.equal(review.operationalAuthorization, false); assert.equal(review.responsibilityClosure, false); assert.equal(review.costClosure, false);
    assert.equal(response.body.data.lifecycle, "DISCOVERY"); assert.equal(response.body.data.executionAllowed, false);
    const history = await request.get(base + "/revisions").set("Authorization", authorization(tokens.owner));
    assert.deepEqual(history.body.data.items.map((item: { contentReviews?: unknown[] }) => item.contentReviews?.length ?? 0), [0, 0, 1]);
    assert.equal((await request.get(base + "/document-reviews").set("Authorization", authorization(tokens.owner))).body.data.items[0].state, "current");
    assert.equal((await request.post(base + "/document-reviews").set("Authorization", authorization(tokens.owner)).send(command)).status, 409);
    assert.equal((await request.get(base + "/document-reviews").set("Authorization", authorization(tokens.other))).status, 404);
    assert.equal((await request.post(base + "/document-reviews").set("Authorization", authorization(tokens.other)).send({ ...command, expectedRevision: 3 })).status, 403);
    await prismaGlobal.tenantActionPolicy.create({ data: { tenantId, workspaceId: otherWorkspace, actionName: ORACULO_CONTENT_REVIEW_SCOPE, allowed: true } });
    assert.equal((await request.post(base + "/document-reviews").set("Authorization", authorization(tokens.other)).send({ ...command, expectedRevision: 3 })).status, 404);
  });
  await t.test("context changes invalidate correspondence and later divergent readings supersede prior ones", async () => {
    const base = `/api/logistica/oraculo/preparations/${reviewCaseId}`;
    const updated = await request.patch(base).set("Authorization", authorization(tokens.owner)).send({ expectedRevision: 3, context: { depot: { status: "informed", value: "Depósito B" } } });
    assert.equal(updated.status, 200); assert.equal(updated.body.data.operationReference.containerNumber, "MSCU1234567");
    assert.equal(updated.body.data.contentReviews.length, 1);
    let reviews = await request.get(base + "/document-reviews").set("Authorization", authorization(tokens.owner));
    assert.equal(reviews.body.data.items[0].state, "context_changed");
    const command = { documentId, expectedRevision: 4, acknowledgedDocumentRead: true, locator: "Página 1", notes: "Divergência textual no depósito", observations: { containerNumber: "MSCU1234567", depot: "Depósito A", returnDate: "2026-10-17", movement: "empty_return" } };
    const reviewed = await request.post(base + "/document-reviews").set("Authorization", authorization(tokens.owner)).send(command);
    assert.equal(reviewed.status, 200); assert.equal(reviewed.body.data.contentReviews[1].outcome, "divergent");
    reviews = await request.get(base + "/document-reviews").set("Authorization", authorization(tokens.owner));
    assert.equal(reviews.body.data.items[0].state, "current"); assert.equal(reviews.body.data.items[1].state, "superseded");
    assert.equal(reviews.body.data.operationalValidation, "not_performed");
    const doc = await prismaGlobal.uploadedDocument.findUniqueOrThrow({ where: { id: documentId } });
    const altered = Buffer.from(fileBytes); altered[0] ^= 1; await writeFile(path.join(uploadRoot, doc.storageKey), altered);
    reviews = await request.get(base + "/document-reviews").set("Authorization", authorization(tokens.owner));
    assert.equal(reviews.body.data.items[0].state, "file_unavailable");
    assert.equal((await request.post(base + "/document-reviews").set("Authorization", authorization(tokens.owner)).send({ ...command, expectedRevision: 5 })).status, 409);
    await writeFile(path.join(uploadRoot, doc.storageKey), fileBytes);
  });
  await t.test("revocation preserves read-only, blocks reactivation and total block removes the domain", async () => {
    const revoke = (action: string, mode: string) => request.post(`/api/admin/vertical-approvals/${approvalId}/revocation`).set("Authorization", authorization(tokens.admin)).send({ action, mode, note: "Synthetic revocation" });
    assert.equal((await revoke("revogar", "somente_leitura")).status, 200);
    const readOnly = await request.get("/api/session/context?domain=logistica").set("Authorization", authorization(tokens.owner));
    assert.equal(readOnly.status, 200); assert.equal(readOnly.body.data.capabilities.logisticaContext.usage, "read_only");
    const reviewBase = `/api/logistica/oraculo/preparations/${reviewCaseId}/document-reviews`;
    assert.equal((await request.get(reviewBase).set("Authorization", authorization(tokens.owner))).body.data.reviewAllowed, false);
    assert.equal((await request.post(reviewBase).set("Authorization", authorization(tokens.owner)).send({ documentId, expectedRevision: 5 })).status, 403);
    const evidenceUrl = `/api/logistica/oraculo/preparations/${evidenceCaseId}/evidence`;
    assert.equal((await request.get(`${evidenceUrl}/${documentId}/file`).set("Authorization", authorization(tokens.owner))).status, 200);
    assert.equal((await request.post(evidenceUrl).set("Authorization", authorization(tokens.owner)).send({ documentId, kind: "receipt", sourceDescription: "Read only test", expectedRevision: 3 })).status, 403);
    assert.equal((await request.post("/api/uploads?agentSlug=oraculo-sc").set("Authorization", authorization(tokens.owner)).attach("files", fileBytes, "readonly.txt")).status, 403);
    const base = "/api/logistica/oraculo/preparations";
    const readable = await request.get(base).set("Authorization", authorization(tokens.owner));
    assert.equal(readable.status, 200); assert.equal(readable.body.data.writeAllowed, false);
    assert.equal((await request.post(base).set("Authorization", authorization(tokens.owner)).send({ context: {} })).status, 403);
    assert.equal((await request.patch(`${base}/${preparationId}`).set("Authorization", authorization(tokens.owner)).send({ expectedRevision: 2, context: {} })).status, 403);
    assert.equal((await request.post("/api/marketplace/installations/activate").set("Authorization", authorization(tokens.owner)).send({ product: "LOGISTICA" })).status, 403);
    assert.equal((await revoke("alterar_modo", "bloqueio_total")).status, 200);
    assert.equal((await request.get("/api/session/context?domain=logistica").set("Authorization", authorization(tokens.owner))).status, 403);
    assert.equal((await request.get("/api/logistica/oraculo/preparations").set("Authorization", authorization(tokens.owner))).status, 403);
    assert.equal((await request.get(`/api/uploads/${documentId}`).set("Authorization", authorization(tokens.owner))).status, 403);
    assert.equal((await request.get(`${evidenceUrl}/${documentId}/file`).set("Authorization", authorization(tokens.owner))).status, 403);
    const core = await request.get("/api/session/context").set("Authorization", authorization(tokens.owner));
    assert.equal(core.status, 200); assert.equal(core.body.data.availableDomains.includes("logistica"), false);
  });
  await t.test("revoked tokens cannot retain context", async () => {
    assert.equal((await request.get("/api/logistica/oraculo/preparations").set("Authorization", authorization(tokens.other))).status, 200);
    await prismaGlobal.apiToken.updateMany({ where: { token: tokens.owner }, data: { revoked: true } });
    assert.equal((await request.get("/api/session/context?domain=logistica").set("Authorization", authorization(tokens.owner))).status, 401);
    assert.equal((await request.get("/api/logistica/oraculo/preparations").set("Authorization", authorization(tokens.owner))).status, 401);
  });
});
