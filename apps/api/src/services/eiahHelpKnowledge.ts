import { promises as fs } from "node:fs";
import path from "node:path";
import type { PrismaClient } from "@repo/db";
import type { MemoryRecord, MemoryScope } from "@eiah/core";
import { getMemoryService } from "./memory";

const HELP_AGENT_ID = "EIAH_HELP_CENTER";
const HELP_SOURCE_TAG = "eiah_help_doc";
const HELP_PLAYBOOK_TAG = "eiah_help_playbook";
const MAX_FILES = 500;
const MAX_FILE_BYTES = 512 * 1024;
const DEFAULT_TOP_K = 6;
const PRIMARY_HELP_SOURCE_FILES = [
  "apps/web/src/pages/app/agents/index.tsx",
  "apps/web/src/pages/self-service/config.ts",
];

type HelpSearchHit = {
  key: string;
  title: string;
  sourcePath: string;
  score: number;
  snippet: string;
};

type HelpQueryResult = {
  seededNow: boolean;
  indexedDocs: number;
  indexedChunks: number;
  hits: HelpSearchHit[];
};

type HelpSeedResult = {
  seeded: boolean;
  docs: number;
  chunks: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function tokenize(text: string) {
  return normalizeText(text)
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length >= 2);
}

function buildTitleFromContent(sourcePath: string, content: string) {
  const heading = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith("#"));
  if (heading) {
    return heading.replace(/^#+\s*/, "").trim();
  }
  const base = path.basename(sourcePath).replace(/\.[^.]+$/, "");
  return base || sourcePath;
}

function chunkContent(content: string, size = 1800, overlap = 240) {
  const clean = content.trim();
  if (!clean) return [];
  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < clean.length) {
    const end = Math.min(clean.length, cursor + size);
    chunks.push(clean.slice(cursor, end));
    if (end >= clean.length) break;
    cursor = Math.max(0, end - overlap);
  }
  return chunks;
}

function stripQuotes(value: string) {
  const trimmed = value.trim();
  if ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseArrayItems(block: string, key: string) {
  const regex = new RegExp(`${key}\\s*:\\s*\\[([\\s\\S]*?)\\]`, "m");
  const match = block.match(regex);
  if (!match) return [] as string[];
  return match[1]
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("\"") || line.startsWith("'"))
    .map((line) => line.replace(/,$/, ""))
    .map(stripQuotes)
    .filter(Boolean);
}

function parseStringField(block: string, key: string) {
  const regex = new RegExp(`${key}\\s*:\\s*([\"'][\\s\\S]*?[\"'])`, "m");
  const match = block.match(regex);
  if (!match) return "";
  return stripQuotes(match[1]);
}

function extractEiahPlaybookFromAgentsPage(content: string) {
  const blockMatch = content.match(/eiah\s*:\s*\{([\s\S]*?)\n\s*\},\n\s*fallback\s*:/m);
  if (!blockMatch) return null;
  const block = blockMatch[1];
  const title = parseStringField(block, "title") || "Central de Ajuda EIAH";
  const intro = parseStringField(block, "intro");
  const routes = parseArrayItems(block, "routes");
  const directives = parseArrayItems(block, "directives");
  const checklist = parseStringField(block, "checklist");

  const composed = [
    `# ${title}`,
    intro ? `\n## Introducao\n${intro}` : "",
    routes.length > 0 ? `\n## Roteiros principais\n${routes.map((line) => `- ${line}`).join("\n")}` : "",
    directives.length > 0 ? `\n## Diretrizes criticas\n${directives.map((line) => `- ${line}`).join("\n")}` : "",
    checklist ? `\n## Checklist\n${checklist}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    title,
    content: composed.trim(),
  };
}

async function loadPrimaryHelpRecords(baseDir: string) {
  const records: MemoryRecord[] = [];
  const now = new Date();

  for (const source of PRIMARY_HELP_SOURCE_FILES) {
    const absolutePath = path.join(baseDir, source);
    const stat = await fs.stat(absolutePath).catch(() => null);
    if (!stat || !stat.isFile() || stat.size > MAX_FILE_BYTES) continue;
    const raw = await fs.readFile(absolutePath, "utf8").catch(() => "");
    if (!raw.trim()) continue;

    if (source.endsWith("apps/web/src/pages/app/agents/index.tsx")) {
      const playbook = extractEiahPlaybookFromAgentsPage(raw);
      if (!playbook || !playbook.content) continue;
      const chunks = chunkContent(playbook.content, 1200, 120);
      chunks.forEach((chunk, index) => {
        records.push({
          key: `help:${source}:playbook:chunk:${index + 1}`,
          content: chunk,
          metadata: {
            sourceTag: HELP_SOURCE_TAG,
            sourceKind: HELP_PLAYBOOK_TAG,
            sourcePath: source,
            title: playbook.title,
            chunkIndex: index + 1,
            chunkTotal: chunks.length,
            sourceMtime: stat.mtime.toISOString(),
          },
          createdAt: now,
        });
      });
      continue;
    }

    const fallbackTitle = buildTitleFromContent(source, raw);
    const chunks = chunkContent(raw);
    chunks.forEach((chunk, index) => {
      records.push({
        key: `help:${source}:chunk:${index + 1}`,
        content: chunk,
        metadata: {
          sourceTag: HELP_SOURCE_TAG,
          sourcePath: source,
          title: fallbackTitle,
          chunkIndex: index + 1,
          chunkTotal: chunks.length,
          sourceMtime: stat.mtime.toISOString(),
        },
        createdAt: now,
      });
    });
  }

  return records;
}

async function fileExists(target: string) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function findRepoRoot() {
  let current = process.cwd();
  for (let i = 0; i < 6; i += 1) {
    if (await fileExists(path.join(current, "pnpm-workspace.yaml"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return process.cwd();
}

async function collectMarkdownFiles(baseDir: string) {
  const roots = [
    path.join(baseDir, "README.md"),
    path.join(baseDir, "docs"),
    path.join(baseDir, "apps"),
    path.join(baseDir, "packages"),
  ];

  const files = new Set<string>();

  async function walk(target: string) {
    if (files.size >= MAX_FILES) return;
    const stat = await fs.stat(target).catch(() => null);
    if (!stat) return;
    if (stat.isFile()) {
      const ext = path.extname(target).toLowerCase();
      const basename = path.basename(target).toLowerCase();
      const isDocFile = ext === ".md" || ext === ".mdx" || ext === ".txt";
      const isReadme = basename === "readme.md" || basename === "readme.mdx";
      if (isDocFile || isReadme) files.add(target);
      return;
    }
    if (!stat.isDirectory()) return;
    const entries = await fs.readdir(target, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (files.size >= MAX_FILES) break;
      const name = entry.name.toLowerCase();
      if (name === "node_modules" || name === ".git" || name === "dist" || name === "build") continue;
      await walk(path.join(target, entry.name));
    }
  }

  for (const root of roots) {
    await walk(root);
  }
  return Array.from(files);
}

function scoreRecord(record: MemoryRecord, query: string) {
  const metadata = (record.metadata ?? {}) as Record<string, unknown>;
  const sourcePath = String(metadata.sourcePath ?? "");
  const title = String(metadata.title ?? "");
  const content = record.content ?? "";
  const normalizedQuery = normalizeText(query);
  const tokens = tokenize(query);
  const normalizedContent = normalizeText(content);
  const normalizedTitle = normalizeText(title);
  const normalizedPath = normalizeText(sourcePath);

  let score = 0;
  if (normalizedContent.includes(normalizedQuery)) score += 5;
  if (normalizedTitle.includes(normalizedQuery)) score += 8;
  if (normalizedPath.includes(normalizedQuery)) score += 6;

  for (const token of tokens) {
    if (normalizedTitle.includes(token)) score += 3;
    if (normalizedPath.includes(token)) score += 2;
    if (normalizedContent.includes(token)) score += 1;
  }

  return score;
}

function buildSnippet(content: string, query: string) {
  const compact = content.replace(/\s+/g, " ").trim();
  if (!compact) return "";
  const needle = normalizeText(query);
  const haystack = normalizeText(compact);
  const idx = haystack.indexOf(needle);
  if (idx < 0) return compact.slice(0, 260);
  const start = Math.max(0, idx - 100);
  const end = Math.min(compact.length, idx + 180);
  return compact.slice(start, end).trim();
}

async function loadHelpRecords(baseDir: string) {
  const files = await collectMarkdownFiles(baseDir);
  const records: MemoryRecord[] = [];
  const now = new Date();

  for (const absolutePath of files) {
    const stat = await fs.stat(absolutePath).catch(() => null);
    if (!stat || !stat.isFile() || stat.size > MAX_FILE_BYTES) continue;
    const raw = await fs.readFile(absolutePath, "utf8").catch(() => "");
    const content = raw.trim();
    if (!content) continue;
    const sourcePath = path.relative(baseDir, absolutePath);
    const title = buildTitleFromContent(sourcePath, content);
    const chunks = chunkContent(content);
    chunks.forEach((chunk, index) => {
      records.push({
        key: `help:${sourcePath}:chunk:${index + 1}`,
        content: chunk,
        metadata: {
          sourceTag: HELP_SOURCE_TAG,
          sourcePath,
          title,
          chunkIndex: index + 1,
          chunkTotal: chunks.length,
          sourceMtime: stat.mtime.toISOString(),
        },
        createdAt: now,
      });
    });
  }

  return records;
}

async function getExistingHelpKeys(memoryScope: MemoryScope, prisma: PrismaClient) {
  const memory = getMemoryService(memoryScope.tenantId, memoryScope.workspaceId, prisma);
  const snapshot = await memory.snapshot(memoryScope, { topK: 5000 });
  return new Set(
    snapshot.longTerm
      .filter((record) => {
        const metadata = (record.metadata ?? {}) as Record<string, unknown>;
        return metadata.sourceTag === HELP_SOURCE_TAG;
      })
      .map((record) => record.key)
  );
}

async function seedDocsIfNeeded(memoryScope: MemoryScope, prisma: PrismaClient): Promise<HelpSeedResult> {
  const repoRoot = await findRepoRoot();
  const memory = getMemoryService(memoryScope.tenantId, memoryScope.workspaceId, prisma);
  const primaryDocs = await loadPrimaryHelpRecords(repoRoot);
  const docs = primaryDocs.length > 0 ? primaryDocs : await loadHelpRecords(repoRoot);
  if (docs.length === 0) {
    return { seeded: false, docs: 0, chunks: 0 };
  }

  const existingKeys = await getExistingHelpKeys(memoryScope, prisma);
  const toInsert = docs.filter((record) => !existingKeys.has(record.key));
  if (toInsert.length === 0) {
    const uniqueDocs = new Set(
      docs.map((record) => String(((record.metadata ?? {}) as Record<string, unknown>).sourcePath ?? ""))
    );
    return { seeded: false, docs: uniqueDocs.size, chunks: docs.length };
  }

  await memory.promoteToLongTerm(memoryScope, toInsert);

  const docsCount = new Set(
    toInsert.map((record) => String(((record.metadata ?? {}) as Record<string, unknown>).sourcePath ?? ""))
  ).size;

  return { seeded: true, docs: docsCount, chunks: toInsert.length };
}

export async function seedEiahHelpKnowledge(params: {
  tenantId: string;
  workspaceId: string;
  prisma: PrismaClient;
}) {
  const scope: MemoryScope = {
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    agentId: HELP_AGENT_ID,
  };
  return seedDocsIfNeeded(scope, params.prisma);
}

export async function queryEiahHelpKnowledge(params: {
  tenantId: string;
  workspaceId: string;
  prisma: PrismaClient;
  query: string;
  topK?: number;
}) {
  const query = params.query.trim();
  if (!query) {
    return {
      seededNow: false,
      indexedDocs: 0,
      indexedChunks: 0,
      hits: [],
    } satisfies HelpQueryResult;
  }

  const scope: MemoryScope = {
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    agentId: HELP_AGENT_ID,
  };

  const seedResult = await seedDocsIfNeeded(scope, params.prisma);
  const memory = getMemoryService(params.tenantId, params.workspaceId, params.prisma);
  const snapshot = await memory.snapshot(scope, { topK: 5000 });
  const docs = snapshot.longTerm.filter((record) => {
    const metadata = (record.metadata ?? {}) as Record<string, unknown>;
    return metadata.sourceTag === HELP_SOURCE_TAG;
  });

  const canonicalDocs = docs.filter((record) => {
    const metadata = (record.metadata ?? {}) as Record<string, unknown>;
    const sourcePath = String(metadata.sourcePath ?? "");
    const sourceKind = String(metadata.sourceKind ?? "");
    return sourceKind === HELP_PLAYBOOK_TAG || PRIMARY_HELP_SOURCE_FILES.includes(sourcePath);
  });

  const docsForQueryBase = canonicalDocs.length > 0 ? canonicalDocs : docs;
  const latestMtimeByPath = new Map<string, string>();
  docsForQueryBase.forEach((record) => {
    const metadata = (record.metadata ?? {}) as Record<string, unknown>;
    const sourcePath = String(metadata.sourcePath ?? "");
    const sourceMtime = String(metadata.sourceMtime ?? "");
    const current = latestMtimeByPath.get(sourcePath);
    if (!current || sourceMtime > current) {
      latestMtimeByPath.set(sourcePath, sourceMtime);
    }
  });
  const docsForQuery = docsForQueryBase.filter((record) => {
    const metadata = (record.metadata ?? {}) as Record<string, unknown>;
    const sourcePath = String(metadata.sourcePath ?? "");
    const sourceMtime = String(metadata.sourceMtime ?? "");
    return latestMtimeByPath.get(sourcePath) === sourceMtime;
  });

  const scored = docsForQuery
    .map((record) => {
      const metadata = (record.metadata ?? {}) as Record<string, unknown>;
      const score = scoreRecord(record, query);
      return {
        key: record.key,
        title: String(metadata.title ?? "Documento EIAH"),
        sourcePath: String(metadata.sourcePath ?? "desconhecido"),
        score,
        snippet: buildSnippet(record.content, query),
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  const topK = clamp(params.topK ?? DEFAULT_TOP_K, 1, 20);

  return {
    seededNow: seedResult.seeded,
    indexedDocs: new Set(docsForQuery.map((item) => String(((item.metadata ?? {}) as Record<string, unknown>).sourcePath))).size,
    indexedChunks: docsForQuery.length,
    hits: scored.slice(0, topK),
  } satisfies HelpQueryResult;
}
