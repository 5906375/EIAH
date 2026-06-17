// H4 — Runbook and skip reason monitor validation tests
//
// Verifies that both the runbook and monitor documents are complete and correct:
//
// T-R1: all 7 ruleIds (IMOB-W-001..IMOB-W-007) appear in the runbook
// T-R2: all 7 ruleIds appear in the monitor document
// T-R3: no TODO or FIXME placeholders in either document
// T-R4: no PII samples (caseId, tenantId, workspaceId, ownerResponsible tokens) in either document
// T-R5: severities in runbook match DEFAULT_ALERT_CONFIG
//       W-001=error, W-002=error, W-003=warning, W-004=warning, W-005=warning, W-006=error, W-007=warning

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../../../");
const RUNBOOK_PATH = resolve(REPO_ROOT, "docs/ops/runbooks/imob-worker-observability.md");
const MONITOR_PATH = resolve(REPO_ROOT, "docs/ops/evidence/latest/imob-worker-observability/h4-skip-reason-monitor.md");

const RULE_IDS = [
  "IMOB-W-001",
  "IMOB-W-002",
  "IMOB-W-003",
  "IMOB-W-004",
  "IMOB-W-005",
  "IMOB-W-006",
  "IMOB-W-007",
] as const;

// Severities must match DEFAULT_ALERT_CONFIG in imobWorkerAlerts.ts
const RULE_SEVERITIES: Record<string, "ERROR" | "WARNING"> = {
  "IMOB-W-001": "ERROR",
  "IMOB-W-002": "ERROR",
  "IMOB-W-003": "WARNING",
  "IMOB-W-004": "WARNING",
  "IMOB-W-005": "WARNING",
  "IMOB-W-006": "ERROR",
  "IMOB-W-007": "WARNING",
};

const PII_TOKENS = [
  "case-abc",
  "tenant-xyz",
  "ws-",
  "workspace-abc",
  "ownerResponsible:",
  "Carlos Silva",
  "João Souza",
];

function readDoc(path: string): string {
  return readFileSync(path, "utf-8");
}

function linesContaining(content: string, token: string): string[] {
  return content.split("\n").filter((l) => l.includes(token));
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("[T-R1] all 7 ruleIds appear in the runbook", () => {
  const runbook = readDoc(RUNBOOK_PATH);

  for (const ruleId of RULE_IDS) {
    it(`runbook contains ${ruleId}`, () => {
      assert.ok(runbook.includes(ruleId), `runbook must contain ${ruleId}`);
    });
  }
});

describe("[T-R2] all 7 ruleIds appear in the monitor document", () => {
  const monitor = readDoc(MONITOR_PATH);

  for (const ruleId of RULE_IDS) {
    it(`monitor contains ${ruleId}`, () => {
      assert.ok(monitor.includes(ruleId), `monitor must contain ${ruleId}`);
    });
  }
});

describe("[T-R3] no TODO or FIXME in either document", () => {
  it("runbook has no TODO or FIXME", () => {
    const runbook = readDoc(RUNBOOK_PATH);
    assert.ok(!runbook.includes("TODO"), "runbook must not contain TODO");
    assert.ok(!runbook.includes("FIXME"), "runbook must not contain FIXME");
  });

  it("monitor has no TODO or FIXME", () => {
    const monitor = readDoc(MONITOR_PATH);
    assert.ok(!monitor.includes("TODO"), "monitor must not contain TODO");
    assert.ok(!monitor.includes("FIXME"), "monitor must not contain FIXME");
  });
});

describe("[T-R4] no PII samples in either document", () => {
  it("runbook contains no PII sample tokens", () => {
    const runbook = readDoc(RUNBOOK_PATH);
    for (const token of PII_TOKENS) {
      assert.ok(!runbook.includes(token), `runbook must not contain PII token: "${token}"`);
    }
  });

  it("monitor contains no PII sample tokens", () => {
    const monitor = readDoc(MONITOR_PATH);
    for (const token of PII_TOKENS) {
      assert.ok(!monitor.includes(token), `monitor must not contain PII token: "${token}"`);
    }
  });
});

describe("[T-R5] severities in runbook match DEFAULT_ALERT_CONFIG", () => {
  const runbook = readDoc(RUNBOOK_PATH);

  for (const [ruleId, expectedSeverity] of Object.entries(RULE_SEVERITIES)) {
    it(`${ruleId} has severity ${expectedSeverity} in runbook`, () => {
      const lines = linesContaining(runbook, ruleId);
      assert.ok(lines.length > 0, `${ruleId} must appear at least once in runbook`);

      const severityFound = lines.some((l) => l.toUpperCase().includes(expectedSeverity));
      assert.ok(
        severityFound,
        `${ruleId}: expected "${expectedSeverity}" on a line containing the ruleId. ` +
          `Lines found:\n${lines.join("\n")}`,
      );
    });
  }
});
