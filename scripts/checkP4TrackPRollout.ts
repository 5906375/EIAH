import fs from "node:fs";
import path from "node:path";

const CHECK = "check:p4-trackp-rollout";
const PILOT_FILE = "ops/evidence/latest/realestate-pilot-rollout-2026-03-09.md";
const KPI_FILE = "ops/evidence/latest/w4-non-regression-kpis.json";
const EVIDENCE_DIR = path.resolve("ops/evidence/latest");
const MIN_APE_CYCLES = Number(process.env.P4_MIN_APE_CYCLES ?? 2);
const MAX_AGE_DAYS = Number(process.env.P4_MAX_AGE_DAYS ?? 14);

type KpiDoc = {
  gates?: { hardMetricsGo?: boolean; nonRegressionGo?: boolean };
  kpis?: {
    moduleActivationSuccessRatePct?: number;
    timeToFirstRunP95Minutes?: number;
    receiptCoveragePct?: number;
    crossTenantAuthFailures?: number;
    duplicateSideEffects?: number;
  };
};

function fail(message: string, details?: Record<string, unknown>): never {
  console.error(JSON.stringify({ ok: false, check: CHECK, message, details }, null, 2));
  process.exit(1);
}

function readText(relativePath: string): string {
  const file = path.resolve(relativePath);
  if (!fs.existsSync(file)) fail("missing_file", { file: relativePath });
  return fs.readFileSync(file, "utf8");
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(readText(relativePath)) as T;
}

function parseDate(content: string): Date | null {
  const fromData = content.match(/Data:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/i);
  if (fromData) {
    const d = new Date(`${fromData[1]}T00:00:00Z`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const fromTitle = content.match(/#\s*APE Weekly Cycle #\d+\s*[—-]\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/i);
  if (fromTitle) {
    const d = new Date(`${fromTitle[1]}T00:00:00Z`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

function parseBoolean(content: string, key: string): boolean | null {
  const colon = new RegExp(`-\\s*${key}\\s*:\\s*(true|false)`, "i");
  const equals = new RegExp(`${key}\\s*=\\s*(true|false)`, "i");
  const colonMatch = content.match(colon);
  if (colonMatch) return colonMatch[1].toLowerCase() === "true";
  const equalsMatch = content.match(equals);
  if (equalsMatch) return equalsMatch[1].toLowerCase() === "true";
  return null;
}

const pilot = readText(PILOT_FILE).toLowerCase();
for (const step of ["shadow", "pilot", "small"]) {
  if (!pilot.includes(step)) {
    fail("missing_rollout_phase", { step, file: PILOT_FILE });
  }
}

const kpi = readJson<KpiDoc>(KPI_FILE);
if (kpi.gates?.hardMetricsGo !== true || kpi.gates?.nonRegressionGo !== true) {
  fail("kpi_gates_not_green", { gates: kpi.gates ?? null });
}
if ((kpi.kpis?.moduleActivationSuccessRatePct ?? 0) < 95) {
  fail("kpi_module_activation_below_threshold", { got: kpi.kpis?.moduleActivationSuccessRatePct ?? null });
}
if ((kpi.kpis?.receiptCoveragePct ?? 0) < 99) {
  fail("kpi_receipt_coverage_below_threshold", { got: kpi.kpis?.receiptCoveragePct ?? null });
}
if ((kpi.kpis?.crossTenantAuthFailures ?? 1) !== 0) {
  fail("kpi_cross_tenant_failures_not_zero", { got: kpi.kpis?.crossTenantAuthFailures ?? null });
}
if ((kpi.kpis?.duplicateSideEffects ?? 1) !== 0) {
  fail("kpi_duplicate_side_effects_not_zero", { got: kpi.kpis?.duplicateSideEffects ?? null });
}

const cycleFiles = fs
  .readdirSync(EVIDENCE_DIR)
  .filter((name) => /^ape-weekly-cycle-run\d+-\d{4}-\d{2}-\d{2}\.md$/.test(name))
  .sort((a, b) => {
    const runA = Number(a.match(/^ape-weekly-cycle-run(\d+)-/)?.[1] ?? 0);
    const runB = Number(b.match(/^ape-weekly-cycle-run(\d+)-/)?.[1] ?? 0);
    return runB - runA;
  })
  .slice(0, MIN_APE_CYCLES);

if (cycleFiles.length < MIN_APE_CYCLES) {
  fail("insufficient_ape_cycles_for_rollout", { found: cycleFiles.length, required: MIN_APE_CYCLES });
}

const now = Date.now();
const cycles = cycleFiles.map((file) => {
  const content = readText(path.join("ops/evidence/latest", file));
  const d = parseDate(content);
  if (!d) fail("unable_to_parse_cycle_date", { file });
  const ageDays = (now - d.getTime()) / (1000 * 60 * 60 * 24);
  return {
    file,
    ageDays: Number(ageDays.toFixed(2)),
    hardMetricsGo: parseBoolean(content, "hardMetricsGo"),
  };
});

const tooOld = cycles.filter((item) => item.ageDays > MAX_AGE_DAYS);
if (tooOld.length > 0) {
  fail("rollout_evidence_too_old", { maxAgeDays: MAX_AGE_DAYS, tooOld });
}

const notGreen = cycles.filter((item) => item.hardMetricsGo !== true);
if (notGreen.length > 0) {
  fail("ape_cycles_not_green", { notGreen });
}

console.log(
  JSON.stringify(
    {
      ok: true,
      check: CHECK,
      rolloutPhases: ["shadow", "pilot", "small"],
      kpiFile: KPI_FILE,
      pilotFile: PILOT_FILE,
      cycles,
    },
    null,
    2
  )
);
