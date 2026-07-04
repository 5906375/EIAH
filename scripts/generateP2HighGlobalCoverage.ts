import fs from "node:fs";
import path from "node:path";

const CHECK = "generate:p2-high-global-coverage";
const ROOT = process.cwd();
const COVERAGE_FILE = path.join(ROOT, "ops/evidence/latest/p2-high-global-coverage.json");
const BILLING_ACTIONS_FILE = path.join(ROOT, "packages/core/src/actions/billing.ts");
const FINANCE_ACTIONS_FILE = path.join(ROOT, "packages/core/src/actions/finance.ts");
const NOTIFICATIONS_ACTIONS_FILE = path.join(ROOT, "packages/core/src/actions/notifications.ts");
const E2E_EVIDENCE_FILE = "packages/core/src/actions/__tests__/highGlobalCoverage.e2e.test.ts";
const E2E_EVIDENCE_PATH = path.join(ROOT, E2E_EVIDENCE_FILE);

type CoverageItem = {
  action: string;
  source: "billing" | "finance" | "notifications";
  e2eCovered: boolean;
  evidence?: string | null;
  notes?: string | null;
};

function fail(message: string, details?: Record<string, unknown>): never {
  console.error(JSON.stringify({ ok: false, check: CHECK, message, details }, null, 2));
  process.exit(1);
}

function readFile(file: string): string {
  if (!fs.existsSync(file)) {
    fail("missing_file", { file: path.relative(ROOT, file) });
  }

  return fs.readFileSync(file, "utf8");
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function extractHighActions(tsSource: string): string[] {
  const actions: string[] = [];
  const blockRegex = /registerAction\(\{[\s\S]*?\}\);/g;
  let block: RegExpExecArray | null;

  while ((block = blockRegex.exec(tsSource)) !== null) {
    const text = block[0];
    const isHigh = /criticality:\s*"high"/.test(text);
    if (!isHigh) continue;
    const nameMatch = text.match(/name:\s*"([^"]+)"/);
    if (!nameMatch) continue;
    actions.push(nameMatch[1].trim());
  }

  return actions;
}

function extractCoveredActionsFromE2E(tsSource: string): string[] {
  const actions = new Set<string>();
  const regex = /executeRegisteredAction\("([^"]+)"/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(tsSource)) !== null) {
    actions.add(match[1].trim());
  }

  return [...actions];
}

function inferSource(action: string): CoverageItem["source"] {
  if (action.startsWith("billing.")) return "billing";
  if (action.startsWith("finance.")) return "finance";
  if (action.startsWith("notification.")) return "notifications";
  fail("unknown_action_source", { action });
}

const runtimeActions = [
  ...extractHighActions(readFile(BILLING_ACTIONS_FILE)),
  ...extractHighActions(readFile(FINANCE_ACTIONS_FILE)),
  ...extractHighActions(readFile(NOTIFICATIONS_ACTIONS_FILE)),
];

if (runtimeActions.length === 0) {
  fail("runtime_high_actions_not_found", {
    files: [
      path.relative(ROOT, BILLING_ACTIONS_FILE),
      path.relative(ROOT, FINANCE_ACTIONS_FILE),
      path.relative(ROOT, NOTIFICATIONS_ACTIONS_FILE),
    ],
  });
}

const runtimeDeduped = [...new Set(runtimeActions)];
const coveredFromE2E = extractCoveredActionsFromE2E(readFile(E2E_EVIDENCE_PATH));
const coveredSet = new Set(coveredFromE2E.map(normalize));
const uncoveredActions = runtimeDeduped.filter((action) => !coveredSet.has(normalize(action))).sort();

if (uncoveredActions.length > 0) {
  fail("high_actions_without_e2e_coverage", {
    uncoveredActions,
    evidence: E2E_EVIDENCE_FILE,
  });
}

const items: CoverageItem[] = runtimeDeduped
  .sort((a, b) => a.localeCompare(b))
  .map((action) => ({
    action,
    source: inferSource(action),
    e2eCovered: true,
    evidence: E2E_EVIDENCE_FILE,
    notes: "Coberto no cenario e2e global de acoes HIGH.",
  }));

const payload = {
  ok: true,
  generatedAt: new Date().toISOString(),
  scope: "p2-global-core-high-inventory-v1",
  items,
};

fs.writeFileSync(COVERAGE_FILE, `${JSON.stringify(payload, null, 2)}\n`);

console.log(
  JSON.stringify(
    {
      ok: true,
      check: CHECK,
      generatedFile: path.relative(ROOT, COVERAGE_FILE),
      generatedAt: payload.generatedAt,
      coveredActions: items.map((item) => item.action),
      uncoveredActions: [],
      evidence: E2E_EVIDENCE_FILE,
    },
    null,
    2,
  ),
);
