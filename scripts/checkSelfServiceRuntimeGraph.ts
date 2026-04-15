import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const webRoot = path.join(repoRoot, "apps/web/src");
const selfServiceRoot = path.join(webRoot, "pages/self-service");
const baselinePath = path.join(repoRoot, "artifacts/self-service-runtime-baseline.json");

const entryPoints = [
  path.join(webRoot, "App.tsx"),
  path.join(webRoot, "pages/self-service/index.tsx"),
  path.join(webRoot, "pages/self-service/router.tsx"),
];

const importPattern =
  /(?:import\s+(?:[\s\S]*?)\s+from\s+|import\s*\()\s*["'](\.{1,2}\/[^"']+)["']/g;

function normalize(p: string) {
  return p.replace(/\\/g, "/");
}

function listFilesRecursively(root: string): string[] {
  const output: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(abs);
      } else {
        output.push(abs);
      }
    }
  }
  return output;
}

function resolveImport(fromFile: string, specifier: string): string | null {
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
    path.join(base, "index.js"),
    path.join(base, "index.jsx"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function collectRuntimeGraph() {
  const visited = new Set<string>();
  const queue = [...entryPoints];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    if (visited.has(current)) continue;
    if (!fs.existsSync(current)) continue;
    visited.add(current);

    const content = fs.readFileSync(current, "utf8");
    let match: RegExpExecArray | null;
    importPattern.lastIndex = 0;
    while ((match = importPattern.exec(content))) {
      const specifier = match[1];
      const resolved = resolveImport(current, specifier);
      if (!resolved) continue;
      if (!resolved.startsWith(webRoot)) continue;
      queue.push(resolved);
    }
  }

  return visited;
}

function collectDuplicatePairs() {
  const files = listFilesRecursively(selfServiceRoot)
    .filter((file) => /\.(ts|tsx|js|jsx)$/.test(file))
    .map((file) => normalize(path.relative(selfServiceRoot, file)));

  const map = new Map<string, Set<string>>();
  for (const file of files) {
    const ext = path.extname(file).slice(1);
    const key = file.replace(/\.(ts|tsx|js|jsx)$/, "");
    if (!map.has(key)) map.set(key, new Set<string>());
    map.get(key)?.add(ext);
  }

  const pairs: Array<{
    base: string;
    hasJs: boolean;
    hasTs: boolean;
    hasTsx: boolean;
  }> = [];

  for (const [base, exts] of map.entries()) {
    const hasJs = exts.has("js");
    const hasTs = exts.has("ts");
    const hasTsx = exts.has("tsx");
    if (hasJs && (hasTs || hasTsx)) {
      pairs.push({ base, hasJs, hasTs, hasTsx });
    }
  }

  return pairs.sort((a, b) => a.base.localeCompare(b.base));
}

const runtimeGraph = collectRuntimeGraph();
const runtimeSelfServiceFiles = [...runtimeGraph]
  .filter((file) => file.startsWith(selfServiceRoot))
  .map((file) => normalize(path.relative(selfServiceRoot, file)))
  .sort();

const runtimeSelfServiceJsFiles = runtimeSelfServiceFiles.filter((file) => file.endsWith(".js"));
const duplicatePairs = collectDuplicatePairs();

const baseline = {
  generatedAt: new Date().toISOString(),
  entryPoints: entryPoints.map((file) => normalize(path.relative(repoRoot, file))),
  runtimeSelfServiceFiles,
  runtimeSelfServiceJsFiles,
  duplicatePairs,
  duplicatePairCount: duplicatePairs.length,
};

if (process.argv.includes("--write-baseline")) {
  fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
  fs.writeFileSync(baselinePath, JSON.stringify(baseline, null, 2));
  console.log(`Baseline gravada em ${normalize(path.relative(repoRoot, baselinePath))}`);
}

if (runtimeSelfServiceJsFiles.length > 0) {
  console.error(
    [
      "Runtime do self-service está consumindo arquivos .js (esperado: TS/TSX canônico):",
      ...runtimeSelfServiceJsFiles.map((file) => `- apps/web/src/pages/self-service/${file}`),
    ].join("\n")
  );
  process.exit(1);
}

console.log(
  [
    "check:self-service-runtime-graph OK",
    `- runtime files: ${runtimeSelfServiceFiles.length}`,
    `- runtime .js files: ${runtimeSelfServiceJsFiles.length}`,
    `- duplicate pairs (js+ts/tsx): ${duplicatePairs.length}`,
  ].join("\n")
);
