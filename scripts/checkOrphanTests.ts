import fs from "node:fs";
import path from "node:path";

const CHECK = "check:orphan-tests";
const ROOT = process.cwd();
const ALLOWLIST_PATH = path.resolve(ROOT, "scripts/orphan-tests-allowlist.txt");

const EXCLUDED_DIR_NAMES = new Set(["node_modules", "dist", "generated", ".git", "coverage", ".turbo"]);

type OrphanFinding = {
  file: string;
  reason: "not_referenced_in_package_json_or_workflows";
};

function fail(message: string, details?: Record<string, unknown>): never {
  console.error(JSON.stringify({ ok: false, check: CHECK, message, details }, null, 2));
  process.exit(1);
}

function walk(dir: string, acc: string[]) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (EXCLUDED_DIR_NAMES.has(entry.name)) continue;
      walk(path.join(dir, entry.name), acc);
      continue;
    }
    if (entry.name.endsWith(".test.ts") || entry.name.endsWith(".test.tsx")) {
      acc.push(path.join(dir, entry.name));
    }
  }
  return acc;
}

function toRepoRelative(absolutePath: string) {
  return path.relative(ROOT, absolutePath).split(path.sep).join("/");
}

function collectAllTestFiles(): string[] {
  const acc: string[] = [];
  walk(ROOT, acc);
  return acc.map(toRepoRelative).sort();
}

/**
 * Extrai roots cobertos por globs de shell do tipo:
 *   find <dir> -name '*.test.ts' [-type f]
 * usados em steps de workflow (ex.: ci.yml, lint.yml) para descobrir
 * dinamicamente todos os *.test.ts sob um diretorio, sem listar arquivo
 * por arquivo. Qualquer teste sob esses roots conta como coberto.
 */
function extractGlobCoveredRoots(workflowTexts: string[]): string[] {
  const roots = new Set<string>();
  const pattern = /find\s+([^\s]+)\s+-name\s+['"]\*\.test\.ts['"]/g;
  for (const text of workflowTexts) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const dir = match[1].replace(/^\.\//, "").replace(/\/$/, "");
      roots.add(dir);
    }
  }
  return Array.from(roots);
}

/**
 * Extrai qualquer trecho de texto que pareca um caminho de arquivo de
 * teste (termina em .test.ts ou .test.tsx) de uma string arbitraria
 * (valor de script do package.json, ou corpo de um step de workflow).
 * Cobre tanto listas de arquivos direto no comando (node --test a.test.ts
 * b.test.ts) quanto uma unica referencia solta.
 */
function extractDirectTestFileReferences(text: string): string[] {
  const found: string[] = [];
  const pattern = /(?:^|[\s"'`(])([a-zA-Z0-9_./-]+\.test\.tsx?)(?=$|[\s"'`);&|])/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    found.push(match[1].replace(/^\.\//, ""));
  }
  return found;
}

function readWorkflowTexts(): string[] {
  const dir = path.resolve(ROOT, ".github/workflows");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .map((name) => fs.readFileSync(path.join(dir, name), "utf8"));
}

function readPackageJsonScriptValues(): string[] {
  const pkgPath = path.resolve(ROOT, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as { scripts?: Record<string, string> };
  return Object.values(pkg.scripts ?? {});
}

function readAllowlist(): Map<string, boolean> {
  const map = new Map<string, boolean>();
  if (!fs.existsSync(ALLOWLIST_PATH)) return map;
  const raw = fs.readFileSync(ALLOWLIST_PATH, "utf8");
  for (const rawLine of raw.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    // Formato exigido: <caminho-relativo> # justificativa
    const [entryPath] = line.split("#");
    const normalized = entryPath.trim();
    if (normalized) map.set(normalized, true);
  }
  return map;
}

// ---------------------------------------------------------------------------

const allTestFiles = collectAllTestFiles();
const workflowTexts = readWorkflowTexts();
const packageJsonScriptValues = readPackageJsonScriptValues();

const globCoveredRoots = extractGlobCoveredRoots(workflowTexts);

const directReferences = new Set<string>();
for (const scriptValue of packageJsonScriptValues) {
  for (const ref of extractDirectTestFileReferences(scriptValue)) directReferences.add(ref);
}
for (const workflowText of workflowTexts) {
  for (const ref of extractDirectTestFileReferences(workflowText)) directReferences.add(ref);
}

function isCoveredByGlobRoot(testFile: string): boolean {
  return globCoveredRoots.some((root) => testFile === root || testFile.startsWith(`${root}/`));
}

function isReachable(testFile: string): boolean {
  if (directReferences.has(testFile)) return true;
  // aceitar tambem referencia pelo nome do arquivo isolado (sem diretorio),
  // caso algum comando monte o caminho dinamicamente com apenas o basename
  // (nao observado hoje neste repo, mas evita falso positivo trivial).
  if (isCoveredByGlobRoot(testFile)) return true;
  return false;
}

const orphans: OrphanFinding[] = allTestFiles
  .filter((file) => !isReachable(file))
  .map((file) => ({ file, reason: "not_referenced_in_package_json_or_workflows" as const }));

const allowlist = readAllowlist();
const allowlistedOrphans = orphans.filter((o) => allowlist.has(o.file));
const blockingOrphans = orphans.filter((o) => !allowlist.has(o.file));

// Detecta entradas de allowlist que apontam para arquivo inexistente ou
// que ja nao sao mais orfaos (allowlist deve ficar enxuta e verdadeira).
const staleAllowlistEntries = Array.from(allowlist.keys()).filter(
  (entry) => !orphans.some((o) => o.file === entry),
);

const result = {
  ok: blockingOrphans.length === 0,
  check: CHECK,
  totalTestFiles: allTestFiles.length,
  globCoveredRoots,
  orphanCount: orphans.length,
  allowlistedOrphanCount: allowlistedOrphans.length,
  blockingOrphanCount: blockingOrphans.length,
  blockingOrphans: blockingOrphans.map((o) => o.file),
  allowlistedOrphans: allowlistedOrphans.map((o) => o.file),
  staleAllowlistEntries,
  generatedAt: new Date().toISOString(),
};

if (staleAllowlistEntries.length > 0) {
  fail("orphan_tests_allowlist_stale", {
    ...result,
    message: "Entradas na allowlist nao correspondem a um orfao real atual — remova-as.",
  });
}

if (blockingOrphans.length > 0) {
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(result, null, 2));
