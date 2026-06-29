import fs from "node:fs";
import path from "node:path";

const CHECK = "check:guardrail-ledger-noop";

function fail(message: string, details?: Record<string, unknown>): never {
  console.error(JSON.stringify({ ok: false, check: CHECK, message, details }, null, 2));
  process.exit(1);
}

function readFile(relativePath: string): string {
  const file = path.resolve(relativePath);
  if (!fs.existsSync(file)) fail("missing_file", { file: relativePath });
  return fs.readFileSync(file, "utf8");
}

function assertContains(content: string, needle: string, details: Record<string, unknown>) {
  if (!content.includes(needle)) fail("missing_required_pattern", details);
}

function assertMissingPattern(content: string, pattern: RegExp, details: Record<string, unknown>) {
  const match = content.match(pattern);
  if (!match) return;
  fail("forbidden_pattern_detected", { ...details, pattern: pattern.source, snippet: match[0] });
}

const ledgerFile = "packages/core/src/audit/guardrailLedger.ts";
const ledgerTestFile = "packages/core/src/security/rbac.fail-closed.test.ts";

const ledgerSource = readFile(ledgerFile);
const ledgerTests = readFile(ledgerTestFile);

assertMissingPattern(ledgerSource, /No-op placeholder/i, {
  file: ledgerFile,
  reason: "noop_placeholder_comment",
});
assertMissingPattern(ledgerSource, /\bno-op\b/i, {
  file: ledgerFile,
  reason: "noop_phrase",
});
assertMissingPattern(ledgerSource, /async\s+log\s*\([^)]*\)\s*\{\s*\}/, {
  file: ledgerFile,
  reason: "empty_log_method",
});

assertContains(ledgerSource, "recordGuardrailLedger", {
  file: ledgerFile,
  key: "record_guardrail_ledger_call",
});
assertContains(ledgerSource, "recordGuardrailAudit", {
  file: ledgerFile,
  key: "record_guardrail_audit_call",
});

assertContains(ledgerTests, "RBAC deny persists a guardrail ledger event", {
  file: ledgerTestFile,
  key: "deny_persistence_coverage",
});
assertContains(ledgerTests, "RBAC allow persists a guardrail ledger event", {
  file: ledgerTestFile,
  key: "allow_persistence_coverage",
});
assertContains(ledgerTests, "RBAC deny writes exactly one GuardrailLedger record", {
  file: ledgerTestFile,
  key: "deny_single_guardrail_ledger",
});
assertContains(ledgerTests, "RBAC deny writes exactly one GuardrailAuditLedger record", {
  file: ledgerTestFile,
  key: "deny_single_guardrail_audit",
});
assertContains(ledgerTests, "RBAC allow writes exactly one GuardrailLedger record", {
  file: ledgerTestFile,
  key: "allow_single_guardrail_ledger",
});
assertContains(ledgerTests, "RBAC allow writes exactly one GuardrailAuditLedger record", {
  file: ledgerTestFile,
  key: "allow_single_guardrail_audit",
});

console.log(
  JSON.stringify(
    {
      ok: true,
      check: CHECK,
      summary: {
        guardrailLedgerRuntimeGuarded: true,
        persistentStoreCallsPresent: true,
        ledgerCoveragePresent: true,
      },
    },
    null,
    2
  )
);
