import fs from "node:fs";
import path from "node:path";

const CHECK = "check:p2-high-global-coverage";

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

function readFile(relativePath: string): string {
  const file = path.resolve(relativePath);
  if (!fs.existsSync(file)) fail("missing_file", { file: relativePath });
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
    actions.push(normalize(nameMatch[1]));
  }
  return actions;
}

const root = process.cwd();
const billingActionsFile = path.join(root, "packages/core/src/actions/billing.ts");
const financeActionsFile = path.join(root, "packages/core/src/actions/finance.ts");
const notificationsActionsFile = path.join(root, "packages/core/src/actions/notifications.ts");
const coverageFile = path.join(root, "ops/evidence/latest/p2-high-global-coverage.json");

if (!fs.existsSync(coverageFile)) {
  fail("missing_global_high_coverage_evidence", { file: path.relative(root, coverageFile) });
}

const billingActions = extractHighActions(readFile("packages/core/src/actions/billing.ts"));
const financeActions = extractHighActions(readFile("packages/core/src/actions/finance.ts"));
const notificationsActions = extractHighActions(readFile("packages/core/src/actions/notifications.ts"));

const runtimeActions = new Set([
  ...billingActions,
  ...financeActions,
  ...notificationsActions,
]);
if (runtimeActions.size === 0) {
  fail("runtime_high_actions_not_found", {
    files: [
      path.relative(root, billingActionsFile),
      path.relative(root, financeActionsFile),
      path.relative(root, notificationsActionsFile),
    ],
  });
}

const coveragePayload = JSON.parse(fs.readFileSync(coverageFile, "utf8")) as {
  ok?: boolean;
  generatedAt?: string;
  scope?: string;
  items?: CoverageItem[];
};

if (coveragePayload.ok !== true) {
  fail("coverage_payload_not_ok", { file: path.relative(root, coverageFile) });
}

const items = coveragePayload.items ?? [];
if (items.length === 0) {
  fail("coverage_items_empty", { file: path.relative(root, coverageFile) });
}

const normalizedCoverageActions = items.map((item) => normalize(item.action));
const duplicatedActions = normalizedCoverageActions.filter(
  (value, idx, arr) => arr.indexOf(value) !== idx
);
if (duplicatedActions.length > 0) {
  fail("duplicated_actions_in_coverage", { duplicatedActions });
}

const coverageActions = new Set(normalizedCoverageActions);
const missingInCoverage = [...runtimeActions].filter((action) => !coverageActions.has(action));
if (missingInCoverage.length > 0) {
  fail("runtime_high_actions_missing_in_coverage", {
    missingInCoverage,
    coverageFile: path.relative(root, coverageFile),
  });
}

const unknownInCoverage = [...coverageActions].filter((action) => !runtimeActions.has(action));
if (unknownInCoverage.length > 0) {
  fail("coverage_has_unknown_actions", {
    unknownInCoverage,
    coverageFile: path.relative(root, coverageFile),
  });
}

const coveredActions = items.filter((item) => item.e2eCovered === true).map((item) => normalize(item.action));
const uncoveredActions = items.filter((item) => item.e2eCovered !== true).map((item) => normalize(item.action));

const invalidCoveredWithoutEvidence = items.filter(
  (item) => item.e2eCovered === true && (!item.evidence || !String(item.evidence).trim())
);
if (invalidCoveredWithoutEvidence.length > 0) {
  fail("covered_actions_missing_evidence_ref", {
    actions: invalidCoveredWithoutEvidence.map((item) => item.action),
  });
}

console.log(
  JSON.stringify(
    {
      ok: true,
      check: CHECK,
      runtimeHighActions: [...runtimeActions].sort(),
      coveredActions: coveredActions.sort(),
      uncoveredActions: uncoveredActions.sort(),
      files: {
        coverage: path.relative(root, coverageFile),
        billing: path.relative(root, billingActionsFile),
        finance: path.relative(root, financeActionsFile),
        notifications: path.relative(root, notificationsActionsFile),
      },
      note: "Gate complementar global: inventário HIGH completo do core + status de cobertura E2E.",
    },
    null,
    2
  )
);
