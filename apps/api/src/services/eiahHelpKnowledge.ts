import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import type { PrismaClient } from "@repo/db";
import type { MemoryRecord, MemoryScope } from "@eiah/core";
import { getMemoryService } from "./memory";
import { buildImobOnboardingHelpDocs } from "./eiahImobOnboardingHelpDocs";

const HELP_AGENT_ID = "EIAH_HELP_CENTER";
const HELP_SOURCE_TAG = "eiah_help_doc";
const HELP_PLAYBOOK_TAG = "eiah_help_playbook";
const HELP_CANONICAL_DOC_TAG = "eiah_help_canonical_doc";
const HELP_INDEX_VERSION = "v2";
const MAX_FILES = 500;
const MAX_FILE_BYTES = 512 * 1024;
const DEFAULT_TOP_K = 6;
const PRIMARY_HELP_SOURCE_FILES = [
  "apps/web/src/pages/app/agents/index.tsx",
  "apps/web/src/pages/self-service/config.ts",
  "docs/architecture/imob-crm-governed-runtime.md",
];

type HelpSearchHit = {
  key: string;
  docId?: string;
  title: string;
  sourcePath: string;
  score: number;
  snippet: string;
  tags?: string[];
  track?: "P0" | "P1" | "P2" | "P3" | "P4";
  status?: "evidenciado" | "parcial" | "proposta" | "canonica";
  sourceFiles?: string[];
};

type HelpQueryResult = {
  seededNow: boolean;
  indexedDocs: number;
  indexedChunks: number;
  hits: HelpSearchHit[];
  sourcesUsed?: string[];
  docIdsUsed?: string[];
  responseStatus?: "evidenciado" | "parcial" | "proposta" | "canonica";
};

type HelpSeedResult = {
  seeded: boolean;
  docs: number;
  chunks: number;
};

type HelpDoc = {
  id: string;
  scope: "eiah";
  question: string;
  answer: string;
  tags: string[];
  track?: "P0" | "P1" | "P2" | "P3" | "P4";
  status?: "evidenciado" | "parcial" | "proposta" | "canonica";
  sourceFiles: string[];
  updatedAt: string;
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

function hashContent(input: string) {
  return createHash("sha256").update(input).digest("hex");
}

function resolveGuardrailStatus(params: {
  metadata: Record<string, unknown>;
  sourceKind: string;
}): "evidenciado" | "parcial" | "proposta" | "canonica" {
  const status = params.metadata.status;
  if (status === "evidenciado" || status === "parcial" || status === "proposta" || status === "canonica") {
    return status;
  }
  if (params.sourceKind === HELP_CANONICAL_DOC_TAG) return "canonica";
  return "evidenciado";
}

function resolveTrack(metadata: Record<string, unknown>): "P0" | "P1" | "P2" | "P3" | "P4" | undefined {
  const track = metadata.track;
  if (track === "P0" || track === "P1" || track === "P2" || track === "P3" || track === "P4") {
    return track;
  }
  return undefined;
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

function parseQuotedStringList(block: string) {
  const regex = /"([^"\\]*(?:\\.[^"\\]*)*)"/g;
  const items: string[] = [];
  let match: RegExpExecArray | null = regex.exec(block);
  while (match) {
    const value = match[1].replace(/\\"/g, "\"").trim();
    if (value) items.push(value);
    match = regex.exec(block);
  }
  return items;
}

function extractEiahPlaybookFromAgentsPage(content: string) {
  const blockMatch = content.match(/eiah\s*:\s*\{([\s\S]*?)\n\s*\},\n\s*fallback\s*:/m);
  if (!blockMatch) return null;
  const block = blockMatch[1];
  const title = parseStringField(block, "title") || "EIAH";
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
    block,
    routes,
    directives,
    checklist,
    intro,
  };
}

function extractGuideTabDocsFromEiahBlock(block: string, sourcePath: string, sourceMtime: string): HelpDoc[] {
  const docs: HelpDoc[] = [];
  const tabsMatch = block.match(/guideTabs\s*:\s*\[([\s\S]*?)\]\s*,\s*}/m);
  if (!tabsMatch) return docs;
  const tabsRaw = tabsMatch[1];
  const tabRegex =
    /\{\s*id:\s*"([^"]+)"[\s\S]*?label:\s*"([^"]+)"[\s\S]*?purpose:\s*"([^"]+)"[\s\S]*?howItWorks:\s*"([^"]+)"[\s\S]*?steps:\s*\[([\s\S]*?)\]\s*,?\s*\}/g;

  let match: RegExpExecArray | null = tabRegex.exec(tabsRaw);
  while (match) {
    const tabId = match[1].trim();
    const label = match[2].trim();
    const purpose = match[3].trim();
    const howItWorks = match[4].trim();
    const steps = parseQuotedStringList(match[5]).slice(0, 8);
    const answer = [
      `${label}: ${purpose}`,
      `Como funciona: ${howItWorks}`,
      steps.length > 0 ? `Passo a passo:\n${steps.map((line) => `- ${line}`).join("\n")}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    docs.push({
      id: `help.eiah.page.${tabId}`,
      scope: "eiah",
      question: `Como usar a pagina ${label} no EIAH?`,
      answer,
      tags: ["help", "eiah", "pagina", tabId.toLowerCase()],
      track: "P4",
      status: "canonica",
      sourceFiles: [sourcePath],
      updatedAt: sourceMtime,
    });
    match = tabRegex.exec(tabsRaw);
  }
  return docs;
}

function buildCanonicalEiahDocs(params: {
  sourcePath: string;
  sourceMtime: string;
  playbook: ReturnType<typeof extractEiahPlaybookFromAgentsPage>;
}) {
  const docs: HelpDoc[] = [];
  const { sourcePath, sourceMtime, playbook } = params;
  if (!playbook) return docs;

  docs.push({
    id: "help.eiah.agent-docs.role",
    scope: "eiah",
    question: "O que significa o conteúdo do EIAH virar um agente da documentação do EIAH?",
    answer:
      "Significa que ele atua como um agente de acesso ao conhecimento canônico do EIAH, recuperando e explicando a base indexada via /help/eiah/query. Ele não substitui a governança normativa nem a fonte primária de verdade; atua como camada consultiva e explicativa subordinada ao roadmap, ao índice de evidências e aos contratos/evidências indexadas.",
    tags: ["help", "documentation", "eiah", "governance"],
    track: "P0",
    status: "canonica",
    sourceFiles: [sourcePath, "ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-05-23.md", "docs/EVIDENCE_INDEX.md"],
    updatedAt: sourceMtime,
  });

  docs.push({
    id: "help.eiah.imob.contract-guided-flow",
    scope: "eiah",
    question: "Como o IMOB funciona e como iniciar geracao de contrato no EIAH?",
    answer: [
      "IMOB funciona como vertical operacional sobre o core agentic com operacao guiada, governanca/prova e economia integrada.",
      "Operacao guiada: pipeline de lead, proposta, contrato e acompanhamento; chat assistido com historico auditavel.",
      "Governanca e prova: trilha verificavel run -> receipt -> ledger, gates de risco HIGH e evidencia exportavel.",
      "Economia integrada: billing, invoices e settlement com webhook idempotente, reputacao e disputa auditavel.",
      "White label: personalizacao por tenant/workspace (plano, limites, identidade comercial e onboarding).",
      "Para iniciar contrato no IMOB: Qual tipo de contrato voce deseja?\n1) Locacao\n2) Compra e venda\n3) Administracao\n4) Temporada\nResponda com o numero ou nome da opcao.",
    ].join("\n\n"),
    tags: ["help", "imob", "contrato", "white-label", "proposal"],
    track: "P4",
    status: "canonica",
    sourceFiles: [sourcePath],
    updatedAt: sourceMtime,
  });

  docs.push({
    id: "help.eiah.imob.crm-governed-runtime",
    scope: "eiah",
    question: "O que foi implementado no IMOB_CRM e como isso funciona no EIAH?",
    answer: [
      "O IMOB_CRM passou a operar como um runtime governado de caso, e nao apenas como um copiloto consultivo isolado.",
      "A arquitetura segue tres camadas: IMOB como agente visivel e dono do caso, registry governado de capabilities e specialists/runtimes operacionais no backend.",
      "No backend foram materializados capabilities, specialists internos, mission runtime, shadow runtime, gates, async runtime base, assisted integrations em sandbox, enrichment/capture, scale runtime, pilot flows, promotion runtime e surfaces operacionais de piloto.",
      "O caso pode expor snapshots como leadDiscovery, leadScore, commercialMemory, decisionRationale, reengagementSuggestion, inventoryWatch, leadProfileReport, viabilityMarketAnalysis, closingDocuments, missionOrchestration, pilotFlow, pilotOperationalState e pilotControlState.",
      "Na pratica, o usuario fala com o IMOB, o backend monta a leitura do caso, consulta governanca e estado operacional, e devolve um payload resolvido. A UI apenas renderiza.",
      "A trilha de piloto atual ja cobre o assisted_calendar_flow com approval auditavel, rollout state, piloto controlado em sandbox, tracking, evidence e surfaces read-only/operacionais. Approval operacional precisa ser auditavel; ready_for_review nao vale como approval humano.",
    ].join("\n\n"),
    tags: ["help", "imob", "crm", "capabilities", "pilot", "governance"],
    track: "P4",
    status: "canonica",
    sourceFiles: [sourcePath, "docs/architecture/imob-crm-governed-runtime.md", "docs/architecture/vertical-context-imob.md"],
    updatedAt: sourceMtime,
  });

  docs.push({
    id: "help.eiah.proposal.mode",
    scope: "eiah",
    question: "Como funciona o modo proposal no EIAH?",
    answer: [
      "No modo proposal o agente coleta perfil, usuarios, runs/mes, vertical, prazo e resultado esperado.",
      "Depois entrega recomendacao de plano, estimativa de custo, riscos/limites e proximos passos.",
      "A estimativa segue a regra oficial de billing para evitar divergencia com backend.",
    ].join("\n"),
    tags: ["proposal", "billing", "pricing", "help"],
    track: "P3",
    status: "canonica",
    sourceFiles: [sourcePath],
    updatedAt: sourceMtime,
  });

  docs.push({
    id: "help.eiah.governance.summary",
    scope: "eiah",
    question: "Como funciona governanca e prova no EIAH?",
    answer:
      "As execucoes seguem policy/trust e geram trilha verificavel (run -> receipt -> ledger), com gates para acoes HIGH e evidencias exportaveis para auditoria.",
    tags: ["governance", "receipt", "ledger", "high-risk"],
    track: "P1",
    status: "canonica",
    sourceFiles: [sourcePath, "ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-05-23.md", "docs/EVIDENCE_INDEX.md"],
    updatedAt: sourceMtime,
  });

  docs.push(...extractGuideTabDocsFromEiahBlock(playbook.block, sourcePath, sourceMtime));
  docs.push(...buildImobOnboardingHelpDocs({
    sourcePath,
    sourceMtime,
  }));
  return docs;
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

    const sourceMtime = stat.mtime.toISOString();
    const mtimeToken = String(Math.trunc(stat.mtimeMs));

    if (source.endsWith("apps/web/src/pages/app/agents/index.tsx")) {
      const playbook = extractEiahPlaybookFromAgentsPage(raw);
      if (!playbook || !playbook.content) continue;
      const chunks = chunkContent(playbook.content, 1200, 120);
      chunks.forEach((chunk, index) => {
        const contentHash = hashContent(`${source}|${chunk}`);
        records.push({
          key: `help:${source}:playbook:${HELP_INDEX_VERSION}:v${mtimeToken}:${contentHash.slice(0, 16)}:chunk:${index + 1}`,
          content: chunk,
          metadata: {
            sourceTag: HELP_SOURCE_TAG,
            sourceKind: HELP_PLAYBOOK_TAG,
            sourcePath: source,
            title: playbook.title,
            chunkIndex: index + 1,
            chunkTotal: chunks.length,
            sourceMtime,
            indexVersion: HELP_INDEX_VERSION,
            contentHash,
            sourceFiles: [source],
          },
          createdAt: now,
        });
      });

      const canonicalDocs = buildCanonicalEiahDocs({
        sourcePath: source,
        sourceMtime,
        playbook,
      });
      canonicalDocs.forEach((doc) => {
        const docContent = [
          `Pergunta: ${doc.question}`,
          `Resposta: ${doc.answer}`,
          `Tags: ${doc.tags.join(", ")}`,
          `Track: ${doc.track ?? "P0"}`,
          `Status: ${doc.status ?? "canonica"}`,
        ].join("\n");
        const contentHash = hashContent(`${doc.id}|${docContent}|${doc.updatedAt}`);
        records.push({
          key: `help:${source}:canonical:${doc.id}:${HELP_INDEX_VERSION}:v${mtimeToken}:${contentHash.slice(0, 16)}`,
          content: docContent,
          metadata: {
            sourceTag: HELP_SOURCE_TAG,
            sourceKind: HELP_CANONICAL_DOC_TAG,
            sourcePath: source,
            title: doc.question,
            docId: doc.id,
            question: doc.question,
            tags: doc.tags,
            track: doc.track ?? "P0",
            status: doc.status ?? "canonica",
            sourceFiles: doc.sourceFiles,
            sourceMtime: doc.updatedAt,
            indexVersion: HELP_INDEX_VERSION,
            contentHash,
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
        key: `help:${source}:v${mtimeToken}:chunk:${index + 1}`,
        content: chunk,
        metadata: {
          sourceTag: HELP_SOURCE_TAG,
          sourcePath: source,
          title: fallbackTitle,
          chunkIndex: index + 1,
          chunkTotal: chunks.length,
          sourceMtime,
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
  const sourceKind = String(metadata.sourceKind ?? "");

  let score = 0;
  if (normalizedContent.includes(normalizedQuery)) score += 5;
  if (normalizedTitle.includes(normalizedQuery)) score += 8;
  if (normalizedPath.includes(normalizedQuery)) score += 6;
  if (sourceKind === HELP_CANONICAL_DOC_TAG) score += 4;

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
    const sourceMtime = stat.mtime.toISOString();
    const mtimeToken = String(Math.trunc(stat.mtimeMs));
    const title = buildTitleFromContent(sourcePath, content);
    const chunks = chunkContent(content);
    chunks.forEach((chunk, index) => {
      const contentHash = hashContent(`${sourcePath}|${chunk}`);
      records.push({
        key: `help:${sourcePath}:${HELP_INDEX_VERSION}:v${mtimeToken}:${contentHash.slice(0, 16)}:chunk:${index + 1}`,
        content: chunk,
        metadata: {
          sourceTag: HELP_SOURCE_TAG,
          sourcePath,
          title,
          chunkIndex: index + 1,
          chunkTotal: chunks.length,
          sourceMtime,
          indexVersion: HELP_INDEX_VERSION,
          contentHash,
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
      const sourceFiles = Array.isArray(metadata.sourceFiles)
        ? metadata.sourceFiles.map((entry) => String(entry))
        : [String(metadata.sourcePath ?? "desconhecido")];
      const sourceKind = String(metadata.sourceKind ?? "");
      const status = resolveGuardrailStatus({ metadata, sourceKind });
      return {
        key: record.key,
        docId: typeof metadata.docId === "string" ? metadata.docId : undefined,
        title: String(metadata.title ?? "Documento EIAH"),
        sourcePath: String(metadata.sourcePath ?? "desconhecido"),
        score,
        snippet: buildSnippet(record.content, query),
        tags: Array.isArray(metadata.tags) ? metadata.tags.map((entry) => String(entry)) : undefined,
        track: resolveTrack(metadata),
        status,
        sourceFiles,
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  const topK = clamp(params.topK ?? DEFAULT_TOP_K, 1, 20);

  const topHits = scored.slice(0, topK);
  const sourcesUsed = Array.from(
    new Set(
      topHits.flatMap((hit) => (hit.sourceFiles && hit.sourceFiles.length > 0 ? hit.sourceFiles : [hit.sourcePath]))
    )
  );
  const docIdsUsed = Array.from(new Set(topHits.map((hit) => hit.docId).filter(Boolean) as string[]));
  const responseStatus = (topHits[0]?.status ?? "evidenciado") as
    | "evidenciado"
    | "parcial"
    | "proposta"
    | "canonica";

  return {
    seededNow: seedResult.seeded,
    indexedDocs: new Set(docsForQuery.map((item) => String(((item.metadata ?? {}) as Record<string, unknown>).sourcePath))).size,
    indexedChunks: docsForQuery.length,
    hits: topHits,
    sourcesUsed,
    docIdsUsed,
    responseStatus,
  } satisfies HelpQueryResult;
}
