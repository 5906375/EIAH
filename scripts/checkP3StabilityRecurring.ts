import fs from "node:fs";
import path from "node:path";

const CHECK = "check:p3-stability-recurring";
const EVIDENCE_DIR = path.resolve("ops/evidence/latest");
const MIN_CYCLES = Number(process.env.P3_STABILITY_MIN_CYCLES ?? 3);
const MAX_AGE_DAYS = Number(process.env.P3_STABILITY_MAX_AGE_DAYS ?? 14);

function fail(message: string, details?: Record<string, unknown>): never {
  console.error(JSON.stringify({ ok: false, check: CHECK, message, details }, null, 2));
  process.exit(1);
}

function parseNumber(content: string, key: string): number | null {
  const colon = new RegExp(`-\\s*${key}\\s*:\\s*([0-9]+)`, "i");
  const equals = new RegExp(`${key}\\s*=\\s*([0-9]+)`, "i");
  const colonMatch = content.match(colon);
  if (colonMatch) return Number(colonMatch[1]);
  const equalsMatch = content.match(equals);
  if (equalsMatch) return Number(equalsMatch[1]);
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

if (!fs.existsSync(EVIDENCE_DIR)) {
  fail("missing_evidence_directory", { dir: EVIDENCE_DIR });
}

const files = fs
  .readdirSync(EVIDENCE_DIR)
  .filter((name) => /^ape-weekly-cycle-run\d+-\d{4}-\d{2}-\d{2}\.md$/.test(name))
  .sort((a, b) => {
    const runA = Number(a.match(/^ape-weekly-cycle-run(\d+)-/)?.[1] ?? 0);
    const runB = Number(b.match(/^ape-weekly-cycle-run(\d+)-/)?.[1] ?? 0);
    return runB - runA;
  });

if (files.length < MIN_CYCLES) {
  fail("insufficient_weekly_cycle_evidence", {
    found: files.length,
    required: MIN_CYCLES,
  });
}

const selected = files.slice(0, MIN_CYCLES);
const now = Date.now();
const evaluated = selected.map((file) => {
  const full = path.join(EVIDENCE_DIR, file);
  const content = fs.readFileSync(full, "utf8");
  const evidenceDate = parseDate(content);
  if (!evidenceDate) fail("unable_to_parse_evidence_date", { file });
  const ageDays = (now - evidenceDate.getTime()) / (1000 * 60 * 60 * 24);
  return {
    file,
    ageDays: Number(ageDays.toFixed(2)),
    hardMetricsGo: parseBoolean(content, "hardMetricsGo"),
    auditGap: parseNumber(content, "auditGap"),
    duplicateSideEffects: parseNumber(content, "duplicateSideEffects"),
    breakGlass: parseNumber(content, "breakGlass"),
  };
});

const tooOld = evaluated.filter((item) => item.ageDays > MAX_AGE_DAYS);
if (tooOld.length > 0) {
  fail("weekly_cycle_evidence_too_old", { maxAgeDays: MAX_AGE_DAYS, tooOld });
}

const failing = evaluated.filter(
  (item) =>
    item.hardMetricsGo !== true ||
    item.auditGap !== 0 ||
    item.duplicateSideEffects !== 0 ||
    item.breakGlass !== 0
);
if (failing.length > 0) {
  fail("economy_stability_not_recurring", { failing });
}

console.log(
  JSON.stringify(
    {
      ok: true,
      check: CHECK,
      minCycles: MIN_CYCLES,
      maxAgeDays: MAX_AGE_DAYS,
      evaluated,
    },
    null,
    2
  )
);
