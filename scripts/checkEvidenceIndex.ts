import fs from "node:fs";
import path from "node:path";

const CHECK = "check:evidence-index";
const file = path.resolve("docs/EVIDENCE_INDEX.md");
const ROOT = process.cwd();
const CANONICAL_ROADMAP =
  process.env.EIAH_CANONICAL_ROADMAP ?? "ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-03-21.md";

function fail(message: string, details?: Record<string, unknown>): never {
  console.error(JSON.stringify({ ok: false, check: CHECK, message, details }, null, 2));
  process.exit(1);
}

function normalizeRef(input: string): string {
  const trimmed = input.trim();
  const withoutLineRef = trimmed.split(":")[0];
  return withoutLineRef.replace(/^[./]+/, (match) => (match === "./" ? "" : match));
}

function isLikelyRepoPath(token: string): boolean {
  if (!token || /\s/.test(token)) return false;
  if (token.startsWith("http://") || token.startsWith("https://")) return false;
  if (token.includes("LEGADO_INDISPONIVEL")) return false;

  return (
    token.startsWith("apps/") ||
    token.startsWith("packages/") ||
    token.startsWith("docs/") ||
    token.startsWith("ops/") ||
    token.startsWith("contracts/") ||
    token.startsWith("scripts/") ||
    token.startsWith(".github/") ||
    token.startsWith("ROADMAP_") ||
    token.startsWith(".env") ||
    token === "package.json" ||
    token === "pnpm-workspace.yaml" ||
    token === "pnpm-lock.yaml" ||
    token === "docker-compose.dev.yml"
  );
}

if (!fs.existsSync(file)) fail("EVIDENCE_INDEX not found", { file });

const content = fs.readFileSync(file, "utf8");
if (content.trim().length < 400) fail("EVIDENCE_INDEX too small", { minChars: 400, file });

const required = [
  "# EVIDENCE INDEX",
  "Roadmap atual",
  "Entry points",
  "Status do Roadmap",
];
const missing = required.filter((token) => !content.includes(token));
if (missing.length) fail("EVIDENCE_INDEX missing required sections", { missing, file });

if (content.includes("LEGADO_INDISPONIVEL")) {
  fail("EVIDENCE_INDEX contains legacy placeholders", { marker: "LEGADO_INDISPONIVEL" });
}

const roadmapLine = content
  .split("\n")
  .find((line) => line.toLowerCase().includes("roadmap atual"));
if (!roadmapLine) {
  fail("EVIDENCE_INDEX missing roadmap source reference");
}
const roadmapTokens = [...roadmapLine.matchAll(/`([^`\n]+)`/g)];
if (roadmapTokens.length === 0) {
  fail("EVIDENCE_INDEX roadmap source is not enclosed in backticks", { roadmapLine });
}
const roadmapRef = normalizeRef(roadmapTokens[0][1]);
if (roadmapRef !== CANONICAL_ROADMAP) {
  fail("EVIDENCE_INDEX roadmap source is not canonical", {
    expected: CANONICAL_ROADMAP,
    got: roadmapRef,
  });
}
if (!fs.existsSync(path.resolve(ROOT, roadmapRef))) {
  fail("canonical roadmap file missing", { roadmap: roadmapRef });
}

const refs = new Set<string>();
const regex = /`([^`\n]+)`/g;
let match: RegExpExecArray | null;
while ((match = regex.exec(content))) {
  const normalized = normalizeRef(match[1]);
  if (isLikelyRepoPath(normalized)) refs.add(normalized);
}

const missingRefs = [...refs].filter((ref) => !fs.existsSync(path.resolve(ROOT, ref)));
if (missingRefs.length > 0) {
  fail("EVIDENCE_INDEX has missing file references", {
    missingCount: missingRefs.length,
    missingRefs: missingRefs.slice(0, 25),
  });
}

console.log(
  JSON.stringify(
    {
      ok: true,
      check: CHECK,
      file: "docs/EVIDENCE_INDEX.md",
      sizeChars: content.length,
      roadmap: roadmapRef,
      refsChecked: refs.size,
    },
    null,
    2,
  ),
);
