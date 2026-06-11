import fs from "node:fs";

const CHECK = "check:e2e-recency";
const file = process.env.E2E_MANIFEST_PATH || "ops/evidence/latest/high-e2e-manifest.json";
const maxAgeDays = Number(process.env.E2E_RECENCY_MAX_DAYS || 7);

function fail(message: string, extra?: Record<string, unknown>): never {
  console.error(JSON.stringify({ ok: false, check: CHECK, message, file, ...extra }, null, 2));
  process.exit(1);
}

if (!fs.existsSync(file)) {
  fail("manifest not found");
}

const data = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;

// --- Anti-synthetic guards ---

// Reject known synthetic/recovery commit SHAs
const commitSha = data.commitSha as string | undefined;
if (!commitSha || commitSha === "recovery-local" || commitSha === "unknown") {
  fail("synthetic commitSha detected — must be a real git SHA", { commitSha });
}

// Reject staging run-id patterns that indicate synthetic/templated manifests
const runIds = data.runIds as unknown[] | undefined;
if (!Array.isArray(runIds) || runIds.length === 0) {
  fail("runIds must be a non-empty array");
}
const syntheticRunId = runIds.find(
  (id) => typeof id === "string" && (id.startsWith("run-stg-") || id === "error")
);
if (syntheticRunId !== undefined) {
  fail("synthetic runId detected — run-stg-* and 'error' are not valid evidence", { syntheticRunId });
}

// Require environment field (must be "staging" or explicit value)
if (!data.environment || typeof data.environment !== "string") {
  fail("missing required field: environment");
}

// Require generatedBy field (identifies the generator script)
if (!data.generatedBy || typeof data.generatedBy !== "string") {
  fail("missing required field: generatedBy");
}

// Require scenarioResults with at least 2 scenarios, all passed, latency > 0
const scenarioResults = data.scenarioResults as Array<Record<string, unknown>> | undefined;
if (!Array.isArray(scenarioResults) || scenarioResults.length < 2) {
  fail("scenarioResults must contain at least 2 scenarios", {
    found: Array.isArray(scenarioResults) ? scenarioResults.length : 0,
  });
}
const failedScenarios = scenarioResults.filter((s) => s.status !== "passed");
if (failedScenarios.length > 0) {
  fail("all scenarioResults must have status=passed", {
    failed: failedScenarios.map((s) => s.scenario),
  });
}
const zeroLatency = scenarioResults.filter((s) => !s.latencyMs || Number(s.latencyMs) <= 0);
if (zeroLatency.length > 0) {
  fail("all scenarioResults must have latencyMs > 0", {
    invalid: zeroLatency.map((s) => s.scenario),
  });
}

// --- Standard quality / recency checks ---

const ts = new Date((data.generatedAt || data.timestamp || 0) as string);
if (Number.isNaN(ts.getTime())) {
  fail("invalid generatedAt");
}
const age = (Date.now() - ts.getTime()) / (1000 * 60 * 60 * 24);

const qualityRequired = ["commitSha", "runIds", "bundleHashes", "scenarioResults", "latency", "manifestHash"];
const missing = qualityRequired.filter((k) => !(k in data));
if (missing.length) {
  fail("manifest quality missing fields", { missing });
}
if (age > maxAgeDays) {
  fail("manifest too old", { ageDays: age, maxAgeDays });
}

console.log(JSON.stringify({
  ok: true,
  check: CHECK,
  ageDays: Number(age.toFixed(3)),
  maxAgeDays,
  environment: data.environment,
  scenarios: scenarioResults.length,
  file,
}, null, 2));
