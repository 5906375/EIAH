#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

/**
 * SLO Target Gate — bloqueante quando targets ratificados.
 *
 * Comportamento progressivo:
 *   - ratified: false  → warn-only, exit 0 (aguardando 3 ciclos APE com p95Ms real)
 *   - ratified: true   → gate bloqueante, exit 1 se p95Ms > target ou baseline ausente
 *
 * Para ratificar:
 *   1. Ter >=3 ciclos APE com economy-slo-baseline-*.json com p95Ms real
 *   2. Computar targetP95Ms = max(500, ceil(min(maxP95 × 2.5, maxP99 × 1.5) / 100) × 100)
 *   3. Atualizar ops/evidence/latest/economy-slo-targets.json com ratified: true
 */

const CHECK = "check:slo-target";
const EVIDENCE_DIR = "ops/evidence/latest";
const TARGETS_FILE = path.join(EVIDENCE_DIR, "economy-slo-targets.json");

function findLatestBaseline(): string | null {
  if (!fs.existsSync(EVIDENCE_DIR)) return null;
  const files = fs
    .readdirSync(EVIDENCE_DIR)
    .filter((f) => f.startsWith("economy-slo-baseline-") && f.endsWith(".json"))
    .sort()
    .reverse();
  return files.length ? path.join(EVIDENCE_DIR, files[0]) : null;
}

function warn(message: string, extra?: Record<string, unknown>): void {
  console.warn(JSON.stringify({ ok: false, check: CHECK, warn: true, message, ...extra }, null, 2));
}

function fail(message: string, extra?: Record<string, unknown>): never {
  console.error(JSON.stringify({ ok: false, check: CHECK, message, ...extra }, null, 2));
  process.exit(1);
}

// --- Ler targets ---

if (!fs.existsSync(TARGETS_FILE)) {
  warn("economy-slo-targets.json not found — warn-only until PR-P3-04 is ratified", {
    expected: TARGETS_FILE,
  });
  process.exit(0);
}

const targets = JSON.parse(fs.readFileSync(TARGETS_FILE, "utf8")) as Record<string, unknown>;

// Gate progressivo: warn-only enquanto não ratificado
if (!targets.ratified) {
  warn("SLO targets not yet ratified — warn-only phase active", {
    ratificationNote: targets.ratificationNote,
    file: TARGETS_FILE,
  });
  process.exit(0);
}

// --- A partir daqui: targets ratificados → gate bloqueante ---

const pouTarget = (targets.pouFinalize as Record<string, unknown> | undefined);
const targetP95Ms = pouTarget?.targetP95Ms as number | null | undefined;
const minSamples = (pouTarget?.minSamplesRequired as number | undefined) ?? 3;

if (!targetP95Ms || typeof targetP95Ms !== "number") {
  fail("SLO targets file has ratified:true but pouFinalize.targetP95Ms is missing or null", {
    file: TARGETS_FILE,
  });
}

// --- Ler baseline ---

const latestBaseline = findLatestBaseline();
if (!latestBaseline) {
  fail("No SLO baseline file found — run generate:slo-baseline first", {
    evidenceDir: EVIDENCE_DIR,
  });
}

const baseline = JSON.parse(fs.readFileSync(latestBaseline, "utf8")) as Record<string, unknown>;
const pouBaseline = baseline.pouFinalize as Record<string, unknown> | undefined;
const actualP95Ms = pouBaseline?.p95Ms as number | null | undefined;
const samplesCount = (baseline.samplesCount as number | undefined) ?? 0;
const sampleSource = baseline.sampleSource as string | undefined;
const manifestCommitSha = baseline.manifestCommitSha as string | null | undefined;

// --- Guards de ratificação: bloquear dados simulados ou agregados ---

if (sampleSource !== "scenario-latency") {
  fail(
    `Cannot ratify: baseline sampleSource must be 'scenario-latency', got '${sampleSource ?? "unknown"}' — real staging E2E HIGH runs required`,
    {
      file: latestBaseline,
      sampleSource,
      hint: "Run generate:e2e-high-manifest with STAGING_API_BASE_URL/TOKEN/TENANT_ID/WORKSPACE_ID set, then generate:slo-baseline",
    }
  );
}

if (manifestCommitSha === "recovery-local" || manifestCommitSha === null || manifestCommitSha === undefined) {
  fail(
    manifestCommitSha === "recovery-local"
      ? "Cannot ratify: manifest commitSha is 'recovery-local' — real staging run required"
      : "Cannot ratify: baseline does not record manifestCommitSha — regenerate after real staging E2E HIGH run",
    {
      file: latestBaseline,
      manifestCommitSha: manifestCommitSha ?? null,
      hint: "Set STAGING_API_BASE_URL, STAGING_API_TOKEN, E2E_TENANT_ID, E2E_WORKSPACE_ID and rerun generate:e2e-high-manifest",
    }
  );
}

if (samplesCount === 0) {
  fail("Cannot ratify: samplesCount is 0 — baseline has no real latency samples", {
    file: latestBaseline,
    samplesCount,
    sampleSource,
  });
}

if (actualP95Ms === null || actualP95Ms === undefined) {
  fail("SLO baseline does not contain real p95Ms — staging E2E HIGH runs required", {
    file: latestBaseline,
    samplesCount,
    minSamplesRequired: minSamples,
  });
}

if (samplesCount < minSamples) {
  fail(`Insufficient samples: need ${minSamples}, got ${samplesCount}`, {
    file: latestBaseline,
    samplesCount,
    minSamplesRequired: minSamples,
  });
}

// --- Baseline recency ---
const baselineAgeMs = Date.now() - new Date(baseline.generatedAt as string).getTime();
const baselineAgeDays = baselineAgeMs / (1000 * 60 * 60 * 24);
if (baselineAgeDays > 14) {
  fail("SLO baseline is older than 14 days — regenerate baseline before gate check", {
    file: latestBaseline,
    ageDays: Number(baselineAgeDays.toFixed(1)),
  });
}

// --- Gate: p95Ms within target ---
if (actualP95Ms > targetP95Ms) {
  fail(`SLO breach: pouFinalize p95Ms ${actualP95Ms}ms exceeds target ${targetP95Ms}ms`, {
    actualP95Ms,
    targetP95Ms,
    deltaMs: actualP95Ms - targetP95Ms,
    file: latestBaseline,
  });
}

console.log(
  JSON.stringify({
    ok: true,
    check: CHECK,
    pouFinalizeP95Ms: actualP95Ms,
    pouFinalizeP99Ms: pouBaseline?.p99Ms ?? null,
    targetP95Ms,
    marginMs: targetP95Ms - actualP95Ms,
    samplesCount,
    baselineAgeDays: Number(baselineAgeDays.toFixed(1)),
    ratifiedAt: targets.ratifiedAt,
    file: latestBaseline,
  }, null, 2)
);
