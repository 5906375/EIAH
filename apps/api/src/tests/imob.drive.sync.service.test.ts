import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import { readImobDriveSyncSnapshot, syncImobDriveFromManifest } from "../services/imob/imobDriveSync";
import { searchImobKnowledge } from "../services/imob/imobKnowledgeSearch";

test("IMOB drive sync writes latest snapshot and exposes sync evidence", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "imob-drive-sync-"));
  const manifestPath = path.join(tempDir, "manifest.json");
  const outputPath = path.join(tempDir, "latest.json");

  await fs.writeFile(
    manifestPath,
    JSON.stringify(
      {
        documents: [
          {
            tenantId: "tenant-A",
            workspaceId: "workspace-A",
            externalId: "drive-doc-1",
            title: "Contrato de locação - Florianópolis",
            href: "https://drive.google.com/file/d/drive-doc-1/view",
            mimeType: "application/pdf",
            folderPath: "contratos/locacao",
            tags: ["contrato", "locacao", "florianopolis"],
            region: "Santa Catarina",
            segment: "locacao",
            operationType: "locacao",
            documentType: "contrato",
          },
        ],
      },
      null,
      2
    )
  );

  const snapshot = await syncImobDriveFromManifest({
    manifestPath,
    outputPath,
    now: "2026-03-21T15:00:00.000Z",
  });

  assert.equal(snapshot.totalDocuments, 1);
  assert.equal(snapshot.syncedAt, "2026-03-21T15:00:00.000Z");
  const persisted = await readImobDriveSyncSnapshot(outputPath);
  assert.ok(persisted);
  assert.equal(persisted?.documents[0]?.title, "Contrato de locação - Florianópolis");
  assert.match(persisted?.documents[0]?.href ?? "", /drive\.google\.com\/drive\/search\?/);
});

test("IMOB drive sync prioritizes exact file href when driveFileId is present", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "imob-drive-fileid-"));
  const manifestPath = path.join(tempDir, "manifest.json");
  const outputPath = path.join(tempDir, "latest.json");

  await fs.writeFile(
    manifestPath,
    JSON.stringify(
      {
        documents: [
          {
            tenantId: "tenant-A",
            workspaceId: "workspace-A",
            externalId: "drive-doc-fileid-1",
            driveFileId: "1AbCdEfGhIjKlMnOpQrStUvWxYz123456",
            title: "Contrato exato no Drive",
            href: "",
            mimeType: "application/pdf",
            folderPath: "contratos/exatos",
            tags: ["contrato", "exato"],
            region: "São Paulo",
            segment: "locacao",
            operationType: "locacao",
            documentType: "contrato",
          },
        ],
      },
      null,
      2
    )
  );

  const snapshot = await syncImobDriveFromManifest({ manifestPath, outputPath });
  assert.match(
    snapshot.documents[0]?.href ?? "",
    /drive\.google\.com\/file\/d\/1AbCdEfGhIjKlMnOpQrStUvWxYz123456\/view/
  );
  assert.equal(snapshot.documents[0]?.driveFileId, "1AbCdEfGhIjKlMnOpQrStUvWxYz123456");
});

test("IMOB knowledge search reads synced drive documents before seeded catalog", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "imob-drive-sync-search-"));
  const manifestPath = path.join(tempDir, "manifest.json");
  const outputPath = path.join(tempDir, "latest.json");

  await fs.writeFile(
    manifestPath,
    JSON.stringify(
      {
        documents: [
          {
            tenantId: "tenant-A",
            workspaceId: "workspace-A",
            externalId: "drive-doc-2",
            driveFileId: "1ZyXwVuTsRqPoNmLkJiHgFeDcBa654321",
            title: "Checklist de captação em Joinville",
            href: "",
            mimeType: "application/pdf",
            folderPath: "captacao/locacao",
            tags: ["captacao", "joinville", "locacao"],
            region: "Santa Catarina",
            segment: "locacao",
            operationType: "captacao",
            documentType: "checklist",
          },
        ],
      },
      null,
      2
    )
  );

  await syncImobDriveFromManifest({ manifestPath, outputPath });
  const previousPath = process.env.IMOB_DRIVE_SYNC_LATEST_PATH;
  process.env.IMOB_DRIVE_SYNC_LATEST_PATH = outputPath;

  try {
    const result = await searchImobKnowledge({
      tenantId: "tenant-A",
      workspaceId: "workspace-A",
      query: "captação Joinville",
      filters: {
        region: "Santa Catarina",
        segment: "locacao",
      },
    });

    assert.ok(result.total >= 1);
    assert.equal(result.items[0]?.sourceType, "drive");
    assert.match(result.items[0]?.title ?? "", /Joinville/i);
    assert.match(result.items[0]?.href ?? "", /drive\.google\.com\/file\/d\/1ZyXwVuTsRqPoNmLkJiHgFeDcBa654321\/view/);
  } finally {
    if (previousPath === undefined) {
      delete process.env.IMOB_DRIVE_SYNC_LATEST_PATH;
    } else {
      process.env.IMOB_DRIVE_SYNC_LATEST_PATH = previousPath;
    }
  }
});
