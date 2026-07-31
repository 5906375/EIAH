import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const CHECK = "check:orphan-tests";
const ROOT = process.cwd();
const BASELINE_PATH = "scripts/orphan-tests-baseline.v1.json";
const EXCLUDED_DIR_NAMES = new Set(["node_modules", "dist", "generated", ".git", "coverage", ".turbo"]);

type ExecutionKind = "blocking" | "informational";

type OrphanBaseline = {
  schemaVersion: "orphan-tests-baseline.v1";
  initialOrphanCount: number;
  frozenAt: string;
  frozenCommit: string;
};

export type RepositoryView = {
  label: string;
  listFiles(): string[];
  listTestFiles(): string[];
  readFile(relativePath: string): string | undefined;
};

type PackageInfo = {
  dir: string;
  name?: string;
  scripts: Record<string, string>;
};

type WorkflowRun = {
  command: string;
  kind: ExecutionKind;
};

export type ExecutionAnalysis = {
  totalTestFiles: number;
  executedBlockingFiles: string[];
  executedInformationalFiles: string[];
  referencedNotExecutedFiles: string[];
  notReferencedFiles: string[];
  orphanFiles: string[];
  globCoveredRoots: string[];
};

function fail(message: string, details?: Record<string, unknown>): never {
  console.error(JSON.stringify({ ok: false, check: CHECK, message, details }, null, 2));
  process.exit(1);
}

// Test discovery is intentionally unchanged: walk the repository and collect
// every tracked or untracked *.test.ts[x], excluding generated/build folders.
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

function walkAllFiles(dir: string, acc: string[]) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (EXCLUDED_DIR_NAMES.has(entry.name)) continue;
      walkAllFiles(path.join(dir, entry.name), acc);
      continue;
    }
    acc.push(path.join(dir, entry.name));
  }
  return acc;
}

export function createWorktreeView(): RepositoryView {
  return {
    label: "worktree",
    listFiles: () => walkAllFiles(ROOT, []).map(toRepoRelative).sort(),
    listTestFiles: collectAllTestFiles,
    readFile(relativePath) {
      const absolutePath = path.resolve(ROOT, relativePath);
      return fs.existsSync(absolutePath) ? fs.readFileSync(absolutePath, "utf8") : undefined;
    },
  };
}

function git(args: string[]) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function ensureCommitAvailable(ref: string) {
  if (!/^[0-9a-f]{40}$/i.test(ref)) fail("orphan_tests_comparison_ref_invalid", { ref });
  try {
    git(["cat-file", "-e", `${ref}^{commit}`]);
  } catch {
    try {
      git(["fetch", "--no-tags", "--depth=1", "origin", ref]);
      git(["cat-file", "-e", `${ref}^{commit}`]);
    } catch {
      fail("orphan_tests_comparison_ref_unavailable", { ref });
    }
  }
}

export function createGitTreeView(ref: string): RepositoryView {
  ensureCommitAvailable(ref);
  const files = git(["ls-tree", "-r", "--name-only", ref])
    .split("\n")
    .filter(Boolean)
    .filter((file) => !file.split("/").some((segment) => EXCLUDED_DIR_NAMES.has(segment)))
    .sort();
  const fileSet = new Set(files);
  return {
    label: ref,
    listFiles: () => files,
    listTestFiles: () => files.filter((file) => file.endsWith(".test.ts") || file.endsWith(".test.tsx")),
    readFile(relativePath) {
      if (!fileSet.has(relativePath)) return undefined;
      try {
        return git(["show", `${ref}:${relativePath}`]);
      } catch {
        return undefined;
      }
    },
  };
}

function normalizeRepoPath(relativePath: string) {
  return path.posix.normalize(relativePath.replace(/^\.\//, "")).replace(/^\.\.\//, "");
}

function packageDirectory(packageJsonPath: string) {
  const dir = path.posix.dirname(packageJsonPath);
  return dir === "." ? "" : dir;
}

function readPackages(view: RepositoryView) {
  const packages: PackageInfo[] = [];
  for (const file of view.listFiles()) {
    if (file !== "package.json" && !file.endsWith("/package.json")) continue;
    const raw = view.readFile(file);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as { name?: string; scripts?: Record<string, string> };
      packages.push({ dir: packageDirectory(file), name: parsed.name, scripts: parsed.scripts ?? {} });
    } catch {
      // Invalid package manifests are handled by their own repository gates.
    }
  }
  return packages;
}

function parseBoolean(value: string) {
  return value.trim().replace(/^['"]|['"]$/g, "") === "true";
}

function parseWorkflowRuns(text: string): WorkflowRun[] {
  const lines = text.split("\n");
  const runs: WorkflowRun[] = [];
  const envValues = new Map<string, string>();
  let underJobs = false;
  let jobInformational = false;
  let stepInformational = false;

  for (const line of lines) {
    const envMatch = line.match(/^\s+([A-Z][A-Z0-9_]+):\s*(.+?)\s*$/);
    if (envMatch) envValues.set(envMatch[1], envMatch[2].replace(/^['"]|['"]$/g, ""));
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^jobs:\s*$/.test(line)) {
      underJobs = true;
      continue;
    }
    if (!underJobs) continue;
    if (/^  [A-Za-z0-9_-]+:\s*$/.test(line)) {
      jobInformational = false;
      stepInformational = false;
      continue;
    }
    if (/^    continue-on-error:\s*(.+?)\s*$/.test(line)) {
      jobInformational = parseBoolean(line.split(":").slice(1).join(":"));
      continue;
    }
    if (/^      -\s+/.test(line)) stepInformational = false;
    if (/^        continue-on-error:\s*(.+?)\s*$/.test(line)) {
      stepInformational = parseBoolean(line.split(":").slice(1).join(":"));
      continue;
    }
    const runMatch = line.match(/^        run:\s*(.*)$/);
    if (!runMatch) continue;

    let command = runMatch[1];
    if (command === "|" || command === ">" || command === ">-") {
      const body: string[] = [];
      while (index + 1 < lines.length && (/^\s{10,}/.test(lines[index + 1]) || lines[index + 1].trim() === "")) {
        index += 1;
        body.push(lines[index].replace(/^\s{10}/, ""));
      }
      command = body.join("\n");
    }

    let kind: ExecutionKind = jobInformational || stepInformational ? "informational" : "blocking";
    const guard = command.match(/if\s+\[\s+"\$\{([A-Z][A-Z0-9_]*)\}"\s+!=\s+"([^"]+)"\s+\]/);
    if (guard && envValues.get(guard[1]) !== guard[2]) kind = "informational";
    runs.push({ command, kind });
  }
  return runs;
}

function directTestReferences(command: string) {
  const found: string[] = [];
  const pattern = /(?:^|[\s"'`(])([a-zA-Z0-9_./-]+\.test\.tsx?)(?=$|[\s"'`);&|\\])/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(command)) !== null) found.push(match[1]);
  return found;
}

function findRoots(command: string) {
  const roots: string[] = [];
  const pattern = /find\s+([^\s]+)\s+-name\s+['"]\*\.test\.ts['"]/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(command)) !== null) roots.push(match[1]);
  return roots;
}

function resolvePackage(packages: PackageInfo[], selector: string) {
  const normalized = selector.replace(/^['"]|['"]$/g, "");
  return packages.find((pkg) => pkg.name === normalized || pkg.dir === normalized.replace(/^\.\//, ""));
}

function commandCwd(command: string, defaultCwd: string, packages: PackageInfo[]) {
  const filterMatch = command.match(/pnpm\s+--filter\s+([^\s]+)\s+exec\b/);
  if (filterMatch) return resolvePackage(packages, filterMatch[1])?.dir ?? defaultCwd;
  const cdMatch = command.match(/(?:^|[;&|]\s*)cd\s+([^\s;&|]+)/);
  return cdMatch ? normalizeRepoPath(path.posix.join(defaultCwd, cdMatch[1])) : defaultCwd;
}

function normalizeReference(reference: string, cwd: string) {
  const clean = reference.replace(/^\.\//, "");
  if (["apps/", "packages/", "scripts/", "tests/"].some((prefix) => clean.startsWith(prefix))) {
    return normalizeRepoPath(clean);
  }
  return normalizeRepoPath(path.posix.join(cwd, clean));
}

function extractScriptCalls(command: string, currentPackage: PackageInfo, packages: PackageInfo[]) {
  const calls: Array<{ pkg: PackageInfo; script: string }> = [];
  const filtered = /pnpm\s+--filter\s+([^\s]+)\s+(?:run\s+)?([^\s;&|\\]+)/g;
  let match: RegExpExecArray | null;
  while ((match = filtered.exec(command)) !== null) {
    if (match[2] === "exec") continue;
    const pkg = resolvePackage(packages, match[1]);
    if (pkg?.scripts[match[2]]) calls.push({ pkg, script: match[2] });
  }
  for (const script of Object.keys(currentPackage.scripts)) {
    const escaped = script.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\bpnpm\\s+(?:run\\s+)?${escaped}(?=$|[\\s;&|])`).test(command)) {
      calls.push({ pkg: currentPackage, script });
    }
  }
  return calls;
}

function addCommandCoverage(
  command: string,
  cwd: string,
  allTests: Set<string>,
  target: Set<string>,
) {
  for (const reference of directTestReferences(command)) {
    const normalized = normalizeReference(reference, cwd);
    if (allTests.has(normalized)) target.add(normalized);
  }
  for (const root of findRoots(command)) {
    const normalizedRoot = normalizeReference(root, cwd).replace(/\/$/, "");
    for (const test of allTests) {
      if (test === normalizedRoot || test.startsWith(`${normalizedRoot}/`)) target.add(test);
    }
  }
}

export function analyzeRepository(view: RepositoryView): ExecutionAnalysis {
  const allTestFiles = view.listTestFiles().sort();
  const allTests = new Set(allTestFiles);
  const packages = readPackages(view);
  const rootPackage = packages.find((pkg) => pkg.dir === "");
  if (!rootPackage) throw new Error(`package.json missing in ${view.label}`);

  const blocking = new Set<string>();
  const informational = new Set<string>();
  const referenced = new Set<string>();
  const globCoveredRoots = new Set<string>();
  const queue: Array<{ pkg: PackageInfo; script: string; kind: ExecutionKind }> = [];
  const visited = new Map<string, ExecutionKind>();

  const recordCommand = (command: string, defaultCwd: string, kind: ExecutionKind) => {
    const cwd = commandCwd(command, defaultCwd, packages);
    const target = kind === "blocking" ? blocking : informational;
    addCommandCoverage(command, cwd, allTests, target);
    for (const call of extractScriptCalls(command, rootPackage, packages)) queue.push({ ...call, kind });
  };

  for (const file of view.listFiles().filter((entry) => /^\.github\/workflows\/.*\.ya?ml$/.test(entry))) {
    const text = view.readFile(file) ?? "";
    for (const root of findRoots(text)) globCoveredRoots.add(normalizeRepoPath(root));
    for (const run of parseWorkflowRuns(text)) {
      addCommandCoverage(run.command, "", allTests, referenced);
      recordCommand(run.command, "", run.kind);
    }
  }

  for (const pkg of packages) {
    for (const command of Object.values(pkg.scripts)) {
      const cwd = commandCwd(command, pkg.dir, packages);
      addCommandCoverage(command, cwd, allTests, referenced);
    }
  }

  while (queue.length > 0) {
    const item = queue.shift()!;
    const key = `${item.pkg.dir}:${item.script}`;
    const previous = visited.get(key);
    if (previous === "blocking" || previous === item.kind) continue;
    visited.set(key, item.kind);
    const command = item.pkg.scripts[item.script];
    const cwd = commandCwd(command, item.pkg.dir, packages);
    addCommandCoverage(command, cwd, allTests, referenced);
    addCommandCoverage(command, cwd, allTests, item.kind === "blocking" ? blocking : informational);
    for (const call of extractScriptCalls(command, item.pkg, packages)) queue.push({ ...call, kind: item.kind });
  }

  for (const test of blocking) informational.delete(test);
  const executedBlockingFiles = [...blocking].sort();
  const executedInformationalFiles = [...informational].sort();
  const referencedNotExecutedFiles = [...referenced]
    .filter((test) => allTests.has(test) && !blocking.has(test) && !informational.has(test))
    .sort();
  const referencedNotExecuted = new Set(referencedNotExecutedFiles);
  const notReferencedFiles = allTestFiles
    .filter((test) => !blocking.has(test) && !informational.has(test) && !referencedNotExecuted.has(test))
    .sort();

  return {
    totalTestFiles: allTestFiles.length,
    executedBlockingFiles,
    executedInformationalFiles,
    referencedNotExecutedFiles,
    notReferencedFiles,
    orphanFiles: allTestFiles.filter((test) => !blocking.has(test)).sort(),
    globCoveredRoots: [...globCoveredRoots],
  };
}

function readBaseline(view: RepositoryView): OrphanBaseline {
  const raw = view.readFile(BASELINE_PATH);
  if (!raw) fail("orphan_tests_baseline_missing", { path: BASELINE_PATH });
  const baseline = JSON.parse(raw) as OrphanBaseline;
  if (
    baseline.schemaVersion !== "orphan-tests-baseline.v1"
    || !Number.isInteger(baseline.initialOrphanCount)
    || baseline.initialOrphanCount < 0
    || !/^[0-9a-f]{40}$/.test(baseline.frozenCommit)
  ) {
    fail("orphan_tests_baseline_invalid", { path: BASELINE_PATH });
  }
  return baseline;
}

function comparisonRef(baseline: OrphanBaseline) {
  if (process.env.ORPHAN_TESTS_COMPARE_REF) return process.env.ORPHAN_TESTS_COMPARE_REF;
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (eventPath && fs.existsSync(eventPath)) {
    const event = JSON.parse(fs.readFileSync(eventPath, "utf8")) as {
      before?: string;
      pull_request?: { base?: { sha?: string } };
    };
    const eventRef = event.pull_request?.base?.sha ?? event.before;
    if (eventRef && !/^0+$/.test(eventRef)) return eventRef;
  }
  return baseline.frozenCommit;
}

function countResult(analysis: ExecutionAnalysis) {
  return {
    totalTestFiles: analysis.totalTestFiles,
    executedBlocking: analysis.executedBlockingFiles.length,
    executedInformational: analysis.executedInformationalFiles.length,
    referencedNotExecuted: analysis.referencedNotExecutedFiles.length,
    notReferenced: analysis.notReferencedFiles.length,
  };
}

export function buildGateResult(current: ExecutionAnalysis, previous: ExecutionAnalysis, baseline: OrphanBaseline) {
  const previousOrphans = new Set(previous.orphanFiles);
  const currentOrphans = new Set(current.orphanFiles);
  const newOrphans = current.orphanFiles.filter((test) => !previousOrphans.has(test));
  const removedOrphans = previous.orphanFiles.filter((test) => !currentOrphans.has(test));
  const ceiling = Math.min(baseline.initialOrphanCount, previous.orphanFiles.length);
  const increased = current.orphanFiles.length > ceiling;
  const ok = newOrphans.length === 0 && !increased;

  return {
    ok,
    check: CHECK,
    ...countResult(current),
    executedBlockingFiles: current.executedBlockingFiles,
    executedInformationalFiles: current.executedInformationalFiles,
    referencedNotExecutedFiles: current.referencedNotExecutedFiles,
    notReferencedFiles: current.notReferencedFiles,
    comparison: {
      ref: "comparison",
      previousOrphanCount: previous.orphanFiles.length,
      decreasingCeiling: ceiling,
      currentOrphanCount: current.orphanFiles.length,
      newOrphans,
      removedOrphans,
    },
    baseline,
    // Compatibility fields: their semantics now reflect blocking execution,
    // while the former textual roots remain diagnostic only.
    globCoveredRoots: current.globCoveredRoots,
    orphanCount: current.orphanFiles.length,
    allowlistedOrphanCount: 0,
    blockingOrphanCount: newOrphans.length,
    blockingOrphans: newOrphans,
    allowlistedOrphans: [],
    staleAllowlistEntries: [],
    generatedAt: new Date().toISOString(),
  };
}

export function runGate() {
  const currentView = createWorktreeView();
  const baseline = readBaseline(currentView);
  const ref = comparisonRef(baseline);
  const current = analyzeRepository(currentView);
  const previous = analyzeRepository(createGitTreeView(ref));
  const result = buildGateResult(current, previous, baseline);
  result.comparison.ref = ref;
  const output = JSON.stringify(result, null, 2);
  if (!result.ok) {
    console.error(output);
    process.exitCode = 1;
  } else {
    console.log(output);
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) runGate();
