import "./support/testInfraEnv.js";
import { after, before, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import supertest from "supertest";
import { closePrismaResources, prismaGlobal } from "@repo/db";
import { finalizeHttpContractCleanup } from "./support/httpContractCleanup.js";
import { imobRunCompletedQueue } from "../queues/imobRunCompletedQueue.js";
import { runAtivoUniversalDLQ, runAtivoUniversalQueue } from "@eiah/core";

const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const tenantId = `tenant-upload-storage-${suffix}`;
const workspaceId = `workspace-upload-storage-${suffix}`;
const userId = `user-upload-storage-${suffix}`;
const apiToken = `tok-upload-storage-${suffix}`;

let request: ReturnType<typeof supertest>;
let uploadsDir = "";

async function closeWithTimeout(promise: Promise<unknown>, timeoutMs = 1500) {
  await Promise.race([
    promise.catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

before(async () => {
  uploadsDir = await mkdtemp(path.join(os.tmpdir(), "eiah-upload-storage-"));
  process.env.NODE_ENV = "test";
  process.env.UPLOADS_DIR = uploadsDir;
  process.env.STORAGE_PROVIDER = "local";
  const { default: app } = await import("../index");
  request = supertest(app);

  await prismaGlobal.tenant.create({ data: { id: tenantId, name: tenantId } });
  await prismaGlobal.workspace.create({ data: { id: workspaceId, tenantId, name: workspaceId } });
  await prismaGlobal.user.create({
    data: { id: userId, tenantId, email: `${userId}@example-test.internal`, displayName: "Uploads Storage Tester" },
  });
  await prismaGlobal.apiToken.create({
    data: {
      token: apiToken,
      tenantId,
      workspaceId,
      userId,
      description: "uploads-storage-provider-test",
      revoked: false,
    },
  });
});

after(async () => {
  await prismaGlobal.uploadedDocument.deleteMany({ where: { tenantId } });
  await prismaGlobal.apiToken.deleteMany({ where: { tenantId } });
  await prismaGlobal.user.deleteMany({ where: { tenantId } });
  await prismaGlobal.workspace.deleteMany({ where: { tenantId } });
  await prismaGlobal.tenant.deleteMany({ where: { id: tenantId } });
  await closeWithTimeout(closePrismaResources());
  finalizeHttpContractCleanup();
  await closeWithTimeout(imobRunCompletedQueue.close());
  await closeWithTimeout(runAtivoUniversalQueue.close());
  await closeWithTimeout(runAtivoUniversalDLQ.close());
  if (uploadsDir) {
    await rm(uploadsDir, { recursive: true, force: true });
  }
});

it("streams stored upload back through the configured local provider", async () => {
  const uploadRes = await request
    .post("/api/uploads")
    .set("Authorization", `Bearer ${apiToken}`)
    .field("agentSlug", "imob")
    .attach("files", Buffer.from("arquivo de teste", "utf8"), {
      filename: "contrato.txt",
      contentType: "text/plain",
    });

  assert.equal(uploadRes.status, 200, JSON.stringify(uploadRes.body));
  assert.equal(uploadRes.body.ok, true);
  const uploaded = uploadRes.body.data?.[0];
  assert.ok(uploaded?.id, "upload must return document id");

  const stored = await prismaGlobal.uploadedDocument.findFirst({
    where: { id: uploaded.id, tenantId, workspaceId },
  });
  assert.ok(stored, "uploadedDocument must exist");
  assert.match(stored.storageKey, new RegExp(`^${tenantId}/${workspaceId}/`));

  const downloadRes = await request
    .get(`/api/uploads/${uploaded.id}`)
    .set("Authorization", `Bearer ${apiToken}`)
    .buffer(true)
    .parse((res, callback) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => callback(null, Buffer.concat(chunks)));
    });

  assert.equal(downloadRes.status, 200);
  assert.ok(downloadRes.headers["content-type"]?.includes("text/plain"));
  assert.equal((downloadRes.body as Buffer).toString("utf8"), "arquivo de teste");
});
