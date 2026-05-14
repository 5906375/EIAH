import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import { searchImobKnowledge } from "../services/imob/imobKnowledgeSearch";
import { readImobWebSyncSnapshot, syncImobWebFromManifest } from "../services/imob/imobWebSync";

test("IMOB web sync writes latest snapshot and exposes sync evidence", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "imob-web-sync-"));
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
            externalId: "web-doc-1",
            title: "Guia de venda residencial - Curitiba",
            href: "https://conteudo.imob.example/pr/guia-venda-curitiba",
            mimeType: "text/html",
            section: "guias/venda",
            tags: ["venda", "curitiba", "guia"],
            region: "Paraná",
            segment: "venda",
            operationType: "negociacao",
            documentType: "guia",
          },
        ],
      },
      null,
      2
    )
  );

  const snapshot = await syncImobWebFromManifest({
    manifestPath,
    outputPath,
    now: "2026-05-14T12:00:00.000Z",
  });

  assert.equal(snapshot.totalDocuments, 1);
  assert.equal(snapshot.syncedAt, "2026-05-14T12:00:00.000Z");
  const persisted = await readImobWebSyncSnapshot(outputPath);
  assert.ok(persisted);
  assert.equal(persisted?.documents[0]?.title, "Guia de venda residencial - Curitiba");
  assert.equal(persisted?.documents[0]?.metadataJson?.sourceDomain, "conteudo.imob.example");
});

test("IMOB knowledge search reads synced web documents before seeded web catalog", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "imob-web-sync-search-"));
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
            externalId: "web-doc-2",
            title: "Checklist web de captação em Joinville",
            href: "https://conteudo.imob.example/sc/checklist-captacao-joinville",
            mimeType: "text/html",
            section: "captacao/locacao",
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

  await syncImobWebFromManifest({ manifestPath, outputPath });
  const previousPath = process.env.IMOB_WEB_SYNC_LATEST_PATH;
  process.env.IMOB_WEB_SYNC_LATEST_PATH = outputPath;

  try {
    const result = await searchImobKnowledge({
      tenantId: "tenant-A",
      workspaceId: "workspace-A",
      query: "checklist captação joinville",
      filters: {
        region: "Santa Catarina",
        segment: "locacao",
        sourceTypes: ["web"],
      },
    });

    assert.ok(result.total >= 1);
    assert.equal(result.items[0]?.sourceType, "web");
    assert.equal(result.items[0]?.source.origin, "web_snapshot");
    assert.equal(result.items[0]?.source.syncedAt != null, true);
    assert.equal(result.searchContext.provenance.webSyncActive, true);
    assert.equal(result.searchContext.provenance.totalWebSnapshotDocuments, 1);
    assert.match(result.items[0]?.href ?? "", /conteudo\.imob\.example\/sc\/checklist-captacao-joinville/);
  } finally {
    if (previousPath === undefined) {
      delete process.env.IMOB_WEB_SYNC_LATEST_PATH;
    } else {
      process.env.IMOB_WEB_SYNC_LATEST_PATH = previousPath;
    }
  }
});
