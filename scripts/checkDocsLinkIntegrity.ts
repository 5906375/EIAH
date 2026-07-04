import fs from "node:fs";
import path from "node:path";

const CHECK = "check:docs-link-integrity";
const ROOT = process.cwd();
const TARGET_FILES = [
  "CLAUDE.md",
  "CODEX.md",
  "AGENTS.md",
];

function fail(message: string, details?: Record<string, unknown>): never {
  console.error(JSON.stringify({ ok: false, check: CHECK, message, details }, null, 2));
  process.exit(1);
}

function listTargetFiles() {
  const files = [...TARGET_FILES];
  const optionalIa = path.resolve(ROOT, "IA_EIAH.md");
  if (fs.existsSync(optionalIa)) files.push("IA_EIAH.md");

  const docsArchitectureDir = path.resolve(ROOT, "docs/architecture");
  if (fs.existsSync(docsArchitectureDir)) {
    for (const entry of fs.readdirSync(docsArchitectureDir)) {
      if (entry.endsWith(".md")) {
        files.push(path.posix.join("docs/architecture", entry));
      }
    }
  }

  return [...new Set(files)].sort();
}

function isIgnoredTarget(target: string) {
  return (
    target.startsWith("http://") ||
    target.startsWith("https://") ||
    target.startsWith("mailto:") ||
    target.startsWith("#")
  );
}

function resolveTarget(baseFile: string, rawTarget: string) {
  const withoutAnchor = rawTarget.split("#")[0]?.trim() ?? "";
  if (!withoutAnchor) return null;
  if (withoutAnchor.startsWith("/")) return withoutAnchor;
  return path.resolve(path.dirname(baseFile), withoutAnchor);
}

function toRepoRelative(targetPath: string) {
  const relative = path.relative(ROOT, targetPath);
  return relative.startsWith("..") ? targetPath : relative || ".";
}

function collectMarkdownLinkErrors(filePath: string) {
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split("\n");
  const errors: Array<{ file: string; line: number; target: string; resolved: string }> = [];
  const linkRegex = /\[[^\]]+\]\(([^)\s]+)\)/g;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    let match: RegExpExecArray | null;

    while ((match = linkRegex.exec(line)) !== null) {
      const rawTarget = match[1].trim();
      if (isIgnoredTarget(rawTarget)) continue;

      const resolved = resolveTarget(filePath, rawTarget);
      if (!resolved) continue;

      if (!fs.existsSync(resolved)) {
        errors.push({
          file: toRepoRelative(filePath),
          line: index + 1,
          target: rawTarget,
          resolved: toRepoRelative(resolved),
        });
      }
    }
  }

  return errors;
}

const targetFiles = listTargetFiles();
const missingInputs = targetFiles.filter((file) => !fs.existsSync(path.resolve(ROOT, file)));
if (missingInputs.length > 0) {
  fail("documentation inputs missing", { missingInputs });
}

const errors = targetFiles.flatMap((file) => collectMarkdownLinkErrors(path.resolve(ROOT, file)));
if (errors.length > 0) {
  for (const error of errors) {
    console.error(`${error.file}:${error.line} invalid link ${error.target} -> ${error.resolved}`);
  }

  fail("invalid internal markdown links found", {
    invalidCount: errors.length,
    filesChecked: targetFiles.length,
  });
}

console.log(
  JSON.stringify(
    {
      ok: true,
      check: CHECK,
      filesChecked: targetFiles.length,
      targets: targetFiles,
    },
    null,
    2,
  ),
);
