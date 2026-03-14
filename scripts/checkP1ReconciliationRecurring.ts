import fs from "node:fs";
import path from "node:path";

const CHECK = "check:p1-reconciliation-recurring";
const EVIDENCE_DIR = path.resolve("ops/evidence/latest");
const MIN_CYCLES = Number(process.env.P1_RECONCILE_MIN_CYCLES ?? 3);
const MAX_AGE_DAYS = Number(process.env.P1_RECONCILE_MAX_AGE_DAYS ?? 14);

function fail(message: string, details?: Record<string, unknown>): never {
  console.error(JSON.stringify({ ok: false, check: CHECK, message, details }, null, 2));
  process.exit(1);
}

function parseNumberFromLine(content: string, key: string): number | null {
  const colon = new RegExp(`-\\s*${key}\\s*:\\s*([0-9]+)`, "i");
  const equals = new RegExp(`${key}\\s*=\\s*([0-9]+)`, "i");
  const colonMatch = content.match(colon);
  if (colonMatch) return Number(colonMatch[1]);
  const equalsMatch = content.match(equals);
  if (equalsMatch) return Number(equalsMatch[1]);
  return null;
}

function parseDateFromHeader(content: string): Date | null {
  const mdDate = content.match(/Data:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/i);
  if (mdDate) {
    const d = new Date(`${mdDate[1]}T00:00:00Z`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const titleDate = content.match(/#\s*APE Weekly Cycle #\d+\s*[—-]\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/i);
  if (titleDate) {
    const d = new Date(`${titleDate[1]}T00:00:00Z`);
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
const evaluated = selected.map((fileName) => {
  const full = path.join(EVIDENCE_DIR, fileName);
  const content = fs.readFileSync(full, "utf8");
  const auditGap = parseNumberFromLine(content, "auditGap");
  const duplicateSideEffects = parseNumberFromLine(content, "duplicateSideEffects");
  const evidenceDate = parseDateFromHeader(content);
  if (!evidenceDate) {
    fail("unable_to_parse_evidence_date", { file: fileName });
  }
  const ageDays = (now - evidenceDate.getTime()) / (1000 * 60 * 60 * 24);
  return {
    file: fileName,
    auditGap,
    duplicateSideEffects,
    ageDays: Number(ageDays.toFixed(2)),
  };
});

const tooOld = evaluated.filter((entry) => entry.ageDays > MAX_AGE_DAYS);
if (tooOld.length > 0) {
  fail("weekly_cycle_evidence_too_old", { maxAgeDays: MAX_AGE_DAYS, tooOld });
}

const failing = evaluated.filter(
  (entry) => entry.auditGap !== 0 || entry.duplicateSideEffects !== 0
);
if (failing.length > 0) {
  fail("reconciliation_not_stable", { failing });
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
