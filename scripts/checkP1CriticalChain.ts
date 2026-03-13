import fs from "node:fs";
import path from "node:path";

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

const prismaSchema = readFile("packages/db/prisma/schema.prisma");
const runsRoute = readFile("apps/api/src/routes/runs.ts");
const governanceRoute = readFile("apps/api/src/routes/governance.ts");
const receiptCanonService = readFile("apps/api/src/services/receiptCanonService.ts");
const apeRun9 = readFile("ops/evidence/latest/ape-weekly-cycle-run9-2026-03-09.md");
const highActions = JSON.parse(
  readFile("ops/evidence/latest/realestate-high-actions-e2e-2026-03-09.json")
) as {
  ok?: boolean;
  assertions?: {
    receiptCanonSpec?: string;
    txIdRequired?: boolean;
    tierHigh?: boolean;
  };
};

assertContains(prismaSchema, "approvalStatus RunApprovalStatus", "schema.approval_status");
assertContains(prismaSchema, 'approvedBy   String?', "schema.approved_by");
assertContains(prismaSchema, 'approvedAt   DateTime?', "schema.approved_at");
assertContains(runsRoute, 'post("/runs/:id/approve"', "route.run_approve");
assertContains(governanceRoute, 'get("/ledger/:txId"', "route.ledger_txid");
assertContains(governanceRoute, "approvalStatus", "ledger.approval_status");
assertContains(receiptCanonService, "approval_required", "receipt.reason_code_approval_required");
assertContains(receiptCanonService, "approval.policy.v1", "receipt.approval_policy");
assertContains(apeRun9, "auditGap: 0", "evidence.audit_gap_zero");
assertContains(apeRun9, "duplicateSideEffects: 0", "evidence.duplicate_side_effects_zero");

if (highActions.ok !== true) fail("high_actions_evidence_not_ok");
if (highActions.assertions?.receiptCanonSpec !== "receipt.canon.v1") {
  fail("high_actions_receipt_spec_invalid", {
    got: highActions.assertions?.receiptCanonSpec ?? null,
  });
}
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

console.log(
  JSON.stringify(
    {
      ok: true,
      check: CHECK,
      summary: {
        approvalChain: true,
        failClosedEvidence: true,
        receiptCanonOnHighFlows: true,
      },
    },
    null,
    2
  )
);
