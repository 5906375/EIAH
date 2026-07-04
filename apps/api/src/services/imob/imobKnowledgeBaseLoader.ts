import fs from "node:fs";
import path from "node:path";

export const IMOB_KB_ALLOWED_CATEGORIES = ["playbooks", "policies", "templates", "glossary", "checklists"] as const;
export const IMOB_KB_ALLOWED_RISK_LEVELS = ["low", "medium", "high", "critical"] as const;
export const IMOB_KB_ALLOWED_SOURCE_KINDS = ["internal_doc", "drive", "upload", "web", "canonical_policy"] as const;
export const IMOB_KB_ALLOWED_SCOPE_VALUES = ["tenant", "workspace", "role_scoped"] as const;
export const IMOB_KB_ALLOWED_STATUS = ["draft", "reviewed"] as const;

const ALLOWED_CATEGORIES = new Set<string>(IMOB_KB_ALLOWED_CATEGORIES);
const ALLOWED_RISK_LEVELS = new Set<string>(IMOB_KB_ALLOWED_RISK_LEVELS);
const ALLOWED_SOURCE_KINDS = new Set<string>(IMOB_KB_ALLOWED_SOURCE_KINDS);
const ALLOWED_SCOPE_VALUES = new Set<string>(IMOB_KB_ALLOWED_SCOPE_VALUES);
const ALLOWED_STATUS = new Set<string>(IMOB_KB_ALLOWED_STATUS);
const CORE_DISALLOWED_USES = new Set([
  "automatic_price_decision",
  "automatic_contract_finalization",
  "automatic_approval_decision",
]);
const SENSITIVE_HINTS = [
  "negoci",
  "contrat",
  "preco",
  "avalia",
  "document",
  "sensivel",
  "sensível",
  "aprov",
  "proposta",
  "jurid",
  "juríd",
];

export type ImobKnowledgeCategory = (typeof IMOB_KB_ALLOWED_CATEGORIES)[number];
export type ImobKnowledgeRiskLevel = (typeof IMOB_KB_ALLOWED_RISK_LEVELS)[number];
export type ImobKnowledgeSourceKind = (typeof IMOB_KB_ALLOWED_SOURCE_KINDS)[number];
export type ImobKnowledgeAllowedScope = (typeof IMOB_KB_ALLOWED_SCOPE_VALUES)[number];
export type ImobKnowledgeStatus = (typeof IMOB_KB_ALLOWED_STATUS)[number];

export type ImobKnowledgeManifestEntry = {
  id: string;
  path: string;
  category: ImobKnowledgeCategory;
  version: string;
};

export type ImobKnowledgeManifest = {
  kbId: string;
  schemaVersion: string;
  version: string;
  title: string;
  description: string;
  lastUpdated: string;
  entrySchemaRef: string;
  categories: ImobKnowledgeCategory[];
  entries: ImobKnowledgeManifestEntry[];
};

export type ImobKnowledgeEntry = {
  id: string;
  title: string;
  category: ImobKnowledgeCategory;
  version: string;
  summary: string;
  content: {
    body: string;
    checklist?: string[];
    notes?: string[];
  };
  source: {
    kind: ImobKnowledgeSourceKind;
    ref: string;
    authority: "primary" | "secondary" | "advisory";
  };
  lastUpdated: string;
  riskLevel: ImobKnowledgeRiskLevel;
  requiresHumanReview: boolean;
  allowedScopes: ImobKnowledgeAllowedScope[];
  disallowedUses: string[];
  tags: string[];
  owners: string[];
  status: ImobKnowledgeStatus;
};

export type ImobKnowledgeBasePaths = {
  rootDir: string;
  kbRoot: string;
  manifestPath: string;
  entrySchemaPath: string;
  manifestSchemaPath: string;
};

export type ImobKnowledgeBaseLoadResult = {
  paths: ImobKnowledgeBasePaths;
  manifest: ImobKnowledgeManifest;
  entries: ImobKnowledgeEntry[];
  filesValidated: string[];
  loadedAt: string;
};

export type ImobKnowledgeBaseShadowEntry = Pick<
  ImobKnowledgeEntry,
  "id" | "title" | "category" | "version" | "source" | "lastUpdated" | "riskLevel" | "requiresHumanReview" | "allowedScopes" | "disallowedUses" | "status"
>;

export type ImobKnowledgeBaseShadowSnapshot = {
  shadowMode: true;
  source: "imob_kb_manifest_v1";
  kbId: string;
  manifestVersion: string;
  entryCount: number;
  categories: ImobKnowledgeCategory[];
  loadedAt: string;
  audit: {
    manifestPath: string;
    filesValidated: string[];
    entrySchemaPath: string;
    manifestSchemaPath: string;
  };
  entries: ImobKnowledgeBaseShadowEntry[];
};

export class ImobKnowledgeBaseLoaderError extends Error {
  code: string;
  details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "ImobKnowledgeBaseLoaderError";
    this.code = code;
    this.details = details;
  }
}

function fail(code: string, message: string, details?: Record<string, unknown>): never {
  throw new ImobKnowledgeBaseLoaderError(code, message, details);
}

function readJson(filePath: string) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, unknown>;
  } catch (error) {
    fail("JSON_PARSE_FAILED", "Failed to parse JSON file", {
      file: filePath,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function ensureString(value: unknown, field: string, file: string, minLength = 1) {
  if (typeof value !== "string" || value.trim().length < minLength) {
    fail("INVALID_STRING_FIELD", "Invalid string field", { file, field, value });
  }
  return value.trim();
}

function ensureArray(value: unknown, field: string, file: string) {
  if (!Array.isArray(value)) {
    fail("INVALID_ARRAY_FIELD", "Invalid array field", { file, field, value });
  }
  return value;
}

function isValidDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function normalizeText(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function collectSensitiveSignals(record: Record<string, unknown>) {
  const haystack = normalizeText(JSON.stringify(record));
  return SENSITIVE_HINTS.filter((hint) => haystack.includes(normalizeText(hint)));
}

function pathInsideKb(paths: ImobKnowledgeBasePaths, relativePath: string) {
  const absolute = path.resolve(paths.rootDir, relativePath);
  const relative = path.relative(paths.kbRoot, absolute);
  return !relative.startsWith("..") && !path.isAbsolute(relative);
}

function listCategoryJsonFiles(paths: ImobKnowledgeBasePaths) {
  const categoriesRoot = path.resolve(paths.kbRoot, "categories");
  const files: string[] = [];

  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith(".json")) {
        files.push(path.relative(paths.rootDir, fullPath).replace(/\\/g, "/"));
      }
    }
  }

  walk(categoriesRoot);
  return files.sort();
}

function toRelative(rootDir: string, filePath: string) {
  return path.relative(rootDir, filePath).replace(/\\/g, "/");
}

export function resolveImobKnowledgeBasePaths(options?: { rootDir?: string; manifestPath?: string }): ImobKnowledgeBasePaths {
  const rootDir = path.resolve(options?.rootDir ?? process.cwd());
  const manifestPath = options?.manifestPath
    ? path.resolve(rootDir, options.manifestPath)
    : path.resolve(rootDir, "knowledge/imob/manifest.v1.json");
  const kbRoot = path.dirname(manifestPath);

  return {
    rootDir,
    kbRoot,
    manifestPath,
    entrySchemaPath: path.resolve(kbRoot, "schema/imob-knowledge-entry.v1.schema.json"),
    manifestSchemaPath: path.resolve(kbRoot, "schema/imob-knowledge-manifest.v1.schema.json"),
  };
}

function validateManifestShape(paths: ImobKnowledgeBasePaths, manifestRaw: Record<string, unknown>): ImobKnowledgeManifest {
  const file = toRelative(paths.rootDir, paths.manifestPath);
  const kbId = ensureString(manifestRaw.kbId, "kbId", file, 3);
  if (kbId !== "imob-knowledge-base") {
    fail("INVALID_MANIFEST_KB_ID", "Invalid manifest kbId", { file, value: kbId });
  }

  const schemaVersion = ensureString(manifestRaw.schemaVersion, "schemaVersion", file, 3);
  if (schemaVersion !== "imob-kb-manifest.v1") {
    fail("INVALID_MANIFEST_SCHEMA_VERSION", "Invalid manifest schemaVersion", { file, value: schemaVersion });
  }

  const version = ensureString(manifestRaw.version, "version", file, 2);
  if (!/^v\d+$/.test(version)) {
    fail("INVALID_MANIFEST_VERSION", "Invalid manifest version", { file, value: version });
  }

  const title = ensureString(manifestRaw.title, "title", file, 3);
  const description = ensureString(manifestRaw.description, "description", file, 10);
  const lastUpdated = ensureString(manifestRaw.lastUpdated, "lastUpdated", file, 10);
  if (!isValidDateOnly(lastUpdated)) {
    fail("INVALID_MANIFEST_LAST_UPDATED", "Invalid manifest lastUpdated", { file, value: lastUpdated });
  }

  const entrySchemaRef = ensureString(manifestRaw.entrySchemaRef, "entrySchemaRef", file, 3);
  if (!pathInsideKb(paths, entrySchemaRef) || !fs.existsSync(path.resolve(paths.rootDir, entrySchemaRef))) {
    fail("INVALID_MANIFEST_ENTRY_SCHEMA_REF", "Invalid manifest entrySchemaRef", { file, value: entrySchemaRef });
  }

  const categoriesRaw = ensureArray(manifestRaw.categories, "categories", file);
  if (categoriesRaw.length === 0) {
    fail("MANIFEST_CATEGORIES_EMPTY", "Manifest categories cannot be empty", { file });
  }
  const categories = categoriesRaw.map((category) => {
    const normalized = ensureString(category, "categories[]", file, 3);
    if (!ALLOWED_CATEGORIES.has(normalized)) {
      fail("INVALID_MANIFEST_CATEGORY", "Invalid manifest category", { file, category: normalized });
    }
    return normalized as ImobKnowledgeCategory;
  });

  const entriesRaw = ensureArray(manifestRaw.entries, "entries", file);
  if (entriesRaw.length === 0) {
    fail("MANIFEST_ENTRIES_EMPTY", "Manifest entries cannot be empty", { file });
  }
  const entries = entriesRaw.map((entryRaw) => {
    if (typeof entryRaw !== "object" || entryRaw === null || Array.isArray(entryRaw)) {
      fail("INVALID_MANIFEST_ENTRY", "Manifest entry must be an object", { file, entry: entryRaw });
    }
    const entryFile = file;
    const id = ensureString(entryRaw.id, "entries[].id", entryFile, 3);
    const entryPath = ensureString(entryRaw.path, "entries[].path", entryFile, 3).replace(/\\/g, "/");
    const category = ensureString(entryRaw.category, "entries[].category", entryFile, 3);
    if (!ALLOWED_CATEGORIES.has(category)) {
      fail("INVALID_MANIFEST_ENTRY_CATEGORY", "Invalid manifest entry category", { file, id, category });
    }
    const entryVersion = ensureString(entryRaw.version, "entries[].version", entryFile, 2);
    if (entryVersion !== version) {
      fail("MANIFEST_ENTRY_VERSION_MISMATCH", "Manifest entry version mismatch", {
        file,
        id,
        manifestVersion: version,
        entryVersion,
      });
    }
    if (!entryPath.startsWith("knowledge/imob/categories/")) {
      fail("MANIFEST_ENTRY_PATH_OUTSIDE_CATEGORIES", "Manifest entry path outside categories", { file, id, entryPath });
    }
    if (!pathInsideKb(paths, entryPath)) {
      fail("MANIFEST_ENTRY_PATH_OUTSIDE_KB", "Manifest entry path outside KB", { file, id, entryPath });
    }
    return {
      id,
      path: entryPath,
      category: category as ImobKnowledgeCategory,
      version: entryVersion,
    };
  });

  return {
    kbId,
    schemaVersion,
    version,
    title,
    description,
    lastUpdated,
    entrySchemaRef,
    categories,
    entries,
  };
}

function validateManifestEntriesExist(paths: ImobKnowledgeBasePaths, manifest: ImobKnowledgeManifest) {
  const seenIds = new Set<string>();
  for (const entry of manifest.entries) {
    if (seenIds.has(entry.id)) {
      fail("DUPLICATE_MANIFEST_ENTRY_ID", "Duplicate manifest entry id", {
        file: toRelative(paths.rootDir, paths.manifestPath),
        id: entry.id,
      });
    }
    seenIds.add(entry.id);
    const absolute = path.resolve(paths.rootDir, entry.path);
    if (!fs.existsSync(absolute)) {
      fail("ENTRY_FILE_MISSING", "Entry file listed in manifest is missing", {
        file: toRelative(paths.rootDir, paths.manifestPath),
        entryId: entry.id,
        entryPath: entry.path,
      });
    }
  }
}

function validateEntryShape(
  paths: ImobKnowledgeBasePaths,
  entryRaw: Record<string, unknown>,
  manifestEntry: ImobKnowledgeManifestEntry,
): ImobKnowledgeEntry {
  const file = manifestEntry.path;

  const id = ensureString(entryRaw.id, "id", file, 3);
  if (id !== manifestEntry.id) {
    fail("ENTRY_ID_MISMATCH", "Entry id mismatch", { file, manifestId: manifestEntry.id, entryId: id });
  }

  const title = ensureString(entryRaw.title, "title", file, 3);
  const category = ensureString(entryRaw.category, "category", file, 3);
  if (!ALLOWED_CATEGORIES.has(category) || category !== manifestEntry.category) {
    fail("ENTRY_CATEGORY_MISMATCH", "Entry category mismatch", {
      file,
      manifestCategory: manifestEntry.category,
      entryCategory: category,
    });
  }

  const version = ensureString(entryRaw.version, "version", file, 2);
  if (!/^v\d+$/.test(version) || version !== manifestEntry.version) {
    fail("ENTRY_VERSION_MISMATCH", "Entry version mismatch", {
      file,
      manifestVersion: manifestEntry.version,
      entryVersion: version,
    });
  }

  const summary = ensureString(entryRaw.summary, "summary", file, 10);

  if (typeof entryRaw.content !== "object" || entryRaw.content === null || Array.isArray(entryRaw.content)) {
    fail("INVALID_ENTRY_CONTENT", "Entry content must be an object", { file });
  }
  const contentRaw = entryRaw.content as Record<string, unknown>;
  const body = ensureString(contentRaw.body, "content.body", file, 20);
  const checklist = "checklist" in contentRaw
    ? ensureArray(contentRaw.checklist, "content.checklist", file).map((item) =>
        ensureString(item, "content.checklist[]", file, 2))
    : undefined;
  const notes = "notes" in contentRaw
    ? ensureArray(contentRaw.notes, "content.notes", file).map((item) =>
        ensureString(item, "content.notes[]", file, 2))
    : undefined;

  if (typeof entryRaw.source !== "object" || entryRaw.source === null || Array.isArray(entryRaw.source)) {
    fail("INVALID_ENTRY_SOURCE", "Entry source must be an object", { file });
  }
  const sourceRaw = entryRaw.source as Record<string, unknown>;
  const sourceKind = ensureString(sourceRaw.kind, "source.kind", file, 3);
  if (!ALLOWED_SOURCE_KINDS.has(sourceKind)) {
    fail("INVALID_SOURCE_KIND", "Invalid source kind", { file, sourceKind });
  }
  const sourceRef = ensureString(sourceRaw.ref, "source.ref", file, 3);
  const authority = ensureString(sourceRaw.authority, "source.authority", file, 3);
  if (!["primary", "secondary", "advisory"].includes(authority)) {
    fail("INVALID_SOURCE_AUTHORITY", "Invalid source authority", { file, authority });
  }

  const lastUpdated = ensureString(entryRaw.lastUpdated, "lastUpdated", file, 10);
  if (!isValidDateOnly(lastUpdated)) {
    fail("INVALID_ENTRY_LAST_UPDATED", "Invalid entry lastUpdated", { file, lastUpdated });
  }

  const riskLevel = ensureString(entryRaw.riskLevel, "riskLevel", file, 2);
  if (!ALLOWED_RISK_LEVELS.has(riskLevel)) {
    fail("INVALID_RISK_LEVEL", "Invalid riskLevel", { file, riskLevel });
  }

  if (typeof entryRaw.requiresHumanReview !== "boolean") {
    fail("INVALID_REQUIRES_HUMAN_REVIEW", "requiresHumanReview must be boolean", {
      file,
      value: entryRaw.requiresHumanReview,
    });
  }
  const requiresHumanReview = entryRaw.requiresHumanReview;

  const allowedScopes = ensureArray(entryRaw.allowedScopes, "allowedScopes", file).map((scope) => {
    const normalized = ensureString(scope, "allowedScopes[]", file, 3);
    if (!ALLOWED_SCOPE_VALUES.has(normalized)) {
      fail("INVALID_ALLOWED_SCOPE", "Invalid allowed scope", { file, scope: normalized });
    }
    return normalized as ImobKnowledgeAllowedScope;
  });
  if (allowedScopes.length === 0) {
    fail("ALLOWED_SCOPES_EMPTY", "allowedScopes cannot be empty", { file });
  }

  const disallowedUses = ensureArray(entryRaw.disallowedUses, "disallowedUses", file).map((item) =>
    ensureString(item, "disallowedUses[]", file, 3));
  const tags = ensureArray(entryRaw.tags, "tags", file).map((item) => ensureString(item, "tags[]", file, 2));
  const owners = ensureArray(entryRaw.owners, "owners", file).map((item) => ensureString(item, "owners[]", file, 2));
  const status = ensureString(entryRaw.status, "status", file, 3);
  if (!ALLOWED_STATUS.has(status)) {
    fail("INVALID_STATUS", "Invalid status", { file, status });
  }

  const candidateEntry: ImobKnowledgeEntry = {
    id,
    title,
    category: category as ImobKnowledgeCategory,
    version,
    summary,
    content: {
      body,
      ...(checklist ? { checklist } : {}),
      ...(notes ? { notes } : {}),
    },
    source: {
      kind: sourceKind as ImobKnowledgeSourceKind,
      ref: sourceRef,
      authority: authority as "primary" | "secondary" | "advisory",
    },
    lastUpdated,
    riskLevel: riskLevel as ImobKnowledgeRiskLevel,
    requiresHumanReview,
    allowedScopes,
    disallowedUses,
    tags,
    owners,
    status: status as ImobKnowledgeStatus,
  };

  const sensitiveSignals = collectSensitiveSignals(candidateEntry as unknown as Record<string, unknown>);
  const sensitiveByRisk = candidateEntry.riskLevel === "high" || candidateEntry.riskLevel === "critical";
  const sensitive = sensitiveByRisk || sensitiveSignals.length > 0;

  if (sensitive && candidateEntry.requiresHumanReview !== true) {
    fail("SENSITIVE_ENTRY_REQUIRES_HUMAN_REVIEW", "Sensitive entry must require human review", {
      file,
      riskLevel: candidateEntry.riskLevel,
      sensitiveSignals,
    });
  }

  if (sensitive && candidateEntry.disallowedUses.length === 0) {
    fail("SENSITIVE_ENTRY_REQUIRES_DISALLOWED_USES", "Sensitive entry must declare disallowed uses", {
      file,
      riskLevel: candidateEntry.riskLevel,
      sensitiveSignals,
    });
  }

  if (!candidateEntry.disallowedUses.some((value) => CORE_DISALLOWED_USES.has(value))) {
    fail("ENTRY_MISSING_CORE_DISALLOWED_USE_GUARD", "Entry must include a core disallowed use guard", {
      file,
      disallowedUses: candidateEntry.disallowedUses,
    });
  }

  return candidateEntry;
}

export function loadImobKnowledgeBase(options?: { rootDir?: string; manifestPath?: string }): ImobKnowledgeBaseLoadResult {
  const paths = resolveImobKnowledgeBasePaths(options);

  if (!fs.existsSync(paths.manifestPath)) {
    fail("MANIFEST_MISSING", "Knowledge base manifest is missing", {
      file: toRelative(paths.rootDir, paths.manifestPath),
    });
  }
  if (!fs.existsSync(paths.entrySchemaPath)) {
    fail("ENTRY_SCHEMA_MISSING", "Knowledge base entry schema is missing", {
      file: toRelative(paths.rootDir, paths.entrySchemaPath),
    });
  }
  if (!fs.existsSync(paths.manifestSchemaPath)) {
    fail("MANIFEST_SCHEMA_MISSING", "Knowledge base manifest schema is missing", {
      file: toRelative(paths.rootDir, paths.manifestSchemaPath),
    });
  }

  const manifest = validateManifestShape(paths, readJson(paths.manifestPath));
  validateManifestEntriesExist(paths, manifest);

  const manifestPaths = new Set(manifest.entries.map((entry) => entry.path.replace(/\\/g, "/")));
  const categoryFiles = listCategoryJsonFiles(paths);
  for (const categoryFile of categoryFiles) {
    if (!manifestPaths.has(categoryFile)) {
      fail("CATEGORY_FILE_NOT_LISTED_IN_MANIFEST", "Category file not listed in manifest", { file: categoryFile });
    }
  }

  const entries = manifest.entries.map((manifestEntry) => {
    const absolute = path.resolve(paths.rootDir, manifestEntry.path);
    return validateEntryShape(paths, readJson(absolute), manifestEntry);
  });

  return {
    paths,
    manifest,
    entries,
    filesValidated: categoryFiles,
    loadedAt: new Date().toISOString(),
  };
}

export function buildImobKnowledgeBaseShadowSnapshot(
  result: ImobKnowledgeBaseLoadResult,
): ImobKnowledgeBaseShadowSnapshot {
  return {
    shadowMode: true,
    source: "imob_kb_manifest_v1",
    kbId: result.manifest.kbId,
    manifestVersion: result.manifest.version,
    entryCount: result.entries.length,
    categories: result.manifest.categories,
    loadedAt: result.loadedAt,
    audit: {
      manifestPath: toRelative(result.paths.rootDir, result.paths.manifestPath),
      filesValidated: result.filesValidated,
      entrySchemaPath: toRelative(result.paths.rootDir, result.paths.entrySchemaPath),
      manifestSchemaPath: toRelative(result.paths.rootDir, result.paths.manifestSchemaPath),
    },
    entries: result.entries.map((entry) => ({
      id: entry.id,
      title: entry.title,
      category: entry.category,
      version: entry.version,
      source: entry.source,
      lastUpdated: entry.lastUpdated,
      riskLevel: entry.riskLevel,
      requiresHumanReview: entry.requiresHumanReview,
      allowedScopes: entry.allowedScopes,
      disallowedUses: entry.disallowedUses,
      status: entry.status,
    })),
  };
}
