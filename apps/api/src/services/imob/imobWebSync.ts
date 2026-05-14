import fs from "node:fs/promises";
import path from "node:path";

export type ImobWebManifestDocument = {
  tenantId: string;
  workspaceId: string;
  externalId: string;
  title: string;
  href: string;
  mimeType?: string | null;
  section?: string | null;
  tags?: string[] | null;
  region?: string | null;
  segment?: "locacao" | "venda" | "ambos" | null;
  operationType?: string | null;
  documentType?: string | null;
  updatedAt?: string | null;
};

export type ImobWebSyncDocument = {
  id: string;
  tenantId: string;
  workspaceId: string;
  sourceType: "web";
  externalId: string;
  title: string;
  href: string;
  mimeType: string;
  section: string | null;
  tags: string[];
  region: string;
  segment: "locacao" | "venda" | "ambos";
  operationType: string;
  documentType: string;
  metadataJson: Record<string, unknown>;
  updatedAt: string;
};

export type ImobWebSyncSnapshot = {
  syncVersion: "v1";
  syncedAt: string;
  sourcePath: string;
  totalDocuments: number;
  totalsByWorkspace: Array<{
    tenantId: string;
    workspaceId: string;
    totalDocuments: number;
  }>;
  documents: ImobWebSyncDocument[];
};

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())
    : [];
}

function resolveHost(href: string) {
  try {
    return new URL(href).host;
  } catch {
    return null;
  }
}

function normalizeDocument(doc: ImobWebManifestDocument, index: number): ImobWebSyncDocument {
  const tenantId = asString(doc.tenantId);
  const workspaceId = asString(doc.workspaceId);
  const externalId = asString(doc.externalId, `web-doc-${index + 1}`);
  const title = asString(doc.title, `Conteúdo web IMOB ${index + 1}`);
  const href = asString(doc.href);
  if (!tenantId || !workspaceId || !href) {
    throw new Error(`Invalid IMOB web manifest entry at index ${index}`);
  }

  return {
    id: `web-${tenantId}-${workspaceId}-${externalId}`.replace(/[^a-zA-Z0-9-_]/g, "-"),
    tenantId,
    workspaceId,
    sourceType: "web",
    externalId,
    title,
    href,
    mimeType: asString(doc.mimeType, "text/html"),
    section: asString(doc.section, "") || null,
    tags: asStringArray(doc.tags),
    region: asString(doc.region, "Brasil"),
    segment:
      doc.segment === "locacao" || doc.segment === "venda" || doc.segment === "ambos" ? doc.segment : "ambos",
    operationType: asString(doc.operationType, "knowledge_search"),
    documentType: asString(doc.documentType, "guia"),
    metadataJson: {
      section: asString(doc.section, "") || null,
      importedFrom: "web-manifest",
      sourceDomain: resolveHost(href),
      hrefStrategy: "direct",
    },
    updatedAt: asString(doc.updatedAt, new Date().toISOString()),
  };
}

export function getImobWebSyncLatestPath() {
  return process.env.IMOB_WEB_SYNC_LATEST_PATH
    ? path.resolve(process.env.IMOB_WEB_SYNC_LATEST_PATH)
    : path.resolve(process.cwd(), "ops/evidence/latest/imob-web-sync-latest.json");
}

export function getImobWebSyncDefaultManifestPath() {
  return process.env.IMOB_WEB_SYNC_SOURCE
    ? path.resolve(process.env.IMOB_WEB_SYNC_SOURCE)
    : path.resolve(process.cwd(), "ops/verticals/imob-web-manifest.sample.json");
}

export async function readImobWebSyncSnapshot(filePath = getImobWebSyncLatestPath()) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as ImobWebSyncSnapshot;
    if (!parsed || parsed.syncVersion !== "v1" || !Array.isArray(parsed.documents)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function syncImobWebFromManifest(params?: {
  manifestPath?: string;
  outputPath?: string;
  now?: string;
}) {
  const manifestPath = params?.manifestPath ? path.resolve(params.manifestPath) : getImobWebSyncDefaultManifestPath();
  const outputPath = params?.outputPath ? path.resolve(params.outputPath) : getImobWebSyncLatestPath();
  const raw = await fs.readFile(manifestPath, "utf8");
  const parsed = JSON.parse(raw) as { documents?: unknown };
  const docsRaw = isObject(parsed) && Array.isArray(parsed.documents) ? parsed.documents : [];
  const documents = docsRaw.map((entry, index) => normalizeDocument(entry as ImobWebManifestDocument, index));

  const totalsMap = new Map<string, { tenantId: string; workspaceId: string; totalDocuments: number }>();
  for (const doc of documents) {
    const key = `${doc.tenantId}:${doc.workspaceId}`;
    const existing = totalsMap.get(key);
    if (existing) existing.totalDocuments += 1;
    else totalsMap.set(key, { tenantId: doc.tenantId, workspaceId: doc.workspaceId, totalDocuments: 1 });
  }

  const snapshot: ImobWebSyncSnapshot = {
    syncVersion: "v1",
    syncedAt: params?.now ?? new Date().toISOString(),
    sourcePath: manifestPath,
    totalDocuments: documents.length,
    totalsByWorkspace: [...totalsMap.values()],
    documents,
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(snapshot, null, 2));
  return snapshot;
}
