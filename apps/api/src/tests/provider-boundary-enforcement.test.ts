import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(process.cwd(), "..", "..");
const SCAN_ROOTS = [
  path.resolve(REPO_ROOT, "apps/api/src"),
  path.resolve(REPO_ROOT, "apps/web/src"),
];
const ALLOWED_PROVIDER_IMPORT_FILES = new Set([
  path.resolve(REPO_ROOT, "apps/api/src/orchestrator/llmExecutor.ts"),
]);

const BANNED_IMPORT_PATTERNS = [
  /from\s+["']@eiah\/providers["']/,
  /from\s+["'][^"']*OpenAIProvider[^"']*["']/,
  /from\s+["'][^"']*AnthropicProvider[^"']*["']/,
  /from\s+["'][^"']*GeminiProvider[^"']*["']/,
  /from\s+["'][^"']*DeepSeekProvider[^"']*["']/,
];

function walk(dir: string, acc: string[] = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, acc);
      continue;
    }
    if (full.endsWith(".ts") || full.endsWith(".tsx")) {
      acc.push(full);
    }
  }
  return acc;
}

test("vendor-specific provider imports stay centralized in the engine boundary", () => {
  const files = SCAN_ROOTS.flatMap((root) => walk(root));
  const offenders: string[] = [];

  for (const file of files) {
    if (ALLOWED_PROVIDER_IMPORT_FILES.has(file)) continue;
    const source = fs.readFileSync(file, "utf-8");
    if (BANNED_IMPORT_PATTERNS.some((pattern) => pattern.test(source))) {
      offenders.push(path.relative(process.cwd(), file));
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `Provider imports must stay inside the engine boundary. Offenders: ${offenders.join(", ")}`
  );
});
