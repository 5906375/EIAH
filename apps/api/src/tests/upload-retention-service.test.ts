import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  cleanupExpiredUploadedDocuments,
  isUploadRetentionCandidate,
} from "../services/uploadRetentionService";

type UploadRecord = {
  id: string;
  tenantId: string;
  workspaceId: string;
  agentSlug: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  createdAt: Date;
};

function createFakeClient(seed: UploadRecord[]) {
  const docs = [...seed];
  return {
    docs,
    uploadedDocument: {
      async findMany(args: {
        where: {
          agentSlug: string;
          createdAt: { lte: Date };
          tenantId?: string;
          workspaceId?: string;
        };
        orderBy: { createdAt: "asc" };
        take: number;
      }) {
        return docs
          .filter((item) => item.agentSlug === args.where.agentSlug)
          .filter((item) => item.createdAt.getTime() <= args.where.createdAt.lte.getTime())
          .filter((item) => (args.where.tenantId ? item.tenantId === args.where.tenantId : true))
          .filter((item) => (args.where.workspaceId ? item.workspaceId === args.where.workspaceId : true))
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
          .slice(0, args.take);
      },
      async deleteMany(args: { where: { id: string; tenantId: string; workspaceId: string } }) {
        const before = docs.length;
        const kept = docs.filter(
          (item) =>
            !(
              item.id === args.where.id &&
              item.tenantId === args.where.tenantId &&
              item.workspaceId === args.where.workspaceId
            ),
        );
        docs.splice(0, docs.length, ...kept);
        return { count: before - docs.length };
      },
    },
  };
}

function makeDoc(overrides: Partial<UploadRecord> = {}): UploadRecord {
  return {
    id: overrides.id ?? "doc-1",
    tenantId: overrides.tenantId ?? "tenant-A",
    workspaceId: overrides.workspaceId ?? "workspace-A",
    agentSlug: overrides.agentSlug ?? "imob-intake",
    fileName: overrides.fileName ?? "contrato.docx",
    mimeType: overrides.mimeType ?? "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    sizeBytes: overrides.sizeBytes ?? 128,
    storageKey: overrides.storageKey ?? "tenant-A/workspace-A/doc-1.docx",
    createdAt: overrides.createdAt ?? new Date("2026-05-01T00:00:00.000Z"),
  };
}

describe("upload retention service", () => {
  it("marks expired IMOB intake documents as cleanup candidates", () => {
    assert.equal(
      isUploadRetentionCandidate(
        { agentSlug: "imob-intake", createdAt: new Date("2026-05-01T00:00:00.000Z") },
        new Date("2026-06-18T12:00:00.000Z"),
        30,
      ),
      true,
    );
    assert.equal(
      isUploadRetentionCandidate(
        { agentSlug: "imob", createdAt: new Date("2026-05-01T00:00:00.000Z") },
        new Date("2026-06-18T12:00:00.000Z"),
        30,
      ),
      false,
    );
  });

  it("deletes expired documents through the configured storage provider", async () => {
    const client = createFakeClient([makeDoc()]);
    const deletedKeys: string[] = [];
    const existingKeys = new Set(["tenant-A/workspace-A/doc-1.docx"]);

    const result = await cleanupExpiredUploadedDocuments({
      prisma: client,
      enabled: true,
      dryRun: false,
      now: new Date("2026-06-18T12:00:00.000Z"),
      deps: {
        objectExists: async (storageKey) => existingKeys.has(storageKey),
        deleteObject: async (storageKey) => {
          deletedKeys.push(storageKey);
          existingKeys.delete(storageKey);
        },
      },
    });

    assert.equal(result.mode, "delete");
    assert.equal(result.deleted, 1);
    assert.deepEqual(deletedKeys, ["tenant-A/workspace-A/doc-1.docx"]);
    assert.equal(client.docs.length, 0);
  });

  it("does not remove non-expired documents", async () => {
    const client = createFakeClient([
      makeDoc({
        id: "doc-fresh",
        storageKey: "tenant-A/workspace-A/doc-fresh.docx",
        createdAt: new Date("2026-06-10T00:00:00.000Z"),
      }),
    ]);

    const result = await cleanupExpiredUploadedDocuments({
      prisma: client,
      enabled: true,
      dryRun: false,
      now: new Date("2026-06-18T12:00:00.000Z"),
      retentionDays: 30,
      deps: {
        objectExists: async () => true,
        deleteObject: async () => undefined,
      },
    });

    assert.equal(result.scanned, 0);
    assert.equal(result.deleted, 0);
    assert.equal(client.docs.length, 1);
  });

  it("supports dry-run without deleting files or records", async () => {
    const client = createFakeClient([makeDoc()]);
    let deleteCalled = false;

    const result = await cleanupExpiredUploadedDocuments({
      prisma: client,
      enabled: true,
      dryRun: true,
      now: new Date("2026-06-18T12:00:00.000Z"),
      deps: {
        objectExists: async () => true,
        deleteObject: async () => {
          deleteCalled = true;
        },
      },
    });

    assert.equal(result.mode, "dry-run");
    assert.equal(result.wouldDelete, 1);
    assert.equal(deleteCalled, false);
    assert.equal(client.docs.length, 1);
  });

  it("preserves tenant/workspace scope when cleaning a filtered batch", async () => {
    const client = createFakeClient([
      makeDoc({ id: "doc-a", tenantId: "tenant-A", workspaceId: "workspace-A", storageKey: "tenant-A/workspace-A/doc-a.docx" }),
      makeDoc({ id: "doc-b", tenantId: "tenant-A", workspaceId: "workspace-B", storageKey: "tenant-A/workspace-B/doc-b.docx" }),
    ]);
    const deletedKeys: string[] = [];
    const existingKeys = new Set(["tenant-A/workspace-A/doc-a.docx", "tenant-A/workspace-B/doc-b.docx"]);

    const result = await cleanupExpiredUploadedDocuments({
      prisma: client,
      enabled: true,
      dryRun: false,
      tenantId: "tenant-A",
      workspaceId: "workspace-A",
      now: new Date("2026-06-18T12:00:00.000Z"),
      deps: {
        objectExists: async (storageKey) => existingKeys.has(storageKey),
        deleteObject: async (storageKey) => {
          deletedKeys.push(storageKey);
          existingKeys.delete(storageKey);
        },
      },
    });

    assert.equal(result.deleted, 1);
    assert.deepEqual(deletedKeys, ["tenant-A/workspace-A/doc-a.docx"]);
    assert.equal(client.docs.some((item) => item.id === "doc-b"), true);
  });

  it("treats legacy storage keys safely", async () => {
    const client = createFakeClient([
      makeDoc({ id: "doc-legacy", storageKey: "legacy-document.docx" }),
    ]);
    const existingKeys = new Set(["legacy-document.docx"]);

    const result = await cleanupExpiredUploadedDocuments({
      prisma: client,
      enabled: true,
      dryRun: false,
      now: new Date("2026-06-18T12:00:00.000Z"),
      deps: {
        objectExists: async (storageKey) => existingKeys.has(storageKey),
        deleteObject: async (storageKey) => {
          existingKeys.delete(storageKey);
        },
      },
    });

    assert.equal(result.deleted, 1);
    assert.equal(client.docs.length, 0);
  });

  it("keeps the DB record when object deletion fails", async () => {
    const client = createFakeClient([makeDoc()]);

    const result = await cleanupExpiredUploadedDocuments({
      prisma: client,
      enabled: true,
      dryRun: false,
      now: new Date("2026-06-18T12:00:00.000Z"),
      deps: {
        objectExists: async () => true,
        deleteObject: async () => {
          throw new Error("delete failed");
        },
      },
    });

    assert.equal(result.failed, 1);
    assert.equal(client.docs.length, 1);
  });

  it("removes the expired DB record when the object is already missing", async () => {
    const client = createFakeClient([makeDoc()]);

    const result = await cleanupExpiredUploadedDocuments({
      prisma: client,
      enabled: true,
      dryRun: false,
      now: new Date("2026-06-18T12:00:00.000Z"),
      deps: {
        objectExists: async () => false,
        deleteObject: async () => undefined,
      },
    });

    assert.equal(result.notFound, 1);
    assert.equal(client.docs.length, 0);
  });
});
