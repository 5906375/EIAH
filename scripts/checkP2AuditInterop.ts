import fs from "node:fs";
import path from "node:path";

const CHECK = "check:p2-audit-interop";

function fail(message: string, details?: Record<string, unknown>): never {
  console.error(JSON.stringify({ ok: false, check: CHECK, message, details }, null, 2));
  process.exit(1);
}

function readJson<T>(file: string): T {
  if (!fs.existsSync(file)) fail("missing_file", { file });
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch (error) {
    fail("invalid_json", {
      file,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function normalizeAction(action: string): string {
  return action.trim().replace(/^action\./, "");
}

function extractHighActionsFromPolicy(markdown: string): string[] {
  const start = "<!-- HIGH_POLICY:START -->";
  const end = "<!-- HIGH_POLICY:END -->";
  const startIdx = markdown.indexOf(start);
  const endIdx = markdown.indexOf(end);
  if (startIdx < 0 || endIdx < 0 || endIdx <= startIdx) return [];
  const block = markdown.slice(startIdx + start.length, endIdx);
  const jsonMatch = block.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return [];

  try {
    const parsed = JSON.parse(jsonMatch[0]) as {
      highActions?: Array<{ action?: string }>;
    };
    return (parsed.highActions ?? [])
      .map((item) => (typeof item.action === "string" ? item.action : ""))
      .filter(Boolean);
  } catch {
    return [];
  }
}

const root = process.cwd();
const routesSmokeFile = path.join(root, "ops/evidence/latest/interop-routes-smoke-2026-03-09.json");
const e2eInteropFile = path.join(root, "ops/evidence/latest/interop-e2e-agent-call-2026-03-09.json");
const highActionsFile = path.join(root, "ops/evidence/latest/realestate-high-actions-e2e-2026-03-09.json");
const riskPolicyFile = path.join(root, "docs/ops/risk-tiering-by-action.md");

const routesSmoke = readJson<{
  ok?: boolean;
  routes?: Array<{ path?: string; implemented?: boolean }>;
}>(routesSmokeFile);
const interopE2E = readJson<{
  ok?: boolean;
  flow?: string[];
  assertions?: {
    discovery?: { status?: number };
    negotiate?: { status?: number; receiptSpecVersion?: string };
    execute?: { status?: number; returnsRunId?: boolean };
    verifyReceipt?: { status?: number; receiptCanonSpecVersion?: string };
  };
}>(e2eInteropFile);
const highActions = readJson<{
  ok?: boolean;
  actions?: string[];
  assertions?: {
    tierHigh?: boolean;
    txIdRequired?: boolean;
    receiptCanonSpec?: string;
  };
}>(highActionsFile);

if (routesSmoke.ok !== true) fail("interop_routes_smoke_not_ok", { file: path.relative(root, routesSmokeFile) });
if (interopE2E.ok !== true) fail("interop_e2e_not_ok", { file: path.relative(root, e2eInteropFile) });
if (highActions.ok !== true) fail("high_actions_e2e_not_ok", { file: path.relative(root, highActionsFile) });
if (!fs.existsSync(riskPolicyFile)) fail("missing_risk_policy", { file: path.relative(root, riskPolicyFile) });

const routePaths = new Set((routesSmoke.routes ?? []).filter((r) => r.implemented).map((r) => r.path ?? ""));
const requiredRoutes = ["/api/agents/discovery", "/api/agents/negotiate", "/api/agents/execute"];
const missingRoutes = requiredRoutes.filter((route) => !routePaths.has(route));
if (missingRoutes.length > 0) {
  fail("missing_required_interop_routes", { missingRoutes, file: path.relative(root, routesSmokeFile) });
}

const flowText = (interopE2E.flow ?? []).join(" | ").toLowerCase();
for (const token of ["discovery", "negotiate", "execute"]) {
  if (!flowText.includes(token)) {
    fail("interop_e2e_missing_flow_step", { step: token, file: path.relative(root, e2eInteropFile) });
  }
}

if (interopE2E.assertions?.discovery?.status !== 200) fail("interop_discovery_status_invalid");
if (interopE2E.assertions?.negotiate?.status !== 200) fail("interop_negotiate_status_invalid");
if (interopE2E.assertions?.execute?.status !== 202) fail("interop_execute_status_invalid");
if (interopE2E.assertions?.execute?.returnsRunId !== true) fail("interop_execute_runid_missing");
if (interopE2E.assertions?.verifyReceipt?.status !== 200) fail("interop_verify_receipt_status_invalid");
if (interopE2E.assertions?.verifyReceipt?.receiptCanonSpecVersion !== "receipt.canon.v1") {
  fail("interop_verify_receipt_spec_invalid", {
    got: interopE2E.assertions?.verifyReceipt?.receiptCanonSpecVersion ?? null,
  });
}

if (highActions.assertions?.tierHigh !== true) fail("high_actions_tier_not_high");
if (highActions.assertions?.txIdRequired !== true) fail("high_actions_txid_required_invalid");
if (highActions.assertions?.receiptCanonSpec !== "receipt.canon.v1") {
  fail("high_actions_receipt_spec_invalid", { got: highActions.assertions?.receiptCanonSpec ?? null });
}

const policyContent = fs.readFileSync(riskPolicyFile, "utf8");
const policyHighActions = extractHighActionsFromPolicy(policyContent).map(normalizeAction);
if (policyHighActions.length === 0) {
  fail("risk_policy_high_actions_missing", { file: path.relative(root, riskPolicyFile) });
}

const highEvidenceActions = new Set((highActions.actions ?? []).map(normalizeAction));
const missingPolicyActionsInEvidence = [...new Set(policyHighActions)].filter(
  (action) => !highEvidenceActions.has(action)
);
if (missingPolicyActionsInEvidence.length > 0) {
  fail("high_actions_evidence_missing_policy_actions", {
    missingPolicyActionsInEvidence,
    policyFile: path.relative(root, riskPolicyFile),
    highEvidenceFile: path.relative(root, highActionsFile),
  });
}

console.log(
  JSON.stringify(
    {
      ok: true,
      check: CHECK,
      routes: requiredRoutes,
      policyHighActions: [...new Set(policyHighActions)],
      highEvidenceActions: [...highEvidenceActions],
      files: {
        routesSmoke: path.relative(root, routesSmokeFile),
        interopE2E: path.relative(root, e2eInteropFile),
        highActions: path.relative(root, highActionsFile),
        riskPolicy: path.relative(root, riskPolicyFile),
      },
    },
    null,
    2
  )
);

