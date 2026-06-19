import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildScopedStorageKey,
  createLocalStorageProvider,
  createObjectStorageProvider,
  createStorageProviderFromEnv,
  type ObjectStorageClient,
} from "../services/storageProvider";

let tmpDir = "";

before(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), "eiah-storage-provider-"));
});

after(async () => {
  if (tmpDir) {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

describe("storage provider", () => {
  it("creates tenant/workspace scoped keys in local mode and reads them back", async () => {
    const provider = createLocalStorageProvider({ rootDir: tmpDir });
    const persisted = await provider.putObject({
      buffer: Buffer.from("contrato", "utf8"),
      originalName: "contrato.docx",
      scope: {
        tenantId: "tenant-storage-test",
        workspaceId: "workspace-storage-test",
      },
    });

    assert.match(
      persisted.storageKey,
      /^tenant-storage-test\/workspace-storage-test\/[a-f0-9-]+\.docx$/,
    );
    assert.equal(await provider.exists(persisted.storageKey), true);
    assert.equal((await provider.getObject(persisted.storageKey))?.toString("utf8"), "contrato");
    assert.ok((await provider.getAbsolutePath?.(persisted.storageKey))?.startsWith(tmpDir));
  });

  it("preserves legacy unscoped key compatibility in local mode", async () => {
    const provider = createLocalStorageProvider({ rootDir: tmpDir });
    const persisted = await provider.putObject({
      buffer: Buffer.from("legacy", "utf8"),
      originalName: "legacy.docx",
    });

    assert.match(persisted.storageKey, /^[a-f0-9-]+\.docx$/);
    assert.equal((await provider.getObject(persisted.storageKey))?.toString("utf8"), "legacy");
  });

  it("blocks path traversal in local mode", async () => {
    const provider = createLocalStorageProvider({ rootDir: tmpDir });
    await assert.rejects(() => provider.getObject("../etc/passwd"), /storageKey inválido|fora do root permitido/);
  });

  it("defaults to local provider in test env when STORAGE_PROVIDER is unset", () => {
    const previous = process.env.STORAGE_PROVIDER;
    delete process.env.STORAGE_PROVIDER;
    try {
      const provider = createStorageProviderFromEnv({ localRootDir: tmpDir });
      assert.equal(provider.kind, "local");
    } finally {
      if (typeof previous === "string") process.env.STORAGE_PROVIDER = previous;
    }
  });

  it("supports object storage adapter with fake client", async () => {
    const objects = new Map<string, Buffer>();
    const fakeClient: ObjectStorageClient = {
      async putObject(params) {
        objects.set(`${params.bucket}/${params.key}`, params.body);
      },
      async getObject(params) {
        return objects.get(`${params.bucket}/${params.key}`) ?? null;
      },
      async exists(params) {
        return objects.has(`${params.bucket}/${params.key}`);
      },
      async deleteObject(params) {
        objects.delete(`${params.bucket}/${params.key}`);
      },
    };

    const provider = createObjectStorageProvider({
      bucket: "bucket-test",
      prefix: "imob-uploads",
      client: fakeClient,
    });

    const persisted = await provider.putObject({
      buffer: Buffer.from("obj", "utf8"),
      originalName: "arquivo.docx",
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      scope: {
        tenantId: "tenant-object-test",
        workspaceId: "workspace-object-test",
      },
    });

    assert.equal(
      buildScopedStorageKey({
        tenantId: "tenant-object-test",
        workspaceId: "workspace-object-test",
        originalName: "arquivo.docx",
        objectId: persisted.storageKey.split("/").at(-1)?.replace(/\.docx$/, ""),
      }).endsWith(".docx"),
      true,
    );
    assert.match(
      persisted.storageKey,
      /^imob-uploads\/tenant-object-test\/workspace-object-test\/[a-f0-9-]+\.docx$/,
    );
    assert.equal(await provider.exists(persisted.storageKey), true);
    assert.equal((await provider.getObject(persisted.storageKey))?.toString("utf8"), "obj");
    await provider.deleteObject(persisted.storageKey);
    assert.equal(await provider.exists(persisted.storageKey), false);
  });

  it("requires OBJECT_STORAGE_BUCKET in object mode", () => {
    assert.throws(() => createObjectStorageProvider({ bucket: "   " }), /OBJECT_STORAGE_BUCKET obrigatório/);
  });

  it("fails closed when STORAGE_PROVIDER=object and OBJECT_STORAGE_BUCKET is missing", () => {
    const previous = {
      STORAGE_PROVIDER: process.env.STORAGE_PROVIDER,
      OBJECT_STORAGE_ADAPTER: process.env.OBJECT_STORAGE_ADAPTER,
      OBJECT_STORAGE_BUCKET: process.env.OBJECT_STORAGE_BUCKET,
      OBJECT_STORAGE_ENDPOINT: process.env.OBJECT_STORAGE_ENDPOINT,
      OBJECT_STORAGE_REGION: process.env.OBJECT_STORAGE_REGION,
      OBJECT_STORAGE_ACCESS_KEY_ID: process.env.OBJECT_STORAGE_ACCESS_KEY_ID,
      OBJECT_STORAGE_SECRET_ACCESS_KEY: process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY,
    };
    process.env.STORAGE_PROVIDER = "object";
    process.env.OBJECT_STORAGE_ADAPTER = "s3-compatible";
    delete process.env.OBJECT_STORAGE_BUCKET;
    process.env.OBJECT_STORAGE_ENDPOINT = "https://bucket.example.internal";
    process.env.OBJECT_STORAGE_REGION = "us-east-1";
    process.env.OBJECT_STORAGE_ACCESS_KEY_ID = "test-access";
    process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY = "test-secret";
    try {
      assert.throws(
        () => createStorageProviderFromEnv({ localRootDir: tmpDir }),
        /OBJECT_STORAGE_BUCKET obrigatório/,
      );
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (typeof value === "string") process.env[key] = value;
        else delete process.env[key];
      }
    }
  });

  it("fails closed when STORAGE_PROVIDER=object and adapter env is missing", () => {
    const previous = {
      STORAGE_PROVIDER: process.env.STORAGE_PROVIDER,
      OBJECT_STORAGE_ADAPTER: process.env.OBJECT_STORAGE_ADAPTER,
      OBJECT_STORAGE_BUCKET: process.env.OBJECT_STORAGE_BUCKET,
    };
    process.env.STORAGE_PROVIDER = "object";
    delete process.env.OBJECT_STORAGE_ADAPTER;
    process.env.OBJECT_STORAGE_BUCKET = "bucket-test";
    try {
      assert.throws(
        () => createStorageProviderFromEnv({ localRootDir: tmpDir }),
        /OBJECT_STORAGE_ADAPTER obrigatório/,
      );
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (typeof value === "string") process.env[key] = value;
        else delete process.env[key];
      }
    }
  });

  it("fails closed with explicit NO-GO message when object env is otherwise complete but no real adapter exists", () => {
    const previous = {
      STORAGE_PROVIDER: process.env.STORAGE_PROVIDER,
      OBJECT_STORAGE_ADAPTER: process.env.OBJECT_STORAGE_ADAPTER,
      OBJECT_STORAGE_BUCKET: process.env.OBJECT_STORAGE_BUCKET,
      OBJECT_STORAGE_PREFIX: process.env.OBJECT_STORAGE_PREFIX,
      OBJECT_STORAGE_ENDPOINT: process.env.OBJECT_STORAGE_ENDPOINT,
      OBJECT_STORAGE_REGION: process.env.OBJECT_STORAGE_REGION,
      OBJECT_STORAGE_ACCESS_KEY_ID: process.env.OBJECT_STORAGE_ACCESS_KEY_ID,
      OBJECT_STORAGE_SECRET_ACCESS_KEY: process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY,
      OBJECT_STORAGE_FORCE_PATH_STYLE: process.env.OBJECT_STORAGE_FORCE_PATH_STYLE,
    };
    process.env.STORAGE_PROVIDER = "object";
    process.env.OBJECT_STORAGE_ADAPTER = "s3-compatible";
    process.env.OBJECT_STORAGE_BUCKET = "bucket-test";
    process.env.OBJECT_STORAGE_PREFIX = "uploads";
    process.env.OBJECT_STORAGE_ENDPOINT = "https://bucket.example.internal";
    process.env.OBJECT_STORAGE_REGION = "us-east-1";
    process.env.OBJECT_STORAGE_ACCESS_KEY_ID = "test-access";
    process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY = "test-secret";
    process.env.OBJECT_STORAGE_FORCE_PATH_STYLE = "true";
    try {
      assert.throws(
        () => createStorageProviderFromEnv({ localRootDir: tmpDir }),
        /Multi-instancia permanece NO-GO/,
      );
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (typeof value === "string") process.env[key] = value;
        else delete process.env[key];
      }
    }
  });
});
