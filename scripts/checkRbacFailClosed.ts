import fs from "node:fs";
import path from "node:path";

const CHECK = "check:rbac-fail-closed";

function fail(message: string, details?: Record<string, unknown>): never {
  console.error(JSON.stringify({ ok: false, check: CHECK, message, details }, null, 2));
  process.exit(1);
}

function ensureFile(relativePath: string): string {
  const file = path.resolve(relativePath);
  if (!fs.existsSync(file)) fail("missing_file", { file: relativePath });
  return file;
}

function readFile(relativePath: string): string {
  return fs.readFileSync(ensureFile(relativePath), "utf8");
}

function assertMissingPattern(relativePath: string, content: string, pattern: RegExp, reason: string) {
  const match = content.match(pattern);
  if (!match) return;
  fail("forbidden_pattern_detected", {
    file: relativePath,
    reason,
    pattern: pattern.source,
    snippet: match[0],
  });
}

const tenantPolicyFiles = [
  "packages/core/src/policy/TenantPolicyStore.ts",
  "packages/core/src/policy/TenantPolicyStore.js",
];

const requiredTests = [
  "packages/core/src/security/rbac.fail-closed.test.ts",
  "apps/api/src/tests/require-scope.fail-closed.test.ts",
];

for (const testFile of requiredTests) {
  ensureFile(testFile);
}

for (const file of tenantPolicyFiles) {
  const content = readFile(file);
  assertMissingPattern(file, content, /Default allow/i, "default_allow_comment");
  assertMissingPattern(file, content, /allow-all/i, "allow_all_phrase");
  assertMissingPattern(file, content, /allow all/i, "allow_all_phrase_spaced");
  assertMissingPattern(file, content, /policies are enforced/i, "legacy_stub_phrase");
  assertMissingPattern(file, content, /\breturn\s+true\s*;/, "permissive_return_true");
}

console.log(
  JSON.stringify(
    {
      ok: true,
      check: CHECK,
      summary: {
        tenantPolicyRuntimeGuarded: true,
        tenantPolicyBuildArtifactGuarded: true,
        requiredFailClosedTestsPresent: true,
      },
    },
    null,
    2
  )
);
