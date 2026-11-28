import fs from "node:fs";
import path from "node:path";
import {
  RISK_TIER_POLICY_SOURCE,
  listRiskTierRulesAtOrAbove,
} from "../packages/core/src/policy/riskTierPolicy.ts";

const CHECK = "check:p1-critical-chain";

function fail(message: string, details?: Record<string, unknown>): never {
  console.error(JSON.stringify({ ok: false, check: CHECK, message, details }, null, 2));
  process.exit(1);
}

function readFile(relativePath: string): string {
  const file = path.resolve(relativePath);
  if (!fs.existsSync(file)) fail("missing_file", { file: relativePath });
  return fs.readFileSync(file, "utf8");
}

function assertContains(content: string, needle: string, key: string) {
  if (!content.includes(needle)) fail("missing_required_pattern", { key, needle });
}

function assertMatches(content: string, pattern: RegExp, key: string) {
  if (!pattern.test(content)) {
    fail("missing_required_pattern", { key, pattern: pattern.source });
  }
}

function findLatestEvidenceFile(pattern: RegExp): string {
  const dir = path.resolve("ops/evidence/latest");
  if (!fs.existsSync(dir)) fail("missing_evidence_directory", { dir });
  const files = fs.readdirSync(dir).filter((file) => pattern.test(file)).sort().reverse();
  if (files.length === 0) {
    fail("missing_evidence_file", { pattern: pattern.source, dir });
  }
  return path.join(dir, files[0]);
}

function normalizeAction(action: string): string {
  return action.trim().replace(/^action\./, "");
}

const prismaSchema = readFile("packages/db/prisma/schema.prisma");
const runsRoute = readFile("apps/api/src/routes/runs.ts");
const governanceRoute = readFile("apps/api/src/routes/governance.ts");
const receiptCanonService = readFile("apps/api/src/services/receiptCanonService.ts");
const apeRun9 = readFile("ops/evidence/latest/ape-weekly-cycle-run9-2026-03-09.md");
const highActions = JSON.parse(
  fs.readFileSync(findLatestEvidenceFile(/^realestate-high-actions-e2e-\d{4}-\d{2}-\d{2}\.json$/), "utf8")
) as {
  ok?: boolean;
  actions?: string[];
  assertions?: {
    txIdRequired?: boolean;
    tierHigh?: boolean;
  };
};

assertContains(prismaSchema, "approvalStatus RunApprovalStatus", "schema.approval_status");
assertMatches(prismaSchema, /\bapprovedBy\s+String\?/, "schema.approved_by");
assertMatches(prismaSchema, /\bapprovedAt\s+DateTime\?/, "schema.approved_at");
assertContains(runsRoute, 'post("/runs/:id/approve"', "route.run_approve");
assertContains(governanceRoute, 'get("/ledger/:txId"', "route.ledger_txid");
assertContains(governanceRoute, "approvalStatus", "ledger.approval_status");
assertContains(receiptCanonService, "approval_required", "receipt.reason_code_approval_required");
assertContains(receiptCanonService, "approval.policy.v1", "receipt.approval_policy");
assertContains(apeRun9, "auditGap: 0", "evidence.audit_gap_zero");
assertContains(apeRun9, "duplicateSideEffects: 0", "evidence.duplicate_side_effects_zero");
assertContains(governanceRoute, "RECEIPT_CANON_INCONSISTENT", "ledger.fail_closed_receipt_inconsistent");
assertContains(runsRoute, 'post("/runs/:id/approve"', "approval.route_available");

if (highActions.ok !== true) fail("high_actions_evidence_not_ok");
if (highActions.assertions?.txIdRequired !== true) {
  fail("high_actions_txid_required_invalid", {
    got: highActions.assertions?.txIdRequired ?? null,
  });
}
if (highActions.assertions?.tierHigh !== true) {
  fail("high_actions_tier_invalid", {
    got: highActions.assertions?.tierHigh ?? null,
  });
}

const policyHighActions = listRiskTierRulesAtOrAbove("high").map((rule) =>
  normalizeAction(rule.action),
);
if (policyHighActions.length === 0) {
  fail("risk_policy_high_actions_missing", { source: RISK_TIER_POLICY_SOURCE });
}
const evidenceHighActions = new Set((highActions.actions ?? []).map(normalizeAction));
const missingPolicyActionsInEvidence = [...new Set(policyHighActions)].filter(
  (action) => !evidenceHighActions.has(action)
);
if (missingPolicyActionsInEvidence.length > 0) {
  fail("high_actions_receipt_coverage_missing", {
    missingPolicyActionsInEvidence,
  });
}

console.log(
  JSON.stringify(
    {
      ok: true,
      check: CHECK,
      summary: {
        approvalChain: true,
        failClosedEvidence: true,
        receiptCanonOnHighFlows: true,
        policyHighCoverage: true,
        riskPolicySource: RISK_TIER_POLICY_SOURCE,
      },
    },
    null,
    2
  )
);
