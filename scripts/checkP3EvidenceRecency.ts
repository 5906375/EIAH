import fs from "node:fs";
import path from "node:path";

const CHECK = "check:p3-evidence-recency";
const EVIDENCE_DIR = path.resolve("ops/evidence/latest");
const MAX_AGE_DAYS = Number(process.env.P3_EVIDENCE_MAX_AGE_DAYS ?? 3);

const REQUIRED_P3_EVIDENCE_PATTERNS = [
  /^settlement-provider-e2e-\d{4}-\d{2}-\d{2}\.json$/,
  /^billing-webhook-replay-\d{4}-\d{2}-\d{2}\.json$/,
  /^dispute-lifecycle-e2e-\d{4}-\d{2}-\d{2}\.json$/,
  /^reputation-update-flow-\d{4}-\d{2}-\d{2}\.json$/,
  /^realestate-commission-settlement-e2e-\d{4}-\d{2}-\d{2}\.json$/,
  /^payment-intent-schema-\d{4}-\d{2}-\d{2}\.json$/,
  /^pou-gated-payment-e2e-\d{4}-\d{2}-\d{2}\.json$/,
];

function fail(message: string, details?: Record<string, unknown>): never {
  console.error(JSON.stringify({ ok: false, check: CHECK, message, details }, null, 2));
  process.exit(1);
}

function extractDateFromFilename(filename: string): Date | null {
  const match = filename.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const [, year, month, day] = match;
  const d = new Date(`${year}-${month}-${day}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

if (!fs.existsSync(EVIDENCE_DIR)) {
  fail("missing_evidence_directory", { dir: EVIDENCE_DIR });
}

const files = fs.readdirSync(EVIDENCE_DIR);
const now = Date.now();
const evaluated: Record<string, { file: string; date: Date; ageDays: number; ok: boolean }> = {};

for (const pattern of REQUIRED_P3_EVIDENCE_PATTERNS) {
  const found = files.find((file) => pattern.test(file));
  if (!found) {
    fail("missing_required_evidence_file", { pattern: pattern.source, dir: EVIDENCE_DIR });
  }

  const date = extractDateFromFilename(found);
  if (!date) {
    fail("unable_to_parse_date_from_filename", { file: found });
  }

  const ageDays = (now - date.getTime()) / (1000 * 60 * 60 * 24);
  const ok = ageDays <= MAX_AGE_DAYS;

  evaluated[pattern.source] = {
    file: found,
    date,
    ageDays: Number(ageDays.toFixed(2)),
    ok,
  };
}

const failing = Object.entries(evaluated).filter(([, entry]) => !entry.ok);
if (failing.length > 0) {
  fail("p3_evidence_too_old", {
    maxAgeDays: MAX_AGE_DAYS,
    failing: failing.map(([pattern, entry]) => ({
      pattern,
      file: entry.file,
      ageDays: entry.ageDays,
    })),
  });
}

console.log(
  JSON.stringify(
    {
      ok: true,
      check: CHECK,
      maxAgeDays: MAX_AGE_DAYS,
      evaluated: Object.fromEntries(
        Object.entries(evaluated).map(([pattern, entry]) => [
          pattern,
          { file: entry.file, ageDays: entry.ageDays },
        ])
      ),
    },
    null,
    2
  )
);
