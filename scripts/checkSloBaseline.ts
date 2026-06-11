#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

/**
 * SLO Baseline Check — warn-only
 *
 * Valida que pelo menos um arquivo economy-slo-baseline-*.json existe e
 * contém pouFinalize.p95Ms coletado. Gate é warn-only nesta fase —
 * não bloqueia release até targets serem ratificados (PR-P3-04).
 */

const CHECK = "check:slo-baseline";
const EVIDENCE_DIR = "ops/evidence/latest";

function findLatestBaseline(): string | null {
  if (!fs.existsSync(EVIDENCE_DIR)) return null;
  const files = fs
    .readdirSync(EVIDENCE_DIR)
    .filter((f) => f.startsWith("economy-slo-baseline-") && f.endsWith(".json"))
    .sort()
    .reverse();
  return files.length ? path.join(EVIDENCE_DIR, files[0]) : null;
}

const latest = findLatestBaseline();

if (!latest) {
  console.warn(
    JSON.stringify({
      ok: false,
      check: CHECK,
      message: "no SLO baseline files found — warn-only, run generate:slo-baseline first",
    })
  );
  process.exit(0); // warn-only
}

const data = JSON.parse(fs.readFileSync(latest, "utf8"));

if (!data.pouFinalize?.p95Ms) {
  console.warn(
    JSON.stringify({
      ok: false,
      check: CHECK,
      message: "pouFinalize p95Ms not yet collected — warn-only, baseline requires real E2E HIGH staging data",
      file: latest,
      samplesCount: data.samplesCount ?? 0,
    })
  );
  process.exit(0); // warn-only
}

const ageMs = Date.now() - new Date(data.generatedAt).getTime();
const ageDays = ageMs / (1000 * 60 * 60 * 24);
if (ageDays > 14) {
  console.warn(
    JSON.stringify({
      ok: false,
      check: CHECK,
      message: "SLO baseline is older than 14 days — warn-only, regenerate baseline",
      file: latest,
      ageDays: Number(ageDays.toFixed(1)),
    })
  );
  process.exit(0); // warn-only
}

console.log(
  JSON.stringify({
    ok: true,
    check: CHECK,
    pouFinalizeP95Ms: data.pouFinalize.p95Ms,
    pouFinalizeP99Ms: data.pouFinalize.p99Ms,
    samplesCount: data.samplesCount,
    ageDays: Number(ageDays.toFixed(1)),
    file: latest,
  }, null, 2)
);
