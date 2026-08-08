import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const LEGAL_TRUTHFUL_EVIDENCE_FORBIDDEN_LITERAL =
  "Documento jurídico anexado";

const RUNTIME_SURFACES = ["apps", "packages"] as const;
const SOURCE_DIRECTORY = "src";
const EXCLUDED_DIRECTORIES = new Set([
  "__tests__",
  "test",
  "tests",
  "fixtures",
  "docs",
  "dist",
  "build",
  "node_modules",
]);
const RUNTIME_SOURCE_EXTENSION = /\.(?:[cm]?[jt]sx?)$/i;
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/i;

export type LegalTruthfulEvidenceViolation = {
  file: string;
  line: number;
  location: string;
};

function hasCanonicalTypeScriptSibling(file: string) {
  if (!/\.[cm]?jsx?$/i.test(file)) return false;
  const withoutExtension = file.replace(/\.[^.]+$/, "");
  return [".ts", ".tsx", ".mts", ".cts"].some((extension) =>
    fs.existsSync(`${withoutExtension}${extension}`),
  );
}

function collectRuntimeFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];

  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return EXCLUDED_DIRECTORIES.has(entry.name)
        ? []
        : collectRuntimeFiles(target);
    }
    if (!entry.isFile() || !RUNTIME_SOURCE_EXTENSION.test(entry.name)) return [];
    if (TEST_FILE.test(entry.name) || hasCanonicalTypeScriptSibling(target)) return [];
    return [target];
  });
}

function sourceRoots(root: string) {
  return RUNTIME_SURFACES.flatMap((surface) => {
    const surfaceRoot = path.join(root, surface);
    if (!fs.existsSync(surfaceRoot)) return [];

    const roots: string[] = [];
    const visit = (directory: string) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (!entry.isDirectory() || EXCLUDED_DIRECTORIES.has(entry.name)) continue;
        const target = path.join(directory, entry.name);
        if (entry.name === SOURCE_DIRECTORY) {
          roots.push(target);
          continue;
        }
        visit(target);
      }
    };
    visit(surfaceRoot);
    return roots;
  });
}

export function scanLegalTruthfulEvidence(
  root: string,
): LegalTruthfulEvidenceViolation[] {
  const absoluteRoot = path.resolve(root);
  const violations: LegalTruthfulEvidenceViolation[] = [];

  for (const sourceRoot of sourceRoots(absoluteRoot)) {
    for (const file of collectRuntimeFiles(sourceRoot)) {
      const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
      lines.forEach((line, index) => {
        if (!line.includes(LEGAL_TRUTHFUL_EVIDENCE_FORBIDDEN_LITERAL)) return;
        const relativeFile = path.relative(absoluteRoot, file).split(path.sep).join("/");
        const lineNumber = index + 1;
        violations.push({
          file: relativeFile,
          line: lineNumber,
          location: `${relativeFile}:${lineNumber}`,
        });
      });
    }
  }

  return violations.sort((left, right) =>
    left.location.localeCompare(right.location),
  );
}

function resolveRoot(argv: string[], env: NodeJS.ProcessEnv) {
  const rootFlagIndex = argv.indexOf("--root");
  const cliRoot =
    rootFlagIndex >= 0 ? argv[rootFlagIndex + 1] : argv.find((arg) => !arg.startsWith("--"));
  const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  return path.resolve(cliRoot ?? env.LEGAL_TRUTHFUL_EVIDENCE_ROOT ?? defaultRoot);
}

export function runLegalTruthfulEvidenceCli(
  argv = process.argv.slice(2),
  env = process.env,
) {
  const root = resolveRoot(argv, env);
  const violations = scanLegalTruthfulEvidence(root);

  if (violations.length > 0) {
    console.error("LEGAL_TRUTHFUL_EVIDENCE_LITERAL_REINTRODUCED");
    for (const violation of violations) console.error(violation.location);
    return 1;
  }

  console.log(
    JSON.stringify({
      ok: true,
      check: "check:legal-truthful-evidence",
      root,
      violations: 0,
    }),
  );
  return 0;
}

const isMainModule =
  typeof process.argv[1] === "string" &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  process.exitCode = runLegalTruthfulEvidenceCli();
}
