import fs from "node:fs";
import path from "node:path";

const CHECK = "check:p2-audit-interop";
const TODAY = new Date();

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

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

function findLatestEvidenceByPattern(pattern: string): string {
  const dir = path.join(process.cwd(), "ops/evidence/latest");
  if (!fs.existsSync(dir)) fail("missing_evidence_directory", { dir: path.relative(process.cwd(), dir) });
  const regex = globToRegExp(pattern);
  const matches = fs.readdirSync(dir).filter((file) => regex.test(file)).sort().reverse();
  if (matches.length === 0) {
    fail("policy_evidence_pattern_not_found", { pattern, dir: path.relative(process.cwd(), dir) });
  }
  return path.join(dir, matches[0]);
}

function extractDateFromFilename(filePath: string): Date | null {
  const match = path.basename(filePath).match(/(20\d{2}-\d{2}-\d{2})/);
  if (!match) return null;
  const parsed = new Date(`${match[1]}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function diffDays(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

function normalizeAction(action: string): string {
  return action.trim().replace(/^action\./, "");
}

function extractHighActionsFromAgentContracts(tsSource: string): string[] {
  const actions: string[] = [];
  // Locate every action key position first, then check each block independently
  // to avoid the cross-span bug where a MEDIUM action key precedes a HIGH block.
  const keyRegex = /"(realestate\.[^"]+)"\s*:\s*\{/g;
  const keys: Array<{ key: string; pos: number }> = [];
  let km: RegExpExecArray | null;
  while ((km = keyRegex.exec(tsSource)) !== null) {
    keys.push({ key: km[1], pos: km.index });
  }
  for (let i = 0; i < keys.length; i++) {
    const start = keys[i].pos;
    const end = i + 1 < keys.length ? keys[i + 1].pos : tsSource.length;
    const block = tsSource.slice(start, end);
    if (/tier:\s*"HIGH"/.test(block) && /txIdRequired:\s*true/.test(block)) {
      actions.push(keys[i].key);
    }
  }
  return actions;
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

function extractHighPolicyConfig(markdown: string): {
  maxEvidenceAgeDays: number | null;
  highActions: Array<{ action: string; evidencePattern: string | null }>;
} {
  const start = "<!-- HIGH_POLICY:START -->";
  const end = "<!-- HIGH_POLICY:END -->";
  const startIdx = markdown.indexOf(start);
  const endIdx = markdown.indexOf(end);
  if (startIdx < 0 || endIdx < 0 || endIdx <= startIdx) {
    return { maxEvidenceAgeDays: null, highActions: [] };
  }
  const block = markdown.slice(startIdx + start.length, endIdx);
  const jsonMatch = block.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { maxEvidenceAgeDays: null, highActions: [] };
  try {
    const parsed = JSON.parse(jsonMatch[0]) as {
      maxEvidenceAgeDays?: number;
      highActions?: Array<{ action?: string; evidencePattern?: string }>;
    };
    return {
      maxEvidenceAgeDays: typeof parsed.maxEvidenceAgeDays === "number" ? parsed.maxEvidenceAgeDays : null,
      highActions: (parsed.highActions ?? [])
        .map((item) => ({
          action: typeof item.action === "string" ? item.action : "",
          evidencePattern: typeof item.evidencePattern === "string" ? item.evidencePattern : null,
        }))
        .filter((item) => item.action),
    };
  } catch {
    return { maxEvidenceAgeDays: null, highActions: [] };
  }
}

const root = process.cwd();
const routesSmokeFile = findLatestEvidenceByPattern("interop-routes-smoke-*.json");
const e2eInteropFile = findLatestEvidenceByPattern("interop-e2e-agent-call-*.json");
const highActionsFile = findLatestEvidenceByPattern("realestate-high-actions-e2e-*.json");
const riskPolicyFile = path.join(root, "docs/ops/risk-tiering-by-action.md");
const agentRoutesFile = path.join(root, "apps/api/src/routes/agents.ts");

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
if (!fs.existsSync(agentRoutesFile)) fail("missing_agents_routes", { file: path.relative(root, agentRoutesFile) });

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
const agentsRoutesContent = fs.readFileSync(agentRoutesFile, "utf8");
const policyHighActions = extractHighActionsFromPolicy(policyContent).map(normalizeAction);
const policyConfig = extractHighPolicyConfig(policyContent);
if (policyHighActions.length === 0) {
  fail("risk_policy_high_actions_missing", { file: path.relative(root, riskPolicyFile) });
}

const highEvidenceActions = new Set((highActions.actions ?? []).map(normalizeAction));
const runtimeHighActions = extractHighActionsFromAgentContracts(agentsRoutesContent).map(normalizeAction);
if (runtimeHighActions.length === 0) {
  fail("runtime_high_actions_missing", {
    file: path.relative(root, agentRoutesFile),
  });
}
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

const missingRuntimeActionsInEvidence = [...new Set(runtimeHighActions)].filter(
  (action) => !highEvidenceActions.has(action)
);
if (missingRuntimeActionsInEvidence.length > 0) {
  fail("high_actions_evidence_missing_runtime_actions", {
    missingRuntimeActionsInEvidence,
    runtimeFile: path.relative(root, agentRoutesFile),
    highEvidenceFile: path.relative(root, highActionsFile),
  });
}

const missingEvidencePattern = policyConfig.highActions.filter((item) => !item.evidencePattern);
if (missingEvidencePattern.length > 0) {
  fail("risk_policy_high_actions_missing_evidence_pattern", {
    actions: missingEvidencePattern.map((item) => item.action),
    policyFile: path.relative(root, riskPolicyFile),
  });
}

const evidenceByAction = policyConfig.highActions.map((item) => {
  const latestFile = findLatestEvidenceByPattern(item.evidencePattern as string);
  const evidenceDate = extractDateFromFilename(latestFile);
  const ageDays = evidenceDate ? diffDays(evidenceDate, TODAY) : null;
  return {
    action: normalizeAction(item.action),
    file: path.relative(root, latestFile),
    ageDays,
  };
});

if (typeof policyConfig.maxEvidenceAgeDays !== "number" || policyConfig.maxEvidenceAgeDays <= 0) {
  fail("invalid_high_policy_max_evidence_age_days", {
    value: policyConfig.maxEvidenceAgeDays,
    policyFile: path.relative(root, riskPolicyFile),
  });
}

const staleEvidence = evidenceByAction.filter(
  (item) => item.ageDays === null || item.ageDays > (policyConfig.maxEvidenceAgeDays as number)
);
if (staleEvidence.length > 0) {
  fail("high_policy_evidence_too_old", {
    maxEvidenceAgeDays: policyConfig.maxEvidenceAgeDays,
    staleEvidence,
  });
}

for (const evidence of evidenceByAction) {
  if (!highEvidenceActions.has(evidence.action)) {
    fail("policy_action_not_present_in_matched_high_evidence", {
      action: evidence.action,
      evidenceFile: evidence.file,
    });
  }
}

console.log(
  JSON.stringify(
    {
      ok: true,
      check: CHECK,
      routes: requiredRoutes,
      policyHighActions: [...new Set(policyHighActions)],
      runtimeHighActions: [...new Set(runtimeHighActions)],
      highEvidenceActions: [...highEvidenceActions],
      policyEvidenceByAction: evidenceByAction,
      maxEvidenceAgeDays: policyConfig.maxEvidenceAgeDays,
      files: {
        routesSmoke: path.relative(root, routesSmokeFile),
        interopE2E: path.relative(root, e2eInteropFile),
        highActions: path.relative(root, highActionsFile),
        riskPolicy: path.relative(root, riskPolicyFile),
        runtimeAgents: path.relative(root, agentRoutesFile),
      },
    },
    null,
    2
  )
);
