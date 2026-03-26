import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import supertest from "supertest";
import { prismaGlobal } from "@repo/db";
import { persistBuffer } from "../services/storage";
import { createUploadedDocument } from "../services/uploads";
import { upsertWorkspaceRoleConfig } from "../services/workspaceResponsibility";

let request: ReturnType<typeof supertest>;
let uploadsDir = "";

const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const tenantId = `tenant-imob-attach-${suffix}`;
const workspaceId = `workspace-imob-attach-${suffix}`;
const userId = `user-imob-attach-${suffix}`;
const apiToken = `tok-imob-attach-${suffix}`;

async function createTextUpload(name: string, content: string) {
  const persisted = await persistBuffer(Buffer.from(content, "utf8"), name);
  return createUploadedDocument({
    prisma: prismaGlobal,
    tenantId,
    workspaceId,
    agentSlug: "imob",
    fileName: name,
    mimeType: "text/plain",
    sizeBytes: Buffer.byteLength(content, "utf8"),
    storageKey: persisted.storageKey,
    url: `/api/uploads/${name}`,
  });
}

before(async () => {
  uploadsDir = await mkdtemp(path.join(os.tmpdir(), "imob-attach-validation-"));
  process.env.NODE_ENV = "test";
  process.env.UPLOADS_DIR = uploadsDir;
  const { default: app } = await import("../index");
  request = supertest(app);

  await prismaGlobal.tenant.create({ data: { id: tenantId, name: tenantId } });
  await prismaGlobal.workspace.create({ data: { id: workspaceId, tenantId, name: workspaceId } });
  await prismaGlobal.user.create({
    data: { id: userId, tenantId, email: `${userId}@example.com`, displayName: "IMOB Attachment Tester" },
  });
  await prismaGlobal.apiToken.create({
    data: {
      token: apiToken,
      tenantId,
      workspaceId,
      userId,
      description: "imob-attachment-validation-test",
      revoked: false,
    },
  });
});

after(async () => {
  await prismaGlobal.imobCaseEvent.deleteMany({ where: { tenantId } });
  await prismaGlobal.imobCase.deleteMany({ where: { tenantId } });
  await prismaGlobal.imobOwner.deleteMany({ where: { tenantId } });
  await prismaGlobal.uploadedDocument.deleteMany({ where: { tenantId } });
  await prismaGlobal.apiToken.deleteMany({ where: { tenantId } });
  await prismaGlobal.user.deleteMany({ where: { tenantId } });
  await prismaGlobal.workspace.deleteMany({ where: { tenantId } });
  await prismaGlobal.tenant.deleteMany({ where: { id: tenantId } });
  await prismaGlobal.$disconnect();
  if (uploadsDir) {
    await rm(uploadsDir, { recursive: true, force: true });
  }
});

test("IMOB attachment resolve validates owner document against case data", async () => {
  const owner = await prismaGlobal.imobOwner.create({
    data: {
      tenantId,
      workspaceId,
      name: "João Silva",
      document: "12345678901",
      status: "pending_data",
      pendingItems: ["ownerDocument"],
      metadata: { rg: "11222333" },
    },
  });
  const imobCase = await prismaGlobal.imobCase.create({
    data: {
      tenantId,
      workspaceId,
      flow: "owner.create",
      stage: "pending_data",
      status: "pending_data",
      ownerId: owner.id,
      threadId: `thread-${suffix}-ok`,
      pendingItems: ["ownerDocument"],
    },
  });
  const upload = await createTextUpload(
    "documento_proprietario.txt",
    ["Nome: João Silva", "CPF: 123.456.789-01", "RG: 11.222.333"].join("\n")
  );

  await upsertWorkspaceRoleConfig({
    prisma: prismaGlobal,
    tenantId,
    workspaceId,
    userId,
    roleLabels: ["Corretor", "Gestor"],
    selectedRoleKey: "corretor",
  });

  const response = await request
    .post("/api/imob/attachments/resolve")
    .set("Authorization", `Bearer ${apiToken}`)
    .send({ caseId: imobCase.id, threadId: imobCase.threadId, documentIds: [upload.id] });

  assert.equal(response.status, 200);
  assert.equal(response.body?.ok, true);
  assert.equal(response.body?.data?.resolved, true);
  assert.match(response.body?.data?.presentation?.text ?? "", /validado com os dados do caso/i);
  assert.equal(response.body?.data?.presentation?.card?.title, "Validação documental concluída");
  assert.match(response.body?.data?.presentation?.text ?? "", /Responsável agora: IMOB Attachment Tester \(Corretor\)\./i);
  assert.equal(response.body?.data?.presentation?.card?.lines?.[0]?.includes("Nome: Confere"), true);
  assert.equal(response.body?.data?.presentation?.card?.lines?.[1]?.includes("CPF: Confere"), true);
  assert.equal(response.body?.data?.presentation?.card?.lines?.[2]?.includes("RG: Confere"), true);

  const reloadedOwner = await prismaGlobal.imobOwner.findUnique({ where: { id: owner.id } });
  const reloadedCase = await prismaGlobal.imobCase.findUnique({ where: { id: imobCase.id } });
  assert.equal(Array.isArray(reloadedOwner?.pendingItems) ? reloadedOwner?.pendingItems.length : 0, 0);
  assert.equal(Array.isArray(reloadedCase?.pendingItems) ? reloadedCase?.pendingItems.length : 0, 0);
});

test("IMOB attachment resolve returns structured divergence when document conflicts with case", async () => {
  const owner = await prismaGlobal.imobOwner.create({
    data: {
      tenantId,
      workspaceId,
      name: "Maria Souza",
      document: "98765432100",
      status: "pending_data",
      pendingItems: ["ownerDocument"],
      metadata: { rg: "99888777" },
    },
  });
  const imobCase = await prismaGlobal.imobCase.create({
    data: {
      tenantId,
      workspaceId,
      flow: "owner.create",
      stage: "pending_data",
      status: "pending_data",
      ownerId: owner.id,
      threadId: `thread-${suffix}-diverge`,
      pendingItems: ["ownerDocument"],
    },
  });
  const upload = await createTextUpload(
    "documento_divergente.txt",
    ["Nome: Maria Souza", "CPF: 111.222.333-44", "RG: 99.888.777"].join("\n")
  );

  const response = await request
    .post("/api/imob/attachments/resolve")
    .set("Authorization", `Bearer ${apiToken}`)
    .send({ caseId: imobCase.id, threadId: imobCase.threadId, documentIds: [upload.id] });

  assert.equal(response.status, 200);
  assert.equal(response.body?.ok, true);
  assert.equal(response.body?.data?.resolved, false);
  assert.match(response.body?.data?.presentation?.text ?? "", /revise o documento anexado/i);
  assert.equal(response.body?.data?.presentation?.card?.title, "Validação documental pendente");
  assert.equal(response.body?.data?.presentation?.card?.lines?.[1]?.includes("CPF: Diverge"), true);

  const reloadedOwner = await prismaGlobal.imobOwner.findUnique({ where: { id: owner.id } });
  assert.deepEqual(reloadedOwner?.pendingItems, ["ownerDocument"]);
});
