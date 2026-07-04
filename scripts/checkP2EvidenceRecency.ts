import fs from "node:fs";
import path from "node:path";

const CHECK = "check:p2-evidence-recency";
const EVIDENCE_FILE = path.resolve("ops/evidence/latest/p2-high-global-coverage.json");
const MAX_AGE_DAYS = Number(process.env.P2_EVIDENCE_MAX_AGE_DAYS ?? 30);

function fail(message: string, details?: Record<string, unknown>): never {
  console.error(JSON.stringify({ ok: false, check: CHECK, message, details }, null, 2));
  process.exit(1);
}

function parseGeneratedAt(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    fail("missing_generated_at", { file: path.relative(process.cwd(), EVIDENCE_FILE) });
  }

  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    fail("invalid_generated_at", {
      file: path.relative(process.cwd(), EVIDENCE_FILE),
      generatedAt: value,
    });
  }

  return new Date(parsed);
}

if (!fs.existsSync(EVIDENCE_FILE)) {
  fail("missing_p2_evidence_file", { file: path.relative(process.cwd(), EVIDENCE_FILE) });
}

const payload = JSON.parse(fs.readFileSync(EVIDENCE_FILE, "utf8")) as {
  generatedAt?: string;
  ok?: boolean;
  scope?: string;
};

const generatedAt = parseGeneratedAt(payload.generatedAt);
const ageDays = (Date.now() - generatedAt.getTime()) / (1000 * 60 * 60 * 24);
const ageRounded = Number(ageDays.toFixed(2));

if (ageDays > MAX_AGE_DAYS) {
  fail("p2_evidence_too_old", {
    file: path.relative(process.cwd(), EVIDENCE_FILE),
    generatedAt: generatedAt.toISOString(),
    ageDays: ageRounded,
    maxAgeDays: MAX_AGE_DAYS,
    scope: payload.scope ?? null,
  });
}

console.log(
  JSON.stringify(
    {
      ok: true,
      check: CHECK,
      file: path.relative(process.cwd(), EVIDENCE_FILE),
      generatedAt: generatedAt.toISOString(),
      ageDays: ageRounded,
      maxAgeDays: MAX_AGE_DAYS,
      scope: payload.scope ?? null,
    },
    null,
    2,
  ),
);
